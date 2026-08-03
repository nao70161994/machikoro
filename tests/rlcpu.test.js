const assert = require('assert');
const { spawnSync } = require('child_process');
const vm = require('vm');
const { runTest, loadScript, loadScripts } = require('./helpers/test-utils');

function loadRLRuntime() {
    const context = { console, Math: Object.create(Math) };
    vm.createContext(context);
    loadScripts(context, ['js/Card.js', 'js/Player.js', 'js/actionContract.js', 'js/pendingActionQueue.js', 'js/gameTurnPolicy.js', 'js/gameDicePolicy.js', 'js/gameBuildPolicy.js', 'js/GameManager.js', 'js/RLCPU.js']);
    vm.runInContext('this.RLCPU = RLCPU; this.GameManager = GameManager; this.LANDMARK_NAMES = LANDMARK_NAMES; this.GAME_PHASES = GAME_PHASES; this.createCardByName = createCardByName; this.CARDS = CARDS; this.Player = Player;', context);
    return context;
}

function createDefaultShopStock(context) {
    const stock = {};
    for (const card of context.CARDS) {
        stock[card.name] = 6;
    }
    return stock;
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
    return buildParityModelWithStateDim(context, 145);
}

function buildParityModelWithStateDim(context, stateDim) {
    const { RLCPU } = context;
    return {
        stateDim,
        hiddenSize: 2,
        numActions: RLCPU.NUM_ACTIONS,
        numCards: 38,
        layers: {
            shared: [
                {
                    weights: Array.from({ length: stateDim }, () => [0, 0]),
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

function buildTargetHeadModel(context, stateDim, targetBiases = {}) {
    const model = buildParityModelWithStateDim(context, stateDim);
    model.numTargetSlots = 3;
    model.layers.tvTargetHead = {
        weights: Array.from({ length: model.hiddenSize }, () => [0, 0, 0]),
        bias: targetBiases.tv || [0, 0, 0],
    };
    model.layers.businessTargetHead = {
        weights: Array.from({ length: model.hiddenSize }, () => [0, 0, 0]),
        bias: targetBiases.business || [0, 0, 0],
    };
    model.layers.moverTargetHead = {
        weights: Array.from({ length: model.hiddenSize }, () => [0, 0, 0]),
        bias: targetBiases.mover || [0, 0, 0],
    };
    return model;
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
    const game = new GameManager(setup.players.length);
    game.__shopStock = createDefaultShopStock(context);
    if (setup.shopStock) {
        for (const [name, count] of Object.entries(setup.shopStock)) {
            game.__shopStock[name] = count;
        }
    }
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
    game.usedReroll = !!setup.usedReroll;

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
    const shopStock = game.__shopStock ? Object.assign({}, game.__shopStock) : createDefaultShopStock(context);
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
        pendingActions: context.GameManager.serializedPendingActionsFor(game),
        pendingIT: game.pendingIT,
        usedReroll: !!game.usedReroll,
        shopStock: Object.fromEntries(Object.entries(shopStock).filter(([, count]) => count !== 6)),
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
        const card = CARDS[action - RLCPU.ACTIONS.BUY_CARD_BASE];
        game.buildCard(card);
        if (game.__shopStock && Number.isFinite(game.__shopStock[card.name])) {
            game.__shopStock[card.name] = Math.max(0, game.__shopStock[card.name] - 1);
        }
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

runTest('RLCPU: schema metadata は既存2人/多人数モデルを識別する', () => {
    const context = loadRLRuntime();
    const RLCPU = context.RLCPU;

    assert.strictEqual(RLCPU.stateSchemaForDim(145), RLCPU.STATE_SCHEMAS.TWO_PLAYER_V1);
    assert.strictEqual(RLCPU.stateSchemaForDim(353), RLCPU.STATE_SCHEMAS.MULTIPLAYER_V1);
    assert.strictEqual(RLCPU.stateSchemaForDim(3), RLCPU.STATE_SCHEMAS.CUSTOM);
    const twoPlayerSchema = RLCPU.resolveModelSchema({ stateDim: 145 });
    assert.strictEqual(twoPlayerSchema.state, RLCPU.STATE_SCHEMAS.TWO_PLAYER_V1);
    assert.strictEqual(twoPlayerSchema.action, RLCPU.ACTION_SCHEMAS.LEGACY_FLAT_V1);

    const draftSchema = RLCPU.resolveModelSchema({
        stateDim: 353,
        actionSchema: RLCPU.ACTION_SCHEMAS.FACTORED_BUSINESS_TARGET_V2_DRAFT,
    });
    assert.strictEqual(draftSchema.state, RLCPU.STATE_SCHEMAS.MULTIPLAYER_V1);
    assert.strictEqual(draftSchema.action, RLCPU.ACTION_SCHEMAS.FACTORED_BUSINESS_TARGET_V2_DRAFT);
});

runTest('RLCPU: schema mismatch guard は未対応action schemaとstate schema不一致を拒否する', () => {
    const { RLCPU } = loadRLRuntime();
    const draftActionModel = Object.assign(buildTestModel(), {
        actionSchema: RLCPU.ACTION_SCHEMAS.FACTORED_BUSINESS_TARGET_V2_DRAFT,
    });
    assert.throws(() => new RLCPU(draftActionModel), /unsupported action schema/);

    const mismatchedStateModel = Object.assign(buildTestModel(), {
        stateDim: 145,
        stateSchema: RLCPU.STATE_SCHEMAS.MULTIPLAYER_V1,
    });
    assert.throws(() => new RLCPU(mismatchedStateModel), /state schema mismatch/);
});

runTest('RLCPU: runtime action/card count mismatch は既知schemaで早期拒否する', () => {
    const context = loadRLRuntime();
    const { RLCPU } = context;

    const wrongActions = buildParityModel(context);
    wrongActions.numActions = RLCPU.NUM_ACTIONS - 1;
    assert.throws(() => new RLCPU(wrongActions), /action count mismatch/);

    const wrongCards = buildParityModel(context);
    wrongCards.numCards = context.CARDS.length - 1;
    assert.throws(() => new RLCPU(wrongCards), /card count mismatch/);
});

runTest('RLCPU: custom state schema でも flat action count mismatch は拒否する', () => {
    const context = loadRLRuntime();
    const { RLCPU } = context;
    const customStateWrongActions = Object.assign(buildTestModel(), {
        actionSchema: RLCPU.ACTION_SCHEMAS.LEGACY_FLAT_V1,
        numActions: RLCPU.NUM_ACTIONS - 1,
    });
    assert.throws(() => new RLCPU(customStateWrongActions), /action count mismatch/);
});

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

runTest('RLCPU: numTargetSlots 欠落時はtarget head形状から推定する', () => {
    const { RLCPU } = loadRLRuntime();
    const model = buildTestModel();
    model.layers.businessTargetHead = {
        weights: [
            [1, 0, 0],
            [0, 1, 0],
        ],
        bias: [0, 0, 0],
    };
    const cpu = new RLCPU(model);

    assert.strictEqual(cpu.numTargetSlots, 3);
});

runTest('RLCPU: encodeGameState は 2人戦初期局面を 145 次元へ変換する', () => {
    const context = loadRLRuntime();
    const { RLCPU, GameManager } = context;
    const encoderCpu = new RLCPU(buildParityModelWithStateDim(context, 145));
    const game = new GameManager(2);
    const state = encoderCpu.encodeGameState(game);
    assert.strictEqual(state.length, 145);
    assert.strictEqual(state[0], 3 / 50);
    assert.strictEqual(state[1], 3 / 50);
    assert.strictEqual(state[14], 1 / 5);
    assert.strictEqual(state[19], 1 / 5);
    assert.strictEqual(state[state.length - 1], 0);
});

runTest('RLCPU: encodeGameState は4人戦を最脅威の相手との2人表現へ射影する', () => {
    const { RLCPU, GameManager, LANDMARK_NAMES } = loadRLRuntime();
    const cpu = new RLCPU(buildParityModel({ RLCPU }));
    const game = new GameManager(4);
    game.currentPlayerIndex = 0;
    game.players[1].coins = 4;
    game.players[2].coins = 12;
    game.players[3].coins = 1;
    game.players[3].landmarks[LANDMARK_NAMES.AIRPORT] = true;
    const state = cpu.encodeGameState(game);
    assert.strictEqual(state.length, 145);
    assert.strictEqual(state[0], 3 / 50);
    assert.strictEqual(state[1], 1 / 50);
    assert.strictEqual(cpu.chooseTVTarget(game), 3);
});

runTest('RLCPU: stateDim 353 モデルは4人戦を多人数表現へ変換する', () => {
    const { RLCPU, GameManager, LANDMARK_NAMES } = loadRLRuntime();
    const model = buildParityModel({ RLCPU });
    model.stateDim = 353;
    model.layers.shared[0].weights = Array.from({ length: 353 }, () => [0, 0]);
    const cpu = new RLCPU(model);
    const game = new GameManager(4);
    game.currentPlayerIndex = 0;
    game.players[1].coins = 4;
    game.players[2].coins = 12;
    game.players[3].coins = 1;
    game.players[3].landmarks[LANDMARK_NAMES.AIRPORT] = true;
    const state = cpu.encodeGameState(game);
    assert.strictEqual(state.length, 353);
    assert.strictEqual(state[0], 3 / 50);
    assert.strictEqual(state[84], 1 / 50);
    assert.strictEqual(state[state.length - 1], 1);
});

runTest('RLCPU: stateDim 353 モデルは5人以上を脅威度上位3人へ射影する', () => {
    const { RLCPU, GameManager, LANDMARK_NAMES } = loadRLRuntime();
    const model = buildParityModel({ RLCPU });
    model.stateDim = 353;
    model.layers.shared[0].weights = Array.from({ length: 353 }, () => [0, 0]);
    const cpu = new RLCPU(model);
    const game = new GameManager(5);
    game.currentPlayerIndex = 0;
    game.players[1].coins = 4;
    game.players[2].coins = 80;
    game.players[3].coins = 1;
    game.players[3].landmarks[LANDMARK_NAMES.AIRPORT] = true;
    game.players[4].coins = 2;
    const state = cpu.encodeGameState(game);

    assert.strictEqual(state.length, 353);
    assert.strictEqual(state[0], 3 / 50);
    assert.strictEqual(state[84], 1);
    assert.strictEqual(state[state.length - 1], 1);
    assert.strictEqual(cpu.chooseTVTarget(game), 2);
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

runTest('RLCPU: actionMask は駅あり roll でもまず1個振りのみ許可する', () => {
    const context = loadRLRuntime();
    const { RLCPU, LANDMARK_NAMES, GAME_PHASES } = context;
    const cpu = new RLCPU(buildParityModel(context));
    const game = buildGameFromFixtureSetup(context, {
        current: 0,
        phase: GAME_PHASES.ROLL,
        lastDice: 0,
        lastDice1: 0,
        lastDice2: 0,
        turnCount: 0,
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        players: [
            { coins: 3, cards: { '麦畑': 1, 'パン屋': 1 }, dormant: {}, landmarks: { [LANDMARK_NAMES.STATION]: true }, itVentureCoins: 0 },
            { coins: 3, cards: { '麦畑': 1, 'パン屋': 1 }, dormant: {}, landmarks: {}, itVentureCoins: 0 },
        ],
    });
    const mask = cpu.actionMask(game);
    assert.strictEqual(mask[RLCPU.ACTIONS.ROLL1], 1);
    assert.strictEqual(mask[RLCPU.ACTIONS.ROLL2], 0);
});

runTest('RLCPU: actionMask は pending queue の先頭fieldだけを有効化する', () => {
    const context = loadRLRuntime();
    const { RLCPU, GameManager, GAME_PHASES, CARDS } = context;
    const cpu = new RLCPU(buildParityModel(context));
    const game = new GameManager(2);
    game.phase = GAME_PHASES.PENDING;
    game.pendingActionQueue = [
        { action: 'resolveCleaning', field: 'pendingCleaning' },
        { action: 'resolveTV', field: 'pendingTV' },
    ];
    game.pendingCleaning = 1;
    game.pendingTV = 1;

    const mask = cpu.actionMask(game);
    const wheatIndex = CARDS.findIndex(card => card.name === '麦畑');

    assert.strictEqual(mask[RLCPU.ACTIONS.TV_TARGET], 0);
    assert.strictEqual(mask[RLCPU.ACTIONS.CLEAN_BASE + wheatIndex], 1);
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

runTest('RLCPU: target head がない時はTV/BCを脅威度、moverをカード価値で選ぶ', () => {
    const context = loadRLRuntime();
    const { RLCPU, GameManager, createCardByName, GAME_PHASES } = context;
    const game = new GameManager(4);
    game.__shopStock = createDefaultShopStock(context);
    game.phase = GAME_PHASES.PENDING;
    game.currentPlayerIndex = 0;
    game.pendingTV = 1;

    const current = game.currentPlayer();
    current.cards = [createCardByName('テレビ局'), createCardByName('ビジネスセンター'), createCardByName('引越し屋')];
    current.dormantCards = [];

    game.players[1].coins = 10;
    game.players[1].cards = [createCardByName('麦畑')];
    game.players[1].dormantCards = [];

    game.players[2].coins = 2;
    game.players[2].cards = [createCardByName('鉱山'), createCardByName('鉱山')];
    game.players[2].dormantCards = [];
    game.players[2].landmarks['駅'] = true;
    game.players[2].landmarks['空港'] = true;

    game.players[3].coins = 14;
    game.players[3].cards = [createCardByName('パン屋')];
    game.players[3].dormantCards = [];

    const cpu = new RLCPU(buildParityModelWithStateDim(context, 353));
    assert.strictEqual(cpu.chooseTVTarget(game), 2);

    game.pendingTV = 0;
    game.pendingBusiness = true;
    const businessMove = cpu.chooseBusinessMove(game);
    assert.ok(businessMove);
    assert.strictEqual(businessMove.targetIndex, 2);

    game.pendingBusiness = false;
    game.pendingMover = 1;
    const moverMove = cpu.chooseMoverMove(game);
    assert.ok(moverMove);
    assert.strictEqual(moverMove.targetIndex, 1);
});

runTest('RLCPU: target head があれば4人戦の対象選択に使う', () => {
    const context = loadRLRuntime();
    const { RLCPU, GameManager, createCardByName, GAME_PHASES, CARDS } = context;
    const game = new GameManager(4);
    game.__shopStock = createDefaultShopStock(context);
    game.phase = GAME_PHASES.PENDING;
    game.currentPlayerIndex = 0;
    game.pendingTV = 1;

    const current = game.currentPlayer();
    current.cards = [
        createCardByName('テレビ局'),
        createCardByName('ビジネスセンター'),
        createCardByName('引越し屋'),
        createCardByName('パン屋'),
    ];
    current.dormantCards = [];

    game.players[1].coins = 20;
    game.players[1].cards = [createCardByName('森林')];
    game.players[1].dormantCards = [];

    game.players[2].coins = 6;
    game.players[2].cards = [createCardByName('カフェ')];
    game.players[2].dormantCards = [];

    game.players[3].coins = 4;
    game.players[3].cards = [createCardByName('麦畑')];
    game.players[3].dormantCards = [];

    const model = buildTargetHeadModel(context, 353, {
        tv: [0, 5, 0],
        business: [0, 5, 0],
        mover: [0, 5, 0],
    });
    const bakeryIndex = CARDS.findIndex(card => card.name === 'パン屋');
    const cafeIndex = CARDS.findIndex(card => card.name === 'カフェ');
    model.layers.businessGiveHead.bias[bakeryIndex] = 5;
    model.layers.businessTakeHead.bias[cafeIndex] = 5;

    const cpu = new RLCPU(model);
    assert.strictEqual(cpu.chooseTVTarget(game), 2);

    game.pendingTV = 0;
    game.pendingBusiness = true;
    const businessMove = cpu.chooseBusinessMove(game);
    assert.ok(businessMove);
    assert.strictEqual(businessMove.targetIndex, 2);
    assert.strictEqual(businessMove.myCard, 3);
    assert.strictEqual(businessMove.theirCard, 0);

    game.pendingBusiness = false;
    game.pendingMover = 1;
    const moverMove = cpu.chooseMoverMove(game);
    assert.ok(moverMove);
    assert.strictEqual(moverMove.targetIndex, 2);
});

runTest('RLCPU: cleaning は明確に悪いカード名ならactive同名枚数fallbackへ切り替える', () => {
    const context = loadRLRuntime();
    const { RLCPU, GameManager, createCardByName, GAME_PHASES, CARDS } = context;
    const game = new GameManager(4);
    game.__shopStock = createDefaultShopStock(context);
    game.phase = GAME_PHASES.PENDING;
    game.currentPlayerIndex = 0;
    game.pendingCleaning = 1;

    game.currentPlayer().cards = [createCardByName('清掃業'), createCardByName('麦畑')];
    game.currentPlayer().dormantCards = [];
    game.players[1].cards = [createCardByName('カフェ'), createCardByName('カフェ'), createCardByName('パン屋')];
    game.players[1].dormantCards = [];
    game.players[2].cards = [createCardByName('カフェ'), createCardByName('ピザ屋')];
    game.players[2].dormantCards = [];
    game.players[3].cards = [createCardByName('サンマ漁船')];
    game.players[3].dormantCards = [];

    const model = buildParityModelWithStateDim(context, 353);
    const sanmaIndex = CARDS.findIndex(card => card.name === 'サンマ漁船');
    model.layers.policyHead.bias[RLCPU.ACTIONS.CLEAN_BASE + sanmaIndex] = 10;

    const cpu = new RLCPU(model);
    assert.strictEqual(cpu.chooseCleaningTarget(game), 'カフェ');
});

runTest('RLCPU: pending business は休業中カードだけでも合法手になる', () => {
    const context = loadRLRuntime();
    const { RLCPU, GAME_PHASES } = context;
    const cpu = new RLCPU(buildTargetHeadModel(context, 353));
    const game = buildGameFromFixtureSetup(context, {
        current: 0,
        phase: GAME_PHASES.PENDING,
        pendingTV: 0,
        pendingBusiness: 1,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        lastDice: 0,
        lastDice1: 0,
        lastDice2: 0,
        turnCount: 12,
        players: [
            { coins: 3, cards: { 'パン屋': 1 }, dormant: { 'パン屋': 1 }, landmarks: {}, itVentureCoins: 0 },
            { coins: 3, cards: { '寿司屋': 1 }, dormant: { '寿司屋': 1 }, landmarks: {}, itVentureCoins: 0 },
            { coins: 3, cards: {}, dormant: {}, landmarks: {}, itVentureCoins: 0 },
            { coins: 3, cards: {}, dormant: {}, landmarks: {}, itVentureCoins: 0 },
        ],
    });
    const giveIndex = context.CARDS.findIndex(card => card.name === 'パン屋');
    const takeIndex = context.CARDS.findIndex(card => card.name === '寿司屋');
    const action = RLCPU.ACTIONS.BC_BASE + giveIndex * context.CARDS.length + takeIndex;
    assert.strictEqual(cpu.actionMask(game)[action], 1);
});

runTest('RLCPU: pending business はtarget headなしでも全相手から合法交換を探す', () => {
    const context = loadRLRuntime();
    const { RLCPU, GAME_PHASES } = context;
    const model = buildParityModelWithStateDim(context, 353);
    const giveIndex = context.CARDS.findIndex(card => card.name === 'パン屋');
    const takeIndex = context.CARDS.findIndex(card => card.name === '寿司屋');
    model.layers.businessGiveHead.bias[giveIndex] = 10;
    model.layers.businessTakeHead.bias[takeIndex] = 10;
    const cpu = new RLCPU(model);
    const game = buildGameFromFixtureSetup(context, {
        current: 0,
        phase: GAME_PHASES.PENDING,
        pendingTV: 0,
        pendingBusiness: 1,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        lastDice: 0,
        lastDice1: 0,
        lastDice2: 0,
        turnCount: 12,
        players: [
            { coins: 3, cards: { 'パン屋': 1 }, dormant: {}, landmarks: {}, itVentureCoins: 0 },
            { coins: 30, cards: {}, dormant: {}, landmarks: {}, itVentureCoins: 0 },
            { coins: 3, cards: { '寿司屋': 1 }, dormant: {}, landmarks: {}, itVentureCoins: 0 },
            { coins: 3, cards: {}, dormant: {}, landmarks: {}, itVentureCoins: 0 },
        ],
    });
    const action = RLCPU.ACTIONS.BC_BASE + giveIndex * context.CARDS.length + takeIndex;

    assert.strictEqual(cpu.actionMask(game)[action], 1);
    const move = cpu.chooseBusinessMove(game);
    assert.strictEqual(move.myCard, 0);
    assert.strictEqual(move.targetIndex, 2);
    assert.strictEqual(move.theirCard, 0);
});

runTest('RLCPU: target head の上位枠外にだけ合法business対象がいてもfallbackする', () => {
    const context = loadRLRuntime();
    const { RLCPU, GAME_PHASES } = context;
    const model = buildTargetHeadModel(context, 353, { business: [10, 0, 0] });
    const giveIndex = context.CARDS.findIndex(card => card.name === 'パン屋');
    const takeIndex = context.CARDS.findIndex(card => card.name === '寿司屋');
    model.layers.businessGiveHead.bias[giveIndex] = 10;
    model.layers.businessTakeHead.bias[takeIndex] = 10;
    const cpu = new RLCPU(model);
    const game = buildGameFromFixtureSetup(context, {
        current: 0,
        phase: GAME_PHASES.PENDING,
        pendingTV: 0,
        pendingBusiness: 1,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        lastDice: 0,
        lastDice1: 0,
        lastDice2: 0,
        turnCount: 12,
        players: [
            { coins: 3, cards: { 'パン屋': 1 }, dormant: {}, landmarks: {}, itVentureCoins: 0 },
            { coins: 50, cards: { 'スタジアム': 1 }, dormant: {}, landmarks: {}, itVentureCoins: 0 },
            { coins: 40, cards: { 'テレビ局': 1 }, dormant: {}, landmarks: {}, itVentureCoins: 0 },
            { coins: 30, cards: { 'ビジネスセンター': 1 }, dormant: {}, landmarks: {}, itVentureCoins: 0 },
            { coins: 1, cards: { '寿司屋': 1 }, dormant: {}, landmarks: {}, itVentureCoins: 0 },
        ],
    });

    const move = cpu.chooseBusinessMove(game);
    assert.strictEqual(move.myCard, 0);
    assert.strictEqual(move.targetIndex, 4);
    assert.strictEqual(move.theirCard, 0);
});

runTest('RLCPU: target head の上位枠外にだけTV対象がいてもfallbackする', () => {
    const context = loadRLRuntime();
    const { RLCPU, GAME_PHASES } = context;
    const cpu = new RLCPU(buildTargetHeadModel(context, 353, { tv: [10, 0, 0] }));
    const game = buildGameFromFixtureSetup(context, {
        current: 0,
        phase: GAME_PHASES.PENDING,
        pendingTV: 1,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        lastDice: 0,
        lastDice1: 0,
        lastDice2: 0,
        turnCount: 12,
        players: [
            { coins: 3, cards: {}, dormant: {}, landmarks: {}, itVentureCoins: 0 },
            { coins: 0, cards: { 'スタジアム': 1 }, dormant: {}, landmarks: {}, itVentureCoins: 0 },
            { coins: 0, cards: { 'テレビ局': 1 }, dormant: {}, landmarks: {}, itVentureCoins: 0 },
            { coins: 0, cards: { 'ビジネスセンター': 1 }, dormant: {}, landmarks: {}, itVentureCoins: 0 },
            { coins: 1, cards: {}, dormant: {}, landmarks: {}, itVentureCoins: 0 },
        ],
    });

    assert.strictEqual(cpu.chooseTVTarget(game), 4);
});

runTest('RLCPU: pending mover は休業中カードだけでも合法手になる', () => {
    const context = loadRLRuntime();
    const { RLCPU, GAME_PHASES } = context;
    const cpu = new RLCPU(buildTargetHeadModel(context, 353));
    const game = buildGameFromFixtureSetup(context, {
        current: 0,
        phase: GAME_PHASES.PENDING,
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 1,
        pendingRenovation: 0,
        pendingIT: false,
        lastDice: 0,
        lastDice1: 0,
        lastDice2: 0,
        turnCount: 12,
        players: [
            { coins: 3, cards: { 'パン屋': 1 }, dormant: { 'パン屋': 1 }, landmarks: {}, itVentureCoins: 0 },
            { coins: 3, cards: { '麦畑': 1 }, dormant: {}, landmarks: {}, itVentureCoins: 0 },
            { coins: 3, cards: { '麦畑': 1 }, dormant: {}, landmarks: {}, itVentureCoins: 0 },
            { coins: 3, cards: { '麦畑': 1 }, dormant: {}, landmarks: {}, itVentureCoins: 0 },
        ],
    });
    const cardIndex = context.CARDS.findIndex(card => card.name === 'パン屋');
    const action = RLCPU.ACTIONS.MOVER_BASE + cardIndex;
    assert.strictEqual(cpu.actionMask(game)[action], 1);
});

runTest('RLCPU: business/mover は同名カード混在時に具体的なカードindexを返す', () => {
    const context = loadRLRuntime();
    const { RLCPU, GameManager, createCardByName, GAME_PHASES, CARDS } = context;
    const model = buildParityModelWithStateDim(context, 353);
    const cafeIndex = CARDS.findIndex(card => card.name === 'カフェ');
    const bakeryIndex = CARDS.findIndex(card => card.name === 'パン屋');
    model.layers.businessGiveHead.bias[cafeIndex] = 10;
    model.layers.businessTakeHead.bias[bakeryIndex] = 10;
    model.layers.policyHead.bias[RLCPU.ACTIONS.MOVER_BASE + cafeIndex] = 10;
    const cpu = new RLCPU(model);
    const game = new GameManager(2);
    game.phase = GAME_PHASES.PENDING;
    game.currentPlayerIndex = 0;
    const dormantCafe = createCardByName('カフェ');
    const activeCafe = createCardByName('カフェ');
    game.currentPlayer().cards = [activeCafe, dormantCafe];
    game.currentPlayer().makeDormant(dormantCafe);
    const dormantBakery = createCardByName('パン屋');
    const activeBakery = createCardByName('パン屋');
    game.players[1].cards = [dormantBakery, activeBakery];
    game.players[1].makeDormant(dormantBakery);

    game.pendingBusiness = 1;
    const businessMove = cpu.chooseBusinessMove(game);
    assert.strictEqual(businessMove.myCard, 1);
    assert.strictEqual(businessMove.targetIndex, 1);
    assert.strictEqual(businessMove.theirCard, 1);

    game.pendingBusiness = 0;
    game.pendingMover = 1;
    const moverMove = cpu.chooseMoverMove(game);
    assert.strictEqual(moverMove.cardIndex, 1);
});

runTest('RLCPU: build は推論例外をfalseへ変換して盤面を変更しない', () => {
    const context = loadRLRuntime();
    const { RLCPU, GameManager, GAME_PHASES } = context;
    const cpu = new RLCPU(buildParityModelWithStateDim(context, 353));
    const game = new GameManager(2);
    const shopStock = createDefaultShopStock(context);
    game.phase = GAME_PHASES.BUILD;
    game.currentPlayer().coins = 20;
    const beforeCards = game.currentPlayer().cards.length;
    const beforeStock = JSON.stringify(shopStock);
    cpu._chooseForGame = () => { throw new Error('injected inference failure'); };
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        assert.strictEqual(cpu.build(game, shopStock), false);
    } finally {
        console.error = originalConsoleError;
    }
    assert.strictEqual(game.currentPlayer().cards.length, beforeCards);
    assert.strictEqual(game.builtThisTurn, false);
    assert.strictEqual(JSON.stringify(shopStock), beforeStock);
});

runTest('RLCPU: online build gate は非ホスト・再接続・切断中に送信もローカル適用もしない', () => {
    const cases = [
        ['non-host', { isRoomHost: false, isReconnectingOnline: false, socket: { connected: true } }],
        ['reconnecting', { isRoomHost: true, isReconnectingOnline: true, socket: { connected: true } }],
        ['disconnected', { isRoomHost: true, isReconnectingOnline: false, socket: { connected: false } }],
    ];

    for (const [label, gateState] of cases) {
        const context = loadRLRuntime();
        const { RLCPU, GameManager, GAME_PHASES } = context;
        const model = buildParityModelWithStateDim(context, 353);
        const cardIndex = context.CARDS.findIndex(card => card.name === '森林');
        model.layers.policyHead.bias[RLCPU.ACTIONS.BUY_CARD_BASE + cardIndex] = 10;
        const cpu = new RLCPU(model);
        const game = new GameManager(2);
        const shopStock = createDefaultShopStock(context);
        const sent = [];
        game.phase = GAME_PHASES.BUILD;
        game.currentPlayer().coins = 10;
        context.isOnlineGame = true;
        context.isRoomHost = gateState.isRoomHost;
        context.isReconnectingOnline = gateState.isReconnectingOnline;
        context.socket = gateState.socket;
        context.sendAction = (action, data) => {
            sent.push({ action, data });
            return true;
        };

        assert.strictEqual(cpu.build(game, shopStock), false, label);
        assert.strictEqual(sent.length, 0, label);
        assert.strictEqual(game.currentPlayer().cards.some(card => card.name === '森林'), false, label);
        assert.strictEqual(shopStock['森林'], 6, label);
    }
});

runTest('RLCPU: online build はローカル適用せず sendAction へ送る', () => {
    const context = loadRLRuntime();
    const { RLCPU, GameManager, GAME_PHASES, Player } = context;
    const model = buildParityModelWithStateDim(context, 353);
    const cardIndex = context.CARDS.findIndex(card => card.name === '森林');
    model.layers.policyHead.bias[RLCPU.ACTIONS.BUY_CARD_BASE + cardIndex] = 10;
    const cpu = new RLCPU(model);
    const game = new GameManager(2);
    const shopStock = createDefaultShopStock(context);
    game.phase = GAME_PHASES.BUILD;
    game.currentPlayer().coins = 10;
    const sent = [];
    context.isOnlineGame = true;
    context.isRoomHost = true;
    context.isReconnectingOnline = false;
    context.socket = { connected: true };
    context.sendAction = (action, data) => {
        sent.push({ action, data });
        return true;
    };

    assert.strictEqual(cpu.build(game, shopStock), true);

    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].action, 'buildCard');
    assert.strictEqual(sent[0].data.cardName, '森林');
    assert.strictEqual(game.currentPlayer().cards.some(card => card.name === '森林'), false);
    assert.strictEqual(shopStock['森林'], 6);

    const landmarkModel = buildParityModelWithStateDim(context, 353);
    const stationIndex = RLCPU.LANDMARK_ORDER.indexOf('駅');
    landmarkModel.layers.policyHead.bias[RLCPU.ACTIONS.BUY_LM_BASE + stationIndex] = 10;
    const landmarkCpu = new RLCPU(landmarkModel);
    sent.length = 0;
    game.currentPlayer().coins = Player.landmarkCost('駅');
    assert.strictEqual(landmarkCpu.build(game, shopStock), true);

    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].action, 'buildLandmark');
    assert.strictEqual(sent[0].data.name, '駅');
    assert.strictEqual(game.currentPlayer().landmarks['駅'], false);

    context.sendAction = (action, data) => {
        sent.push({ action, data });
        return false;
    };
    sent.length = 0;
    assert.strictEqual(cpu.build(game, shopStock), false);
    assert.strictEqual(sent.length, 1);
});
