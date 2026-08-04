'use strict';

const assert = require('assert');
const UiWatchdogRecoveryRuntime = require('../js/uiWatchdogRecoveryRuntime');
const { runTest } = require('./helpers/test-utils');

function createHarness(overrides = {}) {
    const calls = [];
    const snapshots = [];
    const dependencies = {
        appShellAsyncRecovery: {
            recoverCpuTurnStall: snapshot => { calls.push(['cpu', snapshot]); return true; },
            recoverOnlineActionInFlightStall: snapshot => { calls.push(['online', snapshot]); return true; },
        },
        appShellGameRuntimeSnapshot: () => ({ undoState: null }),
        appShellRecoveryEffects: {
            ensureHtmlChildren: () => ({ changed: false, elements: [] }),
            queryAll: () => [],
            releaseInteractionLock: () => false,
            releaseInteractionLockById: () => false,
        },
        appShellRuntimeEffects: { render: () => false, renderBuildMenu: () => false },
        buildClientRuntimeSnapshot: reason => {
            calls.push(['snapshot', reason]);
            return snapshots.shift() || { phase: 'build' };
        },
        classifyLikelyFreeze: snapshot => snapshot.freezeKind || '',
        classifyUiInteractabilityCause: issue => issue.reason || '',
        clearGameScreenLockIfNoActiveModal: () => false,
        clearUiLocks: () => {},
        closeStaleBlockingModals: () => false,
        compactIssueForTrace: issue => issue,
        compactSnapshotForUiTrace: snapshot => snapshot,
        expectedActionContainerEntries: () => [],
        expectedChildSpecForEntry: () => null,
        expectedPendingActions: () => [],
        freezeKinds: {
            POST_BUILD_UI_BLOCKED: 'post-build-ui-blocked',
            HUMAN_TURN_UI_LOCKED: 'human-turn-ui-locked',
            PENDING_UI_LOCKED: 'pending-ui-locked',
            STALE_MODAL_UI_LOCKED: 'stale-modal-ui-locked',
            CPU_TURN_STALLED: 'cpu-turn-stalled',
            ONLINE_ACTION_IN_FLIGHT_STALLED: 'online-action-in-flight-stalled',
            MODAL_UI_LOCKED: 'modal-ui-locked',
        },
        hasActiveBlockingModal: () => false,
        isActionContainerUiUsable: () => true,
        isHumanTurnSnapshot: () => true,
        isOnlineUiBlockedSnapshot: () => false,
        markClientFlowCheckpoint: (event, details) => calls.push(['checkpoint', event, details]),
        recentClientCheckpointsForTrace: () => [{ event: 'before' }],
        uiWatchdog: {
            canRecoverActionContainers: () => true,
            actionContainerRecoveryPlan: () => [],
            renderInteractabilitySyncPlan: () => ({ eligible: false, shouldSync: false, issues: [] }),
            selectRecoveryHandler: (kind, handlers) => handlers[kind] || null,
        },
        validateUiInteractability: snapshot => snapshot.issues || [],
        ...overrides,
    };
    return { calls, snapshots, runtime: UiWatchdogRecoveryRuntime.createRuntime(dependencies) };
}

runTest('watchdog recovery runtimeはfreeze kindを対応handlerへ送り回復traceを残す', () => {
    const { calls, runtime } = createHarness();
    const before = {
        freezeKind: 'cpu-turn-stalled',
        issues: [{ freezeKind: 'cpu-turn-stalled', reason: 'scheduler-idle' }],
    };
    assert.strictEqual(runtime.recoverUiInteractability(before), true);
    assert.strictEqual(calls[0][0], 'cpu');
    assert.deepStrictEqual(calls[1], ['snapshot', 'ui-recovery-after']);
    assert.strictEqual(calls[2][1], 'ui-interactability-recovery-fired');
    assert.deepStrictEqual(calls[2][2].recentCheckpoints, [{ event: 'before' }]);
});

runTest('watchdog recovery runtimeは未知freezeと非回復結果をcheckpoint化しない', () => {
    const { calls, runtime } = createHarness();
    assert.strictEqual(runtime.recoverUiInteractability({ freezeKind: '' }), false);
    assert.strictEqual(runtime.recoverFreezeKind('unknown', {}), false);
    assert.deepStrictEqual(calls, []);
    assert.ok(Object.isFrozen(runtime));
});

runTest('watchdog recovery runtimeは必須依存欠落を初期化時に拒否する', () => {
    assert.throws(() => UiWatchdogRecoveryRuntime.createRuntime(), /appShellGameRuntimeSnapshot is required/);
});
