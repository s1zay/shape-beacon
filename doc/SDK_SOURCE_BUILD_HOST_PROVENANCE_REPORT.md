# SDK Source, Build, and Host Provenance Report

Date of investigation: 2026-09-15 (America/Chicago)
Public SDK repository: `/home/anthony/shape-beacon`
Read-only supporting inspection: `/home/anthony/on_shape`

## Executive finding

The current public SDK is a hand-maintained, committed monolithic artifact: `dist/shape-engine-bundled.js`. This checkout contains no separate maintainable SDK modules, no Tune source file, no package manifest, no bundler configuration, and no build script that can recreate that file. Git history shows that the monolith was originally uploaded as `shape-engine-bundled.js`, renamed into `dist/` with 100% similarity, and then edited directly through every subsequent SDK change. In the present repository, the file called a bundle is therefore both the only complete implementation and the distribution artifact.

The current local artifact is ShapeEngine 4.1.8, Tune 2.17, payload schema `v3`, and lifecycle semantics `v3`. The file has no embedded source commit, build ID, build timestamp, or content digest.

As observed during this investigation, the local file and all three known public SDK surfaces were byte-for-byte identical, with SHA-256:

`5ce3ac28ac00c942182241b6b8e586a185d319c080fc0dbba8ef30006db6a80d`

The checked surfaces were:

- `https://shape-beacon.anthonyyerhot.workers.dev/shape-engine-bundled.js`
- `https://engine.shapebeacon.com/shape-engine-bundled.js`
- `https://engine.sizzlestats.com/shape-engine-bundled.js`

This proves the current byte identity of the repository artifact and those hosted responses at the observation time. It does **not** prove that a build can reproduce those bytes, nor does it make future deployments traceable automatically.

## 1. Current repository structure

Tracked implementation and support files at `HEAD` (`1588d7d31ba435f558e579a35f4a1f623773d5c3`) are:

| Path | Role | Provenance relevance |
|---|---|---|
| `dist/shape-engine-bundled.js` | Complete browser SDK implementation and distributable | Only SDK implementation present |
| `tests/shape-engine.test.mjs` | Node/VM behavioral tests | Reads `dist/shape-engine-bundled.js` directly |
| `README.md` | Public SDK/product contract | Calls `dist` the distributable; documents no build |
| `METRICS.md` | Metrics and payload documentation | Describes payload contents and semantics |
| `wrangler.jsonc` | Cloudflare static-assets config | Points `assets.directory` to `./dist` |
| `.gitignore`, `LICENSE` | Repository support | No build provenance |

There is no tracked `package.json`, lockfile, `src/`, Makefile, shell build script, bundler configuration, CI workflow, release script, artifact manifest, source map, or generated-file notice. A repository-wide and all-history filename inspection found no such build/source files in earlier commits either.

The untracked `.wrangler/cache/wrangler-account.json` is local tool state, not source or release provenance, and was not treated as evidence of a build or deployment.

## 2. Actual maintainable source

### Current source of truth

`dist/shape-engine-bundled.js` is the only complete source for the current SDK in this checkout. Despite its name and location, evidence shows it is manually maintained:

- It contains the Tune object and all runtime classes/functions inline.
- Tests load and execute it directly; they do not import source modules or invoke a build.
- Git commits modify this file directly alongside tests and documentation.
- No generating inputs or generator are present.
- No comment identifies the file as generated or provides a regeneration command.

Therefore the honest current classification is: **complete monolithic implementation, maintainable only as one file, and simultaneously used as the distributable**. It is not a generated bundle in the reproducible-build sense.

### Logical modules embedded in the monolith

These implementation areas appear to be the logical inputs that a future modular source tree would contain, but they are not separate source modules today:

- `DEFAULT_TUNE`: Tune 2.17 metric weights and Shape ideals.
- Engagement and lifecycle constants/helpers: minimum duration/event thresholds, two-hour Domain Session lifetime, two-hour Page analytical maximum, and Undetermined logic.
- `EventCollector`: Pointer Events or legacy mouse/touch selection, event normalization, scroll/key handling, lifecycle of listeners, and buffer-limit notification.
- `ShapeEngine`: configuration, Page/Domain identity, session storage, lifecycle handlers, chunking/autosave, analysis, payload construction, transport, URL sanitization, and reset/rollover behavior.
- Analysis methods: timeline construction, foundations, metrics, Shapes, device/media classification, and clamping.
- Browser global initialization: `window.ShapeEngine = new ShapeEngine()`.

