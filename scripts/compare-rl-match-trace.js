const path = require('path');
const { spawnSync } = require('child_process');

const { parseIntegerOrDefault } = require(path.join(__dirname, 'cli-args.js'));
const {
    exportJsMatchTrace,
} = require(path.join(__dirname, 'export-rl-match-trace.js'));

function parseArgs(argv) {
    let pythonModel = '';
    let jsModel = '';
    let opponent = 'strong';
    let lineup = [];
    let seed = 1;
    let maxSteps = 200;
    let rlSeat = 'first';
    let rolls = [];
    let cpuOpponentImpl = '';

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--python-model') pythonModel = argv[++i] || pythonModel;
        else if (arg === '--js-model') jsModel = argv[++i] || jsModel;
        else if (arg === '--opponent') opponent = argv[++i] || opponent;
        else if (arg === '--lineup') lineup = (argv[++i] || '').split(',').map(item => item.trim()).filter(Boolean);
        else if (arg === '--seed') seed = parseIntegerOrDefault(argv[++i], 1);
        else if (arg === '--max-steps') maxSteps = parseIntegerOrDefault(argv[++i], 200);
        else if (arg === '--rl-seat') rlSeat = argv[++i] || rlSeat;
        else if (arg === '--rolls') rolls = (argv[++i] || '').split(',').filter(Boolean).map(value => parseInt(value, 10)).filter(value => Number.isFinite(value));
        else if (arg === '--cpu-opponent-impl') cpuOpponentImpl = argv[++i] || cpuOpponentImpl;
        else if (arg === '--js-cpu-oracle') cpuOpponentImpl = 'js-oracle';
    }

    return { pythonModel, jsModel, opponent, lineup, seed, maxSteps, rlSeat, rolls, cpuOpponentImpl };
}

function buildDeterministicRolls(seed, maxSteps) {
    const rolls = [];
    let state = (seed >>> 0) || 1;
    const total = Math.max(32, maxSteps * 4);
    for (let i = 0; i < total; i++) {
        state = (state * 1664525 + 1013904223) >>> 0;
        rolls.push((state % 6) + 1);
    }
    return rolls;
}

function runPythonTrace(options) {
    const args = [
        '-m', 'scripts.rl.export_match_trace',
        '--model', options.pythonModel,
        '--opponent', options.opponent,
        '--seed', String(options.seed),
        '--max-steps', String(options.maxSteps),
        '--rl-seat', options.rlSeat,
    ];
    if (options.lineup && options.lineup.length > 0) {
        args.push('--lineup', options.lineup.join(','));
    }
    if (options.rolls && options.rolls.length > 0) {
        args.push('--rolls', options.rolls.join(','));
    }
    const env = Object.assign({}, process.env);
    if (options.cpuOpponentImpl === 'js-oracle') env.MACHIKORO_RL_JS_CPU_ORACLE = '1';
    const result = spawnSync('python3', args, {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        env,
        maxBuffer: 32 * 1024 * 1024,
    });
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || 'python trace export failed');
    }
    return JSON.parse(result.stdout);
}

function normalizePlayer(player) {
    return {
        coins: player.coins,
        itVentureCoins: player.itVentureCoins || 0,
        landmarks: Object.fromEntries(Object.entries(player.landmarks || {}).sort(([a], [b]) => a.localeCompare(b, 'ja'))),
        cards: Object.fromEntries(Object.entries(player.cards || {}).sort(([a], [b]) => a.localeCompare(b, 'ja'))),
        dormant: Object.fromEntries(Object.entries(player.dormant || player.dormantCards || {}).sort(([a], [b]) => a.localeCompare(b, 'ja'))),
    };
}

function normalizePendingActions(state) {
    const actionsByField = {
        pendingTV: 'resolveTV',
        pendingBusiness: 'resolveBusiness',
        pendingCleaning: 'resolveCleaning',
        pendingMover: 'resolveMover',
        pendingRenovation: 'resolveRenovation',
    };
    const entries = Array.isArray(state.pendingActions)
        ? state.pendingActions
        : (Array.isArray(state.pending_action_queue)
            ? state.pending_action_queue.map(field => ({ field }))
            : []);
    return entries
        .filter(entry => entry && typeof entry === 'object' && actionsByField[entry.field])
        .map(entry => ({
            field: entry.field,
            action: entry.action || actionsByField[entry.field],
        }));
}

