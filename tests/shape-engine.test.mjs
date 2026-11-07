import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const sdkSource = fs.readFileSync(
    new URL('../dist/shape-engine-bundled.js', import.meta.url),
    'utf8'
);

let contextNumber = 0;

class MemorySessionStorage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
}

function createEventTarget() {
    const listeners = new Map();
    return {
        addEventListener(type, listener) {
            const current = listeners.get(type) || [];
            current.push(listener);
            listeners.set(type, current);
        },
        removeEventListener(type, listener) {
            const current = listeners.get(type) || [];
            listeners.set(type, current.filter(candidate => candidate !== listener));
        },
        dispatch(type, event = { type }) {
            for (const listener of listeners.get(type) || []) listener(event);
        },
        listenerCount(type) { return (listeners.get(type) || []).length; },
        listenerTypes() {
            return [...listeners.entries()].filter(([, values]) => values.length > 0)
                .map(([type]) => type).sort();
        }
    };
}

function createSdkContext({
    storage = new MemorySessionStorage(),
    startTime = 1000,
    locationHref = 'https://example.com/home',
    pointerEvents = false
} = {}) {
    const sentPayloads = [];
    const documentTarget = createEventTarget();
    const windowTarget = createEventTarget();
    const clock = { now: startTime };
    const timers = new Map();
    let timerNumber = 0;
    const contextId = ++contextNumber;
    let uuidNumber = 0;

    class FakeDate extends Date {
        constructor(value) { super(value === undefined ? clock.now : value); }
        static now() { return clock.now; }
    }

    const document = {
        ...documentTarget,
        visibilityState: 'visible'
    };
    const window = {
        ...windowTarget,
        document,
        location: { href: locationHref },
        sessionStorage: storage
    };
    if (pointerEvents) window.PointerEvent = function PointerEvent() {};
    const context = vm.createContext({
        console,
        Date: FakeDate,
        document,
        window,
        navigator: {
            sendBeacon(endpoint, body) {
                sentPayloads.push({ endpoint, body: JSON.parse(body) });
                return true;
            }
        },
        fetch: async () => ({ ok: true }),
        performance: { now: () => clock.now },
        URL,
        crypto: {
            randomUUID: () => `00000000-0000-4000-8000-${String(contextId * 1000 + ++uuidNumber).padStart(12, '0')}`
        },
        setTimeout(callback, delay) {
            const id = ++timerNumber;
            timers.set(id, { callback, delay });
            return id;
        },
        clearTimeout(id) { timers.delete(id); }
    });
    context.globalThis = context;
    vm.runInContext(
        `${sdkSource}\n;globalThis.__ShapeEngine = ShapeEngine;`,
        context,
        { filename: 'shape-engine-bundled.js' }
    );

    return {
        ShapeEngine: context.__ShapeEngine,
        clock,
        document,
        sentPayloads,
        storage,
        timers,
        window
    };
}

function initEngine(environment) {
    const engine = new environment.ShapeEngine();
    engine.init({
        endpoint: 'https://collector.example/metrics',
        projectId: 'project-1',
        apiKey: 'api-key-1'
    });
    return engine;
}

function runFiveChunks(engine) {
    for (let index = 0; index < 5; index++) {
        const offset = engine.pageAccumulator.eventCount;
        engine.collector.events = rawEvents(10000).map((ev,i)=>({...ev,ts:(offset+i)*1.2}));
        engine._handleChunkLimit();
    }
}

const rawEvents = count => Array.from({ length: count }, (_, index) => ({
    type: 'mouse',
    ts: index * 10,
    x: index,
    y: index
}));

const canonicalEvents = engine => JSON.parse(JSON.stringify(
    engine.collector.events.map(({ type, ts, x, y }) => ({
        type, ts, ...(x === undefined ? {} : { x }), ...(y === undefined ? {} : { y })
    }))
));

