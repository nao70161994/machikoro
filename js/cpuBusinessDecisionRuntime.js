'use strict';

const CPUBusinessDecisionRuntime = Object.freeze({
    _randomChoice(cpu, items) {
        return CPUSelection.randomChoice(items, Math.random);
    },

    _forEachBusinessMove(cpu, game, callback) {
        return CPUBusinessMoves.forEachMove(game, callback);
    },

    _minorCardIndexes(cpu, player) {
        return CPUBusinessMoves.minorCardIndexes(player);
    },

    _chooseRandomBusinessMove(cpu, game) {
        return CPUBusinessMoves.chooseRandomMove(game, items => cpu._randomChoice(items));
    },

    _chooseSimpleBusinessMove(cpu, game, actor = game.currentPlayer()) {
        return CPUBusinessMoves.chooseSimpleMove(
            game,
            actor,
            card => cpu._exchangeOwnedCardValue(card, game, actor),
            card => cpu._exchangeReceivedCardValue(card, game, actor)
        );
    },

    _scoreBusinessExchangeDetails(cpu, game, current, move) {
        if (!move) return null;
        const target = game.players[move.targetIndex];
        if (!target) return null;
        const myCard = move.myCardObject || current.cards[move.myCard];
        const theirCard = move.theirCardObject || target.cards[move.theirCard];
        if (!myCard || !theirCard) return null;
        const selfGain = cpu._exchangeReceivedCardValue(theirCard, game, current);
        const selfLoss = cpu._exchangeOwnedCardValue(myCard, game, current);
        const denial = cpu._exchangeOwnedCardValue(theirCard, game, target);
        const gift = cpu._exchangeReceivedCardValue(myCard, game, target);
        return CPUBusinessMoves.scoreExchange(selfGain, selfLoss, denial, gift);
    },

    _scoreBusinessExchange(cpu, game, current, move) {
        const details = cpu._scoreBusinessExchangeDetails(game, current, move);
        return details ? details.score : null;
    },

    _chooseHarmfulGiftBusinessMove(cpu, game, actor = game.currentPlayer()) {
        const current = actor;
        const simpleMove = cpu._chooseSimpleBusinessMove(game, actor);
        if (!simpleMove) return null;
        const simpleScore = cpu._scoreBusinessExchange(game, current, simpleMove);
        let bestMove = simpleMove;
        let bestScore = simpleScore == null ? -Infinity : simpleScore;
        cpu._forEachBusinessMove(game, ({ myCard, myIndex, targetIndex, theirCard, theirIndex }) => {
            if (myCard.effect !== CARD_EFFECTS.LOAN && myCard.effect !== CARD_EFFECTS.RENOVATION) return;
            const details = cpu._scoreBusinessExchangeDetails(game, current, {
                myCard: myIndex,
                targetIndex,
                theirCard: theirIndex,
                myCardObject: myCard,
                theirCardObject: theirCard,
            });
            if (!details || details.gift >= -0.25) return;
            if (details.score > bestScore) {
                bestScore = details.score;
                bestMove = {
                    myCard: myIndex,
                    targetIndex,
                    theirCard: theirIndex,
                };
            }
        });
        return bestMove;
    },

    _businessOwnCandidateIndexes(cpu, game, current, limit) {
        return CPUBusinessMoves.rankedCandidateIndexes(
            current,
            limit,
            index => cpu._ownedCardValue(current.cards[index], game, current)
        );
    },

    _businessTargetCandidateIndexes(cpu, game, current, target, limit, attackScale) {
        return CPUBusinessMoves.rankedCandidateIndexes(
            target,
            limit,
            (index, card) => cpu._receivedCardValue(card, game, current) +
                cpu._ownedCardValue(card, game, target) * 0.7 * attackScale,
            true
        );
    },

    _forEachBusinessMoveCandidate(cpu, game, candidateTargets, callback) {
        const current = game.currentPlayer();
        const attackScale = cpu._strongCrowdAttackScale(game);
        const ownLimit = cpu.difficulty === "expert" ? 3 : 2;
        const targetLimit = cpu.difficulty === "expert" ? 4 : 3;
        const myIndexes = cpu._businessOwnCandidateIndexes(game, current, ownLimit);
        return CPUBusinessMoves.forEachCandidate(
            game,
            myIndexes,
            candidateTargets,
            target => cpu._businessTargetCandidateIndexes(
                game,
                current,
                target,
                targetLimit,
                attackScale
            ),
            callback
        );
    }
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPUBusinessDecisionRuntime };
if (typeof window !== 'undefined') window.CPUBusinessDecisionRuntime = CPUBusinessDecisionRuntime;
if (typeof globalThis !== 'undefined') globalThis.CPUBusinessDecisionRuntime = CPUBusinessDecisionRuntime;
