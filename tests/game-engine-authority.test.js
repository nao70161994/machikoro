'use strict';

const assert = require('assert');
const {
    gameEngineTransitionAuthorityEnabled,
    makeGameEngineTransitionAuthority,
} = require('../server/gameEngineAuthority');
const { runTest } = require('./helpers/test-utils');

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