function dispatchPointing(environment, { pointerEvents, pointerType }) {
    for (let index = 0; index < 10; index++) {
        environment.clock.now = index * 200;
        if (pointerEvents && pointerType === 'mouse') {
            environment.window.dispatch('pointermove', {
                type: 'pointermove', pointerType, clientX: index, clientY: index * 2
            });
            environment.clock.now += 100;
            environment.window.dispatch('pointerdown', {
                type: 'pointerdown', pointerType, clientX: index + 1, clientY: index * 2 + 1
            });
        } else if (pointerEvents) {
            environment.window.dispatch('pointerdown', {
                type: 'pointerdown', pointerType, clientX: index, clientY: index * 2
            });
            environment.clock.now += 100;
            environment.window.dispatch('pointermove', {
                type: 'pointermove', pointerType, clientX: index + 1, clientY: index * 2 + 1
            });
        } else if (pointerType === 'mouse') {
            environment.window.dispatch('mousemove', {
                type: 'mousemove', clientX: index, clientY: index * 2
            });
            environment.clock.now += 100;
            environment.window.dispatch('mousedown', {
                type: 'mousedown', clientX: index + 1, clientY: index * 2 + 1
            });
        } else {
            environment.window.dispatch('touchstart', {
                type: 'touchstart', touches: [{ clientX: index, clientY: index * 2 }]
            });
            environment.clock.now += 100;
            environment.window.dispatch('touchmove', {
                type: 'touchmove', touches: [{ clientX: index + 1, clientY: index * 2 + 1 }]
            });
        }
    }
    environment.clock.now = 2100;
    environment.window.scrollY = 75;
    environment.window.dispatch('scroll', { type: 'scroll', target: environment.window });
    environment.clock.now = 2200;
    environment.window.dispatch('keydown', { type: 'keydown', key: 'not-retained' });
}

function capturedScenario({ pointerEvents, pointerType }) {
    const environment = createSdkContext({ startTime: 0, pointerEvents });
    const engine = initEngine(environment);
    dispatchPointing(environment, { pointerEvents, pointerType });
    const events = canonicalEvents(engine);
    const timeline = engine._buildTimeline(engine.collector.events);
    return {
        environment,
        engine,
        events,
        foundations: JSON.parse(JSON.stringify(engine._calculateFoundations(timeline))),
        analysis: JSON.parse(JSON.stringify(engine._analyzeBuffer(engine.collector.events, 5000)))
    };
}

test('Pointer capability selects one pointing listener family while preserving scroll and key', () => {
    const legacyEnvironment = createSdkContext();
    const legacy = initEngine(legacyEnvironment);
    assert.deepEqual(legacy.collector.usesPointerEvents, false);
    assert.deepEqual(legacyEnvironment.window.listenerTypes(), [
        'beforeunload', 'keydown', 'mousedown', 'mousemove', 'pagehide', 'pageshow',
        'scroll', 'touchmove', 'touchstart'
    ]);

    const pointerEnvironment = createSdkContext({ pointerEvents: true });
    const pointer = initEngine(pointerEnvironment);
    assert.equal(pointer.collector.usesPointerEvents, true);
    assert.deepEqual(pointerEnvironment.window.listenerTypes(), [
        'beforeunload', 'keydown', 'pagehide', 'pageshow', 'pointerdown', 'pointermove', 'scroll'
    ]);
    for (const legacyType of ['mousedown', 'mousemove', 'touchmove', 'touchstart']) {
        assert.equal(pointerEnvironment.window.listenerCount(legacyType), 0);
    }
});

test('legacy and Pointer mouse input normalize to identical canonical activity', () => {
    const legacy = capturedScenario({ pointerEvents: false, pointerType: 'mouse' });
    const pointer = capturedScenario({ pointerEvents: true, pointerType: 'mouse' });
    assert.deepEqual(pointer.events, legacy.events);
    assert.deepEqual(pointer.foundations, legacy.foundations);
    assert.deepEqual(pointer.analysis, legacy.analysis);
    assert.equal(pointer.analysis.device, 'desktop');
});

test('legacy touch, Pointer touch, and Pointer pen are analytically equivalent', () => {
    const legacyTouch = capturedScenario({ pointerEvents: false, pointerType: 'touch' });
    const pointerTouch = capturedScenario({ pointerEvents: true, pointerType: 'touch' });
    const pointerPen = capturedScenario({ pointerEvents: true, pointerType: 'pen' });

    for (const candidate of [pointerTouch, pointerPen]) {
        assert.deepEqual(candidate.events, legacyTouch.events);
        assert.deepEqual(candidate.foundations, legacyTouch.foundations);
        assert.deepEqual(candidate.analysis, legacyTouch.analysis);
        assert.equal(candidate.analysis.device, 'mobile');
        assert.equal(candidate.events.some(event => event.type === 'pen'), false);
    }
});

