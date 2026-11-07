/**
 * GENERATED FILE — DO NOT EDIT DIRECTLY.
 * Regenerate with: npm run build
 * ShapeEngine SDK v4.2.0 (Bundled with Tune v2.17)
 * Payload schema v3; lifecycle semantics v3
 * Source commit 8c96bccdba4dbea4de339bb8fef43304581499f7 (clean)
 */
const SDK_METADATA = Object.freeze({
    engineVersion: '4.2.0',
    tuneVersion: '2.17',
    payloadSchema: 'v3',
    lifecycleSemanticsVersion: 'v3'
});

const ENGINE_VERSION = SDK_METADATA.engineVersion;
const TUNE_VERSION = SDK_METADATA.tuneVersion;
const PAYLOAD_SCHEMA = SDK_METADATA.payloadSchema;
const LIFECYCLE_SEMANTICS_VERSION = SDK_METADATA.lifecycleSemanticsVersion;

const DEFAULT_TUNE = {
  "version": TUNE_VERSION,
  "metrics": {
    "intensity": {
      "base": 0.0,
      "weights": {
        "actionDensity": 0.77,
        "burstVariance": 0.1,
        "idleFraction": 0.0,
        "pathEfficiency": 0.0,
        "velocityVolatility": 0.0,
        "directionalInflection": 0.0,
        "modalitySwitching": 0.0
      }
    },
    "rhythm": {
      "base": 1.0,
      "weights": {
        "actionDensity": 0.0,
        "burstVariance": -0.6,
        "idleFraction": 0.0,
        "pathEfficiency": 0.0,
        "velocityVolatility": -0.7,
        "directionalInflection": -0.2,
        "modalitySwitching": 0.0
      }
    },
    "exploration": {
      "base": 0.4,
      "weights": {
        "actionDensity": 0.1,
        "burstVariance": 0.0,
        "idleFraction": 0.2,
        "pathEfficiency": -0.31,
        "velocityVolatility": 0.2,
        "directionalInflection": 0.1,
        "modalitySwitching": 0.0
      }
    },
    "coherence": {
      "base": 1.0,
      "weights": {
        "actionDensity": 0.0,
        "burstVariance": 0.0,
        "idleFraction": 0.0,
        "pathEfficiency": -0.2,
        "velocityVolatility": -0.74,
        "directionalInflection": -0.83,
        "modalitySwitching": 0.0
      }
    }
  },
  "shapes": {
    "steady": [0.4, 0.8, 0.3, 0.7],
    "burst": [0.8, 0.3, 0.5, 0.6],
    "drift": [0.3, 0.4, 0.7, 0.6],
    "chaotic": [0.7, 0.3, 0.7, 0.2],
    "flat": [0.1, 0.1, 0.1, 0.6],
    "ambient": [0.5, 0.5, 0.5, 0.5]
  }
};

