'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const OnlineRejoinPreparationRuntime = require('../js/onlineRejoinPreparationRuntime');
const { OnlinePayload } = require('../js/onlinePayload');
const { OnlineRejoinPersistence } = require('../js/onlineRejoinPersistence');
const { OnlineRestoreQueueState } = require('../js/onlineRestoreQueueState');
const { OnlineRestoreRank } = require('../js/onlineRestoreRank');
const { runTest } = require('./helpers/test-utils');

function gameStartPayload(overrides = {}) {
    return {
        playerNames: ['Alice', 'CPU'],
        playerSettings: [{ type: 'human' }, { type: 'cpu' }],
        cpuSpeed: 1200,
        playerOrder: [0, 1],
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        hostPlayerIndex: 0,
        hostEpoch: 1,
        actionSeq: 2,
        ...overrides,
    };
}

function prepareInput(overrides = {}) {
    return {
        acceptedClientActions: [],
        actionLog: [{ action: 'rollDice', data: {}, seq: 3 }],
        gameStartPayload: gameStartPayload(),
        hostEpoch: 2,
        hostPlayerIndex: 0,
        playerIndex: 0,
        provisionalRestore: false,
        restoreAudit: null,
        stateSnapshot: { actionSeq: 2 },
        ...overrides,
    };
}

function createHarness(options = {}) {
    const calls = [];
    const diagnostics = {};
    const queue = options.queue || [{ type: 'gameAction', payload: { seq: 4 }, generation: 1 }];
    const pending = options.pending === undefined
        ? { action: 'nextTurn', data: {}, clientActionId: 'pending-1', roomId: 'ROOM1' }
        : options.pending;
    const localBundle = options.localBundle || null;
    const effectSource = options.effectSource || 'executor';
    let generation = 4;
    const runtime = OnlineRejoinPreparationRuntime.createRuntime({
        applyHostPayload(payload, hostPlayerIndex, hostEpoch) {
            calls.push(['applyHostPayload', hostPlayerIndex, hostEpoch]);
            payload.hostPlayerIndex = hostPlayerIndex;
            payload.hostEpoch = hostEpoch;
            return payload;
        },
        applyReconnectStatus: event => calls.push(['applyReconnectStatus', event]),
        calculateRank(payload, snapshot, actionLog) {
            calls.push(['calculateRank', payload, snapshot, actionLog]);
            return {
                hostEpoch: payload.hostEpoch || 0,
                actionSeq: (snapshot?.actionSeq || 0) + (actionLog?.length || 0),
            };
        },
        clearHostlessState: () => calls.push(['clearHostlessState']),
        clearPending: () => calls.push(['clearPending']),
        clearQuarantine: () => calls.push(['clearQuarantine']),
        clearRetry: () => calls.push(['clearRetry']),
        getDefaultLandmarks: () => { calls.push(['getDefaultLandmarks']); return ['役所']; },
        getOriginalPlayerIndex: () => { calls.push(['getOriginalPlayerIndex']); return 0; },
        incrementRestoreGeneration: () => {
            generation++;
            calls.push(['incrementRestoreGeneration', generation]);
            return generation;
        },
        invalidateCpuSchedule: () => calls.push(['invalidateCpuSchedule']),
        isActionLogPlanAuthorityEnabled: () => true,
        isPendingPlanAuthorityEnabled: () => true,
        isPersistencePlanAuthorityEnabled: () => true,
        isQueueCarryRequired: () => {
            calls.push(['isQueueCarryRequired']);
            return options.carry !== false;
        },
        isRestoreOfferPlanAuthorityEnabled: () => true,
        normalizeActionLog: value => {
            calls.push(['normalizeActionLog', value]);
            return Array.isArray(value) ? value.filter(entry => entry && entry.action) : [];
        },
        observeReconnect: event => calls.push(['observeReconnect', event]),
        payload: OnlinePayload,
        pendingBelongsToSession: value => {
            calls.push(['pendingBelongsToSession', value]);
            return options.pendingBelongs !== false;
        },
        pendingMatchesAccepted: (reference, value) =>
            reference.clientActionId === value.clientActionId,
        readActionLog: () => {
            calls.push(['readActionLog']);
            return options.storedActionLog || [];
        },
        readLocalBundle: () => { calls.push(['readLocalBundle']); return localBundle; },
        readPending: () => { calls.push(['readPending']); return pending; },
        readRestoreQueue: () => { calls.push(['readRestoreQueue']); return queue; },
        reconnectEvents: { RESTORE_STARTED: 'restore-started' },
        recordDiagnostic: (key, selection) => {
            diagnostics[key] = selection;
            calls.push(['recordDiagnostic', key, selection.source]);
        },
        recordQueueDiagnostic: selection =>
            calls.push(['recordQueueDiagnostic', selection.source]),
        rejoinPersistence: OnlineRejoinPersistence,
        removeRestoreItem: key => calls.push(['removeRestoreItem', key]),
        replaceEnabledCards: value => calls.push(['replaceEnabledCards', value]),
        replaceEnabledLandmarks: value => calls.push(['replaceEnabledLandmarks', value]),
        replaceRestoreQueue: value => calls.push(['replaceRestoreQueue', value]),
        resetUiLocks: reason => calls.push(['resetUiLocks', reason]),
        restoreQueueState: OnlineRestoreQueueState,
        restoreRank: OnlineRestoreRank,
        restoreSchemaVersion: 2,
        sameActionEntry: (left, right) =>
            left.clientActionId && left.clientActionId === right.clientActionId,
        saveSession: () => calls.push(['saveSession']),
        selectPersistenceEffect: () => ({ source: effectSource }),
        selectQueueTransition: (pureTransition, legacyTransition) =>
            OnlineRestoreQueueState.selectTransition(
                pureTransition,
                legacyTransition,
                { authorityEnabled: true }
            ),
        sendLocalBundle: value => calls.push(['sendLocalBundle', value]),
        serverActionSeq(payload, snapshot, actionLog) {
            calls.push(['serverActionSeq', payload, snapshot, actionLog]);
            return Math.max(payload.actionSeq || 0, snapshot?.actionSeq || 0,
                ...actionLog.map(entry => entry.seq || 0));
        },
        setActionFlight: value => calls.push(['setActionFlight', value]),
        setCpuSpeed: value => calls.push(['setCpuSpeed', value]),
        setHostState: value => calls.push(['setHostState', value]),
        setPlayerIndexes: value => calls.push(['setPlayerIndexes', value]),
        setReconnectFlag: value => calls.push(['setReconnectFlag', value]),
        setStatusText: value => calls.push(['setStatusText', value]),
        startRestore: () => calls.push(['startRestore']),
        storageKeys: {
            gameStart: 'game-start', stateSnapshot: 'snapshot',
            restoreAudit: 'audit', actionLog: 'log',
        },
        supportsResetUiLocks: () => {
            calls.push(['supportsResetUiLocks']);
            return options.resetUiLocks !== false;
        },
        writeRestoreJson: (key, value) => {
            calls.push(['writeRestoreJson', key, value]);
            if (options.storageError) throw new Error('storage failed');
        },
    });
    return { calls, diagnostics, localBundle, pending, queue, runtime };
}

