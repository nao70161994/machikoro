'use strict';

function eligibleDormantCards(dormantCards, dice, shouldRevive) {
    const eligible = [];
    for (const card of Array.from(dormantCards)) {
        if (!card.diceNums.includes(dice) || !shouldRevive(card)) continue;
        eligible.push(card);
    }
    return Object.freeze(eligible);
}

const blueIncomeKinds = Object.freeze({
    CORNFIELD: 'cornfield',
    HARBOR: 'harbor',
    TUNA: 'tuna',
    NORMAL: 'normal',
});

function blueIncomePlan(facts = {}) {
    const inactive = kind => Object.freeze({ active: false, amount: 0, kind, dice: null });
    if (facts.effect === facts.effects.CORNFIELD) {
        const builtLandmarkCount = typeof facts.builtLandmarkCount === 'function'
            ? facts.builtLandmarkCount()
            : facts.builtLandmarkCount;
        if (builtLandmarkCount > 1) return inactive(blueIncomeKinds.CORNFIELD);
        return Object.freeze({
            active: true,
            amount: facts.income,
            kind: blueIncomeKinds.CORNFIELD,
            dice: null,
        });
    }
    if (facts.effect === facts.effects.HARBOR) {
        if (facts.hasHarbor !== true) return inactive(blueIncomeKinds.HARBOR);
        return Object.freeze({
            active: true,
            amount: facts.income,
            kind: blueIncomeKinds.HARBOR,
            dice: null,
        });
    }
    if (facts.effect === facts.effects.TUNA) {
        if (facts.hasHarbor !== true) return inactive(blueIncomeKinds.TUNA);
        const dice = typeof facts.tunaDice === 'function' ? facts.tunaDice() : facts.tunaDice;
        const resolvedDice = Object.freeze([dice[0], dice[1]]);
        return Object.freeze({
            active: true,
            amount: resolvedDice[0] + resolvedDice[1],
            kind: blueIncomeKinds.TUNA,
            dice: resolvedDice,
        });
    }
    return Object.freeze({
        active: true,
        amount: facts.income,
        kind: blueIncomeKinds.NORMAL,
        dice: null,
    });
}

const GameCardActivationPolicy = Object.freeze({
    eligibleDormantCards,
    blueIncomeKinds,
    blueIncomePlan,
});

if (typeof module !== 'undefined' && module.exports) module.exports = GameCardActivationPolicy;
if (typeof globalThis !== 'undefined') globalThis.GameCardActivationPolicy = GameCardActivationPolicy;
