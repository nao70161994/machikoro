'use strict';

const assert = require('assert');
const AppShellUiLockRuntime = require('../js/appShellUiLockRuntime');
const { runTest } = require('./helpers/test-utils');

function createHarness(overrides = {}) {
    const calls = [];
    const elements = {
        confirmModal: { style: {} },
        pendingModal: { style: {} },
        btnSkip: { disabled: true, textContent: 'スキップ' },
    };
    let batchPending = 0;
    const defaultSnapshot = {
        allowedActions: ['nextTurn'],
        visibleModals: [],
        postBuild: true,
        ui: {
            confirmModal: { display: 'none' },
            pendingModal: { display: 'none' },
        },
    };
    const dependencies = {
        buildSnapshot: reason => { calls.push(['snapshot', reason]); return defaultSnapshot; },
        checkpoint: (event, details) => calls.push(['checkpoint', event, details]),
        clearInteractabilityIssueTargets: issues => { calls.push(['clear-issues', issues]); return true; },
        closeConfirmModal: () => calls.push(['close-confirm']),
        expectedPendingActions: () => [],
        expectedPrimaryActions: () => ['nextTurn'],
        freezeKinds: { HUMAN_TURN_UI_LOCKED: 'human-turn-ui-locked' },
        getConfirmAwaitingChoice: () => false,
        getElementById: id => elements[id] || null,
        getRoot: () => ({}),
        isHumanTurnSnapshot: () => true,
        isOnlineUiBlockedSnapshot: () => false,
        monitor: { reset: () => calls.push(['monitor-reset']) },
        postBuildBatch: {
            snapshot: () => ({ pending: batchPending > 0 }),
            begin: count => { batchPending = count; return true; },
            complete: () => { batchPending -= 1; },
        },
        recoveryEffects: {
            clearShellLock: id => { calls.push(['clear-shell', id]); return true; },
            hide: id => calls.push(['hide', id]),
            removeBodyModalOpen: () => { calls.push(['remove-body-lock']); return true; },
            clearModalLock: id => { calls.push(['clear-modal', id]); return true; },
            restoreDisplay: id => { calls.push(['restore-display', id]); return true; },
            forceClearModalLock: id => calls.push(['force-clear-modal', id]),
            clearPointerEvents: id => calls.push(['clear-pointer', id]),
        },
        removeFreezeSnapshot: () => calls.push(['remove-freeze']),
        resetAccessibleModalState: () => calls.push(['reset-modal-state']),
        runtimeEffects: { render: () => calls.push(['render']) },
        setTimeoutFn: null,
        snapshotElement: id => elements[id] || null,
        syncAllowedActionContainers: (snapshot, issues) => { calls.push(['sync-actions', issues]); return true; },
        uiWatchdog: {
            isExplicitModalOpen: state => !!state && state.display !== 'none',
            isStaleConfirmModalSnapshot: (snapshot, facts) => facts.confirmOpen && !facts.awaitingChoice,
            isStalePendingModalSnapshot: (snapshot, open) => !!snapshot.stalePending && open,
            shouldRestoreGameScreenDisplay: snapshot => !!snapshot.restoreGameScreen,
            isPostBuildNextTurnSnapshot: (snapshot, blocking) => !!snapshot.postBuild && !blocking,
        },
        validateInteractability: () => [{ freezeKind: 'human-turn-ui-locked' }],
        ...overrides,
    };
    return { calls, elements, runtime: AppShellUiLockRuntime.createRuntime(dependencies) };
}

runTest('app shell UI lock runtimeはstale confirmを閉じてmodal stateを解除する', () => {
    const { calls, runtime } = createHarness();
    const snapshot = {
        visibleModals: ['confirmModal'],
        ui: { confirmModal: { display: 'block' }, pendingModal: { display: 'none' } },
    };
    assert.deepStrictEqual(runtime.activeBlockingModalIds(snapshot), []);
    assert.strictEqual(runtime.closeStaleBlockingModals(snapshot), true);
    assert.ok(calls.some(call => call[0] === 'close-confirm'));
    assert.ok(calls.some(call => call[0] === 'force-clear-modal' && call[1] === 'gameScreen'));
    assert.ok(calls.filter(call => call[0] === 'reset-modal-state').length >= 2);
});

runTest('app shell UI lock runtimeはpost-build stabilizerを既存4段階で予約する', () => {
    const timers = [];
    const { calls, elements, runtime } = createHarness({
        setTimeoutFn: (callback, delay) => timers.push({ callback, delay }),
    });
    assert.strictEqual(runtime.schedulePostBuildUiStabilizer('post-build-test'), true);
    assert.deepStrictEqual(timers.map(timer => timer.delay), [0, 250, 1500, 3500]);
    timers.forEach(timer => timer.callback());
    assert.strictEqual(elements.btnSkip.disabled, false);
    assert.strictEqual(elements.btnSkip.textContent, '建設完了・ターン終了');
    assert.ok(calls.some(call => call[0] === 'checkpoint' && call[1] === 'post-build-test'));
});

runTest('app shell UI lock runtimeはhuman turn描画後にaction lockを再同期する', () => {
    const { calls, runtime } = createHarness();
    assert.strictEqual(runtime.unlockUiForHumanTurn('human-unlock-test'), true);
    const names = calls.map(call => call[0]);
    assert.ok(names.includes('render'));
    assert.ok(names.includes('sync-actions'));
    assert.ok(names.includes('clear-issues'));
    assert.strictEqual(calls[calls.length - 1][1], 'human-unlock-test');
});

runTest('app shell UI lock runtimeは必須依存欠落を初期化時に拒否する', () => {
    assert.throws(() => AppShellUiLockRuntime.createRuntime(), /buildSnapshot is required/);
});
