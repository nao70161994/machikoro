'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const PlazaTownLayout = require('../js/plazaTownLayout');

function verify(towns, marketHeight) {
    const input = { towns, marketWidth: 520, marketHeight };
    const before = JSON.stringify(input);
    const result = PlazaTownLayout.calculate(input);
    assert.strictEqual(JSON.stringify(input), before, 'measured inputs remain unchanged');
    const boxes = towns.map(town => ({ ...result.positions[town.seat], width: town.width, height: town.height }));
    boxes.push({ left: result.marketLeft, top: result.marketTop, width: 520, height: marketHeight });
    for (const box of boxes) {
        assert.ok(box.left >= 0 && box.top >= 0);
        assert.ok(box.left + box.width <= result.width);
        assert.ok(box.top + box.height <= result.height);
    }
    boxes.forEach((a, index) => boxes.slice(index + 1).forEach(b => {
        assert.ok(a.left + a.width <= b.left || b.left + b.width <= a.left ||
            a.top + a.height <= b.top || b.top + b.height <= a.top, 'towns and market never overlap');
    }));
    assert.strictEqual(Object.keys(result.positions).length, towns.length);
    return result;
}

for (let count = 2; count <= 10; count++) {
    runTest(`${count}人の通常/成熟/詳細展開サイズで市場と全街を境界内に分離する`, () => {
        for (const heights of [Array(count).fill(260), Array(count).fill(620),
            Array.from({ length: count }, (_, seat) => seat % 2 ? 1300 : 190)]) {
            for (const marketHeight of [420, 980]) {
                verify(heights.map((height, seat) => ({ seat, width: 450, height })), marketHeight);
            }
        }
    });
}
runTest('2〜4人は既存cardinal位置と北/市場/selfのoverflow移動を維持する', () => {
    const result = verify(Array.from({ length: 4 }, (_, seat) => ({ seat, width: 450, height: seat === 2 ? 900 : 260 })), 800);
    assert.deepStrictEqual(result.positions[1], { left: 70, top: 470 });
    assert.deepStrictEqual(result.positions[2], { left: 580, top: 0 });
    assert.deepStrictEqual(result.positions[3], { left: 1150, top: 470 });
    assert.strictEqual(result.marketTop, 932);
    assert.deepStrictEqual(result.positions[0], { left: 580, top: 1764 });
});
runTest('5〜10人は先頭4席を市場の下左上右に維持しextraを番号順に配置する', () => {
    for (let count = 5; count <= 10; count++) {
        const result = verify(Array.from({ length: count }, (_, seat) => ({ seat, width: 450, height: 260 })), 420);
        assert.strictEqual(result.positions[0].left, result.marketLeft);
        assert.ok(result.positions[0].top > result.marketTop);
        assert.strictEqual(result.positions[1].top, result.marketTop);
        assert.ok(result.positions[1].left < result.marketLeft);
        assert.strictEqual(result.positions[2].left, result.marketLeft);
        assert.ok(result.positions[2].top < result.marketTop);
        assert.strictEqual(result.positions[3].top, result.marketTop);
        assert.ok(result.positions[3].left > result.marketLeft);
        const extra = Array.from({ length: count - 4 }, (_, index) => result.positions[index + 4]);
        for (let index = 1; index < extra.length; index++) {
            assert.ok(extra[index].top > extra[index - 1].top ||
                (extra[index].top === extra[index - 1].top && extra[index].left > extra[index - 1].left));
        }
        assert.strictEqual(result.width, count <= 8 ? 1640 : 2130);
        assert.strictEqual(result.height, 1160);
    }
});
runTest('gridは個別の実測幅と各行の最大高さを尊重しseat入力順に依存しない', () => {
    const towns = Array.from({ length: 10 }, (_, seat) => ({ seat, width: 400 + seat * 17, height: 200 + seat * 113 }));
    const result = verify(towns, 1500);
    assert.deepStrictEqual(PlazaTownLayout.calculate({ towns: [...towns].reverse(), marketWidth: 520, marketHeight: 1500 }), result);
    assert.ok(result.positions[0].top >= result.marketTop + 1500 + 40);
});