No external Tune file or earlier modular versions were found in repository history. The header phrase “Bundled with Tune file” describes the inline result, not a recoverable source file/build step in this repository.

## 3. Build tooling and procedure

### What exists

`wrangler.jsonc` contains only:

- Worker/project name `shape-beacon`;
- compatibility date `2026-07-27`;
- static asset directory `./dist`.

This config can upload/serve the contents of `dist`; it does not compile, concatenate, transpile, minify, stamp, or verify the SDK.

The only documented local command is the test command:

```sh
node tests/shape-engine.test.mjs
```

The test suite passed during this investigation. It tests the checked-in artifact and is not a build.

### What does not exist

There is no exact command that reproduces `dist/shape-engine-bundled.js` from maintainable inputs. Specifically, no npm script, bundler, compiler, Make target, shell script, Wrangler build hook, CI job, GitHub workflow, release script, or artifact upload workflow exists in this repository or its visible history.

`npx wrangler deploy --config wrangler.jsonc` would be a **deployment/upload command**, not a build command, and would mutate hosted state. It was not run.

**Reproducible build status: MISSING.** No build was attempted because there is no build to run, and the plausible Wrangler command would publish the existing artifact rather than reproduce it.

## 4. Version provenance

The following values are directly embedded in the current file and asserted by tests:

| Datum | Value | Location/evidence |
|---|---:|---|
| SDK header version | 4.1.8 | Header line 2 |
| Runtime engine version | 4.1.8 | `this.version` in `ShapeEngine` |
| Tune version | 2.17 | `DEFAULT_TUNE.version` |
| Payload schema | `v3` | Outgoing payload `payloadSchema` |
| Lifecycle semantics | `v3` | Outgoing `lifecycle_semantics_version` |
| Git commit at audit | `1588d7d31ba435f558e579a35f4a1f623773d5c3` | Tracked `HEAD` |
| Local artifact SHA-256 | `5ce3ac28ac00c942182241b6b8e586a185d319c080fc0dbba8ef30006db6a80d` | Hash of tracked file |

The header version and runtime version agree. Tune version agrees between its inline declaration, payload production, tests, current documentation/reports, and observed hosted responses. Both payload version fields agree with tests and current docs. There is no independent package version declaration to compare.

The public tests explicitly expect engine 4.1.8, Tune 2.17, payload schema `v3`, and lifecycle semantics `v3`. The current suite passed. This proves internal consistency, not generation from independent version sources.

The artifact does not embed its Git commit, content digest, Cloudflare version/deployment ID, or any other build metadata. Version strings are manually repeated in implementation/tests/header, so drift is possible.

## 5. Git-history findings

History explains the current artifact without revealing a missing build system:

1. Commit `c49a65a69b724eba9f6208eb2b3bd4f4a90628ab` (“Add files via upload”, 2026-07-24) added a root-level `shape-engine-bundled.js`.
2. Subsequent commits directly edited that root file.
3. Commit `0cc99efbc8efa8c9b912b2089e6c6229dbbca1a8` (“cdn”, 2026-07-27) renamed it to `dist/shape-engine-bundled.js` with Git similarity index 100% and introduced the static-assets Wrangler config. Pre- and post-rename SHA-256 values are identical: `291c0d8b...44ec`.
4. A demo copy `docs/shape-engine-bundled.js` was added at `82ff3ec` and later deleted with the demo at `533f9ea`; it was another committed copy, not a build input.
5. Every later SDK release commit directly changed `dist/shape-engine-bundled.js`, including 4.1.2, 4.1.3, 4.1.4, Page/Domain identity, privacy changes, 4.1.7 lifecycle-v3, and 4.1.8 Pointer Events.
6. Commit `bd40ce0cee7ea9ea12917e669b0aba06dd5f0585` changed the monolith to 4.1.7/lifecycle-v3.
7. Current commit `1588d7d31ba435f558e579a35f4a1f623773d5c3` directly changed it from 4.1.7 to 4.1.8 and added Pointer Event behavior.

