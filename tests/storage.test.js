const assert = require('assert');
const vm = require('vm');
const { createStorage, loadScripts, makeElement, runTest } = require('./helpers/test-utils');

function loadStorageRuntime() {
    const { localStorage } = createStorage();
    const elements = {
        resumeSection: makeElement(),
        onlineResumeSection: makeElement(),
        onlineResumeDescription: makeElement(),
        titleScreen: makeElement(),
        gameScreen: makeElement(),
        playerCount: makeElement(),
        speedLabel: makeElement(),
        cpuSpeed: makeElement({ value: '1500' }),
        onlineStatus: makeElement(),
    };
    const alerts = [];
    let confirmCount = 0;
    const context = {
        console,
        localStorage,
        document: {
            getElementById(id) {
                if (!elements[id]) elements[id] = makeElement();
                return elements[id];
            },
        },
        window: {},
        elements,
        alerts,
        GameManager: class GameManager {
            constructor(count) {
                this.players = Array.from({ length: count }, () => ({
                    name: '',
                    coins: 3,
                    cards: [],
                    dormantCards: [],
                    landmarks: {},
                    itVentureCoins: 0,
                    hasYakusho: true,
                }));
                this.currentPlayerIndex = 0;
                this.phase = 'build';
                this.log = [];
                this.lastDiceResult = 0;
                this.lastDice1 = 0;
                this.lastDice2 = 0;
                this.builtThisTurn = false;
                this.pendingTV = 0;
                this.pendingBusiness = 0;
                this.pendingCleaning = 0;
                this.pendingMover = 0;
                this.pendingRenovation = 0;
                this.pendingIT = false;
                this.usedReroll = false;
                this.pendingTunaDice = null;
                this.turnCount = 0;
                this.hadAmusementParkAtRoll = false;
            }
            checkWinner() { return null; }
        },
        CPU: class CPU { constructor(difficulty, options = {}) { this.difficulty = difficulty; this.options = options; } },
        createCpuPlayer(difficulty, options = {}) {
            context.createdCpuPlayers.push({ difficulty, options });
            return { difficulty, options, createdByFactory: true };
        },
        Player: {
            landmarkNames() { return ['駅', 'ショッピングモール']; },
        },
        SHOP_STOCK: {},
        enabledCards: new Set(['麦畑']),
        enabledLandmarks: new Set(['駅', 'ショッピングモール']),
        cpuPlayers: [],
        cpuSpeed: 1500,
        selectedCount: 2,
        playerSettings: [],
        tutorialEnabled: true,
        tutorialLevel: 'beginner',
        game: null,
        isOnlineGame: false,
        isReconnectingOnline: false,
        isRoomHost: false,
        myPlayerIndex: 0,
        myPlayerName: '',
        myRoomId: null,
        reconnectToken: '',
        socket: null,
        cpuScheduleToken: 0,
        prevCoins: null,
        winSoundPlayed: false,
        undoState: null,
        CARD_NAME_BY_ID: { wheat_field: '麦畑', bakery: 'パン屋' },
        createCardByName(name) { return ['麦畑', 'パン屋'].includes(name) ? { name } : null; },
        render() { context.renderCount = (context.renderCount || 0) + 1; },
        scheduleCPU() { context.scheduleCount = (context.scheduleCount || 0) + 1; },
        cancelAutoSkip() {},
        initSocket() {
            context.socket = {
                emit(name, payload) { context.emits.push({ name, payload }); },
            };
        },
        resetOnlineState() {},
        switchTab(tab) { context.switchedTab = tab; },
        updateResumeButton: null,
        syncTutorialControls() {},
        renderPlayerSettings() { context.renderPlayerSettingsCalls = (context.renderPlayerSettingsCalls || 0) + 1; },
        sendAction(name, payload) { context.sentActions.push({ name, payload }); },
        showConfirm(message, cb) { confirmCount++; cb(); },
        alert(message) { alerts.push(message); },
        showNotice(message) { alerts.push(message); },
        emits: [],
        sentActions: [],
        createdCpuPlayers: [],
    };
    context.global = context;
    vm.createContext(context);
    loadScripts(context, ['js/storage.js']);
    vm.runInContext(`
        this.__test = {
            elements,
            alerts,
            getGame: () => game,
            getConfirmCount: () => ${confirmCount},
            setGame(value) { game = value; },
            setUndoState(value) { undoState = value; },
            getUndoState: () => undoState,
            getCpuPlayers: () => cpuPlayers,
            getPlayerSettings: () => playerSettings,
            getSelectedCount: () => selectedCount,
            getShopStock: () => SHOP_STOCK,
        };
    `, context);
    return context;
}

