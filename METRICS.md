***

### 2. `METRICS.md`

```md
# ShapeEngine Interpretation Guide

This document explains the data schema output by ShapeEngine. Every successful session payload contains precise metadata, foundational kinematics, normalized metrics, and a probabilistic shape distribution.

All mathematical outputs are strictly clamped between `0.0000` and `1.0000` and capped at 4 decimal places for database uniformity.

---

## 1. Metadata
High-level context about the session environment.

* **`sessionDurationMs`**: Total time the user spent interacting with the page, measured in milliseconds.
* **`eventCount`**: The total number of raw browser events (mouse, touch, scroll, keys) recorded during the session.
* **`device`**: Automatically detected media type based on event signatures. Outputs: `'mobile'` (touch only), `'desktop'` (mouse only), `'hybrid'` (both), or `'unknown'`.

---

## 2. Foundations
The 7 objective, raw kinematic measurements extracted from the timeline. These act as the baseline ingredients for higher-level metrics.

* **`actionDensity`**: The frequency of events relative to time. (Max scaled at 20 events/sec).
* **`burstVariance`**: The standard deviation of time intervals between interactions. High variance indicates erratic clustering of events.
* **`idleFraction`**: The percentage of the total session spent inactive (pauses > 500ms).
* **`pathEfficiency`**: The straight-line distance between the first and last spatial event, divided by the total physical distance covered.
* **`velocityVolatility`**: The standard deviation of spatial movement speed. 
* **`directionalInflection`**: The ratio of sharp directional changes (>45 degrees) to total spatial events.
* **`modalitySwitching`**: How often the user switches input types (e.g., from scrolling to clicking to typing).

---

## 3. Metrics (Normalized)
The 4 core behavioral characteristics. Calculated via matrix multiplication of the Foundations against the active Tuning Configuration. 

* **`intensity`**: Overall behavioral activity. High scores indicate snappy, sustained, dense interaction. Low scores indicate sparse interaction with extended idle periods.
* **`rhythm`**: Temporal consistency. High scores indicate predictable, machine-like pacing. Low scores indicate erratic pauses, bursty behavior, or high volatility.
* **`exploration`**: Spatial curiosity. High scores indicate broad, screen-wide movement and scrolling. Low scores indicate localized, highly-targeted interaction.
* **`coherence`**: Behavioral intentionality. High scores indicate smooth, deliberate, and highly efficient pathing. Low scores indicate shaky, chaotic, or erratic movement.

---

## 4. Behavioral Shapes
A probabilistic distribution representing the user's overarching behavioral profile. Calculated via 4D Euclidean distance from the Metrics to ideal archetypes. 

**The sum of all shapes always equals `1.0000` (100%).**

* **`steady`**: Consistent, deliberate interaction with stable pacing and high coherence. Typically implies deep reading or focused task completion.
* **`burst`**: Short periods of intense activity separated by noticeable inactivity. Common in multi-tasking or hesitant navigation.
* **`drift`**: Broad spatial exploration with moderate/low intensity. Indicates browsing, window-shopping, or searching for inspiration without urgent intent.
* **`chaotic`**: Erratic movement, unstable pacing, frequent directional changes, and poor coherence. Often correlates with user frustration, broken UI, or panic.
* **`flat`**: Minimal interaction, limited movement, and prolonged inactivity. Indicates idle tabs or passive media consumption.
* **`ambient`**: Behavior that cannot be confidently classified into the above five categories due to conflicting or ambiguous traits. 
* **`undetermined`**: A system-level override. If a session fails the Gatekeeper requirements (<1s duration or <20 events), it bypasses all math and is forcefully scored as `1.0000` undetermined.