const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');
const {
    buildPromotionReview,
    renderText,
} = require('../scripts/review-rl-candidate-promotion.js');

const PLAYER_COUNTS = Object.freeze([3, 4, 5, 10]);

function modelResult(id, options = {}) {
    const candidate = id === 'candidate';
    const summaries = PLAYER_COUNTS.map((playerCount, index) => {
        const summary = {
            lineup: Array.from({ length: playerCount }, (_, seat) => seat === 0 ? 'rl' : 'normal'),
            games: options.games ?? 120,
            rlWinRate: (candidate ? options.candidateRates : options.baselineRates)?.[index] ?? 0.25,
            averageTurns: 30 + index,
            exhausted: options.exhausted ?? 0,
        };
        if (!options.omitTargetMetrics) {
            summary.rlTargetStats = {
                tv: { total: index + 1, skipped: 0, targetDifficulties: { strong: index + 1 }, targetSeats: { p2: index + 1 } },
                business: { total: 1, skipped: 0, targetDifficulties: { normal: 1 }, targetSeats: { p2: 1 } },
                mover: { total: 0, skipped: 0, targetDifficulties: {}, targetSeats: {} },
            };
        }
        return summary;
    });
    return {
        id,
        path: `${id}.browser.json`,
        buildSignature: {
            cards: (candidate ? ['テレビ局', '出版社'] : ['麦畑', 'パン屋']).map(name => ({ name, count: 1 })),
            landmarks: [{ name: '駅', count: 1 }],
        },
        strategyProfile: {
            primary: candidate ? '攻撃型' : '資産型',
            normalized: candidate
                ? { interaction: 0.8, engine: 0.2, landmarkRush: 0.3 }
                : { interaction: 0.2, engine: 0.8, landmarkRush: 0.3 },
        },
        evaluationConfig: { pairedSeats: options.pairedSeats !== false, maxSteps: options.maxSteps ?? 1200 },
        summaries,
    };
}

function writePromotionFixture(options = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-candidate-promotion-'));
    const candidate = modelResult('candidate', options);
    const baseline = modelResult('baseline', options);
    fs.writeFileSync(path.join(dir, 'js-lineups-3p4p5p10p.json'), JSON.stringify(
        options.reversedOrder ? [baseline, candidate] : [candidate, baseline]
    ));
    const entries = PLAYER_COUNTS.map((playerCount, index) => ({
        lineup: Array.from({ length: playerCount }, (_, seat) => seat === 0 ? 'candidate' : seat === 1 ? 'baseline' : 'strong'),
        games: options.games ?? 120,
        candidateWinRate: options.candidateDirectRate ?? 0.3,
        baselineWinRate: options.baselineDirectRate ?? 0.2,
        averageTurns: 30 + index,
        exhausted: options.exhausted ?? 0,
        directAdvantage: {
            candidateAdvantageSignificant: Boolean(options.candidateSignificant),
            baselineAdvantageSignificant: index === (options.baselineSignificantIndex ?? -1),
        },
        pairedBlockBootstrap: options.omitBootstrap ? undefined : {
            valid: true,
            confidenceInterval: index === (options.baselineSignificantIndex ?? -1)
                ? { lower: 0.2, upper: 0.45 }
                : options.candidateSignificant
                    ? { lower: 0.55, upper: 0.8 }
                    : { lower: 0.4, upper: 0.6 },
        },
    }));
    const directAdvantage = options.omitAggregateDirect ? {} : {
        candidateAdvantageSignificant: Boolean(options.candidateSignificant),
        baselineAdvantageSignificant: Boolean(options.aggregateBaselineSignificant),
    };
    fs.writeFileSync(path.join(dir, 'head-to-head-3p4p5p10p.json'), JSON.stringify({
        candidate: candidate.path,
        baseline: baseline.path,
        pairedSeats: options.pairedSeats !== false,
        maxSteps: options.maxSteps ?? 1200,
        entries,
        totals: {
            exhausted: options.exhausted ?? 0,
            directAdvantage,
        },
    }));
    const candidateSpecial = { path: candidate.path, summary: { passedChecks: options.candidateSpecial ?? 10, totalChecks: 10, failedScenarios: options.candidateFailedScenarios || [] } };
    const baselineSpecial = { path: baseline.path, summary: { passedChecks: options.baselineSpecial ?? 10, totalChecks: 10, failedScenarios: options.baselineFailedScenarios || [] } };
    fs.writeFileSync(path.join(dir, 'special-pending-4p.json'), JSON.stringify(
        options.reversedOrder ? [baselineSpecial, candidateSpecial] : [candidateSpecial, baselineSpecial]
    ));
    return dir;
}

