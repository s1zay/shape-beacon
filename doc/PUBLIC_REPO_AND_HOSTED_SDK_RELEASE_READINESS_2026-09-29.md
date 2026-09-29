# Public repository and hosted SDK release readiness — 2026-09-29

- **Authority:** `~/shape-beacon` for SDK source, build, distribution, and public documentation; this report records a bounded audit, not a new release.
- **Durability:** retain as dated release-readiness evidence until a later audit supersedes it.
- **Scope:** public repository, SDK 4.1.8 source/build/docs, current hosted bytes, and the SDK/Catcher boundary. No production mutation.
- **Production authority:** `~/on_shape` owns Catcher/Main and the production server contract. Its source was inspected read-only; hosted SDK and Cloudflare deployment status were read-only checks.
- **Repositories inspected:** `/home/anthony/shape-beacon` and bounded `/home/anthony/on_shape` files. `~/shape2` was not used as release authority.
- **Supersession status:** current for this audit's 2026-09-29 observations; supersedes older `shape-beacon/doc` reports only where they speak in present tense about the old monolithic source, absent build/release tooling, or an unpinned Wrangler. Their historical observations remain intact.

## 1. Executive result

**Overall SDK release readiness: PARTIAL.** Source, deterministic build, and hosted SDK bytes are current. The canonical URL and both other release-contract SDK URLs returned the exact committed 4.1.8 bundle. Public GitHub `main` matched the local HEAD during this audit. The remaining launch-facing gap is release identity: the latest published GitHub Release is `v4.1.0`, and no `v4.1.8` tag exists. Public documentation was clarified locally but is uncommitted and thus not yet on public `main`.

| Judgment | Result | Basis |
| --- | --- | --- |
| A. Public source readiness | **READY** | Canonical source, versions, 44 tests, release integrity check, reproducible artifact, and public `main` agree. |
| B. Public documentation readiness | **PARTIAL** | Low-risk README and historical-report corrections are local only; GitHub's latest published release still presents 4.1.0. |
| C. Hosted SDK readiness | **READY** | Fresh HTTP 200 canonical readback is byte-identical to committed `dist`; origin and compatibility URLs also match. |
| D. Overall SDK release readiness | **PARTIAL** | Formal public release metadata and the documentation changes require publication/review. No SDK byte upload is indicated. |

## 2. Repository state

| Item | Observed state |
| --- | --- |
| Branch and initial worktree | `main`; clean; local `origin/main` aligned. |
| Initial HEAD / fresh public GitHub `main` | `f41d973be8c02afdbd1a2b65f951e48a070aefcc` on both (fresh `git ls-remote`). |
| Recent commits | `f41d973` production Wrangler read contracts; `dc275ca` Wrangler proof; `d08520a` pinned entrypoint; `c48bded` pinned resolver; `9a0a861` regenerated artifact. |
| Existing tags | `v4.1.0`, `v4.0.0`; no `v4.1.8` tag in local history or fresh remote tag lookup. |
| Published GitHub Releases | Latest `v4.1.0` (2026-07-27); older `v4.0.0` (2026-07-26); GitHub Releases API read on 2026-09-29. |
| Package | `shape-beacon@0.0.0-private`, `private: true`; this is tooling metadata, not the SDK's public engine version. Node 22; Rollup 4.63.3; Wrangler 4.132.0 pinned. |
| Source/build/distribution | `src/` owns implementation; `scripts/build.mjs` generates tracked `dist/shape-engine-bundled.js` and JSON manifest; `scripts/release.mjs` validates and plans but cannot deploy. |
| CI | `.github/workflows/sdk-ci.yml` runs `npm ci`, tests, `build:check`, `release:check` on push and PR, with read-only repository permission and no publish step. Local checks passed; remote CI run status was not separately inspected. |
| Post-audit worktree | Documentation-only modifications plus this untracked report; no source, bundle, manifest, or release script changed. Nothing staged or committed. |

## 3. Version consistency

`src/version.js`, `src/tune.js`, bundle banner/runtime metadata, dist manifest, and version/provenance tests agree: **ShapeEngine 4.1.8 / Tune 2.17 / payload schema v3 / lifecycle semantics v3**. The bundle is 25,785 bytes and contains source commit `b039dc804f8ce71a4cd8c22f313b080c1355358b (clean)`. This differs from HEAD by design: release verification proves the source commit precedes artifact-only commit `9a0a861ef4adf1298a2eddaa350e333dfae6dd1e`, and no bundle-producing input changed afterward.