// Local, fixed-size sufficient statistics. No raw event arrays or network fields.
// Welford updates retain variance without retaining intervals or velocities.
class PageAccumulator {
    constructor() {
        Object.assign(this, { eventCount: 0, touch: false, mouse: 0, clicks: 0,
            firstTs: 0, lastTs: 0, lastType: null, idle: 0, switches: 0,
            intervals: 0, intervalMean: 0, intervalM2: 0,
            velocities: 0, velocityMean: 0, velocityM2: 0,
            spatial: 0, firstX: null, firstY: null, lastX: null, lastY: null,
            distance: 0, angle: null, inflections: 0 });
    }
    clone() { return Object.assign(new PageAccumulator(), this); }
    add(events) {
        for (const ev of events) {
            if (ev.type === 'touch_start' || ev.type === 'touch_move') this.touch = true;
            else if (ev.type === 'mouse') this.mouse++;
            else if (ev.type === 'click') this.clicks++;
            if (this.eventCount === 0) this.firstTs = ev.ts;
            else {
                const dt = ev.ts - this.lastTs;
                if (dt > 0) {
                    this.intervals++;
                    const delta = dt - this.intervalMean;
                    this.intervalMean += delta / this.intervals;
                    this.intervalM2 += delta * (dt - this.intervalMean);
                }
                if (dt > 500) this.idle += dt;
                if (ev.type !== this.lastType) this.switches++;
                // Preserve the existing batch analyzer's spatial convention: its
                // loop begins at event index 1. Do not change the tune here.
                if (ev.x != null && ev.y != null) {
                    this.spatial++;
                    if (this.firstX === null) { this.firstX = ev.x; this.firstY = ev.y; }
                    if (this.lastX !== null) {
                        const dx = ev.x - this.lastX, dy = ev.y - this.lastY;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        this.distance += distance;
                        if (dt > 0) {
                            const velocity = distance / dt;
                            this.velocities++;
                            const delta = velocity - this.velocityMean;
                            this.velocityMean += delta / this.velocities;
                            this.velocityM2 += delta * (velocity - this.velocityMean);
                        }
                        const angle = Math.atan2(dy, dx);
                        if (this.angle !== null) {
                            let difference = Math.abs(angle - this.angle);
                            if (difference > Math.PI) difference = 2 * Math.PI - difference;
                            if (difference > Math.PI / 4) this.inflections++;
                        }
                        this.angle = angle;
                    }
                    this.lastX = ev.x; this.lastY = ev.y;
                }
            }
            this.eventCount++; this.lastTs = ev.ts; this.lastType = ev.type;
        }
        return this;
    }
    get device() {
        return this.touch ? (this.mouse > this.clicks ? 'hybrid' : 'mobile')
            : this.mouse || this.clicks ? 'desktop' : 'unknown';
    }
    foundations(clamp) {
        const f = { actionDensity: 0, burstVariance: 0, idleFraction: 0, pathEfficiency: 0,
            velocityVolatility: 0, directionalInflection: 0, modalitySwitching: 0 };
        const duration = this.lastTs - this.firstTs;
        if (this.eventCount < 2 || duration === 0) return f;
        f.actionDensity = clamp(this.eventCount / (duration / 1000) / 20);
        if (this.intervals) f.burstVariance = clamp(Math.sqrt(Math.max(0, this.intervalM2 / this.intervals)) / 500);
        f.idleFraction = clamp(this.idle / duration);
        if (this.distance > 0) f.pathEfficiency = clamp(Math.hypot(this.lastX - this.firstX, this.lastY - this.firstY) / this.distance);
        if (this.velocities) f.velocityVolatility = clamp(Math.sqrt(Math.max(0, this.velocityM2 / this.velocities)) / 5);
        if (this.spatial > 2) f.directionalInflection = clamp(this.inflections / this.spatial);
        f.modalitySwitching = clamp(this.switches / this.eventCount);
        return f;
    }
}

class EventCollector {
    constructor(onLimitReached) {
        this.events = [];
        this.isListening = false;
        this.onLimitReached = onLimitReached;
        this.usesPointerEvents = false;
        this._handlePointer = this._handlePointer.bind(this);
        this._handleMouse = this._handleMouse.bind(this);
        this._handleClick = this._handleClick.bind(this);
        this._handleScroll = this._handleScroll.bind(this);
        this._handleKey = this._handleKey.bind(this);
        this._handleTouch = this._handleTouch.bind(this);
    }
    start() {
        if (this.isListening) return;
        this.isListening = true;
        const opts = { passive: true, capture: true };
        this.usesPointerEvents = 'PointerEvent' in window;
        if (this.usesPointerEvents) {
            window.addEventListener('pointermove', this._handlePointer, opts);
            window.addEventListener('pointerdown', this._handlePointer, opts);
        } else {
            window.addEventListener('mousemove', this._handleMouse, opts);
            window.addEventListener('mousedown', this._handleClick, opts);
            window.addEventListener('touchstart', this._handleTouch, opts);
            window.addEventListener('touchmove', this._handleTouch, opts);
        }
        window.addEventListener('scroll', this._handleScroll, opts);
        window.addEventListener('keydown', this._handleKey, opts);
    }
    stop() {
        if (!this.isListening) return;
        this.isListening = false;
        const opts = { capture: true };
        if (this.usesPointerEvents) {
            window.removeEventListener('pointermove', this._handlePointer, opts);
            window.removeEventListener('pointerdown', this._handlePointer, opts);
        } else {
            window.removeEventListener('mousemove', this._handleMouse, opts);
            window.removeEventListener('mousedown', this._handleClick, opts);
            window.removeEventListener('touchstart', this._handleTouch, opts);
            window.removeEventListener('touchmove', this._handleTouch, opts);
        }
        window.removeEventListener('scroll', this._handleScroll, opts);
        window.removeEventListener('keydown', this._handleKey, opts);
    }
    reset() {
        this.events = [];
    }
    getRawEvents() {
        return this.events;
    }
    _pushEvent(type, data) {
        this.events.push({ type, ts: performance.now(), ...data });
        // Trigger Chunking Protocol at exactly 10,000 events
        if (this.events.length === 10000 && this.onLimitReached) {
            this.onLimitReached();
        }
    }
    _handleMouse(e) { this._pushEvent('mouse', { x: e.clientX, y: e.clientY }); }
    _handleClick(e) { this._pushEvent('click', { x: e.clientX, y: e.clientY }); }
    _handlePointer(e) {
        const isDown = e.type === 'pointerdown';
        if (e.pointerType === 'mouse') {
            this._pushEvent(isDown ? 'click' : 'mouse', { x: e.clientX, y: e.clientY });
        } else if (e.pointerType === 'touch' || e.pointerType === 'pen') {
            this._pushEvent(isDown ? 'touch_start' : 'touch_move', { x: e.clientX, y: e.clientY });
        }
    }
    // Keyboard activity contributes to timing and modality metrics, but the
    // pressed key is deliberately never retained.
    _handleKey()    { this._pushEvent('key', {}); }
    _handleTouch(e) {
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            const type = e.type === 'touchstart' ? 'touch_start' : 'touch_move';
            this._pushEvent(type, { x: touch.clientX, y: touch.clientY });
        }
    }
    _handleScroll(e) {
        const target = e.target === document ? window : e.target;
        const scrollY = target.scrollY !== undefined ? target.scrollY : target.scrollTop;
        this._pushEvent('scroll', { y: scrollY });
    }
}

