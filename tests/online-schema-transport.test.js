const assert = require('assert');
const OnlineSchemaTransport = require('../js/onlineSchemaTransport');

function createHarness(enabledNames = []) {
    const calls = [];
    const enabled = new Set(enabledNames);
    const root = { marker: 'root' };
    let selection = { actionSchemaVersion: 1, snapshotSchemaVersion: 1 };
    const transport = OnlineSchemaTransport.create({
        runtimeFlags: {
            isEnabled(name, value) {
                calls.push(['flag', name, value]);
                return enabled.has(name);
            },
        },
        negotiation: {
            transportCapabilities(value) {
                calls.push(['capabilities', value]);
                return value ? { actionSchemaVersions: [1] } : null;
            },
            supportsSelection(capabilities, value) {
                calls.push(['supports', capabilities, value]);
                return value === selection;
            },
        },
        actionWire: {
            encodeActionPayload(...args) {
                calls.push(['encodeAction', ...args]);
                return { ok: true, value: { encoded: args[3] } };
            },
            decodeActionPayload(...args) {
                calls.push(['decodeAction', ...args]);
                return { ok: true, value: { decoded: args[3] } };
            },
            decodeSnapshotField(...args) {
                calls.push(['decodeSnapshot', ...args]);
                return { ok: true, value: { snapshot: args[2] } };
            },
        },
        recreateWire: {
            encode(...args) {
                calls.push(['encodeRecreate', ...args]);
                return { ok: true, value: { recreate: args[1] } };
            },
        },
        getFlagRoot: () => root,
        getSelection: () => selection,
    });
    return { transport, calls, root, selection, setSelection: value => { selection = value; } };
}

{
    const payload = { action: 'rollDice' };
    const { transport } = createHarness();
    assert.deepStrictEqual(transport.encodeAction(payload), { ok: true, value: payload });
    assert.deepStrictEqual(transport.decodeAction(payload), { ok: true, value: payload });
    assert.deepStrictEqual(transport.decodeSnapshot(payload), { ok: true, value: payload });
    assert.deepStrictEqual(transport.encodeRecreate(payload), { ok: true, value: payload });
    assert.strictEqual(transport.acceptsSelection({ unsupported: true }), true);
    assert.strictEqual(transport.capabilities(), null);
}

{
    const enabled = [
        'isGameSchemaNegotiationTransportEnabled',
        'isGameSchemaWireTransportEnabled',
        'isGameSchemaSnapshotWireTransportEnabled',
        'isGameSchemaRecreateWireTransportEnabled',
    ];
    const harness = createHarness(enabled);
    const action = { action: 'buildCard' };
    assert.deepStrictEqual(harness.transport.encodeAction(action), {
        ok: true,
        value: { encoded: action },
    });
    assert.deepStrictEqual(harness.transport.decodeAction(action), {
        ok: true,
        value: { decoded: action },
    });
    const selectedSnapshot = { gameStartPayload: { gameSchema: { snapshotSchemaVersion: 7 } } };
    assert.deepStrictEqual(harness.transport.decodeSnapshot(selectedSnapshot), {
        ok: true,
        value: { snapshot: selectedSnapshot },
    });
    assert.deepStrictEqual(harness.transport.encodeRecreate(action), {
        ok: true,
        value: { recreate: action },
    });
    assert.strictEqual(harness.transport.acceptsSelection(harness.selection), true);
    assert.ok(harness.calls.some(call => call[0] === 'encodeAction' &&
        call[1] === true && call[2] === false && call[3] === harness.selection && call[4] === action));
    assert.ok(harness.calls.some(call => call[0] === 'decodeSnapshot' &&
        call[2].snapshotSchemaVersion === 7 && call[3] === selectedSnapshot));
    assert.ok(harness.calls.filter(call => call[0] === 'flag').every(call => call[2] === harness.root));
}

{
    const enabled = [
        'isGameSchemaNegotiationTransportEnabled',
        'isGameSchemaWireTransportEnabled',
        'isGameSchemaSnapshotWireTransportEnabled',
        'isGameSchemaRecreateWireTransportEnabled',
    ];
    const transport = OnlineSchemaTransport.create({
        runtimeFlags: { isEnabled: name => enabled.includes(name) },
        getSelection: () => ({ actionSchemaVersion: 1 }),
    });
    assert.deepStrictEqual(transport.encodeAction({}), { ok: false, reason: 'wire-codec-unavailable' });
    assert.deepStrictEqual(transport.decodeAction({}), { ok: false, reason: 'wire-codec-unavailable' });
    assert.deepStrictEqual(transport.decodeSnapshot({}), { ok: false, reason: 'wire-codec-unavailable' });
    assert.deepStrictEqual(transport.encodeRecreate({}), { ok: false, reason: 'recreate-codec-unavailable' });
    assert.strictEqual(transport.acceptsSelection(null), true);
    assert.strictEqual(transport.acceptsSelection({}), false);
}

console.log('online-schema-transport.test.js passed');
