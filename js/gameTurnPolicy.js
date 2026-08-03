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

    const nextTurnRejectionReasons = Object.freeze({
        WRONG_PHASE: 'wrong-phase',
        WINNER_DECIDED: 'winner-decided',
    });

    function readFact(value) {
        return typeof value === 'function' ? value() : value;
    }

    function planNextTurnAdmission(facts = {}) {
        if (readFact(facts.phase) !== readFact(facts.buildPhase)) {
            return Object.freeze({ ok: false, reason: nextTurnRejectionReasons.WRONG_PHASE });
        }
        if (readFact(facts.hasWinner)) {
            return Object.freeze({ ok: false, reason: nextTurnRejectionReasons.WINNER_DECIDED });
        }
        return Object.freeze({ ok: true, reason: '' });
    }

    function shouldAwardAirportBonus(facts = {}) {
        return !readFact(facts.builtThisTurn) && readFact(facts.hasAirport) === true;
    }

    function planNextTurnContinuation(facts = {}) {
        const startPendingIt = readFact(facts.hasActiveItStartup) === true;
        return Object.freeze({
            startPendingIt,
            advanceTurn: !startPendingIt,
        });
    }

    return Object.freeze({
        phaseAfterIncome,
        shouldRepeatAmusementParkTurn,
        nextPlayerIndex,
        nextTurnRejectionReasons,
        planNextTurnAdmission,
        shouldAwardAirportBonus,
        planNextTurnContinuation,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameTurnPolicy;
if (typeof window !== 'undefined') window.GameTurnPolicy = GameTurnPolicy;
if (typeof globalThis !== 'undefined') globalThis.GameTurnPolicy = GameTurnPolicy;
