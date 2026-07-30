### Why use ShapeEngine?

* **Shrink Payloads:** Store a single `< 1 KB` behavioral fingerprint per session instead of megabytes of raw browser events.
* **Filter the Noise:** Automatically classifies sessions under **1,000 ms** or **20 events** as **Undetermined**, keeping low-value traffic separate from meaningful behavioral analytics.
* **Zero Runtime Overhead:** Collects interactions passively and performs analysis only when the page is hidden or unloaded, transmitting a compact fingerprint via `navigator.sendBeacon()`.
* **Automatic Input Detection:** Identifies **Desktop**, **Mobile**, or **Hybrid** sessions using observed mouse and touch interactions—without user-agent parsing or external libraries.
* **Skip the Replay:** Understand behavioral patterns without watching time-consuming session recordings.
* **Reduce AI Costs:** Feed compact behavioral summaries to AI agents and LLMs instead of forcing them to parse raw telemetry.
* **Privacy by Design:** Store deterministic behavioral summaries instead of raw coordinates, clicks, and keystrokes.