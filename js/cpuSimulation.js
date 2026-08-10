'use strict';

const CPUSimulation = Object.freeze({
    createPlayoutRng(seed) {
        let state = (seed >>> 0) || 1;
        return () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 0x100000000;
        };
    },

    diceOutcomeWeights(useTwo) {
        if (!useTwo) {
            return [
                { weight: 1, dice1: 1, dice2: 0, total: 1 },
                { weight: 1, dice1: 2, dice2: 0, total: 2 },
                { weight: 1, dice1: 3, dice2: 0, total: 3 },
                { weight: 1, dice1: 4, dice2: 0, total: 4 },
                { weight: 1, dice1: 5, dice2: 0, total: 5 },
                { weight: 1, dice1: 6, dice2: 0, total: 6 },
            ];
        }
        return [
            { weight: 1, dice1: 1, dice2: 1, total: 2 },
            { weight: 2, dice1: 1, dice2: 2, total: 3 },
            { weight: 3, dice1: 1, dice2: 3, total: 4 },
            { weight: 4, dice1: 1, dice2: 4, total: 5 },
            { weight: 5, dice1: 1, dice2: 5, total: 6 },
            { weight: 6, dice1: 1, dice2: 6, total: 7 },
            { weight: 5, dice1: 2, dice2: 6, total: 8 },
            { weight: 4, dice1: 3, dice2: 6, total: 9 },
            { weight: 3, dice1: 4, dice2: 6, total: 10 },
            { weight: 2, dice1: 5, dice2: 6, total: 11 },
            { weight: 1, dice1: 6, dice2: 6, total: 12 },
        ];
    },

    buildShopStock(cards, playerCount, initialStockForCard) {
        const stock = {};
        for (const card of cards) stock[card.name] = initialStockForCard(card, playerCount);
        return stock;
    },

    cloneGame(game, adapters = {}) {
        if (typeof adapters.createGame !== 'function' ||
                typeof adapters.cloneCard !== 'function' ||
                typeof adapters.defaultLandmarks !== 'function') {
            throw new TypeError('createGame, cloneCard, and defaultLandmarks adapters are required');
        }
        const clone = adapters.createGame(game.players.length);
        clone.enabledLandmarks = new Set(game.enabledLandmarks || adapters.defaultLandmarks());
        clone.players.forEach((player, index) => {
            const source = game.players[index];
            player.name = source.name;
            player.coins = source.coins;
            player.cards = source.cards.map(card => adapters.cloneCard(card));
            player.dormantCards = source.dormantCards.map(dormant => source.cards.indexOf(dormant))
                .filter(indexOfCard => indexOfCard >= 0)
                .map(indexOfCard => player.cards[indexOfCard])
                .filter(Boolean);
            player.landmarks = Object.assign({}, source.landmarks);
            player.itVentureCoins = source.itVentureCoins || 0;
            player.hasYakusho = source.hasYakusho !== false;
        });
        clone.currentPlayerIndex = game.currentPlayerIndex;
        clone.phase = game.phase;
        clone.lastDiceResult = game.lastDiceResult || 0;
        clone.lastDice1 = game.lastDice1 || 0;
        clone.lastDice2 = game.lastDice2 || 0;
        clone.builtThisTurn = game.builtThisTurn || false;
        clone.pendingTV = game.pendingTV || 0;
        clone.pendingBusiness = game.pendingBusiness || 0;
        clone.pendingCleaning = game.pendingCleaning || 0;
        clone.pendingMover = game.pendingMover || 0;
        clone.pendingRenovation = game.pendingRenovation || 0;
        clone.pendingActionQueue = Array.isArray(game.pendingActionQueue)
            ? game.pendingActionQueue.map(pending => ({ action: pending.action, field: pending.field }))
            : [];
        if (typeof clone.rebuildPendingActionsFromFields === 'function' &&
                clone.pendingActionQueue.length === 0) {
            clone.rebuildPendingActionsFromFields();
        }
        clone.pendingIT = game.pendingIT || false;
        clone.usedReroll = game.usedReroll || false;
        clone.pendingTunaDice = game.pendingTunaDice || null;
        clone.turnCount = game.turnCount || 0;
        clone.hadAmusementParkAtRoll = game.hadAmusementParkAtRoll || false;
        clone.log = [];
        return clone;
    },

    runPlayout(game, maxSteps, step) {
        let safety = 0;
        while (!game.checkWinner() && safety < maxSteps) {
            const progressed = step();
            safety++;
            if (progressed === false) break;
        }
        return safety;
    },
    runPendingStep(game, cpu, pendingPolicy) {
        if (!pendingPolicy ||
                typeof pendingPolicy.pendingProgressSignature !== 'function' ||
                typeof pendingPolicy.choosePendingAction !== 'function' ||
                typeof pendingPolicy.applyPendingAction !== 'function') return false;
        const beforeSignature = pendingPolicy.pendingProgressSignature(game);
        const proposal = pendingPolicy.choosePendingAction(game, cpu, { clearFallback: false });
        if (!proposal || pendingPolicy.applyPendingAction(game, proposal) !== true) return false;
        return pendingPolicy.pendingProgressSignature(game) !== beforeSignature;
    },
    runStep(game, cpu, shopStock, rng, phases, pendingPolicy) {
        const die = () => Math.floor(rng() * 6) + 1;
        const tunaDice = [die(), die()];
        switch (game.phase) {
            case phases.ROLL:
                game.rollDice(die(), tunaDice);
                return;
            case phases.SELECT_DICE: {
                const useTwo = cpu.chooseDiceCount(game);
                game.selectDiceCount(useTwo, die(), die(), tunaDice);
                return;
            }
            case phases.REROLL_CONFIRM:
                if (cpu.chooseReroll(game)) game.rerollDice(die(), tunaDice);
                else game.skipReroll();
                return;
            case phases.HARBOR_CHOICE:
                game.resolveHarbor(cpu.chooseHarbor(game), tunaDice);
                return;
            case phases.PENDING:
                return CPUSimulation.runPendingStep(game, cpu, pendingPolicy);
            case phases.BUILD:
                if (game.pendingIT) {
                    game.resolveIT(cpu.chooseITInvest(game));
                    return;
                }
                cpu.build(game, shopStock);
                if (!game.pendingIT && game.phase === phases.BUILD) game.nextTurn();
                return;
            default:
                return;
        }
    },
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUSimulation };
}
if (typeof window !== 'undefined') window.CPUSimulation = CPUSimulation;
if (typeof globalThis !== 'undefined') globalThis.CPUSimulation = CPUSimulation;
