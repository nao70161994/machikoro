const assert = require('assert');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    parseLineups,
    parseNumberList,
    browserPathForRunLabel,
    resolveModelSpecs,
    scoreSummaries,
    buildSignature,
    evaluateModelSpecs,
    evaluationGate,
    renderText,
    renderCsv,
    renderMarkdown,
} = require('../scripts/eval-rl-models.js');

function entry(opponent, winRate, passRate = 0) {
    const games = 10;
    const rlWins = Math.round(games * winRate);
    return {
        opponent,
        lineup: opponent.includes('+') ? opponent.split('+') : ['rl', opponent],
        modelInfo: { stateDim: 145, hiddenSize: 128, numActions: 1580, schemaVersion: 3 },
        result: {
            games,
            wins: { rl: rlWins, [opponent]: games - rlWins },
            averageTurns: 50,
            exhausted: 0,
            matchLog: Array.from({ length: games }, (_, index) => ({
                lineup: ['rl', opponent],
                winnerDifficulty: index < rlWins ? 'rl' : opponent,
            })),
            buildStats: [
                { total: 100, pass: Math.round(100 * passRate), cards: { 'パン屋': 10 }, landmarks: { '駅': 4 } },
                { total: 100, pass: 0, cards: {}, landmarks: {} },
            ],
        },
    };
}

runTest('eval-rl-models parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs([
        '--models', 'a,b',
        '--run-labels', 'run1,run2',
        '--model-paths', 'tmp/a.browser.json,tmp/b.browser.json',
        '--games', '30',
        '--seed', '7',
        '--rank', '3',
        '--run-ranks', '1,2,3',
        '--lineups', 'rl,weak,normal;rl,normal,strong',
        '--csv', 'out.csv',
        '--markdown', 'out.md',
        '--independent-seeds',
    ]);
    assert.deepStrictEqual(args.models, ['a', 'b']);
    assert.deepStrictEqual(args.runLabels, ['run1', 'run2']);
    assert.deepStrictEqual(args.modelPaths, ['tmp/a.browser.json', 'tmp/b.browser.json']);
    assert.strictEqual(args.games, 30);
    assert.strictEqual(args.seed, 7);
    assert.strictEqual(args.rank, 3);
    assert.deepStrictEqual(args.runRanks, [1, 2, 3]);
    assert.deepStrictEqual(args.lineups, [['rl', 'weak', 'normal'], ['rl', 'normal', 'strong']]);
    assert.strictEqual(args.csv, 'out.csv');
    assert.strictEqual(args.markdown, 'out.md');
    assert.strictEqual(args.independentSeeds, true);
});

runTest('eval-rl-models parseArgs は数値 CLI の 0 指定を保持する', () => {
    const args = parseArgs(['--games', '0', '--seed', '0', '--max-steps', '0', '--rank', '0']);
    assert.strictEqual(args.games, 0);
    assert.strictEqual(args.seed, 0);
    assert.strictEqual(args.maxSteps, 0);
    assert.strictEqual(args.rank, 0);
});

runTest('eval-rl-models parseNumberList は rank 配列を解釈する', () => {
    assert.deepStrictEqual(parseNumberList('1,2,3'), [1, 2, 3]);
    assert.deepStrictEqual(parseNumberList('1,x,0,4'), [1, 4]);
});

runTest('eval-rl-models は run-label から rank 別モデルパスを作る', () => {
    assert.strictEqual(
        browserPathForRunLabel('abc', 1),
        'models/rl_model/runs/abc/best_model.browser.json'
    );
    assert.strictEqual(
        browserPathForRunLabel('abc', 3),
        'models/rl_model/runs/abc/best_model.top3.browser.json'
    );
});

runTest('eval-rl-models は registry id と run-label を評価対象へ解決する', () => {
    const specs = resolveModelSpecs(
        { models: ['m1'], runLabels: ['run1'], rank: 2, runRanks: [] },
        { models: [{ id: 'm1', status: 'candidate', path: 'p1.json', style: { label: 'style1' } }] }
    );
    assert.deepStrictEqual(specs.map(spec => spec.id), ['m1', 'run1-top2']);
    assert.strictEqual(specs[0].label, 'style1');
    assert.strictEqual(specs[1].path, 'models/rl_model/runs/run1/best_model.top2.browser.json');
});

runTest('eval-rl-models は run-label の top-k を一括展開する', () => {
    const specs = resolveModelSpecs(
        { models: [], runLabels: ['run1'], rank: 1, runRanks: [1, 2, 3] },
        { models: [] }
    );
    assert.deepStrictEqual(specs.map(spec => spec.id), ['run1', 'run1-top2', 'run1-top3']);
    assert.strictEqual(specs[2].path, 'models/rl_model/runs/run1/best_model.top3.browser.json');
});

