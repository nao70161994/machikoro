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
    let lineups = [];
    let sharedSeeds = false;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--model') modelPath = argv[++i] || modelPath;
        else if (arg === '--games') games = parseInt(argv[++i] || '20', 10);
        else if (arg === '--seed') seed = parseInt(argv[++i] || '1', 10);
        else if (arg === '--max-steps') maxSteps = parseInt(argv[++i] || '5000', 10);
        else if (arg === '--format') format = argv[++i] || 'text';
        else if (arg === '--shared-seeds' || arg === '--same-seed') sharedSeeds = true;
        else if (arg === '--opponents') opponents = (argv[++i] || 'weak,normal,strong,expert').split(',').filter(Boolean);
        else if (arg === '--lineups') {
            lineups = (argv[++i] || '')
                .split(';')
                .map(part => part.split(',').map(item => item.trim()).filter(Boolean))
                .filter(lineup => lineup.includes('rl') && lineup.length >= 2);
        }
    }

    return { modelPath, games, seed, maxSteps, format, opponents, lineups, sharedSeeds };
}

function loadModel(modelPath) {
    const body = fs.readFileSync(modelPath, 'utf8');
    return JSON.parse(body);
}

function maxLineupPlayers(lineups) {
    return (lineups || []).reduce((max, lineup) => Math.max(max, Array.isArray(lineup) ? lineup.length : 0), 0);
}

function assertRlModelLineupCompatible(rlModelData, lineups, label = 'RL model') {
    const maxPlayers = maxLineupPlayers(lineups);
    if (maxPlayers >= 3 && rlModelData && rlModelData.stateDim === 145) {
        throw new Error(`${label} is a 2-player RL model (stateDim=145) and cannot be used for ${maxPlayers}-player lineups`);
    }
}

function evaluateRlVsJs(options = {}) {
    const modelPath = options.modelPath || path.join(__dirname, '..', 'models', 'rl_model', 'model.browser.json');
    const rlModelData = options.rlModelData || loadModel(modelPath);
    const lineups = Array.isArray(options.lineups) && options.lineups.length > 0
        ? options.lineups.map(lineup => lineup.slice())
        : (options.opponents || ['weak', 'normal', 'strong', 'expert']).map(opponent => ['rl', opponent]);
    assertRlModelLineupCompatible(rlModelData, lineups, modelPath);
    const games = options.games || 20;
    const baseSeed = options.seed || 1;
    return lineups.map((lineup, index) => ({
        opponent: lineup.length === 2 ? lineup.find(player => player !== 'rl') : lineup.join('+'),
        lineup,
        modelInfo: {
            stateDim: rlModelData.stateDim,
            hiddenSize: rlModelData.hiddenSize,
            numActions: rlModelData.numActions,
            schemaVersion: rlModelData.schemaVersion,
        },
        result: runSeries({
            games,
            seed: options.sharedSeeds ? baseSeed : baseSeed + index * games,
            maxSteps: options.maxSteps || 5000,
            players: lineup,
            rlModelData,
        }),
    }));
}

function nonRlWins(entry) {
    const wins = entry.result.wins || {};
    const players = entry.lineup || entry.result.players || ['rl', entry.opponent];
    const nonRlPlayers = new Set(players.filter(player => player !== 'rl'));
    let total = 0;
    for (const player of nonRlPlayers) {
        total += wins[player] || 0;
    }
    return total;
}

