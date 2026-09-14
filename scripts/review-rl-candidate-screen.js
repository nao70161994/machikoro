const fs = require('fs');
const path = require('path');
const { modelIdForPath } = require('./eval-rl-models.js');

function parseArgs(argv) {
    const args = { scope: '', inputDir: '', format: 'text', output: '' };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--scope') args.scope = argv[++i] || '';
        else if (arg === '--input-dir') args.inputDir = argv[++i] || '';
        else if (arg === '--format') args.format = argv[++i] || args.format;
        else if (arg === '--output') args.output = argv[++i] || '';
    }
    return args;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function canonicalModelPath(value) {
    return typeof value === 'string' && value ? path.resolve(value) : '';
}

function auditableModelId(model) {
    const id = String(model && model.id || '');
    const modelPath = String(model && model.path || '');
    const pathName = path.parse(modelPath).name;
    if (id.endsWith('.browser') && pathName === id) {
        return modelIdForPath(modelPath) || id;
    }
    if (id && !/^(?:best_)?model(?:\.top[0-9]+)?\.browser$/.test(id)) return id;
    return modelIdForPath(modelPath) || id;
}

function selectModelPair(entries, identity) {
    const candidatePath = canonicalModelPath(identity && identity.candidate);
    const baselinePath = canonicalModelPath(identity && identity.baseline);
    const candidate = candidatePath
        ? (entries || []).find(entry => canonicalModelPath(entry && entry.path) === candidatePath)
        : null;
    const baseline = baselinePath
        ? (entries || []).find(entry => canonicalModelPath(entry && entry.path) === baselinePath)
        : null;
    return {
        candidate: candidate || null,
        baseline: baseline || null,
        complete: Boolean(candidate && baseline && candidate !== baseline),
    };
}

function modelEvidence(model) {
    const summaries = model && Array.isArray(model.summaries) ? model.summaries : [];
    const schema = summaries.find(summary => summary && summary.modelInfo);
    return {
        sha256: model && model.modelSha256 || '',
        schema: schema ? schema.modelInfo : null,
        evaluationConfig: model && model.evaluationConfig || null,
        training: readTrainingEvidence(model && model.path),
    };
}

function readTrainingEvidence(modelPath) {
    if (!modelPath) return { available: false };
    const parsed = path.parse(modelPath);
    const stem = parsed.name.replace(/\.browser$/, '');
    const candidates = [
        path.join(parsed.dir, `${stem}.meta.json`),
        path.join(parsed.dir, 'best_model.meta.json'),
    ];
    const metadataPath = candidates.find(candidate => fs.existsSync(candidate));
    if (!metadataPath) return { available: false };
    try {
        const metadata = readJson(metadataPath);
        const version = Number.isSafeInteger(metadata.rewardAccrualVersion)
            ? metadata.rewardAccrualVersion
            : 1;
        return {
            available: true,
            metadataPath,
            runLabel: metadata.runLabel || '',
            seed: Number.isSafeInteger(metadata.seed) ? metadata.seed : null,
            game: Number.isSafeInteger(metadata.game) ? metadata.game : null,
            cpuOpponentImpl: metadata.cpuOpponentImpl || '',
            rewardAccrualVersion: version,
            rewardAccrualMethod: metadata.rewardAccrualMethod || 'action-only-legacy-v1',
            rewardConfigSchemaVersion: Number.isSafeInteger(metadata.rewardConfigSchemaVersion)
                ? metadata.rewardConfigSchemaVersion
                : 1,
            rewardConfig: metadata.rewardConfig || null,
            terminalConfig: metadata.terminalConfig || null,
            curriculumConfig: metadata.curriculumConfig || null,
        };
    } catch (error) {
        return {
            available: false,
            metadataPath,
            error: String(error && error.message || error),
        };
    }
}

function topNames(signature, key) {
    const values = signature && Array.isArray(signature[key]) ? signature[key] : [];
    return new Set(values.slice(0, 5).map(entry => entry && entry.name).filter(Boolean));
}

function jaccard(left, right) {
    const union = new Set([...left, ...right]);
    if (union.size === 0) return 1;
    let intersection = 0;
    for (const value of left) if (right.has(value)) intersection += 1;
    return intersection / union.size;
}