function normalizeState(state) {
    const shopStock = state.shopStock || {};
    return {
        current: state.current != null ? state.current : state.currentPlayerIndex,
        phase: state.phase,
        turnCount: state.turnCount,
        lastDice: state.lastDice != null ? state.lastDice : state.lastDiceResult,
        lastDice1: state.lastDice1 || 0,
        lastDice2: state.lastDice2 || 0,
        pendingTV: state.pendingTV || 0,
        pendingBusiness: state.pendingBusiness || 0,
        pendingCleaning: state.pendingCleaning || 0,
        pendingMover: state.pendingMover || 0,
        pendingRenovation: state.pendingRenovation || 0,
        pendingActions: normalizePendingActions(state),
        pendingIT: !!state.pendingIT,
        usedReroll: !!state.usedReroll,
        shopStock: Object.fromEntries(Object.entries(shopStock).sort(([a], [b]) => a.localeCompare(b, 'ja'))),
        players: (state.players || []).map(normalizePlayer),
    };
}

function normalizeTraceEntry(entry) {
    const legalActions = (entry.legalActions || []).map(action => ({ action: action.action, label: action.label }));
    legalActions.sort((a, b) => a.action - b.action || a.label.localeCompare(b.label, 'ja'));
    return {
        actorIndex: entry.actorIndex,
        actorDifficulty: entry.actorDifficulty,
        before: normalizeState(entry.before),
        chosenAction: entry.chosenAction ? {
            action: Number.isInteger(entry.chosenAction.action) ? entry.chosenAction.action : null,
            label: Number.isInteger(entry.chosenAction.action) ? '' : entry.chosenAction.label,
            targetIndex: Number.isInteger(entry.chosenAction.targetIndex) ? entry.chosenAction.targetIndex : null,
        } : null,
        rollCursor: Number.isFinite(entry.rollCursor) ? entry.rollCursor : 0,
        rollsUsed: Array.isArray(entry.rollsUsed) ? entry.rollsUsed.slice() : [],
        legalActions,
        after: normalizeState(entry.after),
    };
}

function compareTraceEntries(pythonTrace, jsTrace) {
    const length = Math.max(pythonTrace.trace.length, jsTrace.trace.length);
    for (let i = 0; i < length; i++) {
        const pyEntry = pythonTrace.trace[i];
        const jsEntry = jsTrace.trace[i];
        if (!pyEntry || !jsEntry) {
            return {
                index: i,
                reason: 'trace length mismatch',
                python: pyEntry || null,
                js: jsEntry || null,
            };
        }
        const normalizedPy = normalizeTraceEntry(pyEntry);
        const normalizedJs = normalizeTraceEntry(jsEntry);
        if (JSON.stringify(normalizedPy) !== JSON.stringify(normalizedJs)) {
            return {
                index: i,
                reason: 'trace entry mismatch',
                python: normalizedPy,
                js: normalizedJs,
            };
        }
    }
    return null;
}

function compareMatchTrace(options) {
    const resolvedOptions = Object.assign({}, options, {
        rolls: Array.isArray(options.rolls) && options.rolls.length > 0
            ? options.rolls
            : buildDeterministicRolls(options.seed, options.maxSteps),
    });
    const pythonTrace = runPythonTrace(resolvedOptions);
    const jsTrace = exportJsMatchTrace({
        modelPath: resolvedOptions.jsModel,
        opponent: resolvedOptions.opponent,
        lineup: resolvedOptions.lineup,
        seed: resolvedOptions.seed,
        maxSteps: resolvedOptions.maxSteps,
        rlSeat: resolvedOptions.rlSeat,
        rolls: resolvedOptions.rolls,
    });
    return {
        pythonTrace,
        jsTrace,
        mismatch: compareTraceEntries(pythonTrace, jsTrace),
    };
}

function printComparison(result) {
    if (!result.mismatch) {
        console.log(`trace matched: steps=${result.pythonTrace.trace.length}`);
        return 0;
    }
    console.log(`trace mismatch at step ${result.mismatch.index}: ${result.mismatch.reason}`);
    console.log(JSON.stringify(result.mismatch, null, 2));
    return 1;
}

if (require.main === module) {
    const exitCode = printComparison(compareMatchTrace(parseArgs(process.argv.slice(2))));
    if (exitCode) process.exitCode = exitCode;
}

module.exports = {
    parseArgs,
    buildDeterministicRolls,
    normalizePendingActions,
    normalizeState,
    normalizeTraceEntry,
    compareTraceEntries,
    compareMatchTrace,
    printComparison,
};
