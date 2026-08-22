'use strict';

const fs = require('fs');
const path = require('path');
const { runSeries, SERIES_SEED_POLICIES } = require('./selfplay.js');
const { parseIntegerOrDefault, parseList } = require('./cli-args.js');
const { loadRegistry } = require('./validate-rl-registry.js');

const DEFAULT_MODEL_ID = 'self-only-4p-h256-lr1e5-5000-seed103';
const DEFAULT_TARGETS = Object.freeze(['rl', 'weak', 'normal', 'strong', 'expert']);
const LARGE_CROWD_NATIVE_PROFILE = Object.freeze({
    landmarkBias: 1.12,
    blueFactor: 1.28,
    redFactor: 0.92,
    greenFactor: 1.18,
    purpleFactor: 0.82,
    massAttackFactor: 0.95,
    airportBias: 0.9,
});
const LARGE_CROWD_CANDIDATES = Object.freeze([
    Object.freeze({
        id: 'native',
        strategy: Object.freeze({ buildMode: 'native', rollMode: 'native' }),
        profile: LARGE_CROWD_NATIVE_PROFILE,
    }),
    Object.freeze({
        id: 'normal-build',
        strategy: Object.freeze({ buildMode: 'normal', rollMode: 'native' }),
        profile: LARGE_CROWD_NATIVE_PROFILE,
    }),
    Object.freeze({
        id: 'normal-roll',
        strategy: Object.freeze({ buildMode: 'native', rollMode: 'normal' }),
        profile: LARGE_CROWD_NATIVE_PROFILE,
    }),
    Object.freeze({
        id: 'normal-core',
        strategy: Object.freeze({ buildMode: 'normal', rollMode: 'normal' }),
        profile: LARGE_CROWD_NATIVE_PROFILE,
    }),
    Object.freeze({
        id: 'expert-build',
        strategy: Object.freeze({ buildMode: 'expert', rollMode: 'native' }),
        profile: LARGE_CROWD_NATIVE_PROFILE,
    }),
    Object.freeze({
        id: 'balanced-native',
        strategy: Object.freeze({}),
        profile: Object.freeze({
            landmarkBias: 1.1,
            blueFactor: 1,
            redFactor: 1,
            greenFactor: 1,
            purpleFactor: 1,
            massAttackFactor: 1,
            airportBias: 1,
        }),
    }),
    Object.freeze({
        id: 'balanced-build',
        strategy: Object.freeze({ buildMode: 'normal' }),
        profile: Object.freeze({
            landmarkBias: 1.1,
            blueFactor: 1,
            redFactor: 1,
            greenFactor: 1,
            purpleFactor: 1,
            massAttackFactor: 1,
            airportBias: 1,
        }),
    }),
    Object.freeze({
        id: 'balanced-core',
        strategy: Object.freeze({ buildMode: 'normal', rollMode: 'normal' }),
        profile: Object.freeze({
            landmarkBias: 1.1,
            blueFactor: 1,
            redFactor: 1,
            greenFactor: 1,
            purpleFactor: 1,
            massAttackFactor: 1,
            airportBias: 1,
        }),
    }),
    Object.freeze({
        id: 'tempo-core',
        strategy: Object.freeze({ buildMode: 'normal', rollMode: 'normal' }),
        profile: Object.freeze({
            landmarkBias: 1.3,
            blueFactor: 1.1,
            redFactor: 0.9,
            greenFactor: 1.1,
            purpleFactor: 0.8,
            massAttackFactor: 0.9,
            airportBias: 1.1,
        }),
    }),
    Object.freeze({
        id: 'income-core',
        strategy: Object.freeze({ buildMode: 'normal', rollMode: 'normal' }),
        profile: Object.freeze({
            landmarkBias: 1.1,
            blueFactor: 1.15,
            redFactor: 1,
            greenFactor: 1.15,
            purpleFactor: 1,
            massAttackFactor: 1,
            airportBias: 1,
        }),
    }),
    Object.freeze({
        id: 'interaction-core',
        strategy: Object.freeze({ buildMode: 'normal', rollMode: 'normal' }),
        profile: Object.freeze({
            landmarkBias: 1.1,
            blueFactor: 1,
            redFactor: 1.15,
            greenFactor: 1,
            purpleFactor: 1.2,
            massAttackFactor: 1.15,
            airportBias: 1,
        }),
    }),
    Object.freeze({
        id: 'landmark-core',
        strategy: Object.freeze({ buildMode: 'normal', rollMode: 'normal' }),
        profile: Object.freeze({
            landmarkBias: 1.35,
            blueFactor: 1,
            redFactor: 1,
            greenFactor: 1,
            purpleFactor: 1,
            massAttackFactor: 1,
            airportBias: 1.2,
        }),
    }),
]);

