const path = require('path');

const strongEval = require(path.join(__dirname, 'eval-expert-vs-strong.js'));
const normalEval = require(path.join(__dirname, 'eval-expert-vs-normal.js'));

function parseArgs(argv) {
    let games = 50;
    let seed = 1;
    let maxSteps = 5000;
    let format = 'text';
    let lite = true;
    let fast = false;
    let expertPreset = 'v2simple';
    let businessMode = 'simple';

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
        }
    }

    return { games, seed, maxSteps, format, lite, fast, expertPreset, businessMode };
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

function evaluatePack(options) {
    const normalOptions = baseOptions(options, ['crowd']);
    const strongOptions = baseOptions(options, ['duel', 'trio', 'crowd', 'allStrong4']);
    const normalEntries = normalOptions.profiles.map(profile => normalEval.evaluateProfile(profile, normalOptions));
    const strongEntries = strongOptions.profiles.map(profile => strongEval.evaluateProfile(profile, strongOptions));
    return {
        cpuFamily: 'v2simple-rule-based',
        comparisonScope: 'expert-v2-benchmark-pack',
        options,
        normal: {
            options: normalOptions,
            summary: normalEval.summarize(normalEntries),
            entries: normalEntries,
        },
        strong: {
            options: strongOptions,
            summary: strongEval.summarize(strongEntries),
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
    const lines = [
        `cpuFamily=${report.cpuFamily || 'v2simple-rule-based'} comparisonScope=${report.comparisonScope || 'expert-v2-benchmark-pack'}`,
        `games=${report.options.games} seed=${report.options.seed} mode=${report.options.lite ? 'lite' : (report.options.fast ? 'fast' : 'full')} expertPreset=${report.options.expertPreset} businessMode=${report.options.businessMode || 'simple'}`,
        `normalCrowd=${formatPercent(report.normal.entries[0].winRate)} strongWeighted=${formatPercent(report.strong.summary.weightedWinRate)} strongMin=${formatPercent(report.strong.summary.minWinRate)}`,
        'normal:',
        ...report.normal.entries.map(entryLine),
        'strong:',
        ...report.strong.entries.map(entryLine),
    ];
    return lines.join('\n');
}

function toMarkdown(report) {
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
        `- normalCrowd: ${formatPercent(report.normal.entries[0].winRate)}`,
        `- strongWeighted: ${formatPercent(report.strong.summary.weightedWinRate)}`,
        `- strongMin: ${formatPercent(report.strong.summary.minWinRate)}`,
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
    toMarkdown,
    toText,
};
