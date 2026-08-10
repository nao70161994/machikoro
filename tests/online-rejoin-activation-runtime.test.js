'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const OnlineRejoinActivationRuntime = require('../js/onlineRejoinActivationRuntime');
const { OnlinePendingResend } = require('../js/onlinePendingResend');
const { OnlineRestoreActivation } = require('../js/onlineRestoreActivation');
const { OnlineRestoreReplay } = require('../js/onlineRestoreReplay');
const { runTest } = require('./helpers/test-utils');

function rejoinInput(overrides = {}) {
    return {
        acceptedPendingReconciliation: false,
        actionLog: [{ action: 'rollDice', data: { count: 1 } }],
        pendingBeforeRejoin: {
            action: 'nextTurn', data: {}, clientActionId: 'client-1',
        },
        playerNames: ['Alice', 'CPU'],
        playerOrder: [0, 1],
        playerSettings: [{ type: 'human' }, { type: 'cpu' }],
        provisionalRestore: true,
        restoreGeneration: 3,
        restoredThroughSeq: 8,
        stateSnapshot: { phase: 'build' },
        ...overrides,
    };
}

function createHarness(options = {}) {
    const calls = [];
    const diagnostics = {};
    const input = rejoinInput(options.input);
    const currentPending = options.currentPending === undefined
        ? input.pendingBeforeRejoin : options.currentPending;
    const socket = options.socket === undefined ? { connected: true } : options.socket;
    const source = options.effectSource || 'executor';
    const runtime = OnlineRejoinActivationRuntime.createRuntime({
        abortRestore: (...args) => calls.push(['abortRestore', ...args]),
        applyAction: (...args) => {
            calls.push(['applyAction', ...args]);
            if (options.replayError) throw new Error('broken replay');
            return options.replayResult === undefined ? true : options.replayResult;
        },
        applyReconnectStatus: event => calls.push(['applyReconnectStatus', event]),
        canResendPending: pending => {
            calls.push(['canResendPending', pending]);
            return options.canResend !== false;
        },
        clearPending: () => calls.push(['clearPending']),
        emitAction: (pending, targetSocket) => calls.push(['emitAction', pending, targetSocket]),
        flushRestoreEvents: (...args) => {
            calls.push(['flushRestoreEvents', ...args]);
            return options.flushed !== false;
        },
        focusGame: () => calls.push(['focusGame']),
        getGame: () => ({ addLog: (...args) => calls.push(['addLog', ...args]) }),
        getPending: () => { calls.push(['getPending']); return currentPending; },
        getRestoreEventHandlers: () => {
            calls.push(['getRestoreEventHandlers']);
            return { gameAction() {}, actionAccepted() {}, hostChanged() {} };
        },
        getRestoreGeneration: () => {
            calls.push(['getRestoreGeneration']);
            return options.generation === undefined ? 3 : options.generation;
        },
        getSocket: () => { calls.push(['getSocket']); return socket; },
        initGame: (...args) => calls.push(['initGame', ...args]),
        isActivationPlanAuthorityEnabled: () => true,
        isPendingResendPlanAuthorityEnabled: () => true,
        isReplayPlanAuthorityEnabled: () => true,
        logTypes: { SYSTEM: 'system' },
        observeReconnect: event => calls.push(['observeReconnect', event]),
        pendingResend: OnlinePendingResend,
        persistRejoinBundle: () => calls.push(['persistRejoinBundle']),
        reconnectEvents: {
            REPLAY_STARTED: 'replay-started',
            RESTORE_ACTIVATED: 'restore-activated',
        },
        recordDiagnostic: (key, selection) => {
            diagnostics[key] = selection;
            calls.push(['recordDiagnostic', key, selection.source]);
        },
        replaceActionSequence: value => calls.push(['replaceActionSequence', value]),
        resetPreviousCoins: () => calls.push(['resetPreviousCoins']),
        resetReconnectCompletion: () => calls.push(['resetReconnectCompletion']),
        restoreActivation: OnlineRestoreActivation,
        restoreReplay: OnlineRestoreReplay,
        restoreSnapshot: value => calls.push(['restoreSnapshot', value]),
        samePending: (left, right) => left === right,
        selectActivationEffect: () => ({ source }),
        selectPendingResendEffect: () => ({ source }),
        selectReplayEffect: () => ({ source }),
        setActionFlight: value => calls.push(['setActionFlight', value]),
        setOnline: value => calls.push(['setOnline', value]),
        setReconnectFlag: value => calls.push(['setReconnectFlag', value]),
        setReplaying: value => calls.push(['setReplaying', value]),
        setStatusText: value => calls.push(['setStatusText', value]),
        showGame: () => calls.push(['showGame']),
    });
    return {
        calls,
        diagnostics,
        handle: value => runtime.handle(value, {
            persistRejoinBundle: () => calls.push(['persistRejoinBundle']),
        }),
        input,
        runtime,
        socket,
    };
}

