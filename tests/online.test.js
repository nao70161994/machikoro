const assert = require('assert');
const vm = require('vm');
const { createStorage, loadScripts, loadScript, runTest } = require('./helpers/test-utils');

function loadOnlineRuntime() {
    const { storage, localStorage } = createStorage();
    const elements = {};
    const context = {
        console,
        localStorage,
        document: {
            getElementById(id) {
                if (!elements[id]) elements[id] = { style: {}, textContent: '', innerHTML: '' };
                return elements[id];
            },
        },
    };
    vm.createContext(context);

    // ゲームロジック本体をロード
    loadScripts(context, ['js/Card.js', 'js/Player.js', 'js/GameManager.js']);

    // online.js が参照するグローバルをモック
    vm.runInContext(`
        // DOM・通信不要のモック
        let game = null;
        const SHOP_STOCK = {};
        let cpuPlayers = [];
        let enabledCards = new Set();
        let enabledLandmarks = new Set();
        let prevCoins = null;
        let undoState = null;
        let cpuScheduleToken = 0;
        let statsResetCount = 0;
        let renderCount = 0;
        let scheduleCount = 0;
        let socketHandlers = {};
        let socketEmits = [];
        let socketDisconnected = false;
        const CPU = class { constructor() {} };
        function render() { renderCount++; }
        function scheduleCPU() { scheduleCount++; }
        function resetFullLog() {}
        function resetStatsRecorded() { statsResetCount++; }
        function restoreUndoSnapshot(state) { game = state.game; }
        function updateResumeButton() {}
        const io = () => ({
            on(name, handler) { socketHandlers[name] = handler; },
            emit(name, payload) { socketEmits.push({ name, payload }); },
            disconnect() { socketDisconnected = true; },
        });
        const alert = () => {};
    `, context);

    // online.js をロード
    loadScript(context, 'js/online.js');

    // テスト用エクスポート
    vm.runInContext(`
        this.GameManager = GameManager;
        this.Player = Player;
        this.CARDS = CARDS;
        this.createCardByName = createCardByName;
        this.GAME_PHASES = GAME_PHASES;
        this.LOG_TYPES = LOG_TYPES;
        this.getGame = () => game;
        this.setGame = (g) => { game = g; };
        this.getShopStock = () => SHOP_STOCK;
        this.getCpuPlayers = () => cpuPlayers;
        this.setEnabledCards = (s) => { enabledCards = s; };
        this.setEnabledLandmarks = (s) => { enabledLandmarks = s; };
        this.getStatsResetCount = () => statsResetCount;
        this.getRenderCount = () => renderCount;
        this.getScheduleCount = () => scheduleCount;
        this.getSocketHandlers = () => socketHandlers;
        this.getSocketEmits = () => socketEmits;
        this.getSocketDisconnected = () => socketDisconnected;
        this.applyAction = applyAction;
        this.APP_ERROR_EVENT = APP_ERROR_EVENT;
        this.renderOnlinePlayerSettings = renderOnlinePlayerSettings;
        this.setOnlineSelectedCount = (value) => { onlineSelectedCount = value; };
        this.setOnlinePlayerSettings = (value) => { onlinePlayerSettings = value; };
        this._saveActionLog = _saveActionLog;
        this._readOnlineActionLog = _readOnlineActionLog;
        this.buildOnlineSnapshot = buildOnlineSnapshot;
        this.handleAppError = handleAppError;
        this.restoreOnlineSnapshot = restoreOnlineSnapshot;
        this.initOnlineGame = initOnlineGame;
        this.initSocket = initSocket;
        this.setOnlineState = (v) => {
            if (typeof v.socket !== 'undefined') socket = v.socket;
            if (typeof v.isReconnectingOnline !== 'undefined') isReconnectingOnline = v.isReconnectingOnline;
            if (typeof v.isRoomHost !== 'undefined') isRoomHost = v.isRoomHost;
        };
        this.getOnlineState = () => ({ socket, isReconnectingOnline, isRoomHost });
        this.myPlayerIndex = myPlayerIndex;
    `, context);
    context.elements = elements;

    return context;
}

const rt = loadOnlineRuntime();
const { GameManager, Player, CARDS, createCardByName, GAME_PHASES, LOG_TYPES } = rt;

function makeGame(count = 2) {
    const g = new GameManager(count);
    rt.setGame(g);
    // SHOP_STOCK を初期化
    for (const card of CARDS) rt.getShopStock()[card.name] = 6;
    return g;
}