The package's private `0.0.0-private` version does not claim to be ShapeEngine 4.1.8. No active public README, source, examples directory, or tests describe 4.1.6 or lifecycle v2 as current. Catcher's v2 validator is a compatibility path, not the SDK's emitted schema. Dated documents contain older hashes/commit IDs as historical evidence; three with misleading present-tense claims gained supersession notes.

## 4. Public API/install documentation

The README's dashboard wizard remains the domain-specific installation source. The signup and dashboard links returned HTTP 200 on read-only HEAD requests. Main's current snippet source (`public/collection-installation.mjs`, `public/dashboard.js`) uses `https://engine.shapebeacon.com/shape-engine-bundled.js`, `window.ShapeEngine.init({ endpoint, apiKey })`, and the configured collection endpoint. The SDK's `init` accepts optional `projectId` (`default`), installs send handlers when an endpoint exists, and starts collection. The documented `start`, `stop`, `analyze`, `getResults`, `forceSend`, and legacy `initAutoSend` descriptions match source. No standalone `examples/` directory exists; the README and generated dashboard snippets are the install examples.

The README now includes the working direct snippet and explicitly distinguishes script URL from telemetry endpoint. Its `/_sb-metrics/` managed path and legacy `/metrics/` wording agree with current Main/OAuth generation. The script is a classic global instance at `window.ShapeEngine`; browser requirements and Pointer Events fallback are documented. The browser API key is accurately called a visible public write credential. Catcher checks key/account/domain and origin/referer admission server-side; the key alone does not authorize arbitrary sites.

## 5. Privacy/session/schema documentation

The README and `METRICS.md` match the summary-only v3 payload: raw coordinates/events remain transient in browser memory and may appear in local `getResults()`, but `forceSend()` removes `events`/`timeline` before network transport. Keyboard handlers record a generic event, not key values; content is not read. Emitted `url` is origin plus path with query and fragment removed, or only the scheme for opaque origins. This still reveals page paths, so the README now names that metadata and the Page/Domain IDs explicitly.

Page IDs are per document and roll at the two-hour Page analytical maximum. Domain IDs may persist in the same tab through `sessionStorage`, scoped by key/project/endpoint, with a fixed two-hour membership window; blocked storage falls back to document scope. Visibility/pagehide/unload/autosave reports remain incremental. A controlled `max_age` report alone is SDK-explicit final; Catcher can finalize inactive Pages by server receipt-time policy. `Undetermined` applies under 5,000 ms or under 20 events and has value 1 while the six Shape values are zero. Metrics, Shapes, duration, and event count descriptions agree with current source and Catcher validators.

## 6. Source/build verification

Before documentation edits, `npm run release:check` passed outside the sandbox: **44/44 SDK/release tests passed**, nested `npm run build:check` passed, and all provenance assertions passed. A first sandbox run failed at a read-only child-process spawn with `EPERM`; the same command passed when allowed to spawn, so that failure was environmental. `build:check` generated temporary output and compared both generated files byte-for-byte with committed `dist`; it did not rewrite `dist`.

| Artifact | Result |
| --- | --- |
| Bundle | `dist/shape-engine-bundled.js` |
| Manifest | `dist/shape-engine-bundled.manifest.json` |
| Size | 25,785 bytes |
| SHA-256 | `906b43a47ba887cc0a4468eec00e0dcc3c7d4949bc4ab7e482a885f4a7d45338` |
| Generated vs tracked | **MATCH** for bundle and manifest; source-state `clean`; Rollup 4.63.3. |

The initial tree was clean. The final tree has only intentional documentation/report edits. `release:check` requires a wholly clean worktree and therefore cannot be treated as a post-edit pass until these changes are reviewed and committed; no runtime/build inputs changed.

## 7. SDK/Catcher spot-check

Read-only inspection at `/home/anthony/on_shape` HEAD `6e5d391c3e0495682687594fe5830976e766c88a` found the bounded Catcher contract files unmodified in that worktree. `workers/catcher/wrangler.jsonc` sets `LIFECYCLE_V3_MODE=enforce` and routes `engine.shapebeacon.com/*`; Main production config points `COLLECTION_ENDPOINT` to `https://engine.shapebeacon.com/`. Catcher's GET proxy fetches the public Workers.dev SDK origin.

