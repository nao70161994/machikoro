const assert = require('assert');
const vm = require('vm');
const { createStorage, loadScripts, makeElement, runTest } = require('./helpers/test-utils');

function loadStorageRuntime(options = {}) {
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
        window: {
            MACHIKORO_CLIENT_VERSION: 'storage-build',
            MACHIKORO_LOCAL_SAVE_SCHEMA_WRITE_ENABLED:
                options.localSaveSchemaWriteEnabled === true,
        },
        _isOnlineFlowActive: () => options.onlineFlowActive === true,
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
        replaceEnabledCardSelection(values) {
            context.enabledCards = new Set(values);
            return context.enabledCards;
        },
        replaceEnabledLandmarkSelection(values) {
            context.enabledLandmarks = new Set(values);
            return context.enabledLandmarks;
        },
        getEnabledCardSelection() { return new Set(context.enabledCards); },
        getEnabledLandmarkSelection() { return new Set(context.enabledLandmarks); },
        GameSelectionState: {
            runtime: {
                snapshot() {
                    return {
                        enabledCards: [...context.enabledCards],
                        enabledLandmarks: [...context.enabledLandmarks],
                    };
                },
            },
        },
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
        myOriginalPlayerIndex: -1,
        myPlayerName: '',
        myRoomId: null,
        reconnectToken: '',
        socket: null,
        cpuScheduleInvalidationCount: 0,
        invalidateCpuScheduleChain() { return ++context.cpuScheduleInvalidationCount; },
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
            return true;
        },
        _emitOnlineRejoinRequest(session) {
            context.rejoinRequests.push(Object.assign({}, session));
            context.socket.emit('rejoinRoom', context.OnlinePayloadApi.buildRejoin(
                session,
                context.window.MACHIKORO_CLIENT_VERSION
            ));
            return true;
        },
        resetOnlineState() { context.resetOnlineStateCalls = (context.resetOnlineStateCalls || 0) + 1; },
        setOnlineReconnectLegacyFlag(value) {
            context.reconnectFlagWrites.push(value === true);
            context.isReconnectingOnline = value === true;
            return context.isReconnectingOnline;
        },
        cancelDelayedHumanAction() { context.cancelDelayedHumanActionCalls = (context.cancelDelayedHumanActionCalls || 0) + 1; },
        resetUiLocksForGameReset(reason) { context.resetUiLocksForGameResetCalls = (context.resetUiLocksForGameResetCalls || 0) + 1; context.resetUiLocksReason = reason; },
        switchTab(tab) { context.switchedTab = tab; },
        updateResumeButton: null,
        syncTutorialControls() {},
        renderPlayerSettings() { context.renderPlayerSettingsCalls = (context.renderPlayerSettingsCalls || 0) + 1; },
        sendAction(name, payload) { context.sentActions.push({ name, payload }); },
        showConfirm(message, cb) { confirmCount++; cb(); },
        alert(message) { alerts.push(message); },
        showNotice(message) { alerts.push(message); },
        emits: [],
        rejoinRequests: [],
        sentActions: [],
        createdCpuPlayers: [],
        reconnectFlagWrites: [],
    };
    context.global = context;
    vm.createContext(context);
    loadScripts(context, ['js/gameSnapshot.js', 'js/localSaveRepository.js', 'js/localSaveRuntime.js', 'js/clientStorage.js', 'js/onlineStorage.js', 'js/onlinePayload.js', 'js/savedGameValidation.js', 'js/storageSettings.js', 'js/localResumePolicy.js', 'js/localResumePreloadState.js', 'js/localResumeView.js', 'js/localResumeEffects.js', 'js/storedOnlineReconnect.js', 'js/gameSetupState.js', 'js/gameRuntimeState.js', 'js/onlineRuntimeState.js', 'js/uiTutorialSettings.js', 'js/uiScreenFocus.js', 'js/uiRangeControl.js', 'js/storage.js']);
    context.OnlineRuntimeState.runtime.restoreIdentity({
        isRoomHost: false,
        playerName: '',
        roomId: null,
        originalPlayerIndex: -1,
        playerIndex: 0,
        reconnectToken: '',
    });
    context.OnlinePayloadApi = vm.runInContext('OnlinePayload', context);
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
            getCancelDelayedHumanActionCalls: () => (typeof cancelDelayedHumanActionCalls !== 'undefined' ? cancelDelayedHumanActionCalls : 0),
            getResetOnlineStateCalls: () => (typeof resetOnlineStateCalls !== 'undefined' ? resetOnlineStateCalls : 0),
            getResetUiLocksForGameResetCalls: () => (typeof resetUiLocksForGameResetCalls !== 'undefined' ? resetUiLocksForGameResetCalls : 0),
            getResetUiLocksReason: () => (typeof resetUiLocksReason !== 'undefined' ? resetUiLocksReason : ''),
            getReconnectFlagWrites: () => reconnectFlagWrites.slice(),
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