No source directory or build definition was removed or reorganized in visible history. History instead supports continuous direct maintenance of the monolithic artifact. Old history is useful because it proves the origin/rename and direct-edit pattern; it does **not** recover absent modular source or a reproducible build.

The current bytes are a tracked blob at `HEAD`, so the local checkout identifies the commit containing them. Because the file itself has no commit stamp and identical bytes could exist at multiple commits, artifact-to-commit self-identification remains incomplete.

## 6. Release and hosted deployment findings

### Ownership in this repository

This repository has enough static configuration for a human to invoke Wrangler against `./dist`, but it has no scripted release workflow and no CI/CD. It therefore provides a manual deployment capability, not a repository-enforced release process.

No tracked reference to a `workers.dev` hostname or `engine.shapebeacon.com` exists in `shape-beacon` source/config. The custom-domain routing and deployment IDs are outside this repository's tracked configuration. `wrangler.jsonc` has no routes and no release metadata.

### Historical operator evidence in `on_shape`

Read-only reports in `/home/anthony/on_shape` provide operator-recorded deployment evidence:

- `LIFECYCLE_V3_SDK_CONTRACT_REPAIR_REPORT.md` records manual Wrangler publication of SDK 4.1.7 from commit `bd40ce0`, then matching 4.1.7 responses at the direct origin and both branded hosts.
- `POINTER_EVENT_COLLECTOR_MODERNIZATION_REPORT.md` records publication of 4.1.8 from commit `1588d7d`, production SDK deployment ID `07bb1ced-09d1-4ccc-bed7-b220edcff3f6`, version ID `f267f589-2dee-462c-9725-c8db33554d9c`, and timestamp `2026-09-04T02:45:04.864348Z`.
- That report says the direct origin, canonical host, and compatibility host returned 4.1.8/Tune 2.17/Pointer code/schema v3 after publication.

These are valuable historical records, but they are prose reports outside the SDK repository, not machine-generated attestations or a repeatable release pipeline.

### Current hosted byte proof

Fresh GETs during this audit returned HTTP 200 and the exact local SHA-256 from all three known hosts. Each response contained engine 4.1.8, Tune 2.17, Pointer Event registration, payload schema `v3`, and lifecycle semantics `v3`.

The direct `workers.dev` origin returned `Cache-Control: public, max-age=0, must-revalidate` and ETag `"278c7d622ab75cedb5ae6115ff461d85"`. The two Catcher custom hosts do not support HEAD (405), but GET content hashing succeeded. The common SHA-256 is stronger content evidence than version-string comparison alone.

Consequently, the current local and hosted artifacts match **at the audit time**. That statement should not be generalized into an ongoing guarantee: no automated deployment attestation or drift check binds future hosted bytes to repository commits.

## 7. Catcher proxy relationship

Read-only inspection of `/home/anthony/on_shape/workers/catcher/worker.js` found a hard-coded GET proxy target:

```text
https://shape-beacon.anthonyyerhot.workers.dev/shape-engine-bundled.js
```

For any GET handled by Catcher, it fetches that exact object and returns the upstream body/status/headers with added permissive CORS headers. It does not pin a digest or version and does not serve the sibling repository file directly.

Customer-facing generation paths establish two consumption routes:

- Managed/first-party snippets use `/_sb-metrics/shape-engine-bundled.js`; Catcher GET handling proxies this to the hard-coded Workers.dev target.
- Manual/direct snippets use `https://engine.shapebeacon.com/shape-engine-bundled.js`; that host is served by Catcher, whose GET handling uses the same proxy target.

`public/integration-diagnostic.mjs` likewise resolves `shape-engine-bundled.js` relative to a configured endpoint and checks that the response resembles the SDK.

The current GET hashes prove the direct origin, canonical Catcher surface, and compatibility Catcher surface returned identical bytes. The repository source and operator reports support the routing explanation. A universal claim about every customer-controlled first-party Worker deployment cannot be proven from these repositories alone; an individual managed deployment may have its own deployed revision or drift.

