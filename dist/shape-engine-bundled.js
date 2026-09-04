/**
 * ShapeEngine SDK v4.1.7 (Bundled with Tune file)
 * Includes Tune v2.17, Configuration Init, Client Deduplication, Smart Media Detection, 
 * Tab-Switch Lifecycle, Weighted Chunking, & Auto-Save Protocol
 */

const DEFAULT_TUNE = {
  "version": "2.17",
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

const MIN_ENGAGED_DURATION_MS = 5000;
const MIN_ENGAGED_EVENT_COUNT = 20;
const DOMAIN_SESSION_LIFETIME_MS = 2 * 60 * 60 * 1000;
const PAGE_SESSION_ANALYTICAL_MAX_MS = 2 * 60 * 60 * 1000;

const isUndeterminedEngagement = (durationMs, eventCount) =>
    durationMs < MIN_ENGAGED_DURATION_MS || eventCount < MIN_ENGAGED_EVENT_COUNT;

class EventCollector {
    constructor(onLimitReached) {
        this.events = [];
        this.isListening = false;
        this.onLimitReached = onLimitReached;
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
        window.addEventListener('mousemove', this._handleMouse, opts);
        window.addEventListener('mousedown', this._handleClick, opts);
        window.addEventListener('touchstart', this._handleTouch, opts);
        window.addEventListener('touchmove', this._handleTouch, opts);
        window.addEventListener('scroll', this._handleScroll, opts);
        window.addEventListener('keydown', this._handleKey, opts);
    }
    stop() {
        if (!this.isListening) return;
        this.isListening = false;
        const opts = { capture: true };
        window.removeEventListener('mousemove', this._handleMouse, opts);
        window.removeEventListener('mousedown', this._handleClick, opts);
        window.removeEventListener('touchstart', this._handleTouch, opts);
        window.removeEventListener('touchmove', this._handleTouch, opts);
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

class ShapeEngine {
    constructor(tuneConfig = null) {
        this.version = "4.1.7";
        this.tune = tuneConfig || DEFAULT_TUNE;
        this.collector = new EventCollector(() => this._handleChunkLimit());
        
        this.pageSessionStart = Date.now();
        this.chunkStart = this.pageSessionStart;
        this.pageSessionId = this._generateId();
        this.domainSessionId = null;
        this.domainSessionStart = null;
        this.pageStartProvenance = 'initial_document';
        this.beaconSequence = 0;
        this.cumulativeSummary = null;
        this.chunkHistory = [];
        
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
        this.chunkStart = this.pageSessionStart;
        this.pageSessionId = this._generateId();
        const domainSession = this._getOrCreateDomainSession();
        this.domainSessionId = domainSession.id;
        this.domainSessionStart = domainSession.startedAt;
        this.pageStartProvenance = 'max_age_rollover_started';
        this.beaconSequence = 0;
        this.cumulativeSummary = null;
        this.chunkHistory = [];
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
        const rawEvents = this.collector.getRawEvents();
        const duration = Date.now() - this.chunkStart;
        
        // Analyze the 10k chunk and store the math
        const chunkData = this._analyzeBuffer(rawEvents, duration);
        this.chunkHistory.push(chunkData);
        
        // Clear RAM instantly without O(N) array shifting
        this.collector.reset();
        this.chunkStart = Date.now();

        // 50k Auto-Save Protocol (5 Chunks)
        if (this.chunkHistory.length >= 5) {
            // Because of Tab-Switch logic, we bypass the _hasSent lock for this auto-save
            const rolledOver = this.forceSend();
            if (rolledOver) return;

            // Collapse completed chunks into one weighted summary. This keeps
            // memory bounded without changing the logical Page Session.
            this.cumulativeSummary = this._mergeSummaries([
                this.cumulativeSummary,
                ...this.chunkHistory
            ]);
            this.chunkHistory = [];
        }
    }

    _analyzeBuffer(rawEvents, durationMs) {
        let hasTouch = false, mouseCount = 0, clickCount = 0;

        for (let i = 0; i < rawEvents.length; i++) {
            const t = rawEvents[i].type;
            if (t === 'touch_start' || t === 'touch_move') hasTouch = true;
            else if (t === 'mouse') mouseCount++;
            else if (t === 'click') clickCount++;
        }

        let device = 'unknown';
        if (hasTouch) {
            device = (mouseCount > clickCount) ? 'hybrid' : 'mobile';
        } else if (mouseCount > 0 || clickCount > 0) {
            device = 'desktop';
        }

        // Gatekeeper
        if (isUndeterminedEngagement(durationMs, rawEvents.length)) {
            return {
                eventCount: rawEvents.length,
                sessionDurationMs: durationMs,
                device: device,
                metrics: { intensity: 0, rhythm: 0, exploration: 0, coherence: 0 },
                shapes: { steady: 0, burst: 0, drift: 0, chaotic: 0, flat: 0, ambient: 0, undetermined: 1 }
            };
        }

        const timeline = this._buildTimeline(rawEvents);
        const foundations = this._calculateFoundations(timeline);
        const metrics = this._calculateMetrics(foundations);
        const shapes = this._calculateShapes(metrics);

        return {
            eventCount: rawEvents.length,
            sessionDurationMs: durationMs,
            device: device, 
            metrics: metrics, 
            shapes: shapes
        };
    }

    _mergeSummaries(summaries) {
        const allChunks = summaries.filter(c => c && c.eventCount > 0);
        if (allChunks.length === 0) {
            return {
                eventCount: 0,
                sessionDurationMs: 0,
                device: 'unknown',
                metrics: { intensity: 0, rhythm: 0, exploration: 0, coherence: 0 },
                shapes: { steady: 0, burst: 0, drift: 0, chaotic: 0, flat: 0, ambient: 0, undetermined: 0 }
            };
        }

        let totalEvents = 0;
        let totalDuration = 0;
        const mergedMetrics = { intensity: 0, rhythm: 0, exploration: 0, coherence: 0 };
        const mergedShapes = { steady: 0, burst: 0, drift: 0, chaotic: 0, flat: 0, ambient: 0, undetermined: 0 };
        const deviceSet = new Set();

        // Calculate Sums for Weighted Averages
        for (const chunk of allChunks) {
            totalEvents += chunk.eventCount;
            totalDuration += chunk.sessionDurationMs;
            deviceSet.add(chunk.device);
            
            for (const m in mergedMetrics) mergedMetrics[m] += (chunk.metrics[m] || 0) * chunk.eventCount;
            for (const s in mergedShapes) mergedShapes[s] += (chunk.shapes[s] || 0) * chunk.eventCount;
        }

        // Divide by Total Events to get Final Averages
        if (totalEvents > 0) {
            for (const m in mergedMetrics) mergedMetrics[m] = this._clamp(mergedMetrics[m] / totalEvents);
            for (const s in mergedShapes) mergedShapes[s] = this._clamp(mergedShapes[s] / totalEvents);
        }

        let finalDevice = 'unknown';
        if (deviceSet.has('hybrid') || (deviceSet.has('mobile') && deviceSet.has('desktop'))) finalDevice = 'hybrid';
        else if (deviceSet.has('mobile')) finalDevice = 'mobile';
        else if (deviceSet.has('desktop')) finalDevice = 'desktop';

        return {
            eventCount: totalEvents,
            sessionDurationMs: totalDuration,
            device: finalDevice,
            metrics: mergedMetrics,
            shapes: mergedShapes
        };
    }

    _mergeChunks(currentData) {
        return this._mergeSummaries([
            this.cumulativeSummary,
            ...this.chunkHistory,
            currentData
        ]);
    }

    analyze() {
        const rawEvents = this.collector.getRawEvents();
        const duration = Date.now() - this.chunkStart;
        
        // Analyze final active buffer
        const currentData = this._analyzeBuffer(rawEvents, duration);
        
        // Combine all chunks into single footprint
        const merged = this._mergeChunks(currentData);

        const sessionDurationMs = Date.now() - this.pageSessionStart;
        const shapes = isUndeterminedEngagement(sessionDurationMs, merged.eventCount)
            ? { steady: 0, burst: 0, drift: 0, chaotic: 0, flat: 0, ambient: 0, undetermined: 1 }
            : merged.shapes;

        this.state.results = {
            engineVersion: this.version,
            tuneVersion: this.tune.version,
            eventCount: merged.eventCount,
            sessionDurationMs,
            device: merged.device,
            metrics: merged.metrics,
            shapes,
            events: [...rawEvents] // Attached for local Demo UI compatibility only
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

        this.analyze();
        
        // FIX: Deep clone the results so we don't accidentally mutate local UI state
        const data = { ...this.getResults() };
        
        // Keep the transmitted payload to summary data only.
        delete data.events;
        delete data.timeline;

        this.beaconSequence += 1;

        const payload = JSON.stringify({
            payloadSchema: "v3",
            lifecycle_semantics_version: "v3",
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

// --- AUTO INITIALIZATION ---
if (typeof window !== 'undefined') {
    window.ShapeEngine = new ShapeEngine();
    // Do not auto-start in the demo UI.
                                             }
