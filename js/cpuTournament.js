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
    const HISTORY_KEY = 'cpuTournamentHistoryV1';
    const HISTORY_SCHEMA = 1;
    const MAX_HISTORY = 10;

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
            seed: normalized.seed,
            games: [],
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
        summary.games.push({
            index: summary.completedGames - 1,
            seed: Number.isSafeInteger(result.seed) ? result.seed : summary.seed + summary.completedGames - 1,
            difficulties: result.difficulties.slice(),
            winner: result.winner,
            turns,
            exhausted: result.exhausted === true,
            finalState: Array.isArray(result.finalState) ? result.finalState.map(state => ({
                coins: Number.isFinite(state.coins) ? state.coins : 0,
                cards: Array.isArray(state.cards) ? state.cards.slice() : [],
                landmarks: Array.isArray(state.landmarks) ? state.landmarks.slice() : [],
            })) : [],
        });
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
            schemaVersion: HISTORY_SCHEMA,
            createdAt: Number.isSafeInteger(summary.createdAt) ? summary.createdAt : 0,
            seed: summary.seed,
            playerCount: summary.playerCount,
            completedGames,
            requestedGames: summary.requestedGames,
            exhaustedGames: summary.exhaustedGames,
            averageTurns: completedGames
                ? Math.round(summary.totalTurns * 10 / completedGames) / 10
                : 0,
            rankings: Object.freeze(rankings.map(Object.freeze)),
            games: Object.freeze((summary.games || []).map(game => Object.freeze({
                index: game.index,
                seed: game.seed,
                difficulties: Object.freeze(game.difficulties.slice()),
                winner: game.winner,
                turns: game.turns,
                exhausted: game.exhausted,
                finalState: Object.freeze(game.finalState.map(state => Object.freeze({
                    coins: state.coins,
                    cards: Object.freeze(state.cards.slice()),
                    landmarks: Object.freeze(state.landmarks.slice()),
                }))),
            }))),
        });
    }

    function analyzeTournament(view) {
        const games = view && Array.isArray(view.games) ? view.games : [];
        const seats = Array.from({ length: view && view.playerCount || 0 }, (_, seat) => {
            const appearances = games.filter(game => game.difficulties[seat]).length;
            const wins = games.filter(game => game.winner === seat).length;
            return Object.freeze({ seat: seat + 1, appearances, wins,
                winRate: appearances ? Math.round(wins * 1000 / appearances) / 10 : 0 });
        });
        const fastest = games.filter(game => !game.exhausted)
            .sort((left, right) => left.turns - right.turns || left.index - right.index)[0] || null;
        const longest = games.filter(game => !game.exhausted)
            .sort((left, right) => right.turns - left.turns || left.index - right.index)[0] || null;
        const leader = view && view.rankings && view.rankings[0] || null;
        return Object.freeze({
            leader: leader ? Object.freeze({ label: leader.label, winRate: leader.winRate }) : null,
            fastest: fastest ? Object.freeze({ index: fastest.index, turns: fastest.turns }) : null,
            longest: longest ? Object.freeze({ index: longest.index, turns: longest.turns }) : null,
            seats: Object.freeze(seats),
        });
    }

    function historyRecord(view, createdAt = Date.now()) {
        return Object.assign({}, view, {
            schemaVersion: HISTORY_SCHEMA,
            createdAt: Number.isSafeInteger(createdAt) && createdAt >= 0 ? createdAt : 0,
        });
    }

    function validHistoryRecord(record) {
        return !!record && record.schemaVersion === HISTORY_SCHEMA &&
            Number.isSafeInteger(record.createdAt) && record.createdAt >= 0 &&
            [2, 3, 4].includes(record.playerCount) &&
            Number.isSafeInteger(record.seed) && record.seed > 0 &&
            Array.isArray(record.games) && record.games.length <= 50 &&
            Array.isArray(record.rankings);
    }

    function createHistoryRepository(options = {}) {
        const storage = options.storage;
        const key = options.key || HISTORY_KEY;
        function load() {
            if (!storage || typeof storage.get !== 'function') return [];
            try {
                const parsed = JSON.parse(storage.get(key, '[]') || '[]');
                return Array.isArray(parsed) ? parsed.filter(validHistoryRecord).slice(0, MAX_HISTORY) : [];
            } catch (_) {
                return [];
            }
        }
        function save(records) {
            return !!storage && typeof storage.set === 'function' &&
                storage.set(key, JSON.stringify(records.slice(0, MAX_HISTORY)));
        }
        function add(view, createdAt) {
            const record = historyRecord(view, createdAt);
            const records = [record, ...load()].slice(0, MAX_HISTORY);
            return save(records) ? record : null;
        }
        function clear() { return save([]); }
        return Object.freeze({ load, add, clear });
    }

    function exportJson(records) {
        return JSON.stringify({ schemaVersion: HISTORY_SCHEMA, exportedAt: new Date().toISOString(), records }, null, 2);
    }

    function csvCell(value) {
        const text = String(value == null ? '' : value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function exportCsv(records) {
        const rows = [['大会日時', '人数', '試合数', 'CPU', '勝数', '出場', '勝率', '平均ターン', '得意カード']];
        for (const record of records || []) {
            for (const rank of record.rankings || []) rows.push([
                new Date(record.createdAt).toISOString(), record.playerCount, record.completedGames,
                rank.label, rank.wins, rank.appearances, rank.winRate, rank.averageTurns,
                rank.favoriteCard && rank.favoriteCard.name || '',
            ]);
        }
        return rows.map(row => row.map(csvCell).join(',')).join('\n');
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
        const trace = [];
        const capture = () => {
            if (options.captureTrace !== true) return;
            trace.push(Object.freeze({
                step: safety,
                turn: game.turnCount,
                phase: game.phase,
                playerIndex: game.currentPlayerIndex,
                difficulty: difficulties[game.currentPlayerIndex],
                dice: Object.freeze([game.lastDice1 || 0, game.lastDice2 || 0]),
                players: Object.freeze(game.players.map(player => Object.freeze({
                    coins: player.coins,
                    cards: player.cards.length,
                    landmarks: Object.values(player.landmarks).filter(Boolean).length,
                }))),
            }));
        };
        try {
            Math.random = rng;
            capture();
            while (!game.checkWinner() && safety < options.maxSteps) {
                const cpu = cpuPlayers[game.currentPlayerIndex];
                const progressed = CPUSimulation.runStep(
                    game, cpu, shopStock, rng, GAME_PHASES, CPUPendingResolution
                );
                safety++;
                capture();
                if (progressed === false) break;
            }
        } finally {
            Math.random = previousRandom;
        }
        const winner = game.checkWinner();
        return Object.freeze({
            seed: options.seed,
            difficulties: Object.freeze(difficulties),
            winner: winner ? game.players.indexOf(winner) : -1,
            turns: game.turnCount,
            exhausted: !winner,
            finalState: Object.freeze(game.players.map(player => Object.freeze({
                coins: player.coins,
                cards: Object.freeze(player.cards.map(card => card.name)),
                landmarks: Object.freeze(Object.entries(player.landmarks)
                    .filter(([, built]) => built).map(([name]) => name)),
            }))),
            trace: Object.freeze(trace),
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
        analyzeTournament,
        historyRecord,
        validHistoryRecord,
        createHistoryRepository,
        exportJson,
        exportCsv,
        createRng,
        runGame,
        createController,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CpuTournament;
if (typeof window !== 'undefined') window.CpuTournament = CpuTournament;
if (typeof globalThis !== 'undefined') globalThis.CpuTournament = CpuTournament;
