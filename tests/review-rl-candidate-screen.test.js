const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');
const {
    strategyDifference,
    targetDistributionDistance,
    modelEvidence,
    readTrainingEvidence,
    auditableModelId,
    buildReview,
    renderText,
} = require('../scripts/review-rl-candidate-screen.js');

function modelResult(id, score, profile, cardNames, games = 50) {
    return {
        id,
        path: `${id}.browser.json`,
        modelSha256: `${id}-sha256`,
        score,
        buildSignature: {
            cards: cardNames.map(name => ({ name, count: 1 })),
            landmarks: [{ name: '駅', count: 1 }],
        },
        strategyProfile: {
            primary: profile,
            normalized: { interaction: profile === '攻撃型' ? 0.8 : 0.2, engine: profile === '資産型' ? 0.8 : 0.3, landmarkRush: 0.4 },
        },
        evaluationConfig: { pairedSeats: true, maxSteps: 1200 },
        summaries: [
            { opponent: 'rl+normal+normal+strong', games, rlWinRate: score, exhausted: 0, rlTargetStats: null, modelInfo: { schemaVersion: 3, stateDim: 353 } },
            { opponent: 'rl+strong+strong+strong', games, rlWinRate: score, exhausted: 0, rlTargetStats: null, modelInfo: { schemaVersion: 3, stateDim: 353 } },
        ],
    };
}

function writeScreenFixture(options = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-candidate-review-'));
    const games = options.games ?? 52;
    const candidate = modelResult('candidate', options.candidateScore ?? 0.5, options.candidateProfile || '攻撃型', ['テレビ局', '出版社'], games);
    const baseline = modelResult('baseline', options.baselineScore ?? 0.5, options.baselineProfile || '資産型', ['麦畑', 'パン屋'], games);
    candidate.summaries.forEach((summary, index) => {
        summary.rlWinRate = (options.candidateRates || [candidate.score, candidate.score])[index];
    });
    baseline.summaries.forEach((summary, index) => {
        summary.rlWinRate = (options.baselineRates || [baseline.score, baseline.score])[index];
    });
    const candidateSpecial = { path: candidate.path, summary: { passedChecks: options.candidateSpecial ?? 10, totalChecks: 10, failedScenarios: options.candidateFailedScenarios || [] } };
    const baselineSpecial = { path: baseline.path, summary: { passedChecks: options.baselineSpecial ?? 10, totalChecks: 10, failedScenarios: options.baselineFailedScenarios || [] } };
    fs.writeFileSync(path.join(dir, 'js-lineups-4p.json'), JSON.stringify(options.reversedOrder ? [baseline, candidate] : [candidate, baseline]));
    fs.writeFileSync(path.join(dir, 'special-pending-4p.json'), JSON.stringify(
        options.reversedOrder ? [baselineSpecial, candidateSpecial] : [candidateSpecial, baselineSpecial]
    ));
    fs.writeFileSync(path.join(dir, 'head-to-head-4p.json'), JSON.stringify({
        candidate: candidate.path,
        baseline: baseline.path,
        pairedSeats: options.pairedSeats !== false,
        maxSteps: options.maxSteps ?? 1200,
        entries: [{
            games,
            pairedBlockBootstrap: options.omitBootstrap ? undefined : {
                valid: true,
                confidenceInterval: options.baselineSignificant
                    ? { lower: 0.2, upper: 0.45 }
                    : options.candidateSignificant
                        ? { lower: 0.55, upper: 0.8 }
                        : { lower: 0.4, upper: 0.6 },
            },
        }],
        totals: {
            exhausted: options.exhausted ?? 0,
            directAdvantage: {
                candidateAdvantageSignificant: Boolean(options.candidateSignificant),
                baselineAdvantageSignificant: Boolean(options.baselineSignificant),
                candidateShare: options.candidateShare ?? 0.5,
            },
        },
    }));
    return dir;
}

runTest('review candidate screen: strategyDifference はprofile・軸・建設選好差を検出する', () => {
    const candidate = modelResult('candidate', 0.5, '攻撃型', ['テレビ局', '出版社']);
    const baseline = modelResult('baseline', 0.5, '資産型', ['麦畑', 'パン屋']);
    const result = strategyDifference(candidate, baseline);
    assert.strictEqual(result.profileChanged, true);
    assert.strictEqual(result.materiallyDifferent, true);
    assert.strictEqual(result.cardSimilarity, 0);
});

