'use strict';

const assert = require('assert');
const AutoSkipPolicy = require('../js/autoSkipPolicy');
const MainAutoSkipRuntime = require('../js/mainAutoSkipRuntime');
const { runTest } = require('./helpers/test-utils');

function createHarness(overrides = {}) {
    const events = [];
    const timers = [];
    const game = {
        builtThisTurn: false,
        currentPlayerIndex: 0,
        pendingRenovation: 0,
        phase: 'build',
        checkWinner() {
            events.push('checkWinner');
            return false;
        },
        currentPlayer() {
            events.push('currentPlayer');
            return { coins: 0, landmarks: {}, countCardIncludingDormant: () => 0 };
        },
        nextTurn() {
            events.push('nextTurn');
            this.currentPlayerIndex++;
        },
    };
    const dependencies = {
        canRunLocalHumanAction(playerIndex) {
            events.push(`canRun:${playerIndex}`);
            return true;
        },
        cards: [],
        clearTimeout(timer) { events.push(`clearTimeout:${timer}`); },
        gamePhases: { BUILD: 'build' },
        getEnabledLandmarks() {
            events.push('getEnabledLandmarks');
            return new Set();
        },
        getGameState() {
            events.push('getGameState');
            return { game, cpuPlayers: [null, null] };
        },
        getOnlineState() {
            events.push('getOnlineState');
            return { isOnlineGame: false, myPlayerIndex: 0 };
        },
        getStockCount: () => 0,
        landmarkNames: { YAKUSHO: '役所' },
        player: { landmarkCost: () => 0 },
        policy: AutoSkipPolicy,
        runAction(action, data, fallback) {
            events.push(`runAction:${action}:${JSON.stringify(data)}`);
            fallback();
        },
        setTimeout(callback, delay) {
            events.push(`setTimeout:${delay}`);
            timers.push(callback);
            return 41;
        },
        shopStock: {},
        ...overrides,
    };
    return { events, game, runtime: MainAutoSkipRuntime.createRuntime(dependencies), timers };
}

runTest('main auto skip runtimeは実行時snapshot後に可否確認・action・fallbackを順序実行する', () => {
    const harness = createHarness();

    assert.strictEqual(harness.runtime.check(), true);
    assert.strictEqual(harness.runtime.controller.snapshot().pending, true);
    assert.deepStrictEqual(harness.events, [
        'getGameState',
        'checkWinner',
        'getOnlineState',
        'currentPlayer',
        'getEnabledLandmarks',
        'setTimeout:1500',
    ]);

    harness.timers[0]();

    assert.strictEqual(harness.runtime.controller.snapshot().pending, false);
    assert.deepStrictEqual(harness.events.slice(-4), [
        'getGameState',
        'canRun:0',
        'runAction:nextTurn:{}',
        'nextTurn',
    ]);
    assert.strictEqual(harness.game.currentPlayerIndex, 1);
});

runTest('main auto skip runtimeは予約時のplayerが実行時に無効ならactionを送らない', () => {
    const harness = createHarness({ canRunLocalHumanAction: () => false });

    harness.runtime.check();
    harness.timers[0]();

    assert.ok(!harness.events.some(event => event.startsWith('runAction:')));
    assert.strictEqual(harness.runtime.controller.snapshot().pending, false);
});

runTest('main auto skip runtimeのcancelはtimer解除後にpendingを解放する', () => {
    const harness = createHarness();
    harness.runtime.check();

    harness.runtime.cancel();

    assert.strictEqual(harness.events.at(-1), 'clearTimeout:41');
    assert.strictEqual(harness.runtime.controller.snapshot().pending, false);
});
