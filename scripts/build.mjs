import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollup, VERSION as ROLLUP_VERSION } from 'rollup';
import { SDK_METADATA } from '../src/version.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = join(projectRoot, 'dist');
const artifactName = 'shape-engine-bundled.js';
const manifestName = 'shape-engine-bundled.manifest.json';
const checkMode = process.argv.includes('--check');

const git = (...args) => {
    try {
        return execFileSync('git', args, {
            cwd: projectRoot,
            encoding: 'utf8'
        }).trim();
    } catch (error) {
        // Some constrained build runners report a denied child process even
        // after a read-only Git command completed successfully. Accept only
        // that exact successful-output case; real Git failures still fail.
        if (error.status === 0 && typeof error.stdout === 'string') {
            return error.stdout.trim();
        }
        throw error;
    }
};

const provenanceInputs = [
    'src',
    'scripts',
    'tests',
    'package.json',
    'package-lock.json',
    'README.md',
    '.github'
];
const worktreeStatus = git(
    'status', '--porcelain=v1', '--untracked-files=all', '--', ...provenanceInputs
);
const headCommit = git('rev-parse', 'HEAD');

let sourceCommit = headCommit;
try {
    const existingManifest = JSON.parse(await readFile(join(distDirectory, manifestName), 'utf8'));
    const frozenCommit = existingManifest.sourceCommit;
    if (/^[0-9a-f]{40}$/.test(frozenCommit)) {
        const committedInputDrift = git(
            'diff', '--name-only', frozenCommit, headCommit, '--', ...provenanceInputs
        );
        if (!committedInputDrift) sourceCommit = frozenCommit;
    }
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const committedInputDrift = git(
    'diff', '--name-only', sourceCommit, headCommit, '--', ...provenanceInputs
);
const sourceState = worktreeStatus || committedInputDrift ? 'dirty' : 'clean';

const banner = `/**
 * GENERATED FILE — DO NOT EDIT DIRECTLY.
 * Regenerate with: npm run build
 * ShapeEngine SDK v${SDK_METADATA.engineVersion} (Bundled with Tune v${SDK_METADATA.tuneVersion})
 * Payload schema ${SDK_METADATA.payloadSchema}; lifecycle semantics ${SDK_METADATA.lifecycleSemanticsVersion}
 * Source commit ${sourceCommit} (${sourceState})
 */`;

async function generate(outputDirectory) {
    const bundle = await rollup({
        input: join(projectRoot, 'src/browser-entry.js'),
        onwarn(warning, warn) {
            if (warning.code === 'EMPTY_BUNDLE') throw new Error(warning.message);
            warn(warning);
        }
    });

    const artifactPath = join(outputDirectory, artifactName);
    await bundle.write({
        file: artifactPath,
        format: 'es',
        banner,
        generatedCode: 'es2015',
        indent: true
    });
    await bundle.close();

    const artifact = await readFile(artifactPath);
    const manifest = {
        artifact: `dist/${artifactName}`,
        sha256: createHash('sha256').update(artifact).digest('hex'),
        sourceCommit,
        sourceState,
        versions: {
            engine: SDK_METADATA.engineVersion,
            tune: SDK_METADATA.tuneVersion,
            payloadSchema: SDK_METADATA.payloadSchema,
            lifecycleSemantics: SDK_METADATA.lifecycleSemanticsVersion
        },
        toolchain: {
            bundler: 'rollup',
            bundlerVersion: ROLLUP_VERSION
        }
    };
    await writeFile(join(outputDirectory, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
}

if (checkMode) {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'shape-beacon-build-check-'));
    try {
        const manifest = await generate(temporaryDirectory);
        for (const filename of [artifactName, manifestName]) {
            const generated = await readFile(join(temporaryDirectory, filename));
            const committed = await readFile(join(distDirectory, filename));
            assert.deepEqual(generated, committed,
                `${filename} differs from the deterministic build; run npm run build`);
        }
        console.log(`build:check passed (${manifest.sha256})`);
    } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
} else {
    const manifest = await generate(distDirectory);
    console.log(`built dist/${artifactName} (${manifest.sha256})`);
}
