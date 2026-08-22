const fs = require('fs');
const path = require('path');

const { parseIntegerList } = require('./cli-args.js');
const { runSeries, SERIES_SEED_POLICIES } = require('./selfplay.js');
const { taggedSubjectSeat } = require('./diagnose-cpu-seat-effect.js');

const DEFAULT_PLAYER_COUNTS = Object.freeze([8, 9, 10]);
const DEFAULT_SEED_STARTS = Object.freeze([1, 1001, 2001]);
const DEFAULT_DIFFICULTIES = Object.freeze(['normal', 'strong', 'expert']);

function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function parseArgs(argv) {
    const args = {
        playerCounts: DEFAULT_PLAYER_COUNTS.slice(),
        seedStarts: DEFAULT_SEED_STARTS.slice(),
        blocks: 5,
        maxSteps: 5000,
        nonInferiorityMargin: 0.03,
        gateMode: 'statistical',
        maxWindowMs: 0,
        output: '',
        format: 'text',
        check: false,
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--player-counts') args.playerCounts = parseIntegerList(argv[++index], 2);
        else if (arg === '--seed-starts') args.seedStarts = parseIntegerList(argv[++index], 0);
        else if (arg === '--blocks') args.blocks = Number(argv[++index]);
        else if (arg === '--max-steps') args.maxSteps = Number(argv[++index]);
        else if (arg === '--non-inferiority-margin') {
            args.nonInferiorityMargin = finiteNumber(argv[++index], args.nonInferiorityMargin);
        } else if (arg === '--output') args.output = argv[++index] || '';
        else if (arg === '--gate-mode') args.gateMode = argv[++index] || args.gateMode;
        else if (arg === '--max-window-ms') args.maxWindowMs = Number(argv[++index]);
        else if (arg === '--format') args.format = argv[++index] || args.format;
        else if (arg === '--check') args.check = true;
    }
    return args;
}

function validateOptions(options) {
    if (!Array.isArray(options.playerCounts) || options.playerCounts.length === 0 ||
        options.playerCounts.some(count => !Number.isInteger(count) || count < 2 || count > 10)) {
        throw new Error('player-counts は2〜10の整数で指定してください');
    }
    if (!Array.isArray(options.seedStarts) || options.seedStarts.length < 2 ||
        options.seedStarts.some(seed => !Number.isInteger(seed) || seed < 0)) {
        throw new Error('seed-starts は2件以上の非負整数で指定してください');
    }
    if (!Number.isInteger(options.blocks) || options.blocks <= 0) {
        throw new Error('blocks は1以上の整数で指定してください');
    }
    if (!Number.isInteger(options.maxSteps) || options.maxSteps <= 0) {
        throw new Error('max-steps は1以上の整数で指定してください');
    }
    if (!Number.isFinite(options.nonInferiorityMargin) ||
        options.nonInferiorityMargin < 0 || options.nonInferiorityMargin > 0.1) {
        throw new Error('non-inferiority-margin は0〜0.1で指定してください');
    }
    if (!['smoke', 'statistical'].includes(options.gateMode)) {
        throw new Error('gate-mode はsmoke/statisticalで指定してください');
    }
    if (!Number.isFinite(options.maxWindowMs) || options.maxWindowMs < 0) {
        throw new Error('max-window-ms は0以上で指定してください');
    }
}

function targetOutcomes(result, playerCount) {
    if (!result || !Array.isArray(result.matchLog)) throw new Error('matchLog is required');
    return result.matchLog.map((match, gameIndex) => {
        if (!match || !Number.isInteger(match.winnerIndex)) return 0;
        return match.winnerIndex === taggedSubjectSeat(gameIndex, playerCount) ? 1 : 0;
    });
}

function pairedSummaryFromCounts(counts) {
    const samples = counts.candidateOnly + counts.baselineOnly + counts.ties;
    if (samples <= 0) throw new Error('paired samples are required');
    const sum = counts.candidateOnly - counts.baselineOnly;
    const sumSquares = counts.candidateOnly + counts.baselineOnly;
    const meanDifference = sum / samples;
    const variance = samples > 1
        ? Math.max(0, (sumSquares - samples * meanDifference * meanDifference) / (samples - 1))
        : 0;
    const standardError = Math.sqrt(variance / samples);
    const margin95 = 1.96 * standardError;
    const nonInferiority95Low = Math.max(-1, meanDifference - 1.645 * standardError);
    return {
        samples,
        baselineWins: counts.baselineWins,
        candidateWins: counts.candidateWins,
        baselineWinRate: counts.baselineWins / samples,
        candidateWinRate: counts.candidateWins / samples,
        candidateOnly: counts.candidateOnly,
        baselineOnly: counts.baselineOnly,
        ties: counts.ties,
        meanDifference,
        standardError,
        nonInferiority95Low,
        difference95: {
            low: Math.max(-1, meanDifference - margin95),
            high: Math.min(1, meanDifference + margin95),
        },
    };
}

