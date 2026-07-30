const assert = require('assert');
const vm = require('vm');
const { createStorage, loadScript, runTest } = require('./helpers/test-utils');

function loadStatsRuntime(options = {}) {
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
        isOnlineGame: false,
        myPlayerIndex: -1,
        confirmCalls: [],
    };
    if (options.withShowConfirm) {
        context.showConfirm = function showConfirm(message, cb) {
            context.confirmCalls.push(message);
            if (options.confirmResult !== false) cb();
            return true;
        };
    }
    if (options.withEscapeHtml !== false) {
        context.escapeHtml = function escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };
    }
    context.global = context;
    vm.createContext(context);
    loadScript(context, 'js/clientStorage.js');
    loadScript(context, 'js/stats.js');
    vm.runInContext(`
        this.__test = {
            storage,
            statsEl,
            setOnline(v) { isOnlineGame = v; },
            setMyPlayerIndex(v) { myPlayerIndex = v; },
            confirmCalls,
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

runTest('stats storage境界は既存keyと値形式を共通facade経由で保持する', () => {
    const rt = loadStatsRuntime();
    const stats = rt.createDefaultStats();
    stats.all.totalGames = 1;

    rt.saveStats(stats);

    assert.deepStrictEqual(JSON.parse(rt.localStorage.getItem('gameStats')), JSON.parse(JSON.stringify(stats)));
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/stats.js'), 'utf8');
    assert.strictEqual(source.includes('localStorage'), false);
});

runTest('stats storage境界はstorage取得拒否を外へ伝播しない', () => {
    const rt = loadStatsRuntime();
    Object.defineProperty(rt, 'localStorage', {
        configurable: true,
        get() { throw new Error('storage blocked'); },
    });

    assert.deepStrictEqual(JSON.parse(JSON.stringify(rt.loadStats())), JSON.parse(JSON.stringify(rt.createDefaultStats())));
    assert.doesNotThrow(() => rt.saveStats(rt.createDefaultStats()));
    assert.doesNotThrow(() => rt.applyClearStats());
});

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

runTest('stats HTML helpers は filter とランキング行を生成する', () => {
    const rt = loadStatsRuntime();
    const stats = rt.createDefaultStats();
    stats.players.Alice = rt.createEmptyStatsBucket();
    stats.cpuTypes['CPU（強）'] = rt.createEmptyStatsBucket();
    const filterHtml = rt.buildStatsFilterTabsHtml(stats);
    assert.ok(filterHtml.includes('data-action="setStatsViewMode"'));
    assert.ok(filterHtml.includes('data-player-name="Alice"'));
    assert.ok(filterHtml.includes('data-player-name="CPU（強）"'));

    const bucket = rt.createEmptyStatsBucket();
    bucket.cardStats = { 麦畑: { winWith: 2, loseWith: 1 }, パン屋: { winWith: 1, loseWith: 1 } };
    bucket.landmarkStats = { 駅: { winWith: 3, loseWith: 1 } };
    const cardRows = rt.buildStatsCardRowsHtml(bucket);
    const landmarkRows = rt.buildStatsLandmarkRowsHtml(bucket);
    assert.ok(cardRows.includes('麦畑'));
    assert.ok(cardRows.includes('67%'));
    assert.ok(!cardRows.includes('パン屋'));
    assert.ok(landmarkRows.includes('駅'));
    assert.ok(landmarkRows.includes('75%'));
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

runTest('loadStats は壊れた数値を表示前に正規化する', () => {
    const rt = loadStatsRuntime();
    rt.localStorage.setItem('gameStats', JSON.stringify({
        all: {
            totalGames: '2.9',
            wins: 99,
            totalTurns: '12.8',
            cardStats: { 麦畑: { winWith: '5', loseWith: '-2' }, 壊れた: null },
            landmarkStats: { 駅: { winWith: 'NaN', loseWith: 4 } },
        },
        local: { totalGames: -1, wins: 10, totalTurns: -5, cardStats: {}, landmarkStats: {} },
        online: { totalGames: 0, wins: 0, totalTurns: 0, cardStats: {}, landmarkStats: {} },
        players: {},
        cpuTypes: {},
    }));

    const stats = rt.loadStats();
    assert.strictEqual(stats.all.totalGames, 2);
    assert.strictEqual(stats.all.wins, 2);
    assert.strictEqual(stats.all.totalTurns, 12);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(stats.all.cardStats.麦畑)), { winWith: 5, loseWith: 0 });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(stats.all.landmarkStats.駅)), { winWith: 0, loseWith: 4 });

    rt.renderStats();

    assert.ok(rt.__test.statsEl.innerHTML.includes('100%'));
    assert.ok(!rt.__test.statsEl.innerHTML.includes('NaN'));
    assert.ok(!rt.__test.statsEl.innerHTML.includes('Infinity'));
    assert.ok(!rt.__test.statsEl.innerHTML.includes('10000%'));
    assert.ok(!rt.__test.statsEl.innerHTML.includes('width:-'));
});

runTest('renderStats はui.jsのescapeHtmlがなくても表示をescapeする', () => {
    const rt = loadStatsRuntime({ withEscapeHtml: false });
    const stats = rt.createDefaultStats();
    stats.players['<b>Alice</b>'] = rt.createEmptyStatsBucket();
    stats.players['<b>Alice</b>'].totalGames = 1;
    rt.localStorage.setItem('gameStats', JSON.stringify(stats));

    rt.renderStats();

    assert.ok(rt.__test.statsEl.innerHTML.includes('&lt;b&gt;Alice&lt;/b&gt;'));
    assert.ok(!rt.__test.statsEl.innerHTML.includes('<b>Alice</b>'));
});

runTest('renderStats は保存済みプレイヤー名をラベルと空状態でescapeする', () => {
    const rt = loadStatsRuntime();
    const name = '<img src=x onerror=alert(1)>';
    const stats = rt.createDefaultStats();
    stats.players[name] = rt.createEmptyStatsBucket();
    stats.players[name].totalGames = 1;
    stats.players[name].wins = 1;
    rt.localStorage.setItem('gameStats', JSON.stringify(stats));

    rt.renderStats();
    rt.handleStatsClick({
        preventDefault() {},
        target: {
            disabled: false,
            dataset: { action: 'setStatsPlayerFilter', playerName: name },
            closest() { return this; },
        },
    });
    assert.ok(rt.__test.statsEl.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;の成績'));
    assert.ok(!rt.__test.statsEl.innerHTML.includes('<img src=x onerror=alert(1)>'));

    const emptyStats = rt.createDefaultStats();
    emptyStats.players[name] = rt.createEmptyStatsBucket();
    rt.localStorage.setItem('gameStats', JSON.stringify(emptyStats));
    rt.renderStats();
    assert.ok(rt.__test.statsEl.innerHTML.includes('まだ&lt;img src=x onerror=alert(1)&gt;の記録がありません'));
    assert.ok(!rt.__test.statsEl.innerHTML.includes('まだ<img'));
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

runTest('clearStats は showConfirm 経由で統計を削除する', () => {
    const rt = loadStatsRuntime({ withShowConfirm: true, confirmResult: false });
    const game = makeGame();
    rt.recordGameStats(game.players[0], game, [null, null]);

    rt.clearStats();

    assert.deepStrictEqual(rt.__test.confirmCalls, ['統計をリセットしますか？']);
    assert.ok(rt.localStorage.getItem('gameStats'));

    rt.__test.confirmCalls.length = 0;
    rt.showConfirm = function showConfirm(message, cb) {
        rt.__test.confirmCalls.push(message);
        cb();
        return true;
    };

    rt.clearStats();

    assert.deepStrictEqual(rt.__test.confirmCalls, ['統計をリセットしますか？']);
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
