const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    loadModel,
    RL_EVAL_SIMULATION_MODE,
    assertRlModelLineupCompatible,
    buildRlEvalRunSeriesOptions,
    evaluateRlVsJs,
    summarizeEvaluationEntry,
    printEvaluation,
} = require(path.join(__dirname, '..', 'scripts', 'eval-rl-vs-js.js'));

function buildRlModel(overrides = {}) {
    const stateDim = overrides.stateDim || 145;
    const hiddenSize = 2;
    const numCards = 38;
    const numActions = 1580;
    return {
        formatVersion: 1,
        schemaVersion: 3,
        stateSchema: stateDim === 353 ? 'state-mp-v1' : 'state-2p-v1',
        actionSchema: 'action-flat-v1',
        stateDim,
        hiddenSize,
        numActions,
        numCards,
        numTargetSlots: 10,
        layers: {
            shared: [
                {
                    name: 'shared_0',
                    shape: { input: stateDim, output: hiddenSize },
                    weights: Array.from({ length: stateDim }, () => [0, 0]),
                    bias: [0, 0],
                },
                {
                    name: 'shared_1',
                    shape: { input: hiddenSize, output: hiddenSize },
                    weights: [[0, 0], [0, 0]],
                    bias: [0, 0],
                },
            ],
            policyHead: {
                name: 'policy',
                shape: { input: hiddenSize, output: numActions },
                weights: Array.from({ length: hiddenSize }, () => Array.from({ length: numActions }, () => 0)),
                bias: Array.from({ length: numActions }, () => 0),
            },
            valueHead: {
                name: 'value',
                shape: { input: hiddenSize, output: 1 },
                weights: [[0], [0]],
                bias: [0],
            },
            businessGiveHead: {
                name: 'bc_give',
                shape: { input: hiddenSize, output: numCards },
                weights: Array.from({ length: hiddenSize }, () => Array.from({ length: numCards }, () => 0)),
                bias: Array.from({ length: numCards }, () => 0),
            },
            businessTakeHead: {
                name: 'bc_take',
                shape: { input: hiddenSize, output: numCards },
                weights: Array.from({ length: hiddenSize }, () => Array.from({ length: numCards }, () => 0)),
                bias: Array.from({ length: numCards }, () => 0),
            },
        },
    };
}

runTest('parseArgs は RL vs JS 評価 CLI 引数を解釈する', () => {
    const args = parseArgs(['--model', 'tmp/model.json', '--games', '6', '--seed', '9', '--max-steps', '7000', '--format', 'json', '--shared-seeds', '--opponents', 'strong,expert', '--lineups', 'rl,weak,normal,strong;rl,normal,normal,strong']);
    assert.strictEqual(args.modelPath, 'tmp/model.json');
    assert.strictEqual(args.games, 6);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.maxSteps, 7000);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.sharedSeeds, true);
    assert.deepStrictEqual(args.opponents, ['strong', 'expert']);
    assert.deepStrictEqual(args.lineups, [
        ['rl', 'weak', 'normal', 'strong'],
        ['rl', 'normal', 'normal', 'strong'],
    ]);
});

runTest('parseArgs は --same-seed を sharedSeeds として解釈する', () => {
    const args = parseArgs(['--same-seed']);
    assert.strictEqual(args.sharedSeeds, true);
});

runTest('parseArgs は games/seed/maxSteps の 0 指定を保持する', () => {
    const args = parseArgs(['--games', '0', '--seed', '0', '--max-steps', '0']);

    assert.strictEqual(args.games, 0);
    assert.strictEqual(args.seed, 0);
    assert.strictEqual(args.maxSteps, 0);
});

runTest('eval-rl-vs-js は fast/lite CLI を採用評価へ入れない', () => {
    const args = parseArgs(['--fast', '--lite']);
    assert.strictEqual(args.fast, undefined);
    assert.strictEqual(args.lite, undefined);
    assert.strictEqual(RL_EVAL_SIMULATION_MODE.fast, false);
    assert.strictEqual(RL_EVAL_SIMULATION_MODE.lite, false);
    assert.strictEqual(RL_EVAL_SIMULATION_MODE.lightweightCpuOnly, false);
});

runTest('buildRlEvalRunSeriesOptions は full-fidelity simulator を明示する', () => {
    const options = buildRlEvalRunSeriesOptions({ games: 1, maxSteps: 2 }, ['rl', 'weak'], 7, buildRlModel());
    assert.strictEqual(options.games, 1);
    assert.strictEqual(options.seed, 7);
    assert.strictEqual(options.maxSteps, 2);
    assert.deepStrictEqual(options.players, ['rl', 'weak']);
    assert.strictEqual(options.fast, false);
    assert.strictEqual(options.lite, false);
    assert.strictEqual(options.lightweightCpuOnly, false);
});

