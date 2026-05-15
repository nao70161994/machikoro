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
const {
    parseIntegerList,
    parseIntegerOrDefault,
    parseList,
} = require('./cli-args.js');
const { loadRegistry } = require('./validate-rl-registry.js');

function parseNumberList(value) {
    return parseIntegerList(value, { min: 1 });
}

function parseArgs(argv) {
    const args = {
        registryPath: path.join(__dirname, '..', 'models', 'rl_model', 'registry.json'),
        models: [],
        runLabels: [],
        rank: 1,
        runRanks: [],
        games: 10,
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
        else if (arg === '--rank') args.rank = parseIntegerOrDefault(argv[++i], args.rank);
        else if (arg === '--run-ranks') args.runRanks = parseNumberList(argv[++i]);
        else if (arg === '--games') args.games = parseIntegerOrDefault(argv[++i], args.games);
        else if (arg === '--seed') args.seed = parseIntegerOrDefault(argv[++i], args.seed);
        else if (arg === '--max-steps') args.maxSteps = parseIntegerOrDefault(argv[++i], args.maxSteps);
        else if (arg === '--lineups') args.lineups = parseLineups(argv[++i]);
        else if (arg === '--format') args.format = argv[++i] || args.format;
        else if (arg === '--output') args.output = argv[++i] || '';
    }
    return args;
}

function rotatePlayers(players, offset) {
    return players.map((_, index) => players[(index + offset) % players.length]);
}

function createPassBreakdown() {
    return {
        buildTotal: 0,
        buildPass: 0,
        buildPassRate: 0,
        buildPassOnlyAction: 0,
        buildPassWithAffordableCard: 0,
        buildPassWithAffordableLandmark: 0,
        buildPassWithAffordableAny: 0,
        affordableCardCountsOnPass: {},
        affordableLandmarkCountsOnPass: {},
        topAffordableCardsOnPass: [],
        topAffordableLandmarksOnPass: [],
    };
}

