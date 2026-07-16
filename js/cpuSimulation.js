'use strict';

const CPUSimulation = Object.freeze({
    createPlayoutRng(seed) {
        let state = (seed >>> 0) || 1;
        return () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 0x100000000;
        };
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
