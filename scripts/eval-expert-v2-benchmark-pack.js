const path = require('path');

const strongEval = require(path.join(__dirname, 'eval-expert-vs-strong.js'));
const normalEval = require(path.join(__dirname, 'eval-expert-vs-normal.js'));
const { parseFloatOrDefault, parseIntegerOrDefault } = require(path.join(__dirname, 'cli-args.js'));
const { loadRuntime } = require(path.join(__dirname, 'selfplay.js'));

const DEFAULT_NORMAL_PROFILES = ['crowd'];
const DEFAULT_STRONG_PROFILES = ['duel', 'trio', 'crowd', 'allStrong4'];

function parseList(value) {
    return String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function parseArgs(argv) {
    let games = 50;
    let seed = 1;
    let maxSteps = 5000;
    let format = 'text';
    let lite = true;
    let fast = false;
    let expertPreset = 'v2simple';
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
    let airportSkipMode = 'whenNoLandmark';
    let landmarkCardMargin = 25;
    let landmarkCardCompareMode = 'base';
    let landmarkCardCompareTargets = 'harborMall';
    let landmarkCardPenaltyMode = 'none';
    let harborLandmarkBaseBonus = 2.5;
    let landmarkProgressRemaining = 3;
    let landmarkCostWeight = 0.12;
    let suite = 'all';
    let profiles = [];

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
        } else if (arg === '--expert-preset') {
            expertPreset = argv[++i] || 'v2simple';
        } else if (arg === '--build-mode') {
            buildMode = argv[++i] || 'ev';
        } else if (arg === '--dice-mode') {
            diceMode = argv[++i] || 'strongCrowdThreshold';
        } else if (arg === '--reroll-mode') {
            rerollMode = argv[++i] || 'simple';
        } else if (arg === '--reroll-margin') {
            rerollMargin = parseFloatOrDefault(argv[++i], 0);
        } else if (arg === '--it-mode') {
            itMode = argv[++i] || 'always';
        } else if (arg === '--tv-mode') {
            tvMode = argv[++i] || 'simple';
        } else if (arg === '--business-mode') {
            businessMode = argv[++i] || 'harmfulGift';
        } else if (arg === '--cleaning-mode') {
            cleaningMode = argv[++i] || 'simple';
        } else if (arg === '--harbor-mode') {
            harborMode = argv[++i] || 'simple';
        } else if (arg === '--harbor-margin') {
            harborMargin = parseFloatOrDefault(argv[++i], 0);
        } else if (arg === '--mover-mode') {
            moverMode = argv[++i] || 'simple';
        } else if (arg === '--renovation-mode') {
            renovationMode = argv[++i] || 'simple';
        } else if (arg === '--income-cap-mode') {
            incomeCapMode = argv[++i] || 'none';
        } else if (arg === '--combo-mode') {
            comboMode = argv[++i] || 'core';
        } else if (arg === '--combo-weight') {
            comboWeight = parseFloatOrDefault(argv[++i], 0.35);
        } else if (arg === '--build-tempo-weight') {
            buildTempoWeight = parseFloatOrDefault(argv[++i], 0.05);
        } else if (arg === '--airport-skip-mode') {
            airportSkipMode = argv[++i] || 'whenNoLandmark';
        } else if (arg === '--landmark-card-margin') {
            landmarkCardMargin = parseFloatOrDefault(argv[++i], 25);
        } else if (arg === '--landmark-card-compare-mode') {
            landmarkCardCompareMode = argv[++i] || 'base';
        } else if (arg === '--landmark-card-compare-targets') {
            landmarkCardCompareTargets = argv[++i] || 'harborMall';
        } else if (arg === '--landmark-card-penalty-mode') {
            landmarkCardPenaltyMode = argv[++i] || 'none';
        } else if (arg === '--harbor-landmark-base-bonus') {
            harborLandmarkBaseBonus = parseFloatOrDefault(argv[++i], 2.5);
        } else if (arg === '--landmark-progress-remaining') {
            landmarkProgressRemaining = parseFloatOrDefault(argv[++i], 3);
        } else if (arg === '--landmark-cost-weight') {
            landmarkCostWeight = parseFloatOrDefault(argv[++i], 0.12);
        } else if (arg === '--suite') {
            suite = argv[++i] || 'all';
        } else if (arg === '--profiles') {
            profiles = parseList(argv[++i]);
        }
    }

    return { games, seed, maxSteps, format, lite, fast, expertPreset, buildMode, diceMode, rerollMode, rerollMargin, itMode, tvMode, businessMode, cleaningMode, harborMode, harborMargin, moverMode, renovationMode, incomeCapMode, comboMode, comboWeight, buildTempoWeight, airportSkipMode, landmarkCardMargin, landmarkCardCompareMode, landmarkCardCompareTargets, landmarkCardPenaltyMode, harborLandmarkBaseBonus, landmarkProgressRemaining, landmarkCostWeight, suite, profiles };
}