function strategyDifference(candidate, baseline) {
    const candidateProfile = candidate && candidate.strategyProfile || {};
    const baselineProfile = baseline && baseline.strategyProfile || {};
    const keys = ['interaction', 'engine', 'landmarkRush'];
    const axisDelta = Object.fromEntries(keys.map(key => [
        key,
        Math.abs(Number(candidateProfile.normalized && candidateProfile.normalized[key] || 0) -
            Number(baselineProfile.normalized && baselineProfile.normalized[key] || 0)),
    ]));
    const cardSimilarity = jaccard(
        topNames(candidate && candidate.buildSignature, 'cards'),
        topNames(baseline && baseline.buildSignature, 'cards')
    );
    const landmarkSimilarity = jaccard(
        topNames(candidate && candidate.buildSignature, 'landmarks'),
        topNames(baseline && baseline.buildSignature, 'landmarks')
    );
    const profileChanged = Boolean(candidateProfile.primary && baselineProfile.primary &&
        candidateProfile.primary !== baselineProfile.primary);
    const maxAxisDelta = Math.max(...Object.values(axisDelta));
    return {
        candidateProfile: candidateProfile.primary || '',
        baselineProfile: baselineProfile.primary || '',
        profileChanged,
        axisDelta,
        maxAxisDelta,
        cardSimilarity,
        landmarkSimilarity,
        materiallyDifferent: profileChanged || maxAxisDelta >= 0.15 || cardSimilarity < 0.6 || landmarkSimilarity < 0.6,
    };
}

function summarizeSpecial(entry) {
    const summary = entry && entry.summary || {};
    return {
        passed: Number(summary.passedChecks || 0),
        total: Number(summary.totalChecks || 0),
        failedScenarios: Array.isArray(summary.failedScenarios) ? summary.failedScenarios.slice() : [],
    };
}

function newSpecialFailures(candidate, baseline) {
    const baselineFailures = new Set(baseline && baseline.failedScenarios || []);
    return (candidate && candidate.failedScenarios || []).filter(name => !baselineFailures.has(name));
}

function summarizeTargetChoices(model) {
    const result = {
        metricCoverage: 0,
        lineups: 0,
        games: 0,
        tv: { total: 0, skipped: 0, targetDifficulties: {}, targetSeats: {} },
        business: { total: 0, skipped: 0, targetDifficulties: {}, targetSeats: {} },
        mover: { total: 0, skipped: 0, targetDifficulties: {}, targetSeats: {} },
    };
    for (const summary of model && model.summaries || []) {
        result.lineups++;
        if (!Object.prototype.hasOwnProperty.call(summary || {}, 'rlTargetStats')) continue;
        result.metricCoverage++;
        result.games += Number(summary.games || 0);
        for (const kind of ['tv', 'business', 'mover']) {
            const source = summary && summary.rlTargetStats && summary.rlTargetStats[kind];
            if (!source) continue;
            result[kind].total += Number(source.total || 0);
            result[kind].skipped += Number(source.skipped || 0);
            for (const key of ['targetDifficulties', 'targetSeats']) {
                for (const [name, count] of Object.entries(source[key] || {})) {
                    result[kind][key][name] = (result[kind][key][name] || 0) + Number(count || 0);
                }
            }
        }
    }
    result.complete = result.lineups > 0 && result.metricCoverage === result.lineups;
    return result;
}

