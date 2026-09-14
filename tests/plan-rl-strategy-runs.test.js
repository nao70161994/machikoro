'use strict';

const assert = require('assert');
const {
    DEFAULT_STRATEGY_PROFILE_TAG,
    SCOPES,
    STRATEGY_FAMILIES,
    buildRunPlan,
    commandText,
} = require('../scripts/plan-rl-strategy-runs');
const { runTest } = require('./helpers/test-utils');

runTest('RL strategy planは6戦略・2scope・各3seedを衝突なしで生成する', () => {
    const plan = buildRunPlan({ games: 1000 });
    assert.strictEqual(STRATEGY_FAMILIES.length, 6);
    assert.strictEqual(plan.length, 36);
    assert.strictEqual(new Set(plan.map(run => run.runLabel)).size, plan.length);
    assert.ok(plan.every(run => run.tag === DEFAULT_STRATEGY_PROFILE_TAG));
    assert.ok(plan.every(run => run.runLabel.endsWith(`-${DEFAULT_STRATEGY_PROFILE_TAG}`)));
    assert.deepStrictEqual([...new Set(plan.map(run => run.family))].sort(), [
        'attack', 'comeback', 'commercial-engine', 'disruption-resistance', 'harbor', 'landmark-rush',
    ]);
    assert.deepStrictEqual([...new Set(plan.map(run => run.scope))].sort(), ['2p', 'mp']);
    assert.ok(plan.every(run => run.args.includes('js-oracle')));
    assert.ok(plan.every(run => run.args.includes('--pool-update-every')));
    assert.ok(plan.every(run => run.args.includes('--self-learn-both-sides')));
    assert.ok(plan.every(run => commandText(run).includes('--loss-episode-replay-probability 0.25')));
    assert.ok(plan.every(run => run.args.includes('--pending-curriculum-samples')));
    assert.ok(plan.every(run => run.args.includes('--target-head-lr')));
    assert.ok(plan.every(run => commandText(run).includes('--progress-every 10')));
    assert.ok(plan.every(run => commandText(run).includes('--imitation-progress-every 10')));
    assert.ok(plan.every(run => commandText(run).includes(`--best-checkpoint ${run.runDir}/best_model`)));
    assert.ok(plan.every(run => commandText(run).includes('--best-checkpoint-top-k 3')));
    assert.ok(plan.every(run => commandText(run).includes(`--metrics-csv ${run.runDir}/train_metrics.csv`)));
    assert.ok(plan.every(run => commandText(run).includes(`--summary-output ${run.runDir}/summary.json`)));
});

runTest('RL strategy planは固定採用baselineとscope別人数を使う', () => {
    const twoPlayer = buildRunPlan({ family: 'attack', scope: '2p', games: 50 });
    const multiplayer = buildRunPlan({ family: 'attack', scope: 'mp', games: 50 });
    assert.deepStrictEqual(twoPlayer.map(run => run.seed), Array.from(SCOPES['2p'].seeds));
    assert.deepStrictEqual(multiplayer.map(run => run.seed), Array.from(SCOPES.mp.seeds));
    assert.ok(twoPlayer.every(run => run.baseline.includes('seed71')));
    assert.ok(multiplayer.every(run => run.baseline.includes('seed103')));
    assert.ok(twoPlayer.every(run => commandText(run).includes('--player-count 2')));
    assert.ok(multiplayer.every(run => commandText(run).includes('--player-counts 3,4,5,10')));
    assert.ok(twoPlayer.every(run => commandText(run).includes('--progress-every 1')));
    assert.ok(twoPlayer.every(run => commandText(run).includes('--js-eval-games 2')));
    assert.ok(twoPlayer.every(run => commandText(run).includes('--final-eval-random-games 5')));
    assert.ok(twoPlayer.every(run => commandText(run).includes('--final-eval-heuristic-games 3')));
    const longRuns = buildRunPlan({ family: 'attack', scope: '2p', games: 1000 });
    assert.ok(longRuns.every(run => !commandText(run).includes('--final-eval-random-games')));
    assert.ok(longRuns.every(run => commandText(run).includes('--js-eval-games 10')));
});

runTest('RL strategy planは戦略固有の建設報酬と標準以上のランドマーク報酬を使う', () => {
    const commandFor = family => commandText(buildRunPlan({ family, scope: '2p', seed: 211 })[0]);
    assert.ok(commandFor('attack').includes('--reward-interaction-build 0.04'));
    assert.ok(commandFor('harbor').includes('--reward-harbor-build 0.04'));
    assert.ok(commandFor('commercial-engine').includes('--reward-engine-build 0.02'));
    const landmarkReward = Number(commandFor('landmark-rush').match(/--reward-landmark ([0-9.]+)/)[1]);
    assert.ok(landmarkReward > 0.2);
});

runTest('RL strategy planは未知family/scopeをfail closedにする', () => {
    assert.throws(() => buildRunPlan({ family: 'unknown' }), /unknown/);
    assert.throws(() => buildRunPlan({ scope: '10p' }), /unknown/);
    assert.throws(() => buildRunPlan({ seed: 211 }), /requires --scope/);
    assert.throws(() => buildRunPlan({ scope: '2p', seed: 311 }), /unknown RL strategy seed/);
});

runTest('RL strategy planはscope内の指定seedだけを生成する', () => {
    const plan = buildRunPlan({ family: 'commercial-engine', scope: '2p', seed: 223, games: 50 });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0].seed, 223);
    assert.strictEqual(
        plan[0].runLabel,
        'strategy-2p-commercial-engine-seed223-rewardv2-build-lossreplay-v1'
    );
});

runTest('RL strategy planは学習方式tagを付けて既存seed成果物との衝突を避ける', () => {
    const plan = buildRunPlan({
        family: 'attack', scope: '2p', seed: 227, games: 1000, tag: 'rewardv2-long1000',
    });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0].tag, 'rewardv2-long1000');
    assert.strictEqual(plan[0].runLabel, 'strategy-2p-attack-seed227-rewardv2-long1000');
    assert.ok(commandText(plan[0]).includes('--run-label strategy-2p-attack-seed227-rewardv2-long1000'));
    assert.throws(() => buildRunPlan({ scope: '2p', tag: '../overwrite' }), /unsafe/);
});