function makeSavedGameState(overrides = {}) {
    return Object.assign({
        players: [
            { name: 'P1', coins: 3, cards: [], dormantIndices: [], landmarks: {}, itVentureCoins: 0, hasYakusho: true },
            { name: 'P2', coins: 3, cards: [], dormantIndices: [], landmarks: {}, itVentureCoins: 0, hasYakusho: true },
        ],
        currentPlayerIndex: 0,
        phase: 'build',
        log: [],
        lastDiceResult: 0,
        lastDice1: 0,
        lastDice2: 0,
        builtThisTurn: false,
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        usedReroll: false,
        pendingTunaDice: null,
        turnCount: 0,
        hadAmusementParkAtRoll: false,
        shopStock: {},
        cpuSettings: [{ difficulty: 'expert' }, { difficulty: 'rl' }],
        cpuSpeed: 1500,
        enabledCardsList: ['麦畑'],
        enabledLandmarksList: ['駅', 'ショッピングモール'],
    }, overrides);
}

runTest('storage updateResumeButton はローカルとオンラインの再開表示を切り替える', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('savedGame', '{"ok":true}');
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'room-1',
        playerIndex: 0,
        playerName: 'P1',
        reconnectToken: 'token-1',
    }));

    rt.updateResumeButton();

    assert.strictEqual(rt.elements.resumeSection.style.display, 'flex');
    assert.strictEqual(rt.elements.onlineResumeSection.style.display, 'block');
    assert.strictEqual(rt.elements.onlineResumeDescription.textContent, '🌐 P1 として room-1 に再接続できます');
});

runTest('storage updateResumeButton は壊れたオンライン再接続データを表示しない', () => {
    const rt = loadStorageRuntime();
    rt.elements.onlineResumeDescription.textContent = '🌐 P1 として room-1 に再接続できます';
    rt.localStorage.setItem('onlineSession', '{broken');

    rt.updateResumeButton();

    assert.strictEqual(rt.elements.onlineResumeSection.style.display, 'none');
    assert.strictEqual(rt.elements.onlineResumeDescription.textContent, '🌐 オンラインゲームが中断されました');
});

runTest('storage updateResumeButton は型不正なオンライン再接続データを表示しない', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'room-1',
        playerIndex: -1,
        playerName: 'P1',
        reconnectToken: 'token-1',
    }));

    rt.updateResumeButton();

    assert.strictEqual(rt.elements.onlineResumeSection.style.display, 'none');
});

runTest('storage reconnectOnline はオンライン再接続データの空白を正規化して送る', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: ' ROOM1 ',
        playerIndex: 1,
        playerName: ' P2 ',
        reconnectToken: ' token-1 ',
    }));

    rt.reconnectOnline();

    assert.strictEqual(rt.emits[0].payload.roomId, 'ROOM1');
    assert.strictEqual(rt.emits[0].payload.playerName, 'P2');
    assert.strictEqual(rt.emits[0].payload.reconnectToken, 'token-1');
});

runTest('storage deleteSavedGame は確認後に savedGame を削除する', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('savedGame', '{"ok":true}');

    rt.deleteSavedGame();

    assert.strictEqual(rt.localStorage.getItem('savedGame'), null);
    assert.strictEqual(rt.elements.resumeSection.style.display, 'none');
});