const MIN_ENGAGED_DURATION_MS = 5000;
const MIN_ENGAGED_EVENT_COUNT = 20;
const DOMAIN_SESSION_LIFETIME_MS = 2 * 60 * 60 * 1000;
const PAGE_SESSION_ANALYTICAL_MAX_MS = 2 * 60 * 60 * 1000;
const MAX_BEACONS_PER_PAGE_SESSION = 2000;

const isUndeterminedEngagement = (durationMs, eventCount) =>
    durationMs < MIN_ENGAGED_DURATION_MS || eventCount < MIN_ENGAGED_EVENT_COUNT;

class ShapeEngine {
    constructor(tuneConfig = null) {
        this.version = ENGINE_VERSION;
        this.tune = tuneConfig || DEFAULT_TUNE;
        this.collector = new EventCollector(() => this._handleChunkLimit());

        this.pageSessionStart = Date.now();
        this.pageSessionId = this._generateId();
        this.domainSessionId = null;
        this.domainSessionStart = null;
        this.pageStartProvenance = 'initial_document';
        this.beaconSequence = 0;
        this.pageAccumulator = new PageAccumulator();
        this.completedChunks = 0;

        this.config = { endpoint: null, projectId: 'default', apiKey: null };
        this._hasSetupTriggers = false;
        this._hasSent = false;
        this._pageMaxAgeTimer = null;
        this.state = { status: 'offline', results: { timeline: [], foundations: {}, metrics: {}, shapes: {}, device: 'unknown' } };
    }

    _generateId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    _domainSessionStorageKey() {
        const parts = [this.config.apiKey, this.config.projectId, this.config.endpoint]
            .map(value => encodeURIComponent(value || ''));
        return `shape_beacon:domain_session:v1:${parts.join(':')}`;
    }

    _getOrCreateDomainSession() {
        const fallbackId = this._generateId();
        const now = Date.now();
        try {
            const key = this._domainSessionStorageKey();
            const existingId = window.sessionStorage.getItem(key);
            if (existingId) {
                try {
                    const stored = JSON.parse(existingId);
                    if (stored && typeof stored.id === 'string' && stored.id &&
                        Number.isFinite(stored.startedAt) &&
                        now < stored.startedAt + DOMAIN_SESSION_LIFETIME_MS) {
                        return { id: stored.id, startedAt: stored.startedAt };
                    }
                } catch (_) {
                    // Legacy raw IDs and malformed values rotate safely.
                }
            }

            const next = { id: fallbackId, startedAt: this.pageSessionStart };
            window.sessionStorage.setItem(key, JSON.stringify(next));
            return next;
        } catch (_) {
            // Storage may be unavailable because of browser policy. The fallback
            // remains stable for this document, but cannot survive navigation.
            return { id: fallbackId, startedAt: this.pageSessionStart };
        }
    }

