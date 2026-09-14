const assert = require('assert');
const { runTest } = require('./helpers/test-utils');

const {
    parseDirectLineups,
    parseArgs,
    wilsonInterval,
    directAdvantage,
    evaluateHeadToHead,
    renderText,
} = require('../scripts/eval-rl-head-to-head.js');

const model = { stateDim: 353 };

runTest('eval-rl-head-to-head はCLIとlineupを解釈する', () => {
    const args = parseArgs([
        '--candidate', 'candidate.json',
        '--baseline', 'baseline.json',
        '--games', '100',
        '--seed', '7',
        '--lineups', 'candidate,baseline;candidate,baseline,normal,strong',
        '--progress-every', '10',
        '--abort-on-exhaustion',
        '--bootstrap-iterations', '750',
        '--output', 'out.json',
    ]);
    assert.strictEqual(args.candidate, 'candidate.json');
    assert.strictEqual(args.baseline, 'baseline.json');
    assert.strictEqual(args.games, 100);
    assert.strictEqual(args.seed, 7);
    assert.deepStrictEqual(args.lineups[1], ['candidate', 'baseline', 'normal', 'strong']);
    assert.strictEqual(args.output, 'out.json');
    assert.strictEqual(args.progressEvery, 10);
    assert.strictEqual(args.abortOnExhaustion, true);
    assert.strictEqual(args.bootstrapIterations, 750);
    assert.throws(() => parseDirectLineups('candidate,normal'), /exactly once/);
});

runTest('eval-rl-head-to-head はWilson 95%区間で直接優位を判定する', () => {
    const dominant = directAdvantage(80, 20);
    assert.strictEqual(dominant.decisiveGames, 100);
    assert.strictEqual(dominant.candidateShare, 0.8);
    assert.strictEqual(dominant.candidateAdvantageSignificant, true);
    assert.ok(dominant.confidence95.lower > 0.7);
    const tied = directAdvantage(50, 50);
    assert.strictEqual(tied.candidateAdvantageSignificant, false);
    assert.strictEqual(tied.baselineAdvantageSignificant, false);
    assert.deepStrictEqual(wilsonInterval(0, 0), { lower: 0, upper: 1, center: 0.5, trials: 0 });
});

runTest('eval-rl-head-to-head は同一対局の勝敗・席差・枯渇を集計する', () => {
    const calls = [];
    const report = evaluateHeadToHead({
        candidate: 'candidate.json',
        baseline: 'baseline.json',
        candidateModel: model,
        baselineModel: model,
        games: 4,
        seed: 10,
        maxSteps: 5000,
        pairedSeats: true,
        progressEvery: 2,
        abortOnExhaustion: true,
        onProgress: () => {},
        lineups: [['candidate', 'baseline', 'normal', 'strong']],
    }, options => {
        calls.push(options);
        return {
            games: 4,
            wins: { 'rl-candidate': 2, 'rl-baseline': 1, normal: 1, strong: 0 },
            averageTurns: 60,
            exhausted: 0,
            matchLog: [
                { seed: 10, lineup: ['rl-candidate', 'rl-baseline', 'normal', 'strong'], winnerDifficulty: 'rl-candidate' },
                { seed: 10, lineup: ['rl-baseline', 'normal', 'strong', 'rl-candidate'], winnerDifficulty: 'rl-baseline' },
                { seed: 10, lineup: ['normal', 'strong', 'rl-candidate', 'rl-baseline'], winnerDifficulty: 'normal' },
                { seed: 10, lineup: ['strong', 'rl-candidate', 'rl-baseline', 'normal'], winnerDifficulty: 'rl-candidate' },
            ],
            buildStatsByDifficulty: {
                'rl-candidate': { total: 10, cards: { 'パン屋': 2 }, landmarks: { '駅': 1 } },
                'rl-baseline': { total: 9, cards: { '麦畑': 2 }, landmarks: { '駅': 1 } },
            },
        };
    });
    assert.strictEqual(calls[0].seedPolicy, 'paired-seats');
    assert.strictEqual(calls[0].progressEvery, 2);
    assert.strictEqual(calls[0].abortOnExhaustion, true);
    assert.strictEqual(typeof calls[0].onProgress, 'function');
    assert.deepStrictEqual(calls[0].players, ['rl-candidate', 'rl-baseline', 'normal', 'strong']);
    assert.strictEqual(report.entries[0].candidateWinRate, 0.5);
    assert.strictEqual(report.entries[0].baselineWinRate, 0.25);
    assert.strictEqual(report.entries[0].candidateShareOfRlWins, 2 / 3);
    assert.strictEqual(report.entries[0].directAdvantage.decisiveGames, 3);
    assert.strictEqual(report.entries[0].pairedBlockBootstrap.valid, false);
    assert.strictEqual(report.entries[0].powerAnalysis.decisiveGames, 3);
    assert.strictEqual(report.totals.directAdvantage.candidateShare, 2 / 3);
    assert.strictEqual(report.entries[0].candidateSeats.gap, 1);
    assert.ok(renderText(report).includes('delta=25.0pt'));
});

