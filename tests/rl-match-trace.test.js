const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    buildPlayers,
    resolvePlayers,
    exportJsMatchTrace,
} = require(path.join(__dirname, '..', 'scripts', 'export-rl-match-trace.js'));

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

runTest('rl match trace: parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--model', 'tmp/model.json', '--opponent', 'normal', '--lineup', 'rl,weak,normal,strong', '--seed', '7', '--max-steps', '600', '--rl-seat', 'second', '--rolls', '1,6,3']);
    assert.strictEqual(args.modelPath, 'tmp/model.json');
    assert.strictEqual(args.opponent, 'normal');
    assert.deepStrictEqual(args.lineup, ['rl', 'weak', 'normal', 'strong']);
    assert.strictEqual(args.seed, 7);
    assert.strictEqual(args.maxSteps, 600);
    assert.strictEqual(args.rlSeat, 'second');
    assert.deepStrictEqual(args.rolls, [1, 6, 3]);
});

runTest('rl match trace: buildPlayers は席に応じて lineup を返す', () => {
    assert.deepStrictEqual(buildPlayers('strong', 'first'), ['rl', 'strong']);
    assert.deepStrictEqual(buildPlayers('strong', 'second'), ['strong', 'rl']);
    assert.deepStrictEqual(resolvePlayers({ lineup: ['rl', 'weak', 'normal', 'strong'] }), ['rl', 'weak', 'normal', 'strong']);
});

runTest('rl match trace: exportJsMatchTrace は単発 trace を返す', () => {
    const result = exportJsMatchTrace({
        rlModelData: buildRlModel(),
        opponent: 'weak',
        seed: 1,
        maxSteps: 20,
        rlSeat: 'first',
        rolls: [1, 6, 3, 5],
    });
    assert.strictEqual(result.source, 'js');
    assert.deepStrictEqual(result.players, ['rl', 'weak']);
    assert.ok(Array.isArray(result.trace));
    assert.ok(result.trace.length > 0);
    assert.ok(Array.isArray(result.trace[0].legalActions));
    assert.ok(result.trace[0].chosenAction);
    assert.ok(result.trace[0].before);
    assert.ok(result.trace[0].after);
    assert.ok(Array.isArray(result.trace[0].rollsUsed));
    assert.ok(result.trace.every(entry => !('buildDiagnostics' in entry)));
});

runTest('rl match trace: expert相手でもbuild診断を混入しない', () => {
    const result = exportJsMatchTrace({
        rlModelData: buildRlModel(),
        opponent: 'expert',
        seed: 1,
        maxSteps: 20,
        rlSeat: 'first',
        rolls: [1, 6, 3, 5],
    });
    assert.ok(Array.isArray(result.trace));
    assert.ok(result.trace.length > 0);
    assert.ok(result.trace.every(entry => !('buildDiagnostics' in entry)));
});

runTest('rl match trace: exportJsMatchTrace は4人lineup trace を返す', () => {
    const result = exportJsMatchTrace({
        rlModelData: buildRlModel(),
        lineup: ['rl', 'weak', 'normal', 'strong'],
        seed: 1,
        maxSteps: 20,
        rolls: [1, 6, 3, 5],
    });
    assert.strictEqual(result.source, 'js');
    assert.deepStrictEqual(result.players, ['rl', 'weak', 'normal', 'strong']);
    assert.strictEqual(result.opponent, 'rl+weak+normal+strong');
    assert.ok(Array.isArray(result.trace));
    assert.ok(result.trace.length > 0);
    assert.strictEqual(result.finalState.length, 4);
});

runTest('rl match trace: 4人lineupのexpertにもbuild診断を混入しない', () => {
    const result = exportJsMatchTrace({
        rlModelData: buildRlModel(),
        lineup: ['rl', 'expert', 'normal', 'strong'],
        seed: 1,
        maxSteps: 20,
        rolls: [1, 6, 3, 5],
    });
    assert.deepStrictEqual(result.players, ['rl', 'expert', 'normal', 'strong']);
    assert.ok(Array.isArray(result.trace));
    assert.ok(result.trace.length > 0);
    assert.ok(result.trace.every(entry => !('buildDiagnostics' in entry)));
});
