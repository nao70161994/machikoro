'use strict';

function eligibleDormantCards(dormantCards, dice, shouldRevive) {
    const eligible = [];
    for (const card of Array.from(dormantCards)) {
        if (!card.diceNums.includes(dice) || !shouldRevive(card)) continue;
        eligible.push(card);
    }
    return Object.freeze(eligible);
}

const GameCardActivationPolicy = Object.freeze({ eligibleDormantCards });

if (typeof module !== 'undefined' && module.exports) module.exports = GameCardActivationPolicy;
if (typeof globalThis !== 'undefined') globalThis.GameCardActivationPolicy = GameCardActivationPolicy;
