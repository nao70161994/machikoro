'use strict';
const assert = require('assert');
const LocalGameInitializer = require('../js/localGameInitializer');
const { runTest } = require('./helpers/test-utils');

function createHarness() {
    const calls = [];
    const randomValues = [0, 0.9];
    const cards = [{ name: 'enabled' }, { name: 'disabled' }];
    const shopStock = {};
    let setup = {
        playerSettings: [
            { type: 'human', difficulty: 'normal', name: 'A' },
            { type: 'cpu', difficulty: 'expert', name: 'B' },
            { type: 'human', difficulty: 'normal', name: 'C' },
        ],
    };
    const game = {
        players: [{}, {}, {}],
        currentPlayer() { return this.players[0]; },
        addLog(type, message) { calls.push(['addLog', type, message]); },
    };
    const gameRuntime = {
        setPreviousCoins(value) { calls.push(['previousCoins', value]); },
        setUndoState(value) { calls.push(['undoState', value]); },
        setGame(value) { calls.push(['setGame', value]); return { game: value }; },
        setCpuPlayers(value) { calls.push(['cpuPlayers', value]); },
    };
    const runtime = LocalGameInitializer.createRuntime({
        cancelAutoSkip: () => calls.push(['cancelAutoSkip']),
        cancelCpuSchedule: reason => calls.push(['cancelCpu', reason]),
        cancelDelayedHumanAction: () => calls.push(['cancelDelayed']),
        cards,
        cpuLabel: difficulty => `CPU:${difficulty}`,
        createCpu: (difficulty, options) => ({ difficulty, options }),
        createGame: count => { calls.push(['createGame', count]); return game; },
        gameRuntime,
        getEnabledCards: () => new Set(['enabled']),
        getEnabledLandmarks: () => new Set(),
        initialCardStock: (card, count) => card.name === 'enabled' ? count + 2 : 0,
        landmarkNames: () => ['station', 'harbor'],
        logTypes: { SYSTEM: 'system' },
        normalizePlayerName: (name, index) => name || `P${index + 1}`,
        normalizePlayerSetting: (setting, index) => setting || {
            type: 'human', difficulty: 'normal', name: `P${index + 1}`,
        },
        opponentDifficulties: settings => settings.map(setting => setting.difficulty),
        random: () => randomValues.shift(),
        render: () => calls.push(['render']),
        replaceEnabledLandmarks: values => { calls.push(['landmarks', values]); return new Set(values); },
        resetFullLog: () => calls.push(['resetLog']),
        scheduleCpu: () => calls.push(['scheduleCpu']),
        setShopStockCount: (stock, card, count) => { stock[card.name] = count; calls.push(['stock', card.name, count]); },
        setWinSoundPlayed: value => calls.push(['winSound', value]),
        setupRuntime: {
            snapshot: () => ({ playerSettings: setup.playerSettings.map(value => ({ ...value })) }),
            setPlayerSettings(value) { setup = { playerSettings: value.map(item => ({ ...item })) }; return setup; },
        },
        shopStock,
        stopConfetti: () => calls.push(['stopConfetti']),
    });
    return { calls, game, runtime, shopStock };
}

runTest('local game initializerは固定乱数で順序・名前・CPU optionsを再現する', () => {
    const { calls, game, runtime, shopStock } = createHarness();
    const result = runtime.initialize(3);
    assert.deepStrictEqual(result.order, [2, 1, 0]);
    assert.deepStrictEqual(game.players.map(player => player.name), ['C', 'CPU:expert', 'A']);
    assert.strictEqual(result.cpuPlayers[0], null);
    assert.strictEqual(result.cpuPlayers[1].difficulty, 'expert');
    assert.deepStrictEqual(result.cpuPlayers[1].options, {
        expertPurpose: 'live',
        playerCount: 3,
        expertOpponentDifficulties: ['normal', 'expert', 'normal'],
    });
    assert.deepStrictEqual(shopStock, { enabled: 5, disabled: 0 });
    assert.deepStrictEqual([...game.enabledLandmarks], ['station', 'harbor']);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.order));
    assert.strictEqual(Object.isFrozen(calls.find(call => call[0] === 'cpuPlayers')[1]), false);
    assert.ok(calls.some(call => call[0] === 'addLog' && call[2] === '👤 Cのターン'));
});

runTest('local game initializerはresetからrender・CPU予約までのeffect順を維持する', () => {
    const { calls, runtime } = createHarness();
    runtime.initialize(3);
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'cancelCpu', 'cancelDelayed', 'previousCoins', 'stopConfetti', 'winSound',
        'cancelAutoSkip', 'undoState', 'resetLog', 'createGame', 'setGame',
        'landmarks', 'stock', 'stock', 'cpuPlayers', 'addLog', 'render', 'scheduleCpu',
    ]);
    assert.strictEqual(calls[0][1], 'init-cancel-cpu');
});

runTest('local game initializerは必須依存欠落を初期化前に拒否する', () => {
    assert.throws(() => LocalGameInitializer.createRuntime(), /dependency is required/);
});
