const assert = require('assert');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    parseCheckpointRank,
    renderRegistryEvals,
} = require('../scripts/render-rl-registry-evals.js');

runTest('render-rl-registry-evals parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs(['--input', 'eval.json', '--output', 'out.json', '--date', '2026-04-20']);
    assert.strictEqual(args.input, 'eval.json');
    assert.strictEqual(args.output, 'out.json');
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
    assert.strictEqual(rendered[0].eval.opponents.weak.wins, 15);
    assert.strictEqual(rendered[0].eval.opponents.weak.avgTurns, 51.235);
    assert.strictEqual(rendered[0].eval.opponents.weak.passRate, 0.012346);
    assert.strictEqual(rendered[0].eval.opponents.weak.businessTotal, 2);
});
