const assert = require('assert');
const { spawnSync } = require('child_process');
const vm = require('vm');
const { runTest, loadScript, loadScripts } = require('./helpers/test-utils');

function loadRLRuntime() {
    const context = { console, Math: Object.create(Math) };
    vm.createContext(context);
    loadScripts(context, ['js/Card.js', 'js/Player.js', 'js/GameManager.js', 'js/RLCPU.js']);
    vm.runInContext('this.RLCPU = RLCPU; this.GameManager = GameManager; this.LANDMARK_NAMES = LANDMARK_NAMES; this.GAME_PHASES = GAME_PHASES; this.createCardByName = createCardByName;', context);
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

function buildParityModel(context) {
    const { RLCPU } = context;
    return {
        stateDim: 145,
        hiddenSize: 2,
        numActions: RLCPU.NUM_ACTIONS,
        numCards: 38,
        layers: {
            shared: [
                {
                    weights: Array.from({ length: 145 }, () => [0, 0]),
                    bias: [0, 0],
                },
                {
                    weights: [
                        [0, 0],
                        [0, 0],
                    ],
                    bias: [0, 0],
                },
            ],
            policyHead: {
                weights: Array.from({ length: 2 }, () => Array.from({ length: RLCPU.NUM_ACTIONS }, () => 0)),
                bias: Array.from({ length: RLCPU.NUM_ACTIONS }, () => 0),
            },
            valueHead: {
                weights: [
                    [0],
                    [0],
                ],
                bias: [0],
            },
            businessGiveHead: {
                weights: Array.from({ length: 2 }, () => Array.from({ length: 38 }, () => 0)),
                bias: Array.from({ length: 38 }, () => 0),
            },
            businessTakeHead: {
                weights: Array.from({ length: 2 }, () => Array.from({ length: 38 }, () => 0)),
                bias: Array.from({ length: 38 }, () => 0),
            },
        },
    };
}

function loadPythonFixture(scenario) {
    const result = spawnSync('python3', ['-m', 'scripts.rl.export_debug_fixture', '--scenario', scenario], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(`python fixture export failed: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout);
}

function loadPythonInferenceFixture(scenario) {
    const result = spawnSync('python3', ['-m', 'scripts.rl.export_inference_fixture', '--scenario', scenario], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(`python inference fixture export failed: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout);
}

function loadPythonTransitionFixture(scenario) {
    const result = spawnSync('python3', ['-m', 'scripts.rl.export_transition_fixture', '--scenario', scenario], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(`python transition fixture export failed: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout);
}

function loadPythonRollTransitionFixture(scenario) {
    const result = spawnSync('python3', ['-m', 'scripts.rl.export_roll_transition_fixture', '--scenario', scenario], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(`python roll transition fixture export failed: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout);
}

function loadPythonPhaseTransitionFixture(scenario) {
    const result = spawnSync('python3', ['-m', 'scripts.rl.export_phase_transition_fixture', '--scenario', scenario], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(`python phase transition fixture export failed: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout);
}

function loadPythonTraceFixture(scenario) {
    const result = spawnSync('python3', ['-m', 'scripts.rl.export_trace_fixture', '--scenario', scenario], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(`python trace fixture export failed: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout);
}

function buildGameFromFixtureSetup(context, setup) {
    const { GameManager, createCardByName } = context;
    const game = new GameManager(2);
    game.currentPlayerIndex = setup.current;
    game.phase = setup.phase;
    game.lastDiceResult = setup.lastDice;
    game.lastDice1 = setup.lastDice1;
    game.lastDice2 = setup.lastDice2;
    game.turnCount = setup.turnCount;
    game.pendingTV = setup.pendingTV;
    game.pendingBusiness = setup.pendingBusiness;
    game.pendingCleaning = setup.pendingCleaning;
    game.pendingMover = setup.pendingMover;
    game.pendingRenovation = setup.pendingRenovation;
    game.pendingIT = setup.pendingIT;

    for (let i = 0; i < setup.players.length; i++) {
        const player = game.players[i];
        const spec = setup.players[i];
        player.coins = spec.coins;
        player.cards = [];
        player.dormantCards = [];
        player.itVentureCoins = spec.itVentureCoins;
        for (const name of Object.keys(player.landmarks)) {
            player.landmarks[name] = false;
        }
        for (const landmarkName of Object.keys(spec.landmarks || {})) {
            player.landmarks[landmarkName] = true;
        }
        for (const [cardName, count] of Object.entries(spec.cards || {})) {
            const dormantCount = (spec.dormant && spec.dormant[cardName]) || 0;
            for (let j = 0; j < count; j++) {
                const card = createCardByName(cardName);
                player.cards.push(card);
                if (j < dormantCount) {
                    player.dormantCards.push(card);
                }
            }
        }
    }
    return game;
}

function serializeGameSetup(game, context) {
    const landmarkOrder = ['駅', 'ショッピングモール', '遊園地', '電波塔', '港', '空港'];
    return {
        current: game.currentPlayerIndex,
        phase: game.phase,
        lastDice: game.lastDiceResult,
        lastDice1: game.lastDice1,
        lastDice2: game.lastDice2,
        turnCount: game.turnCount,
        pendingTV: game.pendingTV,
        pendingBusiness: game.pendingBusiness,
        pendingCleaning: game.pendingCleaning,
        pendingMover: game.pendingMover,
        pendingRenovation: game.pendingRenovation,
        pendingIT: game.pendingIT,
        players: game.players.map(player => {
            const cards = {};
            const dormant = {};
            for (const card of player.cards) {
                cards[card.name] = (cards[card.name] || 0) + 1;
                if (player.isDormant(card)) {
                    dormant[card.name] = (dormant[card.name] || 0) + 1;
                }
            }
            const landmarks = {};
            for (const name of landmarkOrder) {
                if (player.landmarks[name]) landmarks[name] = true;
            }
            return {
                coins: player.coins,
                cards,
                dormant,
                landmarks,
                itVentureCoins: player.itVentureCoins,
            };
        }),
    };
}

function applyRlActionToGame(context, game, action) {
    const { RLCPU, CARDS } = context;
    if (action === RLCPU.ACTIONS.IT_SAVE) {
        game.resolveIT(true);
        return;
    }
    if (action === RLCPU.ACTIONS.IT_SKIP) {
        game.resolveIT(false);
        return;
    }
    if (action === RLCPU.ACTIONS.PASS) {
        game.nextTurn();
        return;
    }
    if (action >= RLCPU.ACTIONS.BC_BASE && action < RLCPU.ACTIONS.BC_BASE + RLCPU.ACTIONS.BC_SIZE) {
        const combo = action - RLCPU.ACTIONS.BC_BASE;
        const giveIndex = Math.floor(combo / CARDS.length);
        const takeIndex = combo % CARDS.length;
        game.resolveBusiness(CARDS[giveIndex].name, 1 - game.currentPlayerIndex, CARDS[takeIndex].name);
        return;
    }
    if (action >= RLCPU.ACTIONS.CLEAN_BASE && action < RLCPU.ACTIONS.CLEAN_BASE + CARDS.length) {
        game.resolveCleaning(CARDS[action - RLCPU.ACTIONS.CLEAN_BASE].name);
        return;
    }
    if (action >= RLCPU.ACTIONS.MOVER_BASE && action < RLCPU.ACTIONS.MOVER_BASE + CARDS.length) {
        game.resolveMover(CARDS[action - RLCPU.ACTIONS.MOVER_BASE].name, 1 - game.currentPlayerIndex);
        return;
    }
    if (action >= RLCPU.ACTIONS.RENO_BASE && action < RLCPU.ACTIONS.RENO_BASE + RLCPU.LANDMARK_ORDER.length) {
        game.resolveRenovation(RLCPU.LANDMARK_ORDER[action - RLCPU.ACTIONS.RENO_BASE]);
        return;
    }
    if (action >= RLCPU.ACTIONS.BUY_CARD_BASE && action < RLCPU.ACTIONS.BUY_CARD_BASE + CARDS.length) {
        game.buildCard(CARDS[action - RLCPU.ACTIONS.BUY_CARD_BASE]);
        game.nextTurn();
        return;
    }
    if (action >= RLCPU.ACTIONS.BUY_LM_BASE && action < RLCPU.ACTIONS.BUY_LM_BASE + RLCPU.LANDMARK_ORDER.length) {
        game.buildLandmark(RLCPU.LANDMARK_ORDER[action - RLCPU.ACTIONS.BUY_LM_BASE]);
        game.nextTurn();
        return;
    }
    throw new Error(`unsupported RL action for parity test: ${action}`);
}

function normalizeForAssert(value) {
    return JSON.parse(JSON.stringify(value));
}

function applyActionIdToGame(context, game, action, options = {}) {
    const { RLCPU } = context;
    if (action === RLCPU.ACTIONS.ROLL1) {
        game.rollDice(options.forceDice ?? null);
        return;
    }
    if (action === RLCPU.ACTIONS.TV_TARGET) {
        game.resolveTV(1 - game.currentPlayerIndex);
        return;
    }
    applyRlActionToGame(context, game, action);
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

runTest('RLCPU: 初期局面の encodeGameState は Python 側 encode_state と一致する', () => {
    const context = loadRLRuntime();
    vm.runInContext('this.CARDS = CARDS;', context);
    const { RLCPU, GameManager } = context;
    const fixture = loadPythonFixture('initial');
    const cpu = new RLCPU(buildParityModel(context));
    const game = new GameManager(2);
    const state = cpu.encodeGameState(game);

    assert.strictEqual(state.length, fixture.state.length);
    assert.strictEqual(cpu.stateDim, fixture.stateDim);
    assert.deepStrictEqual(Array.from(context.CARDS, card => card.name), fixture.cardNames);
    assert.deepStrictEqual(Array.from(RLCPU.LANDMARK_ORDER), fixture.landmarkOrder);
    for (let i = 0; i < state.length; i++) {
        assert.ok(Math.abs(state[i] - fixture.state[i]) < 1e-6, `state mismatch at index ${i}: js=${state[i]} py=${fixture.state[i]}`);
    }
});

runTest('RLCPU: 初期局面の actionMask は Python 側 action_mask と一致する', () => {
    const context = loadRLRuntime();
    const { RLCPU, GameManager } = context;
    const fixture = loadPythonFixture('initial');
    const cpu = new RLCPU(buildParityModel(context));
    const game = new GameManager(2);
    const mask = cpu.actionMask(game);

    assert.strictEqual(mask.length, fixture.mask.length);
    assert.deepStrictEqual(Array.from(mask), fixture.mask);
});

runTest('RLCPU: 駅あり selectDice 局面の actionMask は Python 側 action_mask と一致する', () => {
    const context = loadRLRuntime();
    const { RLCPU, GameManager, LANDMARK_NAMES, GAME_PHASES } = context;
    const fixture = loadPythonFixture('station_select_dice');
    const cpu = new RLCPU(buildParityModel(context));
    const game = new GameManager(2);
    game.currentPlayer().landmarks[LANDMARK_NAMES.STATION] = true;
    game.phase = GAME_PHASES.SELECT_DICE;
    const mask = cpu.actionMask(game);

    assert.strictEqual(mask.length, fixture.mask.length);
    assert.deepStrictEqual(Array.from(mask), fixture.mask);
});

runTest('RLCPU: 初期 build 局面の actionMask は Python 側 action_mask と一致する', () => {
    const context = loadRLRuntime();
    const { RLCPU, GameManager, GAME_PHASES } = context;
    const fixture = loadPythonFixture('build_initial');
    const cpu = new RLCPU(buildParityModel(context));
    const game = new GameManager(2);
    game.phase = GAME_PHASES.BUILD;
    const mask = cpu.actionMask(game);

    assert.strictEqual(mask.length, fixture.mask.length);
    assert.deepStrictEqual(Array.from(mask), fixture.mask);
});

runTest('RLCPU: pending IT 局面の actionMask は Python 側 action_mask と一致する', () => {
    const context = loadRLRuntime();
    const { RLCPU, GameManager, GAME_PHASES } = context;
    const fixture = loadPythonFixture('pending_it');
    const cpu = new RLCPU(buildParityModel(context));
    const game = new GameManager(2);
    game.phase = GAME_PHASES.PENDING;
    game.pendingIT = true;
    const mask = cpu.actionMask(game);

    assert.strictEqual(mask.length, fixture.mask.length);
    assert.deepStrictEqual(Array.from(mask), fixture.mask);
});

for (const scenario of ['pending_business', 'pending_cleaning', 'pending_mover', 'pending_reno']) {
    runTest(`RLCPU: ${scenario} 局面の actionMask は Python 側 action_mask と一致する`, () => {
        const context = loadRLRuntime();
        const { RLCPU } = context;
        const fixture = loadPythonFixture(scenario);
        const cpu = new RLCPU(buildParityModel(context));
        const game = buildGameFromFixtureSetup(context, fixture.setup);
        const mask = cpu.actionMask(game);

        assert.strictEqual(mask.length, fixture.mask.length);
        assert.deepStrictEqual(Array.from(mask), fixture.mask);
    });
}

runTest('RLCPU: 初期局面の forward は Python 側 deterministic fixture と一致する', () => {
    const context = loadRLRuntime();
    const { RLCPU } = context;
    const fixture = loadPythonInferenceFixture('initial');
    const cpu = new RLCPU(fixture.model);
    const result = cpu.forward(fixture.state);

    assert.strictEqual(result.policy.length, fixture.policy.length);
    for (let i = 0; i < result.policy.length; i++) {
        assert.ok(Math.abs(result.policy[i] - fixture.policy[i]) < 1e-6, `policy mismatch at index ${i}: js=${result.policy[i]} py=${fixture.policy[i]}`);
    }
    assert.ok(Math.abs(result.value - fixture.value) < 1e-6, `value mismatch: js=${result.value} py=${fixture.value}`);
    const choice = cpu.chooseAction(fixture.state, fixture.mask);
    assert.strictEqual(choice.action, fixture.greedyAction);
});

runTest('RLCPU: build 局面の chooseAction は Python 側 deterministic fixture と一致する', () => {
    const context = loadRLRuntime();
    const { RLCPU } = context;
    const fixture = loadPythonInferenceFixture('build_initial');
    const cpu = new RLCPU(fixture.model);
    const choice = cpu.chooseAction(fixture.state, fixture.mask);
    assert.strictEqual(choice.action, fixture.greedyAction);
});

for (const scenario of [
    'pending_it_save',
    'pending_it_skip',
    'build_pass',
    'build_buy_card',
    'build_buy_landmark',
    'pending_business',
    'pending_cleaning',
    'pending_mover',
    'pending_reno',
]) {
    runTest(`RLCPU: ${scenario} の遷移後状態は Python 側と一致する`, () => {
        const context = loadRLRuntime();
        vm.runInContext('this.CARDS = CARDS;', context);
        const fixture = loadPythonTransitionFixture(scenario);
        const game = buildGameFromFixtureSetup(context, fixture.before);
        applyRlActionToGame(context, game, fixture.action);
        const actual = normalizeForAssert(serializeGameSetup(game, context));
        const expected = normalizeForAssert(fixture.after);
        assert.deepStrictEqual(actual, expected);
    });
}

for (const scenario of ['roll_wheat', 'roll_cafe', 'roll_tv', 'roll_cleaning']) {
    runTest(`RLCPU: ${scenario} のロール解決後状態は Python 側と一致する`, () => {
        const context = loadRLRuntime();
        const fixture = loadPythonRollTransitionFixture(scenario);
        const game = buildGameFromFixtureSetup(context, fixture.before);
        game.rollDice(fixture.forcedDice);
        const actual = normalizeForAssert(serializeGameSetup(game, context));
        const expected = normalizeForAssert(fixture.after);
        assert.deepStrictEqual(actual, expected);
    });
}

for (const scenario of ['select_dice_one', 'select_dice_two', 'reroll_keep', 'reroll_roll', 'harbor_yes', 'harbor_no']) {
    runTest(`RLCPU: ${scenario} のフェーズ遷移後状態は Python 側と一致する`, () => {
        const context = loadRLRuntime();
        const fixture = loadPythonPhaseTransitionFixture(scenario);
        const game = buildGameFromFixtureSetup(context, fixture.before);
        if (scenario === 'select_dice_one') {
            game.selectDiceCount(false, 4);
        } else if (scenario === 'select_dice_two') {
            game.selectDiceCount(true, 2, 3);
        } else if (scenario === 'reroll_keep') {
            game.skipReroll();
        } else if (scenario === 'reroll_roll') {
            game.rerollDice(2);
        } else if (scenario === 'harbor_yes') {
            game.resolveHarbor(true);
        } else if (scenario === 'harbor_no') {
            game.resolveHarbor(false);
        } else {
            throw new Error(`unsupported phase test scenario: ${scenario}`);
        }
        const actual = normalizeForAssert(serializeGameSetup(game, context));
        const expected = normalizeForAssert(fixture.after);
        assert.deepStrictEqual(actual, expected);
    });
}

for (const [scenario, forcedDice] of [['wheat_then_pass', 1], ['tv_then_pass', 6]]) {
    runTest(`RLCPU: ${scenario} の複数手 trace は Python 側と一致する`, () => {
        const context = loadRLRuntime();
        const fixture = loadPythonTraceFixture(scenario);
        const game = buildGameFromFixtureSetup(context, fixture.trace[0]);
        const actualTrace = [normalizeForAssert(serializeGameSetup(game, context))];
        for (const action of fixture.actions) {
            applyActionIdToGame(context, game, action, { forceDice: action === context.RLCPU.ACTIONS.ROLL1 ? forcedDice : null });
            actualTrace.push(normalizeForAssert(serializeGameSetup(game, context)));
        }
        const expectedTrace = normalizeForAssert(fixture.trace);
        assert.deepStrictEqual(actualTrace, expectedTrace);
    });
}
