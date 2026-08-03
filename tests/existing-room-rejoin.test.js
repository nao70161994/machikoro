'use strict';

const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const {
    REQUIRED_EFFECTS,
    existingRoomRejoinEffectAuthorityEnabled,
    executeExistingRoomRejoin,
} = require('../server/existingRoomRejoin');

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