function baseOptions(options, profiles) {
    return {
        games: options.games,
        seed: options.seed,
        maxSteps: options.maxSteps,
        lite: options.lite,
        fast: options.fast,
        expertPreset: options.expertPreset,
        profiles,
        buildMode: options.buildMode || 'ev',
        diceMode: options.diceMode || 'strongCrowdThreshold',
        rerollMode: options.rerollMode || 'simple',
        rerollMargin: Number.isFinite(options.rerollMargin) ? options.rerollMargin : 0,
        itMode: options.itMode || 'always',
        tvMode: options.tvMode || 'simple',
        businessMode: options.businessMode || 'harmfulGift',
        cleaningMode: options.cleaningMode || 'simple',
        harborMode: options.harborMode || 'simple',
        harborMargin: Number.isFinite(options.harborMargin) ? options.harborMargin : 0,
        moverMode: options.moverMode || 'simple',
        renovationMode: options.renovationMode || 'simple',
        incomeCapMode: options.incomeCapMode || 'none',
        comboMode: options.comboMode || 'core',
        comboWeight: Number.isFinite(options.comboWeight) ? options.comboWeight : 0.35,
        buildTempoWeight: Number.isFinite(options.buildTempoWeight) ? options.buildTempoWeight : 0.05,
        airportSkipMode: options.airportSkipMode || 'whenNoLandmark',
        landmarkCardMargin: Number.isFinite(options.landmarkCardMargin) ? options.landmarkCardMargin : 25,
        landmarkCardCompareMode: options.landmarkCardCompareMode || 'base',
        landmarkCardCompareTargets: options.landmarkCardCompareTargets || 'harborMall',
        landmarkCardPenaltyMode: options.landmarkCardPenaltyMode || 'none',
        harborLandmarkBaseBonus: Number.isFinite(options.harborLandmarkBaseBonus) ? options.harborLandmarkBaseBonus : 2.5,
        landmarkProgressRemaining: Number.isFinite(options.landmarkProgressRemaining) ? options.landmarkProgressRemaining : 3,
        landmarkCostWeight: Number.isFinite(options.landmarkCostWeight) ? options.landmarkCostWeight : 0.12,
        expertTraceStats: options.expertTraceStats || null,
    };
}

function shouldRunSuite(options, suite) {
    const selected = options.suite || 'all';
    return selected === 'all' || selected === suite;
}

function profilesForSuite(options, suite) {
    if (Array.isArray(options.profiles) && options.profiles.length > 0) {
        return options.profiles.slice();
    }
    return suite === 'normal' ? DEFAULT_NORMAL_PROFILES.slice() : DEFAULT_STRONG_PROFILES.slice();
}

function skippedSummary() {
    return {
        executed: false,
        skipped: true,
        weightedWinRate: 0,
        minWinRate: 0,
        profiles: 0,
    };
}

function executedSummary(summary) {
    return Object.assign({ executed: true, skipped: false }, summary);
}

function evaluatePack(options) {
    const runtime = options.runtime || loadRuntime({ includeRL: false });
    const normalOptions = Object.assign(baseOptions(options, profilesForSuite(options, 'normal')), { runtime });
    const strongOptions = Object.assign(baseOptions(options, profilesForSuite(options, 'strong')), { runtime });
    const normalEntries = shouldRunSuite(options, 'normal')
        ? normalOptions.profiles.map(profile => normalEval.evaluateProfile(profile, normalOptions))
        : [];
    const strongEntries = shouldRunSuite(options, 'strong')
        ? strongOptions.profiles.map(profile => strongEval.evaluateProfile(profile, strongOptions))
        : [];
    const reportOptions = Object.assign({}, options);
    const normalReportOptions = Object.assign({}, normalOptions);
    const strongReportOptions = Object.assign({}, strongOptions);
    delete reportOptions.runtime;
    delete normalReportOptions.runtime;
    delete strongReportOptions.runtime;
    const expertPreset = options.expertPreset || 'v2simple';
    return {
        cpuFamily: expertPreset === 'v2simple' ? 'v2simple-rule-based' : `${expertPreset}-rule-based`,
        comparisonScope: 'expert-v2-benchmark-pack',
        options: reportOptions,
        normal: {
            options: normalReportOptions,
            summary: normalEntries.length > 0 ? executedSummary(normalEval.summarize(normalEntries)) : skippedSummary(),
            entries: normalEntries,
        },
        strong: {
            options: strongReportOptions,
            summary: strongEntries.length > 0 ? executedSummary(strongEval.summarize(strongEntries)) : skippedSummary(),
            entries: strongEntries,
        },
    };
}