runTest('storage deleteOnlineSession は確認後に onlineSession と復元bundleを削除する', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('onlineSession', '{"ok":true}');
    rt.localStorage.setItem('onlineGameStart', '{"ok":true}');
    rt.localStorage.setItem('onlineActionLog', '[]');
    rt.localStorage.setItem('onlineStateSnapshot', '{"ok":true}');
    rt.localStorage.setItem('onlinePendingAction', '{"ok":true}');

    rt.deleteOnlineSession();

    assert.strictEqual(rt.localStorage.getItem('onlineSession'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineGameStart'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineActionLog'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineStateSnapshot'), null);
    assert.strictEqual(rt.localStorage.getItem('onlinePendingAction'), null);
    assert.strictEqual(rt.elements.onlineResumeSection.style.display, 'none');
});

runTest('storage reconnectOnline は壊れたセッションを破棄して alert する', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('onlineSession', '{broken');
    rt.localStorage.setItem('onlineGameStart', '{"ok":true}');

    rt.reconnectOnline();

    assert.strictEqual(rt.localStorage.getItem('onlineSession'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineGameStart'), null);
    assert.strictEqual(rt.elements.onlineResumeSection.style.display, 'none');
    assert.deepStrictEqual(rt.alerts, ['再接続データの読み込みに失敗しました']);
});

runTest('storage reconnectOnline は必須項目が欠けたセッションを送信しない', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'room-1',
        playerIndex: 0,
        playerName: 'P1',
    }));

    rt.reconnectOnline();

    assert.strictEqual(rt.localStorage.getItem('onlineSession'), null);
    assert.deepStrictEqual(rt.emits, []);
    assert.deepStrictEqual(rt.alerts, ['再接続データの読み込みに失敗しました']);
});

runTest('storage reconnectOnline はCPU復元を行わず再接続だけ送る', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'room-1',
        playerIndex: 1,
        playerName: 'P2',
        reconnectToken: 'token-1',
        isRoomHost: true,
    }));

    rt.reconnectOnline();

    assert.deepStrictEqual(rt.createdCpuPlayers, []);
    assert.strictEqual(rt.switchedTab, 'online');
    assert.strictEqual(rt.emits.length, 1);
    assert.strictEqual(rt.emits[0].name, 'rejoinRoom');
    assert.strictEqual(rt.emits[0].payload.roomId, 'room-1');
    assert.strictEqual(rt.emits[0].payload.playerIndex, 1);
    assert.strictEqual(rt.emits[0].payload.playerName, 'P2');
    assert.strictEqual(rt.emits[0].payload.reconnectToken, 'token-1');
});

runTest('storage saveGameState はオンライン中にローカル保存しない', () => {
    const rt = loadStorageRuntime();
    rt.__test.setGame(new rt.GameManager(2));
    rt.isOnlineGame = true;

    rt.saveGameState();

    assert.strictEqual(rt.localStorage.getItem('savedGame'), null);
});

runTest('storage resumeGame は壊れた保存データを破棄して alert する', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('savedGame', '{broken');

    rt.resumeGame();

    assert.strictEqual(rt.localStorage.getItem('savedGame'), null);
    assert.strictEqual(rt.elements.resumeSection.style.display, 'none');
    assert.deepStrictEqual(rt.alerts, ['セーブデータの読み込みに失敗しました']);
});

runTest('storage resumeGame はCPU復元で共通ファクトリを使う', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('savedGame', JSON.stringify(makeSavedGameState({
        cpuSettings: [{ difficulty: 'expert' }, { difficulty: 'rl', rlModelId: 'fixed-model' }],
    })));

    rt.resumeGame();

    assert.deepStrictEqual(rt.createdCpuPlayers.map(entry => entry.difficulty), ['expert', 'rl']);
    assert.deepStrictEqual(rt.createdCpuPlayers.map(entry => entry.options.playerCount), [2, 2]);
    assert.deepStrictEqual(Array.from(rt.createdCpuPlayers[0].options.expertOpponentDifficulties), ['expert', 'rl']);
    assert.strictEqual(rt.createdCpuPlayers[1].options.rlModelId, 'fixed-model');
    assert.strictEqual(rt.__test.getCpuPlayers()[1].createdByFactory, true);
});

