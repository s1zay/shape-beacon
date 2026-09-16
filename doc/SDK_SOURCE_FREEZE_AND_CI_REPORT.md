# SDK Source Freeze and CI Report

Date: 2026-09-15 (America/Chicago)

## Outcome

The canonical SDK source/build boundary is frozen in Git, a clean-source generated artifact is committed separately, and non-deploying CI now verifies tests and artifact reproducibility. The two provenance commits are deliberately distinct:

1. final source commit `bfe944d8bb96c083033673ba0763bec4bdc630b6`;
2. final artifact commit `85472171aeab6f7567ffdfc03ad764a6f012bbc7`.

The artifact banner and manifest identify the Step 1 source commit, not the Step 2 artifact commit. This establishes the intended `SOURCE COMMIT -> GENERATED ARTIFACT COMMIT` relationship without circular commit metadata.

Nothing was deployed or published. No hosted resource, Catcher code, or `/home/anthony/on_shape` file was modified.

## Starting state

- Starting HEAD: `1588d7d31ba435f558e579a35f4a1f623773d5c3`.
- Old hand-maintained/hosted-matching artifact SHA-256: `5ce3ac28ac00c942182241b6b8e586a185d319c080fc0dbba8ef30006db6a80d`.
- The extracted source/build work initially existed only as uncommitted changes, so its first generated artifact correctly recorded the old HEAD with state `dirty`.

## Step 1: canonical source freeze

Foundational source commit:

`4ab03c0d2bfda3abc8f00a223f6b66cdce0d373b` — `Establish canonical SDK source and reproducible build`

This commit froze:

- `src/version.js`;
- `src/tune.js`;
- `src/event-collector.js`;
- `src/shape-engine.js`;
- `src/browser-entry.js`;
- `scripts/build.mjs`;
- `package.json` and `package-lock.json`;
- `tests/build-provenance.test.mjs` and the preserved behavioral suite;
- README build/provenance policy;
- the investigation and reproducible-build implementation reports;
- `.github/workflows/sdk-ci.yml`.

No generated `dist` change was included in Step 1. Immediately after the commit, the prior tracked artifact was restored and the uncommitted preliminary manifest was removed. `git status --short` was empty before clean-source generation. This is the clean state recorded by the generated artifact.

Final source commit:

`bfe944d8bb96c083033673ba0763bec4bdc630b6` — `Preserve frozen source identity during artifact checks`

Final validation of the first generated artifact exposed that `build:check` initially selected the artifact commit's `HEAD` instead of retaining the frozen source commit recorded in the manifest. The final source commit corrected only this provenance mechanic: when provenance inputs have not changed, subsequent builds/checks retain the manifest's frozen source identity. No SDK runtime source or behavior changed. The clean artifact was regenerated from this final source commit.

## Step 2: generated artifact provenance commit

Commit:

`85472171aeab6f7567ffdfc03ad764a6f012bbc7` — `Regenerate SDK artifact from final frozen source`

This commit contains only:

- `dist/shape-engine-bundled.js`;
- `dist/shape-engine-bundled.manifest.json`.

Generated artifact SHA-256:

`a2c95e4700a5b152fcacb1594e4aca4189a32e472cf3ac7001f37576435218df`

Manifest SHA-256:

`4142ff9d8942adb4cc1d97551ccadb0b26db84793d9eed84200e8803b69a48f4`

Manifest provenance fields:

- `sourceCommit`: `bfe944d8bb96c083033673ba0763bec4bdc630b6`;
- `sourceState`: `clean`;
- engine: `4.1.8`;
- Tune: `2.17`;
- payload schema: `v3`;
- lifecycle semantics: `v3`;
- bundler: Rollup `4.63.3`.

The bundle banner records the same source commit and clean state. The manifest SHA-256 field exactly matches a fresh SHA-256 calculation over the generated bundle.

## Source-state contract

The build determines clean/dirty state over provenance-bearing inputs: `src`, `scripts`, `tests`, package manifests, README, and `.github`. Generated `dist` outputs and operational reports are not source inputs. This lets `build:check` reproduce a clean-source artifact after the artifact commit without falsely treating the expected committed output difference as source dirtiness.

The full worktree was clean immediately before generation. The scoped state is therefore both technically reproducible and factually `clean` for this artifact.

## Non-deploying CI

Workflow: `.github/workflows/sdk-ci.yml`