runTest('online rejoin activation runtimeはreplay・active化・pending再送を順序通り完了する', () => {
    const harness = createHarness();
    assert.strictEqual(harness.handle(harness.input), true);
    const names = harness.calls.map(call => call[0]);
    assert.deepStrictEqual(names.slice(0, 5), [
        'getRestoreGeneration', 'persistRejoinBundle', 'showGame',
        'recordDiagnostic', 'recordDiagnostic',
    ]);
    assert.ok(names.indexOf('initGame') < names.indexOf('restoreSnapshot'));
    assert.ok(names.indexOf('restoreSnapshot') < names.indexOf('applyAction'));
    assert.ok(names.indexOf('applyAction') < names.indexOf('resetReconnectCompletion'));
    assert.ok(names.indexOf('flushRestoreEvents') < names.indexOf('getPending'));
    assert.ok(names.indexOf('setActionFlight') < names.indexOf('emitAction'));
    assert.ok(names.indexOf('emitAction') < names.indexOf('focusGame'));
    assert.deepStrictEqual(harness.calls.find(call => call[0] === 'emitAction'), [
        'emitAction', harness.input.pendingBeforeRejoin, harness.socket,
    ]);
    assert.strictEqual(
        harness.diagnostics.onlineRestoreReplayPlanSelection.source,
        'pure-plan'
    );
    assert.strictEqual(
        harness.diagnostics.onlineRestoreActivationPlanSelection.source,
        'pure-plan'
    );
    assert.strictEqual(
        harness.diagnostics.onlinePendingResendPlanSelection.source,
        'pure-plan'
    );
});

runTest('online rejoin activation runtimeはlegacy fallbackでも同じ主要effectを維持する', () => {
    const harness = createHarness({ effectSource: 'legacy' });
    assert.strictEqual(harness.handle(harness.input), true);
    const names = harness.calls.map(call => call[0]);
    assert.deepStrictEqual(
        harness.calls.filter(call => call[0] === 'setReplaying'),
        [['setReplaying', true], ['setReplaying', false]]
    );
    assert.ok(names.indexOf('observeReconnect') < names.indexOf('initGame'));
    assert.strictEqual(names.filter(name => name === 'emitAction').length, 1);
});

runTest('online rejoin activation runtimeはstale世代を副作用前に破棄する', () => {
    const harness = createHarness({ generation: 4 });
    assert.strictEqual(harness.handle(harness.input), false);
    assert.deepStrictEqual(harness.calls, [['getRestoreGeneration']]);
});

runTest('online rejoin activation runtimeはreplay失敗を終了してabortする', () => {
    const harness = createHarness({ replayError: true });
    assert.strictEqual(harness.handle(harness.input), false);
    assert.deepStrictEqual(
        harness.calls.filter(call => call[0] === 'setReplaying'),
        [['setReplaying', true], ['setReplaying', false]]
    );
    assert.deepStrictEqual(harness.calls.slice(-3), [
        ['setStatusText', OnlineRejoinActivationRuntime.RESTORE_FAILED_STATUS],
        ['setReconnectFlag', true],
        ['abortRestore', 3, OnlineRejoinActivationRuntime.RESTORE_FAILED_ABORT],
    ]);
    assert.strictEqual(harness.calls.some(call => call[0] === 'setOnline'), false);
    assert.strictEqual(harness.calls.some(call => call[0] === 'focusGame'), false);
});

runTest('online rejoin activation runtimeはlegacy replayのfalseを終了してabortする', () => {
    const harness = createHarness({ effectSource: 'legacy', replayResult: false });
    assert.strictEqual(harness.handle(harness.input), false);
    assert.deepStrictEqual(
        harness.calls.filter(call => call[0] === 'setReplaying'),
        [['setReplaying', true], ['setReplaying', false]]
    );
    assert.strictEqual(harness.calls.some(call => call[0] === 'setOnline'), false);
    assert.deepStrictEqual(harness.calls.slice(-3), [
        ['setStatusText', OnlineRejoinActivationRuntime.RESTORE_FAILED_STATUS],
        ['setReconnectFlag', true],
        ['abortRestore', 3, OnlineRejoinActivationRuntime.RESTORE_FAILED_ABORT],
    ]);
});

runTest('online rejoin activation runtimeはqueue flush失敗後にpendingを再送しない', () => {
    const harness = createHarness({ flushed: false });
    assert.strictEqual(harness.handle(harness.input), false);
    assert.strictEqual(harness.calls.some(call => call[0] === 'getPending'), false);
    assert.strictEqual(harness.calls.some(call => call[0] === 'emitAction'), false);
});

runTest('online rejoin activation runtimeは再送不可の同一pendingだけをclearする', () => {
    const harness = createHarness({ canResend: false });
    assert.strictEqual(harness.handle(harness.input), true);
    assert.strictEqual(harness.calls.filter(call => call[0] === 'clearPending').length, 1);
    assert.strictEqual(harness.calls.some(call => call[0] === 'emitAction'), false);
});

runTest('online.jsはrestore replay transactionを専用runtimeへ委譲する', () => {
    const online = fs.readFileSync(path.join(__dirname, '..', 'js/online.js'), 'utf8');
    const runtime = fs.readFileSync(
        path.join(__dirname, '..', 'js/onlineRejoinActivationRuntime.js'),
        'utf8'
    );
    assert.ok(online.includes('OnlineRejoinActivationRuntime.createRuntime'));
    assert.strictEqual(online.includes('let restoredOk = false'), false);
    assert.strictEqual(online.includes('const pendingResendDecisions ='), false);
    assert.ok(runtime.includes('function resendPending(input)'));
});

runTest('online rejoin activation runtimeは必須adapter欠落を初期化前に拒否する', () => {
    assert.throws(
        () => OnlineRejoinActivationRuntime.createRuntime(),
        /dependency is required/
    );
    const harness = createHarness();
    assert.ok(Object.isFrozen(harness.runtime));
});
