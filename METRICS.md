# ShapeEngine Interpretation Guide

ShapeEngine converts transient browser interaction events into session metadata, normalized metrics, and a probabilistic shape distribution. Foundational kinematics are intermediate calculations used to derive the emitted metrics; they are not fields in the network payload.

Normalized mathematical outputs are clamped between `0.0000` and `1.0000` and rounded to at most four decimal places.

## 1. Emitted metadata

- **`sessionDurationMs`**: Total elapsed time for the Page Session, in milliseconds.
- **`eventCount`**: Number of browser interaction events summarized for the Page Session.
- **`device`**: Input category inferred from canonical events: `mobile` (touch or pen normalized as touch), `desktop` (mouse only), `hybrid` (both), or `unknown`.

The payload also includes schema, SDK/tune version, sanitized page URL, timestamp, project/public write key, Page Session ID, Domain Session ID, and beacon sequence fields. See the README's privacy and session sections for details.

## 2. Internal foundations

These seven kinematic measurements are calculated locally as ingredients for the higher-level metrics. They are not transmitted as standalone payload fields.

- **`actionDensity`**: Frequency of events relative to time, scaled at 20 events per second.
- **`burstVariance`**: Standard deviation of time intervals between interactions. High variance indicates erratic clustering of events.
- **`idleFraction`**: Fraction of the measured timeline spent inactive, using pauses longer than 500 ms.
- **`pathEfficiency`**: Straight-line distance between the first and last spatial event divided by total distance covered.
- **`velocityVolatility`**: Standard deviation of spatial movement speed.
- **`directionalInflection`**: Ratio of sharp directional changes (greater than 45 degrees) to spatial events.
- **`modalitySwitching`**: Frequency of switching between interaction types, such as scrolling, clicking, and generic keyboard activity.

## 3. Emitted metrics

The four normalized behavioral characteristics are calculated from the internal foundations using the bundled tuning configuration.

- **`intensity`**: Overall behavioral activity. High scores indicate dense, sustained interaction; low scores indicate sparse interaction or extended pauses.
- **`rhythm`**: Temporal consistency. High scores indicate consistent pacing; low scores indicate bursty timing, pauses, or high volatility.
- **`exploration`**: Spatial breadth. High scores indicate broad movement and scrolling; low scores indicate localized interaction.
- **`coherence`**: Movement consistency. High scores indicate smoother, more efficient paths; low scores indicate frequent directional changes or volatility.

These scores describe interaction patterns, not a user's intent or identity.

## 4. Behavioral shapes

ShapeEngine compares the four metrics with tuned archetypes and emits a probabilistic distribution. Shape values approximately sum to `1.0000`; independent four-decimal rounding can produce a small difference.

- **`steady`**: Consistent interaction with stable pacing and relatively high coherence.
- **`burst`**: Periods of activity separated by noticeable inactivity.
- **`drift`**: Broad spatial exploration with moderate or low intensity.
- **`chaotic`**: Volatile pacing and movement with frequent directional changes.
- **`flat`**: Minimal interaction, limited movement, or prolonged inactivity.
- **`ambient`**: A low-confidence or transitional blend that does not closely match the other five calculated archetypes.

## 5. Undetermined classification

`undetermined` is a classification state, not a behavioral shape. It is a system-level override that bypasses normal shape classification when the current Page Session is shorter than 5,000 ms or contains fewer than 20 events. In the SDK payload, this state is represented as `undetermined: 1.0000` while the six behavioral shape values are zero; it is not part of the probabilistic six-shape distribution.