runTest('online rejoin preparation runtimeはqueue引継ぎから復元contextまでを固定する', () => {
    const harness = createHarness();
    const input = prepareInput();
    const prepared = harness.runtime.prepare(input);
    assert.strictEqual(prepared.ready, true);
    assert.strictEqual(prepared.restoreGeneration, 5);
    assert.strictEqual(prepared.restoredThroughSeq, 3);
    assert.strictEqual(prepared.pendingBeforeRejoin, harness.pending);
    assert.strictEqual(prepared.acceptedPendingReconciliation, false);
    assert.strictEqual(prepared.gameStartPayload.schemaVersion, 2);
    assert.strictEqual(prepared.gameStartPayload.hostEpoch, 2);
    assert.deepStrictEqual(
        harness.calls.find(call => call[0] === 'replaceRestoreQueue')[1],
        [{ type: 'gameAction', payload: { seq: 4 }, generation: 5 }]
    );
    const names = harness.calls.map(call => call[0]);
    assert.ok(names.indexOf('startRestore') < names.indexOf('observeReconnect'));
    assert.ok(names.indexOf('clearQuarantine') < names.indexOf('replaceRestoreQueue'));
    assert.ok(names.indexOf('normalizeActionLog') < names.indexOf('readLocalBundle'));
    assert.ok(names.indexOf('applyHostPayload') < names.indexOf('readPending'));
    assert.strictEqual(
        harness.diagnostics.pendingReconciliationPlanSelection.source,
        'pure-plan'
    );
    assert.strictEqual(
        harness.diagnostics.onlineRejoinPersistencePlanSelection.source,
        'pure-plan'
    );
});

runTest('online rejoin preparation runtimeは新しい元host bundleを送ってserver復元を止める', () => {
    const localBundle = {
        gameStartPayload: gameStartPayload({ hostEpoch: 4, hostPlayerIndex: 0 }),
        stateSnapshot: { actionSeq: 10 },
        actionLog: [],
    };
    const harness = createHarness({ localBundle });
    const prepared = harness.runtime.prepare(prepareInput({ hostPlayerIndex: 1 }));
    assert.deepStrictEqual(prepared, { ready: false, reason: 'local-bundle-offered' });
    assert.deepStrictEqual(harness.calls.slice(-3), [
        ['setReconnectFlag', true],
        ['setStatusText', OnlineRejoinPreparationRuntime.LOCAL_OFFER_STATUS],
        ['sendLocalBundle', localBundle],
    ]);
    assert.strictEqual(harness.calls.some(call => call[0] === 'applyHostPayload'), false);
});

runTest('online rejoin preparation runtimeは別session pendingをclearして受理済み扱いにする', () => {
    const harness = createHarness({ pendingBelongs: false });
    const prepared = harness.runtime.prepare(prepareInput());
    assert.strictEqual(prepared.pendingBeforeRejoin, null);
    assert.strictEqual(prepared.acceptedPendingReconciliation, true);
    assert.strictEqual(harness.calls.filter(call => call[0] === 'clearPending').length, 1);
});