function summarizeEvaluationEntry(entry) {
    const wins = entry.result.wins || {};
    const games = entry.result.games || 0;
    const rlWins = wins.rl || 0;
    const opponentWins = nonRlWins(entry);
    const draws = Math.max(0, games - rlWins - opponentWins);
    const matchLog = Array.isArray(entry.result.matchLog) ? entry.result.matchLog : [];
    let rlFirstGames = 0;
    let rlFirstWins = 0;
    let rlSecondGames = 0;
    let rlSecondWins = 0;
    const seatGames = [];
    const seatWins = [];
    for (const match of matchLog) {
        const lineup = Array.isArray(match.lineup) ? match.lineup : [];
        const rlSeat = lineup.indexOf('rl');
        if (rlSeat >= 0) {
            seatGames[rlSeat] = (seatGames[rlSeat] || 0) + 1;
            if (match.winnerDifficulty === 'rl') seatWins[rlSeat] = (seatWins[rlSeat] || 0) + 1;
        }
        if (rlSeat === 0) {
            rlFirstGames++;
            if (match.winnerDifficulty === 'rl') rlFirstWins++;
        } else if (rlSeat === 1) {
            rlSecondGames++;
            if (match.winnerDifficulty === 'rl') rlSecondWins++;
        }
    }
    const buildStats = Array.isArray(entry.result.buildStats) ? entry.result.buildStats : [];
    const rlBuildStats = buildStats.length > 0 ? buildStats[0] : null;
    const businessStats = entry.result.businessStats || {};
    const rlBusinessStats = businessStats.rl || null;
    const topCards = rlBuildStats
        ? Object.entries(rlBuildStats.cards || {})
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }))
        : [];
    const topLandmarks = rlBuildStats
        ? Object.entries(rlBuildStats.landmarks || {})
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }))
        : [];
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
        rlSeatWinRatesByIndex: seatGames.map((games, index) => games > 0 ? (seatWins[index] || 0) / games : 0),
        rlBuildStats: rlBuildStats ? {
            total: rlBuildStats.total || 0,
            pass: rlBuildStats.pass || 0,
            passRate: (rlBuildStats.total || 0) > 0 ? (rlBuildStats.pass || 0) / rlBuildStats.total : 0,
            topCards,
            topLandmarks,
        } : null,
        rlBusinessStats: rlBusinessStats ? {
            total: rlBusinessStats.total || 0,
            skipped: rlBusinessStats.skipped || 0,
            skipRate: (rlBusinessStats.total || 0) > 0 ? (rlBusinessStats.skipped || 0) / rlBusinessStats.total : 0,
            targets: Object.assign({}, rlBusinessStats.targets),
            topGiveCards: Object.entries(rlBusinessStats.giveCards || {})
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
                .slice(0, 5)
                .map(([name, count]) => ({ name, count })),
            topTakeCards: Object.entries(rlBusinessStats.takeCards || {})
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
                .slice(0, 5)
                .map(([name, count]) => ({ name, count })),
            topExchanges: Object.entries(rlBusinessStats.exchanges || {})
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
                .slice(0, 5)
                .map(([name, count]) => ({ name, count })),
        } : null,
        modelInfo: entry.modelInfo || null,
        lineup: entry.lineup || entry.result.players || null,
    };
}

function printEvaluation(entries, options = {}) {
    if (options.format === 'json') {
        console.log(JSON.stringify(entries, null, 2));
        return;
    }
    for (const entry of entries) {
        const summary = summarizeEvaluationEntry(entry);
        const lineup = summary.lineup || [];
        const seatText = lineup.length > 2
            ? `seat(${summary.rlSeatWinRatesByIndex.map((rate, index) => `${index}=${(rate * 100).toFixed(1)}%`).join(',')})`
            : `seat(first=${(summary.rlSeatWinRates.first * 100).toFixed(1)}%,second=${(summary.rlSeatWinRates.second * 100).toFixed(1)}%)`;
        console.log(
            `rl vs ${summary.opponent}: rl=${summary.rlWins} ${summary.opponent}=${summary.opponentWins} ` +
            `draws=${summary.draws} winRate=${(summary.rlWinRate * 100).toFixed(1)}% ` +
            `players=${lineup.length || 2} ` +
            `${seatText} ` +
            `avgTurns=${summary.averageTurns.toFixed(1)} exhausted=${summary.exhausted}`
        );
        if (summary.rlBuildStats) {
            const topCards = summary.rlBuildStats.topCards.map(entry => `${entry.name}x${entry.count}`).join(', ') || 'none';
            const topLandmarks = summary.rlBuildStats.topLandmarks.map(entry => `${entry.name}x${entry.count}`).join(', ') || 'none';
            console.log(
                `  rl-build: total=${summary.rlBuildStats.total} pass=${summary.rlBuildStats.pass}` +
                `(${(summary.rlBuildStats.passRate * 100).toFixed(1)}%) cards=[${topCards}] landmarks=[${topLandmarks}]`
            );
        }
        if (summary.rlBusinessStats && summary.rlBusinessStats.total > 0) {
            const give = summary.rlBusinessStats.topGiveCards.map(entry => `${entry.name}x${entry.count}`).join(', ') || 'none';
            const take = summary.rlBusinessStats.topTakeCards.map(entry => `${entry.name}x${entry.count}`).join(', ') || 'none';
            const exchanges = summary.rlBusinessStats.topExchanges.map(entry => `${entry.name}x${entry.count}`).join(', ') || 'none';
            const targets = Object.entries(summary.rlBusinessStats.targets)
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .map(([name, count]) => `${name}x${count}`)
                .join(', ') || 'none';
            console.log(
                `  rl-business: total=${summary.rlBusinessStats.total} skipped=${summary.rlBusinessStats.skipped}` +
                `(${(summary.rlBusinessStats.skipRate * 100).toFixed(1)}%) targets=[${targets}] ` +
                `give=[${give}] take=[${take}] exchanges=[${exchanges}]`
            );
        }
    }
}

if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    printEvaluation(evaluateRlVsJs(options), options);
}

module.exports = {
    parseArgs,
    loadModel,
    assertRlModelLineupCompatible,
    evaluateRlVsJs,
    summarizeEvaluationEntry,
    printEvaluation,
};