    _schedulePageMaxAge() {
        if (this._pageMaxAgeTimer !== null) clearTimeout(this._pageMaxAgeTimer);
        const remaining = Math.max(0,
            this.pageSessionStart + PAGE_SESSION_ANALYTICAL_MAX_MS - Date.now());
        this._pageMaxAgeTimer = setTimeout(() => {
            this._pageMaxAgeTimer = null;
            this.forceSend();
        }, remaining);
    }

    _rolloverPageSession() {
        this.collector.reset();
        this.pageSessionStart = Date.now();
        this.pageSessionId = this._generateId();
        const domainSession = this._getOrCreateDomainSession();
        this.domainSessionId = domainSession.id;
        this.domainSessionStart = domainSession.startedAt;
        this.pageStartProvenance = 'max_age_rollover_started';
        this.beaconSequence = 0;
        this.pageAccumulator = new PageAccumulator();
        this.completedChunks = 0;
        this._hasSent = false;
        this.state.results = { timeline: [], foundations: {}, metrics: {}, shapes: {}, device: 'unknown' };
        this._schedulePageMaxAge();
    }

    init(config = {}) {
        if (config.endpoint) this.config.endpoint = config.endpoint;
        if (config.projectId) this.config.projectId = config.projectId;
        if (config.apiKey) this.config.apiKey = config.apiKey;

        if (!this.domainSessionId) {
            const domainSession = this._getOrCreateDomainSession();
            this.domainSessionId = domainSession.id;
            this.domainSessionStart = domainSession.startedAt;
            this._schedulePageMaxAge();
        }

        // Bind exit triggers strictly once
        if (this.config.endpoint && !this._hasSetupTriggers) {
            const handleVisibilityChange = (event) => {
                const isHiding = document.visibilityState === 'hidden' || event.type === 'pagehide' || event.type === 'beforeunload';
                const isShowing = document.visibilityState === 'visible' || event.type === 'pageshow';

                if (isHiding) {
                    if (this._hasSent) return;
                    this._hasSent = true;
                    this.forceSend();
                } else if (isShowing) {
                    // Unlock the beacon so it can fire again if the user returns to the tab (Resists BFCache locks)
                    this._hasSent = false;
                }
            };
            document.addEventListener('visibilitychange', handleVisibilityChange);
            window.addEventListener('pagehide', handleVisibilityChange);
            window.addEventListener('pageshow', handleVisibilityChange);
            window.addEventListener('beforeunload', handleVisibilityChange);
            this._hasSetupTriggers = true;
        }

        // Start collection immediately to maintain the linear lifecycle
        this.start();
    }

    // Legacy wrapper to ensure existing demo UI does not break
    initAutoSend(workerUrl, projectId = 'default') {
        this.init({ endpoint: workerUrl, projectId: projectId });
    }

    start() {
        if (this.state.status === 'running') return;
        this.collector.start();
        this.state.status = 'running';
    }

    stop() {
        if (this.state.status === 'offline') return;
        this.collector.stop();
        this.state.status = 'offline';
    }

    _handleChunkLimit() {
        this.pageAccumulator.add(this.collector.getRawEvents());
        this.collector.reset();
        // Release the local demo snapshot too; no old raw chunk survives a flush.
        if (this.state.results.events) this.state.results.events = [];
        this.completedChunks++;
        if (this.completedChunks % 5 === 0) this.forceSend();
    }

    _summarize(accumulator, durationMs) {
        const undetermined = isUndeterminedEngagement(durationMs, accumulator.eventCount);
        const metrics = undetermined
            ? { intensity: 0, rhythm: 0, exploration: 0, coherence: 0 }
            : this._calculateMetrics(accumulator.foundations(value => this._clamp(value)));
        return {
            eventCount: accumulator.eventCount, sessionDurationMs: durationMs,
            device: accumulator.device, metrics,
            shapes: undetermined
                ? { steady: 0, burst: 0, drift: 0, chaotic: 0, flat: 0, ambient: 0, undetermined: 1 }
                : this._calculateShapes(metrics)
        };
    }

