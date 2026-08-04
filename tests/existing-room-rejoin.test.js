'use strict';

const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const {
    REQUIRED_EFFECTS,
    existingRoomRejoinEffectAuthorityEnabled,
    executeExistingRoomRejoin,
} = require('../server/existingRoomRejoin');
const makeExistingRoomRestoreRuntime = require('../server/existingRoomRestoreRuntime');

function makeHarness(overrides = {}) {
    const calls = [];
    const effects = {};
    for (const name of REQUIRED_EFFECTS) {
        effects[name] = () => {
            calls.push(name);
            if (name === 'resolvePlayer') return { index: 0 };
            if (name === 'isHostConnected') return true;
            return undefined;
        };
    }
    for (const [name, result] of Object.entries(overrides)) {
        effects[name] = () => {
            calls.push(name);
            return result;
        };
    }
    return { calls, effects };
}

runTest('existing room rejoin effect authorityは明示opt-inだけを許可する', () => {
    for (const value of ['1', 'true', ' TRUE ']) {
        assert.strictEqual(existingRoomRejoinEffectAuthorityEnabled({
            EXISTING_ROOM_REJOIN_EFFECT_AUTHORITY_ENABLED: value,
        }), true);
    }
    for (const value of [undefined, '', '0', 'false', 'yes']) {
        assert.strictEqual(existingRoomRejoinEffectAuthorityEnabled({
            EXISTING_ROOM_REJOIN_EFFECT_AUTHORITY_ENABLED: value,
        }), false);
    }
});

runTest('existing room rejoin executorはhost接続中の既存effect順を固定する', () => {
    const harness = makeHarness();
    const result = executeExistingRoomRejoin(harness.effects);
    assert.deepStrictEqual(harness.calls, [
        'detachExisting',
        'resolvePlayer',
        'joinSocket',
        'assignSocketRoom',
        'assignSocketPlayer',
        'isHostConnected',
        'touchRoom',
        'emitRejoinData',
        'broadcastPlayerRejoined',
    ]);
    assert.deepStrictEqual(result, { ok: true, executed: harness.calls });
    assert.strictEqual(Object.isFrozen(result), true);
    assert.strictEqual(Object.isFrozen(result.executed), true);
});

runTest('existing room rejoin executorはhost再選出と永続化を通知前に行う', () => {
    const harness = makeHarness({ isHostConnected: false });
    const result = executeExistingRoomRejoin(harness.effects);
    assert.deepStrictEqual(harness.calls, [
        'detachExisting',
        'resolvePlayer',
        'joinSocket',
        'assignSocketRoom',
        'assignSocketPlayer',
        'isHostConnected',
        'setHostPlayer',
        'emitHostChanged',
        'persistHostReselected',
        'logHostReselected',
        'touchRoom',
        'emitRejoinData',
        'broadcastPlayerRejoined',
    ]);
    assert.strictEqual(result.ok, true);
});

runTest('existing room rejoin executorはplayer不一致後のeffectを実行しない', () => {
    const harness = makeHarness({ resolvePlayer: null });
    const result = executeExistingRoomRejoin(harness.effects);
    assert.deepStrictEqual(harness.calls, ['detachExisting', 'resolvePlayer']);
    assert.deepStrictEqual(result, {
        ok: false,
        errorMessage: '再接続情報が一致しません',
        executed: ['detachExisting', 'resolvePlayer'],
    });
});

runTest('existing room rejoin executorは依存不足を全effect前に拒否する', () => {
    const harness = makeHarness();
    harness.effects.broadcastPlayerRejoined = null;
    assert.throws(
        () => executeExistingRoomRejoin(harness.effects),
        /broadcastPlayerRejoined effect is required/
    );
    assert.deepStrictEqual(harness.calls, []);
});


function makeRuntimeHarness(options = {}) {
    const calls = [];
    const socket = { id: 'socket-1' };
    const dependencies = {
        planAdmission() {
            calls.push('planAdmission');
            return options.admission || { ok: true, action: 'rejoin' };
        },
        emitAppError(_socket, message) {
            calls.push('emitAppError:' + message);
        },
        effectAuthorityEnabled: options.effectAuthorityEnabled === true,
        executeRejoin(effects) {
            calls.push('executeRejoin');
            return executeExistingRoomRejoin(effects);
        },
    };
    for (const name of [
        'detachExisting',
        'resolvePlayer',
        'joinSocket',
        'isHostConnected',
        'setHostPlayer',
        'emitHostChanged',
        'persistHostReselected',
        'logHostReselected',
        'touchRoom',
        'emitRejoinData',
        'broadcastPlayerRejoined',
    ]) {
        dependencies[name] = () => {
            calls.push(name);
            if (name === 'resolvePlayer') return options.player === null ? null : { index: 0 };
            if (name === 'isHostConnected') return options.hostConnected !== false;
            return undefined;
        };
    }
    const runtime = makeExistingRoomRestoreRuntime(dependencies);
    const input = {
        socket,
        room: {},
        roomId: '123456',
        playerIndex: 0,
        playerName: 'Alice',
        admissionInput: { marker: true },
    };
    return { calls, runtime, input, socket };
}

runTest('existing room restore runtimeはreplace判断を副作用なしで呼出元へ返す', () => {
    const harness = makeRuntimeHarness({ admission: { ok: true, action: 'replace' } });
    assert.deepStrictEqual(harness.runtime.handle(harness.input), { handled: false });
    assert.deepStrictEqual(harness.calls, ['planAdmission']);
});

runTest('existing room restore runtimeはlegacy fallbackのeffect順とsocket割当を維持する', () => {
    const harness = makeRuntimeHarness({ hostConnected: false });
    assert.deepStrictEqual(harness.runtime.handle(harness.input), { handled: true });
    assert.strictEqual(harness.socket.roomId, '123456');
    assert.strictEqual(harness.socket.playerIndex, 0);
    assert.deepStrictEqual(harness.calls, [
        'planAdmission',
        'detachExisting',
        'resolvePlayer',
        'joinSocket',
        'isHostConnected',
        'setHostPlayer',
        'emitHostChanged',
        'persistHostReselected',
        'logHostReselected',
        'touchRoom',
        'emitRejoinData',
        'broadcastPlayerRejoined',
    ]);
});

runTest('existing room restore runtimeはauthority opt-in時だけ既存executorへ委譲する', () => {
    const harness = makeRuntimeHarness({ effectAuthorityEnabled: true });
    assert.deepStrictEqual(harness.runtime.handle(harness.input), { handled: true });
    assert.deepStrictEqual(harness.calls.slice(0, 3), [
        'planAdmission',
        'executeRejoin',
        'detachExisting',
    ]);
});

runTest('existing room restore runtimeはadmissionとplayer不一致を同じappError境界で拒否する', () => {
    const rejected = makeRuntimeHarness({
        admission: { ok: false, errorMessage: '復元不可' },
    });
    rejected.runtime.handle(rejected.input);
    assert.deepStrictEqual(rejected.calls, ['planAdmission', 'emitAppError:復元不可']);

    const missingPlayer = makeRuntimeHarness({ player: null });
    missingPlayer.runtime.handle(missingPlayer.input);
    assert.deepStrictEqual(missingPlayer.calls, [
        'planAdmission',
        'detachExisting',
        'resolvePlayer',
        'emitAppError:再接続情報が一致しません',
    ]);
});
