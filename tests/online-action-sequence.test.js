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


runTest('online action sequence controllerはmemory seqの唯一のmutable ownerになる', () => {
    const controller = OnlineActionSequence.createController(3);
    assert.strictEqual(controller.snapshot(), 3);
    assert.strictEqual(controller.adopt(2), 3);
    assert.strictEqual(controller.adopt(7), 7);
    assert.strictEqual(controller.current(
        { actionSeq: 8 }, { actionSeq: 6 }, [{ seq: 9 }]
    ), 9);
    assert.strictEqual(controller.snapshot(), 7);
    assert.strictEqual(controller.refreshLastApplied({ actionSeq: 10 }, [{ seq: 11 }]), 11);
    assert.strictEqual(controller.snapshot(), 11);
    assert.strictEqual(controller.replace(4), 4);
    assert.strictEqual(controller.replace('bad'), 0);
    assert.strictEqual(controller.reset(), 0);
    assert.ok(Object.isFrozen(controller));
});

runTest('online action sequence controllerは不正adoptを無視し負のlegacy整数を保持する', () => {
    const controller = OnlineActionSequence.createController(-2);
    assert.strictEqual(controller.snapshot(), -2);
    assert.strictEqual(controller.adopt(null), -2);
    assert.strictEqual(controller.replace(-4), -4);
});