test('Pointer environments ignore compatibility pointing events and unknown pointer types', () => {
    const environment = createSdkContext({ pointerEvents: true, startTime: 0 });
    const engine = initEngine(environment);
    environment.window.dispatch('pointerdown', {
        type: 'pointerdown', pointerType: 'pen', clientX: 4, clientY: 8
    });
    environment.window.dispatch('mousedown', { type: 'mousedown', clientX: 4, clientY: 8 });
    environment.window.dispatch('mousemove', { type: 'mousemove', clientX: 5, clientY: 9 });
    environment.window.dispatch('touchstart', {
        type: 'touchstart', touches: [{ clientX: 4, clientY: 8 }]
    });
    environment.window.dispatch('pointermove', {
        type: 'pointermove', pointerType: '', clientX: 10, clientY: 10
    });
    environment.window.dispatch('pointermove', {
        type: 'pointermove', pointerType: 'unknown', clientX: 11, clientY: 11
    });

    assert.deepEqual(canonicalEvents(engine), [
        { type: 'touch_start', ts: 0, x: 4, y: 8 }
    ]);
});

test('Pointer touch and pen moves normalize without requiring retained pointer state', () => {
    for (const pointerType of ['touch', 'pen']) {
        const environment = createSdkContext({ pointerEvents: true, startTime: 0 });
        const engine = initEngine(environment);
        environment.window.dispatch('pointermove', {
            type: 'pointermove', pointerType, clientX: 2, clientY: 3
        });
        assert.deepEqual(canonicalEvents(engine), [
            { type: 'touch_move', ts: 0, x: 2, y: 3 }
        ]);
    }
});

test('collector start and stop remain idempotent for Pointer listeners', () => {
    const environment = createSdkContext({ pointerEvents: true });
    const engine = initEngine(environment);
    engine.start();
    assert.equal(environment.window.listenerCount('pointermove'), 1);
    engine.stop();
    engine.stop();
    assert.equal(environment.window.listenerCount('pointermove'), 0);
    assert.equal(environment.window.listenerCount('scroll'), 0);
    engine.start();
    engine.start();
    assert.equal(environment.window.listenerCount('pointermove'), 1);
    assert.equal(environment.window.listenerCount('scroll'), 1);
});

test('engagement gate uses the inclusive 5000 ms and 20 event boundaries', () => {
    const engine = initEngine(createSdkContext());

    assert.equal(engine._analyzeBuffer(rawEvents(20), 4999).shapes.undetermined, 1);
    assert.notEqual(engine._analyzeBuffer(rawEvents(20), 5000).shapes.undetermined, 1);
    assert.equal(engine._analyzeBuffer(rawEvents(19), 5000).shapes.undetermined, 1);
    assert.notEqual(engine._analyzeBuffer(rawEvents(20), 7000).shapes.undetermined, 1);
});

test('zero-event Page Sessions remain Undetermined at five and seven seconds', () => {
    for (const duration of [5000, 7000]) {
        const environment = createSdkContext({ startTime: 0 });
        const engine = initEngine(environment);
        environment.clock.now = duration;
        engine.forceSend();

        const payload = environment.sentPayloads[0].body;
        assert.equal(payload.sessionDurationMs, duration);
        assert.equal(payload.eventCount, 0);
        assert.equal(payload.shapes.undetermined, 1);
    }
});

test('repeated transmissions apply the gate to cumulative Page Session scalars', () => {
    const environment = createSdkContext({ startTime: 0 });
    const engine = initEngine(environment);
    const pageSessionId = engine.pageSessionId;
    engine.collector.events = rawEvents(20);

    environment.clock.now = 4999;
    engine.forceSend();
    environment.clock.now = 5000;
    engine.forceSend();

    const [first, second] = environment.sentPayloads.map(item => item.body);
    assert.equal(first.shapes.undetermined, 1);
    assert.notEqual(second.shapes.undetermined, 1);
    assert.deepEqual([first.beacon_sequence, second.beacon_sequence], [1, 2]);
    assert.equal(first.page_session_id, pageSessionId);
    assert.equal(second.page_session_id, pageSessionId);
    assert.equal(second.eventCount, 20);
    assert.equal(second.sessionDurationMs, 5000);
});

test('one document keeps page identity through repeated hide/show transmissions', () => {
    const environment = createSdkContext();
    const engine = initEngine(environment);
    const pageSessionId = engine.pageSessionId;

    environment.document.visibilityState = 'hidden';
    environment.document.dispatch('visibilitychange');
    environment.document.visibilityState = 'visible';
    environment.document.dispatch('visibilitychange');
    environment.document.visibilityState = 'hidden';
    environment.document.dispatch('visibilitychange');

    assert.equal(environment.sentPayloads.length, 2);
    assert.deepEqual(environment.sentPayloads.map(item => item.body.beacon_sequence), [1, 2]);
    assert.ok(environment.sentPayloads.every(item => item.body.page_session_id === pageSessionId));
    assert.equal(engine.pageSessionId, pageSessionId);
});

