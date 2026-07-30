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

runTest('online reconnect event reducerはlegacy lifecycleを副作用なしで再現する', () => {
    const events = OnlineReconnectState.events;
    let state = STATES.IDLE;
    const step = (event, context = {}) => {
        const result = OnlineReconnectState.reduceEvent(state, event, context);
        assert.strictEqual(result.ok, true, JSON.stringify(result));
        state = result.state;
        return state;
    };

    assert.strictEqual(step(events.RECONNECT_REQUESTED), STATES.CONNECTING);
    assert.strictEqual(step(events.RECONNECT_REQUESTED, { socketConnected: true }), STATES.REJOINING);
    assert.strictEqual(step(events.RESTORE_STARTED), STATES.RESTORING);
    assert.strictEqual(step(events.REPLAY_STARTED), STATES.REPLAYING);
    assert.strictEqual(step(events.RESTORE_ACTIVATED), STATES.ACTIVE);
    assert.strictEqual(step(events.SOCKET_DISCONNECTED), STATES.CONNECTING);
    assert.strictEqual(step(events.RECONNECT_REQUESTED, { socketConnected: true }), STATES.REJOINING);
    assert.strictEqual(step(events.RETRY_EXHAUSTED), STATES.FAILED);
    assert.strictEqual(step(events.RESET), STATES.IDLE);

    assert.deepStrictEqual(OnlineReconnectState.reduceEvent('unknown', events.RESET), {
        ok: false,
        reason: 'unknown-state',
        state: 'unknown',
    });
    assert.deepStrictEqual(OnlineReconnectState.reduceEvent(STATES.IDLE, 'unknown'), {
        ok: false,
        reason: 'unknown-event',
        state: STATES.IDLE,
    });
});

runTest('online reconnect stateは復元・replay中の切断をconnectingへ戻せる', () => {
    const event = OnlineReconnectState.events.SOCKET_DISCONNECTED;
    assert.strictEqual(OnlineReconnectState.reduceEvent(STATES.RESTORING, event).state, STATES.CONNECTING);
    assert.strictEqual(OnlineReconnectState.reduceEvent(STATES.REPLAYING, event).state, STATES.CONNECTING);
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

runTest('online reconnect eventとlegacy boolean投影の一致を表駆動で検査する', () => {
    const events = OnlineReconnectState.events;
    const cases = [
        [events.RECONNECT_REQUESTED, { connecting: true }, STATES.CONNECTING],
        [events.RECONNECT_REQUESTED, { rejoining: true }, STATES.REJOINING],
        [events.SOCKET_DISCONNECTED, { connecting: true }, STATES.CONNECTING],
        [events.RESTORE_STARTED, { restoring: true }, STATES.RESTORING],
        [events.REPLAY_STARTED, { replaying: true }, STATES.REPLAYING],
        [events.RESTORE_ACTIVATED, { active: true }, STATES.ACTIVE],
        [events.RETRY_EXHAUSTED, { failed: true }, STATES.FAILED],
        [events.GAME_COMPLETED, { completed: true }, STATES.COMPLETED],
        [events.RESET, {}, STATES.IDLE],
    ];

    for (const [event, flags, state] of cases) {
        assert.deepStrictEqual(OnlineReconnectState.compareEventProjection(event, flags), {
            ok: true,
            event,
            eventState: state,
            projectedState: state,
            matched: true,
        });
    }

    assert.deepStrictEqual(
        OnlineReconnectState.compareEventProjection(events.REPLAY_STARTED, { restoring: true }),
        {
            ok: true,
            event: events.REPLAY_STARTED,
            eventState: STATES.REPLAYING,
            projectedState: STATES.RESTORING,
            matched: false,
        }
    );
    assert.deepStrictEqual(OnlineReconnectState.compareEventProjection('unknown', { active: true }), {
        ok: false,
        reason: 'unknown-event',
        projectedState: STATES.ACTIVE,
    });
});

runTest('online reconnect controller は許可遷移とbounded履歴を保持する', () => {
    const controller = OnlineReconnectState.createController({ historyLimit: 3 });
    assert.deepStrictEqual(controller.transition(STATES.CONNECTING, { event: 'connect-start' }), {
        ok: true,
        from: STATES.IDLE,
        to: STATES.CONNECTING,
        state: STATES.CONNECTING,
    });
    controller.transition(STATES.REJOINING, { event: 'socket-connect' });
    controller.transition(STATES.RESTORING, { event: 'rejoin-data' });
    controller.transition(STATES.REPLAYING, { event: 'replay-start' });
    const snapshot = controller.snapshot();
    assert.strictEqual(snapshot.state, STATES.REPLAYING);
    assert.strictEqual(snapshot.invalidTransitionCount, 0);
    assert.strictEqual(snapshot.history.length, 3);
    assert.deepStrictEqual(snapshot.history.map(entry => entry.event), [
        'socket-connect',
        'rejoin-data',
        'replay-start',
    ]);
});

runTest('online reconnect controller は明示transitionをfail closed、shadow reconcileを記録する', () => {
    const controller = OnlineReconnectState.createController();
    assert.deepStrictEqual(controller.transition(STATES.REPLAYING), {
        ok: false,
        reason: 'invalid-transition',
        from: STATES.IDLE,
        to: STATES.REPLAYING,
        state: STATES.IDLE,
    });
    assert.strictEqual(controller.getState(), STATES.IDLE);
    const shadow = controller.reconcile({ replaying: true }, { event: 'legacy-flags' });
    assert.deepStrictEqual(shadow, {
        state: STATES.REPLAYING,
        from: STATES.IDLE,
        valid: false,
    });
    assert.strictEqual(controller.snapshot().invalidTransitionCount, 2);
    assert.deepStrictEqual(controller.transition('unknown'), {
        ok: false,
        reason: 'unknown-state',
        state: STATES.REPLAYING,
    });
});

runTest('online reconnect controllerは既知lifecycle eventをshadow stateへ記録する', () => {
    const controller = OnlineReconnectState.createController();
    const events = OnlineReconnectState.events;
    assert.strictEqual(OnlineReconnectState.isEvent(events.RECONNECT_REQUESTED), true);
    assert.strictEqual(OnlineReconnectState.isEvent('unknown'), false);

    assert.strictEqual(controller.observe(events.RECONNECT_REQUESTED, { connecting: true }).valid, true);
    assert.strictEqual(controller.observe(events.RECONNECT_REQUESTED, { rejoining: true }).valid, true);
    assert.strictEqual(controller.observe(events.RECONNECT_REQUESTED, { rejoining: true }).valid, true);
    assert.strictEqual(controller.observe(events.RESTORE_STARTED, { restoring: true }).valid, true);
    assert.strictEqual(controller.observe(events.REPLAY_STARTED, { replaying: true }).valid, true);
    assert.strictEqual(controller.observe(events.RESTORE_ACTIVATED, { active: true }).valid, true);
    assert.strictEqual(controller.observe(events.GAME_COMPLETED, { completed: true }).valid, true);
    assert.strictEqual(controller.observe(events.RESET, {}).valid, true);
    assert.deepStrictEqual(controller.snapshot().history.map(entry => entry.event), [
        events.RECONNECT_REQUESTED,
        events.RECONNECT_REQUESTED,
        events.RECONNECT_REQUESTED,
        events.RESTORE_STARTED,
        events.REPLAY_STARTED,
        events.RESTORE_ACTIVATED,
        events.GAME_COMPLETED,
        events.RESET,
    ]);
    assert.deepStrictEqual(controller.observe('unknown', {}), {
        ok: false,
        reason: 'unknown-event',
        state: STATES.IDLE,
    });
});