runTest('renderOnlinePlayerSettings は学習AIの選択方針を説明する', () => {
    const localRt = loadOnlineRuntime();
    localRt.setOnlineSelectedCount(2);
    localRt.setOnlinePlayerSettings([{ type: 'cpu', difficulty: 'rl' }, { type: 'human', difficulty: 'normal' }]);

    localRt.renderOnlinePlayerSettings();

    assert.ok(localRt.elements.onlinePlayerSettings.innerHTML.includes('2人用の複数モデルからランダム'));

    localRt.setOnlineSelectedCount(5);
    localRt.setOnlinePlayerSettings([
        { type: 'cpu', difficulty: 'rl' },
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    localRt.renderOnlinePlayerSettings();

    assert.ok(localRt.elements.onlinePlayerSettings.innerHTML.includes('value="rl" disabled'));
    assert.ok(localRt.elements.onlinePlayerSettings.innerHTML.includes('AI（学習）は現在2〜4人戦のみ対応です'));
});

// ===== applyAction =====

runTest('applyAction rollDice: ROLLフェーズからPENDING/BUILDへ遷移する', () => {
    const game = makeGame(2);
    assert.strictEqual(game.phase, GAME_PHASES.ROLL);
    rt.applyAction('rollDice', { forceDice: 3, tunaDice: [1, 1] });
    const after = rt.getGame().phase;
    assert.ok(after === GAME_PHASES.PENDING || after === GAME_PHASES.BUILD,
        `expected PENDING or BUILD, got ${after}`);
});

runTest('applyAction buildCard: カードがプレイヤーに追加されSHOP_STOCKが減る', () => {
    const game = makeGame(2);
    // BUILDフェーズへ進める
    rt.applyAction('rollDice', { forceDice: 3, tunaDice: [1, 1] });
    // pendingがあればスキップ（テスト簡略化のため直接フェーズを設定）
    const g = rt.getGame();
    g.phase = GAME_PHASES.BUILD;

    const beforeCards = g.currentPlayer().cards.length;
    const beforeStock = rt.getShopStock()['麦畑'];
    rt.applyAction('buildCard', { cardName: '麦畑' });
    assert.strictEqual(g.currentPlayer().cards.length, beforeCards + 1);
    assert.strictEqual(rt.getShopStock()['麦畑'], beforeStock - 1);
});

runTest('applyAction buildCard: コイン不足だとカードが追加されずSHOP_STOCKも変わらない', () => {
    const game = makeGame(2);
    game.phase = GAME_PHASES.BUILD;
    const player = game.currentPlayer();
    player.coins = 0; // 所持金0
    const beforeCards = player.cards.length;
    const beforeStock = rt.getShopStock()['鉱山']; // cost 6
    rt.applyAction('buildCard', { cardName: '鉱山' });
    assert.strictEqual(player.cards.length, beforeCards);
    assert.strictEqual(rt.getShopStock()['鉱山'], beforeStock);
});

runTest('applyAction buildLandmark: ランドマークが建設される', () => {
    const game = makeGame(2);
    game.phase = GAME_PHASES.BUILD;
    const player = game.currentPlayer();
    player.coins = 10;
    rt.applyAction('buildLandmark', { name: '駅' });
    assert.strictEqual(rt.getGame().currentPlayer().landmarks['駅'], true);
});

runTest('applyAction nextTurn: ターンが次のプレイヤーへ進む', () => {
    const game = makeGame(2);
    game.phase = GAME_PHASES.BUILD;
    const before = game.currentPlayerIndex;
    rt.applyAction('nextTurn', {});
    assert.notStrictEqual(rt.getGame().currentPlayerIndex, before);
});

runTest('applyAction skipReroll: REROLL_CONFIRMフェーズを抜ける', () => {
    const game = makeGame(2);
    // 駅+電波塔があるとREROLL_CONFIRMになる
    game.currentPlayer().landmarks['駅'] = true;
    game.currentPlayer().landmarks['電波塔'] = true;
    rt.applyAction('rollDice', { forceDice: null, tunaDice: null });
    // selectDiceを実行（1個選択）
    rt.applyAction('selectDice', { useTwo: false, d1: 3, d2: 0, tunaDice: [1, 1] });
    assert.strictEqual(rt.getGame().phase, GAME_PHASES.REROLL_CONFIRM);
    rt.applyAction('skipReroll', {});
    const after = rt.getGame().phase;
    assert.ok(after === GAME_PHASES.PENDING || after === GAME_PHASES.BUILD,
        `expected PENDING or BUILD after skipReroll, got ${after}`);
});

// ===== initOnlineGame =====

runTest('initOnlineGame: プレイヤー名がorderに従って設定される', () => {
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initOnlineGame(['Alice', 'Bob'], null, [0, 1]);
    const g = rt.getGame();
    assert.strictEqual(g.players[0].name, 'Alice');
    assert.strictEqual(g.players[1].name, 'Bob');
});

runTest('initOnlineGame: playerOrderシャッフルでも正しい名前が設定される', () => {
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initOnlineGame(['Alice', 'Bob'], null, [1, 0]);
    const g = rt.getGame();
    assert.strictEqual(g.players[0].name, 'Bob');
    assert.strictEqual(g.players[1].name, 'Alice');
});

runTest('initOnlineGame: enabledCardsに含まれるカードのみSHOP_STOCKを初期化する', () => {
    rt.setEnabledCards(new Set(['麦畑', 'スタジアム']));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initOnlineGame(['Alice', 'Bob', 'Carol'], null, [0, 1, 2]);
    const stock = rt.getShopStock();
    assert.strictEqual(stock['麦畑'], 6);
    assert.strictEqual(stock['パン屋'], 0);
    assert.strictEqual(stock['スタジアム'], 3);
});

runTest('initOnlineGame: CPU設定がorderに合わせてcpuPlayersに反映される', () => {
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    const ps = [{ type: 'human' }, { type: 'cpu', difficulty: 'normal' }];
    rt.initOnlineGame(['Alice', 'Bob'], ps, [0, 1]);
    const cpuPlayers = rt.getCpuPlayers();
    assert.strictEqual(cpuPlayers[0], null);
    assert.ok(cpuPlayers[1] !== null);
});

runTest('initOnlineGame: 統計記録フラグをリセットする', () => {
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    const before = rt.getStatsResetCount();
    rt.initOnlineGame(['Alice', 'Bob'], null, [0, 1]);
    assert.strictEqual(rt.getStatsResetCount(), before + 1);
});

runTest('initSocket gameStart→gameAction→rejoinData で再接続復元できる', () => {
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    const handlers = rt.getSocketHandlers();

    handlers.gameStart({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        versions: ['a'],
    });
    handlers.gameAction({ action: 'buildCard', data: { cardName: '麦畑' }, playerIndex: 0 });
    const snapshot = rt.buildOnlineSnapshot();

    handlers.rejoinData({
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
        },
        stateSnapshot: snapshot,
        actionLog: [{ action: 'nextTurn', data: {} }],
        playerIndex: 0,
    });

    const game = rt.getGame();
    assert.strictEqual(game.players[0].name, 'Alice');
    assert.ok(game.players[0].countCard('麦畑') >= 2);
    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.ok(rt.getRenderCount() > 0);
    assert.ok(rt.getScheduleCount() > 0);
});

runTest('restoreOnlineSnapshot はゲーム状態と在庫を復元する', () => {
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initOnlineGame(['Alice', 'Bob'], null, [0, 1]);
    rt.restoreOnlineSnapshot({
        players: [
            {
                name: 'Alice',
                coins: 7,
                cards: ['麦畑', 'パン屋'],
                dormantIndices: [1],
                landmarks: { 駅: true, ショッピングモール: false, 遊園地: false, 電波塔: false, 港: false, 空港: false },
                itVentureCoins: 2,
                hasYakusho: true,
            },
            {
                name: 'Bob',
                coins: 3,
                cards: ['麦畑'],
                dormantIndices: [],
                landmarks: { 駅: false, ショッピングモール: false, 遊園地: false, 電波塔: false, 港: false, 空港: false },
                itVentureCoins: 0,
                hasYakusho: true,
            },
        ],
        currentPlayerIndex: 1,
        phase: GAME_PHASES.BUILD,
        log: [{ type: LOG_TYPES.SYSTEM, message: 'test' }],
        lastDiceResult: 5,
        lastDice1: 2,
        lastDice2: 3,
        builtThisTurn: true,
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        usedReroll: true,
        pendingTunaDice: [1, 2],
        turnCount: 4,
        hadAmusementParkAtRoll: true,
        shopStock: { 麦畑: 4, パン屋: 5 },
    });
    const g = rt.getGame();
    assert.strictEqual(g.currentPlayerIndex, 1);
    assert.strictEqual(g.players[0].coins, 7);
    assert.strictEqual(g.players[0].dormantCards.length, 1);
    assert.strictEqual(rt.getShopStock()['麦畑'], 4);
    assert.strictEqual(g.turnCount, 4);
});

runTest('_saveActionLog はしきい値超過時に snapshot へ圧縮する', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initOnlineGame(['Alice', 'Bob'], null, [0, 1]);
    const game = rt.getGame();
    game.currentPlayer().coins = 9;
    for (let i = 0; i < 200; i++) {
        rt._saveActionLog('nextTurn', {});
    }
    rt._saveActionLog('buildLandmark', { name: '駅' });
    const log = rt._readOnlineActionLog();
    const snapshot = JSON.parse(rt.localStorage.getItem('onlineStateSnapshot'));
    assert.strictEqual(log.length, 1);
    assert.strictEqual(log[0].action, 'buildLandmark');
    assert.strictEqual(snapshot.players[0].coins, 9);
});

runTest('handleAppError は再接続中にオンラインセッションを破棄して切断する', () => {
    const rt = loadOnlineRuntime();
    let disconnected = false;
    rt.localStorage.setItem('onlineSession', '{"roomId":"ROOM01"}');
    rt.setOnlineState({
        socket: { disconnect() { disconnected = true; } },
        isReconnectingOnline: true,
        isRoomHost: false,
    });
    rt.handleAppError('再接続に失敗');
    assert.strictEqual(disconnected, true);
    assert.strictEqual(rt.localStorage.getItem('onlineSession'), null);
    assert.strictEqual(rt.getOnlineState().isReconnectingOnline, false);
});

if (process.exitCode) {
    throw new Error('onlineテストで失敗が発生しました');
}
