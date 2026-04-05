const path = require('path');

const { loadRuntime, runSeries } = require(path.join(__dirname, 'selfplay.js'));

function parseArgs(argv) {
    let games = 8;
    let seed = 1;
    let maxSteps = 5000;
    let basePreset = 'default';
    let top = 5;
    let format = 'text';
    let emitPreset = false;
    const players = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--games') games = parseInt(argv[++i] || '8', 10);
        else if (arg === '--seed') seed = parseInt(argv[++i] || '1', 10);
        else if (arg === '--max-steps') maxSteps = parseInt(argv[++i] || '5000', 10);
        else if (arg === '--base-preset') basePreset = argv[++i] || 'default';
        else if (arg === '--top') top = parseInt(argv[++i] || '5', 10);
        else if (arg === '--format') format = argv[++i] || 'text';
        else if (arg === '--emit-preset') emitPreset = true;
        else players.push(arg);
    }

    return {
        games,
        seed,
        maxSteps,
        basePreset,
        top,
        format,
        emitPreset,
        players: players.length > 0 ? players : ['expert', 'strong', 'strong', 'normal'],
    };
}

function buildCandidateTunings(runtime, basePreset = 'default') {
    const base = runtime.CPU._resolveExpertTuning(basePreset);
    const candidates = [
        { name: `${basePreset}:base`, tuning: Object.assign({}, base) },
    ];
    const variations = [
        ['coinWeight', [0.9, 1.1]],
        ['landmarkWeight', [0.9, 1.1]],
        ['lateCoinWeight', [0.9, 1.15]],
        ['lateProgressBonus', [0.85, 1.15]],
        ['skipPenalty', [0.75, 1.25]],
        ['lookaheadWeight', [0.9, 1.1]],
    ];

    for (const [field, multipliers] of variations) {
        for (const multiplier of multipliers) {
            const tuning = Object.assign({}, base);
            const value = base[field];
            if (typeof value !== 'number') continue;
            tuning[field] = Number((value * multiplier).toFixed(3));
            candidates.push({
                name: `${basePreset}:${field}x${multiplier}`,
                tuning,
            });
        }
    }

    candidates.push({
        name: `${basePreset}:landmarkRush`,
        tuning: Object.assign({}, base, {
            landmarkWeight: Number((base.landmarkWeight * 1.12).toFixed(3)),
            lateProgressBonus: Number((base.lateProgressBonus * 1.2).toFixed(3)),
            skipPenalty: Number((base.skipPenalty * 1.2).toFixed(3)),
        }),
    });
    candidates.push({
        name: `${basePreset}:cashTempo`,
        tuning: Object.assign({}, base, {
            coinWeight: Number((base.coinWeight * 1.08).toFixed(3)),
            turnWeight: Number((base.turnWeight * 1.06).toFixed(3)),
            lateCoinWeight: Number((base.lateCoinWeight * 1.12).toFixed(3)),
        }),
    });

    return candidates;
}

function summarizeCandidate(result, candidate) {
    const totalWins = Object.values(result.wins).reduce((sum, value) => sum + value, 0);
    const expertWins = result.wins.expert || 0;
    return {
        name: candidate.name,
        expertPreset: 'custom',
        tuning: candidate.tuning,
        games: result.games,
        expertWins,
        winRate: totalWins > 0 ? expertWins / totalWins : 0,
        averageTurns: result.averageTurns,
        exhausted: result.exhausted,
        seatWins: result.seatWins.slice(),
    };
}

function tuneExpert(options = {}) {
    const runtime = loadRuntime();
    const candidates = buildCandidateTunings(runtime, options.basePreset || 'default');
    const rankings = candidates.map((candidate, index) => {
        const result = runSeries({
            games: options.games,
            seed: (options.seed || 1) + index * (options.games || 1),
            maxSteps: options.maxSteps,
            players: options.players,
            expertPreset: options.basePreset,
            expertTuning: candidate.tuning,
        });
        return summarizeCandidate(result, candidate);
    }).sort((a, b) =>
        b.winRate - a.winRate ||
        a.exhausted - b.exhausted ||
        a.averageTurns - b.averageTurns ||
        a.name.localeCompare(b.name)
    );

    return {
        basePreset: options.basePreset || 'default',
        games: options.games || 8,
        players: (options.players || ['expert', 'strong', 'strong', 'normal']).slice(),
        rankings,
        top: rankings.slice(0, options.top || 5),
    };
}

function formatPresetObject(name, tuning) {
    const entries = Object.entries(tuning)
        .map(([key, value]) => `    ${key}: ${typeof value === 'number' ? value : JSON.stringify(value)},`)
        .join('\n');
    return `${name}: {\n${entries}\n},`;
}

function printTuningResults(result, options = {}) {
    if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    console.log(`basePreset=${result.basePreset} games=${result.games} players=${result.players.join(',')}`);
    for (const entry of result.top) {
        console.log(
            `${entry.name} winRate=${(entry.winRate * 100).toFixed(1)}% expertWins=${entry.expertWins}/${entry.games} averageTurns=${entry.averageTurns.toFixed(1)} exhausted=${entry.exhausted}`
        );
        if (options.emitPreset) {
            const presetName = entry.name.replace(/[^a-zA-Z0-9]+/g, '_');
            console.log(formatPresetObject(presetName, entry.tuning));
        }
    }
}

if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    printTuningResults(tuneExpert(options), options);
}

module.exports = {
    parseArgs,
    buildCandidateTunings,
    formatPresetObject,
    tuneExpert,
};
