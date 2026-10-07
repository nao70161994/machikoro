'use strict';

// Optional structured presentation data. Legacy logs need no migration.
const DicePresentation = (() => {
    function read(value, playerCount = 10) {
        if (!value || typeof value !== 'object' ||
                !Number.isSafeInteger(value.dice1) || value.dice1 < 1 || value.dice1 > 6 ||
                !Number.isSafeInteger(value.dice2) || value.dice2 < 0 || value.dice2 > 6 ||
                value.result !== value.dice1 + value.dice2 ||
                typeof value.rerolled !== 'boolean' ||
                !Number.isSafeInteger(value.turn) || value.turn < 0 ||
                !Number.isInteger(value.actor) || value.actor < 0 || value.actor >= playerCount) return null;
        return { dice1: value.dice1, dice2: value.dice2, result: value.result,
            rerolled: value.rerolled, turn: value.turn, actor: value.actor };
    }
    function identity(value) {
        const resolution = read(value);
        return resolution ? JSON.stringify([resolution.turn, resolution.actor, resolution.rerolled,
            resolution.dice1, resolution.dice2, resolution.result]) : null;
    }
    return Object.freeze({ read, identity });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = DicePresentation;
