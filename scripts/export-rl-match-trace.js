const fs = require('fs');
const path = require('path');

const {
    simulateGame,
} = require(path.join(__dirname, 'selfplay.js'));

function parseArgs(argv) {
    let modelPath = path.join(__dirname, '..', 'models', 'rl_model', 'model.browser.json');
    let opponent = 'strong';
    let lineup = [];
    let seed = 1;
    let maxSteps = 5000;
    let rlSeat = 'first';
    let rolls = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--model') modelPath = argv[++i] || modelPath;
        else if (arg === '--opponent') opponent = argv[++i] || opponent;
        else if (arg === '--lineup') lineup = (argv[++i] || '').split(',').map(item => item.trim()).filter(Boolean);
        else if (arg === '--seed') seed = parseInt(argv[++i] || '1', 10);
        else if (arg === '--max-steps') maxSteps = parseInt(argv[++i] || '5000', 10);
        else if (arg === '--rl-seat') rlSeat = argv[++i] || rlSeat;
        else if (arg === '--rolls') rolls = (argv[++i] || '').split(',').filter(Boolean).map(value => parseInt(value, 10)).filter(value => Number.isFinite(value));
    }

    return { modelPath, opponent, lineup, seed, maxSteps, rlSeat, rolls };
}

function loadModel(modelPath) {
    return JSON.parse(fs.readFileSync(modelPath, 'utf8'));
}

function buildPlayers(opponent, rlSeat) {
    return rlSeat === 'second' ? [opponent, 'rl'] : ['rl', opponent];
}

function resolvePlayers(options = {}) {
    if (Array.isArray(options.lineup) && options.lineup.includes('rl') && options.lineup.length >= 2) {
        return options.lineup.slice();
    }
    return buildPlayers(options.opponent || 'strong', options.rlSeat || 'first');
}

function exportJsMatchTrace(options = {}) {
    const rlModelData = options.rlModelData || loadModel(options.modelPath);
    const traceEntries = [];
    const players = resolvePlayers(options);
    const requestedRolls = Array.isArray(options.rolls) ? options.rolls.slice() : [];
    const rollQueue = requestedRolls.slice();
    const result = simulateGame({
        difficulties: players,
        seed: options.seed || 1,
        maxSteps: options.maxSteps || 5000,
        rlModelData,
        traceEntries,
        requestedRolls,
        rollQueue,
        rollCursor: 0,
    });
    return {
        source: 'js',
        opponent: players.length === 2 ? players.find(player => player !== 'rl') : players.join('+'),
        seed: options.seed || 1,
        maxSteps: options.maxSteps || 5000,
        rlSeat: options.rlSeat || 'first',
        rolls: requestedRolls,
        players,
        winnerIndex: result.winner,
        winnerDifficulty: result.winner >= 0 ? players[result.winner] : null,
        turns: result.turns,
        exhausted: result.exhausted,
        trace: traceEntries,
        finalState: result.finalState,
        buildStats: result.buildStats,
        modelInfo: result.rlModel,
    };
}

if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    console.log(JSON.stringify(exportJsMatchTrace(options), null, 2));
}

module.exports = {
    parseArgs,
    loadModel,
    buildPlayers,
    resolvePlayers,
    exportJsMatchTrace,
};