function targetDistributionDistance(candidateTargets, baselineTargets) {
    const kinds = {};
    let maxDistance = 0;
    let comparedKinds = 0;
    for (const kind of ['tv', 'business', 'mover']) {
        const candidate = candidateTargets && candidateTargets[kind] || {};
        const baseline = baselineTargets && baselineTargets[kind] || {};
        const candidateObserved = Math.max(0, Number(candidate.total || 0) - Number(candidate.skipped || 0));
        const baselineObserved = Math.max(0, Number(baseline.total || 0) - Number(baseline.skipped || 0));
        const keys = new Set([
            ...Object.keys(candidate.targetDifficulties || {}),
            ...Object.keys(baseline.targetDifficulties || {}),
        ]);
        let distance = 0;
        const candidateActivity = candidateTargets && candidateTargets.games > 0
            ? Number(candidate.total || 0) / candidateTargets.games
            : 0;
        const baselineActivity = baselineTargets && baselineTargets.games > 0
            ? Number(baseline.total || 0) / baselineTargets.games
            : 0;
        const activityDistance = Math.min(1, Math.abs(candidateActivity - baselineActivity));
        const comparableActivity = Number(candidateTargets && candidateTargets.games || 0) >= 50 &&
            Number(baselineTargets && baselineTargets.games || 0) >= 50 &&
            Number(candidate.total || 0) + Number(baseline.total || 0) >= 5;
        const comparableDistribution = candidateObserved >= 5 && baselineObserved >= 5 && keys.size > 0;
        const comparable = comparableActivity || comparableDistribution;
        if (comparableDistribution) {
            for (const key of keys) {
                const candidateShare = Number(candidate.targetDifficulties && candidate.targetDifficulties[key] || 0) / candidateObserved;
                const baselineShare = Number(baseline.targetDifficulties && baseline.targetDifficulties[key] || 0) / baselineObserved;
                distance += Math.abs(candidateShare - baselineShare) / 2;
            }
        }
        if (comparable) {
            distance = Math.max(distance, comparableActivity ? activityDistance : 0);
            comparedKinds++;
            maxDistance = Math.max(maxDistance, distance);
        }
        kinds[kind] = {
            candidateObserved,
            baselineObserved,
            candidateActivity,
            baselineActivity,
            comparable,
            comparableDistribution,
            distance,
        };
    }
    return {
        kinds,
        comparedKinds,
        maxDistance,
        materiallyDifferent: comparedKinds > 0 && maxDistance >= 0.25,
    };
}

function summaryKey(summary) {
    if (Array.isArray(summary && summary.lineup) && summary.lineup.length > 0) {
        return summary.lineup.join('+');
    }
    return String(summary && summary.opponent || '');
}

function lineupComparison(candidate, baseline) {
    const baselineSummaries = baseline && baseline.summaries || [];
    const baselineByKey = new Map(baselineSummaries.map(summary => [summaryKey(summary), summary]));
    const rows = (candidate && candidate.summaries || []).map(summary => {
        const key = summaryKey(summary);
        const baselineSummary = baselineByKey.get(key);
        const candidateWinRate = Number(summary && summary.rlWinRate || 0);
        const baselineWinRate = Number(baselineSummary && baselineSummary.rlWinRate || 0);
        return { key, candidateWinRate, baselineWinRate, delta: candidateWinRate - baselineWinRate, matched: Boolean(key && baselineSummary) };
    });
    const candidateKeys = new Set(rows.map(row => row.key));
    const baselineKeys = new Set(baselineSummaries.map(summary => summaryKey(summary)));
    const complete = rows.length > 0 && rows.length === baselineSummaries.length &&
        candidateKeys.size === rows.length && baselineKeys.size === baselineSummaries.length &&
        rows.every(row => row.matched) && [...baselineKeys].every(key => candidateKeys.has(key));
    return {
        rows,
        complete,
        minimumDelta: complete ? Math.min(...rows.map(row => row.delta)) : -1,
    };
}