test('same-tab documents reuse an unexpired Domain Session without sliding its start', () => {
    const storage = new MemorySessionStorage();
    const firstEnvironment = createSdkContext({ storage, startTime: 0 });
    const first = initEngine(firstEnvironment);
    const storedKey = [...storage.values.keys()][0];
    const initialStorageValue = storage.getItem(storedKey);
    const secondEnvironment = createSdkContext({ storage, startTime: 7199999 });
    const second = initEngine(secondEnvironment);

    assert.notEqual(first.pageSessionId, second.pageSessionId);
    assert.equal(first.domainSessionId, second.domainSessionId);
    assert.equal(first.domainSessionStart, 0);
    assert.equal(second.domainSessionStart, 0);
    assert.equal(storage.getItem(storedKey), initialStorageValue);

    const thirdEnvironment = createSdkContext({ storage, startTime: 7200000 });
    const third = initEngine(thirdEnvironment);
    assert.notEqual(second.pageSessionId, third.pageSessionId);
    assert.notEqual(first.domainSessionId, third.domainSessionId);

    const rotatedStorage = JSON.parse(storage.getItem(storedKey));
    assert.equal(rotatedStorage.id, third.domainSessionId);
    assert.equal(rotatedStorage.startedAt, 7200000);

    const fourth = initEngine(createSdkContext({ storage, startTime: 14399999 }));
    assert.equal(fourth.domainSessionId, third.domainSessionId);

    const fifth = initEngine(createSdkContext({ storage, startTime: 14400000 }));
    assert.notEqual(fifth.domainSessionId, third.domainSessionId);

    const independent = initEngine(createSdkContext({ storage: new MemorySessionStorage() }));
    assert.notEqual(first.domainSessionId, independent.domainSessionId);

    const unrelatedEnvironment = createSdkContext({ storage });
    const unrelated = new unrelatedEnvironment.ShapeEngine();
    unrelated.init({
        endpoint: 'https://collector.example/metrics',
        projectId: 'project-1',
        apiKey: 'different-api-key'
    });
    assert.notEqual(first.domainSessionId, unrelated.domainSessionId);

    const plusOneStorage = new MemorySessionStorage();
    const beforePlusOne = initEngine(createSdkContext({ storage: plusOneStorage, startTime: 0 }));
    const afterPlusOne = initEngine(createSdkContext({ storage: plusOneStorage, startTime: 7_200_001 }));
    assert.notEqual(afterPlusOne.domainSessionId, beforePlusOne.domainSessionId);
    assert.equal(afterPlusOne.domainSessionStart, 7_200_001);
});

test('legacy raw Domain Session storage rotates into timestamped storage', () => {
    const storage = new MemorySessionStorage();
    const first = initEngine(createSdkContext({ storage, startTime: 1000 }));
    const key = [...storage.values.keys()][0];
    storage.setItem(key, first.domainSessionId);

    const second = initEngine(createSdkContext({ storage, startTime: 2000 }));
    assert.notEqual(second.domainSessionId, first.domainSessionId);
    assert.deepEqual(JSON.parse(storage.getItem(key)), {
        id: second.domainSessionId,
        startedAt: 2000
    });
});

test('invalid timestamped Domain Session values rotate safely', () => {
    const invalidValues = [
        null,
        [],
        { startedAt: 3000 },
        { id: '', startedAt: 3000 },
        { id: 'stale-id' },
        { id: 'stale-id', startedAt: null },
        { id: 'stale-id', startedAt: 'not-a-number' }
    ];
    const key = 'shape_beacon:domain_session:v1:api-key-1:project-1:https%3A%2F%2Fcollector.example%2Fmetrics';

    for (const invalidValue of invalidValues) {
        const storage = new MemorySessionStorage();
        storage.setItem(key, JSON.stringify(invalidValue));
        const environment = createSdkContext({ storage, startTime: 3000 });

        let engine;
        assert.doesNotThrow(() => { engine = initEngine(environment); });
        assert.notEqual(engine.domainSessionId, 'stale-id');
        assert.deepEqual(JSON.parse(storage.getItem(key)), {
            id: engine.domainSessionId,
            startedAt: 3000
        });
    }
});

