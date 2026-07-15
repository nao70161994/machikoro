const assert = require('assert');
const { OnlineRestoreRank } = require('../js/onlineRestoreRank');
const { runTest } = require('./helpers/test-utils');

const ACTIONS = Object.freeze({
    rollDice: Object.freeze({}),
    nextTurn: Object.freeze({}),
});

runTest('online restore rank はserver actionSeqの既存max計算を維持する', () => {
    assert.strictEqual(OnlineRestoreRank.serverActionSeq(
        { actionSeq: 4 },
        { actionSeq: 8 },
        [{ seq: 3 }, { seq: 12 }, { seq: '99' }]
    ), 12);
    assert.strictEqual(OnlineRestoreRank.serverActionSeq(null, null, null), 0);
});

runTest('online restore rank は既知actionだけをsnapshot進捗へ加算する', () => {
    const actionLog = [
        { action: 'rollDice', seq: 1000 },
        { action: 'unknown', seq: 1001 },
        { action: 'nextTurn' },
        null,
    ];

    assert.strictEqual(OnlineRestoreRank.isRankAction(actionLog[0], ACTIONS), true);
    assert.strictEqual(OnlineRestoreRank.isRankAction(actionLog[1], ACTIONS), false);
    assert.strictEqual(OnlineRestoreRank.isRankAction(actionLog[0], null), false);
    assert.strictEqual(OnlineRestoreRank.replaySeq({ actionSeq: 7 }, actionLog, ACTIONS), 9);
});

runTest('online restore rank はhostEpochとreplay可能進捗だけで順位を作る', () => {
    assert.deepStrictEqual(OnlineRestoreRank.build(
        { hostEpoch: 3, actionSeq: 9999 },
        { actionSeq: 5 },
        [{ action: 'rollDice', seq: 100 }],
        ACTIONS
    ), {
        hostEpoch: 3,
        actionSeq: 6,
    });
    assert.deepStrictEqual(OnlineRestoreRank.build(null, null, null, ACTIONS), {
        hostEpoch: 0,
        actionSeq: 0,
    });
});

runTest('online restore rank はepoch優先・同epoch進捗優先の比較を維持する', () => {
    assert.strictEqual(OnlineRestoreRank.isNewer(
        { hostEpoch: 2, actionSeq: 0 },
        { hostEpoch: 1, actionSeq: 100 },
    ), true);
    assert.strictEqual(OnlineRestoreRank.isNewer(
        { hostEpoch: 2, actionSeq: 11 },
        { hostEpoch: 2, actionSeq: 10 },
    ), true);
    assert.strictEqual(OnlineRestoreRank.isNewer(
        { hostEpoch: 2, actionSeq: 10 },
        { hostEpoch: 2, actionSeq: 10 },
    ), false);
});