function parseArgs(argv) {
    const args = {
        blocks: 100,
        seed: 1,
        playerCount: 10,
        maxSteps: 5000,
        modelId: DEFAULT_MODEL_ID,
        registryPath: path.join(__dirname, '..', 'models', 'rl_model', 'registry.json'),
        targets: DEFAULT_TARGETS.slice(),
        inputs: [],
        output: '',
        format: 'text',
        cpuPurpose: 'live',
        searchLargeCrowd: false,
        playerCounts: [8, 10],
        candidateIds: LARGE_CROWD_CANDIDATES.map(candidate => candidate.id),
        difficulties: ['strong', 'expert'],
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--blocks') args.blocks = parseIntegerOrDefault(argv[++index], args.blocks);
        else if (arg === '--seed') args.seed = parseIntegerOrDefault(argv[++index], args.seed);
        else if (arg === '--player-count') args.playerCount = parseIntegerOrDefault(argv[++index], args.playerCount);
        else if (arg === '--max-steps') args.maxSteps = parseIntegerOrDefault(argv[++index], args.maxSteps);
        else if (arg === '--model-id') args.modelId = argv[++index] || args.modelId;
        else if (arg === '--registry') args.registryPath = argv[++index] || args.registryPath;
        else if (arg === '--targets') args.targets = parseList(argv[++index]);
        else if (arg === '--inputs') args.inputs = parseList(argv[++index]);
        else if (arg === '--output') args.output = argv[++index] || '';
        else if (arg === '--format') args.format = argv[++index] || args.format;
        else if (arg === '--cpu-purpose') args.cpuPurpose = argv[++index] || args.cpuPurpose;
        else if (arg === '--search-large-crowd') args.searchLargeCrowd = true;
        else if (arg === '--player-counts') args.playerCounts = parseList(argv[++index]).map(Number);
        else if (arg === '--candidate-ids') args.candidateIds = parseList(argv[++index]);
        else if (arg === '--difficulties') args.difficulties = parseList(argv[++index]);
    }
    return args;
}

function largeCrowdCandidateOptions(difficulty, candidate) {
    const options = {
        largeCrowdStrategiesByDifficulty: {
            [difficulty]: Object.assign({}, candidate.strategy || {}),
        },
    };
    if (candidate.profile) {
        options.playerCountProfileTuningsByDifficulty = {
            [difficulty]: { largeCrowd: Object.assign({}, candidate.profile) },
        };
    }
    return options;
}

