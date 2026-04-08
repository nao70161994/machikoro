const assert = require('assert');
const vm = require('vm');
const { runTest, loadScript, loadScripts } = require('./helpers/test-utils');

function loadRLRuntime() {
    const context = { console, Math: Object.create(Math) };
    vm.createContext(context);
    loadScripts(context, ['js/Card.js', 'js/Player.js', 'js/GameManager.js', 'js/RLCPU.js']);
    vm.runInContext('this.RLCPU = RLCPU; this.GameManager = GameManager; this.LANDMARK_NAMES = LANDMARK_NAMES; this.GAME_PHASES = GAME_PHASES;', context);
    return context;
}

function buildTestModel() {
    return {
        stateDim: 3,
        hiddenSize: 2,
        numActions: 4,
        numCards: 2,
        layers: {
            shared: [
                {
                    weights: [
                        [1, 0],
                        [0, 1],
                        [1, 1],
                    ],
                    bias: [0, 0],
                },
                {
                    weights: [
                        [1, 0],
                        [0, 1],
                    ],
                    bias: [0, 0],
                },
            ],
            policyHead: {
                weights: [
                    [3, 0, -2, 0.5],
                    [0, 2, -1, 0.25],
                ],
                bias: [0, 0, 0, 0],
            },
            valueHead: {
                weights: [
                    [0.5],
                    [0.5],
                ],
                bias: [0],
            },
            businessGiveHead: {
                weights: [
                    [1, 0],
                    [0, 1],
                ],
                bias: [0, 0],
            },
            businessTakeHead: {
                weights: [
                    [0, 1],
                    [1, 0],
                ],
                bias: [0, 0],
            },
        },
    };
}

runTest('RLCPU: forward は policy と value を返す', () => {
    const { RLCPU } = loadRLRuntime();
    const cpu = new RLCPU(buildTestModel());
    const result = cpu.forward([1, 0, 1]);
    assert.strictEqual(result.policy.length, 4);
    assert.ok(result.policy[0] > result.policy[1]);
    assert.ok(result.value > 0);
    const total = result.policy.reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(total - 1) < 1e-6);
});

runTest('RLCPU: maskPolicy は無効行動を 0 にして正規化する', () => {
    const { RLCPU } = loadRLRuntime();
    const cpu = new RLCPU(buildTestModel());
    const masked = cpu.maskPolicy([0.5, 0.3, 0.2, 0], [1, 0, 1, 0]);
    assert.ok(Math.abs(masked[0] - (5 / 7)) < 1e-12);
    assert.strictEqual(masked[1], 0);
    assert.ok(Math.abs(masked[2] - (2 / 7)) < 1e-12);
    assert.strictEqual(masked[3], 0);
});

runTest('RLCPU: chooseAction は mask 後の最大確率行動を返す', () => {
    const { RLCPU } = loadRLRuntime();
    const cpu = new RLCPU(buildTestModel());
    const choice = cpu.chooseAction([1, 0, 1], [0, 1, 1, 0]);
    assert.strictEqual(choice.action, 1);
    assert.ok(choice.confidence > 0);
});

runTest('RLCPU: forwardBusiness は give/take 分布を返す', () => {
    const { RLCPU } = loadRLRuntime();
    const cpu = new RLCPU(buildTestModel());
    const result = cpu.forwardBusiness([1, 0, 1]);
    assert.strictEqual(result.give.length, 2);
    assert.strictEqual(result.take.length, 2);
    assert.ok(Math.abs(result.give.reduce((sum, value) => sum + value, 0) - 1) < 1e-6);
    assert.ok(Math.abs(result.take.reduce((sum, value) => sum + value, 0) - 1) < 1e-6);
});

runTest('RLCPU: encodeGameState は 2人戦初期局面を 145 次元へ変換する', () => {
    const { RLCPU, GameManager } = loadRLRuntime();
    const cpu = new RLCPU(buildTestModel());
    cpu.stateDim = 145;
    const model = buildTestModel();
    model.stateDim = 145;
    model.hiddenSize = 2;
    model.layers.shared[0].weights = Array.from({ length: 145 }, () => [0, 0]);
    const encoderCpu = new RLCPU(model);
    const game = new GameManager(2);
    const state = encoderCpu.encodeGameState(game);
    assert.strictEqual(state.length, 145);
    assert.strictEqual(state[0], 3 / 50);
    assert.strictEqual(state[1], 3 / 50);
    assert.strictEqual(state[14], 1 / 5);
    assert.strictEqual(state[19], 1 / 5);
    assert.strictEqual(state[state.length - 1], 0);
});

runTest('RLCPU: actionMask は初期 roll で1個振りのみ許可する', () => {
    const { RLCPU, GameManager } = loadRLRuntime();
    const model = buildTestModel();
    model.stateDim = 145;
    model.hiddenSize = 2;
    model.numActions = RLCPU.NUM_ACTIONS;
    model.numCards = 38;
    model.layers.shared[0].weights = Array.from({ length: 145 }, () => [0, 0]);
    model.layers.policyHead.weights = Array.from({ length: 2 }, () => Array.from({ length: RLCPU.NUM_ACTIONS }, () => 0));
    model.layers.policyHead.bias = Array.from({ length: RLCPU.NUM_ACTIONS }, () => 0);
    model.layers.businessGiveHead.weights = Array.from({ length: 2 }, () => Array.from({ length: 38 }, () => 0));
    model.layers.businessGiveHead.bias = Array.from({ length: 38 }, () => 0);
    model.layers.businessTakeHead.weights = Array.from({ length: 2 }, () => Array.from({ length: 38 }, () => 0));
    model.layers.businessTakeHead.bias = Array.from({ length: 38 }, () => 0);
    const cpu = new RLCPU(model);
    const game = new GameManager(2);
    const mask = cpu.actionMask(game);
    assert.strictEqual(mask[RLCPU.ACTIONS.ROLL1], 1);
    assert.strictEqual(mask[RLCPU.ACTIONS.ROLL2], 0);
});

runTest('RLCPU: actionMask は駅あり selectDice で2個振りを許可する', () => {
    const { RLCPU, GameManager, LANDMARK_NAMES, GAME_PHASES } = loadRLRuntime();
    const model = buildTestModel();
    model.stateDim = 145;
    model.hiddenSize = 2;
    model.numActions = RLCPU.NUM_ACTIONS;
    model.numCards = 38;
    model.layers.shared[0].weights = Array.from({ length: 145 }, () => [0, 0]);
    model.layers.policyHead.weights = Array.from({ length: 2 }, () => Array.from({ length: RLCPU.NUM_ACTIONS }, () => 0));
    model.layers.policyHead.bias = Array.from({ length: RLCPU.NUM_ACTIONS }, () => 0);
    model.layers.businessGiveHead.weights = Array.from({ length: 2 }, () => Array.from({ length: 38 }, () => 0));
    model.layers.businessGiveHead.bias = Array.from({ length: 38 }, () => 0);
    model.layers.businessTakeHead.weights = Array.from({ length: 2 }, () => Array.from({ length: 38 }, () => 0));
    model.layers.businessTakeHead.bias = Array.from({ length: 38 }, () => 0);
    const cpu = new RLCPU(model);
    const game = new GameManager(2);
    game.currentPlayer().landmarks[LANDMARK_NAMES.STATION] = true;
    game.phase = GAME_PHASES.SELECT_DICE;
    const mask = cpu.actionMask(game);
    assert.strictEqual(mask[RLCPU.ACTIONS.ROLL1], 1);
    assert.strictEqual(mask[RLCPU.ACTIONS.ROLL2], 1);
});
