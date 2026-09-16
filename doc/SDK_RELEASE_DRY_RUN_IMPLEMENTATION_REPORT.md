# SDK Release Dry-Run Implementation Report

Date: 2026-09-15 (America/Chicago)

## Outcome

The repository now has a fail-closed, non-deploying manual release verifier and dry-run planner. It validates the clean Git/source/artifact relationship, canonical SDK metadata, artifact digest, pinned toolchain, tests, and deterministic build before emitting a machine-readable plan.

No deploy implementation exists in the script. `--deploy` is explicitly rejected. Nothing was uploaded, published, or changed in Cloudflare or `/home/anthony/on_shape`.

Final provenance for this slice:

- clean release-tooling source commit: `2a5b71bbac177e4665dcb2f8e69fc4026c589687`;
- generated artifact commit: `e158481b9c6bd9a6b4a0ee7d60865d6db1d4fe67`;
- artifact SHA-256: `00ef4bffbf5c0afa2cfabe066a963b6f7daa542cb3866e5044a3da152e7a7124`;
- manifest SHA-256: `c228c6009602b16b5af83f51306d173e494cf4ac8173c86a3847b5a352023531`;
- manifest source state: `clean`.

The generated artifact changed only because its deterministic source-commit banner now identifies the new clean source boundary. SDK runtime source and semantics did not change.

## Files changed

- Added `scripts/release.mjs`.
- Added `tests/release.test.mjs`.
- Added `release:check` and `release:dry-run` package commands.
- Updated `scripts/build.mjs` to scope artifact source-state checks to actual bundle-producing inputs.
- Updated `.github/workflows/sdk-ci.yml` to run the purely local `release:check`.
- Updated README development/release verification instructions.
- Regenerated and separately committed the bundle/manifest for the new clean source commit.
- Added this report in a documentation-only follow-up commit.

No SDK implementation module under `src/` changed.

## Release script design

Path: `scripts/release.mjs`

Commands:

```sh
npm run release:check
npm run release:dry-run
```

Both commands use the same verifier. `release:check` prints a compact machine-readable passing plan. `release:dry-run` prints the plan, a future evidence object marked `deployed: false`, and the post-deployment readback contract.

The verifier executes only local, non-mutating validation commands:

```sh
npm test
npm run build:check
```

It reads Git and repository files but does not stage, commit, rebuild `dist`, write evidence, access credentials, make network requests, or invoke Wrangler.

## Fail-closed release checks

The command refuses release readiness if any of these conditions is true:

- the full worktree has tracked or untracked changes;
- the manifest cannot be read or parsed;
- the manifest artifact path is not exactly `dist/shape-engine-bundled.js`;
- the manifest artifact SHA is malformed or differs from the bundle;
- the source commit is malformed or missing from Git;
- manifest source state is not `clean`;
- engine, Tune, payload-schema, or lifecycle metadata differs from `src/version.js`;
- bundler metadata is missing/malformed or differs from the exactly pinned Rollup version;
- `wrangler.jsonc` does not identify `./dist` as its asset directory;
- the bundle and manifest do not share one artifact commit;
- the manifest source commit is not an ancestor of the artifact commit;
- the artifact commit is not an ancestor of current HEAD;
- the artifact commit contains anything other than the bundle and manifest;
- artifact-producing inputs changed between source and artifact commits;
- current committed `dist` differs from the artifact commit;
- tests fail;
- `build:check` fails.

The expected frozen model is therefore explicit:

`clean source commit -> artifact-only commit -> optional documentation/tooling-only descendants`

## Dry-run behavior

`npm run release:dry-run` passed against the real clean repository and printed:

- repository HEAD `e158481b9c6bd9a6b4a0ee7d60865d6db1d4fe67`;
- manifest source commit `2a5b71bbac177e4665dcb2f8e69fc4026c589687`;
- artifact commit `e158481b9c6bd9a6b4a0ee7d60865d6db1d4fe67`;
- artifact path and SHA-256;
- Engine 4.1.8;
- Tune 2.17;
- payload schema v3;
- lifecycle semantics v3;
- Rollup 4.63.3;
- Wrangler config path;
- future deployment command;
- all three future readback URLs;
- an explicit `NO DEPLOYMENT OCCURRED` statement;
- `deployed: false` at the plan/evidence boundary.

The dry-run did not create a repository evidence file. Its deterministic JSON can be captured externally if desired, but it does not claim a production release occurred.

## Exact future deployment command

The command appropriate to the current static-assets configuration, if separately authorized later, is:

```sh
npx wrangler deploy --config wrangler.jsonc
```

This string is printed as evidence input only. The release script contains no execution path for it. Passing `--deploy` fails with an explicit “deployment is intentionally not implemented” error.

## Future hosted readback contract

A future authorized release must, after capturing Wrangler output:

