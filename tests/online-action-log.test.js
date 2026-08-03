'use strict';

const assert = require('assert');
const { OnlineActionLog } = require('../js/onlineActionLog');
const { runTest } = require('./helpers/test-utils');

runTest('online action log planはcanonical entryと入力非破壊appendを構築する', () => {
    const data = { cardName: '麦畑' };
    const restoreActionAudit = { kind: 'action' };
    const sourceLog = [{ action: 'rollDice', data: {}, seq: 1 }];
    const plan = OnlineActionLog.planAppend({
        log: sourceLog,
        action: 'buildCard',
        data,
        seq: 2,
        hasExplicitSeq: false,
        actionLogLimit: 100,
        hasGame: true,
        options: {
            playerIndex: 3,
            clientActionId: 'client-2',
            restoreActionAudit,
        },
    });

    assert.deepStrictEqual(plan.entry, {
        action: 'buildCard',
        data,
        playerIndex: 3,
        clientActionId: 'client-2',
        restoreActionAudit,
        seq: 2,
    });
    assert.strictEqual(plan.entry.data, data);
    assert.deepStrictEqual(sourceLog, [{ action: 'rollDice', data: {}, seq: 1 }]);
    assert.deepStrictEqual(plan.finalLog.map(entry => entry.seq), [1, 2]);
    assert.strictEqual(plan.compactRequested, false);
    assert.strictEqual(plan.patchBeforeCompaction, null);
    assert.strictEqual(plan.patchAfterCompaction, null);
});

runTest('online action log executorはcompactとserver Snapshot採用の既存effect順を固定する', () => {
    const serverSnapshot = { actionSeq: 2, phase: 'build' };
    const restoreAudit = { kind: 'snapshot' };
    const plan = OnlineActionLog.planAppend({
        log: [
            { action: 'rollDice', data: {}, seq: 1 },
            { action: 'nextTurn', data: {}, seq: 2 },
        ],
        action: 'buildCard',
        data: { cardName: '麦畑' },
        seq: 3,
        hasExplicitSeq: true,
        actionLogLimit: 2,
        hasGame: true,
        options: {
            seq: 3,
            alreadyApplied: true,
            stateSnapshot: serverSnapshot,
            restoreAudit,
        },
    });
    const calls = [];
    const compactSnapshot = { actionSeq: 1, phase: 'roll' };
    const result = OnlineActionLog.executeAppend(plan, {
        patchGameStart(seq) { calls.push(['patch', seq]); },
        buildCompactionSnapshot() {
            calls.push(['build-compact']);
            return compactSnapshot;
        },
        writeStateSnapshot(snapshot) { calls.push(['write-snapshot', snapshot]); },
        removeRestoreAudit() { calls.push(['remove-audit']); },
        writeRestoreAudit(audit) { calls.push(['write-audit', audit]); },
        writeActionLog(log) { calls.push(['write-log', log.map(entry => entry.seq)]); },
    });

    assert.deepStrictEqual(calls, [
        ['patch', 3],
        ['build-compact'],
        ['write-snapshot', compactSnapshot],
        ['remove-audit'],
        ['write-snapshot', serverSnapshot],
        ['write-audit', restoreAudit],
        ['patch', 3],
        ['write-log', [3]],
    ]);
    assert.deepStrictEqual(result.effects, [
        'patch-game-start',
        'build-compaction-snapshot',
        'write-state-snapshot',
        'remove-restore-audit',
        'write-state-snapshot',
        'write-restore-audit',
        'patch-game-start',
        'write-action-log',
    ]);
    assert.deepStrictEqual(result.log.map(entry => entry.seq), [3]);
});

runTest('online action log executorは未適用explicit seqをcompact後にpatchする', () => {
    const plan = OnlineActionLog.planAppend({
        log: [{ action: 'rollDice', data: {}, seq: 1 }],
        action: 'nextTurn',
        data: {},
        seq: 2,
        hasExplicitSeq: true,
        actionLogLimit: 1,
        hasGame: true,
        options: { seq: 2, alreadyApplied: false },
    });
    const calls = [];
    OnlineActionLog.executeAppend(plan, {
        patchGameStart(seq) { calls.push(['patch', seq]); },
        buildCompactionSnapshot() {
            calls.push(['build-compact']);
            return null;
        },
        writeStateSnapshot() { calls.push(['unexpected-snapshot']); },
        removeRestoreAudit() { calls.push(['unexpected-audit-remove']); },
        writeActionLog(log) { calls.push(['write-log', log.map(entry => entry.seq)]); },
    });

    assert.deepStrictEqual(calls, [
        ['build-compact'],
        ['patch', 2],
        ['write-log', [1, 2]],
    ]);
});

runTest('online action log executorは必要handler欠落をeffect前に拒否する', () => {
    const plan = OnlineActionLog.planAppend({
        log: [],
        action: 'nextTurn',
        data: {},
        seq: 1,
        hasExplicitSeq: false,
        actionLogLimit: 100,
        hasGame: false,
        options: {},
    });
    assert.throws(
        () => OnlineActionLog.executeAppend(plan, {}),
        /writeActionLog/
    );
});