runTest('local resume pendingはpreload controllerだけが所有する', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/storage.js'), 'utf8');
    assert.strictEqual(source.includes('let localResumePending'), false);
    assert.ok(source.includes('LocalResumePreloadState.create()'));
    assert.ok(source.includes('localResumePreloadController.snapshot().pending'));
});

runTest('storage reconnect flag adapterはonlineの単一write境界へ委譲する', () => {
    const rt = loadStorageRuntime();
    assert.strictEqual(rt.setStorageOnlineReconnectLegacyFlag(true), true);
    assert.strictEqual(rt.setStorageOnlineReconnectLegacyFlag(false), false);
    assert.deepStrictEqual(Array.from(rt.__test.getReconnectFlagWrites()), [true, false]);
});

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
    assert.strictEqual(rt.elements.onlineResumeDescription.textContent, '🌐 P1 として ROOM-1 に再接続できます');
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

runTest('storage reconnectOnline はSocket.IO初期化失敗時に部分適用したオンライン状態を戻す', () => {
    const rt = loadStorageRuntime();
    rt.initSocket = () => false;
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'room-1',
        playerIndex: 1,
        playerName: 'P2',
        reconnectToken: 'token-1',
        isRoomHost: true,
    }));

    rt.reconnectOnline();

    assert.strictEqual(rt.isReconnectingOnline, false);
    assert.strictEqual(rt.isRoomHost, false);
    assert.strictEqual(rt.myPlayerName, '');
    assert.strictEqual(rt.myRoomId, null);
    assert.strictEqual(rt.myOriginalPlayerIndex, -1);
    assert.strictEqual(rt.myPlayerIndex, -1);
    assert.strictEqual(rt.reconnectToken, '');
    assert.deepStrictEqual(rt.emits, []);
});

runTest('storage reconnectOnline は有効な再接続データを一時的な実行時例外で削除しない', () => {
    const rt = loadStorageRuntime();
    const session = {
        roomId: 'room-1',
        playerIndex: 1,
        playerName: 'P2',
        reconnectToken: 'token-1',
        isRoomHost: true,
    };
    rt.localStorage.setItem('onlineSession', JSON.stringify(session));
    rt.localStorage.setItem('onlineActionLog', '[]');
    rt.initSocket = () => { throw new Error('temporary socket failure'); };

    rt.reconnectOnline();

    assert.strictEqual(rt.localStorage.getItem('onlineSession'), JSON.stringify(session));
    assert.strictEqual(rt.localStorage.getItem('onlineActionLog'), '[]');
    assert.strictEqual(rt.isReconnectingOnline, false);
    assert.strictEqual(rt.myRoomId, null);
    assert.deepStrictEqual(rt.alerts, ['再接続処理に失敗しました。もう一度お試しください']);
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
    assert.strictEqual(rt.emits[0].payload.clientVersion, 'storage-build');
    assert.strictEqual(rt.rejoinRequests.length, 1);
    assert.strictEqual(rt.rejoinRequests[0].roomId, 'ROOM1');
});

runTest('storage deleteSavedGame は確認後に savedGame を削除する', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('savedGame', '{"ok":true}');
    rt.localStorage.setItem('savedGameV1', '{"schemaVersion":1,"snapshot":{}}');

    rt.deleteSavedGame();

    assert.strictEqual(rt.localStorage.getItem('savedGame'), null);
    assert.strictEqual(rt.localStorage.getItem('savedGameV1'), null);
    assert.strictEqual(rt.elements.resumeSection.style.display, 'none');
});

