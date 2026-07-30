'use strict';

function minorCardIndexes(player) {
    const indexes = [];
    for (let index = 0; index < player.cards.length; index++) {
        const card = player.cards[index];
        if (!card || card.category === CARD_CATEGORIES.MAJOR) continue;
        indexes.push(index);
    }
    return indexes;
}

function forEachMove(game, callback) {
    const current = game.currentPlayer();
    const currentIndex = game.currentPlayerIndex;
    for (let myIndex = 0; myIndex < current.cards.length; myIndex++) {
        const myCard = current.cards[myIndex];
        if (!myCard || myCard.category === CARD_CATEGORIES.MAJOR) continue;
        for (let targetIndex = 0; targetIndex < game.players.length; targetIndex++) {
            if (targetIndex === currentIndex) continue;
            const target = game.players[targetIndex];
            for (let theirIndex = 0; theirIndex < target.cards.length; theirIndex++) {
                const theirCard = target.cards[theirIndex];
                if (!theirCard || theirCard.category === CARD_CATEGORIES.MAJOR) continue;
                const result = callback({
                    myCard,
                    myIndex,
                    target,
                    targetIndex,
                    theirCard,
                    theirIndex,
                });
                if (result === false) return false;
            }
        }
    }
    return true;
}

function rankedCandidateIndexes(player, limit, scoreForIndex, descending = false) {
    const indexes = minorCardIndexes(player);
    if (indexes.length <= limit) return indexes;
    return indexes
        .map(index => ({ index, score: scoreForIndex(index, player.cards[index]) }))
        .sort((a, b) => (descending ? b.score - a.score : a.score - b.score) || a.index - b.index)
        .slice(0, limit)
        .map(entry => entry.index);
}

function scoreExchange(selfGain, selfLoss, denial, gift) {
    const score = selfGain - selfLoss + denial * 0.5 - gift * 0.5;
    return { selfGain, selfLoss, denial, gift, score };
}

function chooseRandomMove(game, randomChoice) {
    const current = game.currentPlayer();
    const myIndexes = minorCardIndexes(current);
    if (myIndexes.length === 0) return null;
    const targetIndexes = game.players
        .map((player, index) => ({ player, index }))
        .filter(entry => entry.index !== game.currentPlayerIndex && minorCardIndexes(entry.player).length > 0);
    if (targetIndexes.length === 0) return null;
    const myCard = randomChoice(myIndexes);
    const targetEntry = randomChoice(targetIndexes);
    const theirCard = randomChoice(minorCardIndexes(targetEntry.player));
    if (myCard == null || !targetEntry || theirCard == null) return null;
    return {
        myCard,
        targetIndex: targetEntry.index,
        theirCard,
    };
}

function chooseSimpleMove(game, actor, ownedValueForCard, receivedValueForCard) {
    const currentIndex = game.players.indexOf(actor);
    const myIndexes = minorCardIndexes(actor);
    if (myIndexes.length === 0) return null;

    let myCard = myIndexes[0];
    let myLoss = ownedValueForCard(actor.cards[myCard]);
    for (const index of myIndexes) {
        const loss = ownedValueForCard(actor.cards[index]);
        if (loss < myLoss) {
            myLoss = loss;
            myCard = index;
        }
    }

    let bestMove = null;
    let bestScore = -Infinity;
    for (let targetIndex = 0; targetIndex < game.players.length; targetIndex++) {
        if (targetIndex === currentIndex) continue;
        const target = game.players[targetIndex];
        const theirIndexes = minorCardIndexes(target);
        for (const theirCard of theirIndexes) {
            const gain = receivedValueForCard(target.cards[theirCard]);
            if (gain > bestScore) {
                bestScore = gain;
                bestMove = {
                    myCard,
                    targetIndex,
                    theirCard,
                };
            }
        }
    }
    return bestMove;
}

function forEachCandidate(game, myIndexes, candidateTargets, targetIndexesFor, callback) {
    const current = game.currentPlayer();
    for (const myIndex of myIndexes) {
        const myCard = current.cards[myIndex];
        for (const targetIndex of candidateTargets) {
            const target = game.players[targetIndex];
            const theirIndexes = targetIndexesFor(target, targetIndex);
            for (const theirIndex of theirIndexes) {
                const theirCard = target.cards[theirIndex];
                const result = callback({
                    myCard,
                    myIndex,
                    target,
                    targetIndex,
                    theirCard,
                    theirIndex,
                });
                if (result === false) return false;
            }
        }
    }
    return true;
}

const CPUBusinessMoves = Object.freeze({
    minorCardIndexes,
    forEachMove,
    rankedCandidateIndexes,
    scoreExchange,
    chooseRandomMove,
    chooseSimpleMove,
    forEachCandidate,
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPUBusinessMoves };
if (typeof window !== 'undefined') window.CPUBusinessMoves = CPUBusinessMoves;
if (typeof globalThis !== 'undefined') globalThis.CPUBusinessMoves = CPUBusinessMoves;