function summarizePairedOutcomes(baseline, candidate) {
    if (!Array.isArray(baseline) || !Array.isArray(candidate) ||
        baseline.length === 0 || baseline.length !== candidate.length) {
        throw new Error('aligned paired outcomes are required');
    }
    const counts = {
        baselineWins: 0,
        candidateWins: 0,
        candidateOnly: 0,
        baselineOnly: 0,
        ties: 0,
    };
    for (let index = 0; index < baseline.length; index++) {
        const baselineWin = baseline[index] === 1 ? 1 : 0;
        const candidateWin = candidate[index] === 1 ? 1 : 0;
        counts.baselineWins += baselineWin;
        counts.candidateWins += candidateWin;
        if (candidateWin > baselineWin) counts.candidateOnly++;
        else if (baselineWin > candidateWin) counts.baselineOnly++;
        else counts.ties++;
    }
    return pairedSummaryFromCounts(counts);
}

function combinePairedSummaries(summaries) {
    if (!Array.isArray(summaries) || summaries.length === 0) {
        throw new Error('paired summaries are required');
    }
    const counts = summaries.reduce((total, summary) => {
        total.baselineWins += summary.baselineWins;
        total.candidateWins += summary.candidateWins;
        total.candidateOnly += summary.candidateOnly;
        total.baselineOnly += summary.baselineOnly;
        total.ties += summary.ties;
        return total;
    }, {
        baselineWins: 0,
        candidateWins: 0,
        candidateOnly: 0,
        baselineOnly: 0,
        ties: 0,
    });
    return pairedSummaryFromCounts(counts);
}

function evaluateWindow(options, playerCount, seedStart, dependencies = {}) {
    const runner = dependencies.runSeries || runSeries;
    const now = dependencies.now || (() => Number(process.hrtime.bigint()) / 1e6);
    const results = {};
    const elapsedMs = {};
    const exhausted = {};
    for (const difficulty of DEFAULT_DIFFICULTIES) {
        const startedAt = now();
        const result = runner({
            games: options.blocks * playerCount,
            seed: seedStart,
            maxSteps: options.maxSteps,
            players: [difficulty, ...Array.from({ length: playerCount - 1 }, () => 'normal')],
            cpuPurpose: 'live',
            seedPolicy: SERIES_SEED_POLICIES.PAIRED_SEATS,
            collectBuildStats: false,
            collectBusinessStats: false,
            includeFinalState: false,
        });
        elapsedMs[difficulty] = now() - startedAt;
        exhausted[difficulty] = result.exhausted || 0;
        results[difficulty] = targetOutcomes(result, playerCount);
    }
    return {
        playerCount,
        seedStart,
        seedEnd: seedStart + options.blocks - 1,
        gamesPerDifficulty: options.blocks * playerCount,
        elapsedMs,
        exhausted,
        comparisons: {
            strongVsNormal: summarizePairedOutcomes(results.normal, results.strong),
            expertVsStrong: summarizePairedOutcomes(results.strong, results.expert),
            expertVsNormal: summarizePairedOutcomes(results.normal, results.expert),
        },
    };
}

function comparisonPass(summary, margin) {
    return summary.nonInferiority95Low >= -margin;
}

function comparisonClassification(summary, margin) {
    if (!comparisonPass(summary, margin)) return 'inverted';
    return summary.meanDifference >= 0 ? 'ordered' : 'non-inferior';
}

