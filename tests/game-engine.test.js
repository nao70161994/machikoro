'use strict';

const assert = require('assert');
const GameActionContract = require('../js/actionContract');
const GameEngine = require('../js/gameEngine');
const GameSnapshot = require('../js/gameSnapshot');
const { restoreMirrorState, serializeMirrorState, applyActionToMirror, restoreUndoMirror } = require('../server');
const { loadGameRuntime } = require('./helpers/runtime-loaders');
const { runTest } = require('./helpers/test-utils');

function makeRecorder(returnValues = {}) {
    const calls = [];
    const game = {};
    const methodNames = [
        'rollDice', 'selectDiceCount', 'skipReroll', 'rerollDice',
        'resolveHarbor', 'resolveTV', 'resolveBusiness', 'resolveCleaning',
        'resolveMover', 'resolveRenovation', 'resolveIT', 'buildLandmark', 'nextTurn',
    ];
    for (const method of methodNames) {
        game[method] = (...args) => {
            calls.push([method, args]);
            return returnValues[method];
        };
    }
    return { calls, game };
}

runTest('共有Game Engine executorはAction Contractを過不足なく網羅する', () => {
    assert.ok(Object.isFrozen(GameEngine));
    assert.ok(Object.isFrozen(GameEngine.handledActions));
    assert.deepStrictEqual(
        Array.from(GameEngine.handledActions).sort(),
        GameActionContract.entries.map(entry => entry.action).sort()
    );
});

runTest('共有Game Engine executorはcanonical payloadを既存GameManager引数へ写像する', () => {
    const cases = [
        ['rollDice', { forceDice: 7, tunaDice: 2 }, 'rollDice', [7, 2]],
        ['selectDice', { useTwo: true, d1: 3, d2: 4, tunaDice: 1 }, 'selectDiceCount', [true, 3, 4, 1]],
        ['skipReroll', {}, 'skipReroll', []],
        ['rerollDice', { forceDice: 8, tunaDice: 3 }, 'rerollDice', [8, 3]],
        ['resolveHarbor', { useBonus: true }, 'resolveHarbor', [true]],
        ['resolveTV', { targetIndex: 2 }, 'resolveTV', [2]],
        ['resolveBusiness', { myCard: 1, targetIndex: 2, theirCard: 3 }, 'resolveBusiness', [1, 2, 3]],
        ['resolveCleaning', { cardName: 'カフェ' }, 'resolveCleaning', ['カフェ']],
        ['resolveMover', { cardIndex: 4, cardName: 'ignored', targetIndex: 1 }, 'resolveMover', [4, 1]],
        ['resolveMover', { cardName: 'パン屋', targetIndex: 1 }, 'resolveMover', ['パン屋', 1]],
        ['resolveRenovation', { landmarkName: '駅' }, 'resolveRenovation', ['駅']],
        ['resolveIT', { doSave: false }, 'resolveIT', [false]],
        ['buildLandmark', { name: '駅' }, 'buildLandmark', ['駅']],
        ['nextTurn', {}, 'nextTurn', []],
    ];

    for (const [action, data, method, args] of cases) {
        const recorder = makeRecorder();
        assert.strictEqual(GameEngine.applyMutableAction({
            game: recorder.game,
            action,
            data,
        }), true, action);
        assert.deepStrictEqual(recorder.calls, [[method, args]], action);
    }
});

runTest('共有Game Engine executorは失敗結果・建設在庫・Undo adapter契約を保持する', () => {
    const failed = makeRecorder({ resolveTV: false });
    assert.strictEqual(GameEngine.applyMutableAction({
        game: failed.game,
        action: 'resolveTV',
        data: { targetIndex: 1 },
    }), false);

    const calls = [];
    const card = { name: 'カフェ' };
    const shopStock = { カフェ: 3 };
    const game = {
        buildCard(value) {
            calls.push(['buildCard', value]);
            return true;
        },
    };
    assert.strictEqual(GameEngine.applyMutableAction({
        game,
        shopStock,
        action: 'buildCard',
        data: { cardName: 'カフェ' },
        createCardByName(name) {
            calls.push(['createCardByName', name]);
            return card;
        },
        decrementShopStock(stock, value) {
            calls.push(['decrementShopStock', stock, value]);
            stock[value.name]--;
        },
    }), true);
    assert.deepStrictEqual(calls, [
        ['createCardByName', 'カフェ'],
        ['buildCard', card],
        ['decrementShopStock', shopStock, card],
    ]);
    assert.strictEqual(shopStock.カフェ, 2);

    const undoState = { playerCoins: [3] };
    let restored = null;
    assert.strictEqual(GameEngine.applyMutableAction({
        game,
        action: 'undoBuild',
        data: { state: undoState },
        restoreUndoState(state) {
            restored = state;
            return true;
        },
    }), true);
    assert.strictEqual(restored, undoState);
});