1. require HTTP 200 from `https://shape-beacon.anthonyyerhot.workers.dev/shape-engine-bundled.js`;
2. require HTTP 200 from `https://engine.shapebeacon.com/shape-engine-bundled.js`;
3. require HTTP 200 from `https://engine.sizzlestats.com/shape-engine-bundled.js`;
4. hash each response body and require every SHA-256 to equal the local manifest artifact SHA;
5. require returned engine/Tune/payload/lifecycle fields to match the manifest;
6. capture Cloudflare deployment and version IDs;
7. store the completed machine-readable release evidence.

No hosted GET was performed in this slice. Existing hosted state was neither treated as release proof nor modified.

## Release evidence format

The dry-run emits a JSON evidence template with:

- `sourceCommit`;
- `artifactCommit`;
- `artifactSha256`;
- `engineVersion`;
- `tuneVersion`;
- `payloadSchema`;
- `lifecycleSemantics`;
- `cloudflareDeploymentId` (`null` in dry-run);
- `cloudflareVersionId` (`null` in dry-run);
- `hostedOriginSha256` (`null` in dry-run);
- branded-host SHA values (`null` in dry-run);
- `deployed: false`;
- `releaseMode: manual-operator`.

A real future record may add an actual deployment timestamp because it describes an external event. Dry-run output intentionally contains no volatile timestamp.

## Tests

Focused release tests prove:

1. a valid clean fixture passes and emits exact commit/version/hash/command fields;
2. dry-run output and evidence say `deployed: false`;
3. dirty state is rejected before verification commands execute;
4. manifest/artifact hash mismatch is rejected;
5. invalid source-to-artifact ancestry is rejected;
6. only `npm test` and `npm run build:check` are invoked by validation;
7. no test command invokes Wrangler;
8. the future evidence/readback fields are present.

Final `npm test` result: **34/34 passed**:

- 26 existing behavioral tests;
- 3 existing build/provenance tests;
- 5 focused release-tooling tests.

## Local validation

All requested commands passed after the artifact commit:

```sh
npm ci
npm test
npm run build:check
npm run release:check
npm run release:dry-run
```

Additional results:

- bundle hash matches manifest: passed;
- manifest source commit/state: passed (`2a5b71b...`, `clean`);
- source/artifact ancestry and artifact-only commit: passed;
- deterministic build comparison: passed;
- `git diff --check`: passed;
- dry-run left Git clean: passed;
- release check left Git clean: passed.

## Proof that no deployment occurred

- No `wrangler deploy` process was invoked.
- `scripts/release.mjs` rejects `--deploy` and has no deployment execution branch.
- Tests capture invoked commands and prove only npm tests/build checking occur.
- No Cloudflare credential, token, account metadata, or secret was requested or read.
- No network request is implemented in release check/dry-run.
- Dry-run evidence has null deployment/version/readback fields and `deployed: false`.
- No hosted resource or Catcher source/configuration was touched.
- `/home/anthony/on_shape` was not modified.

## CI impact

Existing non-deploying CI now also runs `npm run release:check` after tests and `build:check`. The workflow retains read-only contents permission and has no secrets, credentials, publish steps, release steps, Git writes, or deployment commands.

This does repeat tests/build checking inside the release verifier; the duplication is intentional at this small scale because `release:check` is the operator-facing fail-closed boundary. CI remains a validation consumer, not deployment authority.

No remote CI run is claimed until these commits are pushed through the normal repository workflow.

## Deployment impact

Deployment impact: **none**.

The newly generated artifact is local/committed only and is not hosted. The public hosts and Catcher proxy remain on their previous artifact until a separately authorized release occurs.

## Architecture reconciliation notes for `on_shape`

`/home/anthony/on_shape/ARCHITECTURE.md` was not modified. A later reconciliation can move these facts to CURRENT:

- canonical maintainable source/build provenance is complete;
- clean committed artifact provenance is complete;
- non-deploying CI is present;
- non-deploying release verification and dry-run tooling are present;
- future deployment inputs and readback evidence contract are explicitly defined.

The following remain TRANSITIONAL:

- a real production release still requires separate manual authorization;
- the hosted artifact remains old until separately deployed and verified;
- actual deployment/version IDs and hosted readback evidence do not yet exist;
- Catcher proxy behavior remains unchanged;
- digest/version pinning remains unresolved;
- production release automation and CI deployment authority remain absent by design.

## Remaining blockers

- Separate authorization for an actual manual production release.
- A reviewed implementation of the deploy/readback/evidence-writing phase.
- Cloudflare deployment/version ID capture under authorized credentials.
- Post-deploy three-host digest/version verification.
- Decision on Catcher digest/version pinning.
- Managed-customer deployment audit.

## Recommended next slice

The smallest next slice is a **production release execution design/review**, not deployment itself: specify operator preflight, authorization boundary, exact Wrangler output parsing, post-deploy readback failure handling, evidence-file naming/schema validation, and rollback/stop conditions. Only a later explicitly authorized task should implement or execute the mutating deployment phase.
