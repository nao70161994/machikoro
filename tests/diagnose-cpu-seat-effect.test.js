const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const {
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
    LARGE_CROWD_CANDIDATES,
    largeCrowdCandidateOptions,
    evaluateLargeCrowdCandidates,
    combineSeatEffectReports,
    evaluateSeatEffects,
} = require('../scripts/diagnose-cpu-seat-effect.js');

runTest('CPU seat診断argsはblock/target/modelを解釈する', () => {
    assert.strictEqual(parseArgs([]).blocks, 100);
    const args = parseArgs(['--blocks', '30', '--seed', '11', '--player-count', '4', '--targets', 'rl,strong', '--model-id', 'm']);
    assert.strictEqual(args.blocks, 30);
    assert.strictEqual(args.seed, 11);
    assert.strictEqual(args.playerCount, 4);
    assert.strictEqual(args.cpuPurpose, 'live');
    assert.deepStrictEqual(args.targets, ['rl', 'strong']);
    assert.strictEqual(args.modelId, 'm');
});

runTest('large-crowd候補は対象難易度だけへ戦略とprofileを投影する', () => {
    const native = LARGE_CROWD_CANDIDATES.find(entry => entry.id === 'native');
    assert.deepStrictEqual(largeCrowdCandidateOptions('strong', native), {
        largeCrowdStrategiesByDifficulty: {
            strong: { buildMode: 'native', rollMode: 'native' },
        },
        playerCountProfileTuningsByDifficulty: {
            strong: { largeCrowd: Object.assign({}, native.profile) },
        },
    });
    const candidate = LARGE_CROWD_CANDIDATES.find(entry => entry.id === 'tempo-core');
    assert.deepStrictEqual(largeCrowdCandidateOptions('strong', candidate), {
        largeCrowdStrategiesByDifficulty: {
            strong: { buildMode: 'normal', rollMode: 'normal' },
        },
        playerCountProfileTuningsByDifficulty: {
            strong: { largeCrowd: Object.assign({}, candidate.profile) },
        },
    });
});

runTest('large-crowd探索は同一seedの全席評価と速度を候補別に集計する', () => {
    let clock = 0;
    const calls = [];
    const report = evaluateLargeCrowdCandidates({
        blocks: 2,
        seed: 7,
        maxSteps: 100,
        cpuPurpose: 'live',
        playerCounts: [8, 10],
        candidateIds: ['native', 'normal-core'],
        difficulties: ['strong', 'expert'],
    }, {
        now: () => (clock += 5),
        runSeries: options => {
            calls.push(options);
            const playerCount = options.players.length;
            return {
                exhausted: 0,
                matchLog: Array.from({ length: options.games }, (_, gameIndex) => ({
                    winnerIndex: gameIndex % playerCount,
                })),
            };
        },
    });

    assert.strictEqual(calls.length, 8);
    assert.ok(calls.every(call => call.cpuPurpose === 'live'));
    assert.ok(calls.every(call => call.seedPolicy === 'paired-seats'));
    assert.deepStrictEqual(report.playerCounts, [8, 10]);
    assert.strictEqual(report.rows.length, 4);
    assert.ok(report.rows.every(row => row.elapsedMs === 5));
    assert.throws(() => evaluateLargeCrowdCandidates(Object.assign({}, parseArgs([]), {
        searchLargeCrowd: true,
        playerCounts: [],
    })), /player-counts/);
    assert.throws(() => evaluateLargeCrowdCandidates(Object.assign({}, parseArgs([]), {
        searchLargeCrowd: true,
        candidateIds: [],
    })), /candidate/);
});

