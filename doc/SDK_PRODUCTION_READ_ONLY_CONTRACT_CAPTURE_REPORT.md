# SDK Production Read-Only Contract Capture Report

## Authorization scope and result

This slice used the existing operator authentication only for authenticated, read-only
Cloudflare identity and Worker status queries. It did not deploy, roll back, upload, publish,
change configuration/routes/secrets, contact hosted SDK bodies, or modify Catcher or
`/home/anthony/on_shape`.

The capture proved the production account identity, Wrangler 4.132.0 JSON response shapes, parser
compatibility, and the current `shape-beacon` deployment/version baseline.

## Pinned CLI and preflight

- Wrangler: exactly `4.132.0`, resolved locally with `npx --no-install wrangler`
- Starting HEAD: `dc275ca71a35cbaba07da39ff65169b4be6cdd26`
- Starting worktree: clean
- `npm run release:check`: passed before authentication
- Worker/config: `shape-beacon`, `wrangler.jsonc`

No unpinned download path was used.

## Authenticated identity

- Authenticated: yes
- Auth mechanism: existing default Wrangler OAuth session
- Named profile selected: no; it was neither required nor inspected
- Accounts returned: exactly one
- Production account ID: `c8923ddc9f252b8b35696c5278e3855b`
- Account display name and authenticated email: redacted from repository fixtures

The single account plus an explicit `CLOUDFLARE_ACCOUNT_ID` on the Worker reads removed account
selection ambiguity. No token, OAuth secret, credential-file content, authorization header, or
token-permission value was printed or persisted.

## Exact read-only commands executed

Wrangler logging was directed to a private temporary directory and metrics were disabled. The
material command argv were:

```text
npx --no-install wrangler whoami --json
CLOUDFLARE_ACCOUNT_ID=c8923ddc9f252b8b35696c5278e3855b npx --no-install wrangler deployments list --json --name shape-beacon --config wrangler.jsonc
CLOUDFLARE_ACCOUNT_ID=c8923ddc9f252b8b35696c5278e3855b npx --no-install wrangler deployments status --json --name shape-beacon --config wrangler.jsonc
CLOUDFLARE_ACCOUNT_ID=c8923ddc9f252b8b35696c5278e3855b npx --no-install wrangler versions list --json --name shape-beacon --config wrangler.jsonc
```

No other authenticated Cloudflare command was run.

## Production fixtures and redaction

Redacted fixtures are under `tests/fixtures/wrangler/production-redacted/`:

- `README.md`
- `whoami.json`
- `deployments-list.json`
- `deployments-status.json`
- `versions-list.json`

The fixtures derive from real production responses captured on 2026-09-15 America/Chicago
(2026-09-16 UTC). Redactions/minimization were:

- authenticated email replaced with `<REDACTED_EMAIL>`;
- account display name replaced because it embeds the email;
- deployment/version author emails replaced;
- version author ID replaced;
- token-permission details omitted entirely because the identity parser does not use them;
- nine older items from each ten-item list omitted, retaining the exact active deployment and
  corresponding version needed for baseline/correlation proof.

Cloudflare account, deployment, and version IDs were retained because they are the provenance
identifiers this task exists to prove. No secrets are present.

## Actual JSON schema findings

### `whoami --json`

The real response contains `loggedIn`, `authType`, `email`, `accounts`, and `tokenPermissions`.
Each account has `id` and `name`. The existing strict identity parser accepts the redacted real
shape and proves exactly one expected account.

### `deployments list --json`

The real response is an array of ten deployment objects. Each object contains:

- `id` (deployment UUID)
- `source`
- `strategy`
- `author_email`
- `annotations`
- `versions`, containing `version_id` and numeric `percentage`
- `created_on` with fractional-second UTC precision

### `deployments status --json`

The real response is one deployment object with the same shape as an entry in the list. Its ID,
timestamp, and complete traffic distribution exactly equal the last active list entry.

### `versions list --json`

The real response is an array of ten objects containing:

- `id` (version UUID)
- numeric `number`
- `metadata` with `created_on`, `source`, `author_id`, `author_email`, and `has_preview`
- `annotations`

The parser-required `metadata.created_on` accepts Cloudflare's variable fractional-second
precision.

## Differences from synthetic assumptions

- Production deployment records contain `source`, `strategy`, author metadata, and annotations;
  the minimal synthetic fixtures omitted those optional fields.
