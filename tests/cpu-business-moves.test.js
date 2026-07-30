'use strict';

const assert = require('assert');
const { CPUBusinessMoves } = require('../js/cpuBusinessMoves');
const { loadCPURuntime } = require('./helpers/runtime-loaders');
const { runTest } = require('./helpers/test-utils');

global.CARD_CATEGORIES = { MAJOR: 'major' };

function makeGame() {
    const players = [
        { cards: [{ name: 'a', category: 'minor' }, null, { name: 'm', category: 'major' }, { name: 'b', category: 'minor' }] },
        { cards: [{ name: 'c', category: 'minor' }, { name: 'd', category: 'minor' }] },
        { cards: [{ name: 'e', category: 'minor' }] },
    ];
    return {
        players,
        currentPlayerIndex: 0,
        currentPlayer() { return this.players[this.currentPlayerIndex]; },
    };
}

runTest('CPU business move helperはminor card indexと全交換順を維持する', () => {
    const game = makeGame();
    assert.deepStrictEqual(CPUBusinessMoves.minorCardIndexes(game.players[0]), [0, 3]);
    const moves = [];
    assert.strictEqual(CPUBusinessMoves.forEachMove(game, move => {
        moves.push([move.myIndex, move.targetIndex, move.theirIndex]);
    }), true);
    assert.deepStrictEqual(moves, [
        [0, 1, 0], [0, 1, 1], [0, 2, 0],
        [3, 1, 0], [3, 1, 1], [3, 2, 0],
    ]);
    let calls = 0;
    assert.strictEqual(CPUBusinessMoves.forEachMove(game, () => (++calls < 2)), false);
    assert.strictEqual(calls, 2);
});

runTest('CPU business move helperはscore同点時のindex順と昇降順を固定する', () => {
    const player = makeGame().players[0];
    assert.deepStrictEqual(
        CPUBusinessMoves.rankedCandidateIndexes(player, 1, index => index === 0 ? 2 : 1),
        [3]
    );
    assert.deepStrictEqual(
        CPUBusinessMoves.rankedCandidateIndexes(player, 1, () => 2, true),
        [0]
    );
    assert.deepStrictEqual(
        CPUBusinessMoves.rankedCandidateIndexes(player, 3, () => { throw new Error('must not score'); }),
        [0, 3]
    );
});

runTest('CPU business move helperは交換価値の既存合成式を保持する', () => {
    assert.deepStrictEqual(CPUBusinessMoves.scoreExchange(8, 3, 6, -2), {
        selfGain: 8,
        selfLoss: 3,
        denial: 6,
        gift: -2,
        score: 9,
    });
});

runTest('CPU business move wrapperはpure helperと同じ候補順を返す', () => {
    const runtime = loadCPURuntime();
    const game = new runtime.GameManager(3);
    game.currentPlayerIndex = 0;
    game.players[0].cards = [runtime.createCardByName('麦畑'), runtime.createCardByName('パン屋')];
    game.players[1].cards = [runtime.createCardByName('カフェ')];
    game.players[2].cards = [runtime.createCardByName('コンビニ')];
    const cpu = new runtime.CPU('expert', { expertPreset: 'v2simple', simulationMode: 'lite' });
    const wrapper = [];
    const direct = [];
    cpu._forEachBusinessMove(game, move => wrapper.push([move.myIndex, move.targetIndex, move.theirIndex]));
    runtime.CPUBusinessMoves.forEachMove(game, move => direct.push([move.myIndex, move.targetIndex, move.theirIndex]));
    assert.deepStrictEqual(wrapper, direct);
    assert.deepStrictEqual(
        Array.from(cpu._minorCardIndexes(game.players[0])),
        Array.from(runtime.CPUBusinessMoves.minorCardIndexes(game.players[0]))
    );
});