    _analyzeBuffer(rawEvents, durationMs) {
        return this._summarize(new PageAccumulator().add(this._buildTimeline(rawEvents)), durationMs);
    }

    analyze() {
        const rawEvents = this.collector.getRawEvents();
        // Reporting is a snapshot: never commit the active buffer twice.
        const snapshot = this.pageAccumulator.clone().add(rawEvents);
        const summary = this._summarize(snapshot, Date.now() - this.pageSessionStart);
        this.state.results = {
            engineVersion: this.version, tuneVersion: this.tune.version,
            ...summary,
            events: [...rawEvents] // Existing local demo API; stripped before transmission.
        };
    }

    getResults() { return this.state.results; }

    _getPageUrl() {
        try {
            const parsed = new URL(window.location.href);
            if (parsed.origin !== 'null') return `${parsed.origin}${parsed.pathname}`;

            // Opaque origins (for example data:, file:, and about:) have no
            // trustworthy origin/path split. Emit only the scheme so embedded
            // content or local paths cannot become telemetry.
            return parsed.protocol;
        } catch (_) {
            // A Location href should be a valid URL, but avoid breaking beacon
            // delivery or leaking an unparseable value in browser-like environments.
            return '';
        }
    }

    forceSend() {
        if (!this.config.endpoint) return false;

        const isMaxAgeFinal = Date.now() - this.pageSessionStart >= PAGE_SESSION_ANALYTICAL_MAX_MS;

        // Preserve one final sequence number for the controlled max-age report.
        // Ordinary updates stop at 1,999; the final report may use sequence 2,000.
        if (!isMaxAgeFinal && this.beaconSequence >= MAX_BEACONS_PER_PAGE_SESSION - 1) return false;
        if (this.beaconSequence >= MAX_BEACONS_PER_PAGE_SESSION) return false;

        this.analyze();

        // FIX: Deep clone the results so we don't accidentally mutate local UI state
        const data = { ...this.getResults() };

        // Keep the transmitted payload to summary data only.
        delete data.events;
        delete data.timeline;

        this.beaconSequence += 1;

        const payload = JSON.stringify({
            payloadSchema: PAYLOAD_SCHEMA,
            lifecycle_semantics_version: LIFECYCLE_SEMANTICS_VERSION,
            page_session_id: this.pageSessionId,
            domain_session_id: this.domainSessionId,
            page_session_started_at: this.pageSessionStart,
            domain_session_started_at: this.domainSessionStart,
            beacon_sequence: this.beaconSequence,
            page_session_final: isMaxAgeFinal,
            page_session_end_reason: isMaxAgeFinal ? 'max_age' : null,
            page_start_provenance: this.pageStartProvenance,
            projectId: this.config.projectId,
            apiKey: this.config.apiKey,
            url: this._getPageUrl(),
            timestamp: new Date().toISOString(),
            ...data,
            ...(isMaxAgeFinal ? { sessionDurationMs: PAGE_SESSION_ANALYTICAL_MAX_MS } : {})
        }, null, 2);

        const success = navigator.sendBeacon(this.config.endpoint, payload);
        if (!success) {
            fetch(this.config.endpoint, { method: 'POST', body: payload, keepalive: true }).catch(e => console.error(e));
        }
        if (isMaxAgeFinal) this._rolloverPageSession();
        return isMaxAgeFinal;
    }

