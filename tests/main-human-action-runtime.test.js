'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const MainHumanActionRuntime = require('../js/mainHumanActionRuntime');
const LocalActionPolicy = require('../js/localActionPolicy');
const { runTest } = require('./helpers/test-utils');

const ACTIONS = Object.freeze({
    ROLL_DICE: 'rollDice',
    SELECT_DICE: 'selectDice',
    REROLL_DICE: 'rerollDice',
    SKIP_REROLL: 'skipReroll',
    RESOLVE_HARBOR: 'resolveHarbor',
    RESOLVE_TV: 'resolveTV',
    RESOLVE_BUSINESS: 'resolveBusiness',
    RESOLVE_CLEANING: 'resolveCleaning',
    RESOLVE_MOVER: 'resolveMover',
    RESOLVE_RENOVATION: 'resolveRenovation',
    RESOLVE_IT: 'resolveIT',
    BUILD_CARD: 'buildCard',
    BUILD_LANDMARK: 'buildLandmark',
    NEXT_TURN: 'nextTurn',
});

function createHarness(options = {}) {
    const calls = [];
    const delayed = [];
    const random = [...(options.random || [2, 3, 4, 5])];
    const current = {
        landmarks: { 駅: false, 空港: !!options.airport },
    };
    const game = {
        builtThisTurn: !!options.builtThisTurn,
        currentPlayerIndex: 0,
        checkWinner: () => false,
        currentPlayer: () => current,
        rollDice(forceDice, tunaDice) { calls.push(['rollDice', forceDice, tunaDice]); },
        selectDiceCount(...args) { calls.push(['selectDiceCount', ...args]); },
        rerollDice(...args) { calls.push(['rerollDice', ...args]); },
        skipReroll() { calls.push(['skipReroll']); },
        buildCard(card) { calls.push(['buildCard', card.name]); return options.buildResult !== false; },
        buildLandmark(name) { calls.push(['buildLandmark', name]); return options.buildResult !== false; },
        nextTurn() { calls.push(['nextTurn']); return 'next-result'; },
    };
    const gameState = { game, cpuPlayers: [null, null] };
    const onlineState = {
        isOnlineGame: !!options.online,
        myPlayerIndex: 0,
        socket: { connected: true },
    };
    let delayedPending = false;
    const pageActivationRuntime = {
        isDelayedPending: () => delayedPending,
        scheduleDelayed(action, playerIndex, run, delay) {
            calls.push(['scheduleDelayed', action, playerIndex, delay]);
            delayedPending = true;
            delayed.push(() => { delayedPending = false; run(); });
        },
    };
    const stock = { 麦畑: 1 };
    const elements = {
        myCardSelect: { value: '2' },
        theirCardSelect_1: { value: '3' },
        moverCardSelect: { value: '4' },
    };
    const runtime = MainHumanActionRuntime.createRuntime({
        actions: ACTIONS,
        allowedActionsFor: () => new Set(Object.values(ACTIONS)),
        cancelAutoSkip: () => calls.push(['cancelAutoSkip']),
        cards: [{ name: '麦畑', cost: 1 }],
        checkpoint: (event, details) => calls.push(['checkpoint', event, details]),
        clearUndoState: () => calls.push(['clearUndoState']),
        document: { getElementById: id => elements[id] },
        decrementStock: (target, card) => {
            calls.push(['decrementStock', card.name]);
            target[card.name]--;
        },
        getActionFlightState: () => ({ inFlight: !!options.inFlight }),
        getGameState: () => gameState,
        getLandmarkEmoji: () => '🏛️',
        getOnlineState: () => onlineState,
        getStockCount: (target, card) => target[card.name] || 0,
        isReconnectBlocked: () => !!options.reconnecting,
        landmarkNames: { STATION: '駅', AIRPORT: '空港' },
        localActionPolicy: LocalActionPolicy,
        pageActivationRuntime,
        playSound: name => calls.push(['playSound', name]),
        player: { landmarkCost: () => 4 },
        render: () => calls.push(['render']),
        rollDie: () => random.shift(),
        runAction(action, data, fallback, runtimeOptions) {
            const call = ['runAction', action, data];
            if (runtimeOptions !== undefined) call.push(runtimeOptions);
            calls.push(call);
            return fallback();
        },
        saveUndoState: () => calls.push(['saveUndoState']),
        scheduleCpu: () => calls.push(['scheduleCpu']),
        sendAction: (action, data) => { calls.push(['sendAction', action, data]); return 'sent'; },
        shopStock: stock,
        showConfirm: (message, callback) => { calls.push(['showConfirm', message]); callback(); },
        traceBuild: (stage, details) => calls.push(['traceBuild', stage, details]),
        unlockHumanTurn: reason => calls.push(['unlockHumanTurn', reason]),
        updateDiceDisplay: (nums, rolling) => calls.push(['updateDiceDisplay', nums, rolling]),
    });
    return {
        calls,
        current,
        flushDelayed: () => delayed.shift()(),
        game,
        gameState,
        onlineState,
        runtime,
        stock,
    };
}

