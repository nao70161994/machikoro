const fs = require('fs');
const path = require('path');

const { runSeries } = require(path.join(__dirname, 'selfplay.js'));

function parseArgs(argv) {
    let modelPath = path.join(__dirname, '..', 'models', 'rl_model', 'model.browser.json');
    let games = 20;
    let seed = 1;
    let maxSteps = 5000;
    let format = 'text';
    let opponents = ['weak', 'normal', 'strong', 'expert'];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--model') modelPath = argv[++i] || modelPath;
        else if (arg === '--games') games = parseInt(argv[++i] || '20', 10);
        else if (arg === '--seed') seed = parseInt(argv[++i] || '1', 10);
        else if (arg === '--max-steps') maxSteps = parseInt(argv[++i] || '5000', 10);
        else if (arg === '--format') format = argv[++i] || 'text';
        else if (arg === '--opponents') opponents = (argv[++i] || 'weak,normal,strong,expert').split(',').filter(Boolean);
    }

    return { modelPath, games, seed, maxSteps, format, opponents };
}

function loadModel(modelPath) {
    const body = fs.readFileSync(modelPath, 'utf8');
    return JSON.parse(body);
}

function evaluateRlVsJs(options = {}) {
    const modelPath = options.modelPath || path.join(__dirname, '..', 'models', 'rl_model', 'model.browser.json');
    const rlModelData = options.rlModelData || loadModel(modelPath);
    const opponents = (options.opponents || ['weak', 'normal', 'strong', 'expert']).slice();
    return opponents.map((opponent, index) => ({
        opponent,
        modelInfo: {
            stateDim: rlModelData.stateDim,
            hiddenSize: rlModelData.hiddenSize,
            numActions: rlModelData.numActions,
            schemaVersion: rlModelData.schemaVersion,
        },
        result: runSeries({
            games: options.games || 20,
            seed: (options.seed || 1) + index * (options.games || 20),
            maxSteps: options.maxSteps || 5000,
            players: ['rl', opponent],
            rlModelData,
        }),
    }));
}

function summarizeEvaluationEntry(entry) {
    const wins = entry.result.wins || {};
    const games = entry.result.games || 0;
    const rlWins = wins.rl || 0;
    const opponentWins = wins[entry.opponent] || 0;
    const draws = Math.max(0, games - rlWins - opponentWins);
    const matchLog = Array.isArray(entry.result.matchLog) ? entry.result.matchLog : [];
    let rlFirstGames = 0;
    let rlFirstWins = 0;
    let rlSecondGames = 0;
    let rlSecondWins = 0;
    for (const match of matchLog) {
        const lineup = Array.isArray(match.lineup) ? match.lineup : [];
        const rlSeat = lineup.indexOf('rl');
        if (rlSeat === 0) {
            rlFirstGames++;
            if (match.winnerDifficulty === 'rl') rlFirstWins++;
        } else if (rlSeat === 1) {
            rlSecondGames++;
            if (match.winnerDifficulty === 'rl') rlSecondWins++;
        }
    }
    return {
        opponent: entry.opponent,
        games,
        rlWins,
        opponentWins,
        draws,
        rlWinRate: games > 0 ? rlWins / games : 0,
        drawRate: games > 0 ? draws / games : 0,
        averageTurns: entry.result.averageTurns || 0,
        exhausted: entry.result.exhausted || 0,
        rlSeatWinRates: {
            first: rlFirstGames > 0 ? rlFirstWins / rlFirstGames : 0,
            second: rlSecondGames > 0 ? rlSecondWins / rlSecondGames : 0,
        },
        modelInfo: entry.modelInfo || null,
    };
}

function printEvaluation(entries, options = {}) {
    if (options.format === 'json') {
        console.log(JSON.stringify(entries, null, 2));
        return;
    }
    for (const entry of entries) {
        const summary = summarizeEvaluationEntry(entry);
        console.log(
            `rl vs ${summary.opponent}: rl=${summary.rlWins} ${summary.opponent}=${summary.opponentWins} ` +
            `draws=${summary.draws} winRate=${(summary.rlWinRate * 100).toFixed(1)}% ` +
            `seat(first=${(summary.rlSeatWinRates.first * 100).toFixed(1)}%,second=${(summary.rlSeatWinRates.second * 100).toFixed(1)}%) ` +
            `avgTurns=${summary.averageTurns.toFixed(1)} exhausted=${summary.exhausted}`
        );
    }
}

if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    printEvaluation(evaluateRlVsJs(options), options);
}

module.exports = {
    parseArgs,
    loadModel,
    evaluateRlVsJs,
    summarizeEvaluationEntry,
    printEvaluation,
};