function buildReview(options) {
    const scope = options.scope;
    if (scope !== '2p' && scope !== 'mp') throw new Error('scope must be 2p or mp');
    const inputDir = options.inputDir;
    if (!inputDir) throw new Error('input directory is required');
    const lineupFile = path.join(inputDir, scope === '2p' ? 'js-lineups-2p.json' : 'js-lineups-4p.json');
    const headFile = path.join(inputDir, scope === '2p' ? 'head-to-head-2p.json' : 'head-to-head-4p.json');
    const specialFile = path.join(inputDir, scope === '2p' ? 'special-pending-2p.json' : 'special-pending-4p.json');
    const lineups = readJson(lineupFile);
    const headToHead = readJson(headFile);
    const special = readJson(specialFile);
    if (!Array.isArray(lineups) || lineups.length !== 2) throw new Error('screen must contain candidate and baseline lineup results');
    if (!Array.isArray(special) || special.length !== 2) throw new Error('screen must contain candidate and baseline special results');
    const lineupPair = selectModelPair(lineups, headToHead);
    const specialPair = selectModelPair(special, headToHead);
    const candidate = lineupPair.candidate || {};
    const baseline = lineupPair.baseline || {};
    const candidateSpecial = summarizeSpecial(specialPair.candidate);
    const baselineSpecial = summarizeSpecial(specialPair.baseline);
    const candidateTargets = summarizeTargetChoices(candidate);
    const baselineTargets = summarizeTargetChoices(baseline);
    const lineup = lineupComparison(candidate, baseline);
    const entries = Array.isArray(headToHead.entries) ? headToHead.entries : [];
    const expectedLineups = scope === '2p' ? 4 : 2;
    const lineupCoverage = lineupPair.complete && specialPair.complete && lineups.every(item => (
        item && item.evaluationConfig && item.evaluationConfig.pairedSeats === true &&
        Array.isArray(item.summaries) && item.summaries.length === expectedLineups
    ));
    const runtimeLimitCoverage = lineups.every(item => (
        item && item.evaluationConfig && item.evaluationConfig.maxSteps === 1200
    )) && headToHead.maxSteps === 1200;
    const specialCoverage = candidateSpecial.total > 0 && baselineSpecial.total > 0 &&
        candidateSpecial.total === baselineSpecial.total;
    const gameCounts = [
        ...lineups.flatMap(item => (item.summaries || []).map(summary => Number(summary.games || 0))),
        ...entries.map(entry => Number(entry.games || 0)),
    ];
    const minimumGames = gameCounts.length > 0 && gameCounts.every(Number.isFinite)
        ? Math.min(...gameCounts)
        : 0;
    const pairedPlayerCount = scope === '2p' ? 2 : 4;
    const seatCycleCoverage = gameCounts.length > 0 && gameCounts.every(games => (
        Number.isSafeInteger(games) && games >= 50 && games % pairedPlayerCount === 0
    ));
    const exhausted = lineups.reduce((sum, item) => sum + (item.summaries || []).reduce(
        (entrySum, summary) => entrySum + Number(summary.exhausted || 0), 0
    ), Number(headToHead.totals && headToHead.totals.exhausted || 0));
    const direct = headToHead.totals && headToHead.totals.directAdvantage || {};
    const directCoverage = Object.prototype.hasOwnProperty.call(direct, 'candidateAdvantageSignificant') &&
        Object.prototype.hasOwnProperty.call(direct, 'baselineAdvantageSignificant');
    const bootstrapEntries = entries.map(entry => entry && entry.pairedBlockBootstrap || {});
    const bootstrapCoverage = bootstrapEntries.length > 0 && bootstrapEntries.every(bootstrap => (
        bootstrap.valid === true && bootstrap.confidenceInterval &&
        Number.isFinite(bootstrap.confidenceInterval.lower) &&
        Number.isFinite(bootstrap.confidenceInterval.upper)
    ));
    const bootstrapCandidateAdvantage = bootstrapCoverage && bootstrapEntries.every(
        bootstrap => bootstrap.confidenceInterval.lower > 0.5
    );
    const bootstrapBaselineAdvantage = bootstrapCoverage && bootstrapEntries.some(
        bootstrap => bootstrap.confidenceInterval.upper < 0.5
    );
    const strengthDelta = Number(candidate.score || 0) - Number(baseline.score || 0);
    const strategy = strategyDifference(candidate, baseline);
    strategy.targetChoices = targetDistributionDistance(candidateTargets, baselineTargets);
    strategy.materiallyDifferent = strategy.materiallyDifferent || strategy.targetChoices.materiallyDifferent;
    const specialRegressionScenarios = newSpecialFailures(candidateSpecial, baselineSpecial);
    const specialRegression = candidateSpecial.passed < baselineSpecial.passed || specialRegressionScenarios.length > 0;
    const gateValid = minimumGames >= 50 && seatCycleCoverage && headToHead.pairedSeats === true && entries.length > 0 &&
        lineupCoverage && specialCoverage && directCoverage && bootstrapCoverage &&
        runtimeLimitCoverage && candidateTargets.complete && baselineTargets.complete && lineup.complete;
    let recommendation = 'hold-inconclusive';
    const reasons = [];
    if (exhausted > 0) {
        recommendation = 'reject-exhaustion';
        reasons.push('step枯渇が発生した');
    } else if (!gateValid) {
        recommendation = 'reject-invalid-screen';
        reasons.push('50戦paired-seat条件を満たしていない');
    } else if (specialRegression) {
        recommendation = 'reject-special-regression';
        reasons.push(`特殊pendingが現行モデルより退行した${specialRegressionScenarios.length > 0 ? `: ${specialRegressionScenarios.join(',')}` : ''}`);
    } else if (lineup.minimumDelta < -0.10) {
        recommendation = 'reject-lineup-regression';
        reasons.push('少なくとも1つの対戦条件で現行モデルから10pt超退行した');
    } else if (bootstrapBaselineAdvantage) {
        recommendation = 'reject-strength';
        reasons.push('現行RLの直接優位が95%区間で確認された');
    } else if (bootstrapCandidateAdvantage) {
        recommendation = minimumGames >= 300
            ? 'adopt-strength'
            : minimumGames >= 100
                ? 'advance-strength-300'
                : 'advance-strength-100';
        reasons.push('候補の直接優位が95%区間で確認された');
    } else if (strengthDelta >= -0.05 && strategy.materiallyDifferent) {
        recommendation = minimumGames >= 300
            ? 'adopt-diversity'
            : minimumGames >= 100
                ? 'advance-diversity-300'
                : 'advance-diversity-100';
        reasons.push('強さを概ね維持し、実測戦略差がある');
    } else {
        reasons.push(`${minimumGames}戦では強さ・多様性の採用根拠が不足している`);
    }
    return {
        schemaVersion: 2,
        scope,
        candidate: {
            id: auditableModelId(candidate),
            path: candidate.path,
            ...modelEvidence(candidate),
            score: Number(candidate.score || 0),
            special: candidateSpecial,
            targets: candidateTargets,
        },
        baseline: {
            id: auditableModelId(baseline),
            path: baseline.path,
            ...modelEvidence(baseline),
            score: Number(baseline.score || 0),
            special: baselineSpecial,
            targets: baselineTargets,
        },
        minimumGames,
        runtimeLimitCoverage,
        seatCycleCoverage,
        pairedSeats: headToHead.pairedSeats === true,
        exhausted,
        strengthDelta,
        directAdvantage: direct,
        pairedBlockBootstrap: {
            coverage: bootstrapCoverage,
            candidateAdvantage: bootstrapCandidateAdvantage,
            baselineAdvantage: bootstrapBaselineAdvantage,
            entries: bootstrapEntries,
        },
        strategy,
        specialRegression,
        specialRegressionScenarios,
        lineup,
        recommendation,
        reasons,
    };
}

