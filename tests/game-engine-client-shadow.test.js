'use strict';

const assert = require('assert');
const GameEngineClientShadow = require('../js/gameEngineClientShadow');
const { runTest } = require('./helpers/test-utils');

runTest('client Engine shadow outcome controllerは最後の診断結果を単独所有する', () => {
    const first = Object.freeze({ report: { status: 'matched' } });
    const controller = GameEngineClientShadow.createOutcomeController();

    assert.strictEqual(controller.get(), null);
    assert.strictEqual(controller.set(first), first);
    assert.strictEqual(controller.get(), first);
    assert.strictEqual(controller.reset(), null);
    assert.ok(Object.isFrozen(controller));
    assert.strictEqual(GameEngineClientShadow.createOutcomeController(first).get(), first);
});

runTest('client Engine shadowは無効時にtransitionを実行しない', () => {
    let calls = 0;
    const prepared = GameEngineClientShadow.prepare({
        enabled: false,
        transition() { calls += 1; },
    });
    assert.strictEqual(prepared, null);
    assert.strictEqual(calls, 0);
});

runTest('client Engine shadowはkey順に依存せずsnapshot parityを比較する', () => {
    assert.strictEqual(
        GameEngineClientShadow.equalSnapshots({ b: 2, a: { d: 4, c: 3 } }, { a: { c: 3, d: 4 }, b: 2 }),
        true
    );
    assert.strictEqual(GameEngineClientShadow.equalSnapshots({ a: 1 }, { a: 2 }), false);
});

runTest('client Engine shadowはtransition例外をfail-closed reportへ変換する', () => {
    const prepared = GameEngineClientShadow.prepare({
        enabled: true,
        action: 'nextTurn',
        snapshot: { phase: 'build' },
        data: {},
        transition() { throw new Error('boom'); },
    });
    const outcome = GameEngineClientShadow.finish({
        prepared,
        liveSnapshot: { phase: 'roll' },
        authorityEnabled: true,
    });
    assert.deepStrictEqual(outcome, {
        report: { status: 'transition-error', action: 'nextTurn', reason: 'transition-threw' },
        authority: { authority: 'mutable', reason: 'transition-threw' },
    });
});

runTest('client Engine shadowはparity一致かつ明示authority時だけsnapshotを採用する', () => {
    const target = { phase: 'roll', currentPlayerIndex: 1 };
    const prepared = GameEngineClientShadow.prepare({
        enabled: true,
        action: 'nextTurn',
        snapshot: { phase: 'build', currentPlayerIndex: 0 },
        data: {},
        transition() { return { ok: true, reason: '', snapshot: target }; },
    });
    let adopted = null;
    const shadowOnly = GameEngineClientShadow.finish({
        prepared,
        liveSnapshot: { currentPlayerIndex: 1, phase: 'roll' },
        authorityEnabled: false,
        adoptSnapshot(snapshot) { adopted = snapshot; return true; },
    });
    assert.strictEqual(shadowOnly.report.status, 'matched');
    assert.deepStrictEqual(shadowOnly.authority, { authority: 'mutable', reason: 'disabled' });
    assert.strictEqual(adopted, null);

    const authoritative = GameEngineClientShadow.finish({
        prepared,
        liveSnapshot: { currentPlayerIndex: 1, phase: 'roll' },
        authorityEnabled: true,
        adoptSnapshot(snapshot) { adopted = snapshot; return true; },
    });
    assert.strictEqual(authoritative.report.status, 'matched');
    assert.deepStrictEqual(authoritative.authority, { authority: 'pure-transition', reason: '' });
    assert.strictEqual(adopted, target);
});

runTest('client Engine shadowはmismatchと採用失敗でmutableへfallbackする', () => {
    const prepared = GameEngineClientShadow.prepare({
        enabled: true,
        action: 'nextTurn',
        snapshot: { phase: 'build' },
        data: {},
        transition() { return { ok: true, reason: '', snapshot: { phase: 'roll' } }; },
    });
    let adoptCalls = 0;
    const mismatch = GameEngineClientShadow.finish({
        prepared,
        liveSnapshot: { phase: 'build' },
        authorityEnabled: true,
        adoptSnapshot() { adoptCalls += 1; return true; },
    });
    assert.strictEqual(mismatch.report.status, 'mismatch');
    assert.deepStrictEqual(mismatch.authority, { authority: 'mutable', reason: 'mismatch' });
    assert.strictEqual(adoptCalls, 0);

    const failed = GameEngineClientShadow.finish({
        prepared,
        liveSnapshot: { phase: 'roll' },
        authorityEnabled: true,
        adoptSnapshot() { adoptCalls += 1; return false; },
    });
    assert.deepStrictEqual(failed.authority, { authority: 'mutable', reason: 'adoption-failed' });
    assert.strictEqual(adoptCalls, 1);
});