function evaluateLargeCrowdCandidates(args, dependencies = {}) {
    const playerCounts = args.playerCounts || [8, 10];
    if (playerCounts.length === 0 || playerCounts.some(count => !Number.isInteger(count) || count < 8 || count > 10)) {
        throw new Error('large-crowd player-counts は8〜10で指定してください');
    }
    if (!Number.isInteger(args.blocks) || args.blocks <= 0) {
        throw new Error('large-crowd blocks は1以上で指定してください');
    }
    const candidateIds = args.candidateIds || LARGE_CROWD_CANDIDATES.map(candidate => candidate.id);
    const candidates = LARGE_CROWD_CANDIDATES.filter(candidate => candidateIds.includes(candidate.id));
    if (candidates.length === 0 || candidates.length !== candidateIds.length) {
        throw new Error('未知または空のlarge-crowd candidateがあります');
    }
    const runner = dependencies.runSeries || runSeries;
    const now = dependencies.now || (() => Number(process.hrtime.bigint()) / 1e6);
    const progress = dependencies.progress || (() => {});
    const rows = [];
    const difficulties = args.difficulties || ['strong', 'expert'];
    if (difficulties.length === 0 || difficulties.some(difficulty => difficulty !== 'strong' && difficulty !== 'expert')) {
        throw new Error('large-crowd difficulties はstrong,expertで指定してください');
    }
    for (const difficulty of difficulties) {
        for (const candidate of candidates) {
            const entries = [];
            const startedAt = now();
            for (const playerCount of playerCounts) {
                progress({ phase: 'start', difficulty, candidate: candidate.id, playerCount });
                const players = [difficulty, ...Array.from({ length: playerCount - 1 }, () => 'normal')];
                const result = runner(Object.assign({
                    games: args.blocks * playerCount,
                    seed: args.seed,
                    maxSteps: args.maxSteps,
                    players,
                    cpuPurpose: args.cpuPurpose,
                    seedPolicy: SERIES_SEED_POLICIES.PAIRED_SEATS,
                    collectBuildStats: false,
                    collectBusinessStats: false,
                    includeFinalState: false,
                }, largeCrowdCandidateOptions(difficulty, candidate)));
                const summary = summarizeTaggedSubject(difficulty, result, playerCount);
                entries.push(Object.assign(summary, {
                    playerCount,
                    expectedWinRate: 1 / playerCount,
                    liftVsExpected: summary.winRate - 1 / playerCount,
                }));
                progress({ phase: 'finish', difficulty, candidate: candidate.id, playerCount, winRate: summary.winRate });
            }
            const elapsedMs = now() - startedAt;
            rows.push({
                difficulty,
                candidate: candidate.id,
                strategy: Object.assign({}, candidate.strategy || {}),
                profile: candidate.profile ? Object.assign({}, candidate.profile) : null,
                entries,
                meanLiftVsExpected: entries.reduce((sum, entry) => sum + entry.liftVsExpected, 0) / entries.length,
                elapsedMs,
                exhausted: entries.reduce((sum, entry) => sum + entry.exhausted, 0),
            });
        }
    }
    rows.sort((a, b) =>
        a.difficulty.localeCompare(b.difficulty) ||
        b.meanLiftVsExpected - a.meanLiftVsExpected ||
        a.elapsedMs - b.elapsedMs ||
        a.candidate.localeCompare(b.candidate)
    );
    return {
        blocks: args.blocks,
        seedRange: [args.seed, args.seed + args.blocks - 1],
        playerCounts: playerCounts.slice(),
        cpuPurpose: args.cpuPurpose,
        difficulties: difficulties.slice(),
        rows,
    };
}

function renderLargeCrowdText(report) {
    const lines = [`large-crowd blocks=${report.blocks} seeds=${report.seedRange.join('-')} players=${report.playerCounts.join(',')}`];
    for (const row of report.rows) {
        const rates = row.entries.map(entry => `${entry.playerCount}p=${(entry.winRate * 100).toFixed(1)}%`).join(' ');
        lines.push(`${row.difficulty}/${row.candidate}: ${rates} lift=${(row.meanLiftVsExpected * 100).toFixed(1)}pt ` +
            `elapsed=${(row.elapsedMs / 1000).toFixed(1)}s exhausted=${row.exhausted}`);
    }
    return lines.join('\n');
}

function taggedSubjectSeat(gameIndex, playerCount) {
    const offset = gameIndex % playerCount;
    return (playerCount - offset) % playerCount;
}

