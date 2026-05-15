const path = require('path');

const { parseFloatOrDefault, parseIntegerOrDefault } = require(path.join(__dirname, 'cli-args.js'));
const { loadRuntime, runSeries } = require(path.join(__dirname, 'selfplay.js'));
const { buildCandidateTunings } = require(path.join(__dirname, 'tune-expert.js'));

const DEFAULT_PROFILES = ['duel', 'trio', 'crowd', 'allStrong4'];

function parseArgs(argv) {
    let games = 50;
    let seed = 1;
    let maxSteps = 5000;
    let format = 'text';
    let lite = true;
    let fast = false;
    let expertPreset = 'v2simple';
    let tuningCandidate = '';
    let profiles = DEFAULT_PROFILES.slice();
    let buildMode = 'ev';
    let diceMode = 'strongCrowdThreshold';
    let rerollMode = 'simple';
    let rerollMargin = 0;
    let itMode = 'always';
    let tvMode = 'simple';
    let businessMode = 'harmfulGift';
    let cleaningMode = 'simple';
    let harborMode = 'simple';
    let harborMargin = 0;
    let moverMode = 'simple';
    let renovationMode = 'simple';
    let incomeCapMode = 'none';
    let comboMode = 'core';
    let comboWeight = 0.35;
    let buildTempoWeight = 0.05;
    let rollRiskMode = 'none';
    let rollRedRiskWeight = 0;
    let airportSkipMode = 'whenNoLandmark';
    let landmarkCardMargin = 25;
    let landmarkCardCompareMode = 'base';
    let landmarkCardCompareTargets = 'harborMall';
    let landmarkCardPenaltyMode = 'none';
    let harborLandmarkBaseBonus = 2.5;
    let landmarkProgressRemaining = 3;
    let landmarkCostWeight = 0.12;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--games') games = parseIntegerOrDefault(argv[++i], 50);
        else if (arg === '--seed') seed = parseIntegerOrDefault(argv[++i], 1);
        else if (arg === '--max-steps') maxSteps = parseIntegerOrDefault(argv[++i], 5000);
        else if (arg === '--format') format = argv[++i] || 'text';
        else if (arg === '--full') lite = false;
        else if (arg === '--fast') {
            lite = false;
            fast = true;
        }
        else if (arg === '--expert-preset') expertPreset = argv[++i] || 'v2simple';
        else if (arg === '--tuning-candidate') tuningCandidate = argv[++i] || '';
        else if (arg === '--build-mode') buildMode = argv[++i] || 'ev';
        else if (arg === '--dice-mode') diceMode = argv[++i] || 'strongCrowdThreshold';
        else if (arg === '--reroll-mode') rerollMode = argv[++i] || 'simple';
        else if (arg === '--reroll-margin') rerollMargin = parseFloatOrDefault(argv[++i], 0);
        else if (arg === '--it-mode') itMode = argv[++i] || 'always';
        else if (arg === '--tv-mode') tvMode = argv[++i] || 'simple';
        else if (arg === '--business-mode') businessMode = argv[++i] || 'harmfulGift';
        else if (arg === '--cleaning-mode') cleaningMode = argv[++i] || 'simple';
        else if (arg === '--harbor-mode') harborMode = argv[++i] || 'simple';
        else if (arg === '--harbor-margin') harborMargin = parseFloatOrDefault(argv[++i], 0);
        else if (arg === '--mover-mode') moverMode = argv[++i] || 'simple';
        else if (arg === '--renovation-mode') renovationMode = argv[++i] || 'simple';
        else if (arg === '--income-cap-mode') incomeCapMode = argv[++i] || 'none';
        else if (arg === '--combo-mode') comboMode = argv[++i] || 'core';
        else if (arg === '--combo-weight') comboWeight = parseFloatOrDefault(argv[++i], 0.35);
        else if (arg === '--build-tempo-weight') buildTempoWeight = parseFloatOrDefault(argv[++i], 0.05);
        else if (arg === '--roll-risk-mode') rollRiskMode = argv[++i] || 'none';
        else if (arg === '--roll-red-risk-weight') rollRedRiskWeight = parseFloatOrDefault(argv[++i], 0);
        else if (arg === '--airport-skip-mode') airportSkipMode = argv[++i] || 'whenNoLandmark';
        else if (arg === '--landmark-card-margin') landmarkCardMargin = parseFloatOrDefault(argv[++i], 25);
        else if (arg === '--landmark-card-compare-mode') landmarkCardCompareMode = argv[++i] || 'base';
        else if (arg === '--landmark-card-compare-targets') landmarkCardCompareTargets = argv[++i] || 'harborMall';
        else if (arg === '--landmark-card-penalty-mode') landmarkCardPenaltyMode = argv[++i] || 'none';
        else if (arg === '--harbor-landmark-base-bonus') harborLandmarkBaseBonus = parseFloatOrDefault(argv[++i], 2.5);
        else if (arg === '--landmark-progress-remaining') landmarkProgressRemaining = parseFloatOrDefault(argv[++i], 3);
        else if (arg === '--landmark-cost-weight') landmarkCostWeight = parseFloatOrDefault(argv[++i], 0.12);
        else if (arg === '--profiles') {
            profiles = (argv[++i] || DEFAULT_PROFILES.join(',')).split(',').map(v => v.trim()).filter(Boolean);
        }
    }

    return {
        games,
        seed,
        maxSteps,
        format,
        lite,
        fast,
        expertPreset,
        tuningCandidate,
        profiles,
        buildMode,
        diceMode,
        rerollMode,
        rerollMargin,
        itMode,
        tvMode,
        businessMode,
        cleaningMode,
        harborMode,
        harborMargin,
        moverMode,
        renovationMode,
        incomeCapMode,
        comboMode,
        comboWeight,
        buildTempoWeight,
        rollRiskMode,
        rollRedRiskWeight,
        airportSkipMode,
        landmarkCardMargin,
        landmarkCardCompareMode,
        landmarkCardCompareTargets,
        landmarkCardPenaltyMode,
        harborLandmarkBaseBonus,
        landmarkProgressRemaining,
        landmarkCostWeight,
    };
}

