const path = require('path');

const strongEval = require(path.join(__dirname, 'eval-expert-vs-strong.js'));
const normalEval = require(path.join(__dirname, 'eval-expert-vs-normal.js'));
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
    let businessMode = 'simple';
    let suite = 'all';
    let profiles = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--games') games = parseInt(argv[++i] || '50', 10);
        else if (arg === '--seed') seed = parseInt(argv[++i] || '1', 10);
        else if (arg === '--max-steps') maxSteps = parseInt(argv[++i] || '5000', 10);
        else if (arg === '--format') format = argv[++i] || 'text';
        else if (arg === '--full') lite = false;
        else if (arg === '--fast') {
            lite = false;
            fast = true;
        } else if (arg === '--expert-preset') {
            expertPreset = argv[++i] || 'v2simple';
        } else if (arg === '--business-mode') {
            businessMode = argv[++i] || 'simple';
        } else if (arg === '--suite') {
            suite = argv[++i] || 'all';
        } else if (arg === '--profiles') {
            profiles = parseList(argv[++i]);
        }
    }

    return { games, seed, maxSteps, format, lite, fast, expertPreset, businessMode, suite, profiles };
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
        buildMode: 'ev',
        diceMode: 'ev',
        rerollMode: 'simple',
        itMode: 'always',
        tvMode: 'simple',
        businessMode: options.businessMode || 'simple',
        cleaningMode: 'simple',
        harborMode: 'simple',
        moverMode: 'simple',
        renovationMode: 'simple',
        incomeCapMode: 'none',
        comboMode: 'core',
        comboWeight: 0.35,
        buildTempoWeight: 0.05,
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
    return {
        cpuFamily: 'v2simple-rule-based',
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
        `games=${report.options.games} seed=${report.options.seed} mode=${report.options.lite ? 'lite' : (report.options.fast ? 'fast' : 'full')} expertPreset=${report.options.expertPreset} businessMode=${report.options.businessMode || 'simple'} suite=${report.options.suite || 'all'} profiles=${(report.options.profiles || []).join(',') || 'default'}`,
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
        `- businessMode: ${report.options.businessMode || 'simple'}`,
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
