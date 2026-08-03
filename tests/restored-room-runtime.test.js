'use strict';

const assert = require('assert');
const makeRestoredRoomRuntime = require('../server/restoredRoomRuntime');
const { runTest } = require('./helpers/test-utils');

function makeRuntime(options = {}) {
    const calls = options.calls || [];
    return makeRestoredRoomRuntime({
        activationDecisions: { REJECT_EXISTING_HOSTLESS: 'reject-existing-hostless' },
        activationEffectAuthorityEnabled: options.activationAuthority === true,
        deliveryEffectAuthorityEnabled: options.deliveryAuthority === true,
        planActivation(input) {
            calls.push(['plan-activation', input]);
            return input.roomExists && input.approvedHostless
                ? {
                    decision: 'reject-existing-hostless',
                    detachExisting: false,
                    deleteExisting: false,
                    install: false,
                }
                : {
                    decision: input.roomExists ? 'replace-existing' : 'install-new',
                    detachExisting: input.roomExists,
                    deleteExisting: input.roomExists,
                    install: true,
                };
        },
        executeActivation(plan, effects) {
            calls.push(['execute-activation', plan.decision]);
            if (plan.detachExisting) effects.detachExisting();
            if (plan.deleteExisting) effects.deleteExisting();
            if (plan.install) effects.install();
        },
        executeDelivery(effects) {
            calls.push(['execute-delivery']);
            effects.persist();
            effects.joinSocket();
            effects.assignSocketRoom();
            effects.assignSocketPlayer();
            effects.emitRejoinData();
        },
        planCompletion(input) {
            calls.push(['plan-completion', input]);
            return { logMessage: 'restored', result: { ok: true, roomId: input.roomId } };
        },
        executeCompletion(plan, effects) {
            calls.push(['execute-completion']);
            effects.log(plan.logMessage);
            return plan.result;
        },
    });
}

function runtimeEffects(calls) {
    return {
        detachExisting() { calls.push('detach'); },
        deleteExisting() { calls.push('delete'); },
        install() { calls.push('install'); },
        persist() { calls.push('persist'); },
        joinSocket() { calls.push('join'); },
        assignSocketRoom() { calls.push('room'); },
        assignSocketPlayer() { calls.push('player'); },
        emitRejoinData() { calls.push('emit'); },
        log(message) { calls.push(['log', message]); },
    };
}

runTest('restored room runtimeはlegacy fallbackでinstallからdeliveryまで既存順を保つ', () => {
    const calls = [];
    const runtime = makeRuntime({ calls });
    const restoredRoom = { roomId: 'ROOM01' };
    const result = runtime.activateRestoredRoom({
        roomExists: true,
        approvedHostless: false,
        roomId: 'ROOM01',
        playerName: 'Alice',
        playerIndex: 0,
        restoredRoom,
    }, runtimeEffects(calls));

    assert.deepStrictEqual(result, { ok: true, roomId: 'ROOM01' });
    assert.deepStrictEqual(calls, [
        ['plan-activation', { roomExists: true, approvedHostless: false }],
        'detach', 'delete', 'install', 'persist', 'join', 'room', 'player', 'emit',
        ['plan-completion', {
            roomId: 'ROOM01',
            playerName: 'Alice',
            playerIndex: 0,
            approvedHostless: false,
            restoredRoom,
        }],
        ['execute-completion'],
        ['log', 'restored'],
    ]);
});

runTest('restored room runtimeは明示authority時だけ既存executorへ委譲する', () => {
    const calls = [];
    const runtime = makeRuntime({
        calls,
        activationAuthority: true,
        deliveryAuthority: true,
    });
    const result = runtime.activateRestoredRoom({
        roomExists: false,
        approvedHostless: false,
        roomId: 'ROOM02',
        playerName: 'Bob',
        playerIndex: 1,
        restoredRoom: {},
    }, runtimeEffects(calls));

    assert.deepStrictEqual(result, { ok: true, roomId: 'ROOM02' });
    assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'execute-activation'));
    assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'execute-delivery'));
    assert.ok(calls.indexOf('install') < calls.indexOf('persist'));
    assert.ok(calls.indexOf('persist') < calls.indexOf('emit'));
});

runTest('restored room runtimeは既存hostless roomをeffect前に拒否する', () => {
    const calls = [];
    const runtime = makeRuntime({ calls });
    const result = runtime.activateRestoredRoom({
        roomExists: true,
        approvedHostless: true,
        roomId: 'ROOM03',
    }, runtimeEffects(calls));

    assert.deepStrictEqual(result, {
        ok: false,
        reason: 'room-exists',
        errorMessage: '同じルームIDが既に使用されています',
    });
    assert.strictEqual(Object.isFrozen(result), true);
    assert.deepStrictEqual(calls, [[
        'plan-activation',
        { roomExists: true, approvedHostless: true },
    ]]);
});

runTest('restored room runtimeはeffect欠落をroom変更前に拒否する', () => {
    const calls = [];
    const runtime = makeRuntime({ calls });
    assert.throws(() => runtime.activateRestoredRoom({
        roomExists: false,
        approvedHostless: false,
        roomId: 'ROOM04',
        restoredRoom: {},
    }, {
        install() { calls.push('install'); },
    }), /persist effect is required/);
    assert.deepStrictEqual(calls, [[
        'plan-activation',
        { roomExists: false, approvedHostless: false },
    ]]);
});

runTest('restored room runtimeは依存欠落を初期化時に拒否する', () => {
    assert.throws(() => makeRestoredRoomRuntime({}), /planActivation dependency/);
});
