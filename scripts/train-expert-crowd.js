const path = require('path');

const { integerOrDefault, parseIntegerOrDefault } = require(path.join(__dirname, 'cli-args.js'));
const { loadRuntime, runSeries } = require(path.join(__dirname, 'selfplay.js'));
const { profilePlayers } = require(path.join(__dirname, 'tune-expert.js'));

function parseArgs(argv) {
    let games = 4;
    let rounds = 12;
    let candidates = 8;
    let seed = 1;
    let maxSteps = 5000;
    let basePreset = 'default';
    let profile = 'crowdNormal';
    let format = 'text';

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--games') games = parseIntegerOrDefault(argv[++i], 4);
        else if (arg === '--rounds') rounds = parseIntegerOrDefault(argv[++i], 12);
        else if (arg === '--candidates') candidates = parseIntegerOrDefault(argv[++i], 8);
        else if (arg === '--seed') seed = parseIntegerOrDefault(argv[++i], 1);
        else if (arg === '--max-steps') maxSteps = parseIntegerOrDefault(argv[++i], 5000);
        else if (arg === '--base-preset') basePreset = argv[++i] || 'default';
        else if (arg === '--profile') profile = argv[++i] || 'crowdNormal';
        else if (arg === '--format') format = argv[++i] || 'text';
    }

    return { games, rounds, candidates, seed, maxSteps, basePreset, profile, format };
}

