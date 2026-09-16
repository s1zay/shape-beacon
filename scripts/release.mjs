import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SDK_METADATA } from '../src/version.js';
import { WRANGLER_VERSION, parseWranglerVersion } from './release-contract.mjs';

const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactRelativePath = 'dist/shape-engine-bundled.js';
const manifestRelativePath = 'dist/shape-engine-bundled.manifest.json';
const wranglerConfigRelativePath = 'wrangler.jsonc';
const deploymentCommand = 'npx --no-install wrangler deploy --config wrangler.jsonc';
const hostedUrls = Object.freeze({
    workersDev: 'https://shape-beacon.anthonyyerhot.workers.dev/shape-engine-bundled.js',
    canonical: 'https://engine.shapebeacon.com/shape-engine-bundled.js',
    compatibility: 'https://engine.sizzlestats.com/shape-engine-bundled.js'
});
const expectedArtifactPaths = [artifactRelativePath, manifestRelativePath].sort();
const sdkBuildInputs = ['src', 'scripts/build.mjs', 'package-lock.json'];

const sha256 = value => createHash('sha256').update(value).digest('hex');

export function createGit(repoRoot) {
    return (...args) => {
        try {
            return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
        } catch (error) {
            if (error.status === 0 && typeof error.stdout === 'string') {
                return error.stdout.trim();
            }
            throw error;
        }
    };
}

function runLocalVerification(repoRoot, command, args) {
    execFileSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
}

function runLocalCapture(repoRoot, command, args) {
    return execFileSync(command, args, { cwd: repoRoot, encoding: 'utf8' });
}

function assertSha(value, field) {
    assert.match(value, /^[0-9a-f]{64}$/, `${field} must be a lowercase SHA-256`);
}

function assertCommit(value, field) {
    assert.match(value, /^[0-9a-f]{40}$/, `${field} must be a full lowercase Git commit`);
}

export async function verifyRelease({
    repoRoot = defaultRepoRoot,
    git = createGit(repoRoot),
    runVerification = runLocalVerification,
    runCapture = runLocalCapture
} = {}) {
    assert.equal(git('status', '--porcelain=v1', '--untracked-files=all'), '',
        'release requires a completely clean worktree');

    const headCommit = git('rev-parse', 'HEAD');
    assertCommit(headCommit, 'repository HEAD');

    const manifestPath = join(repoRoot, manifestRelativePath);
    const artifactPath = join(repoRoot, artifactRelativePath);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const artifact = await readFile(artifactPath);

    assert.equal(manifest.artifact, artifactRelativePath, 'manifest artifact path is invalid');
    assertSha(manifest.sha256, 'manifest sha256');
    assert.equal(manifest.sha256, sha256(artifact), 'manifest SHA does not match dist artifact');
    assertCommit(manifest.sourceCommit, 'manifest sourceCommit');
    assert.equal(manifest.sourceState, 'clean', 'manifest sourceState must be clean');
    assert.deepEqual(manifest.versions, {
        engine: SDK_METADATA.engineVersion,
        tune: SDK_METADATA.tuneVersion,
        payloadSchema: SDK_METADATA.payloadSchema,
        lifecycleSemantics: SDK_METADATA.lifecycleSemanticsVersion
    }, 'manifest versions do not match canonical source metadata');
    assert.equal(manifest.toolchain?.bundler, 'rollup', 'manifest bundler must be rollup');
    assert.match(manifest.toolchain?.bundlerVersion ?? '', /^\d+\.\d+\.\d+$/,
        'manifest bundlerVersion is malformed');

    const packageMetadata = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
    assert.equal(packageMetadata.devDependencies?.rollup, manifest.toolchain.bundlerVersion,
        'manifest Rollup version does not match the pinned package version');
    assert.equal(packageMetadata.devDependencies?.wrangler, WRANGLER_VERSION,
        'package must pin the exact reviewed Wrangler version');
    const wranglerVersion = parseWranglerVersion(
        runCapture(repoRoot, 'npx', ['--no-install', 'wrangler', '--version'])
    );

    const wranglerConfig = JSON.parse(await readFile(join(repoRoot, wranglerConfigRelativePath), 'utf8'));
    assert.equal(wranglerConfig.assets?.directory, './dist',
        'Wrangler config must deploy only the generated dist directory');

    git('cat-file', '-e', `${manifest.sourceCommit}^{commit}`);
    const artifactCommit = git('log', '-1', '--format=%H', '--', ...expectedArtifactPaths);
    assertCommit(artifactCommit, 'artifact commit');
    for (const artifactFile of expectedArtifactPaths) {
        assert.equal(git('log', '-1', '--format=%H', '--', artifactFile), artifactCommit,
            `${artifactFile} was not committed in the artifact provenance commit`);
    }
    assert.equal(git('merge-base', manifest.sourceCommit, artifactCommit), manifest.sourceCommit,
        'manifest source commit is not an ancestor of the artifact commit');
    assert.equal(git('merge-base', artifactCommit, headCommit), artifactCommit,
        'artifact commit is not an ancestor of current HEAD');

    const artifactCommitPaths = git(
        'diff-tree', '--no-commit-id', '--name-only', '-r', artifactCommit
    ).split('\n').filter(Boolean).sort();
    assert.deepEqual(artifactCommitPaths, expectedArtifactPaths,
        'artifact commit must contain only the bundle and manifest');
    assert.equal(git(
        'diff', '--name-only', manifest.sourceCommit, artifactCommit, '--', ...sdkBuildInputs
    ), '', 'SDK build inputs changed between source and artifact commits');
    assert.equal(git('diff', '--name-only', artifactCommit, 'HEAD', '--', ...expectedArtifactPaths), '',
        'committed dist differs from the artifact provenance commit');

    runVerification(repoRoot, 'npm', ['test']);
    runVerification(repoRoot, 'npm', ['run', 'build:check']);

    return {
        headCommit,
        sourceCommit: manifest.sourceCommit,
        artifactCommit,
        artifactPath: artifactRelativePath,
        artifactSha256: manifest.sha256,
        engineVersion: manifest.versions.engine,
        tuneVersion: manifest.versions.tune,
        payloadSchema: manifest.versions.payloadSchema,
        lifecycleSemantics: manifest.versions.lifecycleSemantics,
        rollupVersion: manifest.toolchain.bundlerVersion,
        wranglerVersion,
        wranglerConfigPath: wranglerConfigRelativePath,
        deploymentCommand,
        hostedReadbackUrls: hostedUrls
    };
}

