'use strict';

const assert = require('assert');
const UiWatchdogRuntime = require('../js/uiWatchdogRuntime');
const UiWatchdogReporting = require('../js/uiWatchdogReporting');
const { runTest } = require('./helpers/test-utils');

function createHarness(overrides = {}) {
    const calls = [];
    let classificationFacts = null;
    const uiWatchdog = {
        stateKey: snapshot => snapshot.key || 'state-key',
        hasPendingWork: snapshot => !!snapshot.pending,
        isFreezeClassificationCandidate: snapshot => snapshot.candidate !== false,
        classifySnapshot(snapshot, facts) {
            classificationFacts = facts;
            return snapshot.freezeKind || '';
        },
        compactIssueForTrace: issue => ({ kind: issue.kind }),
        compactSnapshotForTrace: snapshot => ({ phase: snapshot.phase }),
        compactRecentCheckpoints: (items, limit) => items.slice(-limit),
        classifyInteractabilityCause: issue => issue.reason || '',
        issueDedupeSignature: () => 'issue-signature',
        compactElementSnapshotForStorage: state => ({ id: state.id }),
        compactFreezePayloadForStorage: payload => payload,
        freezePayloadStorageJson: payload => JSON.stringify(payload),
        buildFreezeReportStack: (payload, facts) => JSON.stringify({ freezeKind: payload.freezeKind, facts }),
        expectedPrimaryActions: () => ['nextTurn'],
    };
    const dependencies = {
        buildSnapshot: () => ({
            key: 'same-state',
            phase: 'build',
            freezeKind: 'human-turn-ui-locked',
            interactabilityIssues: [{ freezeKind: 'human-turn-ui-locked', kind: 'disabled' }],
        }),
        checkpoint: (event, payload) => calls.push(['checkpoint', event, payload]),
        compactActionChildStates: () => [{ action: 'nextTurn' }],
        confirmModalOpen: () => false,
        freezeKinds: {
            MODAL_UI_LOCKED: 'modal-ui-locked',
            PENDING_UI_LOCKED: 'pending-ui-locked',
            HUMAN_TURN_UI_LOCKED: 'human-turn-ui-locked',
        },
        getConfirmAwaitingChoice: () => false,
        getOnlineRetryPolicy: () => ({ isActionAckTimedOut: (startedAt, now) => now - startedAt >= 5000 }),
        getRoot: () => ({ __machikoroClientCheckpoints: [{ event: 'before' }] }),
        hasActiveBlockingModal: () => false,
        hasUsablePendingAction: () => false,
        hasUsablePrimaryAction: () => false,
        isPageHidden: () => false,
        monitor: {
            observeProgress: () => ({ shouldClassify: true, stagnantMs: 5000 }),
            decideReport: () => 'report-and-recover',
            reset: () => calls.push(['reset']),
        },
        monitorActions: {
            RECOVER: 'recover',
            REPORT_AND_RECOVER: 'report-and-recover',
        },
        now: () => 9000,
        recover: snapshot => { calls.push(['recover', snapshot]); return true; },
        report: input => calls.push(['report', input]),
        reporting: UiWatchdogReporting,
        schemaVersion: 2,
        staleConfirmModalOpen: () => false,
        stalePendingModalOpen: () => false,
        store: (key, value) => calls.push(['store', key, value]),
        uiWatchdog,
        validateInteractability: snapshot => snapshot.interactabilityIssues || [],
        ...overrides,
    };
    return {
        calls,
        getClassificationFacts: () => classificationFacts,
        runtime: UiWatchdogRuntime.createRuntime(dependencies),
    };
}

runTest('watchdog runtimeは分類から回復・保存・reportまで既存順序で実行する', () => {
    const { calls, getClassificationFacts, runtime } = createHarness();
    runtime.check();
    assert.deepStrictEqual(calls.map(call => call[0]), ['checkpoint', 'recover', 'store', 'report']);
    assert.strictEqual(calls[0][1], 'freeze-watchdog-report');
    assert.strictEqual(calls[2][1], 'machikoroFreezeSnapshot');
    assert.strictEqual(calls[3][1].source, 'freeze-watchdog');
    assert.strictEqual(getClassificationFacts().humanFreezeKind, 'human-turn-ui-locked');
});

runTest('watchdog runtimeは復旧開始と成否を任意の表示境界へ通知する', () => {
    const statuses = [];
    const { runtime } = createHarness({ onRecoveryStatus: status => statuses.push(status) });
    assert.strictEqual(runtime.check(), true);
    assert.deepStrictEqual(statuses.map(status => status.stage), ['recovering', 'recovered']);
    assert.strictEqual(statuses[0].freezeKind, 'human-turn-ui-locked');
    assert.strictEqual(statuses[0].stagnantMs, 5000);

    const failedStatuses = [];
    const failed = createHarness({
        onRecoveryStatus: status => failedStatuses.push(status),
        recover: () => false,
    });
    assert.strictEqual(failed.runtime.check(), true);
    assert.deepStrictEqual(failedStatuses.map(status => status.stage), ['recovering', 'failed']);
});

runTest('watchdog runtimeは表示通知例外で復旧を止めない', () => {
    const { calls, runtime } = createHarness({ onRecoveryStatus: () => { throw new Error('UI missing'); } });
    assert.strictEqual(runtime.check(), true);
    assert.deepStrictEqual(calls.map(call => call[0]), ['checkpoint', 'recover', 'store', 'report']);
});

runTest('watchdog runtimeは重複report抑止時も回復だけを実行する', () => {
    const { calls, runtime } = createHarness({
        monitor: {
            observeProgress: () => ({ shouldClassify: true, stagnantMs: 6500 }),
            decideReport: () => 'recover',
            reset: () => calls.push(['reset']),
        },
    });
    runtime.check();
    assert.deepStrictEqual(calls.map(call => call[0]), ['recover']);
});

runTest('watchdog runtimeはbackground中の経過を停止時間に数えない', () => {
    const { calls, runtime } = createHarness({ isPageHidden: () => true });
    assert.strictEqual(runtime.check(), false);
    assert.deepStrictEqual(calls, [['reset']]);
});

runTest('watchdog runtimeはpage復帰時に観測基準を明示resetできる', () => {
    const { calls, runtime } = createHarness();
    runtime.reset();
    assert.deepStrictEqual(calls, [['reset']]);
});

runTest('watchdog runtimeはACK timeoutと診断helperを注入境界で維持する', () => {
    const { runtime } = createHarness();
    assert.strictEqual(runtime.isOnlineActionTimedOut({ onlineActionInFlight: true, onlineActionInFlightAt: 3000 }), true);
    assert.strictEqual(runtime.isOnlineActionTimedOut({ onlineActionInFlight: false, onlineActionInFlightAt: 0 }), false);
    assert.deepStrictEqual(runtime.recentCheckpoints(1), [{ event: 'before' }]);
    assert.ok(Object.isFrozen(runtime));
});

runTest('watchdog runtimeは必須依存欠落を初期化時に拒否する', () => {
    assert.throws(() => UiWatchdogRuntime.createRuntime(), /buildSnapshot is required/);
});
