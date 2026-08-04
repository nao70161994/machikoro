'use strict';

const assert = require('assert');
const AppShellObservationRuntime = require('../js/appShellObservationRuntime');
const { runTest } = require('./helpers/test-utils');

function createRuntime(overrides = {}) {
    const elements = {};
    const uiWatchdog = {
        shouldRequireActionChildren: () => false,
        classListText: () => '',
        isElementUsablyEnabled: state => !!(state && !state.disabled),
        lockReasonForElement: () => 'not-clickable',
        snapshotStateById: (snapshot, id) => snapshot.ui && snapshot.ui[id],
        shouldIgnoreInactiveActionContainerIssue: () => false,
        isActionContainerStateUsable: (_spec, state) => !!(state && !state.disabled),
        buildInteractabilityIssues: (_snapshot, observations) => observations.missingRegistryEntries,
    };
    const dependencies = {
        actionUiRegistry: {
            childSelectors: {},
            containerSpecForAction: (_snapshot, action) => ({ action, targetId: action }),
            missingContainerEntries: () => [],
            snapshot: () => ({ buildCard: { targetId: 'buildCard' } }),
        },
        activeBlockingModalIds: () => [],
        clientRuntimeSnapshot: { build: input => input },
        document: { activeElement: null, body: null, getElementById: id => elements[id] || null },
        domSnapshot: {
            hasBlockingAncestor: () => false,
            interactiveState: () => ({ total: 0, usable: 0 }),
            interactiveStateForSpec: () => ({ total: 0, usable: 0 }),
            interactiveStateForActions: () => ({ total: 0, usable: 0 }),
            isInteractiveElementUsable: () => true,
            snapshotById: id => ({ id, disabled: false, htmlLength: 0 }),
            isVisibleById: () => false,
        },
        freezeKinds: { HUMAN_TURN_UI_LOCKED: 'human-turn-ui-locked' },
        getGameRuntimeSnapshot: () => ({ game: null, cpuPlayers: [] }),
        getOnlineRuntimeSnapshot: () => ({ myPlayerIndex: -1 }),
        modalSnapshotFromRuntime: () => null,
        nowIso: () => '2026-08-05T00:00:00.000Z',
        resolveDependency: () => null,
        runtimeEffects: {
            onlineActionFlightState: () => ({ inFlight: false, startedAt: 0 }),
            schedulerSnapshot: () => null,
        },
        uiWatchdog,
        ...overrides,
    };
    return AppShellObservationRuntime.createRuntime(dependencies);
}

runTest('app shell observation runtimeはgame/cpu/online/DOM factを既存snapshot形状へ組み立てる', () => {
    const game = {
        phase: 'build', builtThisTurn: false, turnCount: 3, currentPlayerIndex: 1,
        currentPlayer: () => ({ coins: 5, landmarks: {} }),
        allowedActions: () => ['nextTurn'],
        checkWinner: () => null,
    };
    let flightRead = 0;
    const runtime = createRuntime({
        getGameRuntimeSnapshot: () => ({ game, cpuPlayers: [null, {}] }),
        getOnlineRuntimeSnapshot: () => ({
            isOnlineGame: true, isRoomHost: true, myPlayerIndex: 1,
            isReconnectingOnline: false, socket: { connected: true },
        }),
        runtimeEffects: {
            schedulerSnapshot: () => ({ blockedReason: '', token: 4, scheduledUntil: 9, stepScheduled: true }),
            onlineActionFlightState: () => ++flightRead === 1
                ? { inFlight: true, startedAt: 10 }
                : { inFlight: false, startedAt: 20 },
        },
    });
    const snapshot = runtime.buildClientRuntimeSnapshot('contract');
    assert.strictEqual(snapshot.reason, 'contract');
    assert.strictEqual(snapshot.timestamp, '2026-08-05T00:00:00.000Z');
    assert.deepStrictEqual(snapshot.allowedActions, ['nextTurn']);
    assert.strictEqual(snapshot.cpu.isCpuTurn, true);
    assert.strictEqual(snapshot.cpu.stepScheduled, true);
    assert.strictEqual(snapshot.online.actionInFlight, true);
    assert.strictEqual(snapshot.online.actionInFlightAt, 20);
});

runTest('app shell observation runtimeはbuild候補とregistry不足を注入依存から診断する', () => {
    const current = { coins: 3, landmarks: {}, countCardIncludingDormant: () => 0 };
    const game = { builtThisTurn: false, currentPlayer: () => current };
    const runtime = createRuntime({
        actionUiRegistry: {
            childSelectors: {},
            containerSpecForAction: () => null,
            missingContainerEntries: () => [{ action: 'futureAction' }],
            snapshot: () => ({}),
        },
        getGameRuntimeSnapshot: () => ({ game, cpuPlayers: [] }),
        resolveDependency: name => ({
            cards: [{ name: '麦畑', color: 'blue', cost: 1 }],
            shopStock: { 麦畑: 1 },
        })[name] || null,
    });
    assert.strictEqual(runtime.hasBuildableCardCandidate(), true);
    const snapshot = { phase: 'build', allowedActions: ['futureAction'], ui: {} };
    assert.deepStrictEqual(runtime.validateUiInteractability(snapshot), [{ action: 'futureAction' }]);
    assert.ok(Object.isFrozen(runtime));
});

runTest('app shell observation runtimeは必須依存欠落を初期化時に拒否する', () => {
    assert.throws(() => AppShellObservationRuntime.createRuntime(), /activeBlockingModalIds is required/);
});