function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function entryLine(entry) {
    return `${entry.profile}: ${entry.expertWins}/${entry.games} (${formatPercent(entry.winRate)}) avgTurns=${entry.averageTurns.toFixed(1)} exhausted=${entry.exhausted}`;
}

function toText(report) {
    const normalCrowd = report.normal.entries[0]
        ? formatPercent(report.normal.entries[0].winRate)
        : 'n/a';
    const strongWeighted = report.strong.entries.length > 0
        ? formatPercent(report.strong.summary.weightedWinRate)
        : 'n/a';
    const strongMin = report.strong.entries.length > 0
        ? formatPercent(report.strong.summary.minWinRate)
        : 'n/a';
    const lines = [
        `cpuFamily=${report.cpuFamily || 'v2simple-rule-based'} comparisonScope=${report.comparisonScope || 'expert-v2-benchmark-pack'}`,
        `games=${report.options.games} seed=${report.options.seed} mode=${report.options.lite ? 'lite' : (report.options.fast ? 'fast' : 'full')} expertPreset=${report.options.expertPreset} buildMode=${report.options.buildMode || 'ev'} diceMode=${report.options.diceMode || 'strongCrowdThreshold'} rerollMode=${report.options.rerollMode || 'simple'} rerollMargin=${Number.isFinite(report.options.rerollMargin) ? report.options.rerollMargin : 0} itMode=${report.options.itMode || 'always'} tvMode=${report.options.tvMode || 'simple'} businessMode=${report.options.businessMode || 'harmfulGift'} cleaningMode=${report.options.cleaningMode || 'simple'} harborMode=${report.options.harborMode || 'simple'} harborMargin=${Number.isFinite(report.options.harborMargin) ? report.options.harborMargin : 0} moverMode=${report.options.moverMode || 'simple'} renovationMode=${report.options.renovationMode || 'simple'} incomeCapMode=${report.options.incomeCapMode || 'none'} comboMode=${report.options.comboMode || 'core'} comboWeight=${Number.isFinite(report.options.comboWeight) ? report.options.comboWeight : 0.35} buildTempoWeight=${Number.isFinite(report.options.buildTempoWeight) ? report.options.buildTempoWeight : 0.05} airportSkipMode=${report.options.airportSkipMode || 'whenNoLandmark'} landmarkCardMargin=${Number.isFinite(report.options.landmarkCardMargin) ? report.options.landmarkCardMargin : 25} landmarkCardCompareMode=${report.options.landmarkCardCompareMode || 'base'} landmarkCardCompareTargets=${report.options.landmarkCardCompareTargets || 'harborMall'} landmarkCardPenaltyMode=${report.options.landmarkCardPenaltyMode || 'none'} harborLandmarkBaseBonus=${Number.isFinite(report.options.harborLandmarkBaseBonus) ? report.options.harborLandmarkBaseBonus : 2.5} landmarkProgressRemaining=${Number.isFinite(report.options.landmarkProgressRemaining) ? report.options.landmarkProgressRemaining : 3} landmarkCostWeight=${Number.isFinite(report.options.landmarkCostWeight) ? report.options.landmarkCostWeight : 0.12} suite=${report.options.suite || 'all'} profiles=${(report.options.profiles || []).join(',') || 'default'}`,
        `normalCrowd=${normalCrowd} strongWeighted=${strongWeighted} strongMin=${strongMin}`,
    ];
    if (report.normal.entries.length > 0) {
        lines.push('normal:', ...report.normal.entries.map(entryLine));
    }
    if (report.strong.entries.length > 0) {
        lines.push('strong:', ...report.strong.entries.map(entryLine));
    }
    return lines.join('\n');
}