function wilsonInterval(wins, games, z = 1.96) {
    if (games <= 0) return { low: 0, high: 0 };
    const rate = wins / games;
    const z2 = z * z;
    const denominator = 1 + z2 / games;
    const center = (rate + z2 / (2 * games)) / denominator;
    const margin = z * Math.sqrt((rate * (1 - rate) + z2 / (4 * games)) / games) / denominator;
    return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function summarizeTaggedSubject(target, result, playerCount) {
    const seatGames = Array.from({ length: playerCount }, () => 0);
    const seatWins = Array.from({ length: playerCount }, () => 0);
    for (const [gameIndex, match] of (result.matchLog || []).entries()) {
        const seat = taggedSubjectSeat(gameIndex, playerCount);
        seatGames[seat]++;
        if (match.winnerIndex === seat) seatWins[seat]++;
    }
    const seatWinRates = seatGames.map((games, seat) => games > 0 ? seatWins[seat] / games : 0);
    const games = seatGames.reduce((sum, value) => sum + value, 0);
    const wins = seatWins.reduce((sum, value) => sum + value, 0);
    const winRate = games > 0 ? wins / games : 0;
    const min = Math.min(...seatWinRates);
    const max = Math.max(...seatWinRates);
    return {
        target,
        games,
        wins,
        winRate,
        winRate95: wilsonInterval(wins, games),
        seatGames,
        seatWins,
        seatWinRates,
        seatWinRate95: seatGames.map((count, seat) => wilsonInterval(seatWins[seat], count)),
        seatGap: max - min,
        centeredSeatRates: seatWinRates.map(rate => rate - winRate),
        exhausted: result.exhausted || 0,
    };
}

function chiSquareHomogeneity(first, second) {
    if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) return null;
    const firstTotal = first.reduce((sum, value) => sum + value, 0);
    const secondTotal = second.reduce((sum, value) => sum + value, 0);
    const grandTotal = firstTotal + secondTotal;
    if (firstTotal <= 0 || secondTotal <= 0 || grandTotal <= 0) return null;
    let statistic = 0;
    const expectedCounts = [];
    let observedColumns = 0;
    for (let index = 0; index < first.length; index++) {
        const columnTotal = first[index] + second[index];
        if (columnTotal <= 0) continue;
        observedColumns++;
        const expectedFirst = firstTotal * columnTotal / grandTotal;
        const expectedSecond = secondTotal * columnTotal / grandTotal;
        expectedCounts.push(expectedFirst, expectedSecond);
        statistic += Math.pow(first[index] - expectedFirst, 2) / expectedFirst;
        statistic += Math.pow(second[index] - expectedSecond, 2) / expectedSecond;
    }
    return { statistic, degreesOfFreedom: Math.max(0, observedColumns - 1), expectedCounts };
}

const CHI_SQUARE_05 = Object.freeze({
    1: 3.841, 2: 5.991, 3: 7.815, 4: 9.488, 5: 11.070,
    6: 12.592, 7: 14.067, 8: 15.507, 9: 16.919,
});

function chiSquareUniform(counts) {
    const total = (counts || []).reduce((sum, value) => sum + value, 0);
    if (total <= 0 || counts.length < 2) return null;
    const expected = total / counts.length;
    const statistic = counts.reduce((sum, value) => sum + Math.pow(value - expected, 2) / expected, 0);
    return {
        statistic,
        degreesOfFreedom: counts.length - 1,
        expectedCounts: counts.map(() => expected),
    };
}

function hasAdequateExpectedCounts(result) {
    if (!result || !Array.isArray(result.expectedCounts) || result.expectedCounts.length === 0) return false;
    const belowFive = result.expectedCounts.filter(value => value < 5).length;
    return result.expectedCounts.every(value => value >= 1) &&
        belowFive / result.expectedCounts.length <= 0.2;
}