function resolveExpertTuning(options = {}) {
    if (!options.tuningCandidate) return null;
    const runtime = loadRuntime();
    const candidates = buildCandidateTunings(runtime, options.expertPreset || 'default');
    const matched = candidates.find(candidate => candidate.name === options.tuningCandidate);
    if (!matched) {
        throw new Error(`unknown tuning candidate: ${options.tuningCandidate}`);
    }
    return matched.tuning;
}

function profilePlayers(name) {
    if (name === 'duel') return ['expert', 'strong'];
    if (name === 'trio') return ['expert', 'strong', 'strong'];
    if (name === 'crowd') return ['expert', 'strong', 'strong', 'normal'];
    if (name === 'allStrong4') return ['expert', 'strong', 'strong', 'strong'];
    throw new Error(`unknown profile: ${name}`);
}

function profileWeight(name) {
    if (name === 'duel') return 1;
    if (name === 'trio') return 2;
    if (name === 'crowd') return 3;
    if (name === 'allStrong4') return 4;
    return 1;
}

function evaluateProfile(name, options) {
    const players = profilePlayers(name);
    const expertTuning = options.expertTuning || resolveExpertTuning(options);
    const result = runSeries({
        runtime: options.runtime,
        games: options.games,
        seed: options.seed,
        maxSteps: options.maxSteps,
        players,
        includeRL: false,
        lightweightCpuOnly: true,
        collectMatchLog: false,
        collectBuildStats: false,
        collectBusinessStats: false,
        includeFinalState: false,
        lite: options.lite,
        fast: options.fast,
        expertPreset: options.expertPreset,
        expertTuning,
        expertPurpose: 'live',
        expertBuildMode: options.buildMode || 'ev',
        expertDiceMode: options.diceMode || 'strongCrowdThreshold',
        expertRerollMode: options.rerollMode || 'simple',
        expertRerollMargin: Number.isFinite(options.rerollMargin) ? options.rerollMargin : 0,
        expertInvestMode: options.itMode || 'always',
        expertTvMode: options.tvMode || 'simple',
        expertBusinessMode: options.businessMode || 'harmfulGift',
        expertCleaningMode: options.cleaningMode || 'simple',
        expertHarborMode: options.harborMode || 'simple',
        expertHarborMargin: Number.isFinite(options.harborMargin) ? options.harborMargin : 0,
        expertMoverMode: options.moverMode || 'simple',
        expertRenovationMode: options.renovationMode || 'simple',
        expertIncomeCapMode: options.incomeCapMode || 'none',
        expertComboMode: options.comboMode || 'core',
        expertComboWeight: Number.isFinite(options.comboWeight) ? options.comboWeight : 0.35,
        expertBuildTempoWeight: Number.isFinite(options.buildTempoWeight) ? options.buildTempoWeight : 0.05,
        expertRollRiskMode: options.rollRiskMode || 'none',
        expertRollRedRiskWeight: Number.isFinite(options.rollRedRiskWeight) ? options.rollRedRiskWeight : 0,
        expertAirportSkipMode: options.airportSkipMode || 'whenNoLandmark',
        expertLandmarkCardMargin: Number.isFinite(options.landmarkCardMargin) ? options.landmarkCardMargin : 25,
        expertLandmarkCardCompareMode: options.landmarkCardCompareMode || 'base',
        expertLandmarkCardCompareTargets: options.landmarkCardCompareTargets || 'harborMall',
        expertLandmarkCardPenaltyMode: options.landmarkCardPenaltyMode || 'none',
        expertHarborLandmarkBaseBonus: Number.isFinite(options.harborLandmarkBaseBonus) ? options.harborLandmarkBaseBonus : 2.5,
        expertLandmarkProgressRemaining: Number.isFinite(options.landmarkProgressRemaining) ? options.landmarkProgressRemaining : 3,
        expertLandmarkCostWeight: Number.isFinite(options.landmarkCostWeight) ? options.landmarkCostWeight : 0.12,
        expertTraceStats: options.expertTraceStats || null,
    });
    const expertWins = result.wins.expert || 0;
    const winRate = result.games > 0 ? expertWins / result.games : 0;
    return {
        profile: name,
        players,
        weight: profileWeight(name),
        games: result.games,
        expertWins,
        winRate,
        averageTurns: result.averageTurns,
        exhausted: result.exhausted,
        seatWins: result.seatWins.slice(),
        raw: result,
    };
}

