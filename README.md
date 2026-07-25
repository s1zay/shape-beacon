# shape-engine-sdk

**Filter out low-value traffic before running expensive analytics.**

[Live Interactive Demo](https://s1zay.github.io/shape-engine-sdk/)

ShapeEngine is a zero-dependency client-side SDK that calculates spatial and temporal behavioral metrics in the browser, replacing bloated event logs with deterministic math.


ShapeEngine is a zero-dependency client-side SDK that calculates spatial and temporal behavioral metrics in the browser, replacing bloated event logs with deterministic math.

### Why use ShapeEngine?

* **Shrink Payloads:** Store a single `< 1KB` fingerprint per session instead of megabytes of raw DOM events.
* **Skip the Replay:** Understand behavior without watching session recordings.
* **Slash Token Costs:** Run AI agents and LLMs on structured summaries instead of forcing models to parse raw telemetry.
* **Privacy by Default:** Keep raw coordinate data, clicks, and keystrokes out of your database entirely.


### How to use.

Initialize the engine with your Cloudflare Worker URL:

```html
<script src="shape-engine.js"></script>
<script>
    const engine = new ShapeEngine();
    engine.start();
    engine.initAutoSend('https://your-worker.your-domain.workers.dev', 'my-project');
</script>
```
### Example Output

Every session is reduced to a compact behavioral summary that is typically **under 1 KB**.

```json
{
  "id": "1ae75c38-0fdd-41fa-acc9-d9539d63d725",
  "project_id": "my-project",
  "url": "https://example.com",
  "timestamp": 1784907143900,
  "session_duration_ms": 5084,
  "event_count": 28,

  "engine_version": "4.0",
  "tune_version": "2.17",

  "metrics": {
    "intensity": 0.368,
    "rhythm": 0.302,
    "exploration": 0.573,
    "coherence": 0.704
  },

  "shapes": {
    "steady": 0.115,
    "burst": 0.145,
    "drift": 0.321,
    "chaotic": 0.106,
    "flat": 0.111,
    "undetermined": 0.203
  },

  "dominant_shape": "drift"
}
```
Instead of storing thousands of raw mouse movements, clicks, and DOM events, ShapeEngine stores a deterministic behavioral fingerprint that can be queried, filtered, aggregated, or fed directly into analytics and AI pipelines.
