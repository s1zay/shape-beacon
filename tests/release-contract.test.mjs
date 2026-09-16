import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
    SDK_HOSTS,
    WRANGLER_VERSION,
    classifyReadbackSet,
    correlateDeployment,
    parseDeploymentStatusJson,
    parseDeploymentsListJson,
    parseDeployNdjson,
    parseVersionsListJson,
    parseWhoamiJson,
    parseWranglerVersion,
    validateReleaseEvidence,
    validateLocalDryRunResult,
    verifyReadback
} from '../scripts/release-contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(root, 'tests/fixtures/wrangler');
const fixture = name => readFile(join(fixtures, name), 'utf8');
const sha256 = value => createHash('sha256').update(value).digest('hex');

test('only the exact pinned Wrangler version is accepted', () => {
    assert.equal(parseWranglerVersion(`wrangler ${WRANGLER_VERSION}`), WRANGLER_VERSION);
    assert.throws(() => parseWranglerVersion('4.131.0'), /exactly 4\.132\.0/);
    assert.throws(() => parseWranglerVersion('4.132.0 4.132.0'), /exactly one semver/);
});

test('valid deploy NDJSON parses and malformed, duplicate, conflicting, or failed records reject', async () => {
    const valid = await fixture('deploy-success.ndjson');
    const parsed = parseDeployNdjson(valid, { expectedWorker: 'shape-beacon' });
    assert.equal(parsed.versionId, '11111111-1111-4111-8111-111111111111');
    assert.throws(() => parseDeployNdjson('{bad', { expectedWorker: 'shape-beacon' }), /malformed/);
    assert.throws(() => parseDeployNdjson(`${valid}${valid.split('\n')[1]}\n`, {
        expectedWorker: 'shape-beacon'
    }), /exactly one deploy/);
    const conflict = valid.replaceAll('11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222');
    assert.throws(() => parseDeployNdjson(`${valid}${conflict.split('\n')[1]}\n`, {
        expectedWorker: 'shape-beacon'
    }), /exactly one deploy/);
    assert.throws(() => parseDeployNdjson(valid, { expectedWorker: 'other-worker' }), /worker name/);
    const failed = await fixture('deploy-command-failed.ndjson');
    assert.throws(() => parseDeployNdjson(failed, {
        expectedWorker: 'shape-beacon'
    }), /command-failed/);
});

