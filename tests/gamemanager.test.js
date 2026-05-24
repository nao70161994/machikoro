const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const { loadGameRuntime } = require('./helpers/runtime-loaders');

const runtime = loadGameRuntime();
const GameManager = runtime.GameManager;
const Player = runtime.Player;
const createCardByName = runtime.createCardByName;
const createCardById = runtime.createCardById;
const CARD_EFFECTS = runtime.CARD_EFFECTS;
const CARD_CATEGORIES = runtime.CARD_CATEGORIES;
const CARD_CATEGORY_GROUPS = runtime.CARD_CATEGORY_GROUPS;
const isCardInCategoryGroup = runtime.isCardInCategoryGroup;
const CARD_IDS = runtime.CARD_IDS;
const CARD_NAME_BY_ID = runtime.CARD_NAME_BY_ID;
const CARD_ID_BY_NAME = runtime.CARD_ID_BY_NAME;
const CARD_EFFECT_METADATA = runtime.CARD_EFFECT_METADATA;
const CARDS = runtime.CARDS;
const CARD_DEFS = runtime.CARD_DEFS;
const CARD_INCOME_EFFECT_HANDLERS = runtime.CARD_INCOME_EFFECT_HANDLERS;
const GAME_PHASES = runtime.GAME_PHASES;
const GAME_ACTIONS = runtime.GAME_ACTIONS;
const LOG_TYPES = runtime.LOG_TYPES;
const GAME_PHASE_ACTIONS = runtime.GAME_PHASE_ACTIONS;
const GAME_ACTION_REGISTRY = runtime.GAME_ACTION_REGISTRY;
const PENDING_IT_QUEUE_POLICY = runtime.PENDING_IT_QUEUE_POLICY;

runTest('CARD_EFFECT_METADATA は CARD_EFFECTS を網羅する', () => {
    const effects = Object.values(CARD_EFFECTS);
    assert.deepStrictEqual(
        Object.keys(CARD_EFFECT_METADATA).sort(),
        effects.slice().sort()
    );
    for (const effect of effects) {
        const metadata = CARD_EFFECT_METADATA[effect];
        assert.ok(metadata.timing, `metadata timing missing: ${effect}`);
        assert.ok(metadata.targetScope, `metadata targetScope missing: ${effect}`);
        assert.ok(metadata.cpuKind, `metadata cpuKind missing: ${effect}`);
    }
});

runTest('CARD_EFFECT_METADATA の分類値と複合triggerは許可値だけを使う', () => {
    const allowedTimings = new Set(['income', 'pending', 'build', 'turnEnd']);
    const allowedScopes = new Set(['self', 'current', 'opponent', 'opponents', 'all']);
    const allowedKinds = new Set(['income', 'comboIncome', 'conditionalIncome', 'conditionalSteal', 'interactive', 'steal', 'upkeep', 'redistribute']);
    const allowedTriggers = new Set(['onBuild', 'afterIncome', 'turnEndPrompt']);

    for (const metadata of Object.values(CARD_EFFECT_METADATA)) {
        assert.ok(allowedTimings.has(metadata.timing));
        assert.ok(allowedScopes.has(metadata.targetScope));
        assert.ok(allowedKinds.has(metadata.cpuKind));
        if (metadata.triggers) {
            assert.ok(Array.isArray(metadata.triggers));
            assert.ok(metadata.triggers.every(trigger => allowedTriggers.has(trigger)));
        }
    }
    assert.deepStrictEqual(Array.from(CARD_EFFECT_METADATA[CARD_EFFECTS.LOAN].triggers), ['onBuild', 'afterIncome']);
    assert.deepStrictEqual(Array.from(CARD_EFFECT_METADATA[CARD_EFFECTS.ITSTARTUP].triggers), ['afterIncome', 'turnEndPrompt']);
});


runTest('CARD_CATEGORY_GROUPS は飲食店・商店の分類判定を共有する', () => {
    assert.ok(CARD_CATEGORY_GROUPS.RESTAURANT_OR_SHOP.includes(CARD_CATEGORIES.RESTAURANT));
    assert.ok(CARD_CATEGORY_GROUPS.RESTAURANT_OR_SHOP.includes(CARD_CATEGORIES.SHOP));
    assert.strictEqual(isCardInCategoryGroup(CARDS.find(c => c.name === 'パン屋'), CARD_CATEGORY_GROUPS.RESTAURANT_OR_SHOP), true);
    assert.strictEqual(isCardInCategoryGroup(CARDS.find(c => c.name === '麦畑'), CARD_CATEGORY_GROUPS.RESTAURANT_OR_SHOP), false);
});

runTest('getCardActivationProfile は NORMAL の色別対象と複合triggerを返す', () => {
    const wheat = createCardByName('麦畑');
    const cafe = createCardByName('カフェ');
    const bakery = createCardByName('パン屋');
    const loan = createCardByName('貸金業');
    const itStartup = createCardByName('ITベンチャー');

    assert.deepStrictEqual(plainProfile(runtime.getCardActivationProfile(wheat)), {
        cardId: CARD_IDS.WHEAT_FIELD,
        effect: CARD_EFFECTS.NORMAL,
        color: 'blue',
        timing: 'income',
        targetScope: 'self',
        cpuKind: 'income',
        requires: null,
        sideEffect: null,
        incomeHandler: null,
        triggers: [],
    });
    assert.deepStrictEqual(plainProfile(runtime.getCardActivationProfile(bakery)).targetScope, 'self');
    assert.deepStrictEqual(plainProfile(runtime.getCardActivationProfile(cafe)).targetScope, 'current');
    assert.deepStrictEqual(plainProfile(runtime.getCardActivationProfile(cafe)).cpuKind, 'conditionalSteal');
    assert.deepStrictEqual(plainProfile(runtime.getCardActivationProfile(loan)).triggers, ['onBuild', 'afterIncome']);
    assert.deepStrictEqual(plainProfile(runtime.getCardActivationProfile(itStartup)).triggers, ['afterIncome', 'turnEndPrompt']);
    assert.deepStrictEqual(plainProfile(GameManager.cardActivationProfile(cafe)), plainProfile(runtime.getCardActivationProfile(cafe)));
});

function plainProfile(profile) {
    return Object.assign({}, profile, { triggers: Array.from(profile.triggers) });
}

runTest('CARD_DEFS は CARDS と ID map の正本になる', () => {
    assert.strictEqual(CARD_DEFS.length, runtime.CARDS.length);
    assert.deepStrictEqual(
        CARD_DEFS.map(def => def.id),
        runtime.CARDS.map(card => card.id)
    );
    assert.deepStrictEqual(
        CARD_DEFS.map(def => def.name),
        runtime.CARDS.map(card => card.name)
    );
    for (const def of CARD_DEFS) {
        assert.strictEqual(CARD_NAME_BY_ID[def.id], def.name);
        assert.strictEqual(CARD_ID_BY_NAME[def.name], def.id);
    }
});

runTest('CARD_IDS は全カード名へ対応する', () => {
    const ids = Object.values(CARD_IDS);
    assert.strictEqual(new Set(ids).size, ids.length);
    assert.deepStrictEqual(
        Array.from(Object.keys(CARD_NAME_BY_ID), String).sort(),
        Array.from(ids, String).sort()
    );
    assert.deepStrictEqual(
        Array.from(Object.values(CARD_NAME_BY_ID), String).sort(),
        Array.from(runtime.CARDS, card => card.name).sort()
    );
    for (const [id, name] of Object.entries(CARD_NAME_BY_ID)) {
        assert.strictEqual(CARD_ID_BY_NAME[name], id);
    }
});

runTest('Card の stable id は clone と createCardById で保持される', () => {
    const ids = Object.values(CARD_IDS);
    for (const card of runtime.CARDS) {
        assert.ok(card.id, 'card id missing: ' + card.name);
        assert.strictEqual(CARD_NAME_BY_ID[card.id], card.name);
        assert.ok(ids.includes(card.id), 'unknown card id: ' + card.id);

        const byName = createCardByName(card.name);
        const byId = createCardById(card.id);
        assert.strictEqual(byName.id, card.id);
        assert.deepStrictEqual(byId, byName);
    }
});