The SDK's `payloadSchema: 'v3'`, `lifecycle_semantics_version: 'v3'`, Page/Domain IDs and start times, sequence, finality/end reason/provenance, `eventCount`, `sessionDurationMs`, four metrics, six Shapes plus `undetermined`, engine/Tune versions, body `apiKey`, `projectId`, and sanitized `url` align with `workers/catcher/lifecycle-v3.mjs` and `workers/catcher/worker.js`. Catcher requires a controlled `max_age` final at exactly 7,200,000 ms and admits incremental reports before it. Catcher uses API key lookup and Origin/Referer policy, with raw interaction data outside the stored summary contract. No material v3 boundary drift from the prior cross-repo audit was found. This is source inspection, not a fresh production ingestion test.

## 8. Hosted SDK readback

Fresh read-only GETs on 2026-09-29 returned HTTP 200, `text/javascript`, and 25,785 bytes from all three release-contract URLs. The canonical `https://engine.shapebeacon.com/shape-engine-bundled.js` response had `cache-control: public, max-age=0, must-revalidate`, `cf-cache-status: HIT`, `access-control-allow-origin: *`, and ETag `"48fd9c18f0c725f9b2bb0799c1f835b0"`. Its banner and runtime metadata identify 4.1.8 / 2.17 / v3 / v3. SHA-256 and `cmp` both prove exact local/canonical byte identity; no transformation explanation is needed.

| URL | SHA-256 | Local match |
| --- | --- | --- |
| `engine.shapebeacon.com/shape-engine-bundled.js` | `906b43a47ba887cc0a4468eec00e0dcc3c7d4949bc4ab7e482a885f4a7d45338` | **MATCH** |
| `shape-beacon.anthonyyerhot.workers.dev/shape-engine-bundled.js` | same | **MATCH** |
| `engine.sizzlestats.com/shape-engine-bundled.js` | same | **MATCH** |

A read-only Wrangler status query of account `c8923ddc9f252b8b35696c5278e3855b`, Worker `shape-beacon`, reported one active 100% version `b51435c0-cffe-4850-9636-eaaebee5bdd4` in deployment `64e0d675-2396-4ab2-bcae-dbcbc47624ed` (created 2026-09-17). This supersedes the older 2026-09-04 deployment baseline recorded in the repository. The status API identifies active deployment, while HTTP readback establishes current content; neither response cryptographically binds that deployment ID to the bundle digest.

## 9. Public repository hygiene

The top level is small: README, metrics guide, license, package files, source, generated dist, scripts/tests, Wrangler config, and dated reports. No outdated screenshots or authoritative demo assets were found. Links checked in README were live; local README/metrics/license links exist. Tracked-file name and focused content scans found no credential files, private keys, live collection keys, or tokens. Redacted production Wrangler fixtures contain deployment/account identifiers but no credential-bearing fields; the test suite checks redaction. Local `.aws`, `.codex`, `.agents`, `.wrangler`, and `node_modules` directories are untracked/ignored or outside tracked content. This is a bounded hygiene check, not a comprehensive secret audit.

Older `doc/` reports could be mistaken for current architecture/release advice because they used present tense. Supersession notes now point readers to this report while preserving historical evidence. No public `examples/` folder or duplicate install guide creates a competing current snippet.

## 10. Release/provenance state

| Question | Judgment | Evidence |
| --- | --- | --- |
| SOURCE CURRENT? | **YES** | Public GitHub `main` and local HEAD match; 4.1.8 source metadata and tests agree. |
| BUILD CURRENT? | **YES** | Committed manifest hash, deterministic `build:check`, and release provenance verification pass. |
| PUBLIC DOCS CURRENT? | **PARTIAL** | Corrected locally; public `main` has not received these edits, and latest GitHub Release remains v4.1.0. |
| HOSTED ARTIFACT CURRENT? | **YES** | Fresh exact byte match on canonical, origin, and compatibility hosts. |
| RELEASE PROVENANCE COMPLETE? | **PARTIAL** | Source commit, artifact-only commit, manifest, digest, and hosted hash form a strong content chain. There is no v4.1.8 tag/Release or durable machine-readable record binding the observed Cloudflare deployment/version ID to that digest. |