function isSignificantAt05(result) {
    return !!(result && CHI_SQUARE_05[result.degreesOfFreedom] &&
        result.statistic > CHI_SQUARE_05[result.degreesOfFreedom]);
}

function addBaselineResiduals(entries) {
    const normal = entries.find(entry => entry.target === 'normal');
    return entries.map(entry => {
        const residuals = normal
            ? entry.centeredSeatRates.map((rate, seat) => rate - normal.centeredSeatRates[seat])
            : [];
        const distributionVsNormal = normal && entry.target !== 'normal'
            ? chiSquareHomogeneity(entry.seatWins, normal.seatWins)
            : null;
        const uniformity = chiSquareUniform(entry.seatWins);
        return Object.assign({}, entry, {
            seatWinShares: entry.wins > 0 ? entry.seatWins.map(value => value / entry.wins) : entry.seatWins.map(() => 0),
            residualVsNormal: residuals,
            maxAbsoluteResidualVsNormal: residuals.reduce((max, value) => Math.max(max, Math.abs(value)), 0),
            seatWinUniformity: uniformity,
            seatWinUniformityAdequate: hasAdequateExpectedCounts(uniformity),
            seatWinUniformitySignificant05: hasAdequateExpectedCounts(uniformity) && isSignificantAt05(uniformity),
            seatWinDistributionVsNormal: distributionVsNormal,
            seatWinDistributionVsNormalAdequate: hasAdequateExpectedCounts(distributionVsNormal),
            seatWinDistributionVsNormalSignificant05: hasAdequateExpectedCounts(distributionVsNormal) &&
                isSignificantAt05(distributionVsNormal),
        });
    });
}

function classifySeatEffect(entries) {
    const byTarget = new Map((entries || []).map(entry => [entry.target, entry]));
    const normal = byTarget.get('normal');
    const rl = byTarget.get('rl');
    if (!normal || !rl) return { classification: 'insufficient-baselines', reason: 'rl and normal are required' };
    if (!normal.seatWinUniformityAdequate || !rl.seatWinDistributionVsNormalAdequate) {
        return { classification: 'insufficient-samples', reason: 'expected seat win counts are too sparse' };
    }
    const ruleEvidence = !!normal.seatWinUniformitySignificant05;
    const rlDifferent = !!rl.seatWinDistributionVsNormalSignificant05;
    const jsDifferentTargets = ['weak', 'strong', 'expert'].filter(target => (
        byTarget.get(target) && byTarget.get(target).seatWinDistributionVsNormalSignificant05
    ));
    if (ruleEvidence && !rlDifferent) {
        return { classification: 'rule-dominant', ruleEvidence, rlDifferent, jsDifferentTargets };
    }
    if (rlDifferent && jsDifferentTargets.length < 2) {
        return { classification: 'rl-specific', ruleEvidence, rlDifferent, jsDifferentTargets };
    }
    if (rlDifferent && jsDifferentTargets.length >= 2) {
        return { classification: 'policy-interaction', ruleEvidence, rlDifferent, jsDifferentTargets };
    }
    if (!ruleEvidence && !rlDifferent && jsDifferentTargets.length === 0) {
        return { classification: 'sampling-dominant', ruleEvidence, rlDifferent, jsDifferentTargets };
    }
    return { classification: 'mixed-or-inconclusive', ruleEvidence, rlDifferent, jsDifferentTargets };
}

function compareWinRateIntervals(candidate, baseline) {
    if (!candidate || !baseline || !candidate.winRate95 || !baseline.winRate95) return 'unknown';
    if (candidate.winRate95.high < baseline.winRate95.low) return 'below';
    if (candidate.winRate95.low > baseline.winRate95.high) return 'above';
    return 'overlap';
}

