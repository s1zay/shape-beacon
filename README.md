# Shape Beacon

Privacy-first behavioral signals for the modern web.

**We don’t track users. We track shapes.**

Shape Beacon analyzes interaction patterns in the browser and emits compact behavioral summaries. It helps teams understand how a page is being experienced without storing or transmitting a raw interaction stream.

Shape Beacon is the hosted product and analytics service. **ShapeEngine** is the dependency-free browser SDK in this repository that performs the local analysis.

The working candidate is **ShapeEngine 4.2.0**, with **Tune 2.17**, **payload schema v3**, and **lifecycle semantics v3**. Version 4.2.0 replaces chunk-classified averages with continuous Page statistics. It is not published or deployed by this change. The generated candidate and provenance are recorded in [the build manifest](dist/shape-engine-bundled.manifest.json).

## What Shape Beacon measures

ShapeEngine turns interaction timing and movement into four normalized metrics:

- **Intensity** — overall behavioral activity
- **Rhythm** — temporal consistency
- **Exploration** — spatial breadth
- **Coherence** — movement consistency

It also produces a probabilistic distribution across six canonical behavioral shapes:

- **Steady**
- **Burst**
- **Drift**
- **Chaotic**
- **Flat**
- **Ambient**

**Undetermined** is a separate classification state, used when a Page Session is too short or contains too few events for a meaningful classification. See [METRICS.md](METRICS.md) for interpretation details.

Shape Beacon is behavioral-signal analytics, not conversion analytics. It does not provide funnels, attribution, heatmaps, user profiling, or traditional session replay.

## Privacy by design

Raw interaction events exist transiently in browser memory so ShapeEngine can calculate its summaries. Emitted telemetry contains compact metrics and shape scores plus limited session and delivery metadata.

That metadata includes a fresh Page Session ID for each document, a Domain Session ID that can continue across same-tab navigation for up to two hours, and the page URL's origin and path. The SDK does not create a persistent user ID.

- Raw pointer, touch, and click coordinates are not transmitted.
- Pressed keyboard values are neither retained nor transmitted; keyboard activity is represented only as generic activity.
- Page contents are not inspected or transmitted.
- Traditional session replay is not produced.
- Query strings and URL fragments are removed from emitted page URLs.

The local `getResults()` object may contain the current transient raw event buffer for local or demo use. Network payloads contain compact behavioral summaries and limited session/delivery metadata, not raw interaction events. Operators should separately evaluate the data handling of any configured receiver.

## Quick start

The dashboard-generated installation snippet is authoritative for your domain and plan:

1. [Create an account](https://shapebeacon.com/signup) or [sign in](https://shapebeacon.com/dashboard).
2. Register the domain where Shape Beacon will run.
3. Open that domain's integration wizard.
4. Copy the exact generated installation snippet.
5. Install it on the registered site.
6. Interact with the site, then open Analytics from the dashboard to verify that data arrives.

For managed first-party integrations, the current path is `/_sb-metrics/`. The legacy `/metrics/` path should not be used as the preferred modern integration. When the wizard offers a first-party proxy, use the path and configuration it generates.

The dashboard-generated snippet determines the exact script, endpoint, and configuration. The browser API key is a public write credential embedded in client-side code, not a server secret.

For a manual direct integration on a registered domain, the current browser API takes this form. Use the key issued for that domain by the dashboard; use the wizard's exact snippet when it specifies a different endpoint or a first-party proxy:

```html
<script src="https://engine.shapebeacon.com/shape-engine-bundled.js"></script>
<script>
  window.ShapeEngine.init({
    endpoint: 'https://engine.shapebeacon.com/',
    apiKey: 'YOUR_DOMAIN_API_KEY'
  });
</script>
```

The script URL serves the SDK; `endpoint` receives its summary reports. `projectId` is optional and defaults to `default`. Collection requires a valid domain-bound key and a site accepted by the receiver's origin/referer checks; copying the snippet to another site does not authorize that site.

## Page and Cross-Page analytics

A **Page Session** describes one document lifecycle. A **Cross-Page / Domain Session** connects qualifying Page Sessions across same-tab navigation and is available as paid functionality according to plan entitlement. See the dashboard and current plan details for availability and pricing.

**Historical Analytics is a separate aggregate-only view.** Its availability and represented dates depend on the domain’s data and entitlement. Older dates may predate expanded Historical facts and therefore expose fewer dimensions. Historical aggregates do not reconstruct individual sessions or journeys.

Account sign-in, domain verification, collection authorization, hosting-provider connection, plan entitlement, and Reader access are separate capabilities. A browser API key authorizes scoped collection; it does not authenticate an account or grant analytics read access. Use the dashboard-generated installation snippet and rely on the capabilities shown for the selected domain and plan.

Each document receives a new `page_session_id`. Same-tab navigation may reuse a `domain_session_id` through `sessionStorage`. A Domain Session has a fixed two-hour lifetime from its original creation:

- Navigation before expiry can reuse the Domain Session.
- Navigation before expiry does not extend the original two-hour window.
- A Page Session beginning at or after two hours receives a fresh `domain_session_id` and starts a new Domain Session window.
- If `sessionStorage` is blocked or unavailable, ShapeEngine safely falls back to a document-scoped Domain Session identity that cannot continue across navigation.

## ShapeEngine

The hosted browser bundle creates a single `window.ShapeEngine` instance.

- `init({ endpoint, projectId, apiKey })` applies configuration, installs lifecycle send handlers when an endpoint is present, and starts collection.
- `start()` begins collection if it is stopped.
- `stop()` stops collection without automatically analyzing or sending.
- `analyze()` updates the locally available summary from events collected so far.
- `getResults()` returns the most recently analyzed local result.
- `forceSend()` analyzes and sends immediately when an endpoint is configured; raw events are removed from the outgoing payload.
- `initAutoSend(workerUrl, projectId)` is a legacy compatibility wrapper. New integrations should use `init()`.

ShapeEngine emits lifecycle-v3 summaries. Visibility, page-hide, unload, and high-volume autosave reports are incremental and remain open for later updates. A Page Session sends at most 2,000 beacons: ordinary updates stop at sequence 1,999, preserving sequence 2,000 for the controlled `max_age` final report. At the two-hour Page analytical maximum, ShapeEngine emits that final report and starts a new Page lifecycle; the server may otherwise finalize an inactive Page by its authoritative receipt-time timeout. This is a protective report ceiling, not a browser event-collection stop. The SDK expects standard modern browser APIs including `addEventListener`, `performance`, Web Crypto, `sessionStorage`, `navigator.sendBeacon`, and `fetch` as a fallback.

Modern browsers use Pointer Events for pointing input; legacy mouse and touch listeners remain the fallback where Pointer Events are unavailable. Mouse pointers retain mouse/click semantics, while touch and pen pointers both normalize to the existing touch start/move events. The SDK does not retain pressure, tilt, contact geometry, element identity, or other rich pointer metadata.

## Development

The canonical SDK implementation is in `src/`:

- `version.js` is the single source for engine, Tune, payload-schema, and lifecycle-semantics versions.
- `tune.js` contains the default Tune configuration.
- `event-collector.js` owns browser input collection and normalization.
- `shape-engine.js` owns session lifecycle, analysis, payload construction, and transport.
- `browser-entry.js` installs the public `window.ShapeEngine` instance.

The SDK has no browser runtime dependencies. Development and CI use Node.js 22 and the exact Rollup version pinned by `package-lock.json`. Install the toolchain and build the distributable with:

```sh
npm ci
npm run build
```

`dist/shape-engine-bundled.js` and its JSON manifest are generated and committed release artifacts. Do not edit them directly. A build banner and manifest record the source commit, clean/dirty source state, centralized versions, pinned bundler version, and artifact SHA-256. The metadata contains no wall-clock value, so repeated builds from the same repository state are deterministic.

Verify that a temporary build is byte-identical to the committed artifacts without changing tracked files:

```sh
npm run build:check
```

Run all behavioral and build-provenance tests with:

```sh
npm test
```

`wrangler.jsonc` is a minimal static-asset configuration for hosting the generated bundle. Building and deployment are separate operations: none of the build or test commands deploys, publishes, or modifies a hosted SDK.

Before a separately authorized manual release, validate the clean repository, committed artifact provenance, tests, and deterministic build:

```sh
npm run release:check
npm run release:dry-run
```

The dry-run prints a machine-readable release plan and evidence template marked `deployed: false`. It does not invoke Wrangler, contact Cloudflare, require production credentials, write evidence, or change local/generated files. Deployment is intentionally not implemented by the release script.

## License

[MIT](LICENSE)
