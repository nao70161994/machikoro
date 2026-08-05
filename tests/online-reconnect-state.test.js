const assert = require('assert');
const OnlineReconnectState = require('../js/onlineReconnectState');
const OnlineReconnectRuntime = require('../js/onlineReconnectRuntime');
const OnlineRetryPolicy = require('../js/onlineRetryPolicy');
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
        OnlineReconnectState.canTransition(STATES.ACTIVE, STATES.RESTORING),
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

    assert.strictEqual(step(events.GAME_ACTIVATED), STATES.ACTIVE);
    assert.strictEqual(step(events.SOCKET_DISCONNECTED), STATES.CONNECTING);
    assert.strictEqual(step(events.RECONNECT_REQUESTED, { socketConnected: true }), STATES.REJOINING);
    assert.strictEqual(step(events.RESET), STATES.IDLE);

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
        [events.GAME_ACTIVATED, { active: true }, STATES.ACTIVE],
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
    assert.strictEqual(snapshot.projectionMismatchCount, 0);
    assert.strictEqual(snapshot.lastProjectionMismatch, null);
    assert.strictEqual(snapshot.eventState, STATES.IDLE);
    assert.strictEqual(snapshot.invalidEventTransitionCount, 0);
    assert.strictEqual(snapshot.lastInvalidEventTransition, null);
    assert.strictEqual(snapshot.eventState, STATES.IDLE);
    assert.strictEqual(snapshot.invalidEventTransitionCount, 0);
    assert.strictEqual(snapshot.lastInvalidEventTransition, null);
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

    assert.strictEqual(controller.observe(events.GAME_ACTIVATED, { active: true }).valid, true);
    assert.strictEqual(controller.observe(events.SOCKET_DISCONNECTED, { connecting: true }).valid, true);
    assert.strictEqual(controller.observe(events.RECONNECT_REQUESTED, { rejoining: true }).valid, true);
    assert.strictEqual(controller.observe(events.RECONNECT_REQUESTED, { rejoining: true }).valid, true);
    assert.strictEqual(controller.observe(events.RECONNECT_REQUESTED, { rejoining: true }).valid, true);
    assert.strictEqual(controller.observe(events.RESTORE_STARTED, { restoring: true }).valid, true);
    assert.strictEqual(controller.observe(events.REPLAY_STARTED, { replaying: true }).valid, true);
    assert.strictEqual(controller.observe(events.RESTORE_ACTIVATED, { active: true }).valid, true);
    assert.strictEqual(controller.observe(events.GAME_COMPLETED, { completed: true }).valid, true);
    assert.strictEqual(controller.observe(events.RESET, {}).valid, true);
    const snapshot = controller.snapshot();
    assert.strictEqual(snapshot.projectionMismatchCount, 0);
    assert.strictEqual(snapshot.lastProjectionMismatch, null);
    assert.deepStrictEqual(snapshot.history.map(entry => entry.projectionMatched), [
        true, true, true, true, true, true, true, true, true, true,
    ]);
    assert.deepStrictEqual(snapshot.history.map(entry => entry.event), [
        events.GAME_ACTIVATED,
        events.SOCKET_DISCONNECTED,
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

runTest('online reconnect controllerはeventとlegacy投影の不一致を状態変更せず診断する', () => {
    const controller = OnlineReconnectState.createController();
    const event = OnlineReconnectState.events.RESTORE_STARTED;
    const observed = controller.observe(event, { connecting: true });
    assert.deepStrictEqual(observed, {
        ok: true,
        event,
        state: STATES.CONNECTING,
        from: STATES.IDLE,
        valid: true,
        projectionMatched: false,
        eventState: STATES.IDLE,
        eventTransitionValid: false,
    });
    assert.deepStrictEqual(controller.snapshot(), {
        state: STATES.CONNECTING,
        invalidTransitionCount: 0,
        projectionMismatchCount: 1,
        lastProjectionMismatch: {
            event,
            eventState: STATES.RESTORING,
            projectedState: STATES.CONNECTING,
        },
        eventState: STATES.IDLE,
        invalidEventTransitionCount: 1,
        lastInvalidEventTransition: {
            event,
            from: STATES.IDLE,
            target: STATES.RESTORING,
            reason: 'invalid-transition',
        },
        history: [{
            from: STATES.IDLE,
            to: STATES.CONNECTING,
            valid: true,
            event,
            projectionMatched: false,
            eventState: STATES.IDLE,
            eventTransitionValid: false,
        }],
    });
});

runTest('online reconnect authority selectorはclean parity時だけevent stateを採用する', () => {
    const snapshot = {
        state: STATES.ACTIVE,
        eventState: STATES.ACTIVE,
        invalidEventTransitionCount: 0,
        projectionMismatchCount: 0,
    };
    assert.deepStrictEqual(OnlineReconnectState.selectAuthorityState(snapshot), {
        state: STATES.ACTIVE,
        source: 'legacy-projection',
        ready: true,
        fallbackReason: '',
    });
    assert.deepStrictEqual(OnlineReconnectState.selectAuthorityState(snapshot, { eventAuthorityEnabled: true }), {
        state: STATES.ACTIVE,
        source: 'event',
        ready: true,
        fallbackReason: '',
    });
});

runTest('online reconnect authority selectorは不一致と不正履歴をlegacyへfail closedする', () => {
    const base = {
        state: STATES.CONNECTING,
        eventState: STATES.RESTORING,
        invalidEventTransitionCount: 0,
        projectionMismatchCount: 0,
    };
    const cases = [
        [{ ...base, state: 'unknown' }, 'malformed-snapshot', STATES.IDLE],
        [{ ...base, invalidEventTransitionCount: 1 }, 'invalid-event-transition', STATES.CONNECTING],
        [{ ...base, projectionMismatchCount: 1 }, 'projection-mismatch', STATES.CONNECTING],
        [base, 'state-mismatch', STATES.CONNECTING],
    ];
    for (const [snapshot, fallbackReason, state] of cases) {
        assert.deepStrictEqual(
            OnlineReconnectState.selectAuthorityState(snapshot, { eventAuthorityEnabled: true }),
            { state, source: 'legacy-projection', ready: false, fallbackReason }
        );
    }
});

runTest('online reconnect event authority flagは明示有効値だけを受理する', () => {
    for (const value of ['1', 'true', 'TRUE', ' yes ', 'on']) {
        assert.strictEqual(
            OnlineReconnectState.eventAuthorityEnabled({ ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED: value }),
            true,
            value
        );
    }
    for (const value of [undefined, '', '0', 'false', 'enabled']) {
        assert.strictEqual(
            OnlineReconnectState.eventAuthorityEnabled({ ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED: value }),
            false,
            String(value)
        );
    }
});

runTest('online reconnect effect authority flagは明示有効値だけを受理する', () => {
    for (const value of ['1', 'true', 'TRUE', ' yes ', 'on']) {
        assert.strictEqual(
            OnlineReconnectState.effectAuthorityEnabled({ ONLINE_RECONNECT_EFFECT_AUTHORITY_ENABLED: value }),
            true,
            value
        );
    }
    for (const value of [undefined, '', '0', 'false', 'enabled']) {
        assert.strictEqual(
            OnlineReconnectState.effectAuthorityEnabled({ ONLINE_RECONNECT_EFFECT_AUTHORITY_ENABLED: value }),
            false,
            String(value)
        );
    }
});

runTest('online reconnect effect authorityは既定OFFでlegacy値を維持する', () => {
    const snapshot = {
        state: STATES.ACTIVE,
        eventState: STATES.ACTIVE,
        invalidEventTransitionCount: 0,
        projectionMismatchCount: 0,
    };
    assert.deepStrictEqual(
        OnlineReconnectState.selectEffectAuthority(snapshot, true),
        {
            reconnecting: true,
            source: 'legacy',
            ready: true,
            fallbackReason: '',
        }
    );
});

runTest('online reconnect effect authorityはclean parity時だけevent stateを採用する', () => {
    const blockedStates = new Set([
        STATES.CONNECTING,
        STATES.REJOINING,
        STATES.RESTORING,
        STATES.REPLAYING,
        STATES.FAILED,
    ]);
    for (const state of Object.values(STATES)) {
        const snapshot = {
            state,
            eventState: state,
            invalidEventTransitionCount: 0,
            projectionMismatchCount: 0,
        };
        assert.deepStrictEqual(
            OnlineReconnectState.selectEffectAuthority(snapshot, !blockedStates.has(state), {
                effectAuthorityEnabled: true,
            }),
            {
                reconnecting: blockedStates.has(state),
                source: 'event',
                ready: true,
                fallbackReason: '',
            },
            state
        );
    }
});

runTest('online reconnect effect authorityは不整合時にlegacy値へfail closedする', () => {
    const base = {
        state: STATES.CONNECTING,
        eventState: STATES.RESTORING,
        invalidEventTransitionCount: 0,
        projectionMismatchCount: 0,
    };
    const cases = [
        [{ ...base, state: 'unknown' }, 'malformed-snapshot'],
        [{ ...base, invalidEventTransitionCount: 1 }, 'invalid-event-transition'],
        [{ ...base, projectionMismatchCount: 1 }, 'projection-mismatch'],
        [base, 'state-mismatch'],
    ];
    for (const legacyValue of [false, true]) {
        for (const [snapshot, fallbackReason] of cases) {
            assert.deepStrictEqual(
                OnlineReconnectState.selectEffectAuthority(snapshot, legacyValue, {
                    effectAuthorityEnabled: true,
                }),
                {
                    reconnecting: legacyValue,
                    source: 'legacy-fallback',
                    ready: false,
                    fallbackReason,
                }
            );
        }
    }
});

runTest('online reconnect status effect authorityは復元lifecycleの表示を状態順に返す', () => {
    const fixtures = [
        [OnlineReconnectState.events.RESTORE_STARTED, 'restoring', '♻️ ゲーム状態を復元しています...'],
        [OnlineReconnectState.events.REPLAY_STARTED, 'replaying', '♻️ 保存済み操作を再生しています...'],
        [OnlineReconnectState.events.RESTORE_ACTIVATED, 'active', ''],
    ];
    for (const [event, state, message] of fixtures) {
        const clean = {
            state,
            eventState: state,
            invalidEventTransitionCount: 0,
            projectionMismatchCount: 0,
        };
        const selected = OnlineReconnectState.selectStatusEffectAuthority(
            clean,
            event,
            'legacy unchanged',
            { statusEffectAuthorityEnabled: true }
        );
        assert.strictEqual(selected.source, 'event');
        assert.strictEqual(selected.message, message);
    }
});

runTest('online reconnect status effect authorityは既定OFF・不整合時にlegacyへ戻る', () => {
    const clean = {
        state: STATES.CONNECTING,
        eventState: STATES.CONNECTING,
        invalidEventTransitionCount: 0,
        projectionMismatchCount: 0,
    };
    assert.strictEqual(
        OnlineReconnectState.statusEffectAuthorityEnabled({ ONLINE_RECONNECT_STATUS_EFFECT_AUTHORITY_ENABLED: 'true' }),
        true
    );
    assert.deepStrictEqual(
        OnlineReconnectState.selectStatusEffectAuthority(clean, OnlineReconnectState.events.SOCKET_DISCONNECTED, 'legacy'),
        { message: 'legacy', source: 'legacy', ready: true, fallbackReason: '' }
    );
    assert.deepStrictEqual(
        OnlineReconnectState.selectStatusEffectAuthority(clean, OnlineReconnectState.events.SOCKET_DISCONNECTED, 'legacy', {
            statusEffectAuthorityEnabled: true,
        }),
        { message: '⏳ 接続が切れました。再接続しています...', source: 'event', ready: true, fallbackReason: '' }
    );
    const failed = { ...clean, state: STATES.FAILED, eventState: STATES.FAILED };
    assert.deepStrictEqual(
        OnlineReconnectState.selectStatusEffectAuthority(failed, OnlineReconnectState.events.RETRY_EXHAUSTED, 'legacy timeout', {
            statusEffectAuthorityEnabled: true,
        }),
        { message: '❌ 再接続がタイムアウトしました。再接続をやり直すか、タイトルへ戻ってください。', source: 'event', ready: true, fallbackReason: '' }
    );
    assert.deepStrictEqual(
        OnlineReconnectState.selectStatusEffectAuthority({ ...clean, eventState: STATES.REJOINING }, OnlineReconnectState.events.SOCKET_DISCONNECTED, 'legacy mismatch', {
            statusEffectAuthorityEnabled: true,
        }),
        { message: 'legacy mismatch', source: 'legacy-fallback', ready: false, fallbackReason: 'state-mismatch' }
    );
    assert.deepStrictEqual(
        OnlineReconnectState.selectStatusEffectAuthority(clean, OnlineReconnectState.events.GAME_ACTIVATED, 'legacy unsupported', {
            statusEffectAuthorityEnabled: true,
        }),
        { message: 'legacy unsupported', source: 'legacy-fallback', ready: false, fallbackReason: 'unsupported-event' }
    );
});

runTest('online reconnect input gateは接続処理中だけをblockする', () => {
    for (const state of [STATES.CONNECTING, STATES.REJOINING, STATES.RESTORING, STATES.REPLAYING, STATES.FAILED]) {
        assert.strictEqual(OnlineReconnectState.blocksInput(state), true, state);
    }
    for (const state of [STATES.IDLE, STATES.ACTIVE, STATES.COMPLETED, 'unknown']) {
        assert.strictEqual(OnlineReconnectState.blocksInput(state), false, state);
    }
});

runTest('online reconnect cleanup authority flagは明示有効値だけを受理する', () => {
    for (const value of ['1', 'true', 'TRUE', ' yes ', 'on']) {
        assert.strictEqual(
            OnlineReconnectState.cleanupAuthorityEnabled({ ONLINE_RECONNECT_CLEANUP_AUTHORITY_ENABLED: value }),
            true,
            value
        );
    }
    for (const value of [undefined, '', '0', 'false', 'enabled']) {
        assert.strictEqual(
            OnlineReconnectState.cleanupAuthorityEnabled({ ONLINE_RECONNECT_CLEANUP_AUTHORITY_ENABLED: value }),
            false,
            String(value)
        );
    }
});

runTest('online reconnect cleanup authorityはclean parity時だけevent判断を採用する', () => {
    const connecting = {
        state: STATES.CONNECTING,
        eventState: STATES.CONNECTING,
        invalidEventTransitionCount: 0,
        projectionMismatchCount: 0,
    };
    assert.deepStrictEqual(
        OnlineReconnectState.selectCleanupAuthority(connecting, true),
        { cleanup: true, source: 'legacy', ready: true, fallbackReason: '' }
    );
    assert.deepStrictEqual(
        OnlineReconnectState.selectCleanupAuthority(connecting, true, { cleanupAuthorityEnabled: true }),
        { cleanup: true, source: 'event', ready: true, fallbackReason: '' }
    );
    const active = { ...connecting, state: STATES.ACTIVE, eventState: STATES.ACTIVE };
    assert.deepStrictEqual(
        OnlineReconnectState.selectCleanupAuthority(active, false, { cleanupAuthorityEnabled: true }),
        { cleanup: false, source: 'event', ready: true, fallbackReason: '' }
    );
});

runTest('online reconnect cleanup authorityはstateまたはlegacy不一致でfail closedする', () => {
    const connecting = {
        state: STATES.CONNECTING,
        eventState: STATES.CONNECTING,
        invalidEventTransitionCount: 0,
        projectionMismatchCount: 0,
    };
    assert.deepStrictEqual(
        OnlineReconnectState.selectCleanupAuthority(connecting, false, { cleanupAuthorityEnabled: true }),
        { cleanup: false, source: 'legacy-fallback', ready: false, fallbackReason: 'cleanup-parity-mismatch' }
    );
    assert.deepStrictEqual(
        OnlineReconnectState.selectCleanupAuthority(
            { ...connecting, eventState: STATES.REJOINING },
            true,
            { cleanupAuthorityEnabled: true }
        ),
        { cleanup: true, source: 'legacy-fallback', ready: false, fallbackReason: 'state-mismatch' }
    );
});

runTest('online reconnect completion controllerはlegacy完了projectionを単独所有する', () => {
    const controller = OnlineReconnectState.createCompletionController();
    assert.strictEqual(controller.isCompleted(), false);
    assert.deepStrictEqual(controller.snapshot(), { completed: false });
    assert.deepStrictEqual(controller.markCompleted(), { completed: true });
    assert.strictEqual(controller.isCompleted(), true);
    assert.deepStrictEqual(controller.reset(), { completed: false });
    assert.strictEqual(controller.isCompleted(), false);
    assert.ok(Object.isFrozen(controller));
    assert.ok(Object.isFrozen(controller.snapshot()));

    const restored = OnlineReconnectState.createCompletionController(true);
    assert.strictEqual(restored.isCompleted(), true);
});


runTest('online reconnect runtimeは接続・復元・replay・active・failedを単一controllerで所有する', () => {
    let legacyReconnecting = false;
    let flags = { active: true };
    let status = '';
    const runtime = OnlineReconnectRuntime.create({
        statePolicy: OnlineReconnectState,
        retryPolicy: OnlineRetryPolicy,
        getLegacyReconnecting: () => legacyReconnecting,
        setLegacyReconnecting: value => { legacyReconnecting = value; },
        getObservationFlags: () => flags,
        getStatusText: () => status,
        setStatusText: value => { status = value; },
        now: () => 0,
    });

    runtime.observe(OnlineReconnectState.events.GAME_ACTIVATED, { effectAuthorityEnabled: true });
    assert.strictEqual(runtime.getState(true), 'active');
    legacyReconnecting = true;
    flags = { rejoining: true };
    runtime.observe(OnlineReconnectState.events.RECONNECT_REQUESTED, { effectAuthorityEnabled: true });
    assert.strictEqual(runtime.getState(true), 'rejoining');
    flags = { restoring: true };
    runtime.observe(OnlineReconnectState.events.RESTORE_STARTED, { effectAuthorityEnabled: true });
    assert.strictEqual(runtime.getState(true), 'restoring');
    flags = { replaying: true };
    runtime.observe(OnlineReconnectState.events.REPLAY_STARTED, { effectAuthorityEnabled: true });
    assert.strictEqual(runtime.getState(true), 'replaying');
    runtime.attempts.markExhausted();
    flags = {};
    runtime.observe(OnlineReconnectState.events.RETRY_EXHAUSTED, { effectAuthorityEnabled: true });
    assert.strictEqual(runtime.getState(true), 'failed');
    assert.strictEqual(runtime.inputBlocked(true), true);
    assert.strictEqual(runtime.inputBlocked(false), legacyReconnecting);
});

runTest('online reconnect runtimeはtimer・status・completionを同じ境界から投影する', () => {
    let legacyReconnecting = false;
    let status = 'legacy';
    const runtime = OnlineReconnectRuntime.create({
        statePolicy: OnlineReconnectState,
        retryPolicy: OnlineRetryPolicy,
        getLegacyReconnecting: () => legacyReconnecting,
        setLegacyReconnecting: value => { legacyReconnecting = value; },
        getObservationFlags: () => ({ active: true }),
        getStatusText: () => status,
        setStatusText: value => { status = value; },
        now: () => 0,
    });
    runtime.observe(OnlineReconnectState.events.GAME_ACTIVATED, { effectAuthorityEnabled: true });
    assert.strictEqual(runtime.timerSelection(true, true).source, 'event');
    assert.strictEqual(runtime.callbackSelection(true, true, true).source, 'event');
    runtime.completion.markCompleted();
    assert.strictEqual(runtime.observationFlags().completed, true);
    assert.throws(() => OnlineReconnectRuntime.create(), /dependency is required/);
});