runTest('storage resumeGame は旧保存データのcpuSettings欠落をnormal CPUとして復元する', () => {
    const rt = loadStorageRuntime();
    const state = makeSavedGameState();
    delete state.cpuSettings;
    rt.localStorage.setItem('savedGame', JSON.stringify(state));

    rt.resumeGame();

    assert.deepStrictEqual(rt.createdCpuPlayers.map(entry => entry.difficulty), ['normal']);
    assert.strictEqual(rt.localStorage.getItem('savedGame'), JSON.stringify(state));
});

runTest('storage resumeGame は短いcpuSettingsを人数分に補正して復元する', () => {
    const rt = loadStorageRuntime();
    const state = makeSavedGameState({
        players: [
            { name: 'P1', coins: 3, cards: [], dormantIndices: [], landmarks: {}, itVentureCoins: 0, hasYakusho: true },
            { name: 'P2', coins: 3, cards: [], dormantIndices: [], landmarks: {}, itVentureCoins: 0, hasYakusho: true },
            { name: 'P3', coins: 3, cards: [], dormantIndices: [], landmarks: {}, itVentureCoins: 0, hasYakusho: true },
        ],
        cpuSettings: ['strong'],
    });
    rt.localStorage.setItem('savedGame', JSON.stringify(state));

    rt.resumeGame();

    assert.deepStrictEqual(rt.createdCpuPlayers.map(entry => entry.difficulty), ['strong', 'normal', 'normal']);
    assert.strictEqual(rt.__test.getCpuPlayers().length, 3);
});

runTest('storage resumeGame は旧保存データのshopStock/dormantIndices欠落を許容する', () => {
    const rt = loadStorageRuntime();
    const state = makeSavedGameState();
    delete state.shopStock;
    delete state.pendingMover;
    delete state.hadAmusementParkAtRoll;
    delete state.players[1].dormantIndices;
    delete state.players[1].itVentureCoins;
    delete state.players[1].hasYakusho;
    rt.localStorage.setItem('savedGame', JSON.stringify(state));

    rt.resumeGame();

    assert.strictEqual(rt.__test.getGame().players.length, 2);
    assert.strictEqual(rt.__test.getGame().players[1].dormantCards.length, 0);
    assert.strictEqual(rt.__test.getGame().players[1].itVentureCoins, 0);
    assert.strictEqual(rt.__test.getGame().players[1].hasYakusho, true);
    assert.notStrictEqual(rt.localStorage.getItem('savedGame'), null);
});

runTest('storage resumeGame は ID key の shopStock を名前keyへ復元する', () => {
    const rt = loadStorageRuntime();
    const state = makeSavedGameState({
        shopStock: { wheat_field: 4 },
    });
    rt.localStorage.setItem('savedGame', JSON.stringify(state));

    rt.resumeGame();

    assert.strictEqual(rt.__test.getShopStock()['麦畑'], 4);
    assert.strictEqual(rt.__test.getShopStock().wheat_field, undefined);
});

runTest('storage resumeGame は欠落ランドマークkeyを既定値で補完する', () => {
    const rt = loadStorageRuntime();
    const state = makeSavedGameState();
    state.players[0].landmarks = { '駅': true };
    rt.localStorage.setItem('savedGame', JSON.stringify(state));

    rt.resumeGame();

    assert.strictEqual(rt.__test.getGame().players[0].landmarks['駅'], true);
    assert.strictEqual(rt.__test.getGame().players[0].landmarks['ショッピングモール'], false);
});

runTest('storage resumeGame は無効化カード在庫を含む保存データを破棄する', () => {
    const rt = loadStorageRuntime();
    const state = makeSavedGameState({
        enabledCardsList: ['麦畑'],
        shopStock: { 麦畑: 6, パン屋: 1 },
    });
    rt.localStorage.setItem('savedGame', JSON.stringify(state));

    rt.resumeGame();

    assert.strictEqual(rt.localStorage.getItem('savedGame'), null);
    assert.deepStrictEqual(rt.alerts, ['セーブデータの読み込みに失敗しました']);
});