function addCount(map, key) {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
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

function mergeCountEntries(map, counts) {
    for (const [name, count] of Object.entries(counts || {})) {
        map.set(name, (map.get(name) || 0) + (count || 0));
    }
}

function mergeTopEntries(map, entries) {
    for (const entry of entries || []) {
        if (!entry || !entry.name) continue;
        map.set(entry.name, (map.get(entry.name) || 0) + (entry.count || 0));
    }
}

function summarizeTraceBuildPass(traceEntries) {
    const summary = createPassBreakdown();
    const affordableCards = new Map();
    const affordableLandmarks = new Map();

    for (const entry of traceEntries || []) {
        if (!entry || entry.actorDifficulty !== 'rl') continue;
        if (!entry.before || entry.before.phase !== 'build') continue;
        const legalActions = Array.isArray(entry.legalActions) ? entry.legalActions : [];
        const buildActions = legalActions.filter(action =>
            action && typeof action.label === 'string' &&
            (action.label.startsWith('BUY_CARD:') || action.label.startsWith('BUY_LM:'))
        );
        const isBuildDecision = buildActions.length > 0 ||
            (entry.chosenAction && entry.chosenAction.label === 'PASS' &&
                legalActions.some(action => action && action.label === 'PASS'));
        if (!isBuildDecision) continue;

        summary.buildTotal++;
        if (!entry.chosenAction || entry.chosenAction.label !== 'PASS') continue;

        summary.buildPass++;
        if (buildActions.length === 0) {
            summary.buildPassOnlyAction++;
            continue;
        }

        const cardActions = buildActions.filter(action => action.label.startsWith('BUY_CARD:'));
        const landmarkActions = buildActions.filter(action => action.label.startsWith('BUY_LM:'));
        if (cardActions.length > 0) summary.buildPassWithAffordableCard++;
        if (landmarkActions.length > 0) summary.buildPassWithAffordableLandmark++;
        summary.buildPassWithAffordableAny++;
        for (const action of cardActions) addCount(affordableCards, action.label.slice('BUY_CARD:'.length));
        for (const action of landmarkActions) addCount(affordableLandmarks, action.label.slice('BUY_LM:'.length));
    }

    summary.buildPassRate = summary.buildTotal > 0 ? summary.buildPass / summary.buildTotal : 0;
    summary.affordableCardCountsOnPass = countsObject(affordableCards);
    summary.affordableLandmarkCountsOnPass = countsObject(affordableLandmarks);
    summary.topAffordableCardsOnPass = topEntries(affordableCards);
    summary.topAffordableLandmarksOnPass = topEntries(affordableLandmarks);
    return summary;
}

function mergeBreakdowns(breakdowns) {
    const merged = createPassBreakdown();
    const cards = new Map();
    const landmarks = new Map();
    for (const breakdown of breakdowns) {
        merged.buildTotal += breakdown.buildTotal || 0;
        merged.buildPass += breakdown.buildPass || 0;
        merged.buildPassOnlyAction += breakdown.buildPassOnlyAction || 0;
        merged.buildPassWithAffordableCard += breakdown.buildPassWithAffordableCard || 0;
        merged.buildPassWithAffordableLandmark += breakdown.buildPassWithAffordableLandmark || 0;
        merged.buildPassWithAffordableAny += breakdown.buildPassWithAffordableAny || 0;
        if (breakdown.affordableCardCountsOnPass) mergeCountEntries(cards, breakdown.affordableCardCountsOnPass);
        else mergeTopEntries(cards, breakdown.topAffordableCardsOnPass);
        if (breakdown.affordableLandmarkCountsOnPass) mergeCountEntries(landmarks, breakdown.affordableLandmarkCountsOnPass);
        else mergeTopEntries(landmarks, breakdown.topAffordableLandmarksOnPass);
    }
    merged.buildPassRate = merged.buildTotal > 0 ? merged.buildPass / merged.buildTotal : 0;
    merged.affordableCardCountsOnPass = countsObject(cards);
    merged.affordableLandmarkCountsOnPass = countsObject(landmarks);
    merged.topAffordableCardsOnPass = topEntries(cards);
    merged.topAffordableLandmarksOnPass = topEntries(landmarks);
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
        ];
    assertRlModelLineupCompatible(rlModelData, lineups, spec.id || spec.path);
    const summaries = [];
    const allBreakdowns = [];
    for (let lineupIndex = 0; lineupIndex < lineups.length; lineupIndex++) {
        const lineup = lineups[lineupIndex];
        const breakdowns = [];
        let rlWins = 0;
        let turns = 0;
        let exhausted = 0;
        for (let gameIndex = 0; gameIndex < args.games; gameIndex++) {
            const rotated = rotatePlayers(lineup, gameIndex % lineup.length);
            const traceEntries = [];
            const result = simulateGame({
                runtime,
                difficulties: rotated,
                seed: args.seed + lineupIndex * args.games + gameIndex,
                maxSteps: args.maxSteps,
                rlModelData,
                traceEntries,
                collectMatchLog: false,
                collectBuildStats: false,
                collectBusinessStats: false,
                includeFinalState: false,
            });
            const winnerDifficulty = result.winner >= 0 ? rotated[result.winner] : null;
            if (winnerDifficulty === 'rl') rlWins++;
            turns += result.turns || 0;
            if (result.exhausted) exhausted++;
            breakdowns.push(summarizeTraceBuildPass(traceEntries));
        }
        const passBreakdown = mergeBreakdowns(breakdowns);
        allBreakdowns.push(passBreakdown);
        summaries.push({
            opponent: lineup.join('+'),
            lineup,
            games: args.games,
            winRate: args.games > 0 ? rlWins / args.games : 0,
            averageTurns: args.games > 0 ? turns / args.games : 0,
            exhausted,
            passBreakdown,
        });
    }
    return {
        id: spec.id,
        label: spec.label || spec.id,
        source: spec.source,
        path: spec.path,
        summaries,
        aggregate: mergeBreakdowns(allBreakdowns),
    };
}

function diagnoseSpecs(specs, args) {
    const runtime = loadRuntime({ includeRL: true });
    return specs.map(spec => diagnoseModel(spec, args, runtime));
}

function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function renderText(results) {
    const lines = [];
    for (const result of results) {
        const agg = result.aggregate;
        lines.push(`${result.id}: pass=${formatPercent(agg.buildPassRate)} affordable=${agg.buildPassWithAffordableAny}/${agg.buildPass} only=${agg.buildPassOnlyAction}/${agg.buildPass}`);
        for (const summary of result.summaries) {
            const pass = summary.passBreakdown;
            lines.push(
                `  ${summary.opponent}: win=${formatPercent(summary.winRate)} ` +
                `pass=${formatPercent(pass.buildPassRate)} affordable=${pass.buildPassWithAffordableAny}/${pass.buildPass} ` +
                `card=${pass.buildPassWithAffordableCard} landmark=${pass.buildPassWithAffordableLandmark} only=${pass.buildPassOnlyAction}`
            );
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
    summarizeTraceBuildPass,
    mergeBreakdowns,
    diagnoseModel,
    diagnoseSpecs,
    renderText,
};
