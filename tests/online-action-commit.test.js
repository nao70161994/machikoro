'use strict';

const assert = require('assert');
const { OnlineActionCommit } = require('../js/onlineActionCommit');
const { runTest } = require('./helpers/test-utils');

function commitHandlers(calls, overrides = {}) {
    return Object.fromEntries(OnlineActionCommit.steps.map(step => [
        step,
        overrides[step] || (value => calls.push([step, value])),
    ]));
}

runTest('online action commit executorはincomingのseq/log/render順を維持する', () => {
    const calls = [];
    const result = OnlineActionCommit.execute({
        alreadyApplied: false,
        clearPending: false,
        render: true,
    }, commitHandlers(calls));
    assert.deepStrictEqual(calls, [
        ['setSequence', undefined],
        ['saveActionLog', false],
        ['render', undefined],
        ['scheduleCpu', undefined],
    ]);
    assert.deepStrictEqual(result, {
        ok: true,
        result: true,
        steps: ['setSequence', 'saveActionLog', 'render', 'scheduleCpu'],
    });
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.steps));
});

runTest('online action commit executorはacceptedだけpendingをlog後に削除する', () => {
    const calls = [];
    OnlineActionCommit.execute({
        alreadyApplied: true,
        clearPending: true,
        render: true,
    }, commitHandlers(calls));
    assert.deepStrictEqual(calls, [
        ['setSequence', undefined],
        ['saveActionLog', true],
        ['clearPending', undefined],
        ['render', undefined],
        ['scheduleCpu', undefined],
    ]);
});

runTest('online action commit executorはrestore flush中に描画とCPU予約を行わない', () => {
    const calls = [];
    OnlineActionCommit.execute({
        alreadyApplied: false,
        clearPending: false,
        render: false,
    }, commitHandlers(calls));
    assert.deepStrictEqual(calls, [
        ['setSequence', undefined],
        ['saveActionLog', false],
    ]);
});

runTest('online action commit executorはplanと全handlerをeffect前に検証する', () => {
    const calls = [];
    assert.throws(
        () => OnlineActionCommit.execute({}, commitHandlers(calls)),
        /effect plan/
    );
    const handlers = commitHandlers(calls);
    delete handlers.clearPending;
    assert.throws(
        () => OnlineActionCommit.execute({
            alreadyApplied: false,
            clearPending: false,
            render: false,
        }, handlers),
        /clearPending/
    );
    assert.deepStrictEqual(calls, []);
});

runTest('online action commit executorは例外を伝播して後続を実行しない', () => {
    const calls = [];
    const failure = new Error('log failed');
    const handlers = commitHandlers(calls, {
        saveActionLog(value) {
            calls.push(['saveActionLog', value]);
            throw failure;
        },
    });
    assert.throws(
        () => OnlineActionCommit.execute({
            alreadyApplied: true,
            clearPending: true,
            render: true,
        }, handlers),
        error => error === failure
    );
    assert.deepStrictEqual(calls, [
        ['setSequence', undefined],
        ['saveActionLog', true],
    ]);
});
