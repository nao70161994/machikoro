'use strict';

const GamePendingResolutionPolicy = (() => {
    const reasons = Object.freeze({
        WRONG_PHASE: 'wrong-phase',
        NO_PENDING_ACTION: 'no-pending-action',
        NOT_ACTIVE_PENDING_ACTION: 'not-active-pending-action',
        INVALID_PLAYER_TARGET: 'invalid-player-target',
        INVALID_CARD_TARGET: 'invalid-card-target',
        LANDMARK_NOT_BUILT: 'landmark-not-built',
    });

    function readFact(value) {
        return typeof value === 'function' ? value() : value;
    }

    function result(ok, reason = '') {
        return Object.freeze({ ok, reason });
    }

    function planPendingAction(facts = {}) {
        if (readFact(facts.phase) !== readFact(facts.pendingPhase)) {
            return result(false, reasons.WRONG_PHASE);
        }
        if (!(readFact(facts.pendingCount) > 0)) {
            return result(false, reasons.NO_PENDING_ACTION);
        }
        if (!readFact(facts.canResolve)) {
            return result(false, reasons.NOT_ACTIVE_PENDING_ACTION);
        }
        return result(true);
    }

    function planOtherPlayerTarget(facts = {}) {
        const pending = planPendingAction(facts);
        if (!pending.ok) return pending;
        if (!readFact(facts.targetExists) || readFact(facts.targetIsCurrent)) {
            return result(false, reasons.INVALID_PLAYER_TARGET);
        }
        return result(true);
    }

    function planCleaningTarget(facts = {}) {
        const pending = planPendingAction(facts);
        if (!pending.ok) return pending;
        if (!readFact(facts.cardExists) || readFact(facts.cardIsMajor)) {
            return result(false, reasons.INVALID_CARD_TARGET);
        }
        return result(true);
    }

    function planRenovationTarget(facts = {}) {
        const pending = planPendingAction(facts);
        if (!pending.ok) return pending;
        if (!readFact(facts.landmarkBuilt)) {
            return result(false, reasons.LANDMARK_NOT_BUILT);
        }
        return result(true);
    }

    function resolveMinorCardRef(facts = {}) {
        const cards = readFact(facts.cards);
        if (!Array.isArray(cards)) return null;
        const ref = readFact(facts.ref);
        if (Number.isInteger(ref)) {
            const card = cards[ref];
            return card && !facts.isMajor(card) ? card : null;
        }
        return cards.find(card => card.name === ref && !facts.isMajor(card)) || null;
    }

    function hasBusinessExchange(facts = {}) {
        const players = readFact(facts.players) || [];
        const currentPlayerIndex = readFact(facts.currentPlayerIndex);
        const current = players[currentPlayerIndex];
        if (!current || facts.minorCardsFor(current).length === 0) return false;
        return players.some((player, index) =>
            index !== currentPlayerIndex && facts.minorCardsFor(player).length > 0
        );
    }

    function hasCleaningTarget(facts = {}) {
        const players = readFact(facts.players) || [];
        return players.some(player =>
            facts.cardsFor(player).some(card =>
                !facts.isMajor(card) && !facts.isDormant(player, card)
            )
        );
    }

    function hasPendingAction(state = {}) {
        return !!(
            state.pendingTV ||
            state.pendingBusiness ||
            state.pendingCleaning ||
            state.pendingMover ||
            state.pendingRenovation
        );
    }

    function completionTransition(state = {}, buildPhase) {
        const completed = !hasPendingAction(state);
        return Object.freeze({
            completed,
            nextPhase: completed ? buildPhase : null,
        });
    }

    return Object.freeze({
        reasons,
        planPendingAction,
        planOtherPlayerTarget,
        planCleaningTarget,
        planRenovationTarget,
        resolveMinorCardRef,
        hasBusinessExchange,
        hasCleaningTarget,
        hasPendingAction,
        completionTransition,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GamePendingResolutionPolicy;
if (typeof window !== 'undefined') window.GamePendingResolutionPolicy = GamePendingResolutionPolicy;
if (typeof globalThis !== 'undefined') globalThis.GamePendingResolutionPolicy = GamePendingResolutionPolicy;
