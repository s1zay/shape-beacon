import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

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
        removeEventListener() {},
        dispatch(type, event = { type }) {
            for (const listener of listeners.get(type) || []) listener(event);
        }
    };
}

function createSdkContext({
    storage = new MemorySessionStorage(),
    startTime = 1000,
    locationHref = 'https://example.com/home'
} = {}) {
    const sentPayloads = [];
    const documentTarget = createEventTarget();
    const windowTarget = createEventTarget();
    const clock = { now: startTime };
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
        setTimeout,
        clearTimeout
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

function summary(eventCount, intensity, shape) {
    return {
        eventCount,
        sessionDurationMs: 1000,
        device: 'desktop',
        metrics: { intensity, rhythm: intensity, exploration: intensity, coherence: intensity },
        shapes: {
            steady: shape === 'steady' ? 1 : 0,
            burst: shape === 'burst' ? 1 : 0,
            drift: 0,
            chaotic: 0,
            flat: 0,
            ambient: 0,
            undetermined: 0
        }
    };
}

function runFiveChunks(engine, phase) {
    for (let index = 0; index < 5; index++) {
        engine.collector.events = [{ phase }];
        engine._handleChunkLimit();
    }
}

const rawEvents = count => Array.from({ length: count }, (_, index) => ({
    type: 'mouse',
    ts: index * 10,
    x: index,
    y: index
}));

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

test('new documents get new Page Sessions while same-tab storage keeps Domain Session', () => {
    const storage = new MemorySessionStorage();
    const firstEnvironment = createSdkContext({ storage });
    const first = initEngine(firstEnvironment);
    firstEnvironment.window.location.href = 'https://example.com/pricing';
    const secondEnvironment = createSdkContext({ storage });
    const second = initEngine(secondEnvironment);

    assert.notEqual(first.pageSessionId, second.pageSessionId);
    assert.equal(first.domainSessionId, second.domainSessionId);

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
    engine._analyzeBuffer = events => events.length === 0
        ? summary(0, 0, 'steady')
        : summary(10000, events[0].phase === 'early' ? 0.2 : 0.8, events[0].phase === 'early' ? 'steady' : 'burst');

    environment.clock.now = 61000;
    runFiveChunks(engine, 'early');
    assert.equal(engine.collector.events.length, 0);
    assert.equal(engine.chunkHistory.length, 0);
    assert.equal(engine.cumulativeSummary.eventCount, 50000);

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
    assert.equal(first.metrics.intensity, 0.2);
    assert.equal(second.metrics.intensity, 0.5);
    assert.equal(second.shapes.steady, 0.5);
    assert.equal(second.shapes.burst, 0.5);
    assert.equal(engine.collector.events.length, 0);
    assert.equal(engine.chunkHistory.length, 0);
    assert.equal(engine.cumulativeSummary.eventCount, 100000);
});

test('the collector still triggers its autosave after five real 10K raw-event buffers', () => {
    const environment = createSdkContext();
    const engine = initEngine(environment);
    const pageSessionId = engine.pageSessionId;
    engine._analyzeBuffer = events => summary(events.length, 0.4, 'steady');

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
    assert.equal(engine.chunkHistory.length, 0);
    assert.equal(engine.cumulativeSummary.eventCount, 50000);
});

test('payload uses the Catcher v2 field names and required scalar types', () => {
    const environment = createSdkContext();
    const engine = initEngine(environment);
    engine.forceSend();
    const payload = environment.sentPayloads[0].body;

    assert.equal(payload.payloadSchema, 'v2');
    assert.equal(payload.engineVersion, '4.1.5');
    assert.equal(payload.tuneVersion, '2.17');
    assert.equal(typeof payload.page_session_id, 'string');
    assert.equal(typeof payload.domain_session_id, 'string');
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
    assert.equal(environment.sentPayloads[0].body.payloadSchema, 'v2');
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

test('emitted payload passes the on_shape Catcher validator', async t => {
    const onShapeRoot = process.env.ON_SHAPE_ROOT;
    if (!onShapeRoot) return t.skip('Set ON_SHAPE_ROOT for the cross-repository contract check');

    const validatorUrl = pathToFileURL(path.join(onShapeRoot, 'workers/catcher/session-storage.mjs'));
    const { validatePageSessionPayload } = await import(validatorUrl.href);
    const environment = createSdkContext();
    const engine = initEngine(environment);
    engine.forceSend();
    assert.doesNotThrow(() => validatePageSessionPayload(environment.sentPayloads[0].body));
});