runTest('eval-rl-head-to-head はpaired seed blockをまとめて再標本化する', () => {
    const report = evaluateHeadToHead({
        candidateModel: model,
        baselineModel: model,
        games: 8,
        seed: 20,
        bootstrapIterations: 500,
        lineups: [['candidate', 'baseline']],
    }, () => ({
        games: 8,
        wins: { 'rl-candidate': 7, 'rl-baseline': 1 },
        averageTurns: 20,
        exhausted: 0,
        matchLog: [
            { seed: 20, winnerDifficulty: 'rl-candidate', lineup: ['rl-candidate', 'rl-baseline'] },
            { seed: 20, winnerDifficulty: 'rl-candidate', lineup: ['rl-baseline', 'rl-candidate'] },
            { seed: 21, winnerDifficulty: 'rl-candidate', lineup: ['rl-candidate', 'rl-baseline'] },
            { seed: 21, winnerDifficulty: 'rl-candidate', lineup: ['rl-baseline', 'rl-candidate'] },
            { seed: 22, winnerDifficulty: 'rl-candidate', lineup: ['rl-candidate', 'rl-baseline'] },
            { seed: 22, winnerDifficulty: 'rl-baseline', lineup: ['rl-baseline', 'rl-candidate'] },
            { seed: 23, winnerDifficulty: 'rl-candidate', lineup: ['rl-candidate', 'rl-baseline'] },
            { seed: 23, winnerDifficulty: 'rl-candidate', lineup: ['rl-baseline', 'rl-candidate'] },
        ],
        buildStatsByDifficulty: {},
    }));
    const bootstrap = report.entries[0].pairedBlockBootstrap;
    assert.strictEqual(bootstrap.valid, true);
    assert.strictEqual(bootstrap.blockCount, 4);
    assert.strictEqual(bootstrap.games, 8);
    assert.ok(renderText(report).includes('pairedBootstrap blocks=4'));
});

runTest('eval-rl-head-to-head はseed 0をpaired評価へそのまま渡す', () => {
    const calls = [];
    evaluateHeadToHead({
        candidateModel: model,
        baselineModel: model,
        games: 2,
        seed: 0,
        lineups: [['candidate', 'baseline']],
    }, options => {
        calls.push(options);
        return {
            games: 2,
            wins: {},
            averageTurns: 0,
            exhausted: 0,
            matchLog: [],
            buildStatsByDifficulty: {},
        };
    });
    assert.strictEqual(calls[0].seed, 0);
});

runTest('eval-rl-head-to-head は2人用モデルを多人数lineupへ入れない', () => {
    assert.throws(() => evaluateHeadToHead({
        candidateModel: { stateDim: 145 },
        baselineModel: { stateDim: 353 },
        games: 4,
        lineups: [['candidate', 'baseline', 'normal']],
    }, () => null), /2-player RL model/);
});