## 8. Provenance matrix

Status meanings used here:

- **PROVEN**: direct source/history/content evidence establishes the current link.
- **PARTIALLY PROVEN**: useful evidence exists, but the link is not self-describing, automated, universal, or durable.
- **MISSING**: required source/process/evidence is absent.
- **CONTRADICTORY**: evidence conflicts or a claimed architecture differs from actual practice.

| Link | Status | Basis |
|---|---|---|
| A. Maintainable source -> local bundle | **CONTRADICTORY** | The intended architecture requires maintainable source producing `dist`; actual history shows `dist` is the directly edited implementation. No separate source or build exists. |
| B. Local bundle -> engine/tune/schema version | **PROVEN** | Header/runtime/Tune/payload fields and tests consistently identify 4.1.8 / 2.17 / v3 (plus lifecycle v3). |
| C. Local bundle -> git commit | **PARTIALLY PROVEN** | The exact bytes are tracked at current commit `1588d7d`, and history shows their changes. The artifact has no embedded commit/digest/build manifest, so it does not identify its commit independently. |
| D. Git commit -> hosted artifact | **PARTIALLY PROVEN** | Operator report maps `1588d7d` to deployment/version IDs, and fresh hosted bytes exactly match that commit's artifact. The mapping is manual prose plus observation, not an attested/scripted release record; future continuity is not guaranteed. |
| E. Hosted artifact -> Catcher proxy target | **PROVEN** | Catcher source hard-codes the Workers.dev URL; fresh GETs from the origin and both Catcher hosts had identical SHA-256. |
| F. Catcher proxy target -> customer-consumed artifact | **PARTIALLY PROVEN** | Generated direct and first-party snippets route customers through Catcher, and current public surfaces match the target. No exhaustive proof covers all already-deployed customer-managed Workers or their drift. |
| G. Release process -> reproducible build | **MISSING** | Manual Wrangler deployment uploads committed `dist`; no source build, build command, CI job, release script, or reproducibility check exists. |

No version-content contradiction was found in the current bundle or live hosts. The principal contradiction is architectural: `dist` is described/positioned as a distributable bundle, but is actually the only implementation and is manually maintained.

## 9. Material gaps

- No canonical modular SDK source exists apart from the monolith.
- No independent Tune source exists.
- No reproducible build command exists.
- No package/toolchain versions are pinned.
- No generated-file marker or regeneration instruction exists.
- No single version declaration feeds header, runtime, tests, and payload metadata.
- No source commit or artifact digest is embedded or emitted in release metadata.
- No build manifest maps source commit, engine version, Tune version, schemas, and output hash.
- No automated clean-tree rebuild compares generated `dist` to the committed artifact.
- No tracked deploy script verifies source commit/clean state, rebuilds, hashes, uploads, and reads the deployment back.
- Custom host routes and deployment identifiers are not represented in the public repository.
- Catcher follows an unversioned upstream URL and does not pin an expected digest.
- Existing release proof lives in manually written cross-repository reports.
- Customer-managed first-party deployments cannot be exhaustively proven current from the inspected repositories.

## 10. Smallest recommended implementation slice

The next slice should establish source-to-local-artifact provenance only, without deploying or changing production routing.

### Canonical source

Extract the existing monolith without behavioral changes into a small, explicit `src/` tree. Keep the boundaries close to the logical units already present, for example:

- `src/tune.js`
- `src/event-collector.js`
- `src/shape-engine.js`
- `src/browser-entry.js`
- `src/version.js` (or a small JSON metadata file)

The extraction should preserve current public behavior byte semantics as far as practical and be guarded by the existing tests plus an artifact comparison/review. Do not redesign algorithms, payloads, lifecycle behavior, global API, or Tune values in the same slice.

### Build command

Add one pinned, local-only command, conventionally:

```sh
npm run build
```

It should deterministically bundle `src/browser-entry.js` to `dist/shape-engine-bundled.js` using a pinned bundler version and stable formatting/settings. Add a clean verification command such as `npm run build:check` that builds to a temporary location and byte-compares with committed `dist`, leaving tracked files untouched.

