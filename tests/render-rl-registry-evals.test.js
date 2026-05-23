const assert = require('assert');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    parseCheckpointRank,
    renderRegistryEvals,
    mergeRegistryEvals,
} = require('../scripts/render-rl-registry-evals.js');

runTest('render-rl-registry-evals parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs([
        '--input', 'eval.json',
        '--output', 'out.json',
        '--registry', 'registry.json',
        '--update-registry',
        '--date', '2026-04-20',
    ]);
    assert.strictEqual(args.input, 'eval.json');
    assert.strictEqual(args.output, 'out.json');
    assert.strictEqual(args.registry, 'registry.json');
    assert.strictEqual(args.updateRegistry, true);
    assert.strictEqual(args.date, '2026-04-20');
});

runTest('render-rl-registry-evals は topN id から checkpointRank を読む', () => {
    assert.strictEqual(parseCheckpointRank('run-top3'), 3);
    assert.strictEqual(parseCheckpointRank('run'), null);
});

runTest('render-rl-registry-evals は eval-rl-models 結果を registry 追記候補へ変換する', () => {
    const rendered = renderRegistryEvals([
        {
            id: 'model-top2',
            path: 'models/rl_model/runs/model/best_model.top2.browser.json',
            score: 0.45678912,
            evaluationConfig: { seed: 7, sharedSeeds: true, independentSeeds: false, games: 20, maxSteps: 100 },
            summaries: [
                {
                    opponent: 'weak',
                    games: 20,
                    rlWins: 15,
                    opponentWins: 5,
                    draws: 0,
                    rlWinRate: 0.75,
                    averageTurns: 51.23456,
                    rlSeatWinRates: { first: 0.8, second: 0.7 },
                    rlBuildStats: { passRate: 0.0123456 },
                    rlBusinessStats: { total: 2, skipRate: 0 },
                },
            ],
        },
    ], '2026-04-20');
    assert.strictEqual(rendered[0].id, 'model-top2');
    assert.strictEqual(rendered[0].score, 0.456789);
    assert.strictEqual(rendered[0].eval.checkpointRank, 2);
    assert.strictEqual(rendered[0].eval.gamesPerOpponent, 20);
    assert.strictEqual(rendered[0].eval.evaluationConfig.seed, 7);
    assert.strictEqual(rendered[0].eval.evaluationConfig.sharedSeeds, true);
    assert.strictEqual(rendered[0].eval.opponents.weak.wins, 15);
    assert.strictEqual(rendered[0].eval.opponents.weak.avgTurns, 51.235);
    assert.strictEqual(rendered[0].eval.opponents.weak.passRate, 0.012346);
    assert.strictEqual(rendered[0].eval.opponents.weak.businessTotal, 2);
});

runTest('render-rl-registry-evals は多人数lineup評価を2人用js evalとして変換しない', () => {
    assert.throws(() => {
        renderRegistryEvals([
            {
                id: 'model',
                path: 'models/rl_model/runs/model/best_model.browser.json',
                score: 0.5,
                summaries: [
                    {
                        opponent: 'rl+weak+normal+strong',
                        lineup: ['rl', 'weak', 'normal', 'strong'],
                        games: 20,
                        rlWins: 10,
                        opponentWins: 10,
                        draws: 0,
                        rlWinRate: 0.5,
                        averageTurns: 50,
                    },
                ],
            },
        ], '2026-04-20');
    }, /2人用 eval-rl-models JSON/);
});

runTest('render-rl-registry-evals はopponent名だけの多人数lineup評価も変換しない', () => {
    assert.throws(() => {
        renderRegistryEvals([
            {
                id: 'model',
                path: 'models/rl_model/runs/model/best_model.browser.json',
                score: 0.5,
                summaries: [
                    {
                        opponent: 'rl+normal+strong',
                        games: 20,
                        rlWins: 10,
                        opponentWins: 10,
                        draws: 0,
                        rlWinRate: 0.5,
                        averageTurns: 50,
                    },
                ],
            },
        ], '2026-04-20');
    }, /2人用 eval-rl-models JSON/);
});

runTest('render-rl-registry-evals は registry eval を重複なしで追記する', () => {
    const registry = {
        models: [
            { id: 'model-top2', evals: [] },
        ],
    };
    const rendered = [
        {
            id: 'model-top2',
            score: 0.5,
            eval: {
                date: '2026-04-20',
                type: 'js',
                gamesPerOpponent: 20,
                checkpointRank: 2,
                opponents: { weak: { wins: 15 } },
            },
        },
    ];
    const first = mergeRegistryEvals(registry, rendered);
    const second = mergeRegistryEvals(first.registry, rendered);
    assert.strictEqual(first.stats.appended, 1);
    assert.strictEqual(second.stats.appended, 0);
    assert.strictEqual(second.stats.skippedDuplicates, 1);
    assert.strictEqual(second.registry.models[0].evals.length, 1);
    assert.strictEqual(second.registry.models[0].lastEvalScore, 0.5);
});

runTest('render-rl-registry-evals はseed policyが違う同日評価を重複扱いしない', () => {
    const registry = {
        models: [
            {
                id: 'model-top2',
                evals: [{
                    date: '2026-04-20',
                    type: 'js',
                    gamesPerOpponent: 20,
                    checkpointRank: 2,
                    evaluationConfig: { seed: 1, sharedSeeds: true },
                    opponents: { weak: { wins: 15 } },
                }],
            },
        ],
    };
    const rendered = [{
        id: 'model-top2',
        score: 0.5,
        eval: {
            date: '2026-04-20',
            type: 'js',
            gamesPerOpponent: 20,
            checkpointRank: 2,
            evaluationConfig: { seed: 2, sharedSeeds: true },
            opponents: { weak: { wins: 15 } },
        },
    }];

    const merged = mergeRegistryEvals(registry, rendered);

    assert.strictEqual(merged.stats.appended, 1);
    assert.strictEqual(merged.registry.models[0].evals.length, 2);
});

runTest('render-rl-registry-evals は存在しない model id を拒否する', () => {
    assert.throws(() => {
        mergeRegistryEvals({ models: [] }, [{ id: 'missing', eval: { opponents: {} } }]);
    }, /model id/);
});