runTest('CARD_INCOME_EFFECT_HANDLERS は金額計算だけを共有する effect を網羅する', () => {
    const expected = [
        CARD_EFFECTS.CHEESE,
        CARD_EFFECTS.FURNITURE,
        CARD_EFFECTS.MARKET,
        CARD_EFFECTS.FLOWER,
        CARD_EFFECTS.FOODWAREHOUSE,
        CARD_EFFECTS.FEWLANDMARK,
        CARD_EFFECTS.CORNFIELD,
        CARD_EFFECTS.WINERY,
        CARD_EFFECTS.DRINKFACTORY,
    ];
    assert.deepStrictEqual(
        Object.keys(CARD_INCOME_EFFECT_HANDLERS).sort(),
        expected.slice().sort()
    );
    for (const effect of expected) {
        assert.strictEqual(CARD_EFFECT_METADATA[effect].timing, 'income');
    }
});

runTest('GAME_PHASE_ACTIONS は単純フェーズの許可actionを定義する', () => {
    assert.deepStrictEqual([...GAME_PHASE_ACTIONS[GAME_PHASES.ROLL]], [GAME_ACTIONS.ROLL_DICE]);
    assert.deepStrictEqual([...GAME_PHASE_ACTIONS[GAME_PHASES.SELECT_DICE]], [GAME_ACTIONS.SELECT_DICE]);
    assert.deepStrictEqual([...GAME_PHASE_ACTIONS[GAME_PHASES.REROLL_CONFIRM]], [GAME_ACTIONS.REROLL_DICE, GAME_ACTIONS.SKIP_REROLL]);
    assert.deepStrictEqual([...GAME_PHASE_ACTIONS[GAME_PHASES.HARBOR_CHOICE]], [GAME_ACTIONS.RESOLVE_HARBOR]);
    assert.deepStrictEqual([...GAME_PHASE_ACTIONS[GAME_PHASES.BUILD]], [GAME_ACTIONS.BUILD_CARD, GAME_ACTIONS.BUILD_LANDMARK, GAME_ACTIONS.NEXT_TURN, GAME_ACTIONS.UNDO_BUILD]);
});

runTest('GAME_ACTION metadata tables は外部変更できない frozen contract を持つ', () => {
    assert.ok(Object.isFrozen(GAME_ACTIONS), 'GAME_ACTIONS must be frozen');
    assert.ok(Object.isFrozen(GAME_PHASE_ACTIONS), 'GAME_PHASE_ACTIONS must be frozen');
    assert.ok(Object.isFrozen(GAME_ACTION_REGISTRY), 'GAME_ACTION_REGISTRY must be frozen');
    for (const [phase, actions] of Object.entries(GAME_PHASE_ACTIONS)) {
        assert.ok(Object.isFrozen(actions), `${phase} phase action list must be frozen`);
    }
    for (const [action, entry] of Object.entries(GAME_ACTION_REGISTRY)) {
        assert.ok(Object.isFrozen(entry), `${action} registry entry must be frozen`);
    }
});

runTest('GAME_ACTION_REGISTRY の phase metadata は allowed action contract と同期する', () => {
    const actions = Object.values(GAME_ACTIONS);
    assert.deepStrictEqual(Object.keys(GAME_ACTION_REGISTRY).sort(), actions.slice().sort());

    for (const [phase, phaseActions] of Object.entries(GAME_PHASE_ACTIONS)) {
        for (const action of phaseActions) {
            assert.strictEqual(GAME_ACTION_REGISTRY[action].phase, phase, `${action} phase metadata mismatch`);
        }
    }

    const pendingActions = [
        GAME_ACTIONS.RESOLVE_TV,
        GAME_ACTIONS.RESOLVE_BUSINESS,
        GAME_ACTIONS.RESOLVE_CLEANING,
        GAME_ACTIONS.RESOLVE_MOVER,
        GAME_ACTIONS.RESOLVE_RENOVATION,
        GAME_ACTIONS.RESOLVE_IT,
    ];
    for (const action of pendingActions) {
        assert.strictEqual(GAME_ACTION_REGISTRY[action].phase, GAME_PHASES.PENDING, `${action} must remain pending phase`);
        assert.ok(GAME_ACTION_REGISTRY[action].payloadKind.startsWith('resolve'), `${action} pending payload kind must be resolve*`);
    }

    const nonPendingPhaseActions = new Set(Object.values(GAME_PHASE_ACTIONS).flat());
    for (const action of actions) {
        if (pendingActions.includes(action)) continue;
        assert.ok(nonPendingPhaseActions.has(action), `${action} must be listed in GAME_PHASE_ACTIONS or pending action list`);
    }
});

runTest('GAME_ACTION_REGISTRY entries は余分なmetadata keyを持たない', () => {
    const actionValues = Object.values(GAME_ACTIONS);
    assert.strictEqual(new Set(actionValues).size, actionValues.length, 'GAME_ACTIONS values must be unique');

    const allowedEntryKeys = ['action', 'phase', 'payloadKind', 'serverPayload', 'serverReplay', 'clientApply'];
    for (const [key, entry] of Object.entries(GAME_ACTION_REGISTRY)) {
        assert.strictEqual(entry.action, key, `${key} registry key/action mismatch`);
        assert.deepStrictEqual(Object.keys(entry), allowedEntryKeys, `${key} registry metadata keys changed`);
    }
});

runTest('GAME_ACTION_REGISTRY の payload metadata は固定schemaに従う', () => {
    const knownPayloadKinds = new Set([
        'rollDice',
        'selectDice',
        'rerollDice',
        'emptyObject',
        'resolveHarbor',
        'resolveTV',
        'resolveBusiness',
        'resolveCleaning',
        'resolveMover',
        'resolveRenovation',
        'resolveIT',
        'buildCard',
        'buildLandmark',
        'undoBuild',
    ]);
    const emptyPayloadActions = new Set([GAME_ACTIONS.SKIP_REROLL, GAME_ACTIONS.NEXT_TURN]);

    for (const action of Object.values(GAME_ACTIONS)) {
        const entry = GAME_ACTION_REGISTRY[action];
        assert.ok(Object.isFrozen(entry), `${action} registry entry must be frozen`);
        assert.strictEqual(entry.action, action, `${action} registry action must match key`);
        assert.ok(knownPayloadKinds.has(entry.payloadKind), `${action} unknown payloadKind: ${entry.payloadKind}`);
        assert.strictEqual(entry.serverPayload, true, `${action} serverPayload contract must be explicit`);
        assert.strictEqual(entry.serverReplay, true, `${action} serverReplay contract must be explicit`);
        assert.strictEqual(entry.clientApply, true, `${action} clientApply contract must be explicit`);
        if (entry.payloadKind === 'emptyObject') {
            assert.ok(emptyPayloadActions.has(action), `${action} is not allowed to use emptyObject payload metadata`);
        }
    }
});

runTest('GAME_ACTION_REGISTRY の payloadKind は空payload以外action名と一致する', () => {
    for (const action of Object.values(GAME_ACTIONS)) {
        const entry = GAME_ACTION_REGISTRY[action];
        if (entry.payloadKind === 'emptyObject') continue;
        assert.strictEqual(entry.payloadKind, action, `${action} payloadKind should match action for shared validator/apply routing`);
    }
});

