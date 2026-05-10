const fs = require('fs');
const path = require('path');

const {
    loadRuntime,
    simulateGame,
} = require('./selfplay.js');
const {
    parseLineups,
    resolveModelSpecs,
} = require('./eval-rl-models.js');
const {
    assertRlModelLineupCompatible,
    loadModel,
} = require('./eval-rl-vs-js.js');
const { loadRegistry } = require('./validate-rl-registry.js');

function parseList(value) {
    return String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function parseNumberList(value) {
    return parseList(value)
        .map(item => parseInt(item, 10))
        .filter(value => Number.isInteger(value) && value >= 1);
}

function parseArgs(argv) {
    const args = {
        registryPath: path.join(__dirname, '..', 'models', 'rl_model', 'registry.json'),
        models: [],
        runLabels: [],
        rank: 1,
        runRanks: [],
        games: 20,
        seed: 1,
        maxSteps: 5000,
        lineups: [],
        format: 'text',
        output: '',
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--registry') args.registryPath = argv[++i] || args.registryPath;
        else if (arg === '--models') args.models = parseList(argv[++i]);
        else if (arg === '--run-labels') args.runLabels = parseList(argv[++i]);
        else if (arg === '--rank') args.rank = parseInt(argv[++i] || String(args.rank), 10);
        else if (arg === '--run-ranks') args.runRanks = parseNumberList(argv[++i]);
        else if (arg === '--games') args.games = parseInt(argv[++i] || String(args.games), 10);
        else if (arg === '--seed') args.seed = parseInt(argv[++i] || String(args.seed), 10);
        else if (arg === '--max-steps') args.maxSteps = parseInt(argv[++i] || String(args.maxSteps), 10);
        else if (arg === '--lineups') args.lineups = parseLineups(argv[++i]);
        else if (arg === '--format') args.format = argv[++i] || args.format;
        else if (arg === '--output') args.output = argv[++i] || '';
    }
    return args;
}

function rotatePlayers(players, offset) {
    return players.map((_, index) => players[(index + offset) % players.length]);
}

function addCount(map, key, amount = 1) {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + amount);
}