runTest('loadModel は export 済み JSON を読み込む', () => {
    const tmpPath = path.join(os.tmpdir(), `machikoro-rl-model-${process.pid}.json`);
    try {
        fs.writeFileSync(tmpPath, JSON.stringify(buildRlModel()), 'utf8');
        const model = loadModel(tmpPath);
        assert.strictEqual(model.stateDim, 145);
        assert.strictEqual(model.numActions, 1580);
    } finally {
        fs.rmSync(tmpPath, { force: true });
    }
});

runTest('assertRlModelLineupCompatible は2人用モデルの3人以上評価を拒否する', () => {
    assert.throws(
        () => assertRlModelLineupCompatible(buildRlModel({ stateDim: 145 }), [['rl', 'weak', 'normal']], 'm145'),
        /2-player RL model/
    );
    assert.doesNotThrow(() => assertRlModelLineupCompatible(buildRlModel({ stateDim: 353 }), [['rl', 'weak', 'normal']], 'm353'));
    assert.doesNotThrow(() => assertRlModelLineupCompatible(buildRlModel({ stateDim: 145 }), [['rl', 'weak']], 'm145'));
});

runTest('assertRlModelLineupCompatible は5人以上lineupでも多人数モデルを許可する', () => {
    assert.doesNotThrow(
        () => assertRlModelLineupCompatible(buildRlModel({ stateDim: 353 }), [['rl', 'weak', 'normal', 'strong', 'expert']], 'm353')
    );
});

runTest('evaluateRlVsJs は opponent ごとの 2人戦結果を返す', () => {
    const result = evaluateRlVsJs({
        games: 1,
        seed: 1,
        maxSteps: 200,
        opponents: ['weak', 'normal'],
        rlModelData: buildRlModel(),
    });
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].opponent, 'weak');
    assert.deepStrictEqual(result[0].result.players, ['rl', 'weak']);
    assert.strictEqual(result[1].opponent, 'normal');
    assert.deepStrictEqual(result[1].result.players, ['rl', 'normal']);
    assert.strictEqual(result[0].modelInfo.stateDim, 145);
    assert.strictEqual(result[0].modelInfo.stateSchema, 'state-2p-v1');
    assert.strictEqual(result[0].modelInfo.actionSchema, 'action-flat-v1');
    assert.strictEqual(result[0].modelInfo.numCards, 38);
    assert.strictEqual(result[0].modelInfo.numTargetSlots, 10);
});

runTest('evaluateRlVsJs は games/maxSteps の 0 指定を既定値で上書きしない', () => {
    const result = evaluateRlVsJs({
        games: 0,
        seed: 0,
        maxSteps: 0,
        opponents: ['weak'],
        rlModelData: buildRlModel(),
    });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].result.games, 0);
    assert.deepStrictEqual(result[0].result.matchLog, []);
});

runTest('evaluateRlVsJs は既定で opponent ごとに seed 範囲をずらす', () => {
    const result = evaluateRlVsJs({
        games: 2,
        seed: 11,
        maxSteps: 1,
        opponents: ['weak', 'normal'],
        rlModelData: buildRlModel(),
    });
    assert.deepStrictEqual(result[0].result.matchLog.map(match => match.seed), [11, 12]);
    assert.deepStrictEqual(result[1].result.matchLog.map(match => match.seed), [13, 14]);
});

runTest('evaluateRlVsJs は sharedSeeds 指定時に同じ seed 範囲で opponent を評価する', () => {
    const result = evaluateRlVsJs({
        games: 2,
        seed: 11,
        maxSteps: 1,
        opponents: ['weak', 'normal'],
        sharedSeeds: true,
        rlModelData: buildRlModel(),
    });
    assert.deepStrictEqual(result[0].result.matchLog.map(match => match.seed), [11, 12]);
    assert.deepStrictEqual(result[1].result.matchLog.map(match => match.seed), [11, 12]);
});

runTest('evaluateRlVsJs は4人lineup評価を返す', () => {
    const result = evaluateRlVsJs({
        games: 1,
        seed: 1,
        maxSteps: 200,
        lineups: [['rl', 'weak', 'normal', 'strong']],
        rlModelData: buildRlModel({ stateDim: 353 }),
    });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].opponent, 'rl+weak+normal+strong');
    assert.deepStrictEqual(result[0].lineup, ['rl', 'weak', 'normal', 'strong']);
    assert.deepStrictEqual(result[0].result.players, ['rl', 'weak', 'normal', 'strong']);
});

