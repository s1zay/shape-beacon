# SDK Reproducible Build Implementation Report

Date: 2026-09-15 (America/Chicago)
Repository: `/home/anthony/shape-beacon`
Starting HEAD: `1588d7d31ba435f558e579a35f4a1f623773d5c3`
Deployment authorization: none

## Outcome

The SDK now has canonical maintainable source modules, a pinned deterministic Rollup build, a non-mutating byte verification command, centralized version metadata, a generated committed distribution artifact, and a machine-readable artifact manifest. The existing SDK behavior and public contract remain unchanged according to all 26 existing behavioral tests.

Nothing was deployed. Wrangler was not invoked. No hosted resource, Catcher code, or `/home/anthony/on_shape` file was changed.

## Old structure

Before this slice, `dist/shape-engine-bundled.js` was both the only complete implementation and the hosted distribution input. It was edited directly. There was no `src/`, package manifest, lockfile, build script, bundler, generated-file marker, artifact manifest, or reproducibility check.

The authoritative pre-extraction artifact SHA-256 was:

`5ce3ac28ac00c942182241b6b8e586a185d319c080fc0dbba8ef30006db6a80d`

That monolith was treated as the behavioral authority for the extraction.

## New structure and module boundaries

The canonical implementation is now under `src/`:

| File | Responsibility |
|---|---|
| `src/version.js` | One canonical object for engine, Tune, payload-schema, and lifecycle-semantics versions |
| `src/tune.js` | Exact Tune 2.17 weights and Shape ideals extracted from the monolith |
| `src/event-collector.js` | Exact listener selection, Pointer/legacy normalization, buffering, and raw event collection behavior |
| `src/shape-engine.js` | Exact session identity/lifecycle, analysis, Shapes, payload, URL, chunking/autosave, and transport behavior |
| `src/browser-entry.js` | Exact classic browser entry behavior: installs one `window.ShapeEngine` instance without auto-starting it |

The split deliberately stops at five modules. Algorithms and methods were moved, not redesigned. Constants closely coupled to ShapeEngine's lifecycle/engagement behavior remain in `shape-engine.js` rather than creating additional abstraction layers.

## Build tool and pinned version

The build uses Rollup `4.63.3`, pinned exactly in `package.json` and `package-lock.json`. Rollup emits unminified ES syntax and flattens the internal modules into a classic-script-compatible file without an IIFE wrapper. This preserves the existing top-level `ShapeEngine` binding relied on by the behavioral tests while retaining the browser's `window.ShapeEngine` instance API.

The SDK has no browser runtime dependencies. Rollup is development-only. `npm audit` reported zero known vulnerabilities for the final pinned dependency graph.

Commands:

```sh
npm ci
npm run build
npm run build:check
npm test
```

## Build behavior

`npm run build`:

1. reads canonical metadata from `src/version.js`;
2. reads the current Git `HEAD` and worktree clean/dirty state;
3. bundles `src/browser-entry.js` deterministically without minification;
4. generates `dist/shape-engine-bundled.js`;
5. computes its SHA-256;
6. generates `dist/shape-engine-bundled.manifest.json`.

The generated banner clearly states that the file must not be edited directly and gives `npm run build` as the regeneration command.

No wall-clock time, random value, machine path, or host identity is written into either generated artifact.

## `build:check` behavior

`npm run build:check` creates a temporary directory under the operating-system temporary directory, generates both artifacts there, and byte-compares them with the committed `dist` files. It fails on either bundle or manifest drift. The temporary directory is removed in a `finally` block.

Validation recorded worktree status and a binary-diff digest before and after `build:check`; both were identical. The command therefore left tracked and untracked repository state untouched.

## Version metadata design

`src/version.js` contains the single production declaration:

- engine: `4.1.8`;
- Tune: `2.17`;
- payload schema: `v3`;
- lifecycle semantics: `v3`.

The build banner, runtime engine version, default Tune version, payload field, lifecycle field, and manifest all derive from that object. Literal repetitions remain only in tests and documentation, where they act as assertions/descriptions rather than independent production declarations. The private npm package version is intentionally `0.0.0-private`, so it cannot become an accidental second SDK-version authority.

## Commit provenance design

The bundle banner and manifest record:

- full Git `HEAD` commit;
- `clean` or `dirty` worktree state.

The current implementation output truthfully records starting HEAD `1588d7d31ba435f558e579a35f4a1f623773d5c3` with state `dirty`, because this implementation is not yet committed. Repeated builds in this same state are byte-identical.

This design avoids claiming that uncommitted extraction work belongs to the starting commit. For a release-quality `clean` artifact, freeze/commit the canonical source and build files first, build from that clean source commit, and commit the generated artifact/manifest separately if committed artifacts are required. The artifact commit will then point explicitly to the clean source commit from which it was generated. This two-step boundary avoids the impossible circular requirement that a commit embed its own hash in bytes that contribute to that hash.

