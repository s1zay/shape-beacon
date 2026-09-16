import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createDryRunOutput, verifyRelease } from '../scripts/release.mjs';

const SOURCE_COMMIT = '1'.repeat(40);
const ARTIFACT_COMMIT = '2'.repeat(40);
const HEAD_COMMIT = '3'.repeat(40);
const artifactText = 'generated-sdk-artifact\n';
const artifactSha256 = createHash('sha256').update(artifactText).digest('hex');

async function fixture({ dirty = false, manifestSha = artifactSha256, sourceCommit = SOURCE_COMMIT } = {}) {
    const repoRoot = await mkdtemp(join(tmpdir(), 'shape-beacon-release-test-'));
    await mkdir(join(repoRoot, 'dist'));
    await writeFile(join(repoRoot, 'dist/shape-engine-bundled.js'), artifactText);
    await writeFile(join(repoRoot, 'dist/shape-engine-bundled.manifest.json'), JSON.stringify({
        artifact: 'dist/shape-engine-bundled.js',
        sha256: manifestSha,
        sourceCommit,
        sourceState: 'clean',
        versions: {
            engine: '4.1.8',
            tune: '2.17',
            payloadSchema: 'v3',
            lifecycleSemantics: 'v3'
        },
        toolchain: { bundler: 'rollup', bundlerVersion: '4.63.3' }
    }));
    await writeFile(join(repoRoot, 'package.json'), JSON.stringify({
        devDependencies: { rollup: '4.63.3', wrangler: '4.132.0' }
    }));
    await writeFile(join(repoRoot, 'wrangler.jsonc'), JSON.stringify({
        assets: { directory: './dist' }
    }));

    const commands = [];
    const git = (...args) => {
        const key = args.join(' ');
        if (key.startsWith('status ')) return dirty ? ' M src/version.js' : '';
        if (key === 'rev-parse HEAD') return HEAD_COMMIT;
        if (key.startsWith('cat-file ')) return '';
        if (key.startsWith('log -1 --format=%H --')) return ARTIFACT_COMMIT;
        if (key === `merge-base ${sourceCommit} ${ARTIFACT_COMMIT}`) return sourceCommit;
        if (key === `merge-base ${ARTIFACT_COMMIT} ${HEAD_COMMIT}`) return ARTIFACT_COMMIT;
        if (key.startsWith('diff-tree ')) {
            return 'dist/shape-engine-bundled.js\ndist/shape-engine-bundled.manifest.json';
        }
        if (key.startsWith('diff --name-only ')) return '';
        throw new Error(`unexpected git command: ${key}`);
    };
    const runVerification = (_root, command, args) => commands.push([command, ...args].join(' '));
    const runCapture = (_root, command, args) => {
        commands.push([command, ...args].join(' '));
        return '4.132.0\n';
    };
    return {
        repoRoot, git, commands, runVerification, runCapture,
        cleanup: () => rm(repoRoot, { recursive: true })
    };
}

test('clean valid repository passes and produces the exact release plan', async () => {
    const environment = await fixture();
    try {
        const plan = await verifyRelease(environment);
        assert.equal(plan.headCommit, HEAD_COMMIT);
        assert.equal(plan.sourceCommit, SOURCE_COMMIT);
        assert.equal(plan.artifactCommit, ARTIFACT_COMMIT);
        assert.equal(plan.artifactSha256, artifactSha256);
        assert.equal(plan.engineVersion, '4.1.8');
        assert.equal(plan.tuneVersion, '2.17');
        assert.equal(plan.payloadSchema, 'v3');
        assert.equal(plan.lifecycleSemantics, 'v3');
        assert.equal(plan.rollupVersion, '4.63.3');
        assert.equal(plan.wranglerVersion, '4.132.0');
        assert.equal(plan.deploymentCommand,
            'npx --no-install wrangler deploy --config wrangler.jsonc');
        assert.deepEqual(environment.commands, [
            `${process.execPath} ${environment.repoRoot}/node_modules/wrangler/bin/wrangler.js --version`,
            'npm test', 'npm run build:check'
        ]);
        assert.equal(environment.commands.some(command => command.includes('wrangler deploy')), false);
    } finally {
        await environment.cleanup();
    }
});

test('dry-run output is explicitly non-deployed and contains future evidence fields', async () => {
    const environment = await fixture();
    try {
        const output = createDryRunOutput(await verifyRelease(environment));
        assert.equal(output.deployed, false);
        assert.equal(output.futureReleaseEvidence.deployed, false);
        assert.equal(output.futureReleaseEvidence.cloudflareDeploymentId, null);
        assert.match(output.statement, /NO DEPLOYMENT OCCURRED/);
        assert.equal(output.futureReadbackContract.requiredHttpStatus, 200);
    } finally {
        await environment.cleanup();
    }
});

test('dirty repository is rejected before verification commands run', async () => {
    const environment = await fixture({ dirty: true });
    try {
        await assert.rejects(() => verifyRelease(environment), /completely clean worktree/);
        assert.deepEqual(environment.commands, []);
    } finally {
        await environment.cleanup();
    }
});

test('manifest and artifact hash mismatch is rejected', async () => {
    const environment = await fixture({ manifestSha: 'a'.repeat(64) });
    try {
        await assert.rejects(() => verifyRelease(environment), /SHA does not match/);
        assert.deepEqual(environment.commands, []);
    } finally {
        await environment.cleanup();
    }
});

test('invalid source-to-artifact provenance relationship is rejected', async () => {
    const invalidSource = '4'.repeat(40);
    const environment = await fixture({ sourceCommit: invalidSource });
    const originalGit = environment.git;
    environment.git = (...args) => {
        if (args.join(' ') === `merge-base ${invalidSource} ${ARTIFACT_COMMIT}`) return '5'.repeat(40);
        return originalGit(...args);
    };
    try {
        await assert.rejects(() => verifyRelease(environment), /not an ancestor/);
        assert.deepEqual(environment.commands, [
            `${process.execPath} ${environment.repoRoot}/node_modules/wrangler/bin/wrangler.js --version`
        ]);
    } finally {
        await environment.cleanup();
    }
});