runTest('GameManager は不正カードと未知ランドマーク建設を拒否する', () => {
    const game = new GameManager(2);
    game.phase = GAME_PHASES.BUILD;
    game.currentPlayer().coins = 10;
    game.enabledLandmarks = new Set([...Player.landmarkNames(), '謎ランドマーク']);

    assert.strictEqual(game.buildCard(null), false);
    assert.strictEqual(game.buildLandmark('謎ランドマーク'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(game.currentPlayer().landmarks, '謎ランドマーク'), false);
});

runTest('allowedActions は phase と pending 状態から許可actionを返す', () => {
    const game = new GameManager(2);
    assert.deepStrictEqual([...game.allowedActions()].sort(), [GAME_ACTIONS.ROLL_DICE]);

    game.phase = GAME_PHASES.PENDING;
    game.pendingTV = 1;
    game.pendingMover = 1;
    assert.deepStrictEqual([...game.allowedActions()], [GAME_ACTIONS.RESOLVE_TV]);

    game.pendingIT = true;
    assert.deepStrictEqual([...game.allowedActions()], [GAME_ACTIONS.RESOLVE_IT]);

    game.pendingIT = false;
    game.phase = GAME_PHASES.BUILD;
    game.pendingTV = 0;
    game.pendingMover = 0;
    assert.deepStrictEqual(
        [...game.allowedActions()].sort(),
        [GAME_ACTIONS.BUILD_CARD, GAME_ACTIONS.BUILD_LANDMARK, GAME_ACTIONS.NEXT_TURN, GAME_ACTIONS.UNDO_BUILD].sort()
    );

    game.phase = GAME_PHASES.PENDING;
    assert.deepStrictEqual([...game.allowedActions()], []);

    game.phase = 'unknownPhase';
    assert.deepStrictEqual([...game.allowedActions()], []);
});

runTest('pendingActionsFor は pending field を解決順descriptorとして返す', () => {
    const plain = value => JSON.parse(JSON.stringify(value));
    const game = new GameManager(2);
    assert.deepStrictEqual(plain(GameManager.pendingActionsFor(null)), []);
    assert.deepStrictEqual(plain(game.pendingActions()), []);

    game.phase = GAME_PHASES.PENDING;
    game.pendingTV = 2;
    game.pendingBusiness = 1;
    game.pendingMover = 1;
    assert.deepStrictEqual(plain(game.pendingActions()), [
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV', count: 2 },
        { action: GAME_ACTIONS.RESOLVE_BUSINESS, field: 'pendingBusiness', count: 1 },
        { action: GAME_ACTIONS.RESOLVE_MOVER, field: 'pendingMover', count: 1 },
    ]);

    game.pendingIT = true;
    assert.deepStrictEqual(plain(PENDING_IT_QUEUE_POLICY), {
        field: 'pendingIT',
        action: GAME_ACTIONS.RESOLVE_IT,
        queued: false,
        reason: PENDING_IT_QUEUE_POLICY.reason,
    });
    assert.deepStrictEqual(plain(game.pendingActions()), [
        { action: GAME_ACTIONS.RESOLVE_IT, field: 'pendingIT', count: 1 },
    ]);
    assert.deepStrictEqual(plain(GameManager.serializedPendingActionsFor(game)), [
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV' },
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV' },
        { action: GAME_ACTIONS.RESOLVE_BUSINESS, field: 'pendingBusiness' },
        { action: GAME_ACTIONS.RESOLVE_MOVER, field: 'pendingMover' },
    ]);

    game.pendingIT = false;
    game.phase = GAME_PHASES.BUILD;
    game.pendingTV = 1;
    assert.deepStrictEqual(plain(game.pendingActions()), []);
});

runTest('pendingActions queue は action/field 不一致entryを捨ててfieldから補修する', () => {
    const game = new GameManager(2);
    game.phase = GAME_PHASES.PENDING;
    game.pendingTV = 1;
    game.pendingActionQueue = [{ action: GAME_ACTIONS.RESOLVE_BUSINESS, field: 'pendingTV' }];

    const pending = GameManager.pendingActionsFor(game);

    assert.deepStrictEqual(Array.from(pending.map(entry => entry.action)), [GAME_ACTIONS.RESOLVE_TV]);
});

runTest('pendingActions queue は互換fieldとdual-writeされる', () => {
    const plain = value => JSON.parse(JSON.stringify(value));
    const game = new GameManager(2);
    game.phase = GAME_PHASES.PENDING;

    assert.strictEqual(game._enqueuePendingAction('pendingTV'), true);
    assert.strictEqual(game._enqueuePendingAction('pendingTV'), true);
    assert.strictEqual(game._enqueuePendingAction('pendingBusiness'), true);
    assert.strictEqual(game.pendingTV, 2);
    assert.strictEqual(game.pendingBusiness, 1);
    assert.deepStrictEqual(plain(game.pendingActionQueue), [
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV' },
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV' },
        { action: GAME_ACTIONS.RESOLVE_BUSINESS, field: 'pendingBusiness' },
    ]);
    assert.deepStrictEqual(plain(game.pendingActions()), [
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV', count: 2 },
        { action: GAME_ACTIONS.RESOLVE_BUSINESS, field: 'pendingBusiness', count: 1 },
    ]);

    assert.strictEqual(game._consumePendingAction('pendingTV'), true);
    assert.strictEqual(game.pendingTV, 1);
    assert.deepStrictEqual(plain(game.pendingActionQueue), [
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV' },
        { action: GAME_ACTIONS.RESOLVE_BUSINESS, field: 'pendingBusiness' },
    ]);

    game.pendingActionQueue = [];
    assert.deepStrictEqual(plain(game.pendingActions()), [
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV', count: 1 },
        { action: GAME_ACTIONS.RESOLVE_BUSINESS, field: 'pendingBusiness', count: 1 },
    ]);
    assert.deepStrictEqual(plain(game.pendingActionQueue), [
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV' },
        { action: GAME_ACTIONS.RESOLVE_BUSINESS, field: 'pendingBusiness' },
    ]);
    game.rebuildPendingActionsFromFields();
    assert.deepStrictEqual(plain(game.pendingActionQueue), [
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV' },
        { action: GAME_ACTIONS.RESOLVE_BUSINESS, field: 'pendingBusiness' },
    ]);
});

runTest('clearPendingField は対象fieldだけをqueueから除き残り順序を保つ', () => {
    const plain = value => JSON.parse(JSON.stringify(value));
    const game = new GameManager(2);
    game.phase = GAME_PHASES.PENDING;
    game.pendingActionQueue = [
        { action: GAME_ACTIONS.RESOLVE_BUSINESS, field: 'pendingBusiness' },
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV' },
        { action: GAME_ACTIONS.RESOLVE_MOVER, field: 'pendingMover' },
    ];
    game.pendingBusiness = 1;
    game.pendingTV = 1;
    game.pendingMover = 1;

    assert.strictEqual(game.clearPendingField('pendingBusiness'), true);

    assert.strictEqual(game.pendingBusiness, 0);
    assert.strictEqual(game.phase, GAME_PHASES.PENDING);
    assert.deepStrictEqual(plain(game.pendingActionQueue), [
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV' },
        { action: GAME_ACTIONS.RESOLVE_MOVER, field: 'pendingMover' },
    ]);
    assert.deepStrictEqual(plain(game.pendingActions()), [
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV', count: 1 },
        { action: GAME_ACTIONS.RESOLVE_MOVER, field: 'pendingMover', count: 1 },
    ]);
});

runTest('pendingActions queue は先頭のpendingだけを解決可能にする', () => {
    const game = new GameManager(2);
    game.phase = GAME_PHASES.PENDING;
    game.pendingActionQueue = [
        { action: GAME_ACTIONS.RESOLVE_BUSINESS, field: 'pendingBusiness' },
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV' },
    ];
    game.pendingBusiness = 1;
    game.pendingTV = 1;

    assert.deepStrictEqual([...game.allowedActions()], [GAME_ACTIONS.RESOLVE_BUSINESS]);
    assert.strictEqual(GameManager.canResolvePendingField(game, 'pendingTV'), false);
    assert.strictEqual(game._consumePendingAction('pendingTV'), false);
    assert.strictEqual(game.pendingTV, 1);

    assert.strictEqual(game._consumePendingAction('pendingBusiness'), true);
    assert.deepStrictEqual([...game.allowedActions()], [GAME_ACTIONS.RESOLVE_TV]);
});

runTest('resetPendingState と resetTurnState は共通turn fieldを初期化する', () => {
    const game = new GameManager(2);
    game.pendingTV = 1;
    game.pendingBusiness = 1;
    game.pendingCleaning = 1;
    game.pendingMover = 1;
    game.pendingRenovation = 1;
    game.pendingIT = true;
    game.resetPendingState();
    assert.deepStrictEqual(plainPendingState(game), {
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
    });

    game.log = [{ type: LOG_TYPES.SYSTEM, message: 'old' }];
    game.lastDiceResult = 8;
    game.lastDice1 = 4;
    game.lastDice2 = 4;
    game.pendingTunaDice = [3, 4];
    game.builtThisTurn = true;
    game.usedReroll = true;
    game.pendingTV = 1;
    game.hadAmusementParkAtRoll = true;

    game.resetTurnState({ clearLog: true });
    assert.strictEqual(game.log.length, 0);
    assert.strictEqual(game.lastDiceResult, 8);
    assert.strictEqual(game.lastDice1, 4);
    assert.strictEqual(game.lastDice2, 4);
    assert.strictEqual(game.pendingTunaDice[0], 3);
    assert.strictEqual(game.pendingTunaDice[1], 4);
    assert.strictEqual(game.builtThisTurn, false);
    assert.strictEqual(game.usedReroll, false);
    assert.strictEqual(game.pendingTV, 0);
    assert.strictEqual(game.hadAmusementParkAtRoll, false);

    game.resetTurnState({ clearDice: true });
    assert.strictEqual(game.lastDiceResult, 0);
    assert.strictEqual(game.lastDice1, 0);
    assert.strictEqual(game.lastDice2, 0);
    assert.strictEqual(game.pendingTunaDice, null);
});

function plainPendingState(game) {
    return {
        pendingTV: game.pendingTV,
        pendingBusiness: game.pendingBusiness,
        pendingCleaning: game.pendingCleaning,
        pendingMover: game.pendingMover,
        pendingRenovation: game.pendingRenovation,
        pendingIT: game.pendingIT,
    };
}

runTest('rollDice後にフェーズが適切に遷移する', () => {
    const normalGame = new GameManager(2);
    normalGame.rollDice(1);
    assert.strictEqual(normalGame.phase, 'build');

    const stationGame = new GameManager(2);
    stationGame.currentPlayer().landmarks['駅'] = true;
    stationGame.rollDice();
    assert.strictEqual(stationGame.phase, 'selectDice');
    stationGame.selectDiceCount(false, 1);
    assert.strictEqual(stationGame.phase, 'build');
});

runTest('1個振りの rollDice は lastDice1 に出目を保持する', () => {
    const game = new GameManager(2);
    game.rollDice(4);
    assert.strictEqual(game.lastDiceResult, 4);
    assert.strictEqual(game.lastDice1, 4);
    assert.strictEqual(game.lastDice2, 0);
});

runTest('rollRandomDieはwindow.cryptoがあればそれを優先する', () => {
    const originalWindow = runtime.window;
    const originalRandom = runtime.Math.random;
    try {
        runtime.window = {
            crypto: {
                getRandomValues(buffer) {
                    buffer[0] = 5;
                    return buffer;
                },
            },
        };
        runtime.Math.random = () => {
            throw new Error('Math.random should not be used when crypto is available');
        };

        assert.strictEqual(runtime.rollRandomDie(), 6);
    } finally {
        runtime.window = originalWindow;
        runtime.Math.random = originalRandom;
    }
});

runTest('改装屋のpendingRenovationがランドマーク状況に応じて変化する', () => {
    const pendingGame = new GameManager(2);
    pendingGame.currentPlayer().addCard(createCardByName('改装屋'));
    pendingGame.currentPlayer().landmarks['駅'] = true;
    pendingGame.rollDice();
    pendingGame.selectDiceCount(false, 4);
    assert.strictEqual(pendingGame.pendingRenovation, 1);
    assert.strictEqual(pendingGame.phase, 'pending');

    const skipGame = new GameManager(2);
    skipGame.currentPlayer().addCard(createCardByName('改装屋'));
    skipGame.rollDice(4);
    assert.strictEqual(skipGame.pendingRenovation, 0);
    assert.strictEqual(skipGame.phase, 'build');
});

runTest('resolveRenovation は不正な非連続pending queueで無限loopしない', () => {
    const game = new GameManager(2);
    const current = game.currentPlayer();
    game.phase = GAME_PHASES.PENDING;
    current.landmarks['駅'] = true;
    game.pendingRenovation = 2;
    game.pendingTV = 1;
    game.pendingActionQueue = [
        { action: GAME_ACTIONS.RESOLVE_RENOVATION, field: 'pendingRenovation' },
        { action: GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV' },
        { action: GAME_ACTIONS.RESOLVE_RENOVATION, field: 'pendingRenovation' },
    ];

    assert.strictEqual(game.resolveRenovation('駅'), true);
    assert.strictEqual(game.pendingRenovation, 1);
    assert.strictEqual(game.pendingTV, 1);
    assert.strictEqual(GameManager.nextPendingActionFor(game).field, 'pendingTV');
});

runTest('buildCardが所持金不足と紫カード重複を拒否する', () => {
    const poorGame = new GameManager(2);
    poorGame.currentPlayer().coins = 5;
    assert.strictEqual(poorGame.buildCard(createCardByName('鉱山')), false);
    assert.strictEqual(poorGame.currentPlayer().coins, 5);

    const duplicateGame = new GameManager(2);
    duplicateGame.currentPlayer().coins = 20;
    duplicateGame.currentPlayer().addCard(createCardByName('スタジアム'));
    assert.strictEqual(duplicateGame.buildCard(createCardByName('スタジアム')), false);
    assert.strictEqual(duplicateGame.currentPlayer().coins, 20);

    const legacyCard = Object.assign({}, createCardByName('スタジアム'), { id: undefined });
    assert.strictEqual(duplicateGame.buildCard(legacyCard), false);
    assert.strictEqual(duplicateGame.currentPlayer().coins, 20);
});

runTest('休業中の大施設も重複建設できない', () => {
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const stadium = createCardByName('スタジアム');
    current.coins = 20;
    current.addCard(stadium);
    current.makeDormant(stadium);

    assert.strictEqual(current.countCard('スタジアム'), 0);
    assert.strictEqual(game.buildCard(createCardByName('スタジアム')), false);
    assert.strictEqual(current.cards.filter(c => c.name === 'スタジアム').length, 1);
    assert.strictEqual(current.coins, 20);
});

runTest('nextTurnでpendingRenovationがリセットされる', () => {
    const game = new GameManager(2);
    game.phase = 'build';
    game.pendingRenovation = 2;
    game.lastDiceResult = 5;
    game.lastDice1 = 2;
    game.lastDice2 = 3;
    game.nextTurn();
    assert.strictEqual(game.pendingRenovation, 0);
    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.strictEqual(game.phase, 'roll');
    assert.strictEqual(game.lastDiceResult, 0);
    assert.strictEqual(game.lastDice1, 0);
    assert.strictEqual(game.lastDice2, 0);
});

runTest('引越し屋とビジネスセンターがカード単位で休業状態を引き継ぐ', () => {
    const moverGame = new GameManager(2);
    const moverCard = createCardByName('引越し屋');
    const cafeA = createCardByName('カフェ');
    const cafeB = createCardByName('カフェ');
    moverGame.currentPlayer().cards = [cafeA, cafeB, moverCard];
    moverGame.currentPlayer().dormantCards = [];
    moverGame.players[1].cards = [];
    moverGame.players[1].dormantCards = [];
    moverGame.currentPlayer().makeDormant(cafeB);
    moverGame.phase = GAME_PHASES.PENDING;
    moverGame.pendingMover = 1;
    moverGame.resolveMover(1, 1);
    assert.strictEqual(moverGame.players[1].cards.length, 1);
    assert.strictEqual(moverGame.players[1].cards[0], cafeB);
    assert.strictEqual(moverGame.players[1].isDormant(cafeB), true);
    assert.strictEqual(moverGame.currentPlayer().cards.includes(cafeB), false);

    const businessGame = new GameManager(2);
    const bakeryA = createCardByName('パン屋');
    const bakeryB = createCardByName('パン屋');
    const forest = createCardByName('森林');
    businessGame.currentPlayer().cards = [bakeryA, bakeryB];
    businessGame.players[1].cards = [forest];
    businessGame.currentPlayer().dormantCards = [];
    businessGame.players[1].dormantCards = [];
    businessGame.currentPlayer().makeDormant(bakeryB);
    businessGame.phase = GAME_PHASES.PENDING;
    businessGame.pendingBusiness = 1;
    businessGame.resolveBusiness(1, 1, 0);
    assert.strictEqual(businessGame.players[1].cards.includes(bakeryB), true);
    assert.strictEqual(businessGame.players[1].isDormant(bakeryB), true);
    assert.strictEqual(businessGame.currentPlayer().cards.some(c => c.name === '森林'), true);
});

runTest('清掃業は同名カードを全て休業にする', () => {
    const game = new GameManager(2);
    const cafeA = createCardByName('カフェ');
    const cafeB = createCardByName('カフェ');
    const family = createCardByName('ファミレス');
    game.currentPlayer().cards = [cafeA, family];
    game.currentPlayer().dormantCards = [];
    game.players[1].cards = [cafeB];
    game.players[1].dormantCards = [];
    game.phase = GAME_PHASES.PENDING;
    game.pendingCleaning = 1;

    game.resolveCleaning('カフェ');

    assert.strictEqual(game.currentPlayer().isDormant(cafeA), true);
    assert.strictEqual(game.players[1].isDormant(cafeB), true);
    assert.strictEqual(game.currentPlayer().isDormant(family), false);
});

runTest('清掃業は大施設を対象にできない', () => {
    const game = new GameManager(2);
    const stadium = createCardByName('スタジアム');
    game.players[1].cards = [stadium];
    game.phase = GAME_PHASES.PENDING;
    game.pendingCleaning = 1;

    const resolved = game.resolveCleaning('スタジアム');

    assert.strictEqual(resolved, false);
    assert.strictEqual(game.players[1].isDormant(stadium), false);
    assert.strictEqual(game.pendingCleaning, 1);
});

runTest('清掃業は休業可能な施設がなければpendingに入らない', () => {
    const game = new GameManager(2);
    game.currentPlayer().cards = [createCardByName('清掃業')];
    game.players[1].cards = [createCardByName('スタジアム')];

    game.rollDice(8);

    assert.strictEqual(game.pendingCleaning, 0);
    assert.notStrictEqual(game.phase, GAME_PHASES.PENDING);
});

runTest('ワイナリーは発動したカードだけ休業する', () => {
    const game = new GameManager(2);
    const grape = createCardByName('ブドウ園');
    const wineryA = createCardByName('ワイナリー');
    const wineryB = createCardByName('ワイナリー');
    game.currentPlayer().cards = [grape, wineryA, wineryB];
    game.currentPlayer().dormantCards = [];
    game.currentPlayer().makeDormant(wineryA);

    game.rollDice(9);

    assert.strictEqual(game.currentPlayer().isDormant(wineryA), false);
    assert.strictEqual(game.currentPlayer().isDormant(wineryB), true);
});

runTest('複数ワイナリーが同時発動しても同じ出目中に休業解除されない', () => {
    const game = new GameManager(2);
    const grape = createCardByName('ブドウ園');
    const wineryA = createCardByName('ワイナリー');
    const wineryB = createCardByName('ワイナリー');
    game.currentPlayer().cards = [grape, wineryA, wineryB];

    game.rollDice(9);

    assert.strictEqual(game.currentPlayer().isDormant(wineryA), true);
    assert.strictEqual(game.currentPlayer().isDormant(wineryB), true);
});

runTest('休業中の高級フレンチは相手が5を出すと休業解除だけ行う', () => {
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const opponent = game.players[1];
    const french = createCardByName('高級フレンチ');
    current.cards = [];
    current.dormantCards = [];
    current.landmarks['港'] = true;
    current.landmarks['ショッピングモール'] = true;
    current.coins = 10;
    opponent.cards = [french];
    opponent.dormantCards = [];
    opponent.coins = 0;
    opponent.makeDormant(french);

    game.rollDice(5);

    assert.strictEqual(opponent.isDormant(french), false);
    assert.strictEqual(current.coins, 10);
    assert.strictEqual(opponent.coins, 0);
});

runTest('休業中の高級フレンチ所持中に購入した高級フレンチは個別に発動する', () => {
    const game = new GameManager(2);
    const current = game.players[0];
    const opponent = game.players[1];
    const dormantFrench = createCardByName('高級フレンチ');
    opponent.cards = [dormantFrench];
    opponent.dormantCards = [];
    opponent.coins = 10;
    opponent.makeDormant(dormantFrench);

    game.currentPlayerIndex = 1;
    game.phase = 'build';
    assert.strictEqual(game.buildCard(createCardByName('高級フレンチ')), true);
    const boughtFrench = opponent.cards[1];
    assert.strictEqual(opponent.isDormant(dormantFrench), true);
    assert.strictEqual(opponent.isDormant(boughtFrench), false);

    game.currentPlayerIndex = 0;
    game.phase = 'roll';
    game.builtThisTurn = false;
    current.cards = [];
    current.dormantCards = [];
    current.landmarks['港'] = true;
    current.landmarks['ショッピングモール'] = true;
    current.coins = 10;
    opponent.coins = 0;

    game.rollDice(5);

    assert.strictEqual(opponent.isDormant(dormantFrench), false);
    assert.strictEqual(opponent.isDormant(boughtFrench), false);
    assert.strictEqual(current.coins, 5);
    assert.strictEqual(opponent.coins, 5);
});

runTest('遊園地はサイコロを振った時点で所持していないと発動しない', () => {
    const game = new GameManager(2);
    game.phase = 'build';
    game.lastDice1 = 3;
    game.lastDice2 = 3;
    game.hadAmusementParkAtRoll = false;
    game.currentPlayer().landmarks['遊園地'] = true;

    game.nextTurn();

    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.strictEqual(game.phase, 'roll');
});

runTest('有効なランドマークだけ建てれば勝利になる', () => {
    const game = new GameManager(2);
    game.enabledLandmarks = new Set(['駅', 'ショッピングモール']);
    game.currentPlayer().landmarks['駅'] = true;
    assert.strictEqual(game.checkWinner(), null);

    game.currentPlayer().landmarks['ショッピングモール'] = true;
    assert.strictEqual(game.checkWinner(), game.currentPlayer());
});

runTest('テレビ局はresolveTVで指定プレイヤーから最大5コイン奪う', () => {
    const game = new GameManager(2);
    game.pendingTV = 1;
    game.phase = 'pending';
    game.players[1].coins = 10;
    const prevMyCoins = game.currentPlayer().coins;

    game.resolveTV(1);

    assert.strictEqual(game.currentPlayer().coins, prevMyCoins + 5);
    assert.strictEqual(game.players[1].coins, 5);
    assert.strictEqual(game.pendingTV, 0);

    // 相手コインが少ない場合は持っている分だけ奪う
    const game2 = new GameManager(2);
    game2.pendingTV = 1;
    game2.phase = 'pending';
    game2.players[1].coins = 3;
    const prev2 = game2.currentPlayer().coins;
    game2.resolveTV(1);
    assert.strictEqual(game2.currentPlayer().coins, prev2 + 3);
    assert.strictEqual(game2.players[1].coins, 0);
});

runTest('pending解決は対応pendingが無ければ副作用を出さない', () => {
    const game = new GameManager(2);
    game.phase = GAME_PHASES.BUILD;
    game.players[0].coins = 3;
    game.players[1].coins = 5;

    assert.strictEqual(game.resolveTV(1), false);
    assert.strictEqual(game.players[0].coins, 3);
    assert.strictEqual(game.players[1].coins, 5);
});

runTest('build/nextTurn は BUILD フェーズ以外では副作用を出さない', () => {
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.coins = 20;

    assert.strictEqual(game.buildCard(createCardByName('森林')), false);
    assert.strictEqual(current.countCard('森林'), 0);
    assert.strictEqual(game.buildLandmark('駅'), false);
    assert.strictEqual(current.landmarks['駅'], false);
    assert.strictEqual(game.nextTurn(), false);
    assert.strictEqual(game.currentPlayerIndex, 0);
});

runTest('ITベンチャーはresolveIT(true)で積立、false でスキップ', () => {
    // resolveIT は _doNextTurn() を呼ぶのでターンが移る → players[0] で直接確認
    const game = new GameManager(2);
    game.pendingIT = true;
    const p0 = game.players[0];
    p0.coins = 5;
    p0.itVentureCoins = 2;
    game.phase = GAME_PHASES.PENDING;

    game.resolveIT(true);

    assert.strictEqual(p0.coins, 4);           // 5 - 1
    assert.strictEqual(p0.itVentureCoins, 3);  // 2 + 1
    assert.strictEqual(game.currentPlayerIndex, 1); // ターンが次へ

    const game2 = new GameManager(2);
    game2.pendingIT = true;
    game2.phase = GAME_PHASES.PENDING;
    const p0b = game2.players[0];
    p0b.coins = 5;
    p0b.itVentureCoins = 1;

    game2.resolveIT(false);

    assert.strictEqual(p0b.coins, 5);          // 変化なし
    assert.strictEqual(p0b.itVentureCoins, 1); // 変化なし
});

runTest('電波塔rerollDiceはlogをリセットしてphaseをrollに戻す', () => {
    const game = new GameManager(2);
    game.currentPlayer().landmarks['電波塔'] = true;
    game.rollDice(3);
    assert.strictEqual(game.phase, 'rerollConfirm');
    const logBeforeReroll = [...game.log];
    assert.ok(logBeforeReroll.length > 0);

    game.rerollDice(5);

    // rerollDice内でlog=[]→addLogするのでログがリセットされ新エントリのみになる
    assert.ok(!game.log.includes(logBeforeReroll[0]));
    assert.ok(game.log.some(e => e.message.includes('📡 電波塔で振り直し: 3 → 5')));
    assert.ok(game.log.some(e => e.message.includes('🎲 5 が出ました')));
});

runTest('nextTurnでgame.logがリセットされ新ターンのエントリになる', () => {
    const game = new GameManager(2);
    game.rollDice(1);
    game.phase = 'build';
    const prevLog = [...game.log];
    assert.ok(prevLog.length > 0);

    game.nextTurn();

    assert.ok(!game.log.some(e => prevLog.includes(e) && !e.message.startsWith('👤')));
    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.ok(game.log.some(e => e.message.startsWith('👤')));
});

runTest('CARDSを色順→ダイス出目順にソートできる', () => {
    const COLOR_ORDER = { blue: 0, green: 1, red: 2, purple: 3 };
    const sorted = [...runtime.CARDS].sort((a, b) => {
        const cd = (COLOR_ORDER[a.color] ?? 9) - (COLOR_ORDER[b.color] ?? 9);
        if (cd !== 0) return cd;
        return Math.min(...a.diceNums) - Math.min(...b.diceNums);
    });
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1], cur = sorted[i];
        const po = COLOR_ORDER[prev.color] ?? 9;
        const co = COLOR_ORDER[cur.color] ?? 9;
        assert.ok(po <= co, `色順が正しくない: ${prev.name}(${prev.color}) > ${cur.name}(${cur.color})`);
        if (po === co) {
            assert.ok(
                Math.min(...prev.diceNums) <= Math.min(...cur.diceNums),
                `同色内のダイス順が正しくない: ${prev.name} > ${cur.name}`
            );
        }
    }
});

