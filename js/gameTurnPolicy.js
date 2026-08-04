'use strict';

const GameTurnPolicy = (() => {
    function pendingResetState() {
        return Object.freeze({
            pendingTV: 0,
            pendingBusiness: 0,
            pendingCleaning: 0,
            pendingMover: 0,
            pendingRenovation: 0,
            pendingIT: false,
            pendingActionQueue: Object.freeze([]),
        });
    }

    function turnResetPlan(options = {}) {
        return Object.freeze({
            clearLog: !!options.clearLog,
            clearDice: !!options.clearDice,
            lastDiceResult: 0,
            lastDice1: 0,
            lastDice2: 0,
            pendingTunaDice: null,
            builtThisTurn: false,
            usedReroll: false,
            pending: pendingResetState(),
            hadAmusementParkAtRoll: false,
        });
    }

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

    const itResolutionOutcomes = Object.freeze({
        REJECTED: 'rejected',
        SAVED: 'saved',
        INSUFFICIENT_COINS: 'insufficient-coins',
        SKIPPED: 'skipped',
    });

    function planItResolution(facts = {}) {
        if (readFact(facts.phase) !== readFact(facts.pendingPhase) || !readFact(facts.pendingIt)) {
            return Object.freeze({
                ok: false,
                outcome: itResolutionOutcomes.REJECTED,
                coinDelta: 0,
                ventureDelta: 0,
            });
        }
        if (!readFact(facts.doSave)) {
            return Object.freeze({
                ok: true,
                outcome: itResolutionOutcomes.SKIPPED,
                coinDelta: 0,
                ventureDelta: 0,
            });
        }
        if (readFact(facts.coins) < 1) {
            return Object.freeze({
                ok: true,
                outcome: itResolutionOutcomes.INSUFFICIENT_COINS,
                coinDelta: 0,
                ventureDelta: 0,
            });
        }
        return Object.freeze({
            ok: true,
            outcome: itResolutionOutcomes.SAVED,
            coinDelta: -1,
            ventureDelta: 1,
        });
    }

    return Object.freeze({
        pendingResetState,
        turnResetPlan,
        phaseAfterIncome,
        shouldRepeatAmusementParkTurn,
        nextPlayerIndex,
        nextTurnRejectionReasons,
        planNextTurnAdmission,
        shouldAwardAirportBonus,
        planNextTurnContinuation,
        itResolutionOutcomes,
        planItResolution,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameTurnPolicy;
if (typeof window !== 'undefined') window.GameTurnPolicy = GameTurnPolicy;
if (typeof globalThis !== 'undefined') globalThis.GameTurnPolicy = GameTurnPolicy;