    _buildTimeline(events) { return events.map(ev => ({ ts: ev.ts, type: ev.type, x: ev.x !== undefined ? ev.x : null, y: ev.y !== undefined ? ev.y : null })).sort((a, b) => a.ts - b.ts); }
    _calculateFoundations(timeline) {
        const f = { actionDensity: 0, burstVariance: 0, idleFraction: 0, pathEfficiency: 0, velocityVolatility: 0, directionalInflection: 0, modalitySwitching: 0 };
        if (timeline.length < 2) return f;
        const totalTime = timeline[timeline.length - 1].ts - timeline[0].ts;
        if (totalTime === 0) return f;
        let idleTime = 0, spatialEvents = 0, totalDist = 0, inflectionCount = 0, switchCount = 0, startSpatial = null, endSpatial = null, lastSpatial = null, lastAngle = null;
        const intervals = [], velocities = [];
        for (let i = 1; i < timeline.length; i++) {
            const ev = timeline[i], prev = timeline[i - 1], dt = ev.ts - prev.ts;
            if (dt > 0) intervals.push(dt);
            if (dt > 500) idleTime += dt;
            if (ev.type !== prev.type) switchCount++;
            if (ev.x !== null && ev.y !== null) {
                spatialEvents++;
                if (!startSpatial) startSpatial = ev;
                endSpatial = ev;
                if (lastSpatial) {
                    const dx = ev.x - lastSpatial.x, dy = ev.y - lastSpatial.y, dist = Math.sqrt(dx * dx + dy * dy);
                    totalDist += dist;
                    if (dt > 0) velocities.push(dist / dt);
                    const angle = Math.atan2(dy, dx);
                    if (lastAngle !== null) {
                        let angleDiff = Math.abs(angle - lastAngle);
                        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
                        if (angleDiff > (Math.PI / 4)) inflectionCount++;
                    }
                    lastAngle = angle;
                }
                lastSpatial = ev;
            }
        }
        const eps = timeline.length / (totalTime / 1000);
        f.actionDensity = this._clamp(eps / 20);
        if (intervals.length > 0) {
            const avgInt = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const varInt = intervals.reduce((a, b) => a + Math.pow(b - avgInt, 2), 0) / intervals.length;
            f.burstVariance = this._clamp(Math.sqrt(varInt) / 500);
        }
        f.idleFraction = this._clamp(idleTime / totalTime);
        if (startSpatial && endSpatial && totalDist > 0) {
            const dx = endSpatial.x - startSpatial.x, dy = endSpatial.y - startSpatial.y;
            f.pathEfficiency = this._clamp(Math.sqrt(dx * dx + dy * dy) / totalDist);
        }
        if (velocities.length > 0) {
            const avgVel = velocities.reduce((a, b) => a + b, 0) / velocities.length;
            const varVel = velocities.reduce((a, b) => a + Math.pow(b - avgVel, 2), 0) / velocities.length;
            f.velocityVolatility = this._clamp(Math.sqrt(varVel) / 5.0);
        }
        if (spatialEvents > 2) f.directionalInflection = this._clamp(inflectionCount / spatialEvents);
        f.modalitySwitching = this._clamp(switchCount / timeline.length);
        return f;
    }
    _calculateMetrics(foundations) {
        const metrics = { intensity: 0, rhythm: 0, exploration: 0, coherence: 0 };
        for (const [metricKey, config] of Object.entries(this.tune.metrics)) {
            let val = config.base;
            for (const [foundationKey, weight] of Object.entries(config.weights)) val += foundations[foundationKey] * weight;
            metrics[metricKey] = this._clamp(val);
        }
        return metrics;
    }
    _calculateShapes(metrics) {
        const distances = {};
        let totalInvDist = 0, minHumanDist = Infinity;
        for (const [shape, ideal] of Object.entries(this.tune.shapes)) {
            const dist = Math.sqrt(Math.pow(metrics.intensity - ideal[0], 2) + Math.pow(metrics.rhythm - ideal[1], 2) + Math.pow(metrics.exploration - ideal[2], 2) + Math.pow(metrics.coherence - ideal[3], 2));
            if (shape !== 'ambient' && dist < minHumanDist) minHumanDist = dist;
            distances[shape] = 1 / (dist + 0.0001);
        }
        const OUTLIER_THRESHOLD = 0.7;
        if (minHumanDist > OUTLIER_THRESHOLD && distances['ambient']) distances['ambient'] *= Math.pow(minHumanDist / OUTLIER_THRESHOLD, 6);
        for (const invDist of Object.values(distances)) totalInvDist += invDist;

        const shapes = { steady: 0, burst: 0, drift: 0, chaotic: 0, flat: 0, ambient: 0, undetermined: 0 };
        if (totalInvDist > 0) {
            for (const shape in distances) if (shapes[shape] !== undefined) shapes[shape] = this._clamp(distances[shape] / totalInvDist);
        }
        return shapes;
    }

    _clamp(val) {
        const clamped = Math.max(0, Math.min(1, isNaN(val) ? 0 : val));
        return Math.round(clamped * 10000) / 10000;
    }
}

// Preserve the classic browser SDK API: one instance on window, not a constructor export.
if (typeof window !== 'undefined') {
    window.ShapeEngine = new ShapeEngine();
    // Do not auto-start in the demo UI.
}
