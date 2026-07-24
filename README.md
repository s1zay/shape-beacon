# shape-engine-sdk

**Filter out low-value traffic before running expensive analytics.**

ShapeEngine is a zero-dependency client-side SDK that calculates spatial and temporal behavioral metrics in the browser, replacing bloated event logs with deterministic math.

### Why use ShapeEngine?

* **Shrink Payloads:** Store a single `< 1KB` fingerprint per session instead of megabytes of raw DOM events.
* **Skip the Video:** Query user behavior directly without wasting time watching session replays.
* **Slash Token Costs:** Run AI agents and LLMs on structured summaries instead of forcing models to parse raw telemetry.
* **Privacy by Default:** Keep raw coordinate data, clicks, and keystrokes out of your database entirely.


### How to use.

Initialize the engine with your Cloudflare Worker URL:

```html
<script src="shape-engine.js"></script>
<script>
    const engine = new ShapeEngine();
    engine.start();
    engine.initAutoSend('[https://your-worker.your-domain.workers.dev](https://your-worker.your-domain.workers.dev)', 'my-project');
</script>
