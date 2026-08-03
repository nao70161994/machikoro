'use strict';

const assert = require('assert');
const GameDicePolicy = require('../js/gameDicePolicy');
const { runTest } = require('./helpers/test-utils');

runTest('dice policyはroll phaseと駅からreject/select/1個振りをlazyに決める', () => {
    let stationReads = 0;
    assert.deepStrictEqual(GameDicePolicy.planRollStart({
        phase: 'build', rollPhase: 'roll', hasStation: () => { stationReads++; return true; },
    }), { ok: false, decision: GameDicePolicy.rollStartDecisions.REJECTED });
    assert.strictEqual(stationReads, 0);
    assert.deepStrictEqual(GameDicePolicy.planRollStart({
        phase: 'roll', rollPhase: 'roll', hasStation: true,
    }), { ok: true, decision: GameDicePolicy.rollStartDecisions.SELECT_DICE });
    assert.deepStrictEqual(GameDicePolicy.planRollStart({
        phase: 'roll', rollPhase: 'roll', hasStation: false,
    }), { ok: true, decision: GameDicePolicy.rollStartDecisions.ROLL_ONE });
});

runTest('dice policyは選択gateと1個/2個のdetached outcomeを固定する', () => {
    let useTwoReads = 0;
    assert.deepStrictEqual(GameDicePolicy.planDiceSelection({
        phase: 'roll', selectDicePhase: 'select', useTwo: () => { useTwoReads++; return true; },
    }), { ok: false, useTwo: false });
    assert.strictEqual(useTwoReads, 0);
    const one = GameDicePolicy.planDiceOutcome({
        useTwo: false, dice1: 4, dice2: () => { throw new Error('must not read'); }, hasAmusementPark: false,
    });
    const two = GameDicePolicy.planDiceOutcome({
        useTwo: true, dice1: 4, dice2: 5, hasAmusementPark: true,
    });
    assert.deepStrictEqual(one, { lastDice1: 4, lastDice2: 0, lastDiceResult: 4, hadAmusementParkAtRoll: false });
    assert.deepStrictEqual(two, { lastDice1: 4, lastDice2: 5, lastDiceResult: 9, hadAmusementParkAtRoll: true });
    assert.ok(Object.isFrozen(one));
    assert.ok(Object.isFrozen(two));
});

runTest('dice policyは電波塔の再振り確認を既存短絡順で決める', () => {
    let usedReads = 0;
    assert.deepStrictEqual(GameDicePolicy.planAfterRoll({
        hasRadioTower: false, usedReroll: () => { usedReads++; return false; },
    }), { requestReroll: false, continueToHarborOrIncome: true });
    assert.strictEqual(usedReads, 0);
    assert.deepStrictEqual(GameDicePolicy.planAfterRoll({ hasRadioTower: true, usedReroll: false }), {
        requestReroll: true, continueToHarborOrIncome: false,
    });
    assert.deepStrictEqual(GameDicePolicy.planAfterRoll({ hasRadioTower: true, usedReroll: true }), {
        requestReroll: false, continueToHarborOrIncome: true,
    });
});

runTest('dice policyは港選択条件を2個振り→港→10以上の順に判定する', () => {
    let harborReads = 0;
    let resultReads = 0;
    const one = GameDicePolicy.planHarborOrIncome({
        lastDice1: 6,
        lastDice2: 0,
        hasHarbor: () => { harborReads++; return true; },
        lastDiceResult: () => { resultReads++; return 12; },
    });
    assert.deepStrictEqual(one, { useTwo: false, requestHarborChoice: false, processIncome: true });
    assert.deepStrictEqual([harborReads, resultReads], [0, 0]);
    assert.deepStrictEqual(GameDicePolicy.planHarborOrIncome({
        lastDice1: 6, lastDice2: 4, hasHarbor: true, lastDiceResult: 10,
    }), { useTwo: true, requestHarborChoice: true, processIncome: false });
    assert.deepStrictEqual(GameDicePolicy.planHarborOrIncome({
        lastDice1: 5, lastDice2: 4, hasHarbor: true, lastDiceResult: 9,
    }), { useTwo: true, requestHarborChoice: false, processIncome: true });
});

runTest('dice policyは港解決gateと+2結果をfrozen planにする', () => {
    let bonusReads = 0;
    assert.deepStrictEqual(GameDicePolicy.planHarborResolution({
        phase: 'build', harborPhase: 'harbor', useBonus: () => { bonusReads++; return true; }, lastDiceResult: 10,
    }), { ok: false, useBonus: false, diceResult: 0 });
    assert.strictEqual(bonusReads, 0);
    const accepted = GameDicePolicy.planHarborResolution({
        phase: 'harbor', harborPhase: 'harbor', useBonus: true, lastDiceResult: 10,
    });
    assert.deepStrictEqual(accepted, { ok: true, useBonus: true, diceResult: 12 });
    assert.ok(Object.isFrozen(accepted));
    assert.strictEqual(GameDicePolicy.formatDiceOutcome(3, 4, 7), '3+4=7');
    assert.strictEqual(GameDicePolicy.formatDiceOutcome(5, 0, 5), '5');
    assert.ok(Object.isFrozen(GameDicePolicy));
    assert.ok(Object.isFrozen(GameDicePolicy.rollStartDecisions));
});
