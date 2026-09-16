export class EventCollector {
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