function classifyDifficultyOrder(entries) {
    const byTarget = new Map((entries || []).map(entry => [entry.target, entry]));
    const normal = byTarget.get('normal');
    const strong = byTarget.get('strong');
    const expert = byTarget.get('expert');
    if (!normal || !strong || !expert) {
        return {
            classification: 'insufficient-difficulties',
            reason: 'normal, strong and expert are required',
        };
    }
    const strongVsNormal = compareWinRateIntervals(strong, normal);
    const expertVsNormal = compareWinRateIntervals(expert, normal);
    const expertVsStrong = compareWinRateIntervals(expert, strong);
    const comparisons = { strongVsNormal, expertVsNormal, expertVsStrong };
    if (strongVsNormal === 'below' || expertVsNormal === 'below' || expertVsStrong === 'below') {
        return Object.assign({ classification: 'difficulty-inversion' }, comparisons);
    }
    if (strongVsNormal === 'above' && expertVsStrong === 'above') {
        return Object.assign({ classification: 'fully-ordered' }, comparisons);
    }
    if (strongVsNormal === 'above' && expertVsNormal === 'above') {
        return Object.assign({ classification: 'improved-but-unordered' }, comparisons);
    }
    return Object.assign({ classification: 'order-unproven' }, comparisons);
}

function combineSeatEffectReports(reports) {
    if (!Array.isArray(reports) || reports.length === 0) throw new Error('seat effect reports are required');
    const first = reports[0];
    const entriesByTarget = new Map();
    for (const report of reports) {
        if (report.blocks !== first.blocks || report.playerCount !== first.playerCount ||
            report.modelId !== first.modelId || report.opponents !== first.opponents ||
            report.maxSteps !== first.maxSteps || report.seedPolicy !== first.seedPolicy ||
            JSON.stringify(report.seedRange) !== JSON.stringify(first.seedRange)) {
            throw new Error('seat effect report conditions do not match');
        }
        for (const entry of report.entries || []) entriesByTarget.set(entry.target, entry);
    }
    const entries = addBaselineResiduals([...entriesByTarget.values()]);
    return Object.assign({}, first, {
        entries,
        conclusion: classifySeatEffect(entries),
        difficultyOrder: classifyDifficultyOrder(entries),
    });
}

function evaluateSeatEffects(args, dependencies = {}) {
    if (!Number.isInteger(args.playerCount) || args.playerCount < 2 || args.playerCount > 10) {
        throw new Error('player-count は2〜10で指定してください');
    }
    if (!Number.isInteger(args.blocks) || args.blocks <= 0) {
        throw new Error('blocks は1以上で指定してください');
    }
    let rlModelData = dependencies.rlModelData || null;
    if (args.targets.includes('rl') && !rlModelData) {
        const registry = dependencies.registry || loadRegistry(args.registryPath);
        const model = (registry.models || []).find(entry => entry.id === args.modelId);
        if (!model) throw new Error(`registry に model id がありません: ${args.modelId}`);
        rlModelData = JSON.parse(fs.readFileSync(model.path, 'utf8'));
    }
    const runner = dependencies.runSeries || runSeries;
    const progress = dependencies.progress || (() => {});
    const now = dependencies.now || (() => Number(process.hrtime.bigint()) / 1e6);
    const playerCount = args.playerCount;
    const results = args.targets.map(target => {
        progress({ phase: 'start', difficulty: target, playerCount });
        const startedAt = now();
        const players = [target, ...Array.from({ length: playerCount - 1 }, () => 'normal')];
        const result = runner({
            games: args.blocks * playerCount,
            seed: args.seed,
            maxSteps: args.maxSteps,
            players,
            cpuPurpose: args.cpuPurpose,
            rlModelData,
            seedPolicy: SERIES_SEED_POLICIES.PAIRED_SEATS,
            collectBuildStats: false,
            collectBusinessStats: false,
            includeFinalState: false,
        });
        const summary = Object.assign(summarizeTaggedSubject(target, result, playerCount), {
            elapsedMs: now() - startedAt,
        });
        progress({ phase: 'finish', difficulty: target, playerCount, winRate: summary.winRate });
        return summary;
    });
    const entries = addBaselineResiduals(results);
    return {
        modelId: args.modelId,
        blocks: args.blocks,
        seedRange: [args.seed, args.seed + args.blocks - 1],
        playerCount,
        maxSteps: args.maxSteps,
        seedPolicy: SERIES_SEED_POLICIES.PAIRED_SEATS,
        opponents: 'normal',
        cpuPurpose: args.cpuPurpose,
        entries,
        conclusion: classifySeatEffect(entries),
        difficultyOrder: classifyDifficultyOrder(entries),
    };
}

