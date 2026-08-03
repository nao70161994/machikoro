'use strict';

const assert = require('assert');
const { OnlineActionSequence } = require('../js/onlineActionSequence');
const { runTest } = require('./helpers/test-utils');

runTest('online action sequence はmemory・game start・snapshot・logの最大seqをpureに選ぶ', () => {
    const log = [
        { seq: 4 },
        { seq: 12 },
        { seq: 3.5 },
        null,
        { action: 'nextTurn' },
    ];
    assert.strictEqual(OnlineActionSequence.maxLogSeq(log), 12);
    assert.strictEqual(OnlineActionSequence.current(
        9,
        { actionSeq: 10 },
        { actionSeq: 11 },
        log
    ), 12);
    assert.strictEqual(OnlineActionSequence.current(13, null, null, null), 13);
});

runTest('online action sequence はlast appliedからgame start metadataを除外する', () => {
    const snapshot = { actionSeq: 7 };
    const log = [{ seq: 8 }, { seq: 10 }, { seq: '20' }];
    assert.strictEqual(OnlineActionSequence.lastApplied(9, snapshot, log), 10);
    assert.strictEqual(OnlineActionSequence.lastApplied(12, snapshot, log), 12);
    assert.strictEqual(OnlineActionSequence.lastApplied(0, null, null), 0);
});

runTest('online action sequence は次seqを既存の1加算規則で返す', () => {
    assert.strictEqual(OnlineActionSequence.next(0), 1);
    assert.strictEqual(OnlineActionSequence.next(42), 43);
});