runTest('eval-rl-models は任意の model path を評価対象へ解決する', () => {
    const specs = resolveModelSpecs(
        { models: [], runLabels: [], modelPaths: ['tmp/candidate-1250.browser.json'], rank: 1, runRanks: [] },
        { models: [{ id: 'registry-default', status: 'adopted', path: 'default.json' }] }
    );
    assert.deepStrictEqual(specs.map(spec => spec.id), ['candidate-1250.browser']);
    assert.strictEqual(specs[0].source, 'path');
    assert.strictEqual(specs[0].path, 'tmp/candidate-1250.browser.json');
});

runTest('eval-rl-models scoreSummaries は strong を重く見る', () => {
    const score = scoreSummaries([
        { opponent: 'weak', rlWinRate: 1 },
        { opponent: 'normal', rlWinRate: 0.5 },
        { opponent: 'strong', rlWinRate: 0 },
    ]);
    assert.strictEqual(score, (1 + 1 + 0) / 6);
});

runTest('eval-rl-models buildSignature は相手別の構築傾向を集約する', () => {
    const signature = buildSignature([
        {
            rlBuildStats: {
                topCards: [{ name: 'パン屋', count: 10 }, { name: '麦畑', count: 3 }],
                topLandmarks: [{ name: '駅', count: 2 }],
            },
        },
        {
            rlBuildStats: {
                topCards: [{ name: 'パン屋', count: 5 }, { name: '寿司屋', count: 8 }],
                topLandmarks: [{ name: '港', count: 4 }],
            },
        },
    ]);
    assert.strictEqual(signature.cardKey, 'パン屋/寿司屋/麦畑');
    assert.strictEqual(signature.landmarkKey, '港/駅');
});

runTest('eval-rl-models は複数モデルをスコア順に並べる', () => {
    const specs = [
        { id: 'low', label: 'low', path: 'low.json', source: 'test', status: '' },
        { id: 'high', label: 'high', path: 'high.json', source: 'test', status: '' },
    ];
    const results = evaluateModelSpecs(specs, { games: 10, seed: 1, maxSteps: 100, opponents: ['weak', 'normal', 'strong'], lineups: [] }, ({ modelPath }) => {
        if (modelPath === 'high.json') return [entry('weak', 1), entry('normal', 1), entry('strong', 0.5)];
        return [entry('weak', 1), entry('normal', 0), entry('strong', 0)];
    });
    assert.deepStrictEqual(results.map(result => result.id), ['high', 'low']);
    assert.strictEqual(results[0].summaries.length, 3);
    assert.strictEqual(results[0].buildSignature.cardKey, 'パン屋');
});

runTest('eval-rl-models は複数モデルを同一seed scheduleで評価する', () => {
    const specs = [
        { id: 'a', label: 'a', path: 'a.json', source: 'test', status: '' },
        { id: 'b', label: 'b', path: 'b.json', source: 'test', status: '' },
    ];
    const calls = [];

    const results = evaluateModelSpecs(
        specs,
        { games: 10, seed: 5, maxSteps: 100, opponents: ['normal'], lineups: [], independentSeeds: false },
        (options) => {
            calls.push(options);
            return [entry('normal', options.modelPath === 'a.json' ? 0.6 : 0.5)];
        }
    );

    assert.deepStrictEqual(calls.map(call => call.seed), [5, 5]);
    assert.deepStrictEqual(calls.map(call => call.sharedSeeds), [true, true]);
    assert.deepStrictEqual(results.map(result => result.evaluationConfig.seed), [5, 5]);
    assert.deepStrictEqual(results.map(result => result.evaluationConfig.sharedSeeds), [true, true]);
});

runTest('eval-rl-models は明示指定時だけモデルごとにseed windowを分ける', () => {
    const specs = [
        { id: 'a', label: 'a', path: 'a.json', source: 'test', status: '' },
        { id: 'b', label: 'b', path: 'b.json', source: 'test', status: '' },
    ];
    const calls = [];

    evaluateModelSpecs(
        specs,
        { games: 10, seed: 5, maxSteps: 100, opponents: ['normal'], lineups: [], independentSeeds: true },
        (options) => {
            calls.push(options);
            return [entry('normal', 0.5)];
        }
    );

    assert.deepStrictEqual(calls.map(call => call.seed), [5, 105]);
    assert.deepStrictEqual(calls.map(call => call.sharedSeeds), [false, false]);
});

runTest('eval-rl-models は5人以上のlineupを評価へ渡せる', () => {
    const specs = [{ id: 'm1', label: 'm1', path: 'm1.json', source: 'test', status: '' }];
    let called = false;
    const results = evaluateModelSpecs(
        specs,
        {
            games: 10,
            seed: 1,
            maxSteps: 100,
            opponents: ['normal'],
            lineups: [['rl', 'weak', 'normal', 'strong', 'expert']],
        },
        () => {
            called = true;
            return [entry('rl+weak+normal+strong+expert', 0.5)];
        }
    );
    assert.strictEqual(called, true);
    assert.strictEqual(results[0].summaries.length, 1);
});

