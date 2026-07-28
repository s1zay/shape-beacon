/**
 * ShapeEngine SDK v4.1 (Bundled for Sizzlestats)
 * Includes Tune v2.17, Configuration Init, & Client Deduplication
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

class EventCollector {
    constructor() {
        this.events = [];
        this.isListening = false;
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
    reset() { this.events = []; }
    getRawEvents() { return this.events; }
    _pushEvent(type, data) {
        if (this.events.length > 10000) this.events.shift(); 
        this.events.push({ type, ts: performance.now(), ...data });
    }
    _handleMouse(e) { this._pushEvent('mouse', { x: e.clientX, y: e.clientY }); }
    _handleClick(e) { this._pushEvent('click', { x: e.clientX, y: e.clientY }); }
    _handleKey(e)   { this._pushEvent('key', { key: e.key }); }
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
        this.version = "4.1";
        this.tune = tuneConfig || DEFAULT_TUNE;
        this.collector = new EventCollector();
        this.sessionStart = Date.now();
        this.sessionId = this._generateId(); 
        
        // UPDATED: Added apiKey to the config schema
        this.config = { endpoint: null, projectId: 'default', apiKey: null };
        this._hasSetupTriggers = false;
        this._hasSent = false;
        this.state = { status: 'offline', results: { timeline: [], foundations: {}, metrics: {}, shapes: {} } };
    }
    
    _generateId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    init(config = {}) {
        if (config.endpoint) this.config.endpoint = config.endpoint;
        if (config.projectId) this.config.projectId = config.projectId;
        // UPDATED: Catch the apiKey from the window.ShapeEngine.init() call
        if (config.apiKey) this.config.apiKey = config.apiKey;

        // Bind exit triggers strictly once
        if (this.config.endpoint && !this._hasSetupTriggers) {
            const handleExit = (event) => {
                if (this._hasSent) return; 
                if (document.visibilityState === 'hidden' || event.type === 'pagehide' || event.type === 'beforeunload') {
                    this._hasSent = true;
                    this.forceSend();
                }
            };
            document.addEventListener('visibilitychange', handleExit);
            window.addEventListener('pagehide', handleExit);
            window.addEventListener('beforeunload', handleExit);
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
    
    analyze() {
        const rawEvents = this.collector.getRawEvents();
        const sessionDurationMs = Date.now() - this.sessionStart;

        // --- GATEKEEPER ---
        if (sessionDurationMs < 1000 || rawEvents.length < 20) {
            this.state.results = {
                engineVersion: this.version,
                tuneVersion: this.tune.version,
                eventCount: rawEvents.length,
                sessionDurationMs: sessionDurationMs,
                timeline: [], 
                foundations: { actionDensity: 0, burstVariance: 0, idleFraction: 0, pathEfficiency: 0, velocityVolatility: 0, directionalInflection: 0, modalitySwitching: 0 },
                metrics: { intensity: 0, rhythm: 0, exploration: 0, coherence: 0 },
                shapes: { steady: 0, burst: 0, drift: 0, chaotic: 0, flat: 0, ambient: 0, undetermined: 1 }, 
                events: [...rawEvents] 
            };
            return;
        }

        const timeline = this._buildTimeline(rawEvents);
        const foundations = this._calculateFoundations(timeline);
        const metrics = this._calculateMetrics(foundations);
        const shapes = this._calculateShapes(metrics);

        this.state.results = {
            engineVersion: this.version,
            tuneVersion: this.tune.version,
            eventCount: rawEvents.length,
            sessionDurationMs: sessionDurationMs,
            timeline, foundations, metrics, shapes, events: [...rawEvents] 
        };
    }
    
    getResults() { return this.state.results; }

    forceSend() {
        if (!this.config.endpoint) return;

        this.analyze();
        const data = this.getResults();
        
        delete data.events;
        delete data.timeline;

        // UPDATED: Pass apiKey into the JSON payload
        const payload = JSON.stringify({
            payloadSchema: "v1", 
            sessionId: this.sessionId, 
            projectId: this.config.projectId,
            apiKey: this.config.apiKey, // <-- Now included!
            url: window.location.href,
            timestamp: new Date().toISOString(),
            ...data
        }, null, 2);

        const success = navigator.sendBeacon(this.config.endpoint, payload);
        if (!success) {
            fetch(this.config.endpoint, { method: 'POST', body: payload, keepalive: true }).catch(e => console.error(e));
        }
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