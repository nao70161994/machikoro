'use strict';

const assert = require('assert');
const { CPUSelection } = require('../js/cpuSelection');
const { runTest } = require('./helpers/test-utils');

runTest('CPU selection random choiceは空入力で乱数を消費しない', () => {
    let calls = 0;
    assert.strictEqual(CPUSelection.randomChoice([], () => { calls++; return 0.5; }), null);
    assert.strictEqual(calls, 0);
});

runTest('CPU selection random choiceは既存floor indexと参照を保持する', () => {
    const items = [{ id: 0 }, { id: 1 }, { id: 2 }];
    assert.strictEqual(CPUSelection.randomChoice(items, () => 0), items[0]);
    assert.strictEqual(CPUSelection.randomChoice(items, () => 0.999), items[2]);
});

runTest('CPU selection firstMaxは最大scoreの最初の候補を保持する', () => {
    const items = [{ id: 'a', score: 2 }, { id: 'b', score: 5 }, { id: 'c', score: 5 }];
    assert.strictEqual(CPUSelection.firstMax(items, item => item.score), items[1]);
    assert.strictEqual(CPUSelection.firstMax([], item => item.score), null);
});

runTest('CPU selection firstMaxは全NaNを既存の未選択へ倒す', () => {
    assert.strictEqual(CPUSelection.firstMax([{ score: NaN }], item => item.score), null);
});

runTest('CPU selection lexicographic maxは優先key順と完全tieの先頭を保持する', () => {
    const items = [
        { id: 'a', steal: 5, built: 2, coins: 8 },
        { id: 'b', steal: 5, built: 3, coins: 6 },
        { id: 'c', steal: 5, built: 3, coins: 9 },
        { id: 'd', steal: 5, built: 3, coins: 9 },
    ];
    const result = CPUSelection.firstLexicographicMax(items, [
        item => item.steal,
        item => item.built,
        item => item.coins,
    ]);
    assert.strictEqual(result, items[2]);
});
