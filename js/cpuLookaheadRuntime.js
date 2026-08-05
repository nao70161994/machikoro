'use strict';

const CPULookaheadRuntime = Object.freeze({
    _simulateLookahead(owner, game, shopStock, focusIndex, maxSteps) {
        return owner._profileMeasure("expert.simulateLookahead", () => {
            const cpus = game.players.map((_, index) => owner._createLookaheadCpu(game, focusIndex, index));
            const tuning = owner.expertTuning;
            const seed = game.turnCount + focusIndex * 97 + game.currentPlayer().coins * 13 + maxSteps;
            const rng = owner._createPlayoutRng(seed);
            const safety = CPUSimulation.runPlayout(game, maxSteps, () => {
                const cpu = cpus[game.currentPlayerIndex];
                owner._runSimulationStep(game, cpu, shopStock, rng);
            });
            owner._profileCount("expert.lookaheadSteps", safety);
            if (game.checkWinner()) {
                const winnerIndex = game.players.indexOf(game.checkWinner());
                return winnerIndex === focusIndex ? tuning.winLookaheadBonus : -tuning.loseLookaheadPenalty;
            }
            return owner._lookaheadTerminalHeuristic(game, focusIndex);
        });
    },

    _createLookaheadCpu(owner, game, focusIndex, playerIndex, createCpu) {
        if (!game || !game.players || playerIndex === focusIndex) return createCpu('strong');
        if (
            owner.difficulty === "expert" &&
            owner._expertFlagEnabled("crowdNormalLookaheadOpponents") &&
            game.players.length >= 4 &&
            playerIndex !== focusIndex
        ) {
            return createCpu('normal');
        }
        if (owner.difficulty === "expert" && game.players.length >= 4) {
            const strongOpponents = owner._lookaheadStrongOpponentSet(game, focusIndex);
            if (!strongOpponents.has(playerIndex)) {
                return createCpu('normal');
            }
        }
        return createCpu('strong');
    },

    _lookaheadStrongOpponentSet(owner, game, focusIndex) {
        let mode = 'all';
        if (owner._expertFlagEnabled("lookaheadLeaderStrongOnly")) mode = 'leader';
        else if (owner._expertFlagEnabled("lookaheadNextSeatStrongOnly")) mode = 'next-seat';
        else if (owner._expertFlagEnabled("lookaheadTopTwoStrong")) mode = 'top-two';
        const indexes = CPULegalMoves.lookaheadStrongOpponentIndexes(
            game && game.players,
            focusIndex,
            mode,
            player => owner._estimateOpponentThreat(player, game)
        );
        return new Set(indexes);
    }
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPULookaheadRuntime };
if (typeof window !== 'undefined') window.CPULookaheadRuntime = CPULookaheadRuntime;
if (typeof globalThis !== 'undefined') globalThis.CPULookaheadRuntime = CPULookaheadRuntime;
