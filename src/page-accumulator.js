// Local, fixed-size sufficient statistics. No raw event arrays or network fields.
// Welford updates retain variance without retaining intervals or velocities.
export class PageAccumulator {
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
