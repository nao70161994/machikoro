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

    runPlayout(game, maxSteps, step) {
        let safety = 0;
        while (!game.checkWinner() && safety < maxSteps) {
            step();
            safety++;
        }
        return safety;
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
                const resolution = pendingPolicy.choosePendingResolution(game, cpu);
                if (resolution) {
                    resolution.apply();
                    return;
                }
                if (game.pendingCleaning > 0) {
                    const cardName = cpu.chooseCleaningTarget(game);
                    if (cardName) game.resolveCleaning(cardName);
                    else pendingPolicy.clearPendingField(game, 'pendingCleaning');
                    return;
                }
                game.phase = phases.BUILD;
                return;
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