export function createDryRunOutput(plan) {
    return {
        mode: 'manual-operator-dry-run',
        deployed: false,
        statement: 'NO DEPLOYMENT OCCURRED. This plan did not invoke Wrangler or contact Cloudflare.',
        releasePlan: plan,
        futureReleaseEvidence: {
            sourceCommit: plan.sourceCommit,
            artifactCommit: plan.artifactCommit,
            artifactSha256: plan.artifactSha256,
            engineVersion: plan.engineVersion,
            tuneVersion: plan.tuneVersion,
            payloadSchema: plan.payloadSchema,
            lifecycleSemantics: plan.lifecycleSemantics,
            cloudflareDeploymentId: null,
            cloudflareVersionId: null,
            hostedOriginSha256: null,
            brandedHostSha256: {
                engineShapebeaconCom: null,
                engineSizzlestatsCom: null
            },
            deployed: false,
            releaseMode: 'manual-operator'
        },
        futureReadbackContract: {
            requiredHttpStatus: 200,
            requireEveryHostedShaToEqualArtifactSha: true,
            requireHostedVersionFieldsToMatchManifest: true,
            captureCloudflareDeploymentAndVersionIds: true,
            storeMachineReadableEvidence: true,
            urls: plan.hostedReadbackUrls
        }
    };
}

async function main() {
    const args = new Set(process.argv.slice(2));
    if (args.has('--deploy')) {
        throw new Error('Deployment is intentionally not implemented. --deploy is forbidden in this slice.');
    }
    const valid = args.size === 1 && (args.has('--check') || args.has('--dry-run'));
    assert.equal(valid, true, 'use exactly one of --check or --dry-run');

    const plan = await verifyRelease();
    if (args.has('--dry-run')) {
        process.stdout.write(`${JSON.stringify(createDryRunOutput(plan), null, 2)}\n`);
    } else {
        process.stdout.write(`${JSON.stringify({ releaseCheck: 'passed', deployed: false, ...plan }, null, 2)}\n`);
    }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
    main().catch(error => {
        console.error(`release verification failed: ${error.message}`);
        process.exitCode = 1;
    });
}