runTest('駅あり rollDice → selectDice → selectDiceCount でフェーズが進む', () => {
    const game = new GameManager(2);
    game.currentPlayer().landmarks['駅'] = true;

    game.rollDice();
    assert.strictEqual(game.phase, 'selectDice');

    game.selectDiceCount(false, 3);
    assert.strictEqual(game.phase, 'build');
    assert.strictEqual(game.lastDiceResult, 3);

    // 2個振りも同様に進む
    const game2 = new GameManager(2);
    game2.currentPlayer().landmarks['駅'] = true;
    game2.rollDice();
    game2.selectDiceCount(true, 2, 4);
    assert.strictEqual(game2.lastDiceResult, 6);
    assert.strictEqual(game2.phase, 'build');
});

runTest('駅+電波塔 selectDiceCount → rerollConfirm → rerollDice でフェーズが進む', () => {
    const game = new GameManager(2);
    game.currentPlayer().landmarks['駅'] = true;
    game.currentPlayer().landmarks['電波塔'] = true;

    game.rollDice();
    assert.strictEqual(game.phase, 'selectDice');

    game.selectDiceCount(false, 3);
    assert.strictEqual(game.phase, 'rerollConfirm');
    assert.strictEqual(game.lastDiceResult, 3);

    // rerollDice → rollDice → 駅あり → selectDice に戻る（usedReroll=true）
    game.rerollDice();
    assert.strictEqual(game.phase, 'selectDice');
    assert.strictEqual(game.usedReroll, true);

    // 2回目のselectDiceCount: usedReroll=true なので電波塔が発動せずbuildへ
    game.selectDiceCount(false, 5);
    assert.strictEqual(game.phase, 'build');
    assert.strictEqual(game.lastDiceResult, 5);
});

