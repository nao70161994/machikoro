const fs = require('fs');

const { parseIntegerOrDefault } = require('./cli-args.js');
const { loadModel, assertRlModelLineupCompatible } = require('./eval-rl-vs-js.js');
const { buildPowerAnalysis, pairedBlockBootstrap } = require('./rl-statistics.js');
const { runSeries, SERIES_SEED_POLICIES } = require('./selfplay.js');

const ROLE_NAMES = Object.freeze({
    candidate: 'rl-candidate',
    baseline: 'rl-baseline',
});

function parseDirectLineups(value) {
    const lineups = String(value || '')
        .split(';')
        .map(part => part.split(',').map(item => item.trim()).filter(Boolean))
        .filter(lineup => lineup.length >= 2 && lineup.length <= 10);
    for (const lineup of lineups) {
        if (lineup.filter(role => role === 'candidate').length !== 1 ||
            lineup.filter(role => role === 'baseline').length !== 1) {
            throw new Error('direct lineup must contain candidate and baseline exactly once');
        }
    }
    return lineups;
}

function parseArgs(argv) {
    const args = {
        candidate: '',
        baseline: '',
        games: 100,
        seed: 1,
        maxSteps: 5000,
        lineups: [['candidate', 'baseline']],
        pairedSeats: true,
        format: 'text',
        output: '',
        progressEvery: 0,
        abortOnExhaustion: false,
        bootstrapIterations: 2000,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--candidate') args.candidate = argv[++i] || '';
        else if (arg === '--baseline') args.baseline = argv[++i] || '';
        else if (arg === '--games') args.games = parseIntegerOrDefault(argv[++i], args.games);
        else if (arg === '--seed') args.seed = parseIntegerOrDefault(argv[++i], args.seed);
        else if (arg === '--max-steps') args.maxSteps = parseIntegerOrDefault(argv[++i], args.maxSteps);
        else if (arg === '--lineups') args.lineups = parseDirectLineups(argv[++i]);
        else if (arg === '--independent-seats') args.pairedSeats = false;
        else if (arg === '--format') args.format = argv[++i] || args.format;
        else if (arg === '--output') args.output = argv[++i] || '';
        else if (arg === '--progress-every') args.progressEvery = parseIntegerOrDefault(argv[++i], 0);
        else if (arg === '--abort-on-exhaustion') args.abortOnExhaustion = true;
        else if (arg === '--bootstrap-iterations') {
            args.bootstrapIterations = parseIntegerOrDefault(argv[++i], args.bootstrapIterations);
        }
    }
    return args;
}

function roleLineup(lineup) {
    return lineup.map(role => ROLE_NAMES[role] || role);
}

function seatSummary(matchLog, role) {
    const games = [];
    const wins = [];
    for (const match of matchLog || []) {
        const seat = Array.isArray(match.lineup) ? match.lineup.indexOf(role) : -1;
        if (seat < 0) continue;
        games[seat] = (games[seat] || 0) + 1;
        if (match.winnerDifficulty === role) wins[seat] = (wins[seat] || 0) + 1;
    }
    const rates = games.map((count, seat) => count > 0 ? (wins[seat] || 0) / count : 0);
    const observed = rates.filter((_, seat) => (games[seat] || 0) > 0);
    return {
        games: games.map(value => value || 0),
        wins: games.map((_, seat) => wins[seat] || 0),
        rates,
        gap: observed.length > 0 ? Math.max(...observed) - Math.min(...observed) : 0,
    };
}

function wilsonInterval(successes, trials, z = 1.959963984540054) {
    if (!Number.isFinite(successes) || !Number.isFinite(trials) || trials <= 0) {
        return { lower: 0, upper: 1, center: 0.5, trials: 0 };
    }
    const n = Math.max(0, Math.floor(trials));
    const wins = Math.min(n, Math.max(0, Math.floor(successes)));
    const rate = wins / n;
    const z2 = z * z;
    const denominator = 1 + z2 / n;
    const center = (rate + z2 / (2 * n)) / denominator;
    const margin = (z / denominator) * Math.sqrt((rate * (1 - rate) + z2 / (4 * n)) / n);
    return {
        lower: Math.max(0, center - margin),
        upper: Math.min(1, center + margin),
        center,
        trials: n,
    };
}

function directAdvantage(candidateWins, baselineWins) {
    const decisive = Math.max(0, candidateWins) + Math.max(0, baselineWins);
    const interval = wilsonInterval(candidateWins, decisive);
    return {
        decisiveGames: decisive,
        candidateShare: decisive > 0 ? candidateWins / decisive : 0,
        confidence95: interval,
        candidateAdvantageSignificant: decisive > 0 && interval.lower > 0.5,
        baselineAdvantageSignificant: decisive > 0 && interval.upper < 0.5,
    };
}

