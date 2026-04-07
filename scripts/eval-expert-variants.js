const path = require('path');

const { runSeries } = require(path.join(__dirname, 'selfplay.js'));

function parseArgs(argv) {
    let seedA = 1;
    let seedB = 1001;
    let gamesPerSet = 25;
    let maxSteps = 5000;
    let lite = true;
    let fast = false;
    let variant = null;
    const players = ['expert', 'normal', 'normal', 'normal'];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--seed-a') seedA = parseInt(argv[++i] || '1', 10);
        else if (arg === '--seed-b') seedB = parseInt(argv[++i] || '1001', 10);
        else if (arg === '--games-per-set') gamesPerSet = parseInt(argv[++i] || '25', 10);
        else if (arg === '--max-steps') maxSteps = parseInt(argv[++i] || '5000', 10);
        else if (arg === '--full') lite = false;
        else if (arg === '--fast') {
            lite = false;
            fast = true;
        }
        else if (arg === '--variant') variant = argv[++i] || null;
    }

    return { seedA, seedB, gamesPerSet, maxSteps, lite, fast, players, variant };
}

function evaluateVariant(name, expertBehaviorFlags, options) {
    const common = {
        games: options.gamesPerSet,
        maxSteps: options.maxSteps,
        players: options.players,
        lite: options.lite,
        fast: options.fast,
        expertBehaviorFlags,
    };
    const runA = runSeries(Object.assign({}, common, { seed: options.seedA }));
    const runB = runSeries(Object.assign({}, common, { seed: options.seedB }));
    const wins = (runA.wins.expert || 0) + (runB.wins.expert || 0);
    const games = runA.games + runB.games;
    const exhausted = runA.exhausted + runB.exhausted;
    const averageTurns = ((runA.averageTurns * runA.games) + (runB.averageTurns * runB.games)) / Math.max(games, 1);
    return {
        name,
        expertBehaviorFlags: Object.assign({}, expertBehaviorFlags || {}),
        wins,
        games,
        winRate: games > 0 ? wins / games : 0,
        exhausted,
        averageTurns,
        seatWins: runA.seatWins.map((value, index) => value + runB.seatWins[index]),
        runs: [
            { seed: options.seedA, result: runA },
            { seed: options.seedB, result: runB },
        ],
    };
}

function printResult(entry) {
    console.log(`${entry.name}: ${entry.wins}/${entry.games} (${(entry.winRate * 100).toFixed(1)}%) avgTurns=${entry.averageTurns.toFixed(1)} exhausted=${entry.exhausted} seatWins=${entry.seatWins.join(',')}`);
    if (Object.keys(entry.expertBehaviorFlags || {}).length > 0) {
        console.log(`  flags=${JSON.stringify(entry.expertBehaviorFlags)}`);
    }
}

if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    const variants = [
        ['baseline', {}],
        ['crowdBuildLookahead', { crowdBuildLookahead: true }],
        ['futureLandmarkHold', { futureLandmarkHold: true }],
        ['premiumPurpleGate', { premiumPurpleGate: true }],
        ['endgameBuildFocus', { endgameBuildFocus: true }],
        ['selfRacePriority', { selfRacePriority: true }],
        ['diceCloserDiscipline', { diceCloserDiscipline: true }],
        ['rerollCloserDiscipline', { rerollCloserDiscipline: true }],
        ['tvLandmarkDenial', { tvLandmarkDenial: true }],
        ['lookaheadRaceFocus', { lookaheadRaceFocus: true }],
        ['lookaheadThreatBalance', { lookaheadThreatBalance: true }],
        ['crowdLowDiceEngineBoost', { crowdLowDiceEngineBoost: true }],
        ['crowdRedRestaurantSuppression', { crowdRedRestaurantSuppression: true }],
        ['crowdPurpleShortlistDelay', { crowdPurpleShortlistDelay: true }],
        ['dynamicBuildCandidateLimit', { dynamicBuildCandidateLimit: true }],
        ['crowdWinDistanceFocus', { crowdWinDistanceFocus: true }],
        ['disruptionCandidatePruning', { disruptionCandidatePruning: true }],
        ['crowdNormalLookaheadOpponents', { crowdNormalLookaheadOpponents: true }],
        ['lookaheadLeaderStrongOnly', { lookaheadLeaderStrongOnly: true }],
        ['lookaheadNextSeatStrongOnly', { lookaheadNextSeatStrongOnly: true }],
        ['lookaheadTopTwoStrong', { lookaheadTopTwoStrong: true }],
        ['comboTop3', { crowdBuildLookahead: true, futureLandmarkHold: true, premiumPurpleGate: true }],
    ].filter(([name]) => !options.variant || options.variant === name);
    for (const [name, flags] of variants) {
        printResult(evaluateVariant(name, flags, options));
    }
}

module.exports = {
    parseArgs,
    evaluateVariant,
};
