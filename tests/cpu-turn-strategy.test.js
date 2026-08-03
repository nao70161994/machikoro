'use strict';

const assert = require('assert');
const CpuTurnStrategy = require('../js/cpuTurnStrategy');
const { runTest } = require('./helpers/test-utils');

function sequence(values, calls) {
    return () => {
        calls.push('roll');
        return values.shift();
    };
}

runTest('CPU turn strategyはroll actionと乱数消費順を固定する', () => {
    const calls = [];
    const action = CpuTurnStrategy.chooseAction('roll', {
        game: {}, cpu: {}, rollDie: sequence([2, 4, 6], calls),
    });
    assert.deepStrictEqual(action, {
        action: 'rollDice', data: { forceDice: 2, tunaDice: [4, 6] },
    });
    assert.deepStrictEqual(calls, ['roll', 'roll', 'roll']);
    assert.ok(Object.isFrozen(action));
    assert.ok(Object.isFrozen(action.data.tunaDice));
});

runTest('CPU turn strategyはdice選択を乱数より先に評価する', () => {
    const calls = [];
    const game = { marker: 'game' };
    const cpu = {
        chooseDiceCount(value) {
            assert.strictEqual(value, game);
            calls.push('chooseDiceCount');
            return true;
        },
    };
    const action = CpuTurnStrategy.chooseAction('selectDice', {
        game, cpu, rollDie: sequence([1, 2, 3, 4], calls),
    });
    assert.deepStrictEqual(calls, ['chooseDiceCount', 'roll', 'roll', 'roll', 'roll']);
    assert.deepStrictEqual(action, {
        action: 'selectDice',
        data: { useTwo: true, diceCount: 2, d1: 1, d2: 2, tunaDice: [3, 4] },
    });
});

runTest('CPU turn strategyはreroll拒否時に乱数を消費しない', () => {
    let rollCount = 0;
    const action = CpuTurnStrategy.chooseAction('rerollConfirm', {
        game: {}, cpu: { chooseReroll: () => false }, rollDie: () => { rollCount++; return 1; },
    });
    assert.deepStrictEqual(action, { action: 'skipReroll', data: {} });
    assert.strictEqual(rollCount, 0);
});

runTest('CPU turn strategyは残りの非build判断をaction proposal化する', () => {
    const game = {};
    assert.deepStrictEqual(CpuTurnStrategy.chooseAction('harborChoice', {
        game, cpu: { chooseHarbor: () => true },
    }), { action: 'resolveHarbor', data: { useBonus: true } });
    assert.deepStrictEqual(CpuTurnStrategy.chooseAction('nextTurn', {
        game, cpu: {},
    }), { action: 'nextTurn', data: {} });
    assert.deepStrictEqual(CpuTurnStrategy.chooseAction('resolveIT', {
        game, cpu: { chooseITInvest: () => false },
    }), { action: 'resolveIT', data: { doSave: false } });
    const pending = { action: 'resolveTV', data: { targetIndex: 2 } };
    assert.strictEqual(CpuTurnStrategy.chooseAction('pending', {
        game, cpu: {}, choosePendingAction: () => pending,
    }), pending);
    const shopStock = { wheat: 4 };
    const buildProposal = { action: 'buildCard', data: { cardName: '麦畑' } };
    let buildCalls = 0;
    assert.strictEqual(CpuTurnStrategy.chooseAction('build', {
        game,
        shopStock,
        cpu: {
            chooseBuildAction(actualGame, actualShopStock) {
                buildCalls++;
                assert.strictEqual(actualGame, game);
                assert.strictEqual(actualShopStock, shopStock);
                return buildProposal;
            },
        },
    }), buildProposal);
    assert.strictEqual(buildCalls, 1);
    assert.strictEqual(CpuTurnStrategy.chooseAction('build', { game, cpu: {} }), null);
});
