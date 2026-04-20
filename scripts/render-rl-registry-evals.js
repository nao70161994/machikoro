const fs = require('fs');

function parseArgs(argv) {
    const args = {
        input: '',
        output: '',
        date: new Date().toISOString().slice(0, 10),
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--input') args.input = argv[++i] || '';
        else if (arg === '--output') args.output = argv[++i] || '';
        else if (arg === '--date') args.date = argv[++i] || args.date;
    }
    if (!args.input) throw new Error('--input is required');
    return args;
}

function round(value, digits = 6) {
    if (!Number.isFinite(value)) return value;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}

function parseCheckpointRank(id) {
    const match = String(id || '').match(/-top(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
}

function summaryToOpponentEval(summary) {
    const opponentEval = {
        wins: summary.rlWins,
        losses: summary.opponentWins,
        draws: summary.draws,
        winRate: round(summary.rlWinRate),
        avgTurns: round(summary.averageTurns, 3),
        passRate: summary.rlBuildStats ? round(summary.rlBuildStats.passRate) : null,
    };
    if (summary.rlSeatWinRates) {
        opponentEval.firstSeatWinRate = round(summary.rlSeatWinRates.first);
        opponentEval.secondSeatWinRate = round(summary.rlSeatWinRates.second);
    }
    if (Array.isArray(summary.rlSeatWinRatesByIndex)) {
        opponentEval.seatWinRates = summary.rlSeatWinRatesByIndex.map(value => round(value));
    }
    if (summary.rlBusinessStats) {
        opponentEval.businessTotal = summary.rlBusinessStats.total;
        opponentEval.businessSkipRate = round(summary.rlBusinessStats.skipRate);
    }
    return opponentEval;
}

function resultToRegistryEval(result, date) {
    const summaries = Array.isArray(result.summaries) ? result.summaries : [];
    const evalEntry = {
        date,
        type: 'js',
        gamesPerOpponent: summaries.length > 0 ? summaries[0].games : 0,
        opponents: {},
    };
    const checkpointRank = parseCheckpointRank(result.id);
    if (checkpointRank !== null) evalEntry.checkpointRank = checkpointRank;

    for (const summary of summaries) {
        evalEntry.opponents[summary.opponent] = summaryToOpponentEval(summary);
    }
    return {
        id: result.id,
        path: result.path,
        score: round(result.score),
        eval: evalEntry,
    };
}

function renderRegistryEvals(results, date) {
    if (!Array.isArray(results)) throw new Error('input JSON must be an array');
    return results.map(result => resultToRegistryEval(result, date));
}

function writeOutput(value, output) {
    const text = JSON.stringify(value, null, 2) + '\n';
    if (output) fs.writeFileSync(output, text, 'utf8');
    else process.stdout.write(text);
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const results = JSON.parse(fs.readFileSync(args.input, 'utf8'));
    writeOutput(renderRegistryEvals(results, args.date), args.output);
}

module.exports = {
    parseArgs,
    parseCheckpointRank,
    summaryToOpponentEval,
    resultToRegistryEval,
    renderRegistryEvals,
};