runTest('tagged subjectはlineup循環後の元index 0を追跡する', () => {
    assert.deepStrictEqual(Array.from({ length: 10 }, (_, index) => taggedSubjectSeat(index, 10)), [0, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
});

runTest('seat診断はwinnerIndexから重複difficulty内の個体を集計する', () => {
    const matchLog = Array.from({ length: 20 }, (_, index) => ({
        winnerIndex: index < 10 ? taggedSubjectSeat(index, 10) : 3,
    }));
    const summary = summarizeTaggedSubject('normal', { matchLog, exhausted: 1 }, 10);
    assert.strictEqual(summary.games, 20);
    assert.strictEqual(summary.wins, 11);
    assert.strictEqual(summary.seatGames.every(value => value === 2), true);
    assert.strictEqual(summary.exhausted, 1);
    assert.ok(summary.winRate95.low < summary.winRate);
    assert.ok(summary.winRate95.high > summary.winRate);
});

runTest('Wilson区間は0件と全勝を境界内で返す', () => {
    assert.deepStrictEqual(wilsonInterval(0, 0), { low: 0, high: 0 });
    const interval = wilsonInterval(20, 20);
    assert.ok(interval.low > 0 && interval.high > 0.99 && interval.high <= 1);
});

runTest('baseline residualは平均差を除いた席profile差を返す', () => {
    const entries = addBaselineResiduals([
        { target: 'normal', centeredSeatRates: [0.1, -0.1], wins: 10, seatWins: [6, 4] },
        { target: 'rl', centeredSeatRates: [0.3, -0.3], wins: 20, seatWins: [14, 6] },
    ]);
    assert.deepStrictEqual(entries[1].residualVsNormal, [0.19999999999999998, -0.19999999999999998]);
    assert.ok(Math.abs(entries[1].maxAbsoluteResidualVsNormal - 0.2) < 1e-12);
    assert.deepStrictEqual(entries[1].seatWinShares, [0.7, 0.3]);
    assert.ok(entries[1].seatWinDistributionVsNormal.statistic > 0);
});

runTest('勝利席分布検定は総勝率差を除いたprofile差を測る', () => {
    const sameShape = chiSquareHomogeneity([60, 40], [6, 4]);
    assert.ok(sameShape.statistic < 1e-12);
    const differentShape = chiSquareHomogeneity([90, 10], [5, 5]);
    assert.ok(differentShape.statistic > 5);
    assert.strictEqual(differentShape.degreesOfFreedom, 1);
});

runTest('一様性検定と5%閾値は10席のルール席差を判定する', () => {
    const uniform = chiSquareUniform(Array.from({ length: 10 }, () => 10));
    assert.strictEqual(uniform.statistic, 0);
    assert.strictEqual(isSignificantAt05(uniform), false);
    const biased = chiSquareUniform([30, 20, 10, 10, 10, 5, 5, 5, 3, 2]);
    assert.strictEqual(isSignificantAt05(biased), true);
});

runTest('席分布検定は期待度数の小さい基準を結論から除外する', () => {
    assert.strictEqual(hasAdequateExpectedCounts(chiSquareUniform([10, 10, 10, 10, 10, 10, 10, 10, 10, 10])), true);
    assert.strictEqual(hasAdequateExpectedCounts(chiSquareUniform([0, 0, 0, 1, 0, 0, 0, 0, 0, 0])), false);
    const entries = addBaselineResiduals([
        { target: 'normal', centeredSeatRates: Array(10).fill(0), wins: 100, seatWins: Array(10).fill(10) },
        { target: 'weak', centeredSeatRates: Array(10).fill(0), wins: 1, seatWins: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0] },
    ]);
    assert.strictEqual(entries[1].seatWinDistributionVsNormalAdequate, false);
    assert.strictEqual(entries[1].seatWinDistributionVsNormalSignificant05, false);
});

runTest('席効果分類はルール・RL固有・方策一般・標本誤差を分ける', () => {
    const entry = (target, uniform, different) => ({
        target,
        seatWinUniformityAdequate: true,
        seatWinDistributionVsNormalAdequate: true,
        seatWinUniformitySignificant05: uniform,
        seatWinDistributionVsNormalSignificant05: different,
    });
    assert.strictEqual(classifySeatEffect([entry('normal', true, false), entry('rl', false, false)]).classification, 'rule-dominant');
    assert.strictEqual(classifySeatEffect([entry('normal', false, false), entry('rl', true, true)]).classification, 'rl-specific');
    assert.strictEqual(classifySeatEffect([
        entry('normal', true, false), entry('rl', true, true), entry('weak', true, true), entry('strong', true, true),
    ]).classification, 'policy-interaction');
    assert.strictEqual(classifySeatEffect([
        entry('normal', false, false), entry('rl', false, false), entry('weak', false, false),
    ]).classification, 'sampling-dominant');
});

runTest('難易度順序は95%区間で逆転・順序成立・未確定を分ける', () => {
    const entry = (target, low, high) => ({ target, winRate95: { low, high } });
    assert.strictEqual(compareWinRateIntervals(entry('strong', 0.3, 0.4), entry('normal', 0.1, 0.2)), 'above');
    assert.strictEqual(compareWinRateIntervals(entry('strong', 0.1, 0.2), entry('normal', 0.3, 0.4)), 'below');
    assert.strictEqual(compareWinRateIntervals(entry('strong', 0.15, 0.3), entry('normal', 0.2, 0.4)), 'overlap');
    assert.strictEqual(classifyDifficultyOrder([
        entry('normal', 0.2, 0.25), entry('strong', 0.1, 0.15), entry('expert', 0.26, 0.31),
    ]).classification, 'difficulty-inversion');
    assert.strictEqual(classifyDifficultyOrder([
        entry('normal', 0.1, 0.15), entry('strong', 0.2, 0.25), entry('expert', 0.3, 0.35),
    ]).classification, 'fully-ordered');
    assert.strictEqual(classifyDifficultyOrder([
        entry('normal', 0.1, 0.2), entry('strong', 0.15, 0.25), entry('expert', 0.18, 0.28),
    ]).classification, 'order-unproven');
});

runTest('分割seat診断は同一条件のtargetを結合してnormal残差を再計算する', () => {
    const base = {
        modelId: 'm', blocks: 20, seedRange: [1, 20], playerCount: 10,
        maxSteps: 5000, seedPolicy: 'paired-seats', opponents: 'normal', entries: [],
    };
    const normal = { target: 'normal', centeredSeatRates: [0.1, -0.1], wins: 10, seatWins: [6, 4] };
    const rl = { target: 'rl', centeredSeatRates: [0.3, -0.3], wins: 20, seatWins: [14, 6] };
    const combined = combineSeatEffectReports([
        Object.assign({}, base, { entries: [rl] }),
        Object.assign({}, base, { entries: [normal] }),
    ]);
    assert.deepStrictEqual(combined.entries.map(entry => entry.target), ['rl', 'normal']);
    assert.ok(combined.conclusion);
    assert.ok(Math.abs(combined.entries[0].maxAbsoluteResidualVsNormal - 0.2) < 1e-12);
    assert.throws(() => combineSeatEffectReports([
        base,
        Object.assign({}, base, { blocks: 21 }),
    ]), /conditions do not match/);
    assert.throws(() => combineSeatEffectReports([
        base,
        Object.assign({}, base, { modelId: 'different' }),
    ]), /conditions do not match/);
});

runTest('seat診断は全targetを同じnormal相手・paired方針で評価する', () => {
    const calls = [];
    const report = evaluateSeatEffects({
        blocks: 1,
        seed: 5,
        playerCount: 4,
        maxSteps: 10,
        modelId: 'm',
        registryPath: '',
        targets: ['rl', 'normal'],
    }, {
        registry: { models: [{ id: 'm', path: 'unused' }] },
        rlModelData: {},
        runSeries(options) {
            calls.push(options);
            return { matchLog: Array.from({ length: 4 }, (_, index) => ({ winnerIndex: taggedSubjectSeat(index, 4) })), exhausted: 0 };
        },
    });
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls.every(call => call.games === 4 && call.seedPolicy === 'paired-seats'), true);
    assert.strictEqual(calls.every(call => call.players.slice(1).every(value => value === 'normal')), true);
    assert.strictEqual(calls.every(call => call.collectBuildStats === false && call.collectBusinessStats === false && call.includeFinalState === false), true);
    assert.strictEqual(report.entries.every(entry => entry.winRate === 1), true);
    assert.strictEqual(report.maxSteps, 10);
    assert.strictEqual(report.seedPolicy, 'paired-seats');
});

runTest('JS CPUだけの人数別診断はRL registryを要求しない', () => {
    const report = evaluateSeatEffects({
        blocks: 1,
        seed: 1,
        playerCount: 2,
        maxSteps: 10,
        modelId: 'missing',
        registryPath: 'missing',
        targets: ['normal', 'strong', 'expert'],
    }, {
        runSeries() {
            return { matchLog: [{ winnerIndex: 0 }, { winnerIndex: 1 }], exhausted: 0 };
        },
    });
    assert.strictEqual(report.playerCount, 2);
    assert.strictEqual(report.difficultyOrder.classification, 'order-unproven');
    assert.throws(() => evaluateSeatEffects(Object.assign({}, parseArgs([]), {
        playerCount: 11,
        targets: ['normal'],
    }), { runSeries() {} }), /2〜10/);
});
