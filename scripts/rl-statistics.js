'use strict';

function createDeterministicRandom(seed = 1) {
    let state = Number.isSafeInteger(seed) ? seed >>> 0 : 1;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function percentile(sortedValues, probability) {
    if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null;
    const bounded = Math.max(0, Math.min(1, probability));
    const position = (sortedValues.length - 1) * bounded;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    if (lowerIndex === upperIndex) return sortedValues[lowerIndex];
    const fraction = position - lowerIndex;
    return sortedValues[lowerIndex]
        + (sortedValues[upperIndex] - sortedValues[lowerIndex]) * fraction;
}

// Peter J. Acklam's inverse-normal approximation. Accuracy is ample for
// experiment sizing and keeps the statistics module dependency-free.
function inverseStandardNormal(probability) {
    if (!(probability > 0 && probability < 1)) return null;
    const a = [
        -3.969683028665376e+01,
        2.209460984245205e+02,
        -2.759285104469687e+02,
        1.383577518672690e+02,
        -3.066479806614716e+01,
        2.506628277459239e+00
    ];
    const b = [
        -5.447609879822406e+01,
        1.615858368580409e+02,
        -1.556989798598866e+02,
        6.680131188771972e+01,
        -1.328068155288572e+01
    ];
    const c = [
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e+00,
        -2.549732539343734e+00,
        4.374664141464968e+00,
        2.938163982698783e+00
    ];
    const d = [
        7.784695709041462e-03,
        3.224671290700398e-01,
        2.445134137142996e+00,
        3.754408661907416e+00
    ];
    const lower = 0.02425;
    const upper = 1 - lower;
    if (probability < lower) {
        const q = Math.sqrt(-2 * Math.log(probability));
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
            / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (probability > upper) {
        const q = Math.sqrt(-2 * Math.log(1 - probability));
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
            / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    const q = probability - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
        / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function requiredDecisiveGames(effectDelta, options = {}) {
    const alpha = Number.isFinite(options.alpha) ? options.alpha : 0.05;
    const power = Number.isFinite(options.power) ? options.power : 0.8;
    const baselineShare = Number.isFinite(options.baselineShare) ? options.baselineShare : 0.5;
    const delta = Math.abs(Number(effectDelta));
    if (!(alpha > 0 && alpha < 1) || !(power > 0 && power < 1)
        || !(baselineShare > 0 && baselineShare < 1) || !(delta > 0)) return null;
    const targetShare = Math.min(1 - Number.EPSILON, baselineShare + delta);
    if (!(targetShare > baselineShare)) return null;
    const zAlpha = inverseStandardNormal(1 - alpha / 2);
    const zPower = inverseStandardNormal(power);
    const numerator = zAlpha * Math.sqrt(baselineShare * (1 - baselineShare))
        + zPower * Math.sqrt(targetShare * (1 - targetShare));
    return Math.ceil((numerator / (targetShare - baselineShare)) ** 2);
}

function winnerCounts(entries, candidateName, baselineName) {
    let candidateWins = 0;
    let baselineWins = 0;
    for (const entry of entries) {
        if (entry?.winnerDifficulty === candidateName) candidateWins += 1;
        if (entry?.winnerDifficulty === baselineName) baselineWins += 1;
    }
    const decisiveGames = candidateWins + baselineWins;
    return {
        candidateWins,
        baselineWins,
        decisiveGames,
        candidateShare: decisiveGames > 0 ? candidateWins / decisiveGames : null
    };
}

function groupMatchLogBySeed(matchLog) {
    const grouped = new Map();
    for (const entry of Array.isArray(matchLog) ? matchLog : []) {
        if (!Number.isSafeInteger(entry?.seed)) continue;
        if (!grouped.has(entry.seed)) grouped.set(entry.seed, []);
        grouped.get(entry.seed).push(entry);
    }
    return Array.from(grouped.entries())
        .sort((left, right) => left[0] - right[0])
        .map(([seed, entries]) => ({ seed, entries }));
}

function pairedBlockBootstrap(matchLog, candidateName, baselineName, options = {}) {
    const blocks = groupMatchLogBySeed(matchLog);
    const iterations = Number.isSafeInteger(options.iterations)
        ? Math.max(100, Math.min(100000, options.iterations))
        : 2000;
    const confidence = Number.isFinite(options.confidence)
        ? Math.max(0.5, Math.min(0.999, options.confidence))
        : 0.95;
    const observed = winnerCounts(blocks.flatMap(block => block.entries), candidateName, baselineName);
    if (blocks.length < 2 || observed.candidateShare === null) {
        return {
            valid: false,
            blockCount: blocks.length,
            games: blocks.reduce((total, block) => total + block.entries.length, 0),
            iterations: 0,
            observed,
            confidence,
            confidenceInterval: null,
            statisticallyAboveHalf: false
        };
    }
    const random = createDeterministicRandom(options.seed);
    const samples = [];
    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const selected = [];
        for (let index = 0; index < blocks.length; index += 1) {
            selected.push(...blocks[Math.floor(random() * blocks.length)].entries);
        }
        const counts = winnerCounts(selected, candidateName, baselineName);
        if (counts.candidateShare !== null) samples.push(counts.candidateShare);
    }
    samples.sort((left, right) => left - right);
    const tail = (1 - confidence) / 2;
    const confidenceInterval = samples.length > 0
        ? {
            lower: percentile(samples, tail),
            upper: percentile(samples, 1 - tail)
        }
        : null;
    return {
        valid: samples.length > 0,
        blockCount: blocks.length,
        games: blocks.reduce((total, block) => total + block.entries.length, 0),
        iterations: samples.length,
        observed,
        confidence,
        confidenceInterval,
        statisticallyAboveHalf: confidenceInterval?.lower > 0.5
    };
}

function buildPowerAnalysis(candidateWins, baselineWins, options = {}) {
    const decisiveGames = candidateWins + baselineWins;
    const candidateShare = decisiveGames > 0 ? candidateWins / decisiveGames : null;
    const observedDelta = candidateShare === null ? null : candidateShare - 0.5;
    return {
        decisiveGames,
        candidateShare,
        observedDelta,
        alpha: Number.isFinite(options.alpha) ? options.alpha : 0.05,
        targetPower: Number.isFinite(options.power) ? options.power : 0.8,
        requiredDecisiveGames: observedDelta === null
            ? null
            : requiredDecisiveGames(observedDelta, options)
    };
}

module.exports = {
    buildPowerAnalysis,
    createDeterministicRandom,
    groupMatchLogBySeed,
    inverseStandardNormal,
    pairedBlockBootstrap,
    percentile,
    requiredDecisiveGames,
    winnerCounts
};
