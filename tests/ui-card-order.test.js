const assert = require('assert');
const UiCardOrder = require('../js/uiCardOrder');

const colorOrder = { blue: 0, green: 1, red: 2, purple: 3 };
const cards = [
    { name: '高価', color: 'green', diceNums: [2], cost: 3 },
    { name: '安価', color: 'green', diceNums: [2], cost: 1 },
    { name: '青', color: 'blue', diceNums: [6], cost: 10 },
    { name: '後', color: 'green', diceNums: [3], cost: 1 },
];

assert.deepStrictEqual(
    [...cards].sort((a, b) => UiCardOrder.compareCardsForDisplay(a, b, colorOrder)).map(card => card.name),
    ['青', '安価', '高価', '後']
);
assert.strictEqual(UiCardOrder.compareCardNamesForDisplay('青', '不明', cards, colorOrder), -1);
assert.strictEqual(UiCardOrder.compareCardNamesForDisplay('不明', '青', cards, colorOrder), 1);
assert.ok(UiCardOrder.compareCardNamesForDisplay('い', 'あ', cards, colorOrder) > 0);

console.log('ui card order tests passed');
