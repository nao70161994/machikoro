const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    createScenarioGame,
    evaluateBusinessScenarios,
    renderText,
} = require(path.join(__dirname, '..', 'scripts', 'eval-rl-business-scenario.js'));

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

runTest('eval-rl-business-scenario parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs([
        '--models', 'a,b',
        '--run-labels', 'c',
        '--rank', '2',
        '--player-count', '2',
        '--scenarios', 'twoPlayerBasic',
        '--format', 'json',
        '--output', 'out.json',
    ]);
    assert.deepStrictEqual(args.models, ['a', 'b']);
    assert.deepStrictEqual(args.runLabels, ['c']);
    assert.strictEqual(args.rank, 2);
    assert.strictEqual(args.playerCount, 2);
    assert.deepStrictEqual(args.scenarios, ['twoPlayerBasic']);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.output, 'out.json');
});

runTest('createScenarioGame はBC pending局面を作る', () => {
    const { loadRuntime } = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));
    const runtime = loadRuntime();
    const game = createScenarioGame(runtime, 'twoPlayerBasic', 2);
    assert.strictEqual(game.pendingBusiness, 1);
    assert.strictEqual(game.currentPlayerIndex, 0);
    assert.ok(game.currentPlayer().cards.some(card => card.name === 'ビジネスセンター'));
    assert.ok(game.players[1].cards.some(card => card.name === '鉱山'));
});

runTest('createScenarioGame は休業カード指定を反映する', () => {
    const { loadRuntime } = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));
    const runtime = loadRuntime();
    const game = createScenarioGame(runtime, 'dormantGive', 4);
    const ownFoodWarehouse = game.players[0].cards.find(card => card.name === '食品倉庫');
    const targetSaury = game.players[3].cards.find(card => card.name === 'サンマ漁船');
    assert.strictEqual(game.players[0].isDormant(ownFoodWarehouse), true);
    assert.strictEqual(game.players[3].isDormant(targetSaury), true);
});

runTest('evaluateBusinessScenarios は4人用の既定シナリオだけを評価する', () => {
    const results = evaluateBusinessScenarios([
        {
            id: 'dummy',
            label: 'dummy',
            path: '',
            modelData: buildRlModel(),
        },
    ], {
        playerCount: 4,
        scenarios: [],
    });
    const names = results[0].scenarios.map(scenario => scenario.scenario);
    assert.ok(names.includes('highValueThreat'));
    assert.ok(names.includes('protectEngine'));
    assert.strictEqual(names.includes('twoPlayerBasic'), false);
});

runTest('evaluateBusinessScenarios はBC選択結果を返す', () => {
    const results = evaluateBusinessScenarios([
        {
            id: 'dummy',
            label: 'dummy',
            path: '',
            modelData: buildRlModel(),
        },
    ], {
        playerCount: 2,
        scenarios: ['twoPlayerBasic'],
    });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].scenarios.length, 1);
    assert.strictEqual(results[0].scenarios[0].skipped, false);
    assert.ok(results[0].scenarios[0].give);
    assert.ok(results[0].scenarios[0].take);
    assert.ok(renderText(results).includes('twoPlayerBasic'));
});
