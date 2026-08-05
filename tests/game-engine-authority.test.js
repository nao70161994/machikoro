'use strict';

const assert = require('assert');
const GameEngineAuthority = require('../js/gameEngineAuthority');
const {
    gameEngineTransitionAuthorityEnabled,
    makeGameEngineTransitionAuthority,
} = require('../server/gameEngineAuthority');
const { runTest } = require('./helpers/test-utils');


runTest('shared pure engine authority policyはfail-closed選択を固定する', () => {
    const disabled = GameEngineAuthority.create();
    assert.strictEqual(disabled.enabled, false);
    assert.deepStrictEqual(
        disabled.select({ ok: true, snapshot: { phase: 'build' } }, { status: 'matched' }),
        { authority: 'mutable', reason: 'disabled' }
    );

    const enabled = GameEngineAuthority.create({ enabled: true });
    assert.strictEqual(enabled.enabled, true);
    assert.deepStrictEqual(
        enabled.select(null, null),
        { authority: 'mutable', reason: 'transition-unavailable' }
    );
    assert.deepStrictEqual(
        enabled.select({ ok: false, reason: 'hydrate-failed', snapshot: null }, { status: 'matched' }),
        { authority: 'mutable', reason: 'hydrate-failed' }
    );
    assert.deepStrictEqual(
        enabled.select({ ok: true, snapshot: {} }, null),
        { authority: 'mutable', reason: 'parity-unavailable' }
    );
    assert.deepStrictEqual(
        enabled.select({ ok: true, snapshot: {} }, { status: 'mismatch' }),
        { authority: 'mutable', reason: 'mismatch' }
    );
    assert.deepStrictEqual(
        enabled.select({ ok: true, snapshot: {} }, { status: 'matched' }),
        { authority: 'pure-transition', reason: '' }
    );
});

runTest('local prepared authorityは成功transitionだけを直接選択する', () => {
    const disabled = GameEngineAuthority.create();
    assert.deepStrictEqual(
        disabled.selectPrepared({ ok: true, snapshot: { phase: 'build' } }),
        { authority: 'mutable', reason: 'disabled' }
    );
    const enabled = GameEngineAuthority.create({ enabled: true });
    assert.deepStrictEqual(
        enabled.selectPrepared({ ok: true, snapshot: { phase: 'build' } }),
        { authority: 'pure-transition', reason: '' }
    );
    assert.deepStrictEqual(
        enabled.selectPrepared({ ok: false, reason: 'action-rejected', snapshot: null }),
        { authority: 'mutable', reason: 'action-rejected' }
    );
});

runTest('server pure engine authority wrapperはshared policyと同じ選択を返す', () => {
    const shared = GameEngineAuthority.create({ enabled: true });
    const server = makeGameEngineTransitionAuthority({ enabled: true });
    const cases = [
        [null, null],
        [{ ok: false, reason: 'action-rejected', snapshot: null }, { status: 'matched' }],
        [{ ok: true, snapshot: { phase: 'build' } }, { status: 'mismatch' }],
        [{ ok: true, snapshot: { phase: 'build' } }, { status: 'matched' }],
    ];
    cases.forEach(([transition, parity]) => {
        assert.deepStrictEqual(server.select(transition, parity), shared.select(transition, parity));
    });
});

runTest('pure engine authority flagは明示的な有効値だけを受理する', () => {
    assert.strictEqual(gameEngineTransitionAuthorityEnabled({}), false);
    assert.strictEqual(gameEngineTransitionAuthorityEnabled({ GAME_ENGINE_TRANSITION_AUTHORITY_ENABLED: '1' }), true);
    assert.strictEqual(gameEngineTransitionAuthorityEnabled({ GAME_ENGINE_TRANSITION_AUTHORITY_ENABLED: 'TRUE' }), true);
    assert.strictEqual(gameEngineTransitionAuthorityEnabled({ GAME_ENGINE_TRANSITION_AUTHORITY_ENABLED: 'off' }), false);
});

runTest('pure engine authorityは既定OFFでmutable経路を維持する', () => {
    const authority = makeGameEngineTransitionAuthority();
    assert.deepStrictEqual(
        authority.select({ ok: true, snapshot: { phase: 'build' } }, { status: 'matched' }),
        { authority: 'mutable', reason: 'disabled' }
    );
});

runTest('pure engine authorityはtransition成功かつparity一致時だけ選択する', () => {
    const authority = makeGameEngineTransitionAuthority({ enabled: true });
    assert.deepStrictEqual(
        authority.select({ ok: true, snapshot: { phase: 'build' } }, { status: 'matched' }),
        { authority: 'pure-transition', reason: '' }
    );
    assert.deepStrictEqual(
        authority.select({ ok: false, reason: 'action-rejected', snapshot: null }, { status: 'matched' }),
        { authority: 'mutable', reason: 'action-rejected' }
    );
    assert.deepStrictEqual(
        authority.select({ ok: true, snapshot: { phase: 'build' } }, { status: 'mismatch' }),
        { authority: 'mutable', reason: 'mismatch' }
    );
    assert.deepStrictEqual(
        authority.select(null, null),
        { authority: 'mutable', reason: 'transition-unavailable' }
    );
});