function createRng(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function mutateValue(value, rng, min, max, amount = 0.18) {
    const factor = 1 + (rng() * 2 - 1) * amount;
    const next = Number((value * factor).toFixed(3));
    return Math.max(min, Math.min(max, next));
}

function baseProfileTuning(runtime, profile) {
    const defaults = runtime.CPU._defaultExpertProfileTunings();
    if (profile === 'crowdNormal' || profile === 'crowd-normal') {
        return Object.assign({}, defaults.crowd || {});
    }
    return Object.assign({}, defaults[profile] || {});
}

function mutateCrowdTuning(base, rng) {
    const tuning = Object.assign({}, base);
    tuning.stableIncomeWeight = mutateValue(base.stableIncomeWeight || 2.7, rng, 1.2, 4.2, 0.25);
    tuning.redPressureWeight = mutateValue(base.redPressureWeight || 0.4, rng, 0.05, 1.4, 0.35);
    tuning.leaderThreatWeight = mutateValue(base.leaderThreatWeight || 0.35, rng, 0.05, 1.4, 0.35);
    tuning.landmarkActionBonus = mutateValue(base.landmarkActionBonus || 22, rng, 10, 36, 0.22);
    tuning.lateLandmarkActionBonus = mutateValue(base.lateLandmarkActionBonus || 16, rng, 8, 28, 0.22);
    tuning.lookaheadWeight = mutateValue(base.lookaheadWeight || 0.48, rng, 0.15, 0.8, 0.28);
    if (rng() < 0.5) tuning.coinWeight = mutateValue(base.coinWeight || 1.1, rng, 0.8, 1.8, 0.2);
    if (rng() < 0.5) tuning.turnWeight = mutateValue(base.turnWeight || 3.2, rng, 2.2, 4.8, 0.18);
    if (rng() < 0.5) tuning.landmarkReachWeight = mutateValue(base.landmarkReachWeight || 6, rng, 3, 10, 0.2);
    if (rng() < 0.5) tuning.lateCoinWeight = mutateValue(base.lateCoinWeight || 1.6, rng, 0.9, 2.8, 0.22);
    if (rng() < 0.5) tuning.finalCoinWeight = mutateValue(base.finalCoinWeight || 2.2, rng, 1.2, 3.6, 0.22);
    if (rng() < 0.5) tuning.lowValueSpamPenalty = mutateValue(base.lowValueSpamPenalty || 6, rng, 2, 10, 0.28);
    return tuning;
}

function mutateTrioTuning(base, rng) {
    const tuning = Object.assign({}, base);
    tuning.stableIncomeWeight = mutateValue(base.stableIncomeWeight || 2.15, rng, 1.3, 3.3, 0.22);
    tuning.redPressureWeight = mutateValue(base.redPressureWeight || 0.72, rng, 0.3, 1.3, 0.28);
    tuning.leaderThreatWeight = mutateValue(base.leaderThreatWeight || 0.82, rng, 0.3, 1.4, 0.28);
    tuning.landmarkActionBonus = mutateValue(base.landmarkActionBonus || 21, rng, 14, 30, 0.2);
    tuning.lateLandmarkActionBonus = mutateValue(base.lateLandmarkActionBonus || 16, rng, 10, 24, 0.2);
    tuning.lookaheadWeight = mutateValue(base.lookaheadWeight || 0.52, rng, 0.2, 0.75, 0.24);
    if (rng() < 0.5) tuning.coinWeight = mutateValue(base.coinWeight || 1.16, rng, 0.9, 1.6, 0.18);
    if (rng() < 0.5) tuning.turnWeight = mutateValue(base.turnWeight || 3.28, rng, 2.4, 4.4, 0.16);
    if (rng() < 0.5) tuning.lowValueSpamPenalty = mutateValue(base.lowValueSpamPenalty || 5.6, rng, 3, 9, 0.22);
    return tuning;
}

function tuningForProfile(base, profile, rng) {
    if (profile === 'trio') {
        return mutateTrioTuning(base, rng);
    }
    if (profile === 'crowd' || profile === 'crowdNormal' || profile === 'crowd-normal') {
        return mutateCrowdTuning(base, rng);
    }
    return Object.assign({}, base);
}

function evaluateTuning(options) {
    const players = profilePlayers(options.profile);
    const runtime = options.runtime || loadRuntime();
    const profileKey = players.length >= 4 ? 'crowd' : (players.length === 3 ? 'trio' : 'duel');
    const result = runSeries({
        games: options.games,
        seed: options.seed,
        maxSteps: options.maxSteps,
        players,
        lite: true,
        expertPreset: options.basePreset,
        expertProfileTunings: { [profileKey]: options.tuning },
    });
    const wins = result.wins.expert || 0;
    const fitness = wins * 100 - result.averageTurns - result.exhausted * 50;
    return {
        players,
        profileKey,
        wins,
        winRate: result.games > 0 ? wins / result.games : 0,
        averageTurns: result.averageTurns,
        exhausted: result.exhausted,
        fitness,
        tuning: Object.assign({}, options.tuning),
    };
}

function trainExpertCrowd(options = {}) {
    const runtime = loadRuntime();
    const games = integerOrDefault(options.games, 4);
    const rounds = integerOrDefault(options.rounds, 12);
    const candidates = integerOrDefault(options.candidates, 8);
    const seed = integerOrDefault(options.seed, 1);
    const maxSteps = integerOrDefault(options.maxSteps, 5000);
    const rng = createRng(seed);
    let best = evaluateTuning({
        runtime,
        games,
        seed,
        maxSteps,
        basePreset: options.basePreset || 'default',
        profile: options.profile || 'crowdNormal',
        tuning: baseProfileTuning(runtime, options.profile || 'crowdNormal'),
    });
    const history = [Object.assign({ round: 0 }, best)];

    for (let round = 1; round <= rounds; round++) {
        let roundBest = best;
        for (let i = 0; i < candidates; i++) {
            const candidate = evaluateTuning({
                runtime,
                games,
                seed: seed + round * 100 + i * 7,
                maxSteps,
                basePreset: options.basePreset || 'default',
                profile: options.profile || 'crowdNormal',
                tuning: tuningForProfile(best.tuning, options.profile || 'crowdNormal', rng),
            });
            if (
                candidate.fitness > roundBest.fitness ||
                (candidate.fitness === roundBest.fitness && candidate.winRate > roundBest.winRate)
            ) {
                roundBest = candidate;
            }
        }
        best = roundBest;
        history.push(Object.assign({ round }, roundBest));
    }

    return {
        basePreset: options.basePreset || 'default',
        profile: options.profile || 'crowdNormal',
        games,
        rounds,
        candidates,
        players: profilePlayers(options.profile || 'crowdNormal'),
        best,
        history,
    };
}

function printTrainingResult(result, options = {}) {
    if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    console.log(`basePreset=${result.basePreset} profile=${result.profile} games=${result.games} rounds=${result.rounds} candidates=${result.candidates}`);
    console.log(`players=${result.players.join(',')}`);
    console.log(`best winRate=${(result.best.winRate * 100).toFixed(1)}% wins=${result.best.wins}/${result.games} averageTurns=${result.best.averageTurns.toFixed(1)} exhausted=${result.best.exhausted}`);
    console.log(JSON.stringify(result.best.tuning, null, 2));
}

if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    printTrainingResult(trainExpertCrowd(options), options);
}

module.exports = {
    parseArgs,
    integerOrDefault,
    parseIntegerOrDefault,
    baseProfileTuning,
    mutateCrowdTuning,
    mutateTrioTuning,
    evaluateTuning,
    trainExpertCrowd,
};
