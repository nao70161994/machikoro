'use strict';

const assert = require('assert');
const LocalActionPolicy = require('../js/localActionPolicy');
const { runTest } = require('./helpers/test-utils');

runTest('local action policyは人間操作block理由を既存優先順位で返す', () => {
    const ready = {
        hasGame: true,
        hasWinner: false,
        expectedPlayerIndex: null,
        currentPlayerIndex: 1,
        isCpuTurn: false,
        isOnlineGame: false,
        myPlayerIndex: 1,
        isReconnecting: false,
        onlineActionInFlight: false,
        socketConnected: true,
    };
    assert.strictEqual(LocalActionPolicy.humanActionBlockedReason({ ...ready, hasGame: false }), 'no-game');
    assert.strictEqual(LocalActionPolicy.humanActionBlockedReason({ ...ready, hasWinner: true }), 'winner');
    assert.strictEqual(LocalActionPolicy.humanActionBlockedReason({ ...ready, expectedPlayerIndex: 0 }), 'stale-player');
    assert.strictEqual(LocalActionPolicy.humanActionBlockedReason({ ...ready, isCpuTurn: true }), 'cpu-turn');
    assert.strictEqual(LocalActionPolicy.humanActionBlockedReason({ ...ready, isOnlineGame: true, myPlayerIndex: 0 }), 'not-my-turn');
    assert.strictEqual(LocalActionPolicy.humanActionBlockedReason({ ...ready, isOnlineGame: true, isReconnecting: true }), 'reconnecting');
    assert.strictEqual(LocalActionPolicy.humanActionBlockedReason({ ...ready, isOnlineGame: true, onlineActionInFlight: true }), 'online-in-flight');
    assert.strictEqual(LocalActionPolicy.humanActionBlockedReason({ ...ready, isOnlineGame: true, socketConnected: false }), 'socket-disconnected');
    assert.strictEqual(LocalActionPolicy.humanActionBlockedReason(ready), '');
});

runTest('local action policyはoffline時のonline状態を無視して入力を変更しない', () => {
    const input = {
        hasGame: true,
        currentPlayerIndex: 0,
        expectedPlayerIndex: 0,
        isCpuTurn: false,
        isOnlineGame: false,
        myPlayerIndex: 1,
        isReconnecting: true,
        onlineActionInFlight: true,
        socketConnected: false,
    };
    const before = JSON.stringify(input);

    assert.strictEqual(LocalActionPolicy.canRunHumanAction(input), true);
    assert.strictEqual(JSON.stringify(input), before);
});
