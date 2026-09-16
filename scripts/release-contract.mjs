import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const WRANGLER_VERSION = '4.132.0';
export const MAX_READBACK_BYTES = 1024 * 1024;
export const SDK_HOSTS = Object.freeze([
    'https://shape-beacon.anthonyyerhot.workers.dev/shape-engine-bundled.js',
    'https://engine.shapebeacon.com/shape-engine-bundled.js',
    'https://engine.sizzlestats.com/shape-engine-bundled.js'
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GIT_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const ACCOUNT_ID = /^[0-9a-f]{32}$/;

const parseTimestamp = (value, field) => {
    assert.equal(typeof value, 'string', `${field} must be a string`);
    assert.match(value, /Z$/, `${field} must be UTC RFC3339`);
    const parsed = Date.parse(value);
    assert.equal(Number.isFinite(parsed), true, `${field} must be valid RFC3339`);
    return parsed;
};

const assertUuid = (value, field) => assert.match(value ?? '', UUID, `${field} must be a UUID`);
const assertGitSha = (value, field) => assert.match(value ?? '', GIT_SHA, `${field} must be a full Git SHA`);
const assertSha256 = (value, field) => assert.match(value ?? '', SHA256, `${field} must be a SHA-256`);

export function parseWranglerVersion(output) {
    const matches = String(output).match(/\b\d+\.\d+\.\d+\b/g) ?? [];
    assert.equal(matches.length, 1, 'Wrangler version output must contain exactly one semver');
    assert.equal(matches[0], WRANGLER_VERSION,
        `Wrangler version must be exactly ${WRANGLER_VERSION}`);
    return matches[0];
}

export function validateLocalDryRunResult({ stdout, statusBefore, statusAfter, outputFiles }) {
    assert.match(stdout, /--dry-run: exiting now\./, 'Wrangler did not confirm local dry-run exit');
    assert.equal(statusAfter, statusBefore, 'Wrangler local dry-run changed the tracked worktree');
    assert.equal(Array.isArray(outputFiles), true, 'local dry-run outputFiles must be an array');
    assert.equal(outputFiles.includes('no-op-worker.js'), true, 'local dry-run did not prepare the worker');
    return { prepared: true, mutated: false };
}

export function parseDeployNdjson(text, { expectedWorker, expectedWranglerVersion = WRANGLER_VERSION } = {}) {
    assert.equal(typeof expectedWorker, 'string', 'expectedWorker is required');
    const lines = String(text).split(/\r?\n/).filter(line => line.trim() !== '');
    assert.ok(lines.length > 0, 'Wrangler NDJSON is empty');
    const records = lines.map((line, index) => {
        try {
            const value = JSON.parse(line);
            assert.equal(value && typeof value === 'object' && !Array.isArray(value), true);
            return value;
        } catch (error) {
            throw new Error(`Wrangler NDJSON line ${index + 1} is malformed: ${error.message}`);
        }
    });

    const allowedTypes = new Set(['wrangler-session', 'deploy', 'command-failed']);
    for (const record of records) {
        assert.equal(allowedTypes.has(record.type), true,
            `unsupported Wrangler output record type: ${record.type}`);
        assert.equal(record.version, 1, `${record.type} record version must be 1`);
    }
    const failures = records.filter(record => record.type === 'command-failed');
    assert.equal(failures.length, 0,
        `Wrangler reported command-failed: ${failures.map(record => record.message).join('; ')}`);

    const sessions = records.filter(record => record.type === 'wrangler-session');
    const deploys = records.filter(record => record.type === 'deploy');
    assert.equal(sessions.length, 1, 'exactly one wrangler-session record is required');
    assert.equal(deploys.length, 1, 'exactly one deploy record is required');

    const session = sessions[0];
    assert.equal(session.wrangler_version, expectedWranglerVersion, 'Wrangler session version mismatch');
    assert.equal(Array.isArray(session.command_line_args), true, 'command_line_args must be an array');
    assert.equal(session.command_line_args.includes('deploy'), true, 'session command must be deploy');
    parseTimestamp(session.timestamp, 'session timestamp');

    const deploy = deploys[0];
    assert.equal(deploy.worker_name, expectedWorker, 'deploy worker name mismatch');
    assertUuid(deploy.version_id, 'deploy version_id');
    assert.equal(Array.isArray(deploy.targets) && deploy.targets.length > 0, true,
        'deploy targets must be a non-empty array');
    assert.equal(deploy.targets.every(target => typeof target === 'string'), true,
        'deploy targets must contain strings');
    parseTimestamp(deploy.timestamp, 'deploy timestamp');
    return { session, deploy, versionId: deploy.version_id };
}

function validateDeployment(value, label) {
    assert.equal(value && typeof value === 'object' && !Array.isArray(value), true,
        `${label} must be an object`);
    assertUuid(value.id, `${label}.id`);
    parseTimestamp(value.created_on, `${label}.created_on`);
    assert.equal(Array.isArray(value.versions) && value.versions.length > 0, true,
        `${label}.versions must be non-empty`);
    for (const [index, version] of value.versions.entries()) {
        assertUuid(version.version_id, `${label}.versions[${index}].version_id`);
        assert.equal(typeof version.percentage, 'number', `${label} percentage must be numeric`);
        assert.equal(version.percentage > 0 && version.percentage <= 100, true,
            `${label} percentage is out of range`);
    }
    if (value.worker_name !== undefined) assert.equal(typeof value.worker_name, 'string');
    if (value.account_id !== undefined) assert.equal(typeof value.account_id, 'string');
    return value;
}

export function parseDeploymentsListJson(text) {
    const value = JSON.parse(text);
    assert.equal(Array.isArray(value), true, 'deployments list JSON must be an array');
    return value.map((deployment, index) => validateDeployment(deployment, `deployments[${index}]`));
}

export function parseWhoamiJson(text, { expectedAccountId, expectedAccountName } = {}) {
    const value = JSON.parse(text);
    assert.equal(value?.loggedIn, true, 'Wrangler identity must be logged in');
    assert.equal(typeof value.authType, 'string', 'Wrangler authType is required');
    assert.equal(Array.isArray(value.accounts), true, 'Wrangler accounts must be an array');
    const matches = value.accounts.filter(account => {
        assert.equal(account && typeof account === 'object', true, 'account must be an object');
        assert.match(account.id ?? '', ACCOUNT_ID, 'account.id must be a Cloudflare account ID');
        assert.equal(typeof account.name, 'string', 'account.name must be a string');
        return account.id === expectedAccountId && account.name === expectedAccountName;
    });
    assert.equal(matches.length, 1, 'exactly one expected Cloudflare account is required');
    return { authType: value.authType, account: matches[0] };
}

export function parseVersionsListJson(text) {
    const value = JSON.parse(text);
    assert.equal(Array.isArray(value), true, 'versions list JSON must be an array');
    return value.map((version, index) => {
        assert.equal(version && typeof version === 'object' && !Array.isArray(version), true,
            `versions[${index}] must be an object`);
        assertUuid(version.id, `versions[${index}].id`);
        parseTimestamp(version.metadata?.created_on, `versions[${index}].metadata.created_on`);
        return version;
    });
}

export function parseDeploymentStatusJson(text) {
    return validateDeployment(JSON.parse(text), 'deployment status');
}

export function correlateDeployment({
    preDeployments,
    postDeployments,
    status,
    versionId,
    attemptStartedAt,
    expectedWorker,
    expectedAccount,
    contextVerified = false,
    clockSkewMs = 5000
}) {
    assert.equal(contextVerified, true,
        'worker/account context must be independently verified before correlation');
    assertUuid(versionId, 'versionId');
    const startedMs = parseTimestamp(attemptStartedAt, 'attemptStartedAt');
    const beforeIds = new Set(preDeployments.map((value, index) =>
        validateDeployment(value, `preDeployments[${index}]`).id));
    const checkedStatus = validateDeployment(status, 'status');

    const candidates = postDeployments.map((value, index) =>
        validateDeployment(value, `postDeployments[${index}]`)).filter(deployment => {
        if (beforeIds.has(deployment.id)) return false;
        if (Date.parse(deployment.created_on) < startedMs - clockSkewMs) return false;
        if (deployment.versions.length !== 1) return false;
        if (deployment.versions[0].version_id !== versionId || deployment.versions[0].percentage !== 100) {
            return false;
        }
        if (deployment.worker_name !== undefined && deployment.worker_name !== expectedWorker) return false;
        if (deployment.account_id !== undefined && deployment.account_id !== expectedAccount) return false;
        return true;
    });
    assert.equal(candidates.length, 1,
        `expected exactly one correlated deployment, found ${candidates.length}`);
    const candidate = candidates[0];
    assert.equal(checkedStatus.id, candidate.id, 'active deployment status does not match candidate');
    assert.deepEqual(checkedStatus.versions, candidate.versions,
        'active deployment traffic does not match candidate');
    return candidate;
}

function oneMetadataValue(source, expression, field) {
    const values = [...source.matchAll(expression)].map(match => match[1]);
    assert.equal(values.length, 1, `bundle must contain exactly one ${field} declaration`);
    return values[0];
}

export function parseBundleMetadata(body) {
    const source = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
    return {
        engineVersion: oneMetadataValue(source, /engineVersion:\s*['"]([^'"]+)['"]/g, 'engineVersion'),
        tuneVersion: oneMetadataValue(source, /tuneVersion:\s*['"]([^'"]+)['"]/g, 'tuneVersion'),
        payloadSchema: oneMetadataValue(source, /payloadSchema:\s*['"]([^'"]+)['"]/g, 'payloadSchema'),
        lifecycleSemantics: oneMetadataValue(
            source, /lifecycleSemanticsVersion:\s*['"]([^'"]+)['"]/g, 'lifecycleSemanticsVersion'
        )
    };
}

export function verifyReadback({ status, body, expected, previousSha256 = null }) {
    if (status !== 200) return { classification: 'temporarily_unavailable', httpStatus: status };
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
    assert.equal(bytes.byteLength <= MAX_READBACK_BYTES, true, 'hosted response exceeds 1 MiB');
    const bodySha256 = createHash('sha256').update(bytes).digest('hex');
    if (previousSha256 && bodySha256 === previousSha256) {
        return { classification: 'stale_candidate', httpStatus: status, bodySha256 };
    }
    if (bodySha256 !== expected.artifactSha256) {
        return { classification: 'unexpected_content', httpStatus: status, bodySha256 };
    }
    let metadata;
    try {
        metadata = parseBundleMetadata(bytes);
    } catch (error) {
        return { classification: 'contract_mismatch', httpStatus: status, bodySha256, error: error.message };
    }
    const expectedMetadata = {
        engineVersion: expected.engineVersion,
        tuneVersion: expected.tuneVersion,
        payloadSchema: expected.payloadSchema,
        lifecycleSemantics: expected.lifecycleSemantics
    };
    if (JSON.stringify(metadata) !== JSON.stringify(expectedMetadata)) {
        return { classification: 'contract_mismatch', httpStatus: status, bodySha256, metadata };
    }
    return { classification: 'verified', httpStatus: status, bodySha256, metadata };
}

export function classifyReadbackSet(results) {
    assert.equal(Array.isArray(results) && results.length === 3, true,
        'exactly three hosted readback results are required');
    const classes = new Set(results.map(result => result.classification));
    if (classes.size === 1 && classes.has('verified')) return 'verified';
    if (classes.has('contract_mismatch')) return 'contract_mismatch';
    if (classes.has('unexpected_content')) return 'unexpected_content';
    if (classes.has('verified')) return 'partial_propagation';
    if (classes.size === 1 && classes.has('stale_candidate')) return 'stale_candidate';
    return 'temporarily_unavailable';
}

function rejectSecretFields(value, path = '$') {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        assert.equal(/token|secret|authorization|cookie|password|api.?key/i.test(key), false,
            `secret-bearing evidence field is forbidden: ${path}.${key}`);
        rejectSecretFields(child, `${path}.${key}`);
    }
}

export function validateReleaseEvidence(evidence, expected) {
    assert.equal(evidence && typeof evidence === 'object' && !Array.isArray(evidence), true);
    rejectSecretFields(evidence);
    assert.equal(evidence.schemaVersion, 1);
    assert.equal(evidence.releaseMode, 'manual-operator');
    assertGitSha(evidence.sourceCommit, 'sourceCommit');
    assertGitSha(evidence.artifactCommit, 'artifactCommit');
    assertGitSha(evidence.repositoryHead, 'repositoryHead');
    assert.equal(evidence.artifactPath, 'dist/shape-engine-bundled.js');
    assertSha256(evidence.artifactSha256, 'artifactSha256');
    assertSha256(evidence.manifestSha256, 'manifestSha256');
    assert.equal(evidence.workerName, 'shape-beacon');
    assert.equal(evidence.sourceCommit, expected.sourceCommit);
    assert.equal(evidence.artifactCommit, expected.artifactCommit);
    assert.equal(evidence.artifactSha256, expected.artifactSha256);
    assert.match(evidence.rollupVersion ?? '', SEMVER);
    assert.equal(evidence.wranglerVersion, WRANGLER_VERSION);
    assert.equal(evidence.engineVersion, expected.engineVersion);
    assert.equal(evidence.tuneVersion, expected.tuneVersion);
    assert.equal(evidence.payloadSchema, expected.payloadSchema);
    assert.equal(evidence.lifecycleSemantics, expected.lifecycleSemantics);
    const start = parseTimestamp(evidence.deploymentStartedAt, 'deploymentStartedAt');
    const completion = parseTimestamp(evidence.deploymentCompletedAt, 'deploymentCompletedAt');
    assert.equal(completion >= start, true, 'deployment completion precedes start');
    assert.equal(Array.isArray(evidence.deployCommand), true, 'deployCommand must be argv array');
    assert.deepEqual(evidence.deployCommand, [
        'npx', '--no-install', 'wrangler', 'deploy', '--config', 'wrangler.jsonc'
    ], 'deployCommand must be the reviewed argv');

    const allowedResults = new Set([
        'verified', 'preflight_failed', 'identity_failed', 'baseline_ambiguous',
        'deploy_failed', 'mutation_unknown', 'provenance_ambiguous',
        'partial_failure', 'verification_failed'
    ]);
    assert.equal(allowedResults.has(evidence.overallResult), true, 'invalid overallResult');
    if (evidence.mutationState === 'confirmed') {
        assert.equal(evidence.deployed, true);
        assert.equal(evidence.deployExitCode, 0);
        assertUuid(evidence.cloudflareDeploymentId, 'cloudflareDeploymentId');
        assertUuid(evidence.cloudflareVersionId, 'cloudflareVersionId');
    } else if (evidence.mutationState === 'unknown') {
        assert.equal(evidence.deployed, null);
        assert.equal(evidence.overallResult, 'mutation_unknown');
    } else if (evidence.mutationState === 'none') {
        assert.equal(evidence.deployed, false);
        assert.notEqual(evidence.overallResult, 'verified');
    } else {
        assert.fail('invalid mutationState');
    }

    const hostEntries = Object.keys(evidence.hostedVerification ?? {}).sort();
    assert.deepEqual(hostEntries, [...SDK_HOSTS].sort(), 'evidence must contain exactly the three SDK hosts');
    if (evidence.overallResult === 'verified') {
        assert.equal(evidence.deployed, true);
        assert.equal(evidence.mutationState, 'confirmed');
        for (const host of SDK_HOSTS) {
            const result = evidence.hostedVerification[host];
            assert.equal(result.classification, 'verified');
            assert.equal(result.httpStatus, 200);
            assert.equal(result.bodySha256, evidence.artifactSha256);
        }
    }
    if (evidence.overallResult !== 'verified') {
        assert.equal(evidence.hostedVerification && Object.values(evidence.hostedVerification)
            .every(result => result.classification === 'verified'), false,
        'failed/partial evidence cannot contain three passing hosted verifications');
    }
    return evidence;
}