## Artifact manifest

`dist/shape-engine-bundled.manifest.json` is deterministic JSON with:

- artifact path;
- artifact SHA-256;
- full source commit;
- clean/dirty source state;
- engine version;
- Tune version;
- payload schema;
- lifecycle semantics;
- bundler name and exact version.

The provenance test recalculates the artifact hash and compares all manifest/version/banner fields.

## Generated artifact byte result

Old hand-maintained artifact:

`5ce3ac28ac00c942182241b6b8e586a185d319c080fc0dbba8ef30006db6a80d`

New generated artifact:

`6d86d02a1435dd759fa99273a94dfc8b4ee2db6bd47520cc1345207a6919f2cc`

The bytes changed. This is expected and intentional for three non-behavioral reasons:

- the generated provenance/regeneration banner replaced the hand-written banner;
- Rollup flattened the extracted module declarations in dependency order;
- Rollup normalized some module-boundary whitespace.

The build is unminified. Runtime semantics and public API were not intentionally changed.

Two consecutive `npm run build` executions produced the same bundle and manifest hashes:

- bundle: `6d86d02a1435dd759fa99273a94dfc8b4ee2db6bd47520cc1345207a6919f2cc`;
- manifest: `6cc25c7b8d5f9404628fb3306537ba1544ffe960ce3b68d3b6f4083f7b8c0ee8`.

## Tests and validation

Results:

- Existing SDK behavioral suite: **26/26 passed**.
- Build/provenance test file: **passed**.
- Full `npm test`: **passed** (both test files).
- `npm run build`: **passed**.
- Repeat-build hash comparison: **passed**.
- `npm run build:check`: **passed**.
- Manifest SHA-256 comparison: **passed**.
- Build/check non-mutation comparison: **passed**.
- Final `npm audit`: **0 vulnerabilities**.
- `git diff --check`: required in final validation after this report.

Coverage explicitly retains Pointer and fallback collection, session identity and expiry, Undetermined thresholds, chunking/autosave, lifecycle-v3 payloads, privacy constraints, URL sanitization, max-age rollover, metric/Shape calculations, transport fallback, and the global instance contract.

## Files changed or added

- Modified: `README.md`.
- Added: `package.json`, `package-lock.json`.
- Added: `scripts/build.mjs`.
- Added: five files under `src/` listed above.
- Regenerated: `dist/shape-engine-bundled.js`.
- Added/generated: `dist/shape-engine-bundled.manifest.json`.
- Added: `tests/build-provenance.test.mjs`.
- Added: this implementation report.
- Preserved: all existing SDK tests and public documentation outside the focused development update.

The earlier investigation report under `doc/` remains intact.

## Deployment impact

There is no deployment impact from this worktree alone. The hosted SDK remains whatever was already deployed before this slice. Its previously observed SHA-256 matched the old artifact, not the newly generated artifact. The new local artifact must not be described as hosted until a separately authorized future deployment and readback prove that link.

Explicitly:

- Wrangler was not run.
- No deployment command was run.
- No upload or publication occurred.
- No Cloudflare resource/configuration was changed.
- No hosted URL was modified.
- Catcher was not changed.
- `/home/anthony/on_shape` was not modified.

## Architecture reconciliation notes for `on_shape`

`/home/anthony/on_shape/ARCHITECTURE.md` was intentionally not modified. A later architecture-document reconciliation should record these facts after this slice is committed:

1. `shape-beacon/src/` is now the canonical SDK implementation.
2. `dist/shape-engine-bundled.js` is generated, committed output rather than primary source.
3. `npm run build` and `npm run build:check` establish deterministic local source-to-artifact provenance.
4. `src/version.js` is the production version authority.
5. The JSON manifest binds versions, toolchain, source commit/state, and output digest.
6. Build and deployment remain intentionally separate.
7. The new local artifact is not yet proven hosted.

## Remaining provenance gaps and deferred work

This slice does not establish production release provenance. Remaining work is:

- commit/freeze the canonical source and create a clean-state generated artifact;
- design a separately authorized scripted production release;
- capture Cloudflare deployment/version IDs in machine-readable release evidence;
- verify hosted origin and custom-host SHA-256 after any future deployment;
- decide whether Catcher should pin an artifact/version/digest;
- add non-deploying CI build/test/build-check validation if desired;
- audit managed-customer deployment revisions separately.

Explicitly deferred and not implemented: Wrangler deployment, hosted artifact replacement, Catcher changes, digest pinning, production credentials, automatic publishing, and managed-customer deployment audit.

## Recommended next slice

The smallest next slice is a **non-deploying commit/freeze and CI validation slice**: commit the canonical source/toolchain, regenerate a clean-state artifact tied to that frozen source commit, commit the generated artifact/manifest as a distinct provenance step, and add ordinary CI checks for `npm ci`, `npm test`, and `npm run build:check`. Production release scripting should remain a later, separately reviewed and authorized slice.