function topEntries(map) {
    return [...map.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
}

function countsObject(map) {
    return Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ja')));
}

function mergeCounts(map, counts) {
    for (const [name, count] of Object.entries(counts || {})) {
        addCount(map, name, count || 0);
    }
}

function createRaceSummary() {
    return {
        games: 0,
        rlWins: 0,
        rlWinRate: 0,
        losses: 0,
        averageTurns: 0,
        averageLossTurns: 0,
        averageLossLandmarkGap: 0,
        exhausted: 0,
        lossesWithRlRemainingOne: 0,
        lossesWithRlRemainingTwo: 0,
        lossGapCounts: {},
        rlMissingLandmarkCountsOnLoss: {},
        winnerBuiltLandmarkCountsOnLoss: {},
        topRlMissingLandmarksOnLoss: [],
        topWinnerBuiltLandmarksOnLoss: [],
    };
}

function summarizeLandmarkRaceMatches(matches) {
    const summary = createRaceSummary();
    const lossGapCounts = new Map();
    const missingLandmarks = new Map();
    const winnerBuiltLandmarks = new Map();
    let totalTurns = 0;
    let totalLossTurns = 0;
    let totalLossGap = 0;

    for (const match of matches || []) {
        if (!match || !Array.isArray(match.lineup)) continue;
        const rlIndex = match.lineup.indexOf('rl');
        if (rlIndex < 0) continue;
        summary.games++;
        totalTurns += match.turns || 0;
        if (match.exhausted) summary.exhausted++;
        if (match.winnerIndex === rlIndex) {
            summary.rlWins++;
            continue;
        }
        if (match.winnerIndex == null || match.winnerIndex < 0) continue;
        if (!Array.isArray(match.finalState)) continue;
        const rlState = match.finalState[rlIndex];
        const winnerState = match.finalState[match.winnerIndex];
        if (!rlState || !winnerState) continue;

        const rlBuilt = rlState.builtLandmarkCount || 0;
        const winnerBuilt = winnerState.builtLandmarkCount || 0;
        const gap = Math.max(0, winnerBuilt - rlBuilt);
        const remaining = Array.isArray(rlState.missingLandmarks) ? rlState.missingLandmarks.length : 0;

        summary.losses++;
        totalLossTurns += match.turns || 0;
        totalLossGap += gap;
        addCount(lossGapCounts, String(gap));
        if (remaining === 1) summary.lossesWithRlRemainingOne++;
        if (remaining === 2) summary.lossesWithRlRemainingTwo++;
        for (const name of rlState.missingLandmarks || []) addCount(missingLandmarks, name);
        for (const name of winnerState.builtLandmarks || []) addCount(winnerBuiltLandmarks, name);
    }

    summary.rlWinRate = summary.games > 0 ? summary.rlWins / summary.games : 0;
    summary.averageTurns = summary.games > 0 ? totalTurns / summary.games : 0;
    summary.averageLossTurns = summary.losses > 0 ? totalLossTurns / summary.losses : 0;
    summary.averageLossLandmarkGap = summary.losses > 0 ? totalLossGap / summary.losses : 0;
    summary.lossGapCounts = countsObject(lossGapCounts);
    summary.rlMissingLandmarkCountsOnLoss = countsObject(missingLandmarks);
    summary.winnerBuiltLandmarkCountsOnLoss = countsObject(winnerBuiltLandmarks);
    summary.topRlMissingLandmarksOnLoss = topEntries(missingLandmarks);
    summary.topWinnerBuiltLandmarksOnLoss = topEntries(winnerBuiltLandmarks);
    return summary;
}

function mergeLandmarkRaceSummaries(summaries) {
    const merged = createRaceSummary();
    const lossGapCounts = new Map();
    const missingLandmarks = new Map();
    const winnerBuiltLandmarks = new Map();
    let totalTurns = 0;
    let totalLossTurns = 0;
    let totalLossGap = 0;

    for (const summary of summaries || []) {
        if (!summary) continue;
        merged.games += summary.games || 0;
        merged.rlWins += summary.rlWins || 0;
        merged.losses += summary.losses || 0;
        merged.exhausted += summary.exhausted || 0;
        merged.lossesWithRlRemainingOne += summary.lossesWithRlRemainingOne || 0;
        merged.lossesWithRlRemainingTwo += summary.lossesWithRlRemainingTwo || 0;
        totalTurns += (summary.averageTurns || 0) * (summary.games || 0);
        totalLossTurns += (summary.averageLossTurns || 0) * (summary.losses || 0);
        totalLossGap += (summary.averageLossLandmarkGap || 0) * (summary.losses || 0);
        mergeCounts(lossGapCounts, summary.lossGapCounts);
        mergeCounts(missingLandmarks, summary.rlMissingLandmarkCountsOnLoss);
        mergeCounts(winnerBuiltLandmarks, summary.winnerBuiltLandmarkCountsOnLoss);
    }

    merged.rlWinRate = merged.games > 0 ? merged.rlWins / merged.games : 0;
    merged.averageTurns = merged.games > 0 ? totalTurns / merged.games : 0;
    merged.averageLossTurns = merged.losses > 0 ? totalLossTurns / merged.losses : 0;
    merged.averageLossLandmarkGap = merged.losses > 0 ? totalLossGap / merged.losses : 0;
    merged.lossGapCounts = countsObject(lossGapCounts);
    merged.rlMissingLandmarkCountsOnLoss = countsObject(missingLandmarks);
    merged.winnerBuiltLandmarkCountsOnLoss = countsObject(winnerBuiltLandmarks);
    merged.topRlMissingLandmarksOnLoss = topEntries(missingLandmarks);
    merged.topWinnerBuiltLandmarksOnLoss = topEntries(winnerBuiltLandmarks);
    return merged;
}

function diagnoseModel(spec, args, runtime) {
    const rlModelData = loadModel(spec.path);
    const lineups = args.lineups.length > 0
        ? args.lineups
        : [
            ['rl', 'weak', 'normal', 'strong'],
            ['rl', 'normal', 'normal', 'strong'],
            ['rl', 'weak', 'weak', 'normal'],
            ['rl', 'strong', 'strong', 'strong'],
        ];
    assertRlModelLineupCompatible(rlModelData, lineups, spec.id || spec.path);
    const activeRuntime = runtime || loadRuntime({ includeRL: true });
    const summaries = [];
    for (let lineupIndex = 0; lineupIndex < lineups.length; lineupIndex++) {
        const lineup = lineups[lineupIndex];
        const matches = [];
        for (let gameIndex = 0; gameIndex < args.games; gameIndex++) {
            const rotated = rotatePlayers(lineup, gameIndex % lineup.length);
            const result = simulateGame({
                runtime: activeRuntime,
                difficulties: rotated,
                seed: args.seed + lineupIndex * args.games + gameIndex,
                maxSteps: args.maxSteps,
                rlModelData,
                collectMatchLog: false,
                collectBuildStats: false,
                collectBusinessStats: false,
                includeFinalState: true,
            });
            matches.push({
                lineup: rotated,
                winnerIndex: result.winner,
                winnerDifficulty: result.winner >= 0 ? rotated[result.winner] : null,
                turns: result.turns,
                exhausted: result.exhausted,
                finalState: result.finalState,
            });
        }
        summaries.push({
            opponent: lineup.join('+'),
            lineup,
            raceSummary: summarizeLandmarkRaceMatches(matches),
        });
    }
    return {
        id: spec.id,
        label: spec.label || spec.id,
        source: spec.source,
        path: spec.path,
        summaries,
        aggregate: mergeLandmarkRaceSummaries(summaries.map(summary => summary.raceSummary)),
    };
}

function diagnoseSpecs(specs, args) {
    const runtime = loadRuntime({ includeRL: true });
    return specs.map(spec => diagnoseModel(spec, args, runtime));
}

function formatPercent(value) {
    return `${((value || 0) * 100).toFixed(1)}%`;
}

function formatTop(entries) {
    if (!entries || entries.length === 0) return 'none';
    return entries.map(entry => `${entry.name}:${entry.count}`).join(',');
}

function renderText(results) {
    const lines = [];
    for (const result of results || []) {
        const agg = result.aggregate || createRaceSummary();
        lines.push(`${result.id}: win=${formatPercent(agg.rlWinRate)} losses=${agg.losses}/${agg.games} avgTurns=${agg.averageTurns.toFixed(1)} exhausted=${agg.exhausted} avgLossGap=${agg.averageLossLandmarkGap.toFixed(2)} rem1=${agg.lossesWithRlRemainingOne} rem2=${agg.lossesWithRlRemainingTwo} missing=${formatTop(agg.topRlMissingLandmarksOnLoss)}`);
        for (const summary of result.summaries || []) {
            const race = summary.raceSummary || createRaceSummary();
            lines.push(`  ${summary.opponent}: win=${formatPercent(race.rlWinRate)} losses=${race.losses}/${race.games} avgTurns=${race.averageTurns.toFixed(1)} exhausted=${race.exhausted} avgLossGap=${race.averageLossLandmarkGap.toFixed(2)} rem1=${race.lossesWithRlRemainingOne} rem2=${race.lossesWithRlRemainingTwo} missing=${formatTop(race.topRlMissingLandmarksOnLoss)}`);
        }
    }
    return lines.join('\n');
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const registry = loadRegistry(args.registryPath);
    const specs = resolveModelSpecs(args, registry);
    const results = diagnoseSpecs(specs, args);
    if (args.output) fs.writeFileSync(args.output, JSON.stringify(results, null, 2), 'utf8');
    if (args.format === 'json') console.log(JSON.stringify(results, null, 2));
    else console.log(renderText(results));
}

if (require.main === module) {
    main();
}

module.exports = {
    parseArgs,
    summarizeLandmarkRaceMatches,
    mergeLandmarkRaceSummaries,
    diagnoseModel,
    diagnoseSpecs,
    renderText,
};