test('setItem failure falls back to a document-scoped Domain Session', () => {
    class SetItemBlockedStorage {
        getItem() { return null; }
        setItem() { throw new Error('blocked'); }
    }

    const storage = new SetItemBlockedStorage();
    const firstEnvironment = createSdkContext({ storage, startTime: 4000 });
    let first;
    assert.doesNotThrow(() => { first = initEngine(firstEnvironment); });
    const firstDomainSessionId = first.domainSessionId;
    assert.equal(typeof firstDomainSessionId, 'string');
    assert.ok(firstDomainSessionId.length > 0);

    assert.doesNotThrow(() => first.init({
        endpoint: 'https://collector.example/metrics',
        projectId: 'project-1',
        apiKey: 'api-key-1'
    }));
    assert.equal(first.domainSessionId, firstDomainSessionId);

    const second = initEngine(createSdkContext({ storage, startTime: 5000 }));
    assert.notEqual(second.domainSessionId, firstDomainSessionId);
});

test('blocked sessionStorage falls back safely to a document-scoped Domain Session', () => {
    const blockedStorage = {
        getItem() { throw new Error('blocked'); },
        setItem() { throw new Error('blocked'); }
    };
    const environment = createSdkContext({ storage: blockedStorage });
    let engine;
    assert.doesNotThrow(() => { engine = initEngine(environment); });
    assert.equal(typeof engine.domainSessionId, 'string');
    assert.ok(engine.domainSessionId.length > 0);
});

test('50K autosaves keep identity, sequence, cumulative behavior, duration, and bounded memory', () => {
    const environment = createSdkContext();
    const engine = initEngine(environment);
    const pageSessionId = engine.pageSessionId;
    const domainSessionId = engine.domainSessionId;


    environment.clock.now = 61000;
    runFiveChunks(engine, 'early');
    assert.equal(engine.collector.events.length, 0);
    assert.equal(Object.values(engine.pageAccumulator).some(Array.isArray), false);
    assert.equal(engine.pageAccumulator.eventCount, 50000);

    environment.clock.now = 121000;
    runFiveChunks(engine, 'late');

    assert.equal(environment.sentPayloads.length, 2);
    const [first, second] = environment.sentPayloads.map(item => item.body);
    assert.equal(first.page_session_id, pageSessionId);
    assert.equal(second.page_session_id, pageSessionId);
    assert.equal(second.domain_session_id, domainSessionId);
    assert.deepEqual([first.beacon_sequence, second.beacon_sequence], [1, 2]);
    assert.deepEqual([first.eventCount, second.eventCount], [50000, 100000]);
    assert.deepEqual([first.sessionDurationMs, second.sessionDurationMs], [60000, 120000]);
    const oracle = engine._analyzeBuffer(rawEvents(100000).map((ev,i)=>({...ev,ts:i*1.2,x:i%10000,y:i%10000})),120000);
    assert.deepEqual(JSON.parse(JSON.stringify(second.metrics)),JSON.parse(JSON.stringify(oracle.metrics)));
    assert.equal(second.shapes.undetermined,0);
    assert.equal(engine.collector.events.length, 0);
    assert.equal(Object.values(engine.pageAccumulator).some(Array.isArray), false);
    assert.equal(engine.pageAccumulator.eventCount, 100000);
});

test('the collector still triggers its autosave after five real 10K raw-event buffers', () => {
    const environment = createSdkContext();
    const engine = initEngine(environment);
    const pageSessionId = engine.pageSessionId;

    for (let index = 0; index < 50000; index++) {
        engine.collector._pushEvent('mouse', { x: index % 10, y: index % 20 });
    }

    assert.equal(environment.sentPayloads.length, 1);
    assert.equal(environment.sentPayloads[0].body.eventCount, 50000);
    assert.equal(environment.sentPayloads[0].body.page_session_id, pageSessionId);
    assert.equal(environment.sentPayloads[0].body.beacon_sequence, 1);
    assert.equal(engine.pageSessionId, pageSessionId);
    assert.equal(engine.beaconSequence, 1);
    assert.equal(engine.collector.events.length, 0);
    assert.equal(Object.values(engine.pageAccumulator).some(Array.isArray), false);
    assert.equal(engine.pageAccumulator.eventCount, 50000);
});

