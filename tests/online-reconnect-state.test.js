const assert = require('assert');
const OnlineReconnectState = require('../js/onlineReconnectState');
const { runTest } = require('./helpers/test-utils');

const STATES = OnlineReconnectState.states;

runTest('online reconnect stateは移行準備に必要な8状態を固定する', () => {
    assert.deepStrictEqual(Object.values(STATES), [
        'idle',
        'connecting',
        'rejoining',
        'restoring',
        'replaying',
        'active',
        'failed',
        'completed',
    ]);
    assert.deepStrictEqual(
        Object.keys(OnlineReconnectState.transitions).sort(),
        Object.values(STATES).sort()
    );
});

runTest('online reconnect stateは許可遷移と禁止遷移を区別する', () => {
    assert.strictEqual(
        OnlineReconnectState.canTransition(STATES.ACTIVE, STATES.REJOINING),
        true
    );
    assert.strictEqual(
        OnlineReconnectState.canTransition(STATES.REJOINING, STATES.RESTORING),
        true
    );
    assert.strictEqual(
        OnlineReconnectState.canTransition(STATES.RESTORING, STATES.REPLAYING),
        true
    );
    assert.strictEqual(
        OnlineReconnectState.canTransition(STATES.REPLAYING, STATES.ACTIVE),
        true
    );
    assert.strictEqual(
        OnlineReconnectState.canTransition(STATES.IDLE, STATES.REPLAYING),
        false
    );
    assert.strictEqual(
        OnlineReconnectState.canTransition(STATES.COMPLETED, STATES.RESTORING),
        false
    );
    assert.strictEqual(OnlineReconnectState.canTransition('unknown', STATES.IDLE), false);
});

runTest('online reconnect state観測は失敗と復元処理を優先する', () => {
    assert.strictEqual(OnlineReconnectState.derive(), STATES.IDLE);
    assert.strictEqual(OnlineReconnectState.derive({ active: true }), STATES.ACTIVE);
    assert.strictEqual(
        OnlineReconnectState.derive({ active: true, connecting: true }),
        STATES.CONNECTING
    );
    assert.strictEqual(
        OnlineReconnectState.derive({ active: true, connecting: true, rejoining: true }),
        STATES.REJOINING
    );
    assert.strictEqual(
        OnlineReconnectState.derive({ rejoining: true, restoring: true }),
        STATES.RESTORING
    );
    assert.strictEqual(
        OnlineReconnectState.derive({ restoring: true, replaying: true }),
        STATES.REPLAYING
    );
    assert.strictEqual(
        OnlineReconnectState.derive({ replaying: true, failed: true }),
        STATES.FAILED
    );
    assert.strictEqual(
        OnlineReconnectState.derive({ active: true, completed: true }),
        STATES.COMPLETED
    );
});
