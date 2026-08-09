'use strict';

const GamePendingTransition = (() => {
    function freezePlan(plan) {
        return Object.freeze(plan);
    }

    function tvTransferPlan(actorCoins, targetCoins, limit = 5) {
        const transfer = Math.min(limit, targetCoins);
        return freezePlan({
            transfer,
            actorCoins: actorCoins + transfer,
            targetCoins: targetCoins - transfer,
        });
    }

    function businessExchangePlan(actorCards, targetCards, actorCard, targetCard, dormant = {}) {
        const actorCardIndex = actorCards.indexOf(actorCard);
        const targetCardIndex = targetCards.indexOf(targetCard);
        if (actorCardIndex < 0 || targetCardIndex < 0) return null;
        return freezePlan({
            actorCard,
            targetCard,
            actorCardIndex,
            targetCardIndex,
            actorReceivesDormant: dormant.target === true,
            targetReceivesDormant: dormant.actor === true,
        });
    }

    function cleaningPlan(players, cardName, majorCategory, isDormant) {
        const targets = [];
        const requestedAmounts = players.map(() => 0);
        players.forEach((player, playerIndex) => {
            const selectedCards = new Set();
            player.cards.forEach((card, cardIndex) => {
                if (card.name === cardName && card.category !== majorCategory &&
                        !selectedCards.has(card) && !isDormant(player, card)) {
                    selectedCards.add(card);
                    targets.push(Object.freeze({ playerIndex, cardIndex, card }));
                    requestedAmounts[playerIndex] += 1;
                }
            });
        });
        return freezePlan({
            targets: Object.freeze(targets),
            requestedAmounts: Object.freeze(requestedAmounts),
        });
    }

    function moverPlan(actorCoins, actorCards, card, dormant) {
        const cardIndex = actorCards.indexOf(card);
        if (cardIndex < 0) return null;
        const reward = 4;
        return freezePlan({
            card,
            cardIndex,
            dormant: dormant === true,
            reward,
            actorCoins: actorCoins + reward,
        });
    }

    function renovationPlan(actorCoins, landmarks, landmarkName, reward = 8) {
        if (!landmarks || landmarks[landmarkName] !== true) return null;
        return freezePlan({
            landmarkName,
            reward,
            actorCoins: actorCoins + reward,
        });
    }

    return Object.freeze({
        tvTransferPlan,
        businessExchangePlan,
        cleaningPlan,
        moverPlan,
        renovationPlan,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GamePendingTransition;
if (typeof window !== 'undefined') window.GamePendingTransition = GamePendingTransition;
if (typeof globalThis !== 'undefined') globalThis.GamePendingTransition = GamePendingTransition;
