'use strict';

const assert = require('assert');
const makeRestoreReplayAdmission = require('../server/restoreReplayAdmission');
const { runTest } = require('./helpers/test-utils');

function makeHarness(overrides = {}) {
    const calls = [];
    const sanitizedActionLog = [{ action: 'rollDice' }];
    const restoredRank = { hostEpoch: 3, actionSeq: 7 };
    const input = {
        actionLog: [{ action: 'rollDice' }],
        roomId: 'ROOM01',
        replayStateSnapshot: { actionSeq: 2 },
        canonicalRecord: null,
        clientSnapshotTrusted: true,
        stateSnapshot: { actionSeq: 2 },
        gameStartPayload: { hostEpoch: 1 },
    };
    const dependencies = {
        restoreAuditSecret: () => { calls.push('secret'); return ''; },
        sanitizeRestoreActionLog: (actionLog, roomId, snapshot, options) => {
            calls.push('sanitize');
            assert.strictEqual(actionLog, input.actionLog);
            assert.strictEqual(roomId, input.roomId);
            assert.strictEqual(snapshot, input.replayStateSnapshot);
            assert.deepStrictEqual(options, { requireSignedActionAudit: false });
            return sanitizedActionLog;
        },
        restorePayloadRank: (gameStartPayload, snapshot, actionLog) => {
            calls.push('rank');
            assert.strictEqual(gameStartPayload, input.gameStartPayload);
            assert.strictEqual(snapshot, input.replayStateSnapshot);
            assert.strictEqual(actionLog, sanitizedActionLog);
            return restoredRank;
        },
        ...overrides,
    };
    return {
        calls,
        input,
        sanitizedActionLog,
        restoredRank,
        plan: makeRestoreReplayAdmission(dependencies).planRestoreReplayAdmission,
    };
}

runTest('restore replay admissionは全依存を実行前に検証する', () => {
    assert.throws(() => makeRestoreReplayAdmission({}), /sanitizeRestoreActionLog must be a function/);
});

runTest('restore replay admissionはsecret読取後にsanitize optionを決める', () => {
    const harness = makeHarness({
        restoreAuditSecret: () => { harness.calls.push('secret'); return 'configured'; },
        sanitizeRestoreActionLog: (actionLog, roomId, snapshot, options) => {
            harness.calls.push('sanitize');
            assert.deepStrictEqual(options, { requireSignedActionAudit: true });
            return harness.sanitizedActionLog;
        },
    });
    const result = harness.plan(harness.input);
    assert.deepStrictEqual(harness.calls, ['secret', 'sanitize', 'rank']);
    assert.strictEqual(result.sanitizedActionLog, harness.sanitizedActionLog);
    assert.strictEqual(result.restoredRank, harness.restoredRank);
});

runTest('restore replay admissionはcanonical時もsecretを読み署名要求だけ省略する', () => {
    const harness = makeHarness({
        restoreAuditSecret: () => { harness.calls.push('secret'); return 'configured'; },
        sanitizeRestoreActionLog: (actionLog, roomId, snapshot, options) => {
            harness.calls.push('sanitize');
            assert.deepStrictEqual(options, { requireSignedActionAudit: false });
            return harness.sanitizedActionLog;
        },
    });
    harness.input.canonicalRecord = { hostEpoch: 4, actionSeq: 9 };
    const result = harness.plan(harness.input);
    assert.deepStrictEqual(harness.calls, ['secret', 'sanitize']);
    assert.deepStrictEqual(result.restoredRank, { hostEpoch: 4, actionSeq: 9 });
});

runTest('restore replay admissionはsanitize失敗をrank前に拒否する', () => {
    const harness = makeHarness({
        sanitizeRestoreActionLog: () => { harness.calls.push('sanitize'); return null; },
    });
    assert.deepStrictEqual(harness.plan(harness.input), {
        ok: false,
        errorMessage: '復元データが壊れています',
    });
    assert.deepStrictEqual(harness.calls, ['secret', 'sanitize']);
});

runTest('restore replay admissionはclient authority不足の空logを拒否する', () => {
    const fixtures = [
        [{ clientSnapshotTrusted: false }, ['secret', 'sanitize']],
        [{ clientSnapshotTrusted: true, stateSnapshot: null }, ['secret', 'sanitize']],
    ];
    for (const [overrides, expectedCalls] of fixtures) {
        const harness = makeHarness({ sanitizeRestoreActionLog: () => { harness.calls.push('sanitize'); return []; } });
        Object.assign(harness.input, overrides);
        assert.deepStrictEqual(harness.plan(harness.input), {
            ok: false,
            errorMessage: '復元データが壊れています',
        });
        assert.deepStrictEqual(harness.calls, expectedCalls);
    }
});

runTest('restore replay admissionはtrusted snapshotの空logをrankへ渡す', () => {
    const emptyLog = [];
    const harness = makeHarness({
        sanitizeRestoreActionLog: () => { harness.calls.push('sanitize'); return emptyLog; },
        restorePayloadRank: (gameStart, snapshot, actionLog) => {
            harness.calls.push('rank');
            assert.strictEqual(actionLog, emptyLog);
            return harness.restoredRank;
        },
    });
    const result = harness.plan(harness.input);
    assert.deepStrictEqual(harness.calls, ['secret', 'sanitize', 'rank']);
    assert.strictEqual(result.sanitizedActionLog, emptyLog);
});

runTest('restore replay admissionはcanonicalの不正rankだけ既存fallbackで補う', () => {
    const harness = makeHarness();
    harness.input.canonicalRecord = { hostEpoch: 'bad', actionSeq: 'bad' };
    const result = harness.plan(harness.input);
    assert.deepStrictEqual(harness.calls, ['secret', 'sanitize', 'rank']);
    assert.deepStrictEqual(result.restoredRank, { hostEpoch: 0, actionSeq: harness.restoredRank.actionSeq });
});
