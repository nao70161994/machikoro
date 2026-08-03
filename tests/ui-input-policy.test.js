'use strict';

const assert = require('assert');
const UiInputPolicy = require('../js/uiInputPolicy');
const { runTest } = require('./helpers/test-utils');

runTest('ui input policyはonline block理由の既存優先順を維持する', () => {
    assert.strictEqual(UiInputPolicy.onlineBlockReason({ isOnlineGame: false }), '');
    assert.strictEqual(UiInputPolicy.onlineBlockReason({
        isOnlineGame: true,
        isReconnecting: true,
        actionInFlight: true,
        socketAvailable: false,
    }), UiInputPolicy.BLOCK_REASONS.RECONNECTING);
    assert.strictEqual(UiInputPolicy.onlineBlockReason({
        isOnlineGame: true,
        actionInFlight: true,
        socketAvailable: false,
    }), UiInputPolicy.BLOCK_REASONS.ACTION_IN_FLIGHT);
    assert.strictEqual(UiInputPolicy.onlineBlockReason({
        isOnlineGame: true,
        socketAvailable: false,
    }), UiInputPolicy.BLOCK_REASONS.DISCONNECTED);
    assert.strictEqual(UiInputPolicy.onlineBlockReason({
        isOnlineGame: true,
        socketAvailable: true,
        socketConnected: true,
    }), '');
});

runTest('ui input policyはlocal/online/CPUのhuman turn契約を維持する', () => {
    assert.strictEqual(UiInputPolicy.isHumanTurn({ hasGame: false }), false);
    assert.strictEqual(UiInputPolicy.isHumanTurn({ hasGame: true, isCpuTurn: true }), false);
    assert.strictEqual(UiInputPolicy.isHumanTurn({
        hasGame: true,
        isOnlineGame: true,
        onlineBlockReason: 'reconnecting',
        currentPlayerIndex: 0,
        myPlayerIndex: 0,
    }), false);
    assert.strictEqual(UiInputPolicy.isHumanTurn({
        hasGame: true,
        isOnlineGame: false,
        currentPlayerIndex: 1,
        myPlayerIndex: 0,
    }), true);
    assert.strictEqual(UiInputPolicy.isHumanTurn({
        hasGame: true,
        isOnlineGame: true,
        currentPlayerIndex: 1,
        myPlayerIndex: 0,
    }), false);
});

runTest('ui input policyはhuman turnで許可済みactionだけを表示する', () => {
    const allowed = new Set(['rollDice']);
    assert.strictEqual(UiInputPolicy.canShowAction('rollDice', true, allowed), true);
    assert.strictEqual(UiInputPolicy.canShowAction('nextTurn', true, allowed), false);
    assert.strictEqual(UiInputPolicy.canShowAction('rollDice', false, allowed), false);
    assert.strictEqual(UiInputPolicy.canShowAction('', true, allowed), false);
});