runTest('共有Game Engine executorは未知actionと非object payloadを副作用なく拒否する', () => {
    const recorder = makeRecorder();
    for (const [action, data] of [['unknown', {}], ['rollDice', null], ['rollDice', []]]) {
        assert.strictEqual(GameEngine.applyMutableAction({ game: recorder.game, action, data }), false);
    }
    assert.deepStrictEqual(recorder.calls, []);
});

runTest('pure transition境界は入力snapshot/actionを変更せず出力を分離する', () => {
    const snapshot = Object.freeze({
        counter: 2,
        nested: Object.freeze({ label: 'before' }),
    });
    const data = Object.freeze({
        targetIndex: 3,
        nested: Object.freeze({ label: 'action' }),
    });
    let hydratedRuntime = null;

    const result = GameEngine.transitionSnapshot({
        snapshot,
        action: 'resolveTV',
        data,
        hydrate(detachedSnapshot) {
            assert.notStrictEqual(detachedSnapshot, snapshot);
            assert.notStrictEqual(detachedSnapshot.nested, snapshot.nested);
            hydratedRuntime = {
                state: detachedSnapshot,
                game: {
                    resolveTV(targetIndex) {
                        detachedSnapshot.counter += targetIndex;
                        detachedSnapshot.nested.label = 'after';
                        return true;
                    },
                },
            };
            return hydratedRuntime;
        },
        serialize(runtime) {
            return runtime.state;
        },
    });

    assert.deepStrictEqual(result, {
        ok: true,
        reason: '',
        snapshot: { counter: 5, nested: { label: 'after' } },
    });
    assert.deepStrictEqual(snapshot, { counter: 2, nested: { label: 'before' } });
    assert.deepStrictEqual(data, { targetIndex: 3, nested: { label: 'action' } });
    hydratedRuntime.state.counter = 99;
    assert.strictEqual(result.snapshot.counter, 5);
    assert.ok(Object.isFrozen(result));
});

runTest('pure transition境界はadapter各段階を安定したfailure reasonでfail closedにする', () => {
    const reasons = GameEngine.transitionFailureReasons;
    assert.ok(Object.isFrozen(reasons));
    assert.strictEqual(GameEngine.transitionSnapshot(null).reason, reasons.INVALID_INPUT);
    assert.strictEqual(GameEngine.transitionSnapshot({ snapshot: {}, data: {} }).reason, reasons.INVALID_ADAPTER);
    assert.strictEqual(GameEngine.transitionSnapshot({
        snapshot: {},
        data: {},
        hydrate() { throw new Error('hydrate'); },
        serialize() { return {}; },
    }).reason, reasons.HYDRATE_FAILED);
    assert.strictEqual(GameEngine.transitionSnapshot({
        snapshot: {},
        action: 'unknown',
        data: {},
        hydrate() { return { game: {} }; },
        serialize() { return {}; },
    }).reason, reasons.ACTION_REJECTED);
    assert.strictEqual(GameEngine.transitionSnapshot({
        snapshot: {},
        action: 'nextTurn',
        data: {},
        hydrate() {
            return { game: { nextTurn() { throw new Error('action'); } } };
        },
        serialize() { return {}; },
    }).reason, reasons.ACTION_FAILED);
    assert.strictEqual(GameEngine.transitionSnapshot({
        snapshot: {},
        action: 'nextTurn',
        data: {},
        hydrate() {
            return { game: { nextTurn() { return true; } } };
        },
        serialize() { throw new Error('serialize'); },
    }).reason, reasons.SERIALIZE_FAILED);

    const cyclic = {};
    cyclic.self = cyclic;
    assert.strictEqual(GameEngine.transitionSnapshot({
        snapshot: cyclic,
        action: 'nextTurn',
        data: {},
        hydrate(value) { return { game: {}, value }; },
        serialize() { return {}; },
    }).reason, reasons.INVALID_INPUT);
});

