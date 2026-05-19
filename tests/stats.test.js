const assert = require('assert');
const vm = require('vm');
const { createStorage, loadScript, runTest } = require('./helpers/test-utils');

function loadStatsRuntime() {
    const { storage, localStorage } = createStorage();
    const statsEl = { innerHTML: '' };
    const context = {
        console,
        storage,
        statsEl,
        localStorage,
        document: {
            getElementById(id) {
                if (id === 'tabContentStats') return statsEl;
                return null;
            },
        },
        escapeHtml(value) { return String(value); },
        isOnlineGame: false,
        myPlayerIndex: -1,
    };
    context.global = context;
    vm.createContext(context);
    loadScript(context, 'js/stats.js');
    vm.runInContext(`
        this.__test = {
            storage,
            statsEl,
            setOnline(v) { isOnlineGame = v; },
            setMyPlayerIndex(v) { myPlayerIndex = v; },
        };
    `, context);
    return context;
}

function makeGame() {
    return {
        turnCount: 5,
        players: [
            {
                name: 'Alice',
                cards: [{ name: '麦畑' }],
                landmarks: { 駅: true, 港: false },
            },
            {
                name: 'Bob',
                cards: [{ name: 'パン屋' }],
                landmarks: { 駅: false, 港: false },
            },
        ],
    };
}

runTest('loadStats は旧形式を local/all へ移行する', () => {
    const rt = loadStatsRuntime();
    rt.localStorage.setItem('gameStats', JSON.stringify({
        totalGames: 2,
        wins: 1,
        totalTurns: 8,
        cardStats: { 麦畑: { winWith: 1, loseWith: 0 } },
        landmarkStats: {},
    }));
    const stats = rt.loadStats();
    assert.strictEqual(stats.all.totalGames, 2);
    assert.strictEqual(stats.local.totalGames, 2);
    assert.strictEqual(stats.online.totalGames, 0);
});

runTest('recordGameStats はローカル成績を all と local に記録する', () => {
    const rt = loadStatsRuntime();
    const game = makeGame();
    rt.recordGameStats(game.players[0], game, [null, null]);
    const stats = rt.loadStats();
    assert.strictEqual(stats.all.totalGames, 2);
    assert.strictEqual(stats.local.totalGames, 2);
    assert.strictEqual(stats.online.totalGames, 0);
    assert.strictEqual(stats.local.wins, 1);
    assert.strictEqual(stats.players.Alice.totalGames, 1);
    assert.strictEqual(stats.players.Bob.totalGames, 1);
});

runTest('recordGameStats はオンライン成績を all と online に記録する', () => {
    const rt = loadStatsRuntime();
    const game = makeGame();
    rt.__test.setOnline(true);
    rt.__test.setMyPlayerIndex(1);
    rt.recordGameStats(game.players[0], game, [null, null]);
    const stats = rt.loadStats();
    assert.strictEqual(stats.all.totalGames, 2);
    assert.strictEqual(stats.online.totalGames, 2);
    assert.strictEqual(stats.local.totalGames, 0);
    assert.strictEqual(stats.online.wins, 1);
    assert.strictEqual(stats.players.Alice.totalGames, 1);
    assert.strictEqual(stats.players.Bob.totalGames, 1);
});

runTest('recordGameStats はローカルCPUも難易度別に記録する', () => {
    const rt = loadStatsRuntime();
    const game = makeGame();

    rt.recordGameStats(game.players[0], game, [{ difficulty: 'strong' }, null]);
    const stats = rt.loadStats();

    assert.strictEqual(stats.all.totalGames, 2);
    assert.strictEqual(stats.local.totalGames, 2);
    assert.strictEqual(stats.cpuTypes['CPU（強）'].totalGames, 1);
    assert.strictEqual(stats.cpuTypes['CPU（強）'].wins, 1);
    assert.strictEqual(stats.players.Bob.totalGames, 1);
});

runTest('renderStats は統計モード切替ボタンを表示する', () => {
    const rt = loadStatsRuntime();
    const game = makeGame();
    rt.recordGameStats(game.players[0], game, [null, null]);
    rt.renderStats();
    assert.ok(rt.__test.statsEl.innerHTML.includes('data-action="setStatsViewMode"'));
    assert.ok(rt.__test.statsEl.innerHTML.includes('data-stats-mode="all"'));
    assert.ok(rt.__test.statsEl.innerHTML.includes('data-stats-mode="online"'));
    assert.ok(!rt.__test.statsEl.innerHTML.includes('setStatsViewMode('));
});

runTest('renderStats はプレイヤー別フィルタを表示する', () => {
    const rt = loadStatsRuntime();
    const game = makeGame();
    rt.__test.setOnline(true);
    rt.recordGameStats(game.players[0], game, [null, null]);
    rt.renderStats();
    assert.ok(rt.__test.statsEl.innerHTML.includes('data-action="setStatsPlayerFilter"'));
    assert.ok(rt.__test.statsEl.innerHTML.includes('data-player-name="Alice"'));
    assert.ok(rt.__test.statsEl.innerHTML.includes('data-player-name="Bob"'));
    assert.ok(!rt.__test.statsEl.innerHTML.includes('setStatsPlayerFilter('));
});

runTest('renderStats はCPU別フィルタを表示する', () => {
    const rt = loadStatsRuntime();
    const game = makeGame();
    rt.recordGameStats(game.players[0], game, [{ difficulty: 'expert' }, null]);
    rt.renderStats();
    assert.ok(rt.__test.statsEl.innerHTML.includes('data-player-name="CPU（最強）"'));
});

runTest('handleStatsClick は data-action から統計表示を切り替える', () => {
    const rt = loadStatsRuntime();
    const game = makeGame();
    rt.recordGameStats(game.players[0], game, [null, null]);
    rt.renderStats();

    rt.handleStatsClick({
        preventDefault() {},
        target: {
            disabled: false,
            dataset: { action: 'setStatsViewMode', statsMode: 'online' },
            closest() { return this; },
        },
    });
    assert.ok(rt.__test.statsEl.innerHTML.includes('オンラインの記録がありません'));

    rt.handleStatsClick({
        preventDefault() {},
        target: {
            disabled: false,
            dataset: { action: 'setStatsPlayerFilter', playerName: 'Alice' },
            closest() { return this; },
        },
    });
    assert.ok(rt.__test.statsEl.innerHTML.includes('Aliceの成績'));

    rt.handleStatsClick({
        preventDefault() {},
        target: {
            disabled: false,
            dataset: { action: 'clearStats' },
            closest() { return this; },
        },
    });
    assert.strictEqual(rt.localStorage.getItem('gameStats'), null);
});

runTest('recordGameStats は reset なしで二重記録しない', () => {
    const rt = loadStatsRuntime();
    const game = makeGame();
    rt.recordGameStats(game.players[0], game, [null, null]);
    rt.recordGameStats(game.players[0], game, [null, null]);
    const stats = rt.loadStats();
    assert.strictEqual(stats.local.totalGames, 2);
    assert.strictEqual(stats.players.Alice.totalGames, 1);
});

if (process.exitCode) {
    throw new Error('statsテストで失敗が発生しました');
}
