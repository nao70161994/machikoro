'use strict';

const assert = require('assert');
const UiTurnPrivacy = require('../js/uiTurnPrivacy');
const { runTest } = require('./helpers/test-utils');

runTest('turn privacyはローカル人間の手番変更だけを引き渡し対象にする', () => {
    const controller = UiTurnPrivacy.createHandoffController();
    assert.strictEqual(controller.observe({ turnChanged: false, playerIndex: 0, playerName: 'Alice' }).visible, false);
    assert.strictEqual(controller.observe({ turnChanged: true, isOnlineGame: true, humanPlayerCount: 2, playerIndex: 1, playerName: 'Bob' }).visible, false);
    assert.strictEqual(controller.observe({ turnChanged: true, isCpuTurn: true, humanPlayerCount: 2, playerIndex: 1, playerName: 'CPU' }).visible, false);
    assert.strictEqual(controller.observe({ turnChanged: true, humanPlayerCount: 1, playerIndex: 0, playerName: 'Alice' }).visible, false);
    assert.deepStrictEqual(controller.observe({ turnChanged: true, humanPlayerCount: 2, playerIndex: 1, playerName: ' Bob ' }), {
        visible: true, playerIndex: 1, playerName: 'Bob',
    });
    assert.strictEqual(controller.dismiss().visible, false);
});

runTest('hapticsは明示有効かつ動作軽減なしの場合だけ既定patternを渡す', () => {
    const calls = [];
    assert.strictEqual(UiTurnPrivacy.vibrate('turn', { enabled: false, vibrate: value => calls.push(value) }), false);
    assert.strictEqual(UiTurnPrivacy.vibrate('win', { enabled: true, reducedMotion: true, vibrate: value => calls.push(value) }), false);
    assert.strictEqual(UiTurnPrivacy.vibrate('turn', { enabled: true, vibrate: value => { calls.push(value); return true; } }), true);
    assert.deepStrictEqual(calls, [[35]]);
});
