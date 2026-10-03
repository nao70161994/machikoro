'use strict';

const os = require('os');
const { performance } = require('perf_hooks');
const { loadRuntime, simulateGame } = require('./selfplay');
const GameEngine = require('../js/gameEngine');
const GameEngineClientShadow = require('../js/gameEngineClientShadow');
const GameEngineDeterminism = require('../js/gameEngineDeterminism');
const GameEngineRuntimeAdapter = require('../js/gameEngineRuntimeAdapter');
const GameSnapshot = require('../js/gameSnapshot');
const LocalGameEngineRuntime = require('../js/localGameEngineRuntime');

const DEFAULT_SAMPLES = 160;
const LOG_TYPES = ['dice', 'gain', 'lose', 'build', 'special', 'system', 'error'];

function parseArgs(argv) {
    const result = { samples: DEFAULT_SAMPLES, json: false };
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (argument === '--json') result.json = true;
        else if (argument === '--samples') {
            const value = Number(argv[++index]);
            if (!Number.isInteger(value) || value < 10 || value > 10000) {
                throw new RangeError('--samples must be an integer between 10 and 10000');
            }
            result.samples = value;
        } else throw new Error(`unknown argument: ${argument}`);
    }
    return result;
}

function makeStressLog(game, logEntries) {
    game.log = Array.from({ length: logEntries }, (_, index) => ({
        type: LOG_TYPES[index % LOG_TYPES.length],
        message: `turn-${game.turnCount}-event-${index}: structured stress log entry`,
        ...(index % 3 === 0 ? { gainAmount: (index % 12) + 1 } : {}),
    }));
    game.reviewSummary = {
        complete: true,
        totalsComplete: true,
        counts: Object.fromEntries(LOG_TYPES.map(type => [
            type,
            game.log.filter(entry => entry.type === type).length,
        ])),
        totals: { gain: Math.ceil(logEntries / 3) * 6, lose: 0 },
    };
}

function captureGameplayState(runtime, playerCount, targetTurn, seed = 23) {
    let captured = null;
    const result = simulateGame({
        runtime,
        difficulties: Array(playerCount).fill('weak'),
        seed,
        fast: true,
        lite: true,
        maxSteps: 20000,
        captureBeforeNextTurn({ game, shopStock }) {
            if (game.turnCount < targetTurn || game.checkWinner()) return false;
            captured = { game, shopStock };
            return true;
        },
    });
    if (!captured || result.capturedBeforeNextTurn !== true) {
        throw new Error(`could not capture ${playerCount}-player self-play state at turn ${targetTurn}`);
    }
    return captured;
}

function createRuntime(runtime, scenario, options, metrics) {
    const getGameState = () => ({ game: scenario.game, undoState: null });
    const snapshot = {
        serializeGameState(game, shopStock, metadata) {
            const state = GameSnapshot.serializeGameState(game, shopStock, metadata);
            metrics.sourceSnapshotBytes = Buffer.byteLength(JSON.stringify(state));
            metrics.sourceSnapshotLogEntries = state.log.length;
            return state;
        },
    };
    return LocalGameEngineRuntime.createRuntime({
        actionProposal: { create: (action, data) => ({ action, data }) },
        adapterOptions() {
            return {
                createGame: playerCount => new runtime.GameManager(playerCount),
                enabledLandmarks: scenario.game.enabledLandmarks,
                landmarkNames: runtime.Player.landmarkNames,
                createCardByName: runtime.createCardByName,
                assignShopStockSnapshot: runtime.assignShopStockSnapshot,
                decrementShopStock: () => false,
                pendingActionsFor: runtime.GameManager.serializedPendingActionsFor,
                logLimit: Number.MAX_SAFE_INTEGER,
            };
        },
        assignShopStock: runtime.assignShopStockSnapshot,
        checkpoint() {},
        clientShadow: GameEngineClientShadow,
        determinism: GameEngineDeterminism,
        getEngine: () => GameEngine,
        gameRuntime: { setGame() {}, setUndoState() {} },
        getGameState,
        getOnlineState: () => ({ isOnlineGame: false }),
        isAuthorityEnabled: () => true,
        isShadowEnabled: () => true,
        pendingActionsFor: runtime.GameManager.serializedPendingActionsFor,
        render() {},
        runtimeAdapter: GameEngineRuntimeAdapter,
        scheduleCpu() {},
        sendAction() { return false; },
        shopStock: scenario.shopStock,
        snapshot,
        stationName: '駅',
        transitionLogLimit: () => options.transitionLogLimit,
    });
}

