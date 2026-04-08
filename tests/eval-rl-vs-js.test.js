const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    loadModel,
    evaluateRlVsJs,
    summarizeEvaluationEntry,
    printEvaluation,
} = require(path.join(__dirname, '..', 'scripts', 'eval-rl-vs-js.js'));

function buildRlModel() {
    const stateDim = 145;
    const hiddenSize = 2;
    const numCards = 38;
    const numActions = 1580;
    return {
        formatVersion: 1,
        schemaVersion: 3,
        stateDim,
        hiddenSize,
        numActions,
        numCards,
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
    const args = parseArgs(['--model', 'tmp/model.json', '--games', '6', '--seed', '9', '--max-steps', '7000', '--format', 'json', '--opponents', 'strong,expert']);
    assert.strictEqual(args.modelPath, 'tmp/model.json');
    assert.strictEqual(args.games, 6);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.maxSteps, 7000);
    assert.strictEqual(args.format, 'json');
    assert.deepStrictEqual(args.opponents, ['strong', 'expert']);
});

runTest('loadModel は export 済み JSON を読み込む', () => {
    const tmpPath = path.join(os.tmpdir(), `machikoro-rl-model-${process.pid}.json`);
    fs.writeFileSync(tmpPath, JSON.stringify(buildRlModel()), 'utf8');
    const model = loadModel(tmpPath);
    assert.strictEqual(model.stateDim, 145);
    assert.strictEqual(model.numActions, 1580);
    fs.unlinkSync(tmpPath);
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
            },
        }], { format: 'text' });
    } finally {
        console.log = realLog;
    }
    assert.strictEqual(lines.length, 1);
    assert.ok(lines[0].includes('rl vs strong'));
    assert.ok(lines[0].includes('seat(first=100.0%,second=50.0%)'));
});
