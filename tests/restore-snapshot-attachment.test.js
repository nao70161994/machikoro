const assert = require('assert');
const makeRestoreSnapshotAttachment = require('../server/restoreSnapshotAttachment');
const { runTest } = require('./helpers/test-utils');

function makeHarness(auditResult = { signed: true }) {
    const calls = [];
    const runtime = makeRestoreSnapshotAttachment({
        maxActionLogLength: 200,
        buildRestoreSnapshotAudit: (...args) => {
            calls.push(args);
            return auditResult;
        },
    });
    const snapshot = { actionSeq: 201 };
    const room = { gameStartPayload: { playerNames: ['A', 'B'] }, stateSnapshot: snapshot, actionLog: [] };
    return { calls, room, snapshot, attach: runtime.attachCompactedRestoreSnapshotToAction };
}

runTest('restore snapshot attachmentは圧縮境界超過かつ空の残差logだけを添付する', () => {
    const harness = makeHarness();
    const actionEntry = { action: 'nextTurn' };
    const result = harness.attach('ROOM01', harness.room, actionEntry, 201);

    assert.deepStrictEqual(harness.calls, [['ROOM01', harness.room.gameStartPayload, harness.snapshot]]);
    assert.strictEqual(actionEntry.stateSnapshot, harness.snapshot);
    assert.strictEqual(actionEntry.restoreAudit, result.restoreAudit);
    assert.deepStrictEqual(result, { stateSnapshot: harness.snapshot, restoreAudit: { signed: true } });
});

runTest('restore snapshot attachmentは前提不足と境界内で署名処理を呼ばない', () => {
    const harness = makeHarness();
    const cases = [
        [null, {}, 201],
        [harness.room, null, 201],
        [{ ...harness.room, stateSnapshot: null }, {}, 201],
        [harness.room, {}, 200],
        [harness.room, {}, 199],
        [harness.room, {}, 200.5],
        [{ ...harness.room, actionLog: [{}] }, {}, 201],
    ];
    for (const [room, actionEntry, beforeLength] of cases) {
        assert.strictEqual(harness.attach('ROOM01', room, actionEntry, beforeLength), null);
    }
    assert.deepStrictEqual(harness.calls, []);
});

runTest('restore snapshot attachmentは署名失敗時にaction entryを変更しない', () => {
    const harness = makeHarness(null);
    const actionEntry = { action: 'nextTurn' };

    assert.strictEqual(harness.attach('ROOM01', harness.room, actionEntry, 201), null);
    assert.deepStrictEqual(actionEntry, { action: 'nextTurn' });
    assert.strictEqual(harness.calls.length, 1);
});

runTest('restore snapshot attachmentは不正依存を副作用前に拒否する', () => {
    assert.throws(() => makeRestoreSnapshotAttachment({ maxActionLogLength: -1, buildRestoreSnapshotAudit() {} }), /maxActionLogLength/);
    assert.throws(() => makeRestoreSnapshotAttachment({ maxActionLogLength: 200 }), /buildRestoreSnapshotAudit/);
});
