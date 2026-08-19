'use strict';

const fs = require('fs');
const path = require('path');
const { runSeries, SERIES_SEED_POLICIES } = require('./selfplay.js');
const { parseIntegerOrDefault, parseList } = require('./cli-args.js');
const { loadRegistry } = require('./validate-rl-registry.js');

const DEFAULT_MODEL_ID = 'self-only-4p-h256-lr1e5-5000-seed103';
const DEFAULT_TARGETS = Object.freeze(['rl', 'weak', 'normal', 'strong', 'expert']);

function parseArgs(argv) {
    const args = {
        blocks: 100,
        seed: 1,
        maxSteps: 5000,
        modelId: DEFAULT_MODEL_ID,
        registryPath: path.join(__dirname, '..', 'models', 'rl_model', 'registry.json'),
        targets: DEFAULT_TARGETS.slice(),
        inputs: [],
        output: '',
        format: 'text',
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--blocks') args.blocks = parseIntegerOrDefault(argv[++index], args.blocks);
        else if (arg === '--seed') args.seed = parseIntegerOrDefault(argv[++index], args.seed);
        else if (arg === '--max-steps') args.maxSteps = parseIntegerOrDefault(argv[++index], args.maxSteps);
        else if (arg === '--model-id') args.modelId = argv[++index] || args.modelId;
        else if (arg === '--registry') args.registryPath = argv[++index] || args.registryPath;
        else if (arg === '--targets') args.targets = parseList(argv[++index]);
        else if (arg === '--inputs') args.inputs = parseList(argv[++index]);
        else if (arg === '--output') args.output = argv[++index] || '';
        else if (arg === '--format') args.format = argv[++index] || args.format;
    }
    return args;
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
    return Object.assign({}, first, { entries, conclusion: classifySeatEffect(entries) });
}

function evaluateSeatEffects(args, dependencies = {}) {
    const registry = dependencies.registry || loadRegistry(args.registryPath);
    const model = (registry.models || []).find(entry => entry.id === args.modelId);
    if (!model) throw new Error(`registry に model id がありません: ${args.modelId}`);
    const rlModelData = dependencies.rlModelData || JSON.parse(fs.readFileSync(model.path, 'utf8'));
    const runner = dependencies.runSeries || runSeries;
    const playerCount = 10;
    const results = args.targets.map(target => {
        const players = [target, ...Array.from({ length: playerCount - 1 }, () => 'normal')];
        const result = runner({
            games: args.blocks * playerCount,
            seed: args.seed,
            maxSteps: args.maxSteps,
            players,
            rlModelData,
            seedPolicy: SERIES_SEED_POLICIES.PAIRED_SEATS,
            collectBuildStats: false,
            collectBusinessStats: false,
            includeFinalState: false,
        });
        return summarizeTaggedSubject(target, result, playerCount);
    });
    return {
        modelId: args.modelId,
        blocks: args.blocks,
        seedRange: [args.seed, args.seed + args.blocks - 1],
        playerCount,
        maxSteps: args.maxSteps,
        seedPolicy: SERIES_SEED_POLICIES.PAIRED_SEATS,
        opponents: 'normal',
        entries: addBaselineResiduals(results),
    };
}

function renderText(report) {
    const lines = [`blocks=${report.blocks} seeds=${report.seedRange.join('-')} players=${report.playerCount}`];
    if (report.conclusion) {
        lines.push(`conclusion=${report.conclusion.classification} reason=${report.conclusion.reason || '-'}`);
    }
    for (const entry of report.entries) {
        lines.push(`${entry.target}: win=${(entry.winRate * 100).toFixed(1)}% ` +
            `seatGap=${(entry.seatGap * 100).toFixed(1)}pt residualVsNormal=${(entry.maxAbsoluteResidualVsNormal * 100).toFixed(1)}pt ` +
            `seat=${entry.seatWinRates.map(rate => (rate * 100).toFixed(1)).join(',')} ` +
            `chi2VsNormal=${entry.seatWinDistributionVsNormal ? entry.seatWinDistributionVsNormal.statistic.toFixed(2) : 'n/a'} ` +
            `inference=${entry.target === 'normal' ?
                (entry.seatWinUniformityAdequate ? 'adequate' : 'sparse') :
                (entry.seatWinDistributionVsNormalAdequate ? 'adequate' : 'sparse')} ` +
            `exhausted=${entry.exhausted}`);
    }
    return lines.join('\n');
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const report = args.inputs.length > 0
        ? combineSeatEffectReports(args.inputs.map(input => JSON.parse(fs.readFileSync(input, 'utf8'))))
        : evaluateSeatEffects(args);
    if (args.output) fs.writeFileSync(args.output, JSON.stringify(report, null, 2), 'utf8');
    console.log(args.format === 'json' ? JSON.stringify(report, null, 2) : renderText(report));
}

module.exports = {
    DEFAULT_TARGETS,
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
    combineSeatEffectReports,
    evaluateSeatEffects,
    renderText,
};
