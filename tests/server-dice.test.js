const assert = require('assert');
const makeServerDice = require('../server/serverDice');
const { runTest } = require('./helpers/test-utils');

function makeDice(rolls = []) {
    return makeServerDice({
        isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
        stationName: '駅',
        rollDie: () => rolls.shift(),
    });
}

runTest('server dice は出目をserver authoritativeにするaction集合を固定する', () => {
    const dice = makeDice();

    assert.deepStrictEqual(Object.keys(dice.SERVER_AUTHORITATIVE_DICE_ACTIONS), ['rollDice', 'selectDice', 'rerollDice']);
    assert.ok(Object.isFrozen(dice.SERVER_AUTHORITATIVE_DICE_ACTIONS));
    assert.strictEqual(dice.isServerAuthoritativeDiceAction('rollDice'), true);
    assert.strictEqual(dice.isServerAuthoritativeDiceAction('nextTurn'), false);
});

runTest('server dice は固定roll列から既存canonical payloadを生成する', () => {
    const dice = makeDice([1, 2, 3, 4, 5, 6, 1]);
    const game = { currentPlayer: () => ({ landmarks: { 駅: false } }) };

    assert.deepStrictEqual(dice.makeServerDiceActionData(game, 'rollDice', {}), { forceDice: 1, tunaDice: [2, 3] });
    assert.deepStrictEqual(dice.makeServerDiceActionData(game, 'selectDice', { useTwo: true }), {
        useTwo: true,
        diceCount: 2,
        d1: 4,
        d2: 5,
        tunaDice: [6, 1],
    });
});

runTest('server dice は駅ありrollと対象外payloadを既存どおり扱う', () => {
    const dice = makeDice([6]);
    const game = { currentPlayer: () => ({ landmarks: { 駅: true } }) };
    const invalidSelect = { useTwo: 'yes' };
    const unrelated = { value: 1 };

    assert.deepStrictEqual(dice.makeServerDiceActionData(game, 'rollDice', {}), { forceDice: null, tunaDice: null });
    assert.strictEqual(dice.makeServerDiceActionData(game, 'selectDice', invalidSelect), invalidSelect);
    assert.strictEqual(dice.makeServerDiceActionData(game, 'nextTurn', unrelated), unrelated);
    assert.strictEqual(dice.makeServerDiceActionData(game, 'rollDice', null), null);
});