function withFixture(options, callback) {
    const dir = writePromotionFixture(options);
    try {
        callback(buildPromotionReview({ inputDir: dir }));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

runTest('review candidate promotion: 100戦以上の全人数帯直接優位を300戦へ進める', () => {
    withFixture({ games: 120, candidateSignificant: true }, review => {
        assert.strictEqual(review.recommendation, 'advance-strength-300');
        assert.strictEqual(review.stage, 100);
        assert.deepStrictEqual(review.rows.map(row => row.playerCount), PLAYER_COUNTS);
        assert.ok(renderText(review).includes('advance-strength-300'));
    });
});

runTest('review candidate promotion: 勝率sort後もpathで候補と基準を識別する', () => {
    withFixture({ games: 120, reversedOrder: true }, review => {
        assert.strictEqual(review.candidate.id, 'candidate');
        assert.strictEqual(review.baseline.id, 'baseline');
        assert.strictEqual(review.strategy.candidateProfile, '攻撃型');
    });
});

runTest('review candidate promotion: 300戦で強さを維持した別戦略を多様性採用する', () => {
    withFixture({
        games: 300,
        candidateRates: [0.23, 0.24, 0.23, 0.24],
        baselineRates: [0.25, 0.25, 0.25, 0.25],
    }, review => {
        assert.strictEqual(review.recommendation, 'adopt-diversity');
        assert.strictEqual(review.stage, 300);
        assert.strictEqual(review.strategy.materiallyDifferent, true);
    });
});

runTest('review candidate promotion: aggregate direct証拠欠落をfail closedにする', () => {
    withFixture({ games: 120, omitAggregateDirect: true }, review => {
        assert.strictEqual(review.recommendation, 'reject-invalid-promotion');
    });
});

runTest('review candidate promotion: paired block bootstrap証拠欠落をfail closedにする', () => {
    withFixture({ games: 120, candidateSignificant: true, omitBootstrap: true }, review => {
        assert.strictEqual(review.recommendation, 'reject-invalid-promotion');
    });
});

runTest('review candidate promotion: 対象選択指標欠落をfail closedにする', () => {
    withFixture({ games: 120, omitTargetMetrics: true }, review => {
        assert.strictEqual(review.recommendation, 'reject-invalid-promotion');
    });
});

runTest('review candidate promotion: 人数帯・特殊pending・step枯渇の退行を拒否する', () => {
    const cases = [
        [{ baselineSignificantIndex: 2 }, 'reject-player-count-regression'],
        [{ candidateRates: [0.25, 0.25, 0.05, 0.25] }, 'reject-player-count-regression'],
        [{ candidateRates: [0.25, 0.25, 0.14, 0.25], baselineRates: [0.25, 0.25, 0.25, 0.25] }, 'reject-player-count-regression'],
        [{ candidateSpecial: 9, baselineSpecial: 10 }, 'reject-special-regression'],
        [{ candidateSpecial: 9, baselineSpecial: 9, candidateFailedScenarios: ['new-failure'], baselineFailedScenarios: ['old-failure'] }, 'reject-special-regression'],
        [{ exhausted: 1 }, 'reject-exhaustion'],
        [{ games: 99 }, 'reject-invalid-promotion'],
        [{ games: 100 }, 'reject-invalid-promotion'],
        [{ maxSteps: 5000 }, 'reject-invalid-promotion'],
    ];
    for (const [options, expected] of cases) {
        withFixture(options, review => assert.strictEqual(review.recommendation, expected));
    }
});