function evaluateDifficultyGate(options, dependencies = {}) {
    options = Object.assign({ gateMode: 'statistical', maxWindowMs: 0 }, options);
    validateOptions(options);
    const windows = [];
    for (const playerCount of options.playerCounts) {
        for (const seedStart of options.seedStarts) {
            const window = evaluateWindow(options, playerCount, seedStart, dependencies);
            windows.push(window);
            if (typeof dependencies.onWindow === 'function') dependencies.onWindow(window);
        }
    }
    const byPlayerCount = options.playerCounts.map(playerCount => {
        const playerWindows = windows.filter(window => window.playerCount === playerCount);
        const comparisons = {};
        for (const key of ['strongVsNormal', 'expertVsStrong', 'expertVsNormal']) {
            comparisons[key] = combinePairedSummaries(playerWindows.map(window => window.comparisons[key]));
        }
        const exhausted = playerWindows.reduce((total, window) =>
            total + Object.values(window.exhausted).reduce((sum, count) => sum + count, 0), 0);
        const slowWindows = options.maxWindowMs > 0
            ? playerWindows.filter(window => Object.values(window.elapsedMs)
                .some(elapsed => elapsed > options.maxWindowMs)).length
            : 0;
        const statisticalPass = comparisonPass(comparisons.strongVsNormal, options.nonInferiorityMargin) &&
            comparisonPass(comparisons.expertVsStrong, options.nonInferiorityMargin);
        const order = {
            strongVsNormal: comparisonClassification(comparisons.strongVsNormal, options.nonInferiorityMargin),
            expertVsStrong: comparisonClassification(comparisons.expertVsStrong, options.nonInferiorityMargin),
        };
        const pass = exhausted === 0 && slowWindows === 0 &&
            (options.gateMode === 'smoke' || statisticalPass);
        return {
            playerCount,
            gamesPerDifficulty: playerWindows.reduce((sum, window) => sum + window.gamesPerDifficulty, 0),
            exhausted,
            slowWindows,
            comparisons,
            order,
            pass,
        };
    });
    return {
        schemaVersion: 1,
        config: {
            playerCounts: options.playerCounts.slice(),
            seedStarts: options.seedStarts.slice(),
            blocks: options.blocks,
            maxSteps: options.maxSteps,
            nonInferiorityMargin: options.nonInferiorityMargin,
            gateMode: options.gateMode,
            maxWindowMs: options.maxWindowMs,
            seedPolicy: SERIES_SEED_POLICIES.PAIRED_SEATS,
            cpuPurpose: 'live',
        },
        windows,
        byPlayerCount,
        pass: byPlayerCount.every(entry => entry.pass),
    };
}

function percent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function renderText(report) {
    const lines = [
        `CPU difficulty gate: ${report.pass ? 'PASS' : 'FAIL'} mode=${report.config.gateMode} blocks=${report.config.blocks} seedStarts=${report.config.seedStarts.join(',')}`,
    ];
    for (const entry of report.byPlayerCount) {
        const strong = entry.comparisons.strongVsNormal;
        const expert = entry.comparisons.expertVsStrong;
        lines.push(
            `${entry.playerCount}p ${entry.pass ? 'PASS' : 'FAIL'} games=${entry.gamesPerDifficulty} exhausted=${entry.exhausted} slowWindows=${entry.slowWindows} ` +
            `strong-normal=${percent(strong.meanDifference)} NI95=${percent(strong.nonInferiority95Low)} CI=[${percent(strong.difference95.low)},${percent(strong.difference95.high)}] ` +
            `expert-strong=${percent(expert.meanDifference)} NI95=${percent(expert.nonInferiority95Low)} CI=[${percent(expert.difference95.low)},${percent(expert.difference95.high)}] ` +
            `order=${entry.order.strongVsNormal}/${entry.order.expertVsStrong}`
        );
    }
    return lines.join('\n');
}

function writeReport(outputPath, report) {
    if (!outputPath) return;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const report = evaluateDifficultyGate(args, {
        onWindow(window) {
            const elapsed = Object.values(window.elapsedMs).reduce((sum, value) => sum + value, 0);
            console.error(`[cpu-difficulty] ${window.playerCount}p seed=${window.seedStart} games=${window.gamesPerDifficulty} elapsed=${Math.round(elapsed)}ms`);
        },
    });
    writeReport(args.output, report);
    console.log(args.format === 'json' ? JSON.stringify(report, null, 2) : renderText(report));
    if (args.check && !report.pass) process.exitCode = 1;
}

module.exports = {
    DEFAULT_PLAYER_COUNTS,
    DEFAULT_SEED_STARTS,
    parseArgs,
    validateOptions,
    targetOutcomes,
    pairedSummaryFromCounts,
    summarizePairedOutcomes,
    combinePairedSummaries,
    evaluateWindow,
    comparisonPass,
    comparisonClassification,
    evaluateDifficultyGate,
    renderText,
    writeReport,
};
