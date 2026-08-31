# Shape Beacon

Privacy-first behavioral signals for the modern web.

**We don’t track users. We track shapes.**

Shape Beacon analyzes interaction patterns in the browser and emits compact behavioral summaries. It helps teams understand how a page is being experienced without storing or transmitting a raw interaction stream.

Shape Beacon is the hosted product and analytics service. **ShapeEngine** is the dependency-free browser SDK in this repository that performs the local analysis.

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

## Page and Cross-Page analytics

A **Page Session** describes one document lifecycle. A **Cross-Page / Domain Session** connects qualifying Page Sessions across same-tab navigation and is available as paid functionality according to plan entitlement. See the dashboard and current plan details for availability and pricing.

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

ShapeEngine normally sends when the page becomes hidden or unloads. Very active pages may also trigger cumulative autosaves. The SDK expects standard modern browser APIs including `addEventListener`, `performance`, Web Crypto, `sessionStorage`, `navigator.sendBeacon`, and `fetch` as a fallback.

## Development

This repository contains the distributable browser SDK and its public tests. It has no runtime dependencies. Run the tests with Node.js 18 or newer:

```sh
node tests/shape-engine.test.mjs
```

The distributable browser SDK is [dist/shape-engine-bundled.js](dist/shape-engine-bundled.js). `wrangler.jsonc` is a minimal static-asset configuration for hosting that bundle.

## License

[MIT](LICENSE)