runTest('storage deleteOnlineSession は確認後に onlineSession と復元bundleを削除する', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('onlineSession', '{"ok":true}');
    rt.localStorage.setItem('onlineSession:room:ROOM01', '{"ok":true}');
    rt.localStorage.setItem('onlineGameStart', '{"ok":true}');
    rt.localStorage.setItem('onlineActionLog', '[]');
    rt.localStorage.setItem('onlineStateSnapshot', '{"ok":true}');
    rt.localStorage.setItem('onlinePendingAction', '{"ok":true}');
    rt.localStorage.setItem('onlineRestoreRoomIndex', '[{"roomId":"ROOM01"}]');
    rt.localStorage.setItem('onlineGameStart:room:ROOM01', '{"ok":true}');
    rt.localStorage.setItem('onlineActionLog:room:ROOM01', '[]');
    rt.localStorage.setItem('onlineStateSnapshot:room:ROOM01', '{"ok":true}');
    rt.localStorage.setItem('onlinePendingAction:room:ROOM01', '{"ok":true}');
    rt.localStorage.setItem('onlineGameStart:room:ROOM02', '{"ok":true}');

    rt.deleteOnlineSession();

    assert.strictEqual(rt.localStorage.getItem('onlineSession'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineSession:room:ROOM01'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineGameStart'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineActionLog'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineStateSnapshot'), null);
    assert.strictEqual(rt.localStorage.getItem('onlinePendingAction'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineRestoreRoomIndex'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineGameStart:room:ROOM01'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineActionLog:room:ROOM01'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineStateSnapshot:room:ROOM01'), null);
    assert.strictEqual(rt.localStorage.getItem('onlinePendingAction:room:ROOM01'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineGameStart:room:ROOM02'), null);
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
    assert.strictEqual(rt.emits[0].payload.roomId, 'ROOM-1');
    assert.strictEqual(rt.emits[0].payload.playerIndex, 1);
    assert.strictEqual(rt.emits[0].payload.playerName, 'P2');
    assert.strictEqual(rt.emits[0].payload.reconnectToken, 'token-1');
});

runTest('storage saveGameState は共有serializerで既存localStorage shapeを維持する', () => {
    const rt = loadStorageRuntime();
    const game = new rt.GameManager(2);
    game.players[0].name = 'Alice';
    game.log = [{ text: 'saved' }];
    rt.__test.setGame(game);
    rt.cpuPlayers = [null, { difficulty: 'normal', modelId: null }];

    rt.saveGameState();

    const state = JSON.parse(rt.localStorage.getItem('savedGame'));
    assert.strictEqual(Object.prototype.hasOwnProperty.call(state, 'schemaVersion'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(state, 'undoState'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(state, 'actionSeq'), false);
    assert.strictEqual(state.players[0].name, 'Alice');
    assert.deepStrictEqual(state.log, [{ text: 'saved' }]);
    assert.deepStrictEqual(state.cpuSettings, [null, { difficulty: 'normal', rlModelId: null }]);
    assert.strictEqual(state.cpuSpeed, 1500);
    assert.deepStrictEqual(state.enabledCardsList, ['麦畑']);
    assert.deepStrictEqual(state.enabledLandmarksList, ['駅', 'ショッピングモール']);
});

runTest('storage saveGameState はflag有効時もlegacyを維持してv1 shadowを併記する', () => {
    const rt = loadStorageRuntime({ localSaveSchemaWriteEnabled: true });
    const game = new rt.GameManager(2);
    game.players[0].name = 'DualWrite';
    rt.__test.setGame(game);

    rt.saveGameState();

    const legacy = JSON.parse(rt.localStorage.getItem('savedGame'));
    const versioned = JSON.parse(rt.localStorage.getItem('savedGameV1'));
    assert.strictEqual(legacy.players[0].name, 'DualWrite');
    assert.deepStrictEqual(
        versioned,
        JSON.parse(JSON.stringify(rt.GameSnapshot.createSnapshotEnvelope(legacy)))
    );
});

runTest('storage resumeGame は壊れたv1 shadowからlegacyへfallbackする', () => {
    const rt = loadStorageRuntime({ localSaveSchemaWriteEnabled: true });
    const legacy = makeSavedGameState({
        players: [
            { name: 'Fallback', coins: 7, cards: [], dormantIndices: [], landmarks: {}, itVentureCoins: 0, hasYakusho: true },
            { name: 'Peer', coins: 3, cards: [], dormantIndices: [], landmarks: {}, itVentureCoins: 0, hasYakusho: true },
        ],
    });
    rt.localStorage.setItem('savedGame', JSON.stringify(legacy));
    rt.localStorage.setItem('savedGameV1', JSON.stringify({ schemaVersion: 99, snapshot: {} }));

    rt.resumeGame();

    assert.strictEqual(rt.__test.getGame().players[0].name, 'Fallback');
    assert.strictEqual(rt.__test.getGame().players[0].coins, 7);
    assert.deepStrictEqual(rt.alerts, []);
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

runTest('storage resumeGame は検証済みsaveを一時的なruntime例外で削除しない', () => {
    const rt = loadStorageRuntime();
    const serialized = JSON.stringify(makeSavedGameState());
    rt.localStorage.setItem('savedGame', serialized);
    const previousGame = new rt.GameManager(2);
    previousGame.players[0].name = 'Before resume';
    rt.__test.setGame(previousGame);
    rt.elements.titleScreen.style.display = 'block';
    rt.elements.gameScreen.style.display = 'none';
    rt.render = () => { throw new Error('temporary render failure'); };

    rt.resumeGame();

    assert.strictEqual(rt.localStorage.getItem('savedGame'), serialized);
    assert.strictEqual(rt.elements.resumeSection.style.display, 'flex');
    assert.strictEqual(rt.elements.titleScreen.style.display, 'block');
    assert.strictEqual(rt.elements.gameScreen.style.display, 'none');
    assert.strictEqual(rt.__test.getGame(), previousGame);
    assert.strictEqual(rt.elements.btnResume.focused, true);
    assert.strictEqual(rt.__test.getResetUiLocksReason(), 'resume-game-rollback-ui-locks');
    assert.deepStrictEqual(rt.alerts, ['セーブデータの読み込みに失敗しました']);
});

runTest('storage resumeGame はonline active/reconnecting中にlocal saveへ切り替えない', () => {
    for (const onlineState of [
        { isOnlineGame: true, isReconnectingOnline: false },
        { isOnlineGame: false, isReconnectingOnline: true },
        { isOnlineGame: false, isReconnectingOnline: false, myRoomId: 'ABC123' },
    ]) {
        const rt = loadStorageRuntime();
        const serialized = JSON.stringify(makeSavedGameState());
        rt.localStorage.setItem('savedGame', serialized);
        rt.OnlineRuntimeState.runtime.setOnline(onlineState.isOnlineGame);
        rt.OnlineRuntimeState.runtime.setReconnecting(onlineState.isReconnectingOnline);
        if (onlineState.myRoomId) {
            rt.OnlineRuntimeState.runtime.acceptRoom({
                playerIndex: 0,
                roomId: onlineState.myRoomId,
                reconnectToken: 'token',
            });
        }

        assert.strictEqual(rt.resumeGame(), false);
        assert.strictEqual(rt.__test.getResetOnlineStateCalls(), 0);
        assert.strictEqual(rt.localStorage.getItem('savedGame'), serialized);
        assert.strictEqual(rt.__test.getGame(), null);
    }

    const pendingRt = loadStorageRuntime({ onlineFlowActive: true });
    const serialized = JSON.stringify(makeSavedGameState());
    pendingRt.localStorage.setItem('savedGame', serialized);
    assert.strictEqual(pendingRt.resumeGame(), false);
    assert.strictEqual(pendingRt.__test.getResetOnlineStateCalls(), 0);
    assert.strictEqual(pendingRt.localStorage.getItem('savedGame'), serialized);
});

runTest('storage resumeGame はv1 local-save envelopeをlegacyと同じ経路で復元する', () => {
    const rt = loadStorageRuntime();
    const state = makeSavedGameState({
        players: [
            { name: 'Versioned', coins: 9, cards: [], dormantIndices: [], landmarks: {}, itVentureCoins: 0, hasYakusho: true },
            { name: 'LegacyPeer', coins: 3, cards: [], dormantIndices: [], landmarks: {}, itVentureCoins: 0, hasYakusho: true },
        ],
    });
    rt.localStorage.setItem('savedGame', JSON.stringify(rt.GameSnapshot.createSnapshotEnvelope(state)));

    rt.resumeGame();

    assert.strictEqual(rt.__test.getGame().players[0].name, 'Versioned');
    assert.strictEqual(rt.__test.getGame().players[0].coins, 9);
    assert.strictEqual(rt.localStorage.getItem('savedGame') !== null, true);
    assert.deepStrictEqual(rt.alerts, []);
});

runTest('storage resumeGame はunknown local-save schemaを破棄する', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('savedGame', JSON.stringify({
        schemaVersion: 2,
        snapshot: makeSavedGameState(),
    }));

    rt.resumeGame();

    assert.strictEqual(rt.localStorage.getItem('savedGame'), null);
    assert.deepStrictEqual(rt.alerts, ['セーブデータの読み込みに失敗しました']);
});

runTest('storage resumeGame は古い非同期入力とUI lockを復元前にリセットする', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem('savedGame', JSON.stringify(makeSavedGameState()));

    rt.resumeGame();

    assert.strictEqual(rt.__test.getCancelDelayedHumanActionCalls(), 1);
    assert.strictEqual(rt.__test.getResetOnlineStateCalls(), 1);
    assert.strictEqual(rt.__test.getResetUiLocksForGameResetCalls(), 1);
    assert.strictEqual(rt.__test.getResetUiLocksReason(), 'resume-game-reset-ui-locks');
    assert.strictEqual(rt.elements.titleScreen.style.display, 'none');
    assert.strictEqual(rt.elements.gameScreen.style.display, 'block');
    assert.strictEqual(rt.elements.status.focused, true);
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

runTest('storage resumeGame は共有hydrateで既存の全主要状態を復元する', () => {
    const rt = loadStorageRuntime();
    const state = makeSavedGameState({
        players: [
            {
                name: 'Alice', coins: 9, cards: ['麦畑'], dormantIndices: [0],
                landmarks: { 駅: true }, itVentureCoins: 4, hasYakusho: false,
            },
            {
                name: 'Bob', coins: 2, cards: [], dormantIndices: [],
                landmarks: {}, itVentureCoins: 0, hasYakusho: true,
            },
        ],
        currentPlayerIndex: 1,
        phase: 'pending',
        log: [{ text: 'restored' }],
        lastDiceResult: 8,
        lastDice1: 3,
        lastDice2: 5,
        builtThisTurn: true,
        pendingTV: 1,
        pendingActions: [{ action: 'resolveTV', field: 'pendingTV' }],
        pendingIT: true,
        usedReroll: true,
        pendingTunaDice: [3, 5],
        turnCount: 7,
        hadAmusementParkAtRoll: true,
        shopStock: { 麦畑: 4 },
    });
    rt.localStorage.setItem('savedGame', JSON.stringify(state));

    rt.resumeGame();

    const game = rt.__test.getGame();
    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.strictEqual(game.phase, 'pending');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(game.log)), [{ text: 'restored' }]);
    assert.strictEqual(game.lastDiceResult, 8);
    assert.strictEqual(game.lastDice1, 3);
    assert.strictEqual(game.lastDice2, 5);
    assert.strictEqual(game.builtThisTurn, true);
    assert.strictEqual(game.pendingTV, 1);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(game.pendingActionQueue)), [
        { action: 'resolveTV', field: 'pendingTV' },
    ]);
    assert.strictEqual(game.pendingIT, true);
    assert.strictEqual(game.usedReroll, true);
    assert.deepStrictEqual(Array.from(game.pendingTunaDice), [3, 5]);
    assert.strictEqual(game.turnCount, 7);
    assert.strictEqual(game.hadAmusementParkAtRoll, true);
    assert.strictEqual(game.players[0].coins, 9);
    assert.deepStrictEqual(Array.from(game.players[0].cards, card => card.name), ['麦畑']);
    assert.deepStrictEqual(Array.from(game.players[0].dormantCards, card => card.name), ['麦畑']);
    assert.strictEqual(game.players[0].landmarks['駅'], true);
    assert.strictEqual(game.players[0].landmarks['ショッピングモール'], false);
    assert.strictEqual(game.players[0].itVentureCoins, 4);
    assert.strictEqual(game.players[0].hasYakusho, false);
    assert.strictEqual(rt.__test.getShopStock()['麦畑'], 4);
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

runTest('storage resumeGame は pendingActions の field/action 不一致を破棄する', () => {
    const rt = loadStorageRuntime();
    const state = makeSavedGameState({
        phase: 'pending',
        pendingBusiness: 1,
        pendingActions: [{ field: 'pendingBusiness', action: 'resolveTV' }],
    });
    rt.localStorage.setItem('savedGame', JSON.stringify(state));

    rt.resumeGame();

    assert.strictEqual(rt.localStorage.getItem('savedGame'), null);
    assert.deepStrictEqual(rt.alerts, ['セーブデータの読み込みに失敗しました']);
});

runTest('storage resumeGame は pendingActions 空配列と pending count 不一致を破棄する', () => {
    const rt = loadStorageRuntime();
    const state = makeSavedGameState({
        phase: 'pending',
        pendingBusiness: 1,
        pendingActions: [],
    });
    rt.localStorage.setItem('savedGame', JSON.stringify(state));

    rt.resumeGame();

    assert.strictEqual(rt.localStorage.getItem('savedGame'), null);
    assert.deepStrictEqual(rt.alerts, ['セーブデータの読み込みに失敗しました']);
});

runTest('storage resumeGame は pendingActions の count 不一致を破棄する', () => {
    const rt = loadStorageRuntime();
    const state = makeSavedGameState({
        phase: 'pending',
        pendingBusiness: 2,
        pendingActions: [{ field: 'pendingBusiness', action: 'resolveBusiness' }],
    });
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

runTest('storage saveUndoState は共有serializerへ委譲して既存ログ全件を保持する', () => {
    const rt = loadStorageRuntime();
    const game = new rt.GameManager(2);
    game.players[0].coins = 8;
    game.players[0].cards = [rt.createCardByName('麦畑')];
    game.players[0].dormantCards = [game.players[0].cards[0]];
    game.log = Array.from({ length: 35 }, (_, index) => ({ type: 'system', message: String(index) }));
    rt.SHOP_STOCK['麦畑'] = 4;
    rt.__test.setGame(game);

    rt.saveUndoState();

    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(rt.__test.getUndoState())),
        JSON.parse(JSON.stringify(rt.GameSnapshot.serializeUndoState(
            game,
            rt.SHOP_STOCK,
            Number.MAX_SAFE_INTEGER
        )))
    );
    assert.strictEqual(rt.__test.getUndoState().log.length, 35);
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

runTest('storage saveSettings は既存keyと値形式を共通facade経由で保持する', () => {
    const rt = loadStorageRuntime();
    rt.saveSettings();
    assert.strictEqual(rt.localStorage.getItem('selectedCount'), '2');
    assert.strictEqual(rt.localStorage.getItem('playerSettings'), '[]');
    assert.strictEqual(rt.localStorage.getItem('tutorialEnabled'), 'true');
    assert.strictEqual(rt.localStorage.getItem('tutorialLevel'), 'beginner');
    assert.strictEqual(rt.localStorage.getItem('cpuSpeed'), '1500');
});
runTest('storage settings はstorage例外を外へ伝播せず既存後処理を維持する', () => {
    const rt = loadStorageRuntime();
    rt.localStorage.setItem = () => { throw new Error('write blocked'); };
    assert.doesNotThrow(() => rt.saveSettings());
    rt.localStorage.getItem = () => { throw new Error('read blocked'); };
    assert.doesNotThrow(() => rt.loadSettings());
    assert.strictEqual(rt.renderPlayerSettingsCalls, 1);
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
    assert.strictEqual(rt.elements.cpuSpeed.getAttribute('aria-valuetext'), '超高速');
});

runTest('storage resumeGame はRL preload中の連打を一度だけ復元する', async () => {
    const rt = loadStorageRuntime();
    let resolvePreload;
    let preloadCalls = 0;
    rt.RLModelPortfolio = {
        eligibleLoadState() { return { status: 'idle' }; },
        preloadEligibleModels() {
            preloadCalls++;
            return new Promise(resolve => { resolvePreload = resolve; });
        },
    };
    rt.localStorage.setItem('savedGame', JSON.stringify(makeSavedGameState()));

    rt.resumeGame();
    rt.resumeGame();

    assert.strictEqual(preloadCalls, 1);
    assert.strictEqual(rt.elements.btnResume.disabled, true);
    resolvePreload([]);
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(rt.renderCount, 1);
    assert.strictEqual(rt.__test.getResetOnlineStateCalls(), 1);
    assert.strictEqual(rt.elements.btnResume.disabled, false);
});

if (process.exitCode) {
    throw new Error('storageテストで失敗が発生しました');
}
