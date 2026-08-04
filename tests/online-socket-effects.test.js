'use strict';

const assert = require('assert');
const OnlineSocketEffects = require('../js/onlineSocketEffects');
const { runTest } = require('./helpers/test-utils');

function recorder() {
    const calls = [];
    return { calls, socket: { emit: (event, payload) => calls.push({ event, payload }) } };
}

runTest('online Socket effectsは既存event名とpayload identityを維持する', () => {
    const current = recorder();
    const payloads = Array.from({ length: 5 }, (_, index) => ({ index }));
    const runtime = OnlineSocketEffects.createRuntime({
        getSocket: () => current.socket,
        hostlessEvents: {
            REQUEST: 'requestHostlessRestore',
            CANDIDATE: 'submitHostlessRestoreCandidate',
            CONFIRM: 'confirmHostlessRestore',
        },
    });

    runtime.createRoom(payloads[0]);
    runtime.joinRoom(payloads[1]);
    runtime.rejoinRoom(payloads[2]);
    runtime.recreateRoom(payloads[3]);
    runtime.gameAction(payloads[4]);

    assert.deepStrictEqual(current.calls.map(call => call.event), [
        'createRoom',
        'joinRoom',
        'rejoinRoom',
        'recreateRoom',
        'gameAction',
    ]);
    assert.deepStrictEqual(current.calls.map(call => call.payload), payloads);
});

runTest('online Socket effectsはoverride socketとhostless event名を維持する', () => {
    const current = recorder();
    const override = recorder();
    const runtime = OnlineSocketEffects.createRuntime({
        getSocket: () => current.socket,
        hostlessEvents: {
            REQUEST: 'requestHostlessRestore',
            CANDIDATE: 'submitHostlessRestoreCandidate',
            CONFIRM: 'confirmHostlessRestore',
        },
    });

    runtime.gameAction({ action: 'rollDice' }, override.socket);
    runtime.requestHostlessRestore({ generation: 1 }, override.socket);
    runtime.submitHostlessRestoreCandidate({ generation: 1 }, override.socket);
    runtime.confirmHostlessRestore({ approved: true }, override.socket);

    assert.deepStrictEqual(current.calls, []);
    assert.deepStrictEqual(override.calls.map(call => call.event), [
        'gameAction',
        'requestHostlessRestore',
        'submitHostlessRestoreCandidate',
        'confirmHostlessRestore',
    ]);
});

runTest('online Socket effectsはSocketまたはhostless event欠落をfail closedにする', () => {
    const runtime = OnlineSocketEffects.createRuntime({ getSocket: () => null });
    assert.throws(() => runtime.createRoom({}), /Socket emit unavailable for createRoom/);
    assert.throws(() => runtime.requestHostlessRestore({}), /hostless event REQUEST is unavailable/);
    assert.ok(Object.isFrozen(OnlineSocketEffects.events));
});