runTest('storage resumeGame は重複休業indexを含む保存データを破棄する', () => {
    const rt = loadStorageRuntime();
    const state = makeSavedGameState();
    state.players[0].cards = ['麦畑'];
    state.players[0].dormantIndices = [0, 0];
    rt.localStorage.setItem('savedGame', JSON.stringify(state));

    rt.resumeGame();

    assert.strictEqual(rt.localStorage.getItem('savedGame'), null);
    assert.deepStrictEqual(rt.alerts, ['セーブデータの読み込みに失敗しました']);
});

runTest('storage resumeGame は小数コインを含む保存データを破棄する', () => {
    const rt = loadStorageRuntime();
    const state = makeSavedGameState();
    state.players[0].coins = 3.5;
    rt.localStorage.setItem('savedGame', JSON.stringify(state));

    rt.resumeGame();

    assert.strictEqual(rt.localStorage.getItem('savedGame'), null);
    assert.deepStrictEqual(rt.alerts, ['セーブデータの読み込みに失敗しました']);
});

runTest('storage resumeGame は5人以上の保存済み学習AIを学習AIとして復元する', () => {
    const rt = loadStorageRuntime();
    const players = Array.from({ length: 5 }, (_, index) => ({
        name: `P${index + 1}`,
        coins: 3,
        cards: [],
        dormantIndices: [],
        landmarks: {},
        itVentureCoins: 0,
        hasYakusho: true,
    }));
    rt.localStorage.setItem('savedGame', JSON.stringify(makeSavedGameState({
        players,
        cpuSettings: [
            { difficulty: 'rl' },
            { difficulty: 'strong' },
            null,
            { difficulty: 'expert' },
            { difficulty: 'rl' },
        ],
    })));

    rt.resumeGame();

    assert.strictEqual(rt.__test.getGame().players.length, 5);
    assert.deepStrictEqual(
        rt.createdCpuPlayers.map(entry => entry.difficulty),
        ['rl', 'strong', 'expert', 'rl']
    );
    assert.deepStrictEqual(
        rt.createdCpuPlayers.map(entry => entry.options.playerCount),
        [5, 5, 5, 5]
    );
});

runTest('storage resumeGame は共通ファクトリ不在でも既存CPUで復元できる', () => {
    const rt = loadStorageRuntime();
    rt.createCpuPlayer = undefined;
    rt.localStorage.setItem('savedGame', JSON.stringify(makeSavedGameState({
        cpuSettings: [{ difficulty: 'expert' }, null],
    })));

    rt.resumeGame();

    const restoredCpuPlayers = rt.__test.getCpuPlayers();
    assert.deepStrictEqual(rt.createdCpuPlayers, []);
    assert.ok(restoredCpuPlayers[0] instanceof rt.CPU);
    assert.strictEqual(restoredCpuPlayers[0].difficulty, 'expert');
    assert.strictEqual(restoredCpuPlayers[0].options.expertPurpose, 'live');
    assert.strictEqual(restoredCpuPlayers[1], null);
});

runTest('storage doUndo はローカルで undoState を復元し送信しない', () => {
    const rt = loadStorageRuntime();
    const game = new rt.GameManager(2);
    game.players[0].coins = 1;
    rt.__test.setGame(game);
    rt.__test.setUndoState({
        playerCoins: [5, 3],
        playerCardNames: [[], []],
        playerDormantIndices: [[], []],
        playerLandmarks: [{}, {}],
        playerItVenture: [0, 0],
        playerHasYakusho: [true, true],
        hadAmusementParkAtRoll: false,
        shopStock: {},
        builtThisTurn: false,
        log: [],
    });

    rt.doUndo();

    assert.strictEqual(game.players[0].coins, 5);
    assert.deepStrictEqual(rt.sentActions, []);
    assert.strictEqual(rt.__test.getUndoState(), null);
});