runTest('main human action runtimeはroll遅延と乱数payloadの既存順を維持する', () => {
    const harness = createHarness({ random: [2, 3, 4] });
    harness.runtime.onRoll();
    assert.deepStrictEqual(harness.calls, [
        ['playSound', 'dice'],
        ['updateDiceDisplay', null, true],
        ['scheduleDelayed', 'rollDice', 0, 600],
    ]);
    harness.flushDelayed();
    assert.deepStrictEqual(harness.calls.slice(3), [
        ['runAction', 'rollDice', { forceDice: 2, tunaDice: [3, 4] }],
        ['rollDice', 2, [3, 4]],
    ]);
});

runTest('main human action runtimeはonline ACK中の人間actionを入場前に拒否する', () => {
    const harness = createHarness({ online: true, inFlight: true });
    assert.strictEqual(harness.runtime.canRunLocalHumanAction(), false);
    harness.runtime.onReroll();
    assert.deepStrictEqual(harness.calls, []);
});

runTest('main human action runtimeはlocal card建設を共有action runtime経由で適用する', () => {
    const harness = createHarness();
    harness.runtime.onBuildCard('麦畑');
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'traceBuild', 'showConfirm', 'traceBuild', 'saveUndoState', 'cancelAutoSkip',
        'runAction', 'buildCard', 'decrementStock', 'traceBuild', 'playSound', 'render',
        'traceBuild', 'unlockHumanTurn', 'scheduleCpu',
    ]);
    assert.strictEqual(harness.stock.麦畑, 0);
    assert.deepStrictEqual(harness.calls[5], [
        'runAction', 'buildCard', { cardName: '麦畑' }, { effects: false },
    ]);
});

runTest('main human action runtimeはonline建設をlocal mutationなしで送信する', () => {
    const harness = createHarness({ online: true });
    harness.runtime.onBuildLandmark('駅');
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'traceBuild', 'showConfirm', 'traceBuild', 'saveUndoState', 'cancelAutoSkip',
        'sendAction', 'traceBuild',
    ]);
    assert.deepStrictEqual(harness.calls[5], ['sendAction', 'buildLandmark', { name: '駅' }]);
});

runTest('main human action runtimeは空港skip確認後にUndoを消してnextTurnする', () => {
    const harness = createHarness({ airport: true });
    harness.runtime.onSkip();
    assert.ok(harness.calls[1][1].includes('空港効果で+10コイン'));
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'checkpoint', 'showConfirm', 'checkpoint', 'cancelAutoSkip', 'clearUndoState',
        'runAction', 'nextTurn', 'checkpoint',
    ]);
});

runTest('mainは人間action orchestrationを専用runtimeへ委譲する', () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'js/main.js'), 'utf8');
    const runtimeSource = fs.readFileSync(
        path.join(__dirname, '..', 'js/mainHumanActionRuntime.js'),
        'utf8'
    );
    assert.ok(mainSource.includes('MainHumanActionRuntime.createRuntime'));
    for (const pattern of [
        'currentGame.rollDice(',
        'delayedGame.selectDiceCount(',
        'gameState().game.buildCard(card)',
        'gameState().game.buildLandmark(name)',
        "checkpoint('skip-confirmed'",
    ]) {
        assert.strictEqual(mainSource.includes(pattern), false, pattern);
        assert.strictEqual(runtimeSource.includes(pattern), true, pattern);
    }
});

runTest('main human action runtimeは必須依存欠落を初期化前に拒否する', () => {
    assert.throws(() => MainHumanActionRuntime.createRuntime(), /dependency is required/);
    const harness = createHarness();
    assert.ok(Object.isFrozen(harness.runtime));
});