function toMarkdown(report) {
    const normalCrowd = report.normal.entries[0]
        ? formatPercent(report.normal.entries[0].winRate)
        : 'n/a';
    const strongWeighted = report.strong.entries.length > 0
        ? formatPercent(report.strong.summary.weightedWinRate)
        : 'n/a';
    const strongMin = report.strong.entries.length > 0
        ? formatPercent(report.strong.summary.minWinRate)
        : 'n/a';
    const lines = [
        '# Expert v2 Benchmark Pack',
        '',
        `- cpuFamily: ${report.cpuFamily || 'v2simple-rule-based'}`,
        `- comparisonScope: ${report.comparisonScope || 'expert-v2-benchmark-pack'}`,
        `- games: ${report.options.games}`,
        `- seed: ${report.options.seed}`,
        `- mode: ${report.options.lite ? 'lite' : (report.options.fast ? 'fast' : 'full')}`,
        `- expertPreset: ${report.options.expertPreset}`,
        `- buildMode: ${report.options.buildMode || 'ev'}`,
        `- diceMode: ${report.options.diceMode || 'strongCrowdThreshold'}`,
        `- rerollMode: ${report.options.rerollMode || 'simple'}`,
        `- rerollMargin: ${Number.isFinite(report.options.rerollMargin) ? report.options.rerollMargin : 0}`,
        `- itMode: ${report.options.itMode || 'always'}`,
        `- tvMode: ${report.options.tvMode || 'simple'}`,
        `- businessMode: ${report.options.businessMode || 'harmfulGift'}`,
        `- cleaningMode: ${report.options.cleaningMode || 'simple'}`,
        `- harborMode: ${report.options.harborMode || 'simple'}`,
        `- harborMargin: ${Number.isFinite(report.options.harborMargin) ? report.options.harborMargin : 0}`,
        `- moverMode: ${report.options.moverMode || 'simple'}`,
        `- renovationMode: ${report.options.renovationMode || 'simple'}`,
        `- incomeCapMode: ${report.options.incomeCapMode || 'none'}`,
        `- comboMode: ${report.options.comboMode || 'core'}`,
        `- comboWeight: ${Number.isFinite(report.options.comboWeight) ? report.options.comboWeight : 0.35}`,
        `- buildTempoWeight: ${Number.isFinite(report.options.buildTempoWeight) ? report.options.buildTempoWeight : 0.05}`,
        `- airportSkipMode: ${report.options.airportSkipMode || 'whenNoLandmark'}`,
        `- landmarkCardMargin: ${Number.isFinite(report.options.landmarkCardMargin) ? report.options.landmarkCardMargin : 25}`,
        `- landmarkCardCompareMode: ${report.options.landmarkCardCompareMode || 'base'}`,
        `- landmarkCardCompareTargets: ${report.options.landmarkCardCompareTargets || 'harborMall'}`,
        `- landmarkCardPenaltyMode: ${report.options.landmarkCardPenaltyMode || 'none'}`,
        `- harborLandmarkBaseBonus: ${Number.isFinite(report.options.harborLandmarkBaseBonus) ? report.options.harborLandmarkBaseBonus : 2.5}`,
        `- landmarkProgressRemaining: ${Number.isFinite(report.options.landmarkProgressRemaining) ? report.options.landmarkProgressRemaining : 3}`,
        `- landmarkCostWeight: ${Number.isFinite(report.options.landmarkCostWeight) ? report.options.landmarkCostWeight : 0.12}`,
        `- suite: ${report.options.suite || 'all'}`,
        `- profiles: ${(report.options.profiles || []).join(',') || 'default'}`,
        `- normalCrowd: ${normalCrowd}`,
        `- strongWeighted: ${strongWeighted}`,
        `- strongMin: ${strongMin}`,
        '',
        '| suite | profile | players | winRate | avgTurns | exhausted |',
        '| --- | --- | --- | ---: | ---: | ---: |',
    ];
    for (const entry of report.normal.entries) {
        lines.push(`| normal | ${entry.profile} | ${entry.players.join(',')} | ${formatPercent(entry.winRate)} | ${entry.averageTurns.toFixed(1)} | ${entry.exhausted} |`);
    }
    for (const entry of report.strong.entries) {
        lines.push(`| strong | ${entry.profile} | ${entry.players.join(',')} | ${formatPercent(entry.winRate)} | ${entry.averageTurns.toFixed(1)} | ${entry.exhausted} |`);
    }
    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = evaluatePack(options);
    if (options.format === 'json') {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    if (options.format === 'markdown' || options.format === 'md') {
        console.log(toMarkdown(report));
        return;
    }
    console.log(toText(report));
}

if (require.main === module) {
    main();
}

module.exports = {
    evaluatePack,
    parseArgs,
    profilesForSuite,
    shouldRunSuite,
    toMarkdown,
    toText,
};