runTest('pure transition shadowは実GameManagerのmutable適用結果と一致する', () => {
    const runtime = loadGameRuntime();
    const sourceGame = new runtime.GameManager(2);
    const sourceStock = {};
    const sourceSnapshot = serializeMirrorState(sourceGame, sourceStock, null, 4);
    const action = 'rollDice';
    const data = { forceDice: 1, tunaDice: [1, 1] };

    const expectedGame = new runtime.GameManager(2);
    const expectedStock = {};
    restoreMirrorState(
        expectedGame,
        expectedStock,
        JSON.parse(JSON.stringify(sourceSnapshot)),
        runtime.createCardByName
    );
    assert.strictEqual(
        applyActionToMirror(expectedGame, expectedStock, action, data, runtime.createCardByName),
        true
    );
    const expectedSnapshot = serializeMirrorState(expectedGame, expectedStock, null, 4);

    const result = GameEngine.transitionSnapshot({
        snapshot: sourceSnapshot,
        action,
        data,
        hydrate(detachedSnapshot) {
            const game = new runtime.GameManager(2);
            const shopStock = {};
            restoreMirrorState(game, shopStock, detachedSnapshot, runtime.createCardByName);
            return {
                game,
                shopStock,
                createCardByName: runtime.createCardByName,
                decrementShopStock(stock, card) {
                    stock[card.name] = (stock[card.name] || 0) - 1;
                },
                restoreUndoState() { return false; },
            };
        },
        serialize(engineRuntime) {
            return serializeMirrorState(engineRuntime.game, engineRuntime.shopStock, null, 4);
        },
    });

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(result.snapshot)),
        JSON.parse(JSON.stringify(expectedSnapshot))
    );
    assert.deepStrictEqual(
        sourceSnapshot,
        serializeMirrorState(sourceGame, sourceStock, null, 4),
        'shadow transition must not mutate its source snapshot'
    );
});

function makeInitialStock(runtime, playerCount) {
    const stock = {};
    for (const card of runtime.CARDS) {
        runtime.setShopStockCount(stock, card, runtime.getInitialCardStock(card, playerCount));
    }
    return stock;
}

function applyMutableReplayStep(runtime, replay, action, data) {
    if (action === 'buildCard' || action === 'buildLandmark') {
        replay.undoState = GameSnapshot.serializeUndoState(replay.game, replay.shopStock);
    }
    const internalData = action === 'undoBuild' ? { state: replay.undoState } : data;
    assert.strictEqual(
        applyActionToMirror(replay.game, replay.shopStock, action, internalData, runtime.createCardByName),
        true,
        action
    );
    if (action === 'undoBuild' || action === 'nextTurn') replay.undoState = null;
}

function applyShadowReplayStep(runtime, snapshot, action, data) {
    return GameEngine.transitionSnapshot({
        snapshot,
        action,
        data,
        hydrate(detachedSnapshot) {
            const game = new runtime.GameManager(detachedSnapshot.players.length);
            const shopStock = {};
            restoreMirrorState(game, shopStock, detachedSnapshot, runtime.createCardByName);
            const engineRuntime = {
                game,
                shopStock,
                undoState: detachedSnapshot.undoState || null,
                createCardByName: runtime.createCardByName,
                decrementShopStock: runtime.decrementShopStock,
            };
            if (action === 'buildCard' || action === 'buildLandmark') {
                engineRuntime.undoState = GameSnapshot.serializeUndoState(game, shopStock);
            }
            engineRuntime.restoreUndoState = () => {
                if (!engineRuntime.undoState) return false;
                const restored = restoreUndoMirror(
                    game, shopStock, engineRuntime.undoState, runtime.createCardByName
                );
                return restored !== false;
            };
            return engineRuntime;
        },
        serialize(engineRuntime) {
            if (action === 'undoBuild' || action === 'nextTurn') {
                engineRuntime.undoState = null;
            }
            return serializeMirrorState(
                engineRuntime.game, engineRuntime.shopStock, engineRuntime.undoState, snapshot.actionSeq
            );
        },
    });
}

