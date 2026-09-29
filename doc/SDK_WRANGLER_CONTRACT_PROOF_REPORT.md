# SDK Wrangler Contract Proof Report

> **Historical proof boundary (2026-09-15).** The authenticated read-only production contract capture requested below was completed later; see [SDK Production Read-Only Contract Capture Report](SDK_PRODUCTION_READ_ONLY_CONTRACT_CAPTURE_REPORT.md). For the current SDK and hosted-byte state, see [the 2026-09-29 audit](PUBLIC_REPO_AND_HOSTED_SDK_RELEASE_READINESS_2026-09-29.md).

## Scope and outcome

This slice pinned Wrangler, proved its credential-free local preparation path, and added strict
fixture-backed parsers for the future release workflow. It did not implement a mutating release
path, authenticate to Cloudflare, query production hosts, or change SDK runtime behavior.

The remaining production-specific JSON and identity assumptions still require one separately
authorized authenticated **read-only** capture. Therefore the mutating path is not yet ready to
be implemented.

## Toolchain pin

- Wrangler: `4.132.0`, exact `devDependency` and lockfile resolution
- Wrangler Node requirement: `>=22.0.0`
- Repository Node policy and validation runtime: Node `22.x` (`22.23.2` locally)
- Rollup remains `4.63.3`
- `npm audit`: 0 vulnerabilities (0 info, low, moderate, high, or critical)

Wrangler 4.132.0 was selected as the current stable release compatible with the repository's
existing Node 22 policy. This was a pin, not an upgrade campaign. Release validation invokes the
pinned package's local Node entrypoint for its version assertion. The future command remains
`npx --no-install wrangler ...`, so it cannot download an unreviewed CLI.

## CLI contract actually proved

Local help and installed package source were inspected for Wrangler 4.132.0.

| Command | Proven relevant flags/arguments |
| --- | --- |
| `wrangler deploy` | `--config`, global `--profile`, `--tag`, `--message`, `--outdir`, `--dry-run`, `--strict` |
| `wrangler whoami` | `--account`, `--json`; no `--profile` flag in this command |
| `wrangler deployments list` | `--name`, `--json`, global `--config` and `--profile` |
| `wrangler deployments status` | `--name`, `--json`, global `--config` and `--profile` |
| `wrangler versions list` | `--name`, `--json`, global `--config` and `--profile` |
| `wrangler rollback [version-id]` | positional version ID, `--name`, `--message`, `--yes`, global config/profile |

No unsupported JSON flag is assumed for `deploy`. Deploy evidence uses
`WRANGLER_OUTPUT_FILE_PATH` NDJSON instead.

## Local deploy dry-run proof

The following equivalent command shape was executed with `WRANGLER_LOG_PATH` and `--outdir`
inside a temporary directory:

```text
npx --no-install wrangler deploy --dry-run --outdir <temporary>/out --config wrangler.jsonc
```

Results:

- no Cloudflare credentials were required;
- Wrangler read the two committed files in `dist`;
- Wrangler printed `--dry-run: exiting now.`;
- it emitted only local `no-op-worker.js`, source map, and README files under the temporary output;
- installed Wrangler source confirms the dry-run branch skips asset synchronization/upload;
- the temporary directory was removed;
- Git status before and after was identical.

This proves local static-assets preparation only. It is not deployment proof.

## Structured output findings

For this pinned CLI, `WRANGLER_OUTPUT_FILE_PATH` is newline-delimited JSON. Relevant record
versions are `1`:

- `wrangler-session`: Wrangler version, argv, log path, and record timestamp;
- `deploy`: worker name/tag, deployed `version_id`, targets, environment/name override state,
  bundle size, and record timestamp;
- `command-failed`: error code, message, and optional retry delay.

The direct `deploy` record contains the version ID, but not a deployment ID. Deployment ID must
be correlated from pre/post `deployments list --json` and `deployments status --json` snapshots.
The parser rejects malformed JSON/NDJSON, unknown record shapes, wrong record versions, wrong
worker names, invalid UUID syntax, `command-failed`, and missing or duplicate session/deploy
success records. It never guesses between conflicting successes.

Wrangler's installed source proves that the read-only JSON commands print raw values with these
top-level forms:

- `whoami --json`: login state, auth type, email, accounts, and token permissions;
- `deployments list --json`: deployment array;
- `deployments status --json`: one current deployment;
- `versions list --json`: version array with version `id` and `metadata.created_on`.

Synthetic fixtures are explicitly labeled in `tests/fixtures/wrangler/README.md`; they are not
represented as production captures.

## Parser implementation

`scripts/release-contract.mjs` contains the non-network contract layer:

- exact pinned Wrangler version parsing;
- local dry-run result validation;
- deploy NDJSON parsing;
- `whoami`, versions, deployments-list, and deployment-status JSON parsing;
- deterministic deployment correlation;
- bundle metadata/readback verification and aggregate classification;
- release evidence schema-v1 validation.

### Deployment correlation

Correlation accepts exactly one deployment that:

- was absent from the pre-deploy snapshot;
- contains exactly the deploy record's version ID at 100% traffic;
- is temporally consistent with the recorded attempt start (bounded five-second clock skew);
- matches worker/account fields where the captured schema supplies them;
- is also the deployment returned by post-deploy status.