### Whether `dist` remains committed

Keep `dist/shape-engine-bundled.js` committed for now. It is the public reviewable/downloadable artifact and the Wrangler asset input. Mark it generated and require `build:check` in local validation/CI. Removing it is unnecessary to establish provenance and would broaden the change.

### Version stamping

Maintain engine version, Tune version, payload schema, and lifecycle semantics in one canonical metadata module/file. Generate the banner and runtime/payload fields from it. During the build, stamp the full source commit and preferably a deterministic build descriptor into a non-behavioral banner and/or exposed build metadata. Do not use wall-clock timestamps in the bundle if byte reproducibility is desired; record release time separately.

Generate a small release manifest containing at least:

- full source commit;
- dirty/clean status (releases must be clean);
- engine/Tune/payload/lifecycle versions;
- toolchain versions;
- output SHA-256.

### Hosted tie and deployment approach

After the local build slice is merged and proven, add a narrow scripted manual release command before considering fully automatic deployment. It should refuse a dirty tree, run tests and `build:check`, compute/record the manifest, invoke Wrangler explicitly, capture returned Cloudflare deployment/version IDs, and verify the origin/custom-host response SHA-256 against the local output.

Keeping deployment manually triggered initially is the smallest safe step: the script makes the process repeatable and evidenced without granting CI production authority. Automated CI publishing can be considered later after credentials, approvals, rollback, and route ownership are designed.

### What can be fixed locally now

- Introduce source modules by behavior-preserving extraction.
- Pin the build toolchain and add `build`/`build:check`.
- Centralize/stamp versions and source commit.
- Keep and deterministically regenerate `dist`.
- Add tests/CI that fail when `dist` differs from a clean build.
- Produce a local artifact manifest and document the release contract.

### What requires later hosted/deployment proof

- Running any Wrangler deploy.
- Recording real Cloudflare deployment/version IDs from the new release path.
- Verifying origin and custom-host hashes after deployment.
- Proving the deployed Catcher revision uses the reviewed proxy target.
- Auditing representative or all managed customer deployments for revision/drift.
- Deciding whether Catcher should pin a version/digest or whether a stable mutable origin plus monitoring is the desired contract.

## 11. Explicit things not to change yet

- Do not alter the current hosted SDK or deploy this investigation output.
- Do not change `engine.shapebeacon.com`, the Workers.dev target, Catcher routes, or CORS behavior.
- Do not change SDK algorithms, Tune 2.17 weights/ideals, payload schema v3, lifecycle-v3 semantics, session identity, or transport behavior during source extraction.
- Do not combine the provenance slice with a repository-wide restructure, ESM public API redesign, minification change, or version bump.
- Do not remove committed `dist` until an alternative publication and review model is deliberately approved.
- Do not treat historical prose reports alone as the future release ledger; introduce machine-generated manifests first.
- Do not assume every customer-managed first-party deployment is current without separate readback evidence.
- Do not enable automatic production deployment merely by adding CI; begin with a reviewed, manually triggered scripted release.

## 12. Validation performed

All repository/history inspection was read-only. The only repository addition made by this investigation is this report.

- Enumerated tracked/current files and all filenames present in Git history.
- Inspected file history, rename/copy similarity, diffs, versions, and commit metadata.
- Searched both repositories for build, publish, deploy, host, artifact, and version references.
- Read Catcher's proxy source and customer snippet generation paths.
- Ran the local Node test suite successfully; it did not modify tracked files.
- Hash-compared the local file and three live HTTP GET responses; all matched.
- Did not run Wrangler, a build, a deploy, an artifact upload, or any code-modifying command.

## Final assessment

The present release is operationally identifiable but not reproducibly built. Current local, origin-hosted, and Catcher-hosted public bytes match, and history/report evidence links them to SDK commit `1588d7d`. The weakest link is not current byte identity; it is the absent source/build boundary and the manual, externally recorded release procedure. The smallest corrective step is a behavior-preserving source extraction plus deterministic local build/check and manifest, with production deployment explicitly deferred.