- Production version records contain version number, richer metadata, and annotations.
- Production timestamps use more than millisecond precision, which the existing RFC3339 parser
  already handles.
- Neither production deployment list/status objects nor version objects contain Worker name or
  account ID fields.
- Therefore account/Worker identity must be proven outside deployment records by authenticated
  account selection plus the exact `--name shape-beacon` command context.

No parser code change was required. Validation was not loosened.

## Current production deployment baseline

- Worker: `shape-beacon`
- Account: `c8923ddc9f252b8b35696c5278e3855b`
- Active deployment ID: `92cc558d-835a-4028-af18-fc0552586242`
- Active version ID: `39d8cea2-49df-4282-9414-4f78519a44ae`
- Traffic: one version at `100%`
- Deployment created: `2026-09-04T02:49:33.703059Z`
- Version created: `2026-09-04T02:49:33.365614Z`
- Deployment source: `wrangler`
- Deployment strategy: `percentage`
- Status/list agreement: exact
- Active version present in versions list: yes, as version number 42

The current state satisfies the future release preflight requirement of one unambiguous active
deployment with one version at 100% traffic. The deployment ID is supplied by both deployment
commands. The version ID is supplied by the deployment traffic entry and `versions list`.

## Correlation-contract assessment

- A deterministic pre-deploy snapshot can be captured with `deployments list --json`.
- Every deployment supplies its deployment ID, creation timestamp, version ID(s), and traffic
  percentage(s).
- `deployments status --json` identifies the same active deployment and traffic structure.
- Deployment and version timestamps are sufficiently precise for the future bounded temporal
  correlation check.
- Account and Worker identity are not embedded in deployment records; the future implementation
  must bind the snapshot to the independently verified account and explicit command context.
- The existing correlation algorithm's core absent-before + exact-version + 100%-active + time +
  status-equality checks are compatible with the real response shapes.

This is baseline-shape proof only. No new deployment was simulated, and post-deploy correlation
remains unexecuted until a separately authorized real release.

## Parser and test changes

No production parser changes were necessary. Tests now prove:

- redacted production whoami, deployment-list, deployment-status, and versions fixtures parse;
- active list/status/version records agree exactly;
- production deployment records have no account/Worker identity fields;
- fixtures contain no obvious credential-bearing fields or unredacted email;
- existing malformed/ambiguous rejection tests still pass;
- synthetic fixtures remain valid;
- release tooling still contains no Wrangler deploy spawn and `--deploy` remains fail closed.

## Validation

- `npm ci`: passed
- `npm test`: 44 passed, 0 failed
- `npm run build:check`: passed
- `npm run release:check`: passed
- `npm run release:dry-run`: passed
- `git diff --check`: passed
- Wrangler remained pinned at `4.132.0`
- SDK build-producing inputs were unchanged; `dist` was not regenerated

## Proof of no mutation and no credential persistence

- No `wrangler deploy` command was run.
- No `wrangler rollback` command was run.
- No upload, publish, secret/config/route write, or other Cloudflare mutation occurred.
- Raw production responses and Wrangler logs remained only in an owner-only temporary directory
  during review and were deleted after redacted fixtures were created.
- No credential, token, token permission, OAuth material, or authorization header was copied into
  the repository.
- Hosted SDK content, Catcher, CI credentials, and `/home/anthony/on_shape` were untouched.

## Architecture reconciliation

The following can move to CURRENT:

- exact production Cloudflare account identity;
- authenticated Wrangler 4.132.0 whoami/deployment/status/version JSON shapes;
- redacted production fixture contract;
- parser compatibility with production responses;
- current production deployment/version/traffic baseline;
- external account/Worker command-context requirement for correlation.

The following remain TRANSITIONAL:

- mutating release execution is unimplemented and unauthorized;
- the newly generated local artifact is not deployed;
- post-deploy correlation has not been proven during a new release;
- hosted propagation/readback behavior and rollback behavior remain unproven;
- Catcher pinning and managed-customer deployment audit remain unresolved.

## Remaining blockers and next slice

The contract-shape blocker identified in the prior report is resolved. The next separately
authorized slice may review and implement the fail-closed `--deploy` path without executing it,
binding every authenticated snapshot to the proven account ID and explicit Worker command
context. Actual deployment must remain a later, separately authorized operator action.

MUTATING PATH READY FOR SEPARATE IMPLEMENTATION REVIEW: YES