runTest('駅+港 2個振り sum≥10 → harborChoice → resolveHarbor でフェーズが進む', () => {
    const game = new GameManager(2);
    game.currentPlayer().landmarks['駅'] = true;
    game.currentPlayer().landmarks['港'] = true;

    game.rollDice();
    game.selectDiceCount(true, 5, 6); // sum=11
    assert.strictEqual(game.phase, 'harborChoice');
    assert.strictEqual(game.lastDiceResult, 11);

    game.resolveHarbor(true);
    assert.strictEqual(game.lastDiceResult, 13);
    assert.strictEqual(game.phase, 'build');

    // +2しない場合
    const game2 = new GameManager(2);
    game2.currentPlayer().landmarks['駅'] = true;
    game2.currentPlayer().landmarks['港'] = true;
    game2.rollDice();
    game2.selectDiceCount(true, 5, 6);
    game2.resolveHarbor(false);
    assert.strictEqual(game2.lastDiceResult, 11);
    assert.strictEqual(game2.phase, 'build');

    // sum<10 では harborChoice に入らない
    const game3 = new GameManager(2);
    game3.currentPlayer().landmarks['駅'] = true;
    game3.currentPlayer().landmarks['港'] = true;
    game3.rollDice();
    game3.selectDiceCount(true, 3, 4); // sum=7
    assert.strictEqual(game3.phase, 'build');
});

