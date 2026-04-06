const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const { parseArgs, baseProfileTuning, mutateCrowdTuning, evaluateTuning, trainExpertCrowd } = require(path.join(__dirname, '..', 'scripts', 'train-expert-crowd.js'));
const { loadRuntime } = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));

runTest('train-expert-crowd parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '6', '--rounds', '10', '--candidates', '5', '--seed', '9', '--max-steps', '7000', '--base-preset', 'rush', '--profile', 'crowdNormal', '--format', 'json']);
    assert.strictEqual(args.games, 6);
    assert.strictEqual(args.rounds, 10);
    assert.strictEqual(args.candidates, 5);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.maxSteps, 7000);
    assert.strictEqual(args.basePreset, 'rush');
    assert.strictEqual(args.profile, 'crowdNormal');
    assert.strictEqual(args.format, 'json');
});

runTest('baseProfileTuning は crowdNormal でも crowd の既定 tuning を返す', () => {
    const runtime = loadRuntime();
    const tuning = baseProfileTuning(runtime, 'crowdNormal');
    assert.strictEqual(typeof tuning.stableIncomeWeight, 'number');
    assert.strictEqual(typeof tuning.lookaheadWeight, 'number');
});

runTest('mutateCrowdTuning は crowd tuning を数値範囲内で変異させる', () => {
    const base = {
        stableIncomeWeight: 2.7,
        redPressureWeight: 0.4,
        leaderThreatWeight: 0.35,
        landmarkActionBonus: 22,
        lateLandmarkActionBonus: 16,
        lookaheadWeight: 0.48,
    };
    const rng = (() => {
        let i = 0;
        const values = [0.9, 0.1, 0.7, 0.2, 0.8, 0.3, 0.4, 0.6];
        return () => values[i++ % values.length];
    })();
    const mutated = mutateCrowdTuning(base, rng);
    assert.ok(mutated.stableIncomeWeight >= 1.2 && mutated.stableIncomeWeight <= 4.2);
    assert.ok(mutated.lookaheadWeight >= 0.15 && mutated.lookaheadWeight <= 0.8);
    assert.notStrictEqual(mutated.stableIncomeWeight, base.stableIncomeWeight);
});

runTest('evaluateTuning は crowdNormal 条件で expert 勝率を返す', () => {
    const runtime = loadRuntime();
    const result = evaluateTuning({
        runtime,
        games: 1,
        seed: 1,
        maxSteps: 200,
        basePreset: 'default',
        profile: 'crowdNormal',
        tuning: baseProfileTuning(runtime, 'crowdNormal'),
    });
    assert.deepStrictEqual(result.players, ['expert', 'normal', 'normal', 'normal']);
    assert.strictEqual(result.profileKey, 'crowd');
    assert.strictEqual(typeof result.winRate, 'number');
});

runTest('trainExpertCrowd は最良候補と履歴を返す', () => {
    const result = trainExpertCrowd({
        games: 1,
        rounds: 2,
        candidates: 2,
        seed: 1,
        maxSteps: 200,
        basePreset: 'default',
        profile: 'crowdNormal',
    });
    assert.strictEqual(result.profile, 'crowdNormal');
    assert.strictEqual(result.history.length, 3);
    assert.strictEqual(typeof result.best.winRate, 'number');
    assert.deepStrictEqual(result.players, ['expert', 'normal', 'normal', 'normal']);
});