Zero or multiple matches fail closed. The function also requires an independently verified
account/worker context; list order or “latest” is never used as proof.

### Hosted readback

The non-network verifier enforces HTTP 200, a 1 MiB body cap, exact SHA-256, and unambiguous
Engine/Tune/schema/lifecycle declarations. It produces `verified`, `stale_candidate`,
`temporarily_unavailable`, `unexpected_content`, or `contract_mismatch`; aggregation additionally
produces `partial_propagation`. Hash equality is mandatory for `verified`.

### Evidence validation

Schema version 1 validation enforces:

- exact source/artifact/hash/version identities supplied by the release plan;
- lowercase full Git hashes and SHA-256 values;
- canonical UUID syntax and UTC timestamps;
- the reviewed worker, artifact path, three hosted URLs, Wrangler version, and deploy argv;
- verified = `deployed:true`, `mutationState:confirmed`, exit code 0, both IDs, and three passing
  readbacks;
- mutation unknown = `deployed:null` and `overallResult:mutation_unknown`;
- failed/partial evidence cannot contain three passing hosted verifications;
- secret-bearing fields are forbidden.

No successful production evidence file was created.

## Tests and validation

- `npm ci`: passed (required an environment permission exception only so esbuild could execute its
  local install-time version check)
- `npm test`: 42 passed, 0 failed
- `npm run build`: passed deterministically
- `npm run build:check`: passed
- `npm run release:check`: passed, `deployed:false`
- `npm run release:dry-run`: passed, `deployed:false`
- `git diff --check`: passed
- `npm audit`: 0 vulnerabilities
- explicit `node scripts/release.mjs --deploy`: refused before any verification/deployment action

Tests cover exact/wrong Wrangler versions; malformed, duplicate, conflicting, and failed deploy
records; one/zero/multiple deployment correlations; valid/stale/unknown/mismatched/oversized
readbacks; evidence cross-field rules; dry-run proof validation; and the unconditional deploy
refusal. No test invokes production mutation.

## CI impact

The existing non-deploying CI remains unchanged. Its `npm ci`, `npm test`, `npm run build:check`,
and `npm run release:check` steps now install and validate the exact Wrangler pin. It has no
Cloudflare credentials and no deploy, rollback, authenticated-read, release, or publishing step.

## Source and artifact provenance impact

- Wrangler contract/source commit: `b039dc804f8ce71a4cd8c22f313b080c1355358b`
- Generated artifact commit: `9a0a861ef4adf1298a2eddaa350e333dfae6dd1e`
- Manifest-recorded source commit: `b039dc804f8ce71a4cd8c22f313b080c1355358b`, state `clean`
- Artifact SHA-256: `906b43a47ba887cc0a4468eec00e0dcc3c7d4949bc4ab7e482a885f4a7d45338`
- Manifest SHA-256: `4746b93251b78ae4a8dd7ea0cd13945104833d1a26564e5d9678bd7fa6f5b686`
- Follow-up local-resolution corrections: `c48bded` and `d08520a`; neither changed SDK build
  inputs or generated output.

The lockfile is an established SDK build input, so the Wrangler pin correctly triggered the
source-commit then artifact-only-commit model. The generated JavaScript changed only in its
provenance banner. SDK versions and runtime source are unchanged.

## Proof of no mutation

- No production credentials were read or used.
- No authenticated Cloudflare command was run.
- No production SDK URL was contacted.
- No `wrangler deploy` was run without `--dry-run`.
- No upload, publish, rollback, release, hosted-resource change, Catcher change, or sibling-repo
  change occurred.
- `scripts/release.mjs --deploy` remains an explicit hard failure and contains no deploy spawn.

## Remaining unknowns

One separately authorized authenticated, read-only capture is still required to prove:

1. production `whoami --json` account/profile identity and exact account record;
2. production `deployments list --json`, `deployments status --json`, and `versions list --json`
   payloads for the expected Worker/account;
3. whether optional worker/account identity fields occur in those live deployment records;
4. the real deploy-to-deployment correlation against that account (only after deployment is
   separately authorized);
5. real hosted propagation/cache behavior and rollback semantics.

Production account/profile identity, real IDs, hosted replacement, readback evidence, rollback
proof, Catcher pinning, and managed-customer revision audit remain transitional.

## Architecture reconciliation

The following can remain CURRENT: canonical source/build provenance, clean artifact provenance,
non-deploying CI, fail-closed release check/dry-run, exact Wrangler pin and local flag contract,
credential-free local preparation, strict structured-output/correlation/readback/evidence parsers.

The following remain TRANSITIONAL: production account/profile proof, authenticated JSON capture,
real deployment/version correlation, hosted propagation proof, rollback proof, actual release,
Catcher digest/version pinning, and managed-customer audit. `/home/anthony/on_shape` was not
modified.

## Recommended next slice

Perform a separately authorized, authenticated **read-only** contract capture using the pinned
CLI and expected operator profile/account. Store redacted test fixtures (never credentials), run
the strict parsers against them, and resolve any schema boundary before reviewing an actual
`--deploy` implementation. No mutation should be part of that capture slice.

MUTATING PATH READY FOR SEPARATE IMPLEMENTATION REVIEW: NO

Blocker: the exact production account identity and authenticated JSON response shapes have not
yet been captured and proven against the pinned CLI.
