const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    scenarioNamesForPlayerCount,
    createScenarioGame,
    buildChecks,
    evaluateSpecialScenarios,
    renderText,
} = require(path.join(__dirname, '..', 'scripts', 'eval-rl-special-scenarios.js'));

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

runTest('eval-rl-special-scenarios parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs([
        '--models', 'a,b',
        '--run-labels', 'c',
        '--rank', '2',
        '--player-count', '2',
        '--scenarios', 'twoPlayerBusinessBasic',
        '--format', 'json',
        '--output', 'out.json',
    ]);
    assert.deepStrictEqual(args.models, ['a', 'b']);
    assert.deepStrictEqual(args.runLabels, ['c']);
    assert.strictEqual(args.rank, 2);
    assert.strictEqual(args.playerCount, 2);
    assert.deepStrictEqual(args.scenarios, ['twoPlayerBusinessBasic']);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.output, 'out.json');
});

runTest('scenarioNamesForPlayerCount は人数に合う既定scenarioだけを返す', () => {
    const twoPlayerNames = scenarioNamesForPlayerCount(2, []);
    const fourPlayerNames = scenarioNamesForPlayerCount(4, []);
    assert.deepStrictEqual(twoPlayerNames, ['twoPlayerBusinessBasic']);
    assert.ok(fourPlayerNames.includes('tvLeaderThreat'));
    assert.ok(fourPlayerNames.includes('moverGiveJunk'));
    assert.ok(fourPlayerNames.includes('moverTargetSafeRecipient'));
    assert.ok(fourPlayerNames.includes('renovationAvoidPremiumLandmark'));
    assert.strictEqual(fourPlayerNames.includes('twoPlayerBusinessBasic'), false);
});

runTest('createScenarioGame はkindごとのpending局面を作る', () => {
    const { loadRuntime } = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));
    const runtime = loadRuntime();
    const tvGame = createScenarioGame(runtime, 'tvLeaderThreat', 4);
    const businessGame = createScenarioGame(runtime, 'bcHighValueThreat', 4);
    const cleaningGame = createScenarioGame(runtime, 'cleaningOpponentEngine', 4);
    const moverGame = createScenarioGame(runtime, 'moverGiveJunk', 4);
    const renovationGame = createScenarioGame(runtime, 'renovationAvoidPremiumLandmark', 4);
    assert.strictEqual(tvGame.pendingTV, 1);
    assert.strictEqual(businessGame.pendingBusiness, 1);
    assert.strictEqual(cleaningGame.pendingCleaning, 1);
    assert.strictEqual(moverGame.pendingMover, 1);
    assert.strictEqual(renovationGame.pendingRenovation, 1);
    assert.ok(tvGame.currentPlayer().cards.some(card => card.name === 'テレビ局'));
    assert.ok(cleaningGame.currentPlayer().cards.some(card => card.name === '清掃業'));
    assert.ok(moverGame.currentPlayer().cards.some(card => card.name === '引越し屋'));
    assert.ok(renovationGame.currentPlayer().cards.some(card => card.name === '改装屋'));
});

runTest('createScenarioGame は休業カード指定を反映する', () => {
    const { loadRuntime } = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));
    const runtime = loadRuntime();
    const game = createScenarioGame(runtime, 'moverDormantPreferred', 4);
    const wheat = game.players[0].cards.find(card => card.name === '麦畑');
    assert.strictEqual(game.players[0].isDormant(wheat), true);
});