runTest('resolveHarbor は harborChoice 以外では副作用を出さない', () => {
    const game = new GameManager(2);
    game.phase = GAME_PHASES.BUILD;
    game.lastDiceResult = 10;

    assert.strictEqual(game.resolveHarbor(true), false);
    assert.strictEqual(game.lastDiceResult, 10);
    assert.strictEqual(game.phase, GAME_PHASES.BUILD);
});

runTest('駅+電波塔+港の3段フェーズ遷移が正しく動く', () => {
    const game = new GameManager(2);
    game.currentPlayer().landmarks['駅'] = true;
    game.currentPlayer().landmarks['電波塔'] = true;
    game.currentPlayer().landmarks['港'] = true;

    // roll → selectDice
    game.rollDice();
    assert.strictEqual(game.phase, 'selectDice');

    // selectDice → 2個振り sum=10 → 電波塔があるのでrerollConfirm
    game.selectDiceCount(true, 4, 6);
    assert.strictEqual(game.phase, 'rerollConfirm');

    // skipReroll → 港判定 → harborChoice
    game.skipReroll();
    assert.strictEqual(game.phase, 'harborChoice');
    assert.strictEqual(game.lastDiceResult, 10);

    // harborChoice → +2 → build
    game.resolveHarbor(true);
    assert.strictEqual(game.lastDiceResult, 12);
    assert.strictEqual(game.phase, 'build');
});

runTest('ITベンチャーのnextTurnでpendingITが設定されresolveIT後にターンが進む', () => {
    const game = new GameManager(2);
    game.currentPlayer().addCard(createCardByName('ITベンチャー'));
    game.phase = 'build';

    game.nextTurn();

    assert.strictEqual(game.pendingIT, true);
    assert.strictEqual(game.phase, 'pending');
    assert.strictEqual(game.currentPlayerIndex, 0); // まだターン変わっていない

    game.resolveIT(false);
    assert.strictEqual(game.pendingIT, false);
    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.strictEqual(game.phase, 'roll');
});

// ===== LOG_TYPES / addLog 構造 =====

runTest('addLogエントリが{type,message}構造を持ちLOG_TYPESの値を使う', () => {
    const LOG_TYPES = runtime.LOG_TYPES;
    assert.ok(LOG_TYPES, 'LOG_TYPESがエクスポートされていない');
    const validTypes = new Set(Object.values(LOG_TYPES));
    const game = new GameManager(2);
    game.rollDice(1); // 🎲ダイス + 麦畑収入(gain)
    assert.ok(game.log.length > 0, 'ログが空');
    for (const entry of game.log) {
        assert.ok(typeof entry === 'object' && entry !== null, `エントリがオブジェクトでない: ${JSON.stringify(entry)}`);
        assert.ok(typeof entry.type === 'string', 'typeが文字列でない');
        assert.ok(typeof entry.message === 'string', 'messageが文字列でない');
        assert.ok(validTypes.has(entry.type), `未知のtype: ${entry.type}`);
    }
    assert.ok(game.log.some(e => e.type === LOG_TYPES.DICE), 'diceタイプがない');
    assert.ok(game.log.some(e => e.type === LOG_TYPES.GAIN), 'gainタイプがない');
});

// ===== processIncome / 収入計算 =====

runTest('青カード（麦畑）がダイス1で全プレイヤーに収入をもたらす', () => {
    const game = new GameManager(2);
    const coins0 = game.players[0].coins;
    const coins1 = game.players[1].coins;
    // 両者が麦畑(dice 1, +1)を初期所持
    game.rollDice(1);
    assert.strictEqual(game.players[0].coins, coins0 + 1);
    assert.strictEqual(game.players[1].coins, coins1 + 1);
});

runTest('赤カード（カフェ）は現在プレイヤーから1コイン徴収する', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    const p1 = game.players[1];
    p0.cards = [createCardByName('麦畑')];
    p0.dormantCards = [];
    p1.cards = [createCardByName('カフェ')]; // red, dice 3, income 1
    p1.dormantCards = [];
    p0.coins = 5;
    p1.coins = 0;
    game.rollDice(3);
    assert.strictEqual(p0.coins, 4);
    assert.strictEqual(p1.coins, 1);
    assert.ok(game.log.some(e => e.type === 'lose'));
    // p0のコインが0なら徴収なし
    const game2 = new GameManager(2);
    game2.currentPlayer().cards = [];
    game2.currentPlayer().dormantCards = [];
    game2.players[1].cards = [createCardByName('カフェ')];
    game2.players[1].dormantCards = [];
    game2.currentPlayer().coins = 0;
    game2.players[1].coins = 0;
    game2.rollDice(3);
    assert.strictEqual(game2.players[1].coins, 0);
});