runTest('eval-rl-models は4人lineupの既存挙動を維持する', () => {
    const specs = [{ id: 'm1', label: 'm1', path: 'm1.json', source: 'test', status: '' }];
    const results = evaluateModelSpecs(
        specs,
        {
            games: 10,
            seed: 1,
            maxSteps: 100,
            opponents: ['normal'],
            lineups: [['rl', 'weak', 'normal', 'strong']],
        },
        () => [entry('rl+weak+normal+strong', 0.5)]
    );
    assert.strictEqual(results.length, 1);
    assert.deepStrictEqual(results[0].summaries[0].lineup, ['rl', 'weak', 'normal', 'strong']);
});

runTest('eval-rl-models renderCsv は集計行を出力する', () => {
    const csv = renderCsv([
        {
            id: 'm1',
            score: 0.5,
            summaries: [
                {
                    opponent: 'weak',
                    games: 10,
                    rlWinRate: 0.8,
                    averageTurns: 50,
                    rlBuildStats: {
                        passRate: 0.1,
                        topCards: [{ name: 'パン屋', count: 10 }],
                        topLandmarks: [{ name: '駅', count: 4 }],
                    },
                    rlBusinessStats: {
                        total: 2,
                        skipRate: 0,
                        topGiveCards: [{ name: '麦畑', count: 2 }],
                        topTakeCards: [{ name: 'パン屋', count: 2 }],
                        topExchanges: [{ name: '麦畑->パン屋', count: 2 }],
                    },
                },
            ],
        },
    ]);
    assert.ok(csv.includes('rank,id,score'));
    assert.ok(csv.includes('buildSignatureCards'));
    assert.ok(csv.includes('m1'));
    assert.ok(csv.includes('パン屋x10'));
    assert.ok(csv.includes('businessTotal'));
    assert.ok(csv.includes('麦畑->パン屋x2'));
});

runTest('eval-rl-models renderText は5人lineupの人数と席別指標を出力する', () => {
    const text = renderText([
        {
            id: 'm1',
            score: 0.4,
            summaries: [
                {
                    opponent: 'rl+weak+normal+strong+expert',
                    lineup: ['rl', 'weak', 'normal', 'strong', 'expert'],
                    games: 5,
                    rlWinRate: 0.4,
                    averageTurns: 24,
                    rlSeatWinRatesByIndex: [1, 0, 0, 1, 0],
                    rlBuildStats: { passRate: 0, topCards: [], topLandmarks: [] },
                },
            ],
        },
    ]);
    assert.ok(text.includes('players=5'));
    assert.ok(text.includes('seat(0=100.0%,1=0.0%,2=0.0%,3=100.0%,4=0.0%)'));
});

runTest('eval-rl-models renderMarkdown は貼り付け用の順位表を出力する', () => {
    const markdown = renderMarkdown([
        {
            id: 'm1',
            score: 0.5,
            summaries: [
                {
                    opponent: 'weak',
                    games: 10,
                    rlWinRate: 0.8,
                    averageTurns: 50.25,
                    rlBuildStats: { passRate: 0.1 },
                },
                {
                    opponent: 'strong',
                    games: 10,
                    rlWinRate: 0.2,
                    averageTurns: 60,
                    rlBuildStats: { passRate: 0 },
                },
            ],
        },
    ]);
    assert.ok(markdown.includes('| rank | id | score | style | opponents | pass | avgTurns |'));
    assert.ok(markdown.includes('- gate: smokeOnly'));
    assert.ok(markdown.includes('not adoption candidates'));
    assert.ok(markdown.includes('`m1`'));
    assert.ok(markdown.includes('weak 80.0%'));
    assert.ok(markdown.includes('strong 20.0%'));
    assert.ok(markdown.includes('weak 10.0%'));
});

runTest('eval-rl-models evaluationGate/renderText は短期評価を smokeOnly と表示する', () => {
    const results = [{
        id: 'm1',
        score: 0.5,
        summaries: [{
            opponent: 'weak',
            games: 20,
            rlWinRate: 0.8,
            averageTurns: 50,
            rlBuildStats: { passRate: 0 },
        }],
    }];
    assert.deepStrictEqual(evaluationGate(results), {
        minGames: 20,
        smokeOnly: true,
        name: 'smokeOnly',
    });
    const text = renderText(results);
    assert.ok(text.includes('gate=smokeOnly'));
    assert.ok(text.includes('not for adoption'));
});

runTest('eval-rl-models evaluationGate は50戦以上を adoptionCandidate と表示する', () => {
    const gate = evaluationGate([{
        summaries: [{ games: 50 }, { games: 100 }],
    }]);
    assert.deepStrictEqual(gate, {
        minGames: 50,
        smokeOnly: false,
        name: 'adoptionCandidate',
    });
});

runTest('eval-rl-models evaluationGate はgames不明を smokeOnly と表示する', () => {
    const gate = evaluationGate([{ summaries: [{}] }]);
    assert.deepStrictEqual(gate, {
        minGames: null,
        smokeOnly: true,
        name: 'smokeOnly',
    });
});