runTest('storage doUndo は旧undoStateのlog欠落を空ログとして復元する', () => {
    const rt = loadStorageRuntime();
    const game = new rt.GameManager(2);
    game.log = [{ type: 'system', message: 'before' }];
    rt.__test.setGame(game);
    rt.__test.setUndoState({
        playerCoins: [5, 3],
        playerCardNames: [[], []],
        playerDormantIndices: [[], []],
        playerLandmarks: [{}, {}],
        playerItVenture: [0, 0],
        playerHasYakusho: [true, true],
        hadAmusementParkAtRoll: false,
        shopStock: {},
        builtThisTurn: false,
    });

    rt.doUndo();

    assert.strictEqual(Array.isArray(game.log), true);
    assert.strictEqual(game.log.length, 0);
    assert.strictEqual(game.players[0].coins, 5);
});

runTest('storage doUndo は旧undoStateのplayerItVenture欠落を0として復元する', () => {
    const rt = loadStorageRuntime();
    const game = new rt.GameManager(2);
    game.players[0].itVentureCoins = 4;
    rt.__test.setGame(game);
    rt.__test.setUndoState({
        playerCoins: [5, 3],
        playerCardNames: [[], []],
        playerDormantIndices: [[], []],
        playerLandmarks: [{}, {}],
        playerHasYakusho: [true, true],
        hadAmusementParkAtRoll: false,
        shopStock: {},
        log: [],
    });

    rt.doUndo();

    assert.strictEqual(game.players[0].coins, 5);
    assert.strictEqual(game.players[0].itVentureCoins, 0);
    assert.strictEqual(game.builtThisTurn, false);
});

runTest('storage doUndo はオンラインで undoBuild を送信する', () => {
    const rt = loadStorageRuntime();
    const game = new rt.GameManager(2);
    rt.__test.setGame(game);
    rt.__test.setUndoState({
        playerCoins: [4, 3],
        playerCardNames: [[], []],
        playerDormantIndices: [[], []],
        playerLandmarks: [{}, {}],
        playerItVenture: [0, 0],
        playerHasYakusho: [true, true],
        hadAmusementParkAtRoll: false,
        shopStock: {},
        builtThisTurn: false,
        log: [],
    });
    rt.isOnlineGame = true;

    rt.doUndo();

    assert.strictEqual(rt.sentActions.length, 1);
    assert.strictEqual(rt.sentActions[0].name, 'undoBuild');
});

runTest('storage doUndo はオンラインで自分の手番でなければ送信しない', () => {
    const rt = loadStorageRuntime();
    const game = new rt.GameManager(2);
    game.currentPlayerIndex = 1;
    game.players[0].coins = 1;
    rt.__test.setGame(game);
    rt.__test.setUndoState({
        playerCoins: [4, 3],
        playerCardNames: [[], []],
        playerDormantIndices: [[], []],
        playerLandmarks: [{}, {}],
        playerItVenture: [0, 0],
        playerHasYakusho: [true, true],
        hadAmusementParkAtRoll: false,
        shopStock: {},
        builtThisTurn: false,
        log: [],
    });
    rt.isOnlineGame = true;
    rt.myPlayerIndex = 0;

    rt.doUndo();

    assert.strictEqual(game.players[0].coins, 1);
    assert.deepStrictEqual(rt.sentActions, []);
    assert.notStrictEqual(rt.__test.getUndoState(), null);
});

runTest('storage loadSettings は旧設定にもローカル名の初期値を補う', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('selectedCount', '3');
    rt.formatCpuSpeedLabel = (value) => parseInt(value, 10) <= 100 ? '超高速' : ((parseInt(value, 10) / 1000) + '秒');
    rt.localStorage.setItem('cpuSpeed', '100');
    rt.localStorage.setItem('playerSettings', JSON.stringify([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'strong' },
        { type: 'human', difficulty: 'normal', name: '花子' },
    ]));

    rt.loadSettings();

    const settings = rt.__test.getPlayerSettings();
    assert.strictEqual(rt.__test.getSelectedCount(), 3);
    assert.strictEqual(settings[0].name, 'プレイヤー1');
    assert.strictEqual(settings[1].name, 'プレイヤー2');
    assert.strictEqual(settings[2].name, '花子');
    assert.strictEqual(rt.elements.speedLabel.textContent, '超高速');
});

if (process.exitCode) {
    throw new Error('storageテストで失敗が発生しました');
}