runTest('チーズ工場は牧場枚数×3コインを得る', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.cards = [createCardByName('牧場'), createCardByName('牧場'), createCardByName('チーズ工場')];
    p0.dormantCards = [];
    const coinsBefore = p0.coins;
    game.rollDice(7); // チーズ工場 dice=7
    assert.strictEqual(p0.coins, coinsBefore + 6); // 2牧場 × 3
    // 牧場0枚の場合は収入なし
    const game2 = new GameManager(2);
    const p0b = game2.currentPlayer();
    p0b.cards = [createCardByName('チーズ工場')];
    p0b.dormantCards = [];
    const coinsBefore2 = p0b.coins;
    game2.rollDice(7);
    assert.strictEqual(p0b.coins, coinsBefore2);
});

runTest('ショッピングモール所持で飲食店・商店の緑カードが+1コイン', () => {
    // モールなし: パン屋(飲食店, dice 2-3, income 1) → +1
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.cards = [createCardByName('パン屋')];
    p0.dormantCards = [];
    p0.coins = 0;
    game.rollDice(2);
    assert.strictEqual(p0.coins, 1);
    // モールあり: パン屋 → +2
    const game2 = new GameManager(2);
    const p0b = game2.currentPlayer();
    p0b.cards = [createCardByName('パン屋')];
    p0b.dormantCards = [];
    p0b.landmarks['ショッピングモール'] = true;
    p0b.coins = 0;
    game2.rollDice(2);
    assert.strictEqual(p0b.coins, 2);
});

runTest('貸金業は5か6が出ると枚数×2コイン支払う', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.cards = [createCardByName('貸金業'), createCardByName('貸金業')];
    p0.dormantCards = [];
    p0.coins = 10;
    game.rollDice(5); // 2枚 × 2 = 4コイン支払い
    assert.strictEqual(p0.coins, 6);
    assert.ok(game.log.some(e => e.type === 'lose' && e.message.includes('貸金業')));
    // 5か6以外は支払いなし
    const game2 = new GameManager(2);
    const p0b = game2.currentPlayer();
    p0b.cards = [createCardByName('貸金業')];
    p0b.dormantCards = [];
    p0b.coins = 10;
    game2.rollDice(3);
    assert.strictEqual(p0b.coins, 10);
});

runTest('休業中の貸金業は復帰した同じ出目では支払わない', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    const loan = createCardByName('貸金業');
    p0.cards = [loan];
    p0.dormantCards = [];
    p0.makeDormant(loan);
    p0.coins = 10;

    game.rollDice(5);

    assert.strictEqual(p0.isDormant(loan), false);
    assert.strictEqual(p0.coins, 10);
});

runTest('ビジネスセンターは合法交換がなければpendingに入らない', () => {
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.cards = [createCardByName('ビジネスセンター')];
    game.players[1].cards = [createCardByName('テレビ局')];

    game.rollDice(6);

    assert.strictEqual(game.pendingBusiness, 0);
    assert.strictEqual(game.phase, GAME_PHASES.BUILD);
});

// ===== buildCard / buildLandmark =====

runTest('buildCardが成功するとコインが減りカードが追加される', () => {
    const game = new GameManager(2);
    game.phase = GAME_PHASES.BUILD;
    const p0 = game.currentPlayer();
    p0.coins = 10;
    const result = game.buildCard(createCardByName('森林')); // cost 3
    assert.strictEqual(result, true);
    assert.strictEqual(p0.coins, 7);
    assert.ok(p0.cards.some(c => c.name === '森林'));
    assert.strictEqual(game.builtThisTurn, true);
    assert.ok(game.log.some(e => e.type === 'build' && e.message.includes('森林')));
    // 貸金業はcost 0で建設後+5コイン付与
    const game2 = new GameManager(2);
    game2.phase = GAME_PHASES.BUILD;
    game2.currentPlayer().coins = 10;
    game2.buildCard(createCardByName('貸金業')); // cost 0, +5
    assert.strictEqual(game2.currentPlayer().coins, 15);
});

runTest('buildLandmarkが成功するとコインが減りランドマークが建設される', () => {
    const game = new GameManager(2);
    game.phase = GAME_PHASES.BUILD;
    const p0 = game.currentPlayer();
    p0.coins = 10;
    const result = game.buildLandmark('駅'); // cost 4
    assert.strictEqual(result, true);
    assert.strictEqual(p0.coins, 6);
    assert.strictEqual(p0.landmarks['駅'], true);
    assert.strictEqual(game.builtThisTurn, true);
    assert.ok(game.log.some(e => e.type === 'build' && e.message.includes('駅')));
    // 二重建設は拒否
    const game2 = new GameManager(2);
    game2.phase = GAME_PHASES.BUILD;
    game2.currentPlayer().coins = 20;
    game2.currentPlayer().landmarks['駅'] = true;
    assert.strictEqual(game2.buildLandmark('駅'), false);
});

// ===== ランドマーク効果 =====

runTest('空港効果：建設しないターン終了で+10コイン', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.landmarks['空港'] = true;
    game.phase = 'build';
    game.builtThisTurn = false;
    const coinsBefore = p0.coins;
    game.nextTurn();
    assert.strictEqual(p0.coins, coinsBefore + 10);
    // 建設済みの場合は+10されない
    const game2 = new GameManager(2);
    game2.currentPlayer().landmarks['空港'] = true;
    game2.phase = 'build';
    game2.builtThisTurn = true;
    const coinsBefore2 = game2.players[0].coins;
    game2.nextTurn();
    assert.strictEqual(game2.players[0].coins, coinsBefore2);
});

runTest('遊園地効果：ゾロ目でターン継続しphaseがrollに戻る', () => {
    const game = new GameManager(2);
    game.phase = 'build';
    game.lastDice1 = 4;
    game.lastDice2 = 4;
    game.hadAmusementParkAtRoll = true;
    const ci = game.currentPlayerIndex;
    game.nextTurn();
    assert.strictEqual(game.currentPlayerIndex, ci, 'ゾロ目なのにプレイヤーが変わった');
    assert.strictEqual(game.phase, 'roll');
    assert.ok(game.log.some(e => e.type === 'system' && e.message.includes('遊園地')));
    // ゾロ目でない場合はターンが進む
    const game2 = new GameManager(2);
    game2.phase = 'build';
    game2.lastDice1 = 3;
    game2.lastDice2 = 4;
    game2.hadAmusementParkAtRoll = true;
    game2.nextTurn();
    assert.strictEqual(game2.currentPlayerIndex, 1, 'ターンが進んでいない');
});

// ===== resolveRenovation =====

runTest('resolveRenovationでランドマークを取り壊して+8コインを得る', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.landmarks['駅'] = true;
    game.pendingRenovation = 1;
    game.phase = 'pending';
    p0.coins = 0;
    game.resolveRenovation('駅');
    assert.strictEqual(p0.landmarks['駅'], false);
    assert.strictEqual(p0.coins, 8);
    assert.strictEqual(game.pendingRenovation, 0);
    assert.strictEqual(game.phase, 'build');
    assert.ok(game.log.some(e => e.type === 'build' && e.message.includes('駅')));
    // 未建設ランドマークは拒否してpendingRenovationを減らさない
    const game2 = new GameManager(2);
    game2.pendingRenovation = 1;
    game2.phase = 'pending';
    game2.resolveRenovation('駅');
    assert.strictEqual(game2.pendingRenovation, 1);
    assert.ok(game2.log.some(e => e.type === 'error'));
});

// ===== calcCardIncome =====

runTest('calcCardIncomeがCHEESE・FURNITURE・MARKET・FEWLANDMARKの収入を計算する', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    // CHEESE: 牧場2枚 × income3 = 6
    p0.cards = [createCardByName('牧場'), createCardByName('牧場')];
    p0.dormantCards = [];
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('チーズ工場'), p0, game), 6);
    // FURNITURE: (森林1+鉱山1) × income3 = 6
    p0.cards = [createCardByName('森林'), createCardByName('鉱山')];
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('家具工場'), p0, game), 6);
    // MARKET: 農園2枚 × income2 = 4
    p0.cards = [createCardByName('麦畑'), createCardByName('花畑')];
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('青果市場'), p0, game), 4);
    // FEWLANDMARK: ランドマーク0個 → income1
    Object.keys(p0.landmarks).forEach(k => { p0.landmarks[k] = false; });
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('雑貨屋'), p0, game), 1);
    // ランドマーク2個以上 → 0
    p0.landmarks['駅'] = true;
    p0.landmarks['ショッピングモール'] = true;
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('雑貨屋'), p0, game), 0);
    // 休業中のカードはカウントしない
    p0.cards = [createCardByName('牧場'), createCardByName('牧場')];
    p0.dormantCards = [p0.cards[0]];
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('チーズ工場'), p0, game), 3); // 1枚のみ
});

