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

runTest('CPU selection near tieは閾値内だけを安定seedで選ぶ', () => {
    const ranked = [
        { id: 'best', score: 5 },
        { id: 'near', score: 4.98 },
        { id: 'outside', score: 4.8 },
    ];
    const choices = new Set(Array.from({ length: 40 }, (_, seed) =>
        CPUSelection.nearTieChoice(ranked, item => item.score, 0.05, `seed-${seed}`).id
    ));
    assert.deepStrictEqual([...choices].sort(), ['best', 'near']);
    assert.strictEqual(
        CPUSelection.nearTieChoice(ranked, item => item.score, 0.05, 'same-seed'),
        CPUSelection.nearTieChoice(ranked, item => item.score, 0.05, 'same-seed')
    );
    assert.notStrictEqual(CPUSelection.stableSeedIndex('seed', 3), -1);
    assert.strictEqual(CPUSelection.stableSeedIndex('seed', 0), -1);
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


runTest('CPU selection stable rankはscore降順と完全tieの元順序を保持する', () => {
    const items = [
        { id: 'a', score: 2 },
        { id: 'b', score: 5 },
        { id: 'c', score: 5 },
        { id: 'd', score: -1 },
    ];
    const before = items.slice();
    let calls = 0;
    const ranked = CPUSelection.stableRankDescending(items, item => {
        calls++;
        return item.score;
    });
    assert.deepStrictEqual(ranked.map(item => item.id), ['b', 'c', 'a', 'd']);
    assert.deepStrictEqual(items, before);
    assert.strictEqual(calls, items.length);
    assert.notStrictEqual(ranked, items);
});

runTest('CPU selection stable rankはNaN/同Infinityを既存stable sort同様tie扱いする', () => {
    const items = [
        { id: 'nan', score: NaN },
        { id: 'finite', score: 3 },
        { id: 'inf-a', score: Infinity },
        { id: 'inf-b', score: Infinity },
    ];
    const expected = items.slice().sort((left, right) => right.score - left.score);
    assert.deepStrictEqual(
        CPUSelection.stableRankDescending(items, item => item.score),
        expected
    );
    assert.deepStrictEqual(CPUSelection.stableRankDescending(null, item => item.score), []);
    assert.deepStrictEqual(CPUSelection.stableRankDescending(items, null), []);
});

runTest('CPU selection lexicographic rankは複合key方向と完全tieの元順を保持する', () => {
    const items = [
        { id: 'a', urgency: 4, cost: 5 },
        { id: 'b', urgency: 7, cost: 6 },
        { id: 'c', urgency: 7, cost: 3 },
        { id: 'd', urgency: 7, cost: 3 },
    ];
    const calls = { urgency: 0, cost: 0 };
    const ranked = CPUSelection.stableRankLexicographic(items, [
        { valueOf: item => { calls.urgency++; return item.urgency; }, direction: CPUSelection.directions.DESCENDING },
        { valueOf: item => { calls.cost++; return item.cost; }, direction: CPUSelection.directions.ASCENDING },
    ]);
    assert.deepStrictEqual(ranked.map(item => item.id), ['c', 'd', 'b', 'a']);
    assert.deepStrictEqual(calls, { urgency: items.length, cost: items.length });
    assert.deepStrictEqual(items.map(item => item.id), ['a', 'b', 'c', 'd']);
});

runTest('CPU selection lexicographic rankはNaN keyを次keyへ倒し不正specを拒否する', () => {
    const items = [{ id: 'a', first: NaN, second: 2 }, { id: 'b', first: 1, second: 4 }];
    assert.deepStrictEqual(CPUSelection.stableRankLexicographic(items, [
        { valueOf: item => item.first, direction: CPUSelection.directions.DESCENDING },
        { valueOf: item => item.second, direction: CPUSelection.directions.DESCENDING },
    ]).map(item => item.id), ['b', 'a']);
    assert.deepStrictEqual(CPUSelection.stableRankLexicographic(items, []), []);
    assert.deepStrictEqual(CPUSelection.stableRankLexicographic(items, [{ valueOf: null, direction: 'ascending' }]), []);
    assert.ok(Object.isFrozen(CPUSelection.directions));
});

runTest('CPU selection stable ascendingはscore昇順と元順tieを同じprimitiveで保持する', () => {
    const items = [
        { id: 'a', score: 3 },
        { id: 'b', score: 1 },
        { id: 'c', score: 1 },
        { id: 'd', score: 5 },
    ];
    let calls = 0;
    const ranked = CPUSelection.stableRankAscending(items, item => {
        calls++;
        return item.score;
    });
    assert.deepStrictEqual(ranked.map(item => item.id), ['b', 'c', 'a', 'd']);
    assert.strictEqual(calls, items.length);
    assert.deepStrictEqual(items.map(item => item.id), ['a', 'b', 'c', 'd']);
    assert.deepStrictEqual(CPUSelection.stableRankAscending(null, item => item.score), []);
    assert.deepStrictEqual(CPUSelection.stableRankAscending(items, null), []);
});
