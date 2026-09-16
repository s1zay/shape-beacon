# SDK Production Release Execution Design

Date: 2026-09-15 (America/Chicago)

Status: **DESIGN REVIEWED — MUTATING IMPLEMENTATION AND DEPLOYMENT NOT AUTHORIZED**

## 1. Scope and conclusions

This document defines the future manual production execution contract for the Shape Beacon static SDK. It does not add a deploy path, invoke Wrangler, authenticate to Cloudflare, contact hosted SDK endpoints, or modify production.

The recommended implementation boundary is **B**: keep deployment unimplemented until an exact Wrangler version is pinned and its structured deploy/deployment-list output is verified with non-mutating fixtures/read-only commands. After that proof, add the mutating path under a separate authorization.

Reasons:

- this repository does not currently depend on or pin Wrangler;
- `npx wrangler ...` could otherwise resolve a changing CLI version;
- Cloudflare documents structured NDJSON deploy output, including a version ID, but does not document a deployment ID in that deploy record;
- deployment ID correlation therefore requires a separate structured read and defensive matching;
- static-assets rollback behavior for this exact project has not been exercised or proven in this repository.

The local release contract remains unchanged and fail closed:

- source commit: `2a5b71bbac177e4665dcb2f8e69fc4026c589687`;
- artifact commit: `e158481b9c6bd9a6b4a0ee7d60865d6db1d4fe67`;
- artifact SHA-256: `00ef4bffbf5c0afa2cfabe066a963b6f7daa542cb3866e5044a3da152e7a7124`;
- Engine 4.1.8 / Tune 2.17 / payload v3 / lifecycle v3;
- current deploy implementation: absent and explicitly rejected.

## 2. Authoritative external facts

The design relies only on these documented Cloudflare behaviors:

1. `wrangler deploy` creates a version and immediately deploys it to 100% traffic by default. Versions and deployments are distinct objects with distinct identities. See [Versions and Deployments](https://developers.cloudflare.com/workers/versions-and-deployments/).
2. `wrangler deploy` supports `--config`, `--strict`, `--tag`, and `--message`. Strict mode is intended to prevent deployments that would override conflicting remote settings. See [Wrangler Workers commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/).
3. `wrangler whoami --json` is read-only, reports authenticated identity, and exits nonzero if unauthenticated. It supports selecting an account. See [Wrangler general commands](https://developers.cloudflare.com/workers/wrangler/commands/general/).
4. `wrangler versions list`, `deployments list`, and `deployments status` support JSON output. See [Wrangler Workers commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/).
5. `WRANGLER_OUTPUT_FILE_PATH` produces structured NDJSON. A successful `deploy` event includes `worker_name`, `version_id`, targets, environment, and timestamp; failure can produce `command-failed`. See [Wrangler system environment variables](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/).
6. Cloudflare supports operator-initiated rollback to a prior version; rollback creates a new deployment and makes that version active. Rollback is limited and can fail when bound resources have changed. See [Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

Anything beyond those facts is either a repository contract defined below or an explicit proof gap.

## 3. Authorization boundary

### Future operator command

After the implementation is separately authorized, the only mutating entry should have this shape:

```sh
npm run release:production -- \
  --deploy \
  --artifact-commit <FULL_40_HEX_ARTIFACT_COMMIT> \
  --account-id <EXPECTED_CLOUDFLARE_ACCOUNT_ID> \
  --profile <REVIEWED_WRANGLER_PROFILE> \
  --confirm "DEPLOY shape-beacon <FULL_40_HEX_ARTIFACT_COMMIT>"
```

All flags are mandatory. The confirmation string is case-sensitive and must exactly include the literal project name and full artifact commit. It is authorization evidence, not a substitute for task-level approval.

The future command must refuse to mutate unless:

- stdin and stderr are attached to a human-operated TTY;
- common CI indicators (`CI`, `GITHUB_ACTIONS`, and equivalent supported indicators) are absent/false;
- `--deploy` is present exactly once;
- the supplied artifact commit exactly equals the artifact commit independently derived by `release:check`;
- the supplied confirmation string matches exactly;
- the account ID is a syntactically valid expected account ID and matches read-only identity output;
- the profile is explicitly provided and successfully resolves the expected account;
- all preflight checks below pass in the same process immediately before mutation.

`release:check` and `release:dry-run` must remain separate code paths that never call the mutating function. A dry-run flag must not be implemented as “deploy code with a boolean”; mutation should live behind a separate function that cannot be reached without the complete authorization object.

### Immediate refusal conditions

Refuse before authentication or mutation for malformed flags, non-TTY/CI execution, dirty Git state, wrong branch policy (if one is later adopted), mismatched explicit artifact commit, missing confirmation, invalid manifest/artifact, invalid provenance ancestry, changed `dist`, failing tests/build check, unexpected config name/assets path, or an unpinned Wrangler executable.

Refuse after read-only authentication but before mutation for wrong/ambiguous account, missing project, unexpected current project identity, inability to capture the current deployment, split traffic, or failure to identify one previous known-good 100% version.

## 4. Preflight contract

Preflight occurs in two phases and produces an in-memory immutable plan. Any failed check exits nonzero and writes, at most, a non-deployment diagnostic marked `deployed: false`.

### Phase A: offline/local

Run and require all of the following:

1. full `git status --porcelain=v1 --untracked-files=all` is empty;
2. HEAD, current branch/ref, manifest source commit, and artifact commit are recorded as full hashes;
3. caller-supplied artifact commit equals the derived artifact commit;
4. `npm run release:check` passes, thereby also running `npm test` and `npm run build:check`;
5. manifest exists, parses, and is schema-valid;
6. manifest SHA equals the actual `dist/shape-engine-bundled.js` SHA;
7. manifest source state is `clean`;
8. manifest versions exactly match `src/version.js`;
9. source commit is an ancestor of the artifact-only commit, which is an ancestor of HEAD;
10. committed `dist` is byte-identical to the artifact commit;
11. `wrangler.jsonc` parses to project name `shape-beacon`, assets directory `./dist`, and the reviewed compatibility date;
12. the exact pinned Wrangler executable reports the expected version;
13. confirmation/account/profile arguments pass exact validation;
14. the complete release plan is printed for operator review before any authenticated operation.

The future implementation must pin Wrangler as an exact dev dependency. It must use `npx --no-install wrangler` (or the direct local binary), never an unqualified network-resolving `npx wrangler` at execution time.

### Phase B: authenticated, read-only

Use the supplied profile and expected account, but do not retrieve or print raw tokens:

```sh
npx --no-install wrangler whoami --json --account <EXPECTED_ACCOUNT_ID> --profile <PROFILE>
npx --no-install wrangler deployments status --json --name shape-beacon --config wrangler.jsonc --profile <PROFILE>
npx --no-install wrangler deployments list --json --name shape-beacon --config wrangler.jsonc --profile <PROFILE>
npx --no-install wrangler versions list --json --name shape-beacon --config wrangler.jsonc --profile <PROFILE>
```

Requirements:

- authentication succeeds;
- exactly one membership/account matches the expected account ID;
- resolved Worker name is exactly `shape-beacon`;
- current deployment is a single 100% version, not a split rollout;
- deployment ID and version ID are valid UUIDs and appear consistently in status/list output;
- that deployment/version is stored as the previous-known-good rollback candidate;
- the preflight snapshots and pinned Wrangler version are retained for evidence;
- no command prompts to change configuration or create a resource.

No authenticated read was executed during this design task. Exact JSON shapes must be fixture-captured with the pinned Wrangler version before implementation.

## 5. Wrangler execution contract

### Exact future deploy invocation

The repository's current baseline command is `npx wrangler deploy --config wrangler.jsonc`. The safer implemented invocation, after Wrangler is pinned, should be exactly:

```sh
WRANGLER_OUTPUT_FILE_PATH=<ATTEMPT_TEMP_DIR>/wrangler-output.ndjson \
npx --no-install wrangler deploy \
  --config wrangler.jsonc \
  --strict \
  --tag "sdk-4.1.8-<ARTIFACT_COMMIT_12>" \
  --message "Shape Beacon SDK artifact <FULL_ARTIFACT_COMMIT> sha256 <FULL_ARTIFACT_SHA>" \
  --profile <REVIEWED_PROFILE>
```

The process must be spawned as an argv array without a shell. Environment inheritance must be allowlisted or scrubbed so unrelated Wrangler configuration variables cannot redirect API base URLs, accounts, config, or output. The output-file path must be a newly created private temporary directory. stdout and stderr must be captured separately with bounded size while also remaining visible to the operator.

### Exit-code and output rules

- Nonzero exit: deploy command failure. Never parse it as success.
- Signal/timeout: ambiguous mutation state. Preserve all output and perform read-only recovery inspection; never retry deploy automatically.
- Exit zero without exactly one valid NDJSON `wrangler-session` record and one valid `deploy` record: provenance ambiguity/hard failure.
- Any `command-failed` record: hard failure even if process exit is zero.
- Worker name other than `shape-beacon`, mismatched CLI version, unexpected environment, missing/duplicate version ID, missing expected target, or malformed UUID: hard failure.

The NDJSON `deploy` record supplies the new version ID, not a documented deployment ID. Plain stdout such as `Current Version ID:` is retained for humans but is not authoritative parsing input.

### Deployment-ID correlation

Immediately after an exit-zero deploy record, run `deployments list --json` and `deployments status --json` read-only. A deployment ID is accepted only if exactly one deployment:

- was created after the recorded attempt start (with small clock-skew tolerance);
- contains the exact NDJSON version ID at 100%;
- targets Worker `shape-beacon` in the expected account;
- is reported active by status;
- was absent from the pre-deploy deployment snapshot.

Zero or multiple matches is `provenance_ambiguous`, even if traffic appears updated. Preserve raw output and stop. Never guess the newest deployment by ordering alone.

### Wrangler parsing confidence

Confidence is **PARTIAL**:

- high confidence that structured NDJSON exists for supported recent Wrangler and contains a deploy/version record;
- high confidence that list/status commands offer JSON;
- low/unproven confidence in the exact JSON schemas and static-assets fields for the not-yet-pinned version;
- no documented deployment ID in the deploy NDJSON example;
- current repository does not pin Wrangler.

This is the main reason not to implement `--deploy` yet.

## 6. Post-deploy readback contract

### Targets

Verify these exact response bodies:

1. `https://shape-beacon.anthonyyerhot.workers.dev/shape-engine-bundled.js`
2. `https://engine.shapebeacon.com/shape-engine-bundled.js`
3. `https://engine.sizzlestats.com/shape-engine-bundled.js`

### Schedule and bounds

- Six verification rounds, with round starts at elapsed 0, 2, 7, 17, 37, and 67 seconds.
- All three hosts fetched concurrently in each round.
- Per-request connection/body timeout: 10 seconds.
- Hard overall deadline: 90 seconds from the first post-deploy request.
- Maximum response body: 1 MiB; larger bodies fail.
- Redirects: at most two, HTTPS only; record the final URL and redirect chain.

This is bounded, finishes within about 90 seconds, and permits short route/cache convergence without turning release into an open-ended monitor.

### Request construction

Each request uses a cache-busting query such as:

```text
?sb_release=<FULL_ARTIFACT_SHA>&attempt=<1..6>
```

Send `Cache-Control: no-cache` and `Pragma: no-cache`. Record status, selected cache headers (`ETag`, `Age`, `Cache-Control`, `CF-Cache-Status`, `CF-Ray`), body length, body SHA-256, parsed versions, and request duration. Never treat headers as proof of bytes; the body digest is authoritative.

Before mutation, optionally read the same three hosts with a separate preflight cache-buster and record their current digests. Those reads are current-state observations, not proof of the new release.

### Per-host acceptance

A host passes only when the same response has:

- HTTP 200;
- body SHA-256 exactly equal to manifest artifact SHA;
- engine version exactly equal to manifest engine version;
- Tune version exactly equal to manifest Tune version;
- payload schema exactly equal to manifest schema;
- lifecycle semantics exactly equal to manifest lifecycle value.

Version extraction must use a reviewed parser against generated bundle syntax and must fail on zero or multiple conflicting declarations. Hash equality is still mandatory; matching text fields cannot compensate for a digest mismatch.

### Stale versus wrong content

- A body matching the recorded pre-deploy digest is `stale_candidate`; retry within the bounded schedule.
- HTTP 404/5xx, timeout, or network error is `temporarily_unavailable`; retry.
- A third/unknown digest is `unexpected_content`; hard failure, although remaining hosts should be observed once for evidence.
- Target digest with missing/mismatched metadata is `contract_mismatch`; hard failure.
- HTTP 200 with HTML/error content is `unexpected_content`, never propagation success.

If Workers.dev passes while branded hosts still return the pre-deploy digest, classify the round as `partial_propagation` and continue bounded retries. Success requires all three hosts in the same completed release attempt. If convergence has not occurred by the 90-second deadline, final result is `partial_failure`; do not call the release successful.

## 7. Evidence record

### Location and naming

Successful/identified deployment:

```text
release-evidence/<FULL_ARTIFACT_COMMIT>/<CLOUDFLARE_DEPLOYMENT_ID>.json
```

Ambiguous or failed attempt without a trustworthy deployment ID:

```text
release-evidence/<FULL_ARTIFACT_COMMIT>/attempt-<UTC_COMPACT_START>.json
```

Raw supporting files live beside the JSON:

- `<stem>.wrangler-output.ndjson`;
- `<stem>.stdout.log`;
- `<stem>.stderr.log`;
- `<stem>.preflight-deployments.json`;
- `<stem>.postflight-deployments.json`.

Write every file through a private temporary directory, fsync where supported, and atomically rename into place. Never overwrite an existing evidence path. Evidence creation will make the worktree dirty by design; the operator reviews and commits it separately after the release attempt.

### JSON schema (version 1)

Required top-level fields:

```json
{
  "schemaVersion": 1,
  "releaseMode": "manual-operator",
  "deployed": true,
  "mutationState": "confirmed",
  "sourceCommit": "<40 hex>",
  "artifactCommit": "<40 hex>",
  "repositoryHead": "<40 hex>",
  "branch": "<string or detached>",
  "artifactPath": "dist/shape-engine-bundled.js",
  "artifactSha256": "<64 hex>",
  "manifestSha256": "<64 hex>",
  "engineVersion": "4.1.8",
  "tuneVersion": "2.17",
  "payloadSchema": "v3",
  "lifecycleSemantics": "v3",
  "rollupVersion": "4.63.3",
  "wranglerVersion": "<pinned semver>",
  "cloudflareAccountId": "<non-secret account id>",
  "workerName": "shape-beacon",
  "previousDeploymentId": "<uuid>",
  "previousVersionId": "<uuid>",
  "cloudflareDeploymentId": "<uuid>",
  "cloudflareVersionId": "<uuid>",
  "deploymentStartedAt": "<RFC3339 UTC>",
  "deploymentCompletedAt": "<RFC3339 UTC>",
  "deployCommand": ["npx", "--no-install", "wrangler", "deploy", "..."],
  "deployExitCode": 0,
  "wranglerOutputSha256": "<64 hex>",
  "hostedVerification": {},
  "overallResult": "verified",
  "rollback": { "status": "not_requested" }
}
```

Each hosted-verification entry is keyed by the exact URL and requires final status, HTTP status, body SHA-256, parsed four version values, attempts, first/last observation timestamps, final URL, selected cache headers, and a bounded list of attempt summaries.

For ambiguous mutation, `deployed` must be `null`, not falsely `false`; `mutationState` is `unknown`. For a confirmed deploy with failed readback, `deployed` is `true`, `mutationState` is `confirmed`, and `overallResult` is `partial_failure` or `verification_failed`. A schema validator must enforce these cross-field rules.

### Schema validation rules

- reject unknown schema versions and unknown enum values;
- full lowercase Git hashes and SHA-256 values only;
- UUID syntax for Cloudflare deployment/version IDs;
- exact canonical artifact path, Worker name, release mode, and host URL set;
- RFC3339 UTC timestamps with completion not before start;
- exact version/toolchain values copied from manifest/local tool outputs;
- deploy argv array must equal the reviewed allowlist; no shell string;
- exit code zero required for `mutationState: confirmed`;
- `overallResult: verified` requires `deployed: true`, both IDs, and all three hosts passing exact hash/version checks;
- partial/failed results cannot be rewritten as verified; create a superseding evidence record or append an immutable recovery section according to a reviewed schema evolution;
- secrets, authorization headers, raw tokens, and full environment dumps are forbidden.

## 8. Stop and failure matrix

| Stage/condition | Classification | Required action | Evidence |
|---|---|---|---|
| Local preflight fails | `preflight_failed` | Exit nonzero; no authenticated read or mutation | Optional diagnostic, `deployed:false` |
| Auth/account/project preflight fails | `identity_failed` | Exit nonzero; no mutation | Diagnostic with non-secret identity only |
| Previous active deployment is ambiguous/split | `baseline_ambiguous` | Exit nonzero; no mutation | Preserve structured snapshots |
| Deploy exits nonzero with no structured success | `deploy_failed` | Stop; read deployment status once to determine whether mutation may have occurred | Attempt evidence; `deployed:false` only if absence is proven, otherwise `null` |
| Deploy times out/signals | `mutation_unknown` | Never retry deploy; inspect status/list read-only | Raw output + snapshots; `deployed:null` |
| Exit zero but NDJSON missing/duplicate/malformed | `provenance_ambiguous` | Stop; do not claim success; inspect status/list read-only | Preserve all raw output |
| Version found but deployment ID zero/multiple matches | `provenance_ambiguous` | Stop; no readback success claim | `deployed:true` only if active deployment is independently proven; otherwise `null` |
| Deploy identified, origin/branded hosts show old digest | `partial_propagation` | Continue bounded readback only | Record every attempt |
| Some hosts pass, others do not converge by deadline | `partial_failure` | Stop nonzero; no automatic redeploy/rollback | `deployed:true`, host-specific results |
| Any unknown body digest | `unexpected_content` | Hard failure; collect one evidence round, then stop | Exact unexpected hashes/headers, no body if privacy policy disallows |
| Hash matches but version parse mismatches | `contract_mismatch` | Hard failure | Record parser results |
| All three pass exact contract | `verified` | Persist validated evidence and exit zero | `deployed:true`, complete IDs/readbacks |

No condition permits “close enough,” manual editing of a failure into success, guessing identifiers, or repeating the deploy command automatically.

## 9. Rollback and recovery philosophy

Do **not** automatically roll back.

Reasons:

- a readback failure can be propagation/cache delay rather than bad active content;
- rollback itself is a production mutation and creates another deployment;
- the exact static-assets rollback behavior has not been proven locally;
- Cloudflare documents rollback limitations related to versions/resources;
- automatic rollback could replace a healthy deployment during an observation problem.

Before deploy, capture the current single 100%-traffic deployment ID and version ID as the previous-known-good candidate. On failure:

1. stop deployment automation;
2. persist failure/partial evidence and raw outputs;
3. print the previous candidate and current observed IDs;
4. require a new explicit operator authorization for rollback;
5. use the pinned Wrangler's reviewed rollback syntax or dashboard only after verifying the target version still exists;
6. verify all three hosts again and write separate rollback evidence.

Cloudflare documents `wrangler rollback` and version-ID selection, but this repository has not pinned/tested the exact command syntax or static-assets behavior. The rollback command therefore remains manual/deferred and must not be generated as an executable automatic action yet.

## 10. Security and secrets

- Use a least-privilege operator credential/profile scoped to the expected account/Worker; exact permission policy is a future review item.
- Never accept tokens as command-line flags, where process listings/history can expose them.
- Never call `wrangler auth token --json`; its documented output can contain raw credentials.
- Do not store environment dumps, authorization headers, cookies, tokens, API keys, OAuth refresh material, or Wrangler credential-file contents.
- Account ID, Worker name, deployment/version IDs, profile name, and operator Git identity are non-secret but should still be minimized.
- Create temporary output with owner-only permissions; remove it only after durable evidence is written.
- Scrub known token patterns from stdout/stderr before repository persistence while retaining hashes of original private logs if policy permits.
- Do not provide credentials to CI; production remains TTY/manual only.
- Resolve the local pinned Wrangler binary without network installation during the release.
- Disable or explicitly control environment variables that can alter API base URL, account, config, environment, metrics, or output paths.

## 11. Implementation recommendation

Recommendation: **B — keep deploy unimplemented.**

Next, implement a non-mutating execution-contract proof slice that:

1. pins an exact Wrangler version as a dev dependency;
2. verifies `wrangler --version` and command help locally;
3. runs only Wrangler's local `deploy --dry-run` into a temporary output directory, if confirmed non-mutating for the pinned version;
4. captures redacted read-only `whoami --json`, deployments status/list JSON, and versions list JSON fixtures only under separate approval to authenticate;
5. implements and unit-tests strict parsers using official/example and captured fixtures;
6. implements readback/evidence schema validators against local HTTP fixtures;
7. leaves the actual process spawn for `deploy` unreachable/absent.

Only after those schemas and parsers are proven should option A be reviewed: add the explicit mutating path without executing it. The first actual deployment must remain a further separately authorized task.

## 12. Explicit unknowns/proof gaps

- Exact Wrangler version to pin.
- Exact `whoami --json`, `deployments status/list --json`, and `versions list --json` shapes for that version/account/static-assets Worker.
- Whether structured output records exactly one deploy entry for this static asset upload in the pinned version.
- Whether a structured deploy entry's `worker_tag` has any useful stable relationship to a deployment ID (do not assume it does).
- Exact deployment-ID correlation behavior and timestamps returned by Wrangler.
- Whether the project/account has a named auth profile suitable for production.
- Expected production account ID; it is not tracked here and must not be invented.
- Current production deployment/version ID at future release time.
- Exact rollback CLI syntax and behavior for the chosen pinned version/static-assets Worker.
- Propagation characteristics across Workers.dev and both Catcher-backed branded hosts.
- Whether branded-host caching honors the proposed cache-busting/no-cache request consistently.
- Evidence-retention policy and whether operator identity/email should be stored or hashed.
- Least-privilege Cloudflare token/profile permissions for this specific deployment.

Every unknown above is a refusal condition unless resolved before mutation; none may be filled by inference.

## 13. Architecture reconciliation notes

Do not modify `/home/anthony/on_shape/ARCHITECTURE.md` in this slice.

### CURRENT can remain

- `shape-beacon/src` is canonical maintainable source.
- Build and artifact provenance are deterministic and committed.
- Clean source-to-artifact commit linkage exists.
- Non-deploying CI validates tests/build/release readiness.
- Release check/dry-run is fail closed and produces a `deployed:false` plan.
- The future authorization, evidence, readback, and failure contracts are now designed.

### TRANSITIONAL remains

- Real production release execution is not implemented or authorized.
- The new generated artifact is not hosted.
- No new deployment/readback evidence exists.
- Catcher proxy and digest/version pinning policy remain unchanged/unresolved.
- Managed-customer revision audit remains undone.
- Wrangler version/output and rollback details require proof.

## 14. Next recommended slice

Implement the **non-mutating Wrangler contract proof** described under recommendation B: pin Wrangler, prove its version/help/local dry-run behavior, and build strict parsers/evidence-schema/readback tests from fixtures. Do not add or execute the real deploy spawn. After that slice, review whether the mutating path is sufficiently specified for a separately authorized implementation.

## 15. Production mutation statement

No deployment occurred. `wrangler deploy` was not run. No Cloudflare credential was used. No hosted GET was performed. No Cloudflare, Catcher, hosted SDK, or `/home/anthony/on_shape` state was read with credentials or modified. This file is the only repository change in this task.