function summarize(entries) {
    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
    const weightedWinRate = totalWeight > 0
        ? entries.reduce((sum, entry) => sum + entry.winRate * entry.weight, 0) / totalWeight
        : 0;
    const minWinRate = entries.reduce((min, entry) => Math.min(min, entry.winRate), 1);
    return {
        weightedWinRate,
        minWinRate,
        profiles: entries.length,
    };
}

function toText(entries, summary, options) {
    const lines = [
        `games=${options.games} seed=${options.seed} mode=${options.lite ? 'lite' : (options.fast ? 'fast' : 'full')} expertPreset=${options.expertPreset}` +
        ` buildMode=${options.buildMode} diceMode=${options.diceMode} rerollMode=${options.rerollMode} rerollMargin=${Number.isFinite(options.rerollMargin) ? options.rerollMargin : 0} itMode=${options.itMode} tvMode=${options.tvMode}` +
        ` businessMode=${options.businessMode} cleaningMode=${options.cleaningMode} harborMode=${options.harborMode} harborMargin=${Number.isFinite(options.harborMargin) ? options.harborMargin : 0} moverMode=${options.moverMode} renovationMode=${options.renovationMode} incomeCapMode=${options.incomeCapMode} comboMode=${options.comboMode} comboWeight=${options.comboWeight} buildTempoWeight=${options.buildTempoWeight} rollRiskMode=${options.rollRiskMode} rollRedRiskWeight=${options.rollRedRiskWeight} airportSkipMode=${options.airportSkipMode}` +
        `${options.tuningCandidate ? ` tuningCandidate=${options.tuningCandidate}` : ''}`,
        `weightedWinRate=${(summary.weightedWinRate * 100).toFixed(1)}% minWinRate=${(summary.minWinRate * 100).toFixed(1)}%`,
    ];
    for (const entry of entries) {
        lines.push(
            `${entry.profile}: ${entry.expertWins}/${entry.games} (${(entry.winRate * 100).toFixed(1)}%) ` +
            `avgTurns=${entry.averageTurns.toFixed(1)} exhausted=${entry.exhausted} ` +
            `seatWins=${entry.seatWins.join(',')} players=${entry.players.join(',')}`
        );
    }
    return lines.join('\n');
}