runTest('buildChecks は期待行動との一致を返す', () => {
    const checks = buildChecks({
        targetIndex: 3,
        targetNotIn: [1],
        cardName: 'カフェ',
        avoidCard: '食品倉庫',
        giveOneOf: ['麦畑'],
        takeOneOf: ['鉱山'],
        avoidGive: ['食品倉庫'],
        landmarkOneOf: ['駅'],
        avoidLandmark: '空港',
    }, {
        targetIndex: 3,
        cardName: 'カフェ',
        give: '麦畑',
        take: '鉱山',
        landmarkName: '駅',
    });
    assert.strictEqual(checks.targetMatches, true);
    assert.strictEqual(checks.targetAvoided, true);
    assert.strictEqual(checks.cardMatches, true);
    assert.strictEqual(checks.avoidCardPassed, true);
    assert.strictEqual(checks.giveMatches, true);
    assert.strictEqual(checks.takeMatches, true);
    assert.strictEqual(checks.avoidGivePassed, true);
    assert.strictEqual(checks.landmarkMatches, true);
    assert.strictEqual(checks.avoidLandmarkPassed, true);
});

runTest('evaluateSpecialScenarios はTV/BC/cleaning/mover/renovationの結果を返す', () => {
    const results = evaluateSpecialScenarios([
        {
            id: 'dummy',
            label: 'dummy',
            path: '',
            modelData: buildRlModel(),
        },
    ], {
        playerCount: 4,
        scenarios: ['tvLeaderThreat', 'bcHighValueThreat', 'cleaningOpponentEngine', 'moverGiveJunk', 'renovationAvoidPremiumLandmark'],
    });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].modelInfo.stateDim, 145);
    const byKind = new Map(results[0].scenarios.map(scenario => [scenario.kind, scenario]));
    assert.strictEqual(byKind.get('tv').scenario, 'tvLeaderThreat');
    assert.strictEqual(Number.isInteger(byKind.get('tv').targetIndex), true);
    assert.ok(Object.prototype.hasOwnProperty.call(byKind.get('business'), 'costDelta'));
    assert.ok(Object.prototype.hasOwnProperty.call(byKind.get('cleaning'), 'cardName'));
    assert.ok(Object.prototype.hasOwnProperty.call(byKind.get('mover'), 'isDormant'));
    assert.ok(Object.prototype.hasOwnProperty.call(byKind.get('renovation'), 'landmarkName'));
});

runTest('evaluateSpecialScenarios は moverTargetSafeRecipient のtarget分離checkを返す', () => {
    const results = evaluateSpecialScenarios([
        {
            id: 'dummy',
            label: 'dummy',
            path: '',
            modelData: buildRlModel(),
        },
    ], {
        playerCount: 4,
        scenarios: ['moverTargetSafeRecipient'],
    });
    const scenario = results[0].scenarios[0];
    assert.strictEqual(scenario.kind, 'mover');
    assert.deepStrictEqual(scenario.expected.giveOneOf, ['麦畑']);
    assert.deepStrictEqual(scenario.expected.targetNotIn, [3]);
    assert.ok(Object.prototype.hasOwnProperty.call(scenario.checks, 'giveMatches'));
    assert.ok(Object.prototype.hasOwnProperty.call(scenario.checks, 'targetAvoided'));
    assert.ok(Number.isInteger(scenario.targetIndex) || scenario.targetIndex === null);
    assert.strictEqual(typeof scenario.cardName, 'string');
});

runTest('renderText は各kindのscenarioを出力する', () => {
    const results = evaluateSpecialScenarios([
        {
            id: 'dummy',
            label: 'dummy',
            path: '',
            modelData: buildRlModel(),
        },
    ], {
        playerCount: 4,
        scenarios: ['tvLeaderThreat', 'bcHighValueThreat', 'cleaningOpponentEngine', 'moverGiveJunk', 'renovationAvoidPremiumLandmark'],
    });
    const text = renderText(results);
    assert.ok(text.includes('dummy players=4'));
    assert.ok(text.includes('tvLeaderThreat[tv]'));
    assert.ok(text.includes('bcHighValueThreat[business]'));
    assert.ok(text.includes('cleaningOpponentEngine[cleaning]'));
    assert.ok(text.includes('moverGiveJunk[mover]'));
    assert.ok(text.includes('renovationAvoidPremiumLandmark[renovation]'));
});
