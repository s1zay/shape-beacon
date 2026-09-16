import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SDK_METADATA } from '../src/version.js';

const projectRoot = new URL('../', import.meta.url);
const artifact = await readFile(new URL('dist/shape-engine-bundled.js', projectRoot));
const artifactText = artifact.toString('utf8');
const manifest = JSON.parse(await readFile(
    new URL('dist/shape-engine-bundled.manifest.json', projectRoot),
    'utf8'
));

test('canonical SDK metadata retains the public contract', () => {
    assert.deepEqual(SDK_METADATA, {
        engineVersion: '4.1.8',
        tuneVersion: '2.17',
        payloadSchema: 'v3',
        lifecycleSemanticsVersion: 'v3'
    });
});

test('generated artifact derives its public versions from canonical metadata', () => {
    assert.match(artifactText, /ShapeEngine SDK v4\.1\.8 \(Bundled with Tune v2\.17\)/);
    assert.match(artifactText, /Payload schema v3; lifecycle semantics v3/);
    assert.match(artifactText, /this\.version = ENGINE_VERSION/);
    assert.match(artifactText, /payloadSchema: PAYLOAD_SCHEMA/);
    assert.match(artifactText, /lifecycle_semantics_version: LIFECYCLE_SEMANTICS_VERSION/);
});

test('artifact manifest identifies and hashes the generated bundle', () => {
    assert.equal(manifest.artifact, 'dist/shape-engine-bundled.js');
    assert.equal(manifest.sha256, createHash('sha256').update(artifact).digest('hex'));
    assert.deepEqual(manifest.versions, {
        engine: '4.1.8',
        tune: '2.17',
        payloadSchema: 'v3',
        lifecycleSemantics: 'v3'
    });
    assert.equal(manifest.toolchain.bundler, 'rollup');
    assert.match(manifest.toolchain.bundlerVersion, /^4\.63\.3$/);
    assert.match(manifest.sourceCommit, /^[0-9a-f]{40}$/);
    assert.ok(['clean', 'dirty'].includes(manifest.sourceState));
    assert.match(artifactText,
        new RegExp(`Source commit ${manifest.sourceCommit} \\(${manifest.sourceState}\\)`));
});
