'use strict';

const GameTurnPolicy = (() => {
    function phaseAfterIncome(state, phases) {
        const hasPending = !!state && !!(
            state.pendingTV ||
            state.pendingBusiness ||
            state.pendingCleaning ||
            state.pendingMover ||
            state.pendingRenovation
        );
        return hasPending ? phases.PENDING : phases.BUILD;
    }

    function shouldRepeatAmusementParkTurn(state) {
        return !!state && state.hadAmusementParkAtRoll === true &&
            Number.isFinite(state.lastDice1) && state.lastDice1 > 0 &&
            state.lastDice1 === state.lastDice2;
    }

    function nextPlayerIndex(currentPlayerIndex, playerCount) {
        if (!Number.isInteger(currentPlayerIndex) ||
                !Number.isInteger(playerCount) || playerCount <= 0) return 0;
        return (currentPlayerIndex + 1) % playerCount;
    }

    return Object.freeze({
        phaseAfterIncome,
        shouldRepeatAmusementParkTurn,
        nextPlayerIndex,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameTurnPolicy;
if (typeof window !== 'undefined') window.GameTurnPolicy = GameTurnPolicy;
if (typeof globalThis !== 'undefined') globalThis.GameTurnPolicy = GameTurnPolicy;