function percentile(sorted, fraction) {
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function productionNextTurnLogLimit(runtime, game) {
    if (!game || game.phase !== runtime.GAME_PHASES.BUILD || game.checkWinner()) {
        return Number.MAX_SAFE_INTEGER;
    }
    const current = Array.isArray(game.players) && Number.isInteger(game.currentPlayerIndex)
        ? game.players[game.currentPlayerIndex]
        : null;
    if (!current || !Array.isArray(current.cards) || typeof current.isDormant !== 'function') {
        return Number.MAX_SAFE_INTEGER;
    }
    const hasActiveItStartup = current.cards.some(card =>
        card && card.effect === runtime.CARD_EFFECTS.ITSTARTUP && !current.isDormant(card)
    );
    return hasActiveItStartup ? Number.MAX_SAFE_INTEGER : 0;
}

function measure(runtime, scenario, transitionLogLimit, samples) {
    const metrics = {};
    const snapshot = createRuntime(runtime, scenario, { transitionLogLimit }, metrics);
    const durations = [];
    const heapDeltas = [];
    let serializedBytes = 0;
    let resultLogEntries = 0;

    for (let index = 0; index < 30; index++) {
        snapshot.prepare('nextTurn', {});
    }
    for (let index = 0; index < samples; index++) {
        if (global.gc) global.gc();
        const heapBefore = process.memoryUsage().heapUsed;
        const start = performance.now();
        const prepared = snapshot.prepare('nextTurn', {});
        if (!prepared || prepared.transition.ok !== true) {
            throw new Error(`benchmark transition failed: ${prepared && prepared.transition.reason}`);
        }
        const adoption = snapshot.adoptPrepared(prepared);
        heapDeltas.push(process.memoryUsage().heapUsed - heapBefore);
        durations.push(performance.now() - start);
        if (!adoption || adoption.authority.authority !== 'pure-transition') {
            throw new Error(`benchmark authority adoption failed: ${adoption && adoption.authority.reason}`);
        }
        if (index === 0) {
            serializedBytes = Buffer.byteLength(JSON.stringify(prepared.transition.snapshot));
            resultLogEntries = prepared.transition.snapshot.log.length;
        }
    }
    if (global.gc) global.gc();
    durations.sort((left, right) => left - right);
    heapDeltas.sort((left, right) => left - right);
    return {
        transitionLogLimit: transitionLogLimit === Number.MAX_SAFE_INTEGER ? 'unbounded' : transitionLogLimit,
        sourceLogEntries: scenario.game.log.length,
        sourceSnapshotLogEntries: metrics.sourceSnapshotLogEntries,
        sourceSnapshotBytes: metrics.sourceSnapshotBytes,
        resultLogEntries,
        resultSnapshotBytes: serializedBytes,
        samples,
        meanMs: Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(4)),
        p50Ms: Number(percentile(durations, 0.5).toFixed(4)),
        p95Ms: Number(percentile(durations, 0.95).toFixed(4)),
        medianPostTransitionHeapDeltaBytes: percentile(heapDeltas, 0.5),
        maxPostTransitionHeapDeltaBytes: Math.max(...heapDeltas),
    };
}

function runBenchmark(options = {}) {
    const runtime = loadRuntime({ includeRL: false });
    const samples = options.samples || DEFAULT_SAMPLES;
    const twoPlayerState = captureGameplayState(runtime, 2, 28, 23);
    const tenPlayerState = captureGameplayState(runtime, 10, 120, 47);
    const stressedTenPlayerState = captureGameplayState(runtime, 10, 120, 47);
    makeStressLog(stressedTenPlayerState.game, 1000);
    const scenarios = [
        { label: '2p-self-play-turn-28', options: { playerCount: 2 }, ...twoPlayerState },
        { label: '10p-self-play-turn-120', options: { playerCount: 10 }, ...tenPlayerState },
        { label: '10p-self-play-turn-120-long-log', options: { playerCount: 10 }, ...stressedTenPlayerState },
    ];
    return {
        benchmark: 'local-game-engine-next-turn-shadow',
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
        cpu: os.cpus()[0] && os.cpus()[0].model || 'unknown',
        gcExposed: typeof global.gc === 'function',
        action: 'nextTurn',
        note: 'States are captured from deterministic real self-play immediately before nextTurn. The long-log case replaces only that actual turn log with a 1000-entry stress log. Measures LocalGameEngineRuntime.prepare plus direct authority adoption with the production 0-log limit and an unbounded-log counterfactual; rendering and CPU scheduling are outside this benchmark.',
        scenarios: scenarios.map(scenario => ({
            label: scenario.label,
            playerCount: scenario.options.playerCount,
            cardsPerPlayer: scenario.game.players.map(player => player.cards.length),
            turnCount: scenario.game.turnCount,
            production: measure(runtime, scenario, productionNextTurnLogLimit(runtime, scenario.game), samples),
            unboundedLogCounterfactual: measure(runtime, scenario, Number.MAX_SAFE_INTEGER, samples),
        })),
    };
}

if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    const result = runBenchmark(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
        console.log(`${result.benchmark} (${result.node}, ${result.platform}; GC exposed: ${result.gcExposed})`);
        for (const scenario of result.scenarios) {
            console.log(`${scenario.label}: ${scenario.playerCount} players, ${scenario.cardsPerPlayer} cards/player, turn ${scenario.turnCount}`);
            for (const [label, measurement] of [
                ['production', scenario.production],
                ['unbounded-log', scenario.unboundedLogCounterfactual],
            ]) {
                console.log(`  ${label}: ${measurement.meanMs}ms mean, p50=${measurement.p50Ms}ms, p95=${measurement.p95Ms}ms, source=${measurement.sourceSnapshotBytes} bytes/${measurement.sourceSnapshotLogEntries} logs, output=${measurement.resultSnapshotBytes} bytes/${measurement.resultLogEntries} logs, post-transition heap delta median/max=${measurement.medianPostTransitionHeapDeltaBytes}/${measurement.maxPostTransitionHeapDeltaBytes} bytes`);
            }
        }
    }
}

module.exports = Object.freeze({ captureGameplayState, makeStressLog, measure, parseArgs, productionNextTurnLogLimit, runBenchmark });
