'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const OnlineGameInitializer = require('../js/onlineGameInitializer');
const MarketSupply = require('../js/marketSupply');
const { runTest } = require('./helpers/test-utils');

function createHarness(options = {}) {
    const calls = [];
    const cards = options.cards || [{ name: 'enabled' }, { name: 'disabled' }];
    const shopStock = {};
    const game = {
        players: [{}, {}, {}],
        currentPlayer() { return this.players[0]; },
        addLog(type, message) { calls.push(['addLog', type, message]); },
    };
    const runtime = OnlineGameInitializer.createRuntime({
        cancelAutoSkip: () => calls.push(['cancelAutoSkip']),
        cancelCpuSchedule: () => calls.push(['cancelCpu']),
        cancelDelayedHumanAction: () => calls.push(['cancelDelayed']),
        cards,
        createCpu: (difficulty, options) => ({ difficulty, options }),
        createGame: count => { calls.push(['createGame', count]); return game; },
        gameRuntime: {
            setPreviousCoins: value => calls.push(['previousCoins', value]),
            setUndoState: value => calls.push(['undoState', value]),
            setGame: value => { calls.push(['setGame', value]); return { game: value }; },
            setCpuPlayers: value => calls.push(['cpuPlayers', value]),
        },
        getSelection: () => ({
            enabledCards: options.enabledCards || ['enabled'],
            enabledLandmarks: [],
            marketRule: options.marketRule || 'standard',
        }),
        initialCardStock: options.initialCardStock || ((card, count) => count + card.name.length),
        landmarkNames: () => ['station'],
        logTypes: { SYSTEM: 'system' },
        marketSupply: MarketSupply,
        opponentDifficulties: settings => settings.map(value => value && value.difficulty),
        render: () => calls.push(['render']),
        resetFullLog: () => calls.push(['resetLog']),
        resetStatsRecorded: () => calls.push(['resetStats']),
        scheduleCpu: () => calls.push(['scheduleCpu']),
        setCurrentPlayerIndex: index => calls.push(['playerIndex', index]),
        setShopStockCount: (stock, card, count) => {
            stock[card.name] = count;
            calls.push(['stock', card.name, count]);
        },
        shopStock,
    });
    return { calls, game, runtime, shopStock };
}

runTest('online game initializerは順序・CPU設定・自分位置を同じ入力から構築する', () => {
    const { calls, game, runtime } = createHarness();
    const result = runtime.initialize({
        myOriginalPlayerIndex: 0,
        playerNames: ['Alice', 'CPU', 'Carol'],
        playerOrder: [2, 0, 1],
        playerSettings: [
            { type: 'human' },
            { type: 'cpu', difficulty: 'rl', modelId: 'model-a' },
            { type: 'human' },
        ],
    });
    assert.deepStrictEqual(game.players.map(player => player.name), ['Carol', 'Alice', 'CPU']);
    assert.strictEqual(result.cpuPlayers[2].difficulty, 'rl');
    assert.deepStrictEqual(result.cpuPlayers[2].options, {
        expertPurpose: 'live',
        playerCount: 3,
        expertOpponentDifficulties: [undefined, undefined, 'rl'],
        rlModelId: 'model-a',
    });
    assert.deepStrictEqual(calls.find(call => call[0] === 'playerIndex'), ['playerIndex', 1]);
    assert.deepStrictEqual([...game.enabledLandmarks], ['station']);
    assert.ok(calls.some(call => call[0] === 'addLog' && call[2] === '👤 Carolのターン'));
    assert.ok(Object.isFrozen(result));
});

runTest('online game initializerはresetから描画・CPU予約までのeffect順を維持する', () => {
    const { calls, runtime } = createHarness();
    runtime.initialize({ playerNames: ['A', 'B', 'C'], myOriginalPlayerIndex: 9 });
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'cancelCpu', 'cancelDelayed', 'cancelAutoSkip', 'previousCoins', 'undoState',
        'resetLog', 'resetStats', 'createGame', 'setGame', 'stock', 'stock',
        'cpuPlayers', 'playerIndex', 'addLog', 'render', 'scheduleCpu',
    ]);
    assert.deepStrictEqual(calls.find(call => call[0] === 'playerIndex'), ['playerIndex', 0]);
});

runTest('online game initializerは同じseedから公式オプション市場を再現する', () => {
    const cards = Array.from({ length: 12 }, (_, index) => ({ name: `施設${index + 1}` }));
    const options = {
        cards,
        enabledCards: cards.map(card => card.name),
        marketRule: 'ten-type',
        initialCardStock: () => 2,
    };
    const left = createHarness(options);
    const right = createHarness(options);
    const input = {
        playerNames: ['A', 'B', 'C'],
        playerOrder: [0, 1, 2],
        marketSeed: 123456,
    };
    left.runtime.initialize(input);
    right.runtime.initialize(input);
    assert.deepStrictEqual(left.game.marketSupply, right.game.marketSupply);
    assert.deepStrictEqual(left.shopStock, right.shopStock);
    assert.strictEqual(MarketSupply.marketTypeCount(left.shopStock), 10);
});

runTest('online game initializerは必須依存欠落を初期化前に拒否する', () => {
    assert.throws(() => OnlineGameInitializer.createRuntime(), /dependency is required/);
});

runTest('online.jsはゲーム初期化を専用runtimeへ委譲する', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/online.js'), 'utf8');
    assert.ok(source.includes('OnlineGameInitializer.createRuntime'));
    assert.ok(source.includes('getOnlineGameInitializer().initialize'));
    assert.strictEqual(source.includes('const orderedSettings = order.map'), false);
});