test('payload uses lifecycle-v3 field names and required scalar types', () => {
    const environment = createSdkContext();
    const engine = initEngine(environment);
    engine.forceSend();
    const payload = environment.sentPayloads[0].body;

    assert.equal(payload.payloadSchema, 'v3');
    assert.equal(payload.lifecycle_semantics_version, 'v3');
    assert.equal(payload.engineVersion, '4.2.0');
    assert.equal(payload.tuneVersion, '2.17');
    assert.equal(typeof payload.page_session_id, 'string');
    assert.equal(typeof payload.domain_session_id, 'string');
    assert.equal(payload.page_session_started_at, 1000);
    assert.equal(payload.domain_session_started_at, 1000);
    assert.equal(payload.page_start_provenance, 'initial_document');
    assert.equal(payload.page_session_final, false);
    assert.equal(payload.page_session_end_reason, null);
    assert.equal(payload.beacon_sequence, 1);
    assert.equal(Number.isSafeInteger(payload.eventCount), true);
    assert.equal(Number.isFinite(payload.sessionDurationMs), true);
    assert.equal(typeof payload.metrics, 'object');
    assert.equal(typeof payload.shapes, 'object');
    assert.equal('sessionId' in payload, false);
});

test('keyboard activity never retains or emits the pressed key value', () => {
    const environment = createSdkContext();
    const engine = initEngine(environment);
    const typedValue = 'privacy-sensitive-character';

    environment.window.dispatch('keydown', { type: 'keydown', key: typedValue });

    assert.equal(engine.collector.events.length, 1);
    assert.deepEqual(Object.keys(engine.collector.events[0]).sort(), ['ts', 'type']);
    assert.equal(engine.collector.events[0].type, 'key');

    engine.analyze();
    assert.equal(JSON.stringify(engine.getResults()).includes(typedValue), false);

    engine.forceSend();
    assert.equal(JSON.stringify(environment.sentPayloads[0].body).includes(typedValue), false);
});

test('emitted URLs retain origin and pathname but strip query strings and fragments', () => {
    const environment = createSdkContext({
        locationHref: 'https://example.com/account?email=test@example.com#billing'
    });
    const engine = initEngine(environment);

    engine.forceSend();

    assert.equal(environment.sentPayloads[0].body.url, 'https://example.com/account');
    assert.equal(environment.sentPayloads[0].body.payloadSchema, 'v3');
});

test('incremental lifecycle sends retain stable identity and client start facts', () => {
    const environment = createSdkContext({ startTime: 10_000 });
    const engine = initEngine(environment);

    environment.clock.now = 15_000;
    engine.forceSend();
    environment.clock.now = 20_000;
    engine.forceSend();

    const [first, second] = environment.sentPayloads.map(item => item.body);
    assert.deepEqual([first.beacon_sequence, second.beacon_sequence], [1, 2]);
    for (const payload of [first, second]) {
        assert.equal(payload.page_session_id, engine.pageSessionId);
        assert.equal(payload.domain_session_id, engine.domainSessionId);
        assert.equal(payload.page_session_started_at, 10_000);
        assert.equal(payload.domain_session_started_at, 10_000);
        assert.equal(payload.page_session_final, false);
        assert.equal(payload.page_session_end_reason, null);
    }
});

test('visibility, pagehide, and BFCache sends remain incremental rather than explicit-final', () => {
    const environment = createSdkContext({ startTime: 0 });
    initEngine(environment);

    environment.clock.now = 5000;
    environment.document.visibilityState = 'hidden';
    environment.document.dispatch('visibilitychange');
    environment.document.visibilityState = 'visible';
    environment.window.dispatch('pageshow');
    environment.window.dispatch('pagehide');

    assert.equal(environment.sentPayloads.length, 2);
    assert.ok(environment.sentPayloads.every(({ body }) => body.page_session_final === false));
    assert.ok(environment.sentPayloads.every(({ body }) => body.page_session_end_reason === null));
});

