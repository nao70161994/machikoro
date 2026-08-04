'use strict';

const assert = require('assert');
const LocalSaveRuntime = require('../js/localSaveRuntime');
const { runTest } = require('./helpers/test-utils');

runTest('local save runtimeはgame・online・winnerを既存短絡順で判定する', () => {
    let winnerReads = 0;
    const hasWinner = () => { winnerReads++; return true; };
    assert.strictEqual(LocalSaveRuntime.admission({ hasGame: false, hasWinner }), 'no-game');
    assert.strictEqual(LocalSaveRuntime.admission({ hasGame: true, isOnline: true, hasWinner }), 'online');
    assert.strictEqual(winnerReads, 0);
    assert.strictEqual(LocalSaveRuntime.admission({ hasGame: true, isOnline: false, hasWinner }), 'winner');
    assert.strictEqual(winnerReads, 1);
    assert.strictEqual(LocalSaveRuntime.admission({
        hasGame: true, isOnline: false, hasWinner: false,
    }), 'save');
});

runTest('local save runtimeはserialize後にrepositoryへ保存し失敗を境界内に留める', () => {
    const events = [];
    const state = { players: [] };
    assert.deepStrictEqual(LocalSaveRuntime.execute({
        serialize() { events.push('serialize'); return state; },
        save(value) { events.push(['save', value]); },
    }), { saved: true, reason: 'save' });
    assert.deepStrictEqual(events, ['serialize', ['save', state]]);

    assert.deepStrictEqual(LocalSaveRuntime.execute({
        serialize() { throw new Error('storage denied'); },
        save() { throw new Error('must not run'); },
    }), { saved: false, reason: 'save-failed' });
});
