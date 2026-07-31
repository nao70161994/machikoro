'use strict';

const assert = require('assert');
const { OnlineHostChanged } = require('../js/onlineHostChanged');
const { runTest } = require('./helpers/test-utils');

function handlers(calls) {
    return Object.fromEntries(OnlineHostChanged.steps.map(step => [
        step,
        value => calls.push([step, value]),
    ]));
}

runTest('online host changed planはoriginal player indexからhost所有をpureに判定する', () => {
    assert.deepStrictEqual(OnlineHostChanged.plan({
        newHostPlayerIndex: 2, myOriginalPlayerIndex: 2,
    }), { isHost: true });
    assert.deepStrictEqual(OnlineHostChanged.plan({
        newHostPlayerIndex: 1, myOriginalPlayerIndex: 2,
    }), { isHost: false });
    assert.strictEqual(OnlineHostChanged.plan({
        newHostPlayerIndex: '2', myOriginalPlayerIndex: 2,
    }).isHost, false);
});

runTest('online host changed plan authorityはlegacy完全一致時だけpure planを選ぶ', () => {
    const input = { newHostPlayerIndex: 1, myOriginalPlayerIndex: 1 };
    assert.strictEqual(OnlineHostChanged.selectPlan(
        input, { isHost: true }, { authorityEnabled: true }
    ).source, 'pure-plan');
    assert.deepStrictEqual(OnlineHostChanged.selectPlan(
        input, { isHost: false }, { authorityEnabled: true }
    ), {
        plan: { isHost: false },
        source: 'legacy-fallback',
        fallbackReason: 'host-changed-plan-mismatch',
    });
});

runTest('online host changed executorはhost化後にlog/render/CPU予約して永続化する', () => {
    const calls = [];
    OnlineHostChanged.execute({ isHost: true }, handlers(calls));
    assert.deepStrictEqual(calls, [
        ['setHostState', true],
        ['addHostLog', undefined],
        ['render', undefined],
        ['scheduleCpu', undefined],
        ['persistHostState', undefined],
    ]);
});

runTest('online host changed executorは非host化でCPU予約を無効化して永続化する', () => {
    const calls = [];
    OnlineHostChanged.execute({ isHost: false }, handlers(calls));
    assert.deepStrictEqual(calls, [
        ['setHostState', false],
        ['invalidateCpuSchedule', undefined],
        ['persistHostState', undefined],
    ]);
});

runTest('online host changed executorは全handlerをeffect前に検証する', () => {
    const calls = [];
    const incomplete = handlers(calls);
    delete incomplete.persistHostState;
    assert.throws(
        () => OnlineHostChanged.execute({ isHost: true }, incomplete),
        /persistHostState/
    );
    assert.deepStrictEqual(calls, []);
});