test('deployment correlation accepts exactly one candidate and rejects zero or multiple', async () => {
    const before = parseDeploymentsListJson(await fixture('deployments-before.json'));
    const after = parseDeploymentsListJson(await fixture('deployments-after.json'));
    const status = parseDeploymentStatusJson(await fixture('deployment-status.json'));
    const input = {
        preDeployments: before,
        postDeployments: after,
        status,
        versionId: '11111111-1111-4111-8111-111111111111',
        attemptStartedAt: '2026-09-15T20:00:00.000Z',
        expectedWorker: 'shape-beacon',
        expectedAccount: 'synthetic-account',
        contextVerified: true
    };
    assert.equal(correlateDeployment(input).id, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    assert.throws(() => correlateDeployment({ ...input, postDeployments: before }), /found 0/);
    assert.throws(() => correlateDeployment({ ...input, postDeployments: [...after, {
        ...after[1], id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    }] }), /found 2/);
    assert.throws(() => correlateDeployment({ ...input, contextVerified: false }),
        /context must be independently verified/);
});

test('documented whoami and versions JSON contracts are parsed strictly', () => {
    const accountId = 'a'.repeat(32);
    const whoami = parseWhoamiJson(JSON.stringify({
        loggedIn: true, authType: 'API Token', accounts: [{ id: accountId, name: 'Expected' }],
        email: null, tokenPermissions: []
    }), { expectedAccountId: accountId, expectedAccountName: 'Expected' });
    assert.equal(whoami.account.id, accountId);
    assert.throws(() => parseWhoamiJson(JSON.stringify({ loggedIn: false, accounts: [] }), {
        expectedAccountId: accountId, expectedAccountName: 'Expected'
    }), /must be logged in/);
    const versions = parseVersionsListJson(JSON.stringify([{
        id: '11111111-1111-4111-8111-111111111111',
        metadata: { created_on: '2026-09-15T20:00:05.000Z' }
    }]));
    assert.equal(versions.length, 1);
    assert.throws(() => parseVersionsListJson('[{"id":"not-a-uuid"}]'), /must be a UUID/);
});

test('readback verifier classifies exact, stale, unknown, mismatched, and oversized bodies', async () => {
    const body = await readFile(join(root, 'dist/shape-engine-bundled.js'));
    const expected = {
        artifactSha256: sha256(body), engineVersion: '4.1.8', tuneVersion: '2.17',
        payloadSchema: 'v3', lifecycleSemantics: 'v3'
    };
    const verified = verifyReadback({ status: 200, body, expected });
    assert.equal(verified.classification, 'verified');
    const oldBody = Buffer.from('old artifact');
    assert.equal(verifyReadback({ status: 200, body: oldBody, expected,
        previousSha256: sha256(oldBody) }).classification, 'stale_candidate');
    assert.equal(verifyReadback({ status: 200, body: 'unknown', expected }).classification,
        'unexpected_content');
    const wrong = Buffer.from("engineVersion:'9.9.9',tuneVersion:'2.17',payloadSchema:'v3',lifecycleSemanticsVersion:'v3'");
    assert.equal(verifyReadback({ status: 200, body: wrong,
        expected: { ...expected, artifactSha256: sha256(wrong) } }).classification, 'contract_mismatch');
    assert.throws(() => verifyReadback({ status: 200, body: Buffer.alloc(1024 * 1024 + 1), expected }),
        /exceeds 1 MiB/);
    assert.equal(classifyReadbackSet([verified, verified, { classification: 'stale_candidate' }]),
        'partial_propagation');
});

function validEvidence() {
    const artifactSha256 = 'a'.repeat(64);
    return {
        schemaVersion: 1,
        releaseMode: 'manual-operator',
        deployed: true,
        mutationState: 'confirmed',
        overallResult: 'verified',
        sourceCommit: '1'.repeat(40),
        artifactCommit: '2'.repeat(40),
        repositoryHead: '2'.repeat(40),
        artifactPath: 'dist/shape-engine-bundled.js',
        artifactSha256,
        manifestSha256: 'b'.repeat(64),
        workerName: 'shape-beacon',
        rollupVersion: '4.63.3',
        wranglerVersion: WRANGLER_VERSION,
        engineVersion: '4.1.8', tuneVersion: '2.17', payloadSchema: 'v3', lifecycleSemantics: 'v3',
        deploymentStartedAt: '2026-09-15T20:00:00.000Z',
        deploymentCompletedAt: '2026-09-15T20:01:00.000Z',
        deployCommand: ['npx', '--no-install', 'wrangler', 'deploy', '--config', 'wrangler.jsonc'],
        deployExitCode: 0,
        cloudflareDeploymentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        cloudflareVersionId: '11111111-1111-4111-8111-111111111111',
        hostedVerification: Object.fromEntries(SDK_HOSTS.map(host => [host, {
            classification: 'verified', httpStatus: 200, bodySha256: artifactSha256
        }]))
    };
}

const evidenceExpected = {
    sourceCommit: '1'.repeat(40), artifactCommit: '2'.repeat(40), artifactSha256: 'a'.repeat(64),
    engineVersion: '4.1.8', tuneVersion: '2.17', payloadSchema: 'v3', lifecycleSemantics: 'v3'
};

test('evidence schema accepts valid evidence and rejects invalid cross-field combinations', () => {
    assert.equal(validateReleaseEvidence(validEvidence(), evidenceExpected).overallResult, 'verified');
    assert.throws(() => validateReleaseEvidence({ ...validEvidence(), deployed: false }, evidenceExpected));
    assert.throws(() => validateReleaseEvidence({ ...validEvidence(), mutationState: 'unknown', deployed: null },
        evidenceExpected));
    assert.throws(() => validateReleaseEvidence({ ...validEvidence(), cloudflareVersionId: 'not-uuid' },
        evidenceExpected));
    const failed = validEvidence();
    failed.overallResult = 'partial_failure';
    assert.throws(() => validateReleaseEvidence(failed, evidenceExpected), /cannot contain three passing/);
    assert.throws(() => validateReleaseEvidence({ ...validEvidence(), apiToken: 'forbidden' }, evidenceExpected),
        /secret-bearing/);
});

test('pinned Wrangler local deploy dry-run proof rejects mutation and missing preparation', () => {
    assert.deepEqual(validateLocalDryRunResult({
        stdout: '--dry-run: exiting now.', statusBefore: 'known-state', statusAfter: 'known-state',
        outputFiles: ['README.md', 'no-op-worker.js', 'no-op-worker.js.map']
    }), { prepared: true, mutated: false });
    assert.throws(() => validateLocalDryRunResult({
        stdout: '--dry-run: exiting now.', statusBefore: '', statusAfter: ' M dist/file',
        outputFiles: ['no-op-worker.js']
    }), /changed the tracked worktree/);
    assert.throws(() => validateLocalDryRunResult({
        stdout: '--dry-run: exiting now.', statusBefore: '', statusAfter: '', outputFiles: []
    }), /did not prepare/);
});

test('--deploy remains an unconditional fail-closed path', async () => {
    const releaseSource = await readFile(join(root, 'scripts/release.mjs'), 'utf8');
    const refusal = releaseSource.indexOf("if (args.has('--deploy'))");
    const verification = releaseSource.indexOf('const plan = await verifyRelease()');
    assert.notEqual(refusal, -1);
    assert.equal(refusal < verification, true, '--deploy refusal must precede release verification');
    assert.match(releaseSource, /Deployment is intentionally not implemented/);
    assert.doesNotMatch(releaseSource, /execFileSync\([^)]*wrangler[^)]*deploy/s,
        'release script must not spawn Wrangler deploy');
});
