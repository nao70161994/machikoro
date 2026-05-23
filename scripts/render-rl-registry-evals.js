const fs = require('fs');

function parseArgs(argv) {
    const args = {
        input: '',
        output: '',
        registry: '',
        updateRegistry: false,
        date: new Date().toISOString().slice(0, 10),
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--input') args.input = argv[++i] || '';
        else if (arg === '--output') args.output = argv[++i] || '';
        else if (arg === '--registry') args.registry = argv[++i] || '';
        else if (arg === '--update-registry') args.updateRegistry = true;
        else if (arg === '--date') args.date = argv[++i] || args.date;
    }
    if (!args.input) throw new Error('--input is required');
    if (args.updateRegistry && !args.registry) throw new Error('--registry is required with --update-registry');
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
    const hasLineupEval = summaries.some(summary => (
        (Array.isArray(summary.lineup) && summary.lineup.length > 2) ||
        (typeof summary.opponent === 'string' && summary.opponent.includes('+'))
    ));
    if (hasLineupEval) {
        throw new Error('render-rl-registry-evals は2人用 eval-rl-models JSON のみ対応しています。多人数lineup評価は registry に手動で js-lineup / js-lineup-3p として整理してください。');
    }
    const evalEntry = {
        date,
        type: 'js',
        gamesPerOpponent: summaries.length > 0 ? summaries[0].games : 0,
        opponents: {},
    };
    if (result.evaluationConfig && typeof result.evaluationConfig === 'object') {
        evalEntry.evaluationConfig = result.evaluationConfig;
    }
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

function sameOpponentKeys(a, b) {
    const aKeys = Object.keys(a || {}).sort();
    const bKeys = Object.keys(b || {}).sort();
    return aKeys.length === bKeys.length && aKeys.every((key, index) => key === bKeys[index]);
}

function stableConfigValue(value) {
    if (Array.isArray(value)) return value.map(stableConfigValue);
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((acc, key) => {
            acc[key] = stableConfigValue(value[key]);
            return acc;
        }, {});
    }
    return value;
}

function sameEvaluationConfig(a, b) {
    return JSON.stringify(stableConfigValue(a || null)) === JSON.stringify(stableConfigValue(b || null));
}

function isSameEval(a, b) {
    return a
        && b
        && a.date === b.date
        && a.type === b.type
        && a.gamesPerOpponent === b.gamesPerOpponent
        && (a.checkpointRank || null) === (b.checkpointRank || null)
        && sameEvaluationConfig(a.evaluationConfig, b.evaluationConfig)
        && sameOpponentKeys(a.opponents, b.opponents);
}

function evalMetricsKey(evalEntry) {
    return JSON.stringify(stableConfigValue({
        opponents: evalEntry && evalEntry.opponents || {},
        aggregate: evalEntry && evalEntry.aggregate || null,
        winRate: evalEntry && evalEntry.winRate || null,
    }));
}

function hasConflictingEvalMetrics(existing, incoming) {
    return isSameEval(existing, incoming) && evalMetricsKey(existing) !== evalMetricsKey(incoming);
}

function mergeRegistryEvals(registry, renderedEvals) {
    const models = Array.isArray(registry.models) ? registry.models : [];
    const byId = new Map(models.map(model => [model.id, model]));
    const stats = {
        appended: 0,
        skippedDuplicates: 0,
        updatedScores: 0,
    };

    for (const rendered of renderedEvals) {
        const model = byId.get(rendered.id);
        if (!model) throw new Error(`registry に model id がありません: ${rendered.id}`);
        if (!Array.isArray(model.evals)) model.evals = [];
        const duplicate = model.evals.find(existing => isSameEval(existing, rendered.eval));
        if (duplicate) {
            if (hasConflictingEvalMetrics(duplicate, rendered.eval)) {
                throw new Error(`registry eval conflict: ${rendered.id} ${rendered.eval.date || 'no-date'} ${rendered.eval.type || 'unknown'}`);
            }
            stats.skippedDuplicates += 1;
            continue;
        }
        model.evals.push(rendered.eval);
        stats.appended += 1;
        if (Number.isFinite(rendered.score)) {
            model.lastEvalScore = rendered.score;
            stats.updatedScores += 1;
        }
    }

    return { registry, stats };
}

function writeOutput(value, output) {
    const text = JSON.stringify(value, null, 2) + '\n';
    if (output) fs.writeFileSync(output, text, 'utf8');
    else process.stdout.write(text);
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const results = JSON.parse(fs.readFileSync(args.input, 'utf8'));
    const rendered = renderRegistryEvals(results, args.date);
    if (args.updateRegistry) {
        const registry = JSON.parse(fs.readFileSync(args.registry, 'utf8'));
        const { registry: updatedRegistry, stats } = mergeRegistryEvals(registry, rendered);
        writeOutput(updatedRegistry, args.registry);
        if (args.output) writeOutput({ stats, entries: rendered }, args.output);
        else process.stderr.write(`registry更新: appended=${stats.appended} skipped=${stats.skippedDuplicates}\n`);
    } else {
        writeOutput(rendered, args.output);
    }
}

module.exports = {
    parseArgs,
    parseCheckpointRank,
    summaryToOpponentEval,
    resultToRegistryEval,
    renderRegistryEvals,
    isSameEval,
    hasConflictingEvalMetrics,
    mergeRegistryEvals,
};
