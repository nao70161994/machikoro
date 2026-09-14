const fs = require('fs');
const path = require('path');
const {
    strategyDifference,
    summarizeSpecial,
    newSpecialFailures,
    summarizeTargetChoices,
    targetDistributionDistance,
    selectModelPair,
} = require('./review-rl-candidate-screen.js');

const REQUIRED_PLAYER_COUNTS = Object.freeze([3, 4, 5, 10]);

function parseArgs(argv) {
    const args = { inputDir: '', format: 'text', output: '' };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--input-dir') args.inputDir = argv[++i] || '';
        else if (argv[i] === '--format') args.format = argv[++i] || args.format;
        else if (argv[i] === '--output') args.output = argv[++i] || '';
    }
    return args;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function entriesByPlayerCount(source, key) {
    const result = new Map();
    for (const entry of source && source[key] || []) {
        const count = Array.isArray(entry.lineup) ? entry.lineup.length : 0;
        if (count > 0 && !result.has(count)) result.set(count, entry);
    }
    return result;
}

function average(values) {
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function buildPromotionReview(options) {
    if (!options.inputDir) throw new Error('input directory is required');
    const lineups = readJson(path.join(options.inputDir, 'js-lineups-3p4p5p10p.json'));
    const headToHead = readJson(path.join(options.inputDir, 'head-to-head-3p4p5p10p.json'));
    const special = readJson(path.join(options.inputDir, 'special-pending-4p.json'));
    if (!Array.isArray(lineups) || lineups.length !== 2) throw new Error('promotion must contain candidate and baseline lineup results');
    if (!Array.isArray(special) || special.length !== 2) throw new Error('promotion must contain candidate and baseline special results');
    const lineupPair = selectModelPair(lineups, headToHead);
    const specialPair = selectModelPair(special, headToHead);
    const candidate = lineupPair.candidate || {};
    const baseline = lineupPair.baseline || {};
    const candidateLineups = entriesByPlayerCount(candidate, 'summaries');
    const baselineLineups = entriesByPlayerCount(baseline, 'summaries');
    const directEntries = entriesByPlayerCount(headToHead, 'entries');
    const rows = REQUIRED_PLAYER_COUNTS.map(playerCount => {
        const candidateEntry = candidateLineups.get(playerCount);
        const baselineEntry = baselineLineups.get(playerCount);
        const directEntry = directEntries.get(playerCount);
        const candidateGames = Number(candidateEntry && candidateEntry.games || 0);
        const baselineGames = Number(baselineEntry && baselineEntry.games || 0);
        const directGames = Number(directEntry && directEntry.games || 0);
        return {
            playerCount,
            games: Math.min(candidateGames, baselineGames, directGames),
            seatCycleComplete: [candidateGames, baselineGames, directGames].every(games => (
                Number.isSafeInteger(games) && games >= 100 && games % playerCount === 0
            )),
            candidateWinRate: Number(candidateEntry && candidateEntry.rlWinRate || 0),
            baselineWinRate: Number(baselineEntry && baselineEntry.rlWinRate || 0),
            lineupDelta: Number(candidateEntry && candidateEntry.rlWinRate || 0) - Number(baselineEntry && baselineEntry.rlWinRate || 0),
            candidateDirectWinRate: Number(directEntry && directEntry.candidateWinRate || 0),
            baselineDirectWinRate: Number(directEntry && directEntry.baselineWinRate || 0),
            directAdvantage: directEntry && directEntry.directAdvantage || {},
            pairedBlockBootstrap: directEntry && directEntry.pairedBlockBootstrap || {},
            averageTurns: Number(candidateEntry && candidateEntry.averageTurns || 0),
            exhausted: Number(candidateEntry && candidateEntry.exhausted || 0) +
                Number(baselineEntry && baselineEntry.exhausted || 0) + Number(directEntry && directEntry.exhausted || 0),
        };
    });
    const minimumGames = Math.min(...rows.map(row => row.games));
    const stage = minimumGames >= 300 ? 300 : minimumGames >= 100 ? 100 : 0;
    const pairedCoverage = candidate.evaluationConfig && candidate.evaluationConfig.pairedSeats === true &&
        baseline.evaluationConfig && baseline.evaluationConfig.pairedSeats === true && headToHead.pairedSeats === true;
    const runtimeLimitCoverage = candidate.evaluationConfig && candidate.evaluationConfig.maxSteps === 1200 &&
        baseline.evaluationConfig && baseline.evaluationConfig.maxSteps === 1200 && headToHead.maxSteps === 1200;
    const seatCycleCoverage = rows.every(row => row.seatCycleComplete);
    const directCoverage = rows.every(row => (
        Object.prototype.hasOwnProperty.call(row.directAdvantage, 'candidateAdvantageSignificant') &&
        Object.prototype.hasOwnProperty.call(row.directAdvantage, 'baselineAdvantageSignificant')
    ));
    const bootstrapCoverage = rows.every(row => (
        row.pairedBlockBootstrap.valid === true && row.pairedBlockBootstrap.confidenceInterval &&
        Number.isFinite(row.pairedBlockBootstrap.confidenceInterval.lower) &&
        Number.isFinite(row.pairedBlockBootstrap.confidenceInterval.upper)
    ));
    const candidateSpecial = summarizeSpecial(specialPair.candidate);
    const baselineSpecial = summarizeSpecial(specialPair.baseline);
    const candidateTargets = summarizeTargetChoices(candidate);
    const baselineTargets = summarizeTargetChoices(baseline);
    const specialCoverage = candidateSpecial.total > 0 && candidateSpecial.total === baselineSpecial.total;
    const specialRegressionScenarios = newSpecialFailures(candidateSpecial, baselineSpecial);
    const specialRegression = candidateSpecial.passed < baselineSpecial.passed || specialRegressionScenarios.length > 0;
    const exhausted = rows.reduce((sum, row) => sum + row.exhausted, 0);
    const deltas = rows.map(row => row.lineupDelta);
    const averageLineupDelta = average(deltas);
    const minimumLineupDelta = Math.min(...deltas);
    const aggregateDirect = headToHead.totals && headToHead.totals.directAdvantage || {};
    const aggregateDirectCoverage =
        Object.prototype.hasOwnProperty.call(aggregateDirect, 'candidateAdvantageSignificant') &&
        Object.prototype.hasOwnProperty.call(aggregateDirect, 'baselineAdvantageSignificant');
    const anyBaselineSignificant = bootstrapCoverage && rows.some(
        row => row.pairedBlockBootstrap.confidenceInterval.upper < 0.5
    );
    const strategy = strategyDifference(candidate, baseline);
    strategy.targetChoices = targetDistributionDistance(candidateTargets, baselineTargets);
    strategy.materiallyDifferent = strategy.materiallyDifferent || strategy.targetChoices.materiallyDifferent;
    const valid = lineupPair.complete && specialPair.complete && stage > 0 && pairedCoverage && runtimeLimitCoverage && seatCycleCoverage && directCoverage && bootstrapCoverage && aggregateDirectCoverage &&
        specialCoverage && candidateTargets.complete && baselineTargets.complete;
    let recommendation = 'hold-inconclusive';
    const reasons = [];
    if (exhausted > 0) {
        recommendation = 'reject-exhaustion';
        reasons.push('step枯渇が発生した');
    } else if (!valid) {
        recommendation = 'reject-invalid-promotion';
        reasons.push('3p/4p/5p/10pの100戦以上paired-seat証拠が揃っていない');
    } else if (specialRegression) {
        recommendation = 'reject-special-regression';
        reasons.push(`特殊pendingが現行モデルより退行した${specialRegressionScenarios.length > 0 ? `: ${specialRegressionScenarios.join(',')}` : ''}`);
    } else if (anyBaselineSignificant || minimumLineupDelta < -0.10) {
        recommendation = 'reject-player-count-regression';
        reasons.push('少なくとも1つの人数帯で現行モデルから大きく退行した');
    } else {
        const strengthEvidence = rows.some(
            row => row.pairedBlockBootstrap.confidenceInterval.lower > 0.5
        ) && averageLineupDelta >= 0;
        const diversityEvidence = averageLineupDelta >= -0.03 && strategy.materiallyDifferent;
        if (stage >= 300 && strengthEvidence) recommendation = 'adopt-strength';
        else if (stage >= 300 && diversityEvidence) recommendation = 'adopt-diversity';
        else if (stage >= 100 && strengthEvidence) recommendation = 'advance-strength-300';
        else if (stage >= 100 && diversityEvidence) recommendation = 'advance-diversity-300';
        reasons.push(
            recommendation === 'hold-inconclusive'
                ? '採用または次段へ進める強さ・多様性の根拠が不足している'
                : recommendation.includes('strength')
                    ? `${stage}戦段階で全人数帯を維持し、候補の直接優位が確認された`
                    : `${stage}戦段階で強さを維持した異なる戦略が確認された`
        );
    }
    return {
        stage,
        candidate: { id: candidate.id, path: candidate.path, special: candidateSpecial, targets: candidateTargets },
        baseline: { id: baseline.id, path: baseline.path, special: baselineSpecial, targets: baselineTargets },
        minimumGames,
        pairedCoverage,
        runtimeLimitCoverage,
        seatCycleCoverage,
        exhausted,
        averageLineupDelta,
        minimumLineupDelta,
        aggregateDirectAdvantage: aggregateDirect,
        pairedBlockBootstrapCoverage: bootstrapCoverage,
        rows,
        strategy,
        specialRegression,
        specialRegressionScenarios,
        recommendation,
        reasons,
    };
}

function renderText(review) {
    const pct = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
    return [
        `RL candidate promotion: ${review.recommendation} stage=${review.stage}`,
        `candidate=${review.candidate.id} baseline=${review.baseline.id} games>=${review.minimumGames}`,
        `lineupDelta avg=${pct(review.averageLineupDelta)} min=${pct(review.minimumLineupDelta)} exhausted=${review.exhausted}`,
        ...review.rows.map(row => `- ${row.playerCount}p candidate=${pct(row.candidateWinRate)} baseline=${pct(row.baselineWinRate)} delta=${pct(row.lineupDelta)} direct=${pct(row.candidateDirectWinRate)}:${pct(row.baselineDirectWinRate)} turns=${row.averageTurns.toFixed(1)}`),
        `strategy=${review.strategy.candidateProfile || 'unknown'} vs ${review.strategy.baselineProfile || 'unknown'} different=${review.strategy.materiallyDifferent}`,
        `targets=tv:${review.candidate.targets.tv.total}/business:${review.candidate.targets.business.total}/mover:${review.candidate.targets.mover.total} vs tv:${review.baseline.targets.tv.total}/business:${review.baseline.targets.business.total}/mover:${review.baseline.targets.mover.total}`,
        `target-strategy compared=${review.strategy.targetChoices.comparedKinds} maxDistance=${review.strategy.targetChoices.maxDistance.toFixed(3)} different=${review.strategy.targetChoices.materiallyDifferent}`,
        `special=${review.candidate.special.passed}/${review.candidate.special.total} vs ${review.baseline.special.passed}/${review.baseline.special.total}`,
        ...review.reasons.map(reason => `- ${reason}`),
    ].join('\n') + '\n';
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const review = buildPromotionReview(args);
    const output = args.format === 'json' ? JSON.stringify(review, null, 2) + '\n' : renderText(review);
    if (args.output) fs.writeFileSync(args.output, output, 'utf8');
    else process.stdout.write(output);
}

module.exports = { REQUIRED_PLAYER_COUNTS, parseArgs, entriesByPlayerCount, buildPromotionReview, renderText };