function toMarkdown(entries, summary, options) {
    const lines = [
        '# Expert vs Strong',
        '',
        `- games: ${options.games}`,
        `- seed: ${options.seed}`,
        `- mode: ${options.lite ? 'lite' : (options.fast ? 'fast' : 'full')}`,
        `- expertPreset: ${options.expertPreset}`,
        `- buildMode: ${options.buildMode}`,
        `- diceMode: ${options.diceMode}`,
        `- rerollMode: ${options.rerollMode}`,
        `- rerollMargin: ${Number.isFinite(options.rerollMargin) ? options.rerollMargin : 0}`,
        `- itMode: ${options.itMode}`,
        `- tvMode: ${options.tvMode}`,
        `- businessMode: ${options.businessMode}`,
        `- cleaningMode: ${options.cleaningMode}`,
        `- harborMode: ${options.harborMode}`,
        `- harborMargin: ${Number.isFinite(options.harborMargin) ? options.harborMargin : 0}`,
        `- moverMode: ${options.moverMode}`,
        `- renovationMode: ${options.renovationMode}`,
        `- incomeCapMode: ${options.incomeCapMode}`,
        `- comboMode: ${options.comboMode}`,
        `- comboWeight: ${options.comboWeight}`,
        `- buildTempoWeight: ${options.buildTempoWeight}`,
        `- rollRiskMode: ${options.rollRiskMode}`,
        `- rollRedRiskWeight: ${options.rollRedRiskWeight}`,
        `- airportSkipMode: ${options.airportSkipMode}`,
        `- tuningCandidate: ${options.tuningCandidate || 'none'}`,
        `- weightedWinRate: ${(summary.weightedWinRate * 100).toFixed(1)}%`,
        `- minWinRate: ${(summary.minWinRate * 100).toFixed(1)}%`,
        '',
        '| profile | players | weight | winRate | seatWins | avgTurns | exhausted |',
        '| --- | --- | ---: | ---: | --- | ---: | ---: |',
    ];
    for (const entry of entries) {
        lines.push(
            `| ${entry.profile} | ${entry.players.join(',')} | ${entry.weight} | ${(entry.winRate * 100).toFixed(1)}% | ${entry.seatWins.join(',')} | ${entry.averageTurns.toFixed(1)} | ${entry.exhausted} |`
        );
    }
    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const runtime = loadRuntime({ includeRL: false });
    const runtimeOptions = Object.assign({}, options, { runtime });
    const entries = options.profiles.map(profile => evaluateProfile(profile, runtimeOptions));
    const summary = summarize(entries);
    if (options.format === 'json') {
        console.log(JSON.stringify({ options, summary, entries }, null, 2));
        return;
    }
    if (options.format === 'markdown' || options.format === 'md') {
        console.log(toMarkdown(entries, summary, options));
        return;
    }
    console.log(toText(entries, summary, options));
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_PROFILES,
    evaluateProfile,
    parseArgs,
    profilePlayers,
    profileWeight,
    resolveExpertTuning,
    summarize,
    toMarkdown,
    toText,
};