runTest('summarizeEvaluationEntry は勝率と seat 別指標を返す', () => {
    const summary = summarizeEvaluationEntry({
        opponent: 'expert',
        modelInfo: { stateDim: 145, hiddenSize: 256, numActions: 1580, schemaVersion: 3 },
        result: {
            games: 10,
            wins: { rl: 6, expert: 3 },
            averageTurns: 18.5,
            exhausted: 1,
            matchLog: [
                { lineup: ['rl', 'expert'], winnerDifficulty: 'rl' },
                { lineup: ['expert', 'rl'], winnerDifficulty: 'rl' },
                { lineup: ['rl', 'expert'], winnerDifficulty: 'expert' },
                { lineup: ['expert', 'rl'], winnerDifficulty: 'rl' },
            ],
            buildStatsByDifficulty: {
                rl: { total: 6, pass: 2, cards: { '麦畑': 3 }, landmarks: { '駅': 1 } },
                expert: { total: 3, pass: 1, cards: { 'パン屋': 2 }, landmarks: {} },
            },
            buildStats: [
                { total: 5, pass: 2, cards: { '麦畑': 2, '森林': 1 }, landmarks: { '駅': 1 } },
                { total: 4, pass: 1, cards: { 'パン屋': 2 }, landmarks: {} },
            ],
            businessStats: {
                rl: {
                    total: 2,
                    skipped: 1,
                    targets: { expert: 1 },
                    giveCards: { '麦畑': 1 },
                    takeCards: { 'パン屋': 1 },
                    exchanges: { '麦畑->パン屋': 1 },
                },
            },
        },
    });
    assert.strictEqual(summary.opponent, 'expert');
    assert.strictEqual(summary.rlWins, 6);
    assert.strictEqual(summary.opponentWins, 3);
    assert.strictEqual(summary.draws, 1);
    assert.strictEqual(summary.rlWinRate, 0.6);
    assert.strictEqual(summary.drawRate, 0.1);
    assert.strictEqual(summary.rlSeatWinRates.first, 0.5);
    assert.strictEqual(summary.rlSeatWinRates.second, 1);
    assert.deepStrictEqual(summary.rlSeatWinRatesByIndex, [0.5, 1]);
    assert.deepStrictEqual(summary.rlSeatWinRateRange, { min: 0.5, max: 1, gap: 0.5 });
    assert.strictEqual(summary.rlBuildStats.total, 6);
    assert.strictEqual(summary.rlBuildStats.pass, 2);
    assert.strictEqual(summary.rlBuildStats.passRate, 2 / 6);
    assert.ok(summary.rlBuildStats.topCards.some(entry => entry.name === '麦畑' && entry.count === 3));
    assert.ok(!summary.rlBuildStats.topCards.some(entry => entry.name === 'パン屋'));
    assert.strictEqual(summary.rlBuildStats.topLandmarks[0].name, '駅');
    assert.strictEqual(summary.rlBusinessStats.total, 2);
    assert.strictEqual(summary.rlBusinessStats.skipRate, 0.5);
    assert.strictEqual(summary.rlBusinessStats.topExchanges[0].name, '麦畑->パン屋');
});

runTest('printEvaluation は text 形式で seat 指標を出力する', () => {
    const lines = [];
    const realLog = console.log;
    console.log = (line) => lines.push(line);
    try {
        printEvaluation([{
            opponent: 'strong',
            modelInfo: { stateDim: 145, hiddenSize: 256, numActions: 1580, schemaVersion: 3 },
            result: {
                games: 4,
                wins: { rl: 3, strong: 1 },
                averageTurns: 16,
                exhausted: 0,
                matchLog: [
                    { lineup: ['rl', 'strong'], winnerDifficulty: 'rl' },
                    { lineup: ['strong', 'rl'], winnerDifficulty: 'strong' },
                    { lineup: ['rl', 'strong'], winnerDifficulty: 'rl' },
                    { lineup: ['strong', 'rl'], winnerDifficulty: 'rl' },
                ],
                buildStatsByDifficulty: {
                    rl: { total: 5, pass: 1, cards: { '麦畑': 3 }, landmarks: { '駅': 1 } },
                    strong: { total: 3, pass: 2, cards: { 'パン屋': 1 }, landmarks: {} },
                },
                buildStats: [
                    { total: 4, pass: 1, cards: { '麦畑': 2 }, landmarks: { '駅': 1 } },
                    { total: 4, pass: 2, cards: {}, landmarks: {} },
                ],
                businessStats: {
                    rl: {
                        total: 1,
                        skipped: 0,
                        targets: { strong: 1 },
                        giveCards: { '麦畑': 1 },
                        takeCards: { 'パン屋': 1 },
                        exchanges: { '麦畑->パン屋': 1 },
                    },
                },
            },
        }], { format: 'text' });
    } finally {
        console.log = realLog;
    }
    assert.strictEqual(lines.length, 3);
    assert.ok(lines[0].includes('rl vs strong'));
    assert.ok(lines[0].includes('seat(first=100.0%,second=50.0%)'));
    assert.ok(lines[1].includes('rl-build: total=5 pass=1'));
    assert.ok(lines[1].includes('麦畑x3'));
    assert.ok(lines[2].includes('rl-business: total=1'));
    assert.ok(lines[2].includes('麦畑->パン屋x1'));
});