test('the controlled Page max-age report is final and rolls Page and Domain identity', () => {
    const environment = createSdkContext({ startTime: 0 });
    const engine = initEngine(environment);
    const oldPage = engine.pageSessionId;
    const oldDomain = engine.domainSessionId;

    environment.clock.now = 7_200_001;
    engine.forceSend();

    const final = environment.sentPayloads[0].body;
    assert.equal(final.page_session_id, oldPage);
    assert.equal(final.domain_session_id, oldDomain);
    assert.equal(final.sessionDurationMs, 7_200_000);
    assert.equal(final.page_session_final, true);
    assert.equal(final.page_session_end_reason, 'max_age');
    assert.notEqual(engine.pageSessionId, oldPage);
    assert.notEqual(engine.domainSessionId, oldDomain);
    assert.equal(engine.pageSessionStart, 7_200_001);
    assert.equal(engine.domainSessionStart, 7_200_001);
    assert.equal(engine.pageStartProvenance, 'max_age_rollover_started');
    assert.equal(engine.beaconSequence, 0);

    engine.forceSend();
    const next = environment.sentPayloads[1].body;
    assert.equal(next.page_session_id, engine.pageSessionId);
    assert.equal(next.domain_session_id, engine.domainSessionId);
    assert.equal(next.beacon_sequence, 1);
    assert.equal(next.page_session_final, false);
    assert.equal(next.page_start_provenance, 'max_age_rollover_started');
});

test('Page beacon ceiling stops ordinary updates at 1,999 and reserves 2,000 for max age', () => {
    const environment = createSdkContext({ startTime: 0 });
    const engine = initEngine(environment);
    const cappedPage = engine.pageSessionId;

    engine.beaconSequence = 1998;
    engine.forceSend();
    assert.equal(environment.sentPayloads.length, 1);
    assert.equal(environment.sentPayloads[0].body.beacon_sequence, 1999);
    assert.equal(environment.sentPayloads[0].body.page_session_id, cappedPage);

    assert.equal(engine.forceSend(), false);
    assert.equal(environment.sentPayloads.length, 1);
    assert.equal(engine.beaconSequence, 1999);

    environment.clock.now = 7_200_000;
    engine.forceSend();
    assert.equal(environment.sentPayloads.length, 2);
    assert.equal(environment.sentPayloads[1].body.beacon_sequence, 2000);
    assert.equal(environment.sentPayloads[1].body.page_session_id, cappedPage);
    assert.equal(environment.sentPayloads[1].body.page_session_final, true);
    assert.notEqual(engine.pageSessionId, cappedPage);
    assert.equal(engine.beaconSequence, 0);
});

test('an autosave at Page max age cannot carry old chunks into the rolled Page', () => {
    const environment = createSdkContext({ startTime: 0 });
    const engine = initEngine(environment);
    environment.clock.now = 7_200_000;
    runFiveChunks(engine, 'final');

    assert.equal(environment.sentPayloads.length, 1);
    assert.equal(environment.sentPayloads[0].body.page_session_final, true);
    assert.equal(engine.beaconSequence, 0);
    assert.equal(engine.pageAccumulator.eventCount, 0);
    assert.equal(Object.values(engine.pageAccumulator).some(Array.isArray), false);
    assert.equal(engine.collector.events.length, 0);
});

test('URL sanitization safely preserves encoded paths, ports, and IPv6 hosts', () => {
    const environment = createSdkContext({
        locationHref: 'https://[2001:db8::1]:8443/a%20path/?token=secret#private'
    });
    const engine = initEngine(environment);

    engine.forceSend();

    assert.equal(environment.sentPayloads[0].body.url, 'https://[2001:db8::1]:8443/a%20path/');
});

test('opaque URLs do not expose embedded content, queries, or fragments', () => {
    const privateContent = 'private-page-content';
    const environment = createSdkContext({
        locationHref: `data:text/plain,${privateContent}?token=secret#private`
    });
    const engine = initEngine(environment);

    engine.forceSend();

    assert.equal(environment.sentPayloads[0].body.url, 'data:');
    assert.equal(JSON.stringify(environment.sentPayloads[0].body).includes(privateContent), false);
});

function plain(value) { return JSON.parse(JSON.stringify(value)); }
function stream(count) {
    let ts=0;
    return Array.from({length:count},(_,i)=>{
        ts += i%53===0?900:i%7===0?0:2+(i%11);
        const type=['mouse','touch_move','key','scroll','click'][i%5];
        return {type,ts,...(type==='key'?{}:type==='scroll'?{y:i%80}:{x:i%200<100?i%100:100-i%100,y:Math.sin(i/13)*30})};
    });
}