runTest('pure transition shadowはmulti-action traceごとにmutable replayと一致する', () => {
    const runtime = loadGameRuntime();
    const landmarks = runtime.Player.landmarkNames();
    const cases = [
        {
            name: 'build-undo-next-turn',
            setup(game) { game.phase = runtime.GAME_PHASES.BUILD; game.players[0].coins = 10; },
            actions: [
                ['buildCard', { cardName: '麦畑' }],
                ['undoBuild', {}],
                ['buildLandmark', { name: '駅' }],
                ['nextTurn', {}],
            ],
        },
        {
            name: 'station-dice-selection',
            setup(game) { game.phase = runtime.GAME_PHASES.ROLL; game.players[0].landmarks['駅'] = true; },
            actions: [
                ['rollDice', { forceDice: 1, tunaDice: [1, 1] }],
                ['selectDice', { useTwo: false, d1: 1, d2: 1, tunaDice: [1, 1] }],
            ],
        },
        {
            name: 'pending-tv',
            setup(game) {
                game.phase = runtime.GAME_PHASES.PENDING;
                game.pendingTV = 1;
                game.pendingActionQueue = [{ action: 'resolveTV', field: 'pendingTV' }];
                game.players[1].coins = 8;
            },
            actions: [['resolveTV', { targetIndex: 1 }]],
        },
        {
            name: 'winning-landmark',
            setup(game) {
                game.phase = runtime.GAME_PHASES.BUILD;
                game.players[0].coins = 100;
                for (const name of landmarks) game.players[0].landmarks[name] = true;
                game.players[0].landmarks[landmarks[landmarks.length - 1]] = false;
            },
            actions: [['buildLandmark', { name: landmarks[landmarks.length - 1] }]],
        },
    ];

    for (const fixture of cases) {
        const replay = {
            game: new runtime.GameManager(3),
            shopStock: makeInitialStock(runtime, 3),
            undoState: null,
        };
        fixture.setup(replay.game);
        let shadowSnapshot = serializeMirrorState(replay.game, replay.shopStock, null, 12);
        const initialSnapshot = shadowSnapshot;
        const originalSnapshot = JSON.parse(JSON.stringify(shadowSnapshot));

        fixture.actions.forEach(([action, data], index) => {
            applyMutableReplayStep(runtime, replay, action, data);
            const shadow = applyShadowReplayStep(runtime, shadowSnapshot, action, data);
            assert.strictEqual(shadow.ok, true, fixture.name + ' step ' + index + ' ' + action);
            shadowSnapshot = shadow.snapshot;
            const expected = serializeMirrorState(
                replay.game, replay.shopStock, replay.undoState, shadowSnapshot.actionSeq
            );
            assert.deepStrictEqual(
                JSON.parse(JSON.stringify(shadowSnapshot)),
                JSON.parse(JSON.stringify(expected)),
                fixture.name + ' step ' + index + ' ' + action
            );
        });
        assert.deepStrictEqual(
            JSON.parse(JSON.stringify(initialSnapshot)),
            originalSnapshot,
            fixture.name + ' must not mutate its initial snapshot'
        );
    }
});

runTest('versioned transitionはlegacy/current envelopeを合成してv1 snapshotを返す', () => {
    const run = (snapshotEnvelope, actionEnvelope) => GameEngine.transitionEnvelope({
        snapshotEnvelope,
        actionEnvelope,
        hydrate(snapshot) {
            return {
                state: snapshot,
                game: {
                    resolveTV(targetIndex) { snapshot.counter += targetIndex; return true; },
                },
            };
        },
        serialize(runtime) { return runtime.state; },
    });

    const legacy = run(
        { counter: 2 },
        { action: 'resolveTV', data: { targetIndex: 3 } }
    );
    assert.deepStrictEqual(legacy, {
        ok: true, reason: '', snapshotEnvelope: { schemaVersion: 1, snapshot: { counter: 5 } },
    });
    assert.ok(Object.isFrozen(legacy));

    const current = run(
        GameSnapshot.createSnapshotEnvelope({ counter: 4 }),
        GameActionContract.createActionEnvelope('resolveTV', { targetIndex: 2 })
    );
    assert.deepStrictEqual(current.snapshotEnvelope, { schemaVersion: 1, snapshot: { counter: 6 } });
});

runTest('versioned transitionはunknown schemaをaction適用前にfail closedにする', () => {
    const reasons = GameEngine.transitionFailureReasons;
    let hydrateCalls = 0;
    const base = {
        hydrate() { hydrateCalls++; return { game: {} }; },
        serialize() { return {}; },
    };
    assert.strictEqual(GameEngine.transitionEnvelope(null).reason, reasons.INVALID_INPUT);
    assert.strictEqual(GameEngine.transitionEnvelope(Object.assign({}, base, {
        snapshotEnvelope: { schemaVersion: 2, snapshot: {} },
        actionEnvelope: { action: 'nextTurn', data: {} },
    })).reason, reasons.INVALID_SNAPSHOT_SCHEMA);
    assert.strictEqual(GameEngine.transitionEnvelope(Object.assign({}, base, {
        snapshotEnvelope: {},
        actionEnvelope: { schemaVersion: 2, action: 'nextTurn', data: {} },
    })).reason, reasons.INVALID_ACTION_SCHEMA);
    assert.strictEqual(hydrateCalls, 0);

    const rejected = GameEngine.transitionEnvelope({
        snapshotEnvelope: {},
        actionEnvelope: { action: 'nextTurn', data: {} },
        hydrate() { return { game: { nextTurn() { return false; } } }; },
        serialize() { return {}; },
    });
    assert.deepStrictEqual(rejected, { ok: false, reason: reasons.ACTION_REJECTED, snapshotEnvelope: null });
});
