'use strict';

const CpuTournament = (() => {
    const DIFFICULTIES = Object.freeze(['weak', 'normal', 'strong', 'expert']);
    const LABELS = Object.freeze({
        weak: 'CPU（弱）',
        normal: 'CPU（普通）',
        strong: 'CPU（強）',
        expert: 'CPU（最強）',
    });
    const STARTING_CARDS = new Set(['麦畑', 'パン屋']);

    function boundedInteger(value, allowed, fallback) {
        const parsed = Number.parseInt(value, 10);
        return allowed.includes(parsed) ? parsed : fallback;
    }

    function normalizeOptions(options = {}) {
        return Object.freeze({
            games: boundedInteger(options.games, [10, 20, 50], 20),
            playerCount: boundedInteger(options.playerCount, [2, 3, 4], 4),
            seed: Number.isSafeInteger(options.seed) && options.seed > 0 ? options.seed : 1,
            maxSteps: Number.isSafeInteger(options.maxSteps) && options.maxSteps > 0
                ? options.maxSteps
                : 5000,
        });
    }

    function lineupForGame(playerCount, gameIndex) {
        const count = boundedInteger(playerCount, [2, 3, 4], 4);
        const offset = Number.isInteger(gameIndex) ? Math.abs(gameIndex) % DIFFICULTIES.length : 0;
        return Object.freeze(Array.from({ length: count }, (_, index) =>
            DIFFICULTIES[(offset + index) % DIFFICULTIES.length]
        ));
    }

    function createSummary(options = {}) {
        const normalized = normalizeOptions(options);
        return {
            requestedGames: normalized.games,
            playerCount: normalized.playerCount,
            completedGames: 0,
            exhaustedGames: 0,
            totalTurns: 0,
            competitors: Object.fromEntries(DIFFICULTIES.map(difficulty => [difficulty, {
                difficulty,
                label: LABELS[difficulty],
                appearances: 0,
                wins: 0,
                totalTurns: 0,
                cards: {},
            }])),
        };
    }

    function countFinalCards(target, cards) {
        const startingCardsRemaining = new Set(STARTING_CARDS);
        for (const card of Array.isArray(cards) ? cards : []) {
            const name = card && typeof card === 'object' ? card.name : card;
            if (!name) continue;
            if (startingCardsRemaining.has(name)) {
                startingCardsRemaining.delete(name);
                continue;
            }
            target[name] = (target[name] || 0) + 1;
        }
    }

    function recordResult(summary, result) {
        if (!summary || !result || !Array.isArray(result.difficulties)) return summary;
        summary.completedGames++;
        const turns = Number.isFinite(result.turns) ? Math.max(0, result.turns) : 0;
        summary.totalTurns += turns;
        if (result.exhausted) summary.exhaustedGames++;
        result.difficulties.forEach((difficulty, seat) => {
            const competitor = summary.competitors[difficulty];
            if (!competitor) return;
            competitor.appearances++;
            competitor.totalTurns += turns;
            if (result.winner === seat) competitor.wins++;
            const state = Array.isArray(result.finalState) ? result.finalState[seat] : null;
            countFinalCards(competitor.cards, state && state.cards);
        });
        return summary;
    }

    function favoriteCard(cards) {
        const entries = Object.entries(cards || {});
        if (entries.length === 0) return Object.freeze({ name: 'データなし', count: 0 });
        entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ja'));
        return Object.freeze({ name: entries[0][0], count: entries[0][1] });
    }

    function projectSummary(summary) {
        const completedGames = summary && summary.completedGames || 0;
        const rankings = DIFFICULTIES.map(difficulty => {
            const source = summary.competitors[difficulty];
            const appearances = source.appearances || 0;
            const winRate = appearances ? Math.round(source.wins * 1000 / appearances) / 10 : 0;
            return {
                difficulty,
                label: source.label,
                appearances,
                wins: source.wins,
                winRate,
                averageTurns: appearances
                    ? Math.round(source.totalTurns * 10 / appearances) / 10
                    : 0,
                favoriteCard: favoriteCard(source.cards),
            };
        }).sort((left, right) =>
            right.winRate - left.winRate || right.wins - left.wins ||
            DIFFICULTIES.indexOf(left.difficulty) - DIFFICULTIES.indexOf(right.difficulty)
        );
        return Object.freeze({
            completedGames,
            requestedGames: summary.requestedGames,
            exhaustedGames: summary.exhaustedGames,
            averageTurns: completedGames
                ? Math.round(summary.totalTurns * 10 / completedGames) / 10
                : 0,
            rankings: Object.freeze(rankings.map(Object.freeze)),
        });
    }

    function createRng(seed) {
        let state = (seed >>> 0) || 1;
        return () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 0x100000000;
        };
    }

    function runGame(options = {}) {
        const difficulties = Array.isArray(options.difficulties)
            ? options.difficulties.slice()
            : lineupForGame(4, 0).slice();
        const game = new GameManager(difficulties.length);
        game.enabledLandmarks = new Set(Player.landmarkNames());
        const shopStock = CPUSimulation.buildShopStock(CARDS, difficulties.length, getInitialCardStock);
        const cpuPlayers = difficulties.map(difficulty => new CPU(difficulty, {
            expertPurpose: 'training',
            playerCount: difficulties.length,
            expertOpponentDifficulties: difficulties.filter(entry => entry !== difficulty),
        }));
        game.players.forEach((player, index) => { player.name = LABELS[difficulties[index]]; });
        const rng = createRng(options.seed);
        const previousRandom = Math.random;
        let safety = 0;
        try {
            Math.random = rng;
            while (!game.checkWinner() && safety < options.maxSteps) {
                const cpu = cpuPlayers[game.currentPlayerIndex];
                const progressed = CPUSimulation.runStep(
                    game, cpu, shopStock, rng, GAME_PHASES, CPUPendingResolution
                );
                safety++;
                if (progressed === false) break;
            }
        } finally {
            Math.random = previousRandom;
        }
        const winner = game.checkWinner();
        return Object.freeze({
            difficulties: Object.freeze(difficulties),
            winner: winner ? game.players.indexOf(winner) : -1,
            turns: game.turnCount,
            exhausted: !winner,
            finalState: Object.freeze(game.players.map(player => Object.freeze({
                cards: Object.freeze(player.cards.map(card => card.name)),
            }))),
        });
    }

    function createController(dependencies = {}) {
        const schedule = dependencies.schedule || (callback => setTimeout(callback, 0));
        const cancelSchedule = dependencies.cancelSchedule || (timer => clearTimeout(timer));
        const simulate = dependencies.runGame || runGame;
        const onUpdate = dependencies.onUpdate || (() => {});
        let active = false;
        let timer = null;
        let summary = null;
        let options = null;

        function snapshot(status, error = '') {
            return Object.freeze({
                status,
                error,
                summary: summary ? projectSummary(summary) : null,
            });
        }

        function finish(status, error = '') {
            active = false;
            timer = null;
            const value = snapshot(status, error);
            onUpdate(value);
            return value;
        }

        function step() {
            if (!active) return;
            try {
                const gameIndex = summary.completedGames;
                const result = simulate({
                    difficulties: lineupForGame(options.playerCount, gameIndex),
                    seed: options.seed + gameIndex,
                    maxSteps: options.maxSteps,
                });
                recordResult(summary, result);
                if (summary.completedGames >= options.games) {
                    finish('complete');
                    return;
                }
                onUpdate(snapshot('running'));
                timer = schedule(step);
            } catch (error) {
                finish('failed', error && error.message ? error.message : String(error));
            }
        }

        function start(input = {}) {
            if (active) return false;
            options = normalizeOptions(input);
            summary = createSummary(options);
            active = true;
            onUpdate(snapshot('running'));
            timer = schedule(step);
            return true;
        }

        function cancel() {
            if (!active) return false;
            active = false;
            if (timer !== null) cancelSchedule(timer);
            finish('cancelled');
            return true;
        }

        return Object.freeze({ start, cancel, isActive: () => active, snapshot: () => snapshot(active ? 'running' : 'idle') });
    }

    return Object.freeze({
        DIFFICULTIES,
        LABELS,
        normalizeOptions,
        lineupForGame,
        createSummary,
        recordResult,
        favoriteCard,
        projectSummary,
        createRng,
        runGame,
        createController,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CpuTournament;
if (typeof window !== 'undefined') window.CpuTournament = CpuTournament;
if (typeof globalThis !== 'undefined') globalThis.CpuTournament = CpuTournament;
