const path = require('path');

const benchmarkPack = require(path.join(__dirname, 'eval-expert-v2-benchmark-pack.js'));
const { parseIntegerOrDefault } = require(path.join(__dirname, 'cli-args.js'));
const { loadRuntime } = require(path.join(__dirname, 'selfplay.js'));

function parseSeedList(value) {
    return String(value || '')
        .split(',')
        .map(item => parseInt(item.trim(), 10))
        .filter(seed => Number.isInteger(seed));
}

function parseArgs(argv) {
    const packArgs = [];
    let seeds = [1, 2, 3];
    let seedStart = null;
    let seedCount = null;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--seeds') {
            seeds = parseSeedList(argv[++i]);
        } else if (arg === '--seed-start') {
            seedStart = parseIntegerOrDefault(argv[++i], 1);
        } else if (arg === '--seed-count') {
            seedCount = parseIntegerOrDefault(argv[++i], 3);
        } else if (arg === '--seed') {
            seeds = [parseIntegerOrDefault(argv[++i], 1)];
        } else {
            packArgs.push(arg);
            if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
                packArgs.push(argv[++i]);
            }
        }
    }
    if (Number.isInteger(seedStart) && Number.isInteger(seedCount) && seedCount > 0) {
        seeds = Array.from({ length: seedCount }, (_, index) => seedStart + index);
    }
    if (seeds.length === 0) seeds = [1, 2, 3];
    const packOptions = benchmarkPack.parseArgs(packArgs);
    return Object.assign({}, packOptions, { seeds });
}

function metricValues(reports, getter) {
    return reports.map(getter).filter(value => Number.isFinite(value));
}

function summarizeValues(values) {
    if (!values.length) return { mean: null, min: null, max: null };
    const sum = values.reduce((total, value) => total + value, 0);
    return { mean: sum / values.length, min: Math.min(...values), max: Math.max(...values) };
}

function summarizeProfiles(reports) {
    const byKey = new Map();
    for (const report of reports) {
        for (const entry of report.normal.entries) addEntry('normal', entry);
        for (const entry of report.strong.entries) addEntry('strong', entry);
    }
    return Array.from(byKey.values()).map(item => {
        const summary = Object.assign({}, item, summarizeValues(item.values));
        delete summary.values;
        return summary;
    });

    function addEntry(suite, entry) {
        const key = suite + ':' + entry.profile;
        if (!byKey.has(key)) byKey.set(key, { suite, profile: entry.profile, values: [] });
        byKey.get(key).values.push(entry.winRate);
    }
}

function summarizeReports(reports) {
    return {
        seeds: reports.map(report => report.options.seed),
        normalCrowd: summarizeValues(metricValues(reports, report => report.normal.entries[0] ? report.normal.entries[0].winRate : NaN)),
        strongWeighted: summarizeValues(metricValues(reports, report => report.strong.entries.length > 0 ? report.strong.summary.weightedWinRate : NaN)),
        strongMin: summarizeValues(metricValues(reports, report => report.strong.entries.length > 0 ? report.strong.summary.minWinRate : NaN)),
        profiles: summarizeProfiles(reports),
    };
}

function evaluateMultiSeed(options, evaluateFn = benchmarkPack.evaluatePack) {
    const runtime = options.runtime || loadRuntime({ includeRL: false });
    const reports = options.seeds.map(seed => evaluateFn(Object.assign({}, options, { seed, runtime })));
    const reportOptions = Object.assign({}, options);
    delete reportOptions.runtime;
    return {
        cpuFamily: reports[0] ? reports[0].cpuFamily : 'v2simple-rule-based',
        comparisonScope: 'expert-v2-multiseed-benchmark',
        options: reportOptions,
        summary: summarizeReports(reports),
        reports,
    };
}

function formatPercent(value) {
    return Number.isFinite(value) ? (value * 100).toFixed(1) + '%' : 'n/a';
}

function rangeText(summary) {
    if (!summary || !Number.isFinite(summary.min) || !Number.isFinite(summary.max)) return 'n/a';
    return formatPercent(summary.min) + '..' + formatPercent(summary.max);
}

function toText(report) {
    const lines = [
        'cpuFamily=' + report.cpuFamily + ' comparisonScope=' + report.comparisonScope,
        'games=' + report.options.games + ' seeds=' + report.options.seeds.join(',') + ' mode=' + (report.options.lite ? 'lite' : (report.options.fast ? 'fast' : 'full')) + ' suite=' + (report.options.suite || 'all') + ' profiles=' + ((report.options.profiles || []).join(',') || 'default'),
        'normalCrowdMean=' + formatPercent(report.summary.normalCrowd.mean) + ' range=' + rangeText(report.summary.normalCrowd),
        'strongWeightedMean=' + formatPercent(report.summary.strongWeighted.mean) + ' range=' + rangeText(report.summary.strongWeighted),
        'strongMinMean=' + formatPercent(report.summary.strongMin.mean) + ' range=' + rangeText(report.summary.strongMin),
        'seeds:',
    ];
    for (const child of report.reports) {
        const normalCrowd = child.normal.entries[0] ? child.normal.entries[0].winRate : NaN;
        const strongWeighted = child.strong.entries.length > 0 ? child.strong.summary.weightedWinRate : NaN;
        const strongMin = child.strong.entries.length > 0 ? child.strong.summary.minWinRate : NaN;
        lines.push('seed=' + child.options.seed + ' normalCrowd=' + formatPercent(normalCrowd) + ' strongWeighted=' + formatPercent(strongWeighted) + ' strongMin=' + formatPercent(strongMin));
    }
    if (report.summary.profiles.length > 0) {
        lines.push('profiles:');
        for (const profile of report.summary.profiles) {
            lines.push(profile.suite + ':' + profile.profile + ' mean=' + formatPercent(profile.mean) + ' range=' + rangeText(profile));
        }
    }
    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = evaluateMultiSeed(options);
    if (options.format === 'json') {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    console.log(toText(report));
}

if (require.main === module) {
    main();
}

module.exports = {
    evaluateMultiSeed,
    parseArgs,
    parseSeedList,
    summarizeReports,
    summarizeValues,
    toText,
};