“Current release” for actual browser delivery is the 4.1.8 / Tune 2.17 / v3 / v3 bundle with the SHA above. The latest GitHub Release label `v4.1.0` is older than delivered bytes and is a misleading public discovery surface. `package.json` is deliberately private tooling metadata. The absence of a v4.1.8 tag/release does not mean the hosted SDK is stale; it means formal public release identity is unfinished.

## 11. Findings by severity

| Severity | Finding | State |
| --- | --- | --- |
| P0 | None. Public script and basic install path work. | 0 open |
| P1 | GitHub Releases presents v4.1.0 as latest while `main` and hosted delivery are 4.1.8; a developer choosing the latest formal release gets the wrong release identity. | 1 open; tag/release prohibited by audit scope. |
| P2 | README lacked an explicit direct-install example, current engine/Tune/schema/lifecycle identity, and a clear statement that session IDs and origin/path are sent. | Corrected locally; publication pending. |
| P2 | Three dated reports used present-tense statements about absent build tooling, an unpinned Wrangler, or an uncaptured CLI contract. | Supersession notes added locally; publication pending. |
| P2 | Hosted hash and active deployment ID have no single durable machine-readable release attestation; no v4.1.8 Git tag exists. | Open; content verified independently. |
| P3 | None requiring action for this focused audit. | 0 |

**Counts:** P0 0, P1 1, P2 3. The tag absence and latest-Release mismatch are related aspects of the same release identity gap, counted once at P1 and once as a separate provenance limitation at P2.

## 12. Fixes made

- `README.md`: current version/manifest pointer, direct browser snippet, endpoint/key distinction, origin/referer constraint, and session/URL privacy detail.
- `doc/SDK_SOURCE_BUILD_HOST_PROVENANCE_REPORT.md`, `doc/SDK_PRODUCTION_RELEASE_EXECUTION_DESIGN.md`, and `doc/SDK_WRANGLER_CONTRACT_PROOF_REPORT.md`: prominent historical-boundary notes with links to current evidence.
- This report records current release evidence and the remaining public metadata gap.

Only local public-repository documentation changed. No source, dist, manifest, production Worker, DNS, hosted asset, tag, GitHub Release, staging area, or Git history was modified.

## 13. Tests/checks

- `npm run release:check`: PASS outside sandbox, including 44 tests and `build:check`; initial sandbox `EPERM` was a process-spawn limitation.
- Bundle SHA-256/size/manifest and byte comparison: PASS; all three hosted responses MATCH.
- Fresh GitHub `ls-remote` for `main` and `v4.1.8`: main matched; no v4.1.8 tag.
- Fresh GitHub Releases API: `v4.1.0` is latest.
- README signup/dashboard HEAD requests: HTTP 200.
- Read-only current Cloudflare SDK Worker deployment status: one version at 100%.
- `git --no-pager diff --check` and `git --no-pager diff`: reviewed after documentation edits and again after report creation.

## 14. Remaining uncertainties

The active Cloudflare deployment/version ID was read, but no deployment-specific attestation ties that ID to the artifact digest. HTTP proves the delivered bytes at the observed URLs and time only; it does not prove future cache state or every customer-managed first-party proxy. Remote CI run status and production telemetry ingestion were not retested. The corrected README/report content remains local until committed and pushed. No release tag or GitHub Release was created in this audit.

## 15. Exact release-readiness judgment

**A. PUBLIC SOURCE READINESS: READY. B. PUBLIC DOCUMENTATION READINESS: PARTIAL. C. HOSTED SDK READINESS: READY. D. OVERALL SDK RELEASE READINESS: PARTIAL.** The SDK 4.1.8 artifact needs no new build or upload on this evidence. Public release discovery still identifies v4.1.0, and the current documentation corrections are uncommitted.

## 16. Recommended next action

Review and commit/push the documentation-only changes, then separately authorize creation of a `v4.1.8` tag and GitHub Release that identifies artifact commit `9a0a861ef4adf1298a2eddaa350e333dfae6dd1e` and SHA-256 `906b43a47ba887cc0a4468eec00e0dcc3c7d4949bc4ab7e482a885f4a7d45338`. Record the observed deployment/version ID with a fresh hosted readback in durable release evidence. Re-run `release:check` on the clean reviewed tree. **Do not redeploy or overwrite the hosted SDK merely to close the GitHub release metadata gap.**