runTest('printEvaluation は4人lineupの席別指標を出力する', () => {
    const lines = [];
    const realLog = console.log;
    console.log = (line) => lines.push(line);
    try {
        printEvaluation([{
            opponent: 'rl+weak+normal+strong',
            lineup: ['rl', 'weak', 'normal', 'strong'],
            modelInfo: { stateDim: 353, hiddenSize: 256, numActions: 1580, schemaVersion: 3 },
            result: {
                games: 4,
                players: ['rl', 'weak', 'normal', 'strong'],
                wins: { rl: 2, weak: 1, normal: 1, strong: 0 },
                averageTurns: 20,
                exhausted: 0,
                matchLog: [
                    { lineup: ['rl', 'weak', 'normal', 'strong'], winnerDifficulty: 'rl' },
                    { lineup: ['weak', 'normal', 'strong', 'rl'], winnerDifficulty: 'weak' },
                    { lineup: ['normal', 'strong', 'rl', 'weak'], winnerDifficulty: 'rl' },
                    { lineup: ['strong', 'rl', 'weak', 'normal'], winnerDifficulty: 'normal' },
                ],
                buildStats: [
                    { total: 4, pass: 0, cards: {}, landmarks: {} },
                    { total: 4, pass: 0, cards: {}, landmarks: {} },
                    { total: 4, pass: 0, cards: {}, landmarks: {} },
                    { total: 4, pass: 0, cards: {}, landmarks: {} },
                ],
            },
        }], { format: 'text' });
    } finally {
        console.log = realLog;
    }
    assert.ok(lines[0].includes('rl vs rl+weak+normal+strong'));
    assert.ok(lines[0].includes('players=4'));
    assert.ok(lines[0].includes('seat(0=100.0%,1=0.0%,2=100.0%,3=0.0%)'));
});

runTest('printEvaluation は5人lineupの人数と席別指標を出力する', () => {
    const lines = [];
    const realLog = console.log;
    console.log = (line) => lines.push(line);
    try {
        printEvaluation([{
            opponent: 'rl+weak+normal+strong+expert',
            lineup: ['rl', 'weak', 'normal', 'strong', 'expert'],
            modelInfo: { stateDim: 353, hiddenSize: 256, numActions: 1580, schemaVersion: 3 },
            result: {
                games: 5,
                players: ['rl', 'weak', 'normal', 'strong', 'expert'],
                wins: { rl: 2, weak: 1, normal: 1, strong: 0, expert: 1 },
                averageTurns: 24,
                exhausted: 0,
                matchLog: [
                    { lineup: ['rl', 'weak', 'normal', 'strong', 'expert'], winnerDifficulty: 'rl' },
                    { lineup: ['weak', 'normal', 'strong', 'expert', 'rl'], winnerDifficulty: 'weak' },
                    { lineup: ['normal', 'strong', 'expert', 'rl', 'weak'], winnerDifficulty: 'rl' },
                    { lineup: ['strong', 'expert', 'rl', 'weak', 'normal'], winnerDifficulty: 'normal' },
                    { lineup: ['expert', 'rl', 'weak', 'normal', 'strong'], winnerDifficulty: 'expert' },
                ],
                buildStats: [
                    { total: 5, pass: 0, cards: {}, landmarks: {} },
                    { total: 5, pass: 0, cards: {}, landmarks: {} },
                    { total: 5, pass: 0, cards: {}, landmarks: {} },
                    { total: 5, pass: 0, cards: {}, landmarks: {} },
                    { total: 5, pass: 0, cards: {}, landmarks: {} },
                ],
            },
        }], { format: 'text' });
    } finally {
        console.log = realLog;
    }
    assert.ok(lines[0].includes('rl vs rl+weak+normal+strong+expert'));
    assert.ok(lines[0].includes('players=5'));
    assert.ok(lines[0].includes('seat(0=100.0%,1=0.0%,2=0.0%,3=100.0%,4=0.0%)'));
});