function renderText(report) {
    const lines = [`blocks=${report.blocks} seeds=${report.seedRange.join('-')} players=${report.playerCount}`];
    if (report.conclusion) {
        lines.push(`conclusion=${report.conclusion.classification} reason=${report.conclusion.reason || '-'}`);
    }
    if (report.difficultyOrder) {
        const order = report.difficultyOrder;
        lines.push(`difficulty=${order.classification} strongVsNormal=${order.strongVsNormal || 'n/a'} ` +
            `expertVsNormal=${order.expertVsNormal || 'n/a'} expertVsStrong=${order.expertVsStrong || 'n/a'}`);
    }
    for (const entry of report.entries) {
        lines.push(`${entry.target}: win=${(entry.winRate * 100).toFixed(1)}% ` +
            `seatGap=${(entry.seatGap * 100).toFixed(1)}pt residualVsNormal=${(entry.maxAbsoluteResidualVsNormal * 100).toFixed(1)}pt ` +
            `seat=${entry.seatWinRates.map(rate => (rate * 100).toFixed(1)).join(',')} ` +
            `chi2VsNormal=${entry.seatWinDistributionVsNormal ? entry.seatWinDistributionVsNormal.statistic.toFixed(2) : 'n/a'} ` +
            `inference=${entry.target === 'normal' ?
                (entry.seatWinUniformityAdequate ? 'adequate' : 'sparse') :
                (entry.seatWinDistributionVsNormalAdequate ? 'adequate' : 'sparse')} ` +
            `exhausted=${entry.exhausted} elapsed=${((entry.elapsedMs || 0) / 1000).toFixed(1)}s`);
    }
    return lines.join('\n');
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const progress = args.format === 'text'
        ? entry => console.error(`${entry.phase} ${entry.difficulty}${entry.candidate ? `/${entry.candidate}` : ''} ${entry.playerCount}p`)
        : () => {};
    const report = args.searchLargeCrowd
        ? evaluateLargeCrowdCandidates(args, { progress })
        : args.inputs.length > 0
        ? combineSeatEffectReports(args.inputs.map(input => JSON.parse(fs.readFileSync(input, 'utf8'))))
        : evaluateSeatEffects(args, { progress });
    if (args.output) fs.writeFileSync(args.output, JSON.stringify(report, null, 2), 'utf8');
    console.log(args.format === 'json'
        ? JSON.stringify(report, null, 2)
        : (args.searchLargeCrowd ? renderLargeCrowdText(report) : renderText(report)));
}

module.exports = {
    DEFAULT_TARGETS,
    LARGE_CROWD_CANDIDATES,
    parseArgs,
    taggedSubjectSeat,
    wilsonInterval,
    summarizeTaggedSubject,
    chiSquareHomogeneity,
    chiSquareUniform,
    isSignificantAt05,
    hasAdequateExpectedCounts,
    addBaselineResiduals,
    classifySeatEffect,
    compareWinRateIntervals,
    classifyDifficultyOrder,
    largeCrowdCandidateOptions,
    evaluateLargeCrowdCandidates,
    renderLargeCrowdText,
    combineSeatEffectReports,
    evaluateSeatEffects,
    renderText,
};