runTest('online rejoin preparation runtimeはexecutorでruntime・保存effect順を維持する', () => {
    const harness = createHarness();
    const prepared = harness.runtime.prepare(prepareInput({
        acceptedClientActions: [{ clientActionId: 'pending-1' }],
        restoreAudit: { signature: 'signed' },
    }));
    harness.calls.length = 0;
    harness.runtime.persist(prepared);
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'recordDiagnostic', 'setActionFlight', 'clearPending', 'clearRetry',
        'setCpuSpeed', 'replaceEnabledCards', 'replaceEnabledLandmarks',
        'setPlayerIndexes', 'setHostState', 'writeRestoreJson', 'writeRestoreJson',
        'writeRestoreJson', 'readActionLog', 'recordDiagnostic', 'writeRestoreJson',
        'saveSession', 'invalidateCpuSchedule', 'resetUiLocks',
    ]);
    assert.deepStrictEqual(harness.calls.at(-1), [
        'resetUiLocks', OnlineRejoinPreparationRuntime.UI_RESET_REASON,
    ]);
});

runTest('online rejoin preparation runtimeはlegacy persistenceとstorage失敗隔離を維持する', () => {
    const harness = createHarness({ effectSource: 'legacy', storageError: true });
    const prepared = harness.runtime.prepare(prepareInput());
    harness.calls.length = 0;
    assert.doesNotThrow(() => harness.runtime.persist(prepared));
    const names = harness.calls.map(call => call[0]);
    assert.ok(names.indexOf('setHostState') < names.indexOf('writeRestoreJson'));
    assert.ok(names.indexOf('writeRestoreJson') < names.indexOf('saveSession'));
    assert.ok(names.indexOf('saveSession') < names.indexOf('invalidateCpuSchedule'));
});

runTest('online rejoin preparation runtimeは署名なしsnapshotで長いlocal logを保持する', () => {
    const storedLog = [
        { action: 'a', seq: 1 },
        { action: 'b', seq: 2 },
        { action: 'c', seq: 3 },
    ];
    const harness = createHarness({ storedActionLog: storedLog });
    const prepared = harness.runtime.prepare(prepareInput({
        actionLog: [{ action: 'rollDice', data: {}, seq: 3 }],
        restoreAudit: null,
    }));
    harness.calls.length = 0;
    harness.runtime.persistRestoreBundle(prepared);
    assert.deepStrictEqual(
        harness.calls.find(call => call[0] === 'writeRestoreJson' && call[1] === 'log'),
        ['writeRestoreJson', 'log', storedLog]
    );
    assert.strictEqual(
        harness.diagnostics.rejoinActionLogPlanSelection.source,
        'pure-plan'
    );
});

runTest('online rejoin preparation runtimeは圧縮境界後も完全logを再起動復元用に保存する', () => {
    const entries = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => ({
        action: (from + index) % 2 === 0 ? 'nextTurn' : 'rollDice',
        data: {},
        seq: from + index,
    }));
    const storedLog = entries(1, 200);
    const serverFullLog = entries(1, 203);
    const harness = createHarness({ storedActionLog: storedLog });
    const prepared = harness.runtime.prepare(prepareInput({
        actionLog: entries(202, 203),
        fullActionLog: serverFullLog,
        stateSnapshot: { actionSeq: 201 },
    }));
    harness.calls.length = 0;

    harness.runtime.persistRestoreBundle(prepared);

    const persisted = harness.calls.find(call =>
        call[0] === 'writeRestoreJson' && call[1] === 'log');
    assert.deepStrictEqual(persisted[2].map(entry => entry.seq),
        Array.from({ length: 203 }, (_, index) => index + 1));
    assert.strictEqual(
        harness.diagnostics.rejoinActionLogPlanSelection.plan.reason,
        OnlinePayload.rejoinActionLogReasons.SERVER_UNSIGNED_FULL_LOG
    );
});

runTest('online.jsはrejoin準備と保存を専用runtimeへ委譲する', () => {
    const online = fs.readFileSync(path.join(__dirname, '..', 'js/online.js'), 'utf8');
    const runtime = fs.readFileSync(
        path.join(__dirname, '..', 'js/onlineRejoinPreparationRuntime.js'),
        'utf8'
    );
    assert.ok(online.includes('OnlineRejoinPreparationRuntime.createRuntime'));
    assert.ok(online.includes('OnlineRejoinRuntime.createRuntime'));
    assert.ok(online.includes('preparationRuntime: onlineRejoinPreparationRuntime'));
    assert.strictEqual(online.includes('const persistRestoreBundle = () =>'), false);
    assert.strictEqual(online.includes('const legacyPendingReconciliationPlan'), false);
    assert.ok(runtime.includes('function reconcilePending(input)'));
    assert.ok(runtime.includes('function persistRestoreBundle(prepared)'));
});

runTest('online rejoin preparation runtimeは必須adapter欠落を初期化前に拒否する', () => {
    assert.throws(
        () => OnlineRejoinPreparationRuntime.createRuntime(),
        /dependency is required/
    );
    const harness = createHarness();
    assert.ok(Object.isFrozen(harness.runtime));
});
