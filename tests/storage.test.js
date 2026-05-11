const assert = require('assert');
const vm = require('vm');
const { createStorage, loadScripts, makeElement, runTest } = require('./helpers/test-utils');

function loadStorageRuntime() {
    const { localStorage } = createStorage();
    const elements = {
        resumeSection: makeElement(),
        onlineResumeSection: makeElement(),
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
        createCardByName(name) { return { name }; },
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
            getConfirmCount: () => ${confirmCount},
            setGame(value) { game = value; },
            setUndoState(value) { undoState = value; },
            getUndoState: () => undoState,
            getCpuPlayers: () => cpuPlayers,
            getPlayerSettings: () => playerSettings,
            getSelectedCount: () => selectedCount,
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
    rt.localStorage.setItem('onlineSession', '{"ok":true}');

    rt.updateResumeButton();

    assert.strictEqual(rt.elements.resumeSection.style.display, 'flex');
    assert.strictEqual(rt.elements.onlineResumeSection.style.display, 'block');
});

runTest('storage deleteSavedGame は確認後に savedGame を削除する', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('savedGame', '{"ok":true}');

    rt.deleteSavedGame();

    assert.strictEqual(rt.localStorage.getItem('savedGame'), null);
    assert.strictEqual(rt.elements.resumeSection.style.display, 'none');
});

runTest('storage deleteOnlineSession は確認後に onlineSession を削除する', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('onlineSession', '{"ok":true}');

    rt.deleteOnlineSession();

    assert.strictEqual(rt.localStorage.getItem('onlineSession'), null);
    assert.strictEqual(rt.elements.onlineResumeSection.style.display, 'none');
});

runTest('storage reconnectOnline は壊れたセッションを破棄して alert する', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('onlineSession', '{broken');

    rt.reconnectOnline();

    assert.strictEqual(rt.localStorage.getItem('onlineSession'), null);
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
    rt.localStorage.setItem('savedGame', JSON.stringify(makeSavedGameState()));

    rt.resumeGame();

    assert.deepStrictEqual(rt.createdCpuPlayers.map(entry => entry.difficulty), ['expert', 'rl']);
    assert.deepStrictEqual(rt.createdCpuPlayers.map(entry => entry.options.playerCount), [2, 2]);
    assert.strictEqual(rt.__test.getCpuPlayers()[1].createdByFactory, true);
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
