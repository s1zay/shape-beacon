/**
 * ShapeEngine SDK v4.1.4 (Bundled for Sizzlestats)
 * Includes Tune v2.17, Configuration Init, Client Deduplication, Smart Media Detection, 
 * + Weighted Chunking & Auto-Save Protocol
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
        this.version = "4.1.3";
        this.tune = tuneConfig || DEFAULT_TUNE;
        this.collector = new EventCollector(() => this._handleChunkLimit());
        
        this.sessionStart = Date.now();
        this.chunkStart = this.sessionStart;
        this.sessionId = this._generateId(); 
        this.chunkHistory = [];
        
        this.config = { endpoint: null, projectId: 'default', apiKey: null };
        this._hasSetupTriggers = false;
        this._hasSent = false;
        this.state = { status: 'offline', results: { foundations: {}, metrics: {}, shapes: {}, device: 'unknown' } };
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
            this.forceSend();
            
            // Generate entirely new session footprint to continue seamlessly
            this.sessionId = this._generateId();
            this.sessionStart = Date.now();
            this.chunkStart = this.sessionStart;
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
        if (durationMs < 1000 || rawEvents.length < 20) {
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

    _mergeChunks(currentData) {
        if (this.chunkHistory.length === 0) return currentData;
        
        const allChunks = [...this.chunkHistory, currentData].filter(c => c.eventCount > 0);
        if (allChunks.length === 0) return currentData;

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

    analyze() {
        const rawEvents = this.collector.getRawEvents();
        const duration = Date.now() - this.chunkStart;
        
        // Analyze final active buffer
        const currentData = this._analyzeBuffer(rawEvents, duration);
        
        // Combine all chunks into single footprint
        const merged = this._mergeChunks(currentData);

        this.state.results = {
            engineVersion: this.version,
            tuneVersion: this.tune.version,
            eventCount: merged.eventCount,
            sessionDurationMs: merged.sessionDurationMs,
            device: merged.device,
            metrics: merged.metrics,
            shapes: merged.shapes,
            events: [...rawEvents] // Attached for local Demo UI compatibility only
        };
    }
    
    getResults() { return this.state.results; }

    forceSend() {
        if (!this.config.endpoint) return;

        this.analyze();
        const data = this.getResults();
        
        // Ensure payload size stays micro
        delete data.events;
        delete data.timeline;

        const payload = JSON.stringify({
            payloadSchema: "v1", 
            sessionId: this.sessionId, 
            projectId: this.config.projectId,
            apiKey: this.config.apiKey,
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