runTest('review candidate screen: model evidence はSHA・schema・評価条件を保持する', () => {
    const evidence = modelEvidence(modelResult('candidate', 0.5, '攻撃型', ['テレビ局']));
    assert.strictEqual(evidence.sha256, 'candidate-sha256');
    assert.deepStrictEqual(evidence.schema, { schemaVersion: 3, stateDim: 353 });
    assert.strictEqual(evidence.evaluationConfig.maxSteps, 1200);
});

runTest('review candidate screen: 旧成果物の汎用IDだけをrun名へ変換する', () => {
    assert.strictEqual(auditableModelId({
        id: 'model.browser',
        path: 'models/rl_model/runs/strategy-2p-attack-seed223/model.browser.json',
    }), 'strategy-2p-attack-seed223');
    assert.strictEqual(auditableModelId({
        id: 'registered-model',
        path: 'models/rl_model/runs/ignored/model.browser.json',
    }), 'registered-model');
    assert.strictEqual(auditableModelId({
        id: 'seed71-top3.browser',
        path: 'models/rl_model/portfolio/seed71-top3.browser.json',
    }), 'seed71-top3');
});

runTest('review candidate screen: 報酬帰属metadataはv2と旧方式を識別する', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-training-evidence-'));
    const modelPath = path.join(dir, 'model.browser.json');
    const metadataPath = path.join(dir, 'best_model.meta.json');
    try {
        fs.writeFileSync(metadataPath, JSON.stringify({
            runLabel: 'attack-v2',
            seed: 227,
            game: 50,
            rewardAccrualVersion: 2,
            rewardAccrualMethod: 'between-own-decisions-v2',
            rewardConfigSchemaVersion: 2,
            rewardConfig: { opp_coin: 0.008, interaction_build: 0.04 },
            curriculumConfig: {
                lossEpisodeReplayVersion: 1,
                lossEpisodeReplayProbability: 0.25,
                lossEpisodeReplayEpisodes: 3,
                lossEpisodeReplaySteps: 42,
            },
        }));
        const current = readTrainingEvidence(modelPath);
        assert.strictEqual(current.available, true);
        assert.strictEqual(current.rewardAccrualVersion, 2);
        assert.strictEqual(current.rewardConfigSchemaVersion, 2);
        assert.strictEqual(current.rewardConfig.opp_coin, 0.008);
        assert.strictEqual(current.curriculumConfig.lossEpisodeReplayProbability, 0.25);
        assert.strictEqual(current.curriculumConfig.lossEpisodeReplayEpisodes, 3);

        fs.writeFileSync(metadataPath, JSON.stringify({ runLabel: 'attack-legacy', seed: 223 }));
        const legacy = readTrainingEvidence(modelPath);
        assert.strictEqual(legacy.rewardAccrualVersion, 1);
        assert.strictEqual(legacy.rewardAccrualMethod, 'action-only-legacy-v1');
        assert.strictEqual(legacy.rewardConfigSchemaVersion, 1);
        assert.strictEqual(legacy.curriculumConfig, null);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

runTest('review candidate screen: 十分な対象選択サンプルだけを戦略差へ使う', () => {
    const candidate = {
        games: 50,
        tv: { total: 10, skipped: 0, targetDifficulties: { strong: 8, normal: 2 } },
        business: { total: 2, skipped: 0, targetDifficulties: { normal: 2 } },
        mover: { total: 0, skipped: 0, targetDifficulties: {} },
    };
    const baseline = {
        games: 50,
        tv: { total: 10, skipped: 0, targetDifficulties: { strong: 2, normal: 8 } },
        business: { total: 2, skipped: 0, targetDifficulties: { strong: 2 } },
        mover: { total: 0, skipped: 0, targetDifficulties: {} },
    };
    const result = targetDistributionDistance(candidate, baseline);
    assert.strictEqual(result.comparedKinds, 1);
    assert.ok(result.kinds.tv.distance > 0.5);
    assert.strictEqual(result.kinds.business.comparable, false);
    assert.strictEqual(result.materiallyDifferent, true);
});

runTest('review candidate screen: 一方だけが対象効果を頻用する差も戦略差にする', () => {
    const candidate = {
        games: 50,
        tv: { total: 0, skipped: 0, targetDifficulties: {} },
        business: { total: 0, skipped: 0, targetDifficulties: {} },
        mover: { total: 25, skipped: 0, targetDifficulties: { normal: 25 } },
    };
    const baseline = {
        games: 50,
        tv: { total: 0, skipped: 0, targetDifficulties: {} },
        business: { total: 0, skipped: 0, targetDifficulties: {} },
        mover: { total: 0, skipped: 0, targetDifficulties: {} },
    };
    const result = targetDistributionDistance(candidate, baseline);
    assert.strictEqual(result.kinds.mover.comparableDistribution, false);
    assert.strictEqual(result.kinds.mover.distance, 0.5);
    assert.strictEqual(result.materiallyDifferent, true);
});

runTest('review candidate screen: 直接優位がある候補を100戦へ進める', () => {
    const dir = writeScreenFixture({ candidateSignificant: true });
    try {
        const review = buildReview({ scope: 'mp', inputDir: dir });
        assert.strictEqual(review.recommendation, 'advance-strength-100');
        assert.strictEqual(review.minimumGames, 52);
        assert.strictEqual(review.exhausted, 0);
        assert.ok(renderText(review).includes('advance-strength-100'));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

runTest('review candidate screen: 勝率sort後もpathで候補と基準を識別する', () => {
    const dir = writeScreenFixture({ reversedOrder: true, candidateScore: 0.2, baselineScore: 0.6 });
    try {
        const review = buildReview({ scope: 'mp', inputDir: dir });
        assert.strictEqual(review.candidate.id, 'candidate');
        assert.strictEqual(review.baseline.id, 'baseline');
        assert.strictEqual(review.strategy.candidateProfile, '攻撃型');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

runTest('review candidate screen: 現行直接優位・特殊退行・50戦未満をfail closedにする', () => {
    const cases = [
        [{ baselineSignificant: true }, 'reject-strength'],
        [{ candidateSpecial: 9, baselineSpecial: 10 }, 'reject-special-regression'],
        [{ candidateSpecial: 9, baselineSpecial: 9, candidateFailedScenarios: ['new-failure'], baselineFailedScenarios: ['old-failure'] }, 'reject-special-regression'],
        [{ games: 49 }, 'reject-invalid-screen'],
        [{ games: 50 }, 'reject-invalid-screen'],
        [{ maxSteps: 5000 }, 'reject-invalid-screen'],
        [{ exhausted: 1 }, 'reject-exhaustion'],
        [{ candidateRates: [0.5, 0.14], baselineRates: [0.5, 0.25] }, 'reject-lineup-regression'],
    ];
    for (const [options, expected] of cases) {
        const dir = writeScreenFixture(options);
        try {
            assert.strictEqual(buildReview({ scope: 'mp', inputDir: dir }).recommendation, expected);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }
});

runTest('review candidate screen: 不完全なlineup・special・direct証拠をfail closedにする', () => {
    const dir = writeScreenFixture();
    try {
        const lineupsPath = path.join(dir, 'js-lineups-4p.json');
        const lineups = JSON.parse(fs.readFileSync(lineupsPath, 'utf8'));
        lineups[0].summaries = [];
        fs.writeFileSync(lineupsPath, JSON.stringify(lineups));
        assert.strictEqual(buildReview({ scope: 'mp', inputDir: dir }).recommendation, 'reject-invalid-screen');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

runTest('review candidate screen: paired block bootstrap証拠欠落をfail closedにする', () => {
    const dir = writeScreenFixture({ candidateSignificant: true, omitBootstrap: true });
    try {
        assert.strictEqual(buildReview({ scope: 'mp', inputDir: dir }).recommendation, 'reject-invalid-screen');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

runTest('review candidate screen: 強さを5pt以内で維持した別戦略を100戦へ進める', () => {
    const dir = writeScreenFixture({ candidateScore: 0.46, baselineScore: 0.5 });
    try {
        const review = buildReview({ scope: 'mp', inputDir: dir });
        assert.strictEqual(review.recommendation, 'advance-diversity-100');
        assert.strictEqual(review.strategy.materiallyDifferent, true);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

runTest('review candidate screen: 100戦と300戦で次段階・採用を区別する', () => {
    const cases = [
        [100, 'advance-strength-300'],
        [300, 'adopt-strength'],
    ];
    for (const [games, expected] of cases) {
        const dir = writeScreenFixture({ games, candidateSignificant: true });
        try {
            assert.strictEqual(buildReview({ scope: 'mp', inputDir: dir }).recommendation, expected);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }
});