// ===== Player メソッド =====

runTest('Player のカード枚数helperは ID と休業状態で数える', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    const ranchA = createCardById(CARD_IDS.RANCH);
    const ranchB = createCardById(CARD_IDS.RANCH);
    const legacyRanch = Object.assign({}, createCardByName('牧場'), { id: undefined });
    const forest = createCardById(CARD_IDS.FOREST);
    p0.cards = [ranchA, ranchB, legacyRanch, forest];
    p0.dormantCards = [ranchA];

    assert.strictEqual(p0.countCardById(CARD_IDS.RANCH), 2);
    assert.strictEqual(p0.countCardIncludingDormantById(CARD_IDS.RANCH), 3);
    assert.strictEqual(p0.countCardById(CARD_IDS.FOREST), 1);
    assert.strictEqual(p0.countCardById('missing-card'), 0);
});

runTest('Player.builtLandmarkCount が建設済みランドマーク数を返す', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    assert.strictEqual(p0.builtLandmarkCount(), 0);
    p0.landmarks['駅'] = true;
    assert.strictEqual(p0.builtLandmarkCount(), 1);
    p0.landmarks['ショッピングモール'] = true;
    assert.strictEqual(p0.builtLandmarkCount(), 2);
});

runTest('Player.getMinorCards が大施設を除いたカード一覧を返す', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.cards = [
        createCardByName('麦畑'),
        createCardByName('スタジアム'),
        createCardByName('カフェ'),
    ];
    const minor = p0.getMinorCards();
    assert.strictEqual(minor.length, 2);
    assert.ok(minor.every(c => c.name !== 'スタジアム'));
});

runTest('Player.hasWon が enabledLandmarks を全て建設済みのときだけ true を返す', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    const enabled = ['駅', 'ショッピングモール'];
    assert.strictEqual(p0.hasWon(enabled), false);
    p0.landmarks['駅'] = true;
    assert.strictEqual(p0.hasWon(enabled), false);
    p0.landmarks['ショッピングモール'] = true;
    assert.strictEqual(p0.hasWon(enabled), true);
    // 未使用のランドマークが未建設でも勝利扱い
    assert.strictEqual(p0.hasWon(['駅']), true);
});

// ===== calcCardIncome 追加 =====

runTest('calcCardIncome が WINERY・FLOWER・FOODWAREHOUSE・DRINKFACTORY を計算する', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();

    // WINERY: ブドウ園2枚 × income6 = 12
    p0.cards = [createCardByName('ブドウ園'), createCardByName('ブドウ園')];
    p0.dormantCards = [];
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('ワイナリー'), p0, game), 12);

    // FLOWER: 花畑2枚 × income1 = 2
    p0.cards = [createCardByName('花畑'), createCardByName('花畑')];
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('フラワーショップ'), p0, game), 2);

    // FOODWAREHOUSE: 飲食店2枚(カフェ×2) × income2 = 4
    p0.cards = [createCardByName('カフェ'), createCardByName('カフェ')];
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('食品倉庫'), p0, game), 4);

    // DRINKFACTORY: 全員の飲食店合計 × income1
    // p0: カフェ×2, p1: カフェ×1 → 合計3 × 1 = 3
    game.players[1].cards = [createCardByName('カフェ')];
    game.players[1].dormantCards = [];
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('ドリンク工場'), p0, game), 3);
});

// ===== processIncome 追加 =====

runTest('スタジアムが各相手から最大2コイン奪う', () => {
    const game = new GameManager(3);
    const p0 = game.currentPlayer();
    p0.cards = [createCardByName('スタジアム')];
    p0.dormantCards = [];
    game.players[1].coins = 5;
    game.players[2].coins = 1; // 1しか持っていない
    const before = p0.coins;

    game.rollDice(6); // スタジアム dice=6

    assert.strictEqual(game.players[1].coins, 3); // 2奪われた
    assert.strictEqual(game.players[2].coins, 0); // 1奪われた
    assert.strictEqual(p0.coins, before + 3);     // 合計+3
});

runTest('5人以上でもスタジアムは全相手を対象にする', () => {
    const game = new GameManager(5);
    const p0 = game.currentPlayer();
    p0.cards = [createCardByName('スタジアム')];
    p0.dormantCards = [];
    for (let i = 1; i < game.players.length; i++) {
        game.players[i].coins = 2;
    }
    const before = p0.coins;

    game.rollDice(6);

    assert.strictEqual(p0.coins, before + 8);
    for (let i = 1; i < game.players.length; i++) {
        assert.strictEqual(game.players[i].coins, 0);
    }
});

runTest('出版社が相手の飲食店・商店枚数分コインを奪う', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.cards = [createCardByName('出版社')];
    p0.dormantCards = [];
    // p1: カフェ(飲食店)×2, パン屋(商店)×1 → 3枚 → 3コイン奪われる
    game.players[1].cards = [
        createCardByName('カフェ'),
        createCardByName('カフェ'),
        createCardByName('パン屋'),
    ];
    game.players[1].dormantCards = [];
    game.players[1].coins = 10;
    const before = p0.coins;

    game.rollDice(7); // 出版社 dice=7

    assert.strictEqual(game.players[1].coins, 7);
    assert.strictEqual(p0.coins, before + 3);
});

runTest('税務署が10コイン以上の相手から半分奪う', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.cards = [createCardByName('税務署')];
    p0.dormantCards = [];
    game.players[1].coins = 12;
    const before = p0.coins;

    game.rollDice(8); // 税務署 dice=8 or 9

    assert.strictEqual(game.players[1].coins, 6); // 12→6（半分徴収）
    assert.strictEqual(p0.coins, before + 6);

    // 9コイン以下の場合は徴収しない
    const game2 = new GameManager(2);
    game2.currentPlayer().cards = [createCardByName('税務署')];
    game2.currentPlayer().dormantCards = [];
    game2.players[1].coins = 9;
    const before2 = game2.currentPlayer().coins;
    game2.rollDice(8);
    assert.strictEqual(game2.players[1].coins, 9);
    assert.strictEqual(game2.currentPlayer().coins, before2);
});

runTest('寿司屋（HARBOR_RED）は港ランドマーク所持時のみ発動する', () => {
    // 港あり: 相手から3コイン奪う
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    const p1 = game.players[1];
    p0.cards = [];
    p0.dormantCards = [];
    p1.cards = [createCardByName('寿司屋')];
    p1.dormantCards = [];
    p1.landmarks['港'] = true;
    p0.coins = 5;
    p1.coins = 0;

    game.rollDice(1); // 寿司屋 dice=1

    assert.strictEqual(p0.coins, 2); // 3奪われた
    assert.strictEqual(p1.coins, 3);

    // 港なし: 発動しない
    const game2 = new GameManager(2);
    game2.currentPlayer().cards = [];
    game2.currentPlayer().dormantCards = [];
    game2.players[1].cards = [createCardByName('寿司屋')];
    game2.players[1].dormantCards = [];
    game2.players[1].landmarks['港'] = false;
    game2.currentPlayer().coins = 5;
    game2.players[1].coins = 0;

    game2.rollDice(1);

    assert.strictEqual(game2.currentPlayer().coins, 5); // 変化なし
    assert.strictEqual(game2.players[1].coins, 0);
});

runTest('ワイナリーはブドウ園枚数×6コイン取得後に休業する', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    const winery = createCardByName('ワイナリー');
    p0.cards = [createCardByName('ブドウ園'), createCardByName('ブドウ園'), winery];
    p0.dormantCards = [];
    const before = p0.coins;

    game.rollDice(9); // ワイナリー dice=9

    assert.strictEqual(p0.coins, before + 12); // 2×6
    assert.strictEqual(p0.isDormant(winery), true);
});

runTest('公園はコインを全員に均等分配する', () => {
    const game = new GameManager(3);
    const p0 = game.currentPlayer();
    p0.cards = [createCardByName('公園')];
    p0.dormantCards = [];
    p0.coins = 10;
    game.players[1].coins = 5;
    game.players[2].coins = 3;
    // 合計18 / 3 = 6 (余り0)

    game.rollDice(11); // 公園 dice=11-13

    assert.strictEqual(p0.coins, 6);
    assert.strictEqual(game.players[1].coins, 6);
    assert.strictEqual(game.players[2].coins, 6);
});

if (process.exitCode) {
    throw new Error('GameManagerテストで失敗が発生しました');
}