function summarizeResult(lineup, result, options = {}) {
    const candidateWins = result.wins[ROLE_NAMES.candidate] || 0;
    const baselineWins = result.wins[ROLE_NAMES.baseline] || 0;
    const rlWins = candidateWins + baselineWins;
    return {
        lineup: lineup.slice(),
        games: result.games,
        candidateWins,
        baselineWins,
        candidateWinRate: result.games > 0 ? candidateWins / result.games : 0,
        baselineWinRate: result.games > 0 ? baselineWins / result.games : 0,
        winRateDelta: result.games > 0 ? (candidateWins - baselineWins) / result.games : 0,
        candidateShareOfRlWins: rlWins > 0 ? candidateWins / rlWins : 0,
        directAdvantage: directAdvantage(candidateWins, baselineWins),
        pairedBlockBootstrap: pairedBlockBootstrap(
            result.matchLog,
            ROLE_NAMES.candidate,
            ROLE_NAMES.baseline,
            {
                iterations: options.bootstrapIterations,
                seed: options.bootstrapSeed,
            }
        ),
        powerAnalysis: buildPowerAnalysis(candidateWins, baselineWins),
        otherWins: Object.fromEntries(Object.entries(result.wins).filter(([role]) => (
            role !== ROLE_NAMES.candidate && role !== ROLE_NAMES.baseline
        ))),
        averageTurns: result.averageTurns || 0,
        exhausted: result.exhausted || 0,
        candidateSeats: seatSummary(result.matchLog, ROLE_NAMES.candidate),
        baselineSeats: seatSummary(result.matchLog, ROLE_NAMES.baseline),
        candidateBuildStats: result.buildStatsByDifficulty[ROLE_NAMES.candidate] || null,
        baselineBuildStats: result.buildStatsByDifficulty[ROLE_NAMES.baseline] || null,
    };
}

function evaluateHeadToHead(options = {}, runner = runSeries) {
    const candidateModel = options.candidateModel || loadModel(options.candidate);
    const baselineModel = options.baselineModel || loadModel(options.baseline);
    const lineups = options.lineups && options.lineups.length > 0
        ? options.lineups
        : [['candidate', 'baseline']];
    const entries = lineups.map((lineup, index) => {
        const players = roleLineup(lineup);
        assertRlModelLineupCompatible(candidateModel, [players], 'candidate model');
        assertRlModelLineupCompatible(baselineModel, [players], 'baseline model');
        const result = runner({
            games: options.games,
            seed: (options.seed ?? 1) + index * (options.games ?? 0),
            maxSteps: options.maxSteps,
            players,
            rlModelDataByDifficulty: {
                [ROLE_NAMES.candidate]: candidateModel,
                [ROLE_NAMES.baseline]: baselineModel,
            },
            seedPolicy: options.pairedSeats === false
                ? SERIES_SEED_POLICIES.INDEPENDENT
                : SERIES_SEED_POLICIES.PAIRED_SEATS,
            progressEvery: options.progressEvery,
            abortOnExhaustion: options.abortOnExhaustion === true,
            onProgress: typeof options.onProgress === 'function'
                ? progress => options.onProgress({ ...progress, lineup: lineup.slice(), index })
                : null,
        });
        return summarizeResult(lineup, result, {
            bootstrapIterations: options.bootstrapIterations,
            bootstrapSeed: (options.seed ?? 1) + index,
        });
    });
    const totals = {
        games: entries.reduce((sum, entry) => sum + entry.games, 0),
        candidateWins: entries.reduce((sum, entry) => sum + entry.candidateWins, 0),
        baselineWins: entries.reduce((sum, entry) => sum + entry.baselineWins, 0),
        exhausted: entries.reduce((sum, entry) => sum + entry.exhausted, 0),
    };
    totals.directAdvantage = directAdvantage(totals.candidateWins, totals.baselineWins);
    totals.powerAnalysis = buildPowerAnalysis(totals.candidateWins, totals.baselineWins);
    return {
        candidate: options.candidate || 'candidate',
        baseline: options.baseline || 'baseline',
        gamesPerLineup: options.games,
        pairedSeats: options.pairedSeats !== false,
        maxSteps: options.maxSteps,
        entries,
        totals,
    };
}

function renderText(report) {
    const lines = [
        `RL head-to-head candidate=${report.candidate} baseline=${report.baseline} pairedSeats=${report.pairedSeats ? 'yes' : 'no'}`,
    ];
    for (const entry of report.entries) {
        lines.push(
            `- lineup=${entry.lineup.join(',')} games=${entry.games} candidate=${(entry.candidateWinRate * 100).toFixed(1)}% ` +
            `baseline=${(entry.baselineWinRate * 100).toFixed(1)}% delta=${(entry.winRateDelta * 100).toFixed(1)}pt ` +
            `rlShare=${(entry.candidateShareOfRlWins * 100).toFixed(1)}% ` +
            `ci95=${(entry.directAdvantage.confidence95.lower * 100).toFixed(1)}-${(entry.directAdvantage.confidence95.upper * 100).toFixed(1)}% ` +
            `avgTurns=${entry.averageTurns.toFixed(1)} exhausted=${entry.exhausted}`
        );
        if (entry.pairedBlockBootstrap.valid) {
            lines.push(
                `  pairedBootstrap blocks=${entry.pairedBlockBootstrap.blockCount} ` +
                `ci95=${(entry.pairedBlockBootstrap.confidenceInterval.lower * 100).toFixed(1)}-` +
                `${(entry.pairedBlockBootstrap.confidenceInterval.upper * 100).toFixed(1)}% ` +
                `requiredDecisiveGames80=${entry.powerAnalysis.requiredDecisiveGames}`
            );
        }
    }
    return lines.join('\n') + '\n';
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    if (!args.candidate || !args.baseline) throw new Error('--candidate and --baseline are required');
    if (args.progressEvery > 0) {
        args.onProgress = progress => process.stderr.write(
            `[head-to-head ${progress.lineup.join('+')}] ${progress.completed}/${progress.total} exhausted=${progress.exhausted}\n`
        );
    }
    const report = evaluateHeadToHead(args);
    const output = args.format === 'json' ? JSON.stringify(report, null, 2) + '\n' : renderText(report);
    if (args.output) fs.writeFileSync(args.output, output, 'utf8');
    else process.stdout.write(output);
}

module.exports = {
    ROLE_NAMES,
    parseDirectLineups,
    parseArgs,
    roleLineup,
    seatSummary,
    wilsonInterval,
    directAdvantage,
    summarizeResult,
    evaluateHeadToHead,
    renderText,
};
