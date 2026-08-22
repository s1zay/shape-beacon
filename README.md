### Why use Shape Engine?  
[DEMO](https://s1zay.github.io/demo/)

* **Shrink Payloads:** Store a single `< 1 KB` behavioral fingerprint per session instead of megabytes of raw browser events.
* **Filter the Noise:** Automatically classifies sessions under **1,000 ms** or **20 events** as **Undetermined**, keeping low-value traffic separate from meaningful behavioral analytics.
* **Zero Runtime Overhead:** Collects interactions passively and performs analysis only when the page is hidden or unloaded, transmitting a compact fingerprint via `navigator.sendBeacon()`.
* **Automatic Input Detection:** Identifies **Desktop**, **Mobile**, or **Hybrid** sessions using observed mouse and touch interactions.
* **Skip the Replay:** Understand behavioral patterns without watching time-consuming session recordings.
* **Reduce AI Costs:** Feed compact behavioral summaries to AI agents and LLMs instead of forcing them to parse raw telemetry.
* **Privacy by Design:** Store deterministic behavioral summaries instead of raw coordinates, clicks, and keystrokes.

### Page and Domain Session identity

Each document lifecycle receives one `page_session_id`. It remains stable across
visibility changes and every transmission, including the 50,000-event autosave.
Each transmission increments `beacon_sequence` so receivers can reject stale or
duplicate payloads.

`domain_session_id` is stored in `sessionStorage` under a key namespaced to the
configured API key, project, and endpoint. Conventional same-tab navigations
therefore share a Domain Session while each new document gets a new Page Session.
If `sessionStorage` is blocked or unavailable, the SDK safely falls back to a
document-scoped Domain Session; in that case it cannot stitch across navigation.

The SDK retains at most 10,000 raw events, five chunk summaries, and one cumulative
summary. After each 50,000-event autosave, completed chunks are folded into the
cumulative weighted summary and released. Counts, duration, metrics, and shapes in
later payloads continue to describe the full Page Session.

Generic SPA route detection remains intentionally unsupported. A full document
navigation starts a new Page Session; `pushState`, `replaceState`, `popstate`, and
hash-only route changes do not currently create one.

Run the dependency-free SDK tests with:

```sh
node tests/sdk-phase4.test.mjs
```

To also validate emitted payloads against a local `on_shape` Catcher checkout:

```sh
ON_SHAPE_ROOT=/path/to/on_shape node tests/sdk-phase4.test.mjs
```