test('continuous measurements match whole-buffer formulas across boundaries and reporting schedules',()=>{
    const events=stream(25037);
    const baseline=createSdkContext(); const reference=initEngine(baseline);
    const expectedMetrics=reference._calculateMetrics(reference._calculateFoundations(reference._buildTimeline(events)));
    const expectedShapes=reference._calculateShapes(expectedMetrics);
    let firstPartition;
    for(const size of [1,19,1000,9999,10000,25037]){
        const environment=createSdkContext();const engine=initEngine(environment);
        environment.clock.now=events.at(-1).ts+10000;
        for(let offset=0;offset<events.length;offset+=size){
            engine.collector.events=events.slice(offset,offset+size);
            engine.analyze(); const first=plain(engine.getResults());
            engine.analyze();assert.deepEqual(plain(engine.getResults()),first);
            engine._handleChunkLimit();
        }
        engine.analyze();const result=engine.getResults();
        assert.equal(result.eventCount,events.length);
        const measurements=plain({metrics:result.metrics,shapes:result.shapes,device:result.device});
        if(firstPartition)assert.deepEqual(measurements,firstPartition);else firstPartition=measurements;
        for(const key of Object.keys(expectedMetrics))assert.ok(Math.abs(result.metrics[key]-expectedMetrics[key])<=0.0001,`${size}: ${key}`);
        for(const key of Object.keys(expectedShapes))assert.ok(Math.abs(result.shapes[key]-expectedShapes[key])<=0.0001,`${size}: ${key}`);
        assert.equal(result.shapes.undetermined,0);
        const sum=Object.entries(result.shapes).filter(([k])=>k!=='undetermined').reduce((n,[,v])=>n+v,0);
        assert.ok(Math.abs(sum-1)<=0.0003000001);
    }
});

test('short tail and rapid chunks do not dilute metrics; eligibility belongs to the Page',()=>{
    const environment=createSdkContext();const engine=initEngine(environment);
    const events=stream(10019);
    engine.collector.events=events.slice(0,10000);engine._handleChunkLimit();
    engine.collector.events=events.slice(10000);environment.clock.now=90000;
    engine.analyze();
    const expected=engine._analyzeBuffer(events,89000);
    assert.deepEqual(plain(engine.getResults().metrics),plain(expected.metrics));
    assert.deepEqual(plain(engine.getResults().shapes),plain(expected.shapes));
    const rapid=createSdkContext();const r=initEngine(rapid);
    r.collector.events=rawEvents(20);r._handleChunkLimit();
    r.analyze();assert.equal(r.getResults().shapes.undetermined,1);
    rapid.clock.now=6000;r.analyze();assert.equal(r.getResults().shapes.undetermined,0);
});

test('fixed accumulator and unchanged payload whitelist retain no raw completed chunks',()=>{
    const environment=createSdkContext();const engine=initEngine(environment);
    const keys=Object.keys(engine.pageAccumulator).sort();
    environment.clock.now=100000;
    for(let chunk=0;chunk<12;chunk++){
        engine.collector.events=stream(10000).map(e=>({...e,ts:e.ts+chunk*100000}));
        engine.analyze();engine._handleChunkLimit();
        assert.equal(engine.collector.events.length,0);
        assert.equal(engine.getResults().events.length,0);
        assert.deepEqual(Object.keys(engine.pageAccumulator).sort(),keys);
        assert.ok(Object.values(engine.pageAccumulator).every(v=>v===null||['number','boolean','string'].includes(typeof v)));
    }
    engine.forceSend();const payload=environment.sentPayloads.at(-1).body;
    assert.equal(payload.eventCount,120000);
    assert.deepEqual(Object.keys(payload).sort(),['payloadSchema','lifecycle_semantics_version','page_session_id','domain_session_id','page_session_started_at','domain_session_started_at','beacon_sequence','page_session_final','page_session_end_reason','page_start_provenance','projectId','apiKey','url','timestamp','engineVersion','tuneVersion','eventCount','sessionDurationMs','device','metrics','shapes'].sort());
    assert.equal('events' in payload,false);assert.equal('foundations' in payload,false);
});

test('batch parity covers equal timestamps, nonspatial input, pauses and random paths',()=>{
    const engine=initEngine(createSdkContext());
    let seed=12345;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let trial=0;trial<40;trial++){
        let ts=0;const events=Array.from({length:20+trial*29},(_,i)=>{
            ts+=trial===0?0:random()<0.3?0:random()*1000;
            return trial%3===0?{type:i%2?'key':'scroll',ts}:{type:i%3?'mouse':'touch_move',ts,x:random()*1000,y:random()*1000};
        });
        const expected=engine._calculateMetrics(engine._calculateFoundations(engine._buildTimeline(events)));
        const actual=engine._analyzeBuffer(events,60000).metrics;
        for(const key of Object.keys(expected))assert.ok(Math.abs(actual[key]-expected[key])<=0.0001,`${trial} ${key}`);
    }
});
