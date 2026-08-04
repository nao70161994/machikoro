'use strict';

const GameDicePolicy = (() => {
    const rollStartDecisions = Object.freeze({
        REJECTED: 'rejected',
        SELECT_DICE: 'select-dice',
        ROLL_ONE: 'roll-one',
    });

    function readFact(value) {
        return typeof value === 'function' ? value() : value;
    }

    function planRollStart(facts = {}) {
        if (readFact(facts.phase) !== readFact(facts.rollPhase)) {
            return Object.freeze({ ok: false, decision: rollStartDecisions.REJECTED });
        }
        const selectDice = !!readFact(facts.hasStation);
        return Object.freeze({
            ok: true,
            decision: selectDice ? rollStartDecisions.SELECT_DICE : rollStartDecisions.ROLL_ONE,
        });
    }

    function planDiceSelection(facts = {}) {
        if (readFact(facts.phase) !== readFact(facts.selectDicePhase)) {
            return Object.freeze({ ok: false, useTwo: false });
        }
        return Object.freeze({ ok: true, useTwo: !!readFact(facts.useTwo) });
    }

    function planDiceOutcome(facts = {}) {
        const useTwo = !!readFact(facts.useTwo);
        const dice1 = readFact(facts.dice1);
        const dice2 = useTwo ? readFact(facts.dice2) : 0;
        return Object.freeze({
            lastDice1: dice1,
            lastDice2: dice2,
            lastDiceResult: useTwo ? dice1 + dice2 : dice1,
            hadAmusementParkAtRoll: readFact(facts.hasAmusementPark),
        });
    }

    function planAfterRoll(facts = {}) {
        const requestReroll = !!readFact(facts.hasRadioTower) && !readFact(facts.usedReroll);
        return Object.freeze({ requestReroll, continueToHarborOrIncome: !requestReroll });
    }

    function planRerollAdmission(facts = {}) {
        return Object.freeze({
            ok: readFact(facts.phase) === readFact(facts.rerollPhase),
        });
    }

    function rerollResetState(rollPhase) {
        return Object.freeze({
            usedReroll: true,
            lastDiceResult: 0,
            lastDice1: 0,
            lastDice2: 0,
            log: Object.freeze([]),
            phase: rollPhase,
        });
    }

    function planHarborOrIncome(facts = {}) {
        const useTwo = readFact(facts.lastDice1) > 0 && readFact(facts.lastDice2) > 0;
        const requestHarborChoice = useTwo && !!readFact(facts.hasHarbor) &&
            readFact(facts.lastDiceResult) >= 10;
        return Object.freeze({
            useTwo,
            requestHarborChoice,
            processIncome: !requestHarborChoice,
        });
    }

    function planHarborResolution(facts = {}) {
        if (readFact(facts.phase) !== readFact(facts.harborPhase)) {
            return Object.freeze({ ok: false, useBonus: false, diceResult: 0 });
        }
        const useBonus = !!readFact(facts.useBonus);
        const diceResult = readFact(facts.lastDiceResult);
        return Object.freeze({
            ok: true,
            useBonus,
            diceResult: useBonus ? diceResult + 2 : diceResult,
        });
    }

    function formatDiceOutcome(dice1, dice2, total) {
        return dice1 > 0 && dice2 > 0 ? `${dice1}+${dice2}=${total}` : `${total}`;
    }

    return Object.freeze({
        rollStartDecisions,
        planRollStart,
        planDiceSelection,
        planDiceOutcome,
        planAfterRoll,
        planRerollAdmission,
        rerollResetState,
        planHarborOrIncome,
        planHarborResolution,
        formatDiceOutcome,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameDicePolicy;
if (typeof window !== 'undefined') window.GameDicePolicy = GameDicePolicy;
if (typeof globalThis !== 'undefined') globalThis.GameDicePolicy = GameDicePolicy;