function renderText(review) {
    const pct = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
    return [
        `RL candidate screen: ${review.recommendation}`,
        `candidate=${review.candidate.id} baseline=${review.baseline.id} games>=${review.minimumGames} paired=${review.pairedSeats}`,
        `score=${pct(review.candidate.score)} vs ${pct(review.baseline.score)} delta=${pct(review.strengthDelta)} exhausted=${review.exhausted}`,
        `strategy=${review.strategy.candidateProfile || 'unknown'} vs ${review.strategy.baselineProfile || 'unknown'} different=${review.strategy.materiallyDifferent}`,
        `targets=tv:${review.candidate.targets.tv.total}/business:${review.candidate.targets.business.total}/mover:${review.candidate.targets.mover.total} vs tv:${review.baseline.targets.tv.total}/business:${review.baseline.targets.business.total}/mover:${review.baseline.targets.mover.total}`,
        `target-strategy compared=${review.strategy.targetChoices.comparedKinds} maxDistance=${review.strategy.targetChoices.maxDistance.toFixed(3)} different=${review.strategy.targetChoices.materiallyDifferent}`,
        `special=${review.candidate.special.passed}/${review.candidate.special.total} vs ${review.baseline.special.passed}/${review.baseline.special.total}`,
        ...review.reasons.map(reason => `- ${reason}`),
    ].join('\n') + '\n';
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const review = buildReview(args);
    const output = args.format === 'json' ? JSON.stringify(review, null, 2) + '\n' : renderText(review);
    if (args.output) fs.writeFileSync(args.output, output, 'utf8');
    else process.stdout.write(output);
}

module.exports = {
    parseArgs,
    jaccard,
    strategyDifference,
    summarizeSpecial,
    newSpecialFailures,
    summarizeTargetChoices,
    targetDistributionDistance,
    auditableModelId,
    lineupComparison,
    modelEvidence,
    readTrainingEvidence,
    selectModelPair,
    buildReview,
    renderText,
};