Supported Node line: Node.js 22 (`package.json` declares `22.x`). Local validation used Node `v22.23.2`.

The single CI job runs on `ubuntu-latest` with read-only repository contents permission and performs exactly these substantive commands:

```sh
npm ci
npm test
npm run build:check
```

The workflow uses `actions/checkout@v4` and `actions/setup-node@v4`. It has no Cloudflare credentials, deployment command, Wrangler invocation, npm publish, release creation, Git write, or hosted-state mutation.

CI is committed and locally inspectable. No claim is made here about a remote GitHub Actions run because these commits were not pushed as part of this task.

## Local validation

Final generated-state validation results:

- `npm ci`: passed.
- `npm test`: passed.
- Existing behavioral suite: **26/26 passed**.
- Focused provenance suite: **3/3 passed**.
- `npm run build`: passed.
- Second consecutive `npm run build`: produced identical bundle and manifest hashes.
- `npm run build:check`: passed.
- `build:check` non-mutation check: passed; worktree status and binary-diff digest were identical before and after.
- Manifest source commit equals Step 1 commit: passed.
- Manifest source state equals `clean`: passed.
- Manifest artifact SHA-256 equals generated bundle SHA-256: passed.
- Generated banner and manifest provenance agree: passed.
- `git diff --check`: passed.
- Step 2 staged-file inspection: contained only the two generated `dist` outputs.
- Final `git status --short`: clean after the documentation-only report commit.

At the intentional boundary between Steps 1 and 2, the provenance test could not run before the manifest existed; after `npm run build` generated the Step 2 outputs, all final validation passed. The behavioral suite itself remained green throughout.

## Behavior and deployment impact

No SDK behavior was changed in this slice. Engine 4.1.8 behavior, Tune 2.17, payload schema v3, lifecycle semantics v3, Pointer/fallback handling, Page/Domain identity, Undetermined rules, timing, metrics, Shapes, URL sanitization, buffering/autosave, transport, and the public `window.ShapeEngine` API remain covered by the passing behavioral suite.

Deployment status: **not deployed**.

- Wrangler was not invoked.
- The SDK was not uploaded or published.
- Hosted SDK resources were not changed.
- Catcher was not changed.
- No Cloudflare configuration or credential was used.
- `/home/anthony/on_shape` was not modified.

The newly generated local artifact SHA-256 differs from the previously observed hosted artifact. It must not be described as hosted until a separately authorized deployment and readback prove that relationship.

## Architecture reconciliation notes for `on_shape`

`/home/anthony/on_shape/ARCHITECTURE.md` was intentionally not modified. It can now truthfully be reconciled later as follows.

### CURRENT

- `shape-beacon/src` is canonical maintainable SDK source.
- `dist/shape-engine-bundled.js` is generated, committed output.
- `npm run build` deterministically generates the bundle and manifest.
- `npm run build:check` performs a non-mutating byte comparison against committed outputs.
- The manifest binds artifact SHA-256 to source commit/state, engine/Tune/schema/lifecycle versions, and pinned Rollup version.
- Non-deploying GitHub Actions CI validates install, tests, and source/build/artifact consistency.
- Source commit `bfe944d8...` maps to artifact commit `8547217a...` and bundle SHA-256 `a2c95e47...18df`.

### TRANSITIONAL REMAINS

- Hosted release provenance remains manually operated.
- The new generated artifact is not hosted.
- Catcher still proxies the previously deployed artifact.
- Production release scripting, deployment/readback evidence, digest/version pinning, and managed-customer audits remain deferred.

## Remaining provenance gaps

- No scripted, separately authorized production release/readback process exists.
- No machine-generated mapping yet binds a future Cloudflare deployment/version ID to this manifest.
- The current hosted bytes remain the prior artifact, not this newly generated output.
- Catcher follows an unversioned upstream URL and does not pin this manifest digest.
- No managed-customer deployment audit has been performed.
- Remote CI execution is pending a normal push; only workflow definition and local-equivalent commands are proven here.

## Recommended next slice

The next slice should be a **non-deploying release-process design and dry-run implementation**: define a manually triggered script that refuses dirty source, runs `npm ci`, tests, and `build:check`, records the manifest, and can capture deployment/readback evidence when separately authorized. It must support a dry-run that performs no upload. Actual Wrangler deployment, hosted replacement, Catcher changes, credentials, automatic publishing, and customer audits must remain separately authorized.
