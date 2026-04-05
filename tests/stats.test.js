const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadStatsRuntime() {
    const storage = new Map();
    const statsEl = { innerHTML: '' };
    const context = {
        console,
        storage,
        statsEl,
        localStorage: {
            getItem(key) { return storage.has(key) ? storage.get(key) : null; },
            setItem(key, value) { storage.set(key, String(value)); },
            removeItem(key) { storage.delete(key); },
        },
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
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/stats.js'), 'utf8');
    vm.runInContext(source, context, { filename: 'js/stats.js' });
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

function runTest(name, fn) {
    try {
        fn();
        console.log(`テスト成功: ${name}`);
    } catch (error) {
        console.error(`テスト失敗: ${name}`);
        console.error(error.stack);
        process.exitCode = 1;
    }
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

runTest('renderStats は統計モード切替ボタンを表示する', () => {
    const rt = loadStatsRuntime();
    const game = makeGame();
    rt.recordGameStats(game.players[0], game, [null, null]);
    rt.renderStats();
    assert.ok(rt.__test.statsEl.innerHTML.includes("setStatsViewMode('all')"));
    assert.ok(rt.__test.statsEl.innerHTML.includes("setStatsViewMode('online')"));
});

runTest('renderStats はプレイヤー別フィルタを表示する', () => {
    const rt = loadStatsRuntime();
    const game = makeGame();
    rt.__test.setOnline(true);
    rt.recordGameStats(game.players[0], game, [null, null]);
    rt.renderStats();
    assert.ok(rt.__test.statsEl.innerHTML.includes("setStatsPlayerFilter('Alice')"));
    assert.ok(rt.__test.statsEl.innerHTML.includes("setStatsPlayerFilter('Bob')"));
});

if (process.exitCode) {
    throw new Error('statsテストで失敗が発生しました');
}
