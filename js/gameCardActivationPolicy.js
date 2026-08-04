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

const greenActivationKinds = Object.freeze({
    WINERY: 'winery',
    MOVER: 'mover',
    LOAN: 'loan',
    RENOVATION: 'renovation',
    NORMAL: 'normal',
});

function greenActivationPlan(facts = {}) {
    const plan = (kind, options = {}) => Object.freeze({
        kind,
        amount: options.amount || 0,
        pendingField: options.pendingField || '',
        shouldDormant: options.shouldDormant === true,
        hasTarget: options.hasTarget === true,
    });
    if (facts.effect === facts.effects.WINERY) {
        const amount = typeof facts.income === 'function' ? facts.income() : facts.income;
        return plan(greenActivationKinds.WINERY, {
            amount,
            shouldDormant: amount > 0,
        });
    }
    if (facts.effect === facts.effects.MOVER) {
        return plan(greenActivationKinds.MOVER, { pendingField: 'pendingMover' });
    }
    if (facts.effect === facts.effects.LOAN) {
        return plan(greenActivationKinds.LOAN);
    }
    if (facts.effect === facts.effects.RENOVATION) {
        const hasTarget = typeof facts.hasRenovationTarget === 'function'
            ? facts.hasRenovationTarget()
            : facts.hasRenovationTarget;
        return plan(greenActivationKinds.RENOVATION, {
            pendingField: hasTarget ? 'pendingRenovation' : '',
            hasTarget,
        });
    }
    const amount = typeof facts.income === 'function' ? facts.income() : facts.income;
    return plan(greenActivationKinds.NORMAL, { amount });
}

const purpleActivationKinds = Object.freeze({
    STADIUM: 'stadium',
    TV: 'tv',
    BUSINESS: 'business',
    PUBLISHER: 'publisher',
    TAXOFFICE: 'taxoffice',
    CLEANING: 'cleaning',
    ITSTARTUP: 'itstartup',
    PARK: 'park',
    UNKNOWN: 'unknown',
});

function purpleActivationPlan(facts = {}) {
    const plan = (kind, pendingField = '', hasTarget = false) => Object.freeze({
        kind,
        pendingField,
        hasTarget,
    });
    if (facts.effect === facts.effects.STADIUM) return plan(purpleActivationKinds.STADIUM);
    if (facts.effect === facts.effects.TV) return plan(purpleActivationKinds.TV, 'pendingTV', true);
    if (facts.effect === facts.effects.BUSINESS) {
        const hasTarget = typeof facts.hasBusinessExchange === 'function'
            ? facts.hasBusinessExchange()
            : facts.hasBusinessExchange;
        return plan(
            purpleActivationKinds.BUSINESS,
            hasTarget ? 'pendingBusiness' : '',
            hasTarget === true
        );
    }
    if (facts.effect === facts.effects.PUBLISHER) return plan(purpleActivationKinds.PUBLISHER);
    if (facts.effect === facts.effects.TAXOFFICE) return plan(purpleActivationKinds.TAXOFFICE);
    if (facts.effect === facts.effects.CLEANING) {
        const hasTarget = typeof facts.hasCleaningTarget === 'function'
            ? facts.hasCleaningTarget()
            : facts.hasCleaningTarget;
        return plan(
            purpleActivationKinds.CLEANING,
            hasTarget ? 'pendingCleaning' : '',
            hasTarget === true
        );
    }
    if (facts.effect === facts.effects.ITSTARTUP) return plan(purpleActivationKinds.ITSTARTUP);
    if (facts.effect === facts.effects.PARK) return plan(purpleActivationKinds.PARK);
    return plan(purpleActivationKinds.UNKNOWN);
}

const GameCardActivationPolicy = Object.freeze({
    eligibleDormantCards,
    blueIncomeKinds,
    blueIncomePlan,
    greenActivationKinds,
    greenActivationPlan,
    purpleActivationKinds,
    purpleActivationPlan,
});

if (typeof module !== 'undefined' && module.exports) module.exports = GameCardActivationPolicy;
if (typeof globalThis !== 'undefined') globalThis.GameCardActivationPolicy = GameCardActivationPolicy;
