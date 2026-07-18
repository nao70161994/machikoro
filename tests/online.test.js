const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createStorage, loadScripts, loadScript, runTest } = require('./helpers/test-utils');
const { applyActionToMirror, serializeMirrorState } = require('../server');
const {
    makePendingAckRequiresLogOrSnapshotFixture,
    makeSeqRankUsesMaxFieldsFixture,
} = require('./helpers/online-restore-fixtures');

function extractFunctionBody(source, functionName) {
    const signature = `function ${functionName}`;
    const start = source.indexOf(signature);
    assert(start >= 0, `missing function ${functionName}`);
    const signatureEnd = source.indexOf('\n', start);
    const openBrace = source.lastIndexOf('{', signatureEnd);
    let depth = 0;
    for (let i = openBrace; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') depth++;
        if (ch === '}') depth--;
        if (depth === 0) return source.slice(openBrace, i + 1);
    }
    throw new Error(`unterminated function ${functionName}`);
}

function extractSwitchActionCases(functionBody) {
    return [...functionBody.matchAll(/case ['"]([^'"]+)['"]:/g)].map(match => match[1]).sort();
}

function loadOnlineRuntime(options = {}) {
    const { storage, localStorage } = createStorage();
    const elements = {};
    const context = {
        console,
        localStorage,
        window: {},
        document: {
            getElementById(id) {
                if (!elements[id]) elements[id] = { style: {}, textContent: '', innerHTML: '' };
                return elements[id];
            },
        },
    };
    if (options.throwStorageAccess) {
        Object.defineProperty(context, 'localStorage', {
            configurable: true,
            get() { throw new Error('storage blocked'); },
        });
    }
    vm.createContext(context);

    // ゲームロジック本体をロード
    loadScripts(context, ['js/Card.js', 'js/Player.js', 'js/GameManager.js']);

    context.__onlineRuntimeOptions = options;

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
        let timeoutHandlers = [];
        let clientFlowCheckpoints = [];
        let clientErrorReports = [];
        function setTimeout(handler, ms) {
            timeoutHandlers.push({ handler, ms });
            return timeoutHandlers.length;
        }
        function clearTimeout(id) {
            if (Number.isInteger(id) && timeoutHandlers[id - 1]) timeoutHandlers[id - 1].cleared = true;
        }
        let createdCpuPlayerCalls = [];
        let rlPreloadCalls = [];
        var RLModelPortfolio = {
            preloadEligibleModels(playerCount, options) {
                rlPreloadCalls.push({ playerCount, options });
                return Promise.resolve([]);
            },
            shouldAvoidSynchronousModelLoad() { return true; },
            selectRandomModel() { return { id: 'test-rl-model' }; },
        };
        function createCpuPlayer(difficulty, options = {}) {
            createdCpuPlayerCalls.push({ difficulty, options });
            return new CPU(difficulty, options);
        }
        const CPU = class {
            constructor(difficulty, options = {}) {
                this.difficulty = difficulty;
                this.options = options;
            }
        };
        function render() { renderCount++; }
        function scheduleCPU() { scheduleCount++; }
        function resetFullLog() {}
        function resetStatsRecorded() { statsResetCount++; }
        function restoreUndoSnapshot(state) {
            if (state && state.game) { game = state.game; return; }
            if (!state || !game) return;
            game.players.forEach((player, index) => {
                player.coins = state.playerCoins[index];
                player.cards = (state.playerCardNames[index] || []).map(createCardByName).filter(Boolean);
                player.dormantCards = (state.playerDormantIndices?.[index] || []).map(cardIndex => player.cards[cardIndex]).filter(Boolean);
                player.landmarks = Object.assign({}, player.landmarks, state.playerLandmarks[index]);
                player.itVentureCoins = state.playerItVenture?.[index] || 0;
                player.hasYakusho = state.playerHasYakusho?.[index] !== false;
            });
            assignShopStockSnapshot(SHOP_STOCK, state.shopStock || {});
            game.builtThisTurn = state.builtThisTurn || false;
            game.log = state.log || [];
        }
        function updateResumeButton() {}
        let io;
        if (!__onlineRuntimeOptions.withoutIo) {
            io = () => ({
                on(name, handler) { socketHandlers[name] = handler; },
                emit(name, payload) { socketEmits.push({ name, payload }); },
                disconnect() { socketDisconnected = true; },
            });
        }
        function markClientFlowCheckpoint(name, details) { clientFlowCheckpoints.push({ name, details }); }
        function reportClientError(payload) { clientErrorReports.push(payload); }
        const alert = () => {};
        const showNotice = () => {};
    `, context);

    // online storage facade と online.js をロード
    loadScript(context, 'js/onlineStorage.js');
    loadScript(context, 'js/onlinePayload.js');
    loadScript(context, 'js/onlineRestoreRank.js');
    loadScript(context, 'js/onlineReconnectState.js');
    loadScript(context, 'js/online.js');

    // テスト用エクスポート
    vm.runInContext(`
        this.GameManager = GameManager;
        this.Player = Player;
        this.CARDS = CARDS;
        this.CARD_IDS = CARD_IDS;
        this.createCardByName = createCardByName;
        this.GAME_PHASES = GAME_PHASES;
        this.GAME_ACTIONS = GAME_ACTIONS;
        this.GAME_ACTION_REGISTRY = GAME_ACTION_REGISTRY;
        this.LOG_TYPES = LOG_TYPES;
        this.getGame = () => game;
        this.setGame = (g) => { game = g; };
        this.getShopStock = () => SHOP_STOCK;
        this.getCpuPlayers = () => cpuPlayers;
        this.getCreatedCpuPlayerCalls = () => createdCpuPlayerCalls;
        this.getRlPreloadCalls = () => rlPreloadCalls;
        this.setEnabledCards = (s) => { enabledCards = s; };
        this.setEnabledLandmarks = (s) => { enabledLandmarks = s; };
        this.getStatsResetCount = () => statsResetCount;
        this.getRenderCount = () => renderCount;
        this.getScheduleCount = () => scheduleCount;
        this.getSocketHandlers = () => socketHandlers;
        this.getSocketEmits = () => socketEmits;
        this.getOnlineRestoreQueue = () => _onlineRestoreEventQueue.slice();
        this.getSocketDisconnected = () => socketDisconnected;
        this.getClientFlowCheckpoints = () => clientFlowCheckpoints;
        this.getClientErrorReports = () => clientErrorReports;
        this.getUndoState = () => undoState;
        this.setUndoState = (value) => { undoState = value; };
        this.applyAction = applyAction;
        this.APP_ERROR_EVENT = APP_ERROR_EVENT;
        this.getClientVersion = getClientVersion;
        this.buildOnlineRejoinPayload = buildOnlineRejoinPayload;
        this.renderOnlinePlayerSettings = renderOnlinePlayerSettings;
        this.onChangeOnlinePlayerType = onChangeOnlinePlayerType;
        this.showCreateRoom = showCreateRoom;
        this.setOnlineSelectedCount = (value) => { onlineSelectedCount = value; };
        this.setOnlinePlayerSettings = (value) => { onlinePlayerSettings = value; };
        this._saveActionLog = _saveActionLog;
        this._readOnlineActionLog = _readOnlineActionLog;
        this._readOnlineGameStartPayload = _readOnlineGameStartPayload;
        this._readOnlineStateSnapshot = _readOnlineStateSnapshot;
        this._normalizePendingOutboundAction = _normalizePendingOutboundAction;
        this._readPendingOutboundAction = _readPendingOutboundAction;
        this._readPendingOutboundActionForCurrentSession = _readPendingOutboundActionForCurrentSession;
        this._clearOnlineRestoreBundle = _clearOnlineRestoreBundle;
        this._normalizeOnlineRoomId = _normalizeOnlineRoomId;
        this._isKnownOnlineGameAction = _isKnownOnlineGameAction;
        this._onlineRoomStorageKey = _onlineRoomStorageKey;
        this._onlineRoomStorageKeys = _onlineRoomStorageKeys;
        this._readOnlineRestoreRoomIndex = _readOnlineRestoreRoomIndex;
        this._refreshOnlineRestoreRoomIndex = _refreshOnlineRestoreRoomIndex;
        this._pruneOnlineRestoreRoomIndex = _pruneOnlineRestoreRoomIndex;
        this._buildOnlineRestoreRoomIndexEntry = _buildOnlineRestoreRoomIndexEntry;
        this._writeOnlineSessionStorageJson = _writeOnlineSessionStorageJson;
        this._removeOnlineSessionStorageItem = _removeOnlineSessionStorageItem;
        this._onlineRestoreRank = _onlineRestoreRank;
        this._tryRestoreRoom = _tryRestoreRoom;
        this._canResendPendingOutboundAction = _canResendPendingOutboundAction;
        this._createOnlineClientActionId = _createOnlineClientActionId;
        this._handleOnlineActionTimeout = _handleOnlineActionTimeout;
        this.getTimeoutHandlers = () => timeoutHandlers;
        this.buildOnlineSnapshot = buildOnlineSnapshot;
        this.handleAppError = handleAppError;
        this.resetOnlineState = resetOnlineState;
        this.sendAction = sendAction;
        this.restoreOnlineSnapshot = restoreOnlineSnapshot;
        this.initOnlineGame = initOnlineGame;
        this.initSocket = initSocket;
        this.joinRoom = joinRoom;
        this.setOnlineState = (v) => {
            if (typeof v.socket !== 'undefined') socket = v.socket;
            if (typeof v.isOnlineGame !== 'undefined') isOnlineGame = v.isOnlineGame;
            if (typeof v.isReplaying !== 'undefined') isReplaying = v.isReplaying;
            if (typeof v.onlineRestoreInProgress !== 'undefined') _onlineRestoreInProgress = v.onlineRestoreInProgress;
            if (typeof v.rejoinRetryExhausted !== 'undefined') _rejoinRetryExhausted = v.rejoinRetryExhausted;
            if (typeof v.isReconnectingOnline !== 'undefined') isReconnectingOnline = v.isReconnectingOnline;
            if (typeof v.isRoomHost !== 'undefined') isRoomHost = v.isRoomHost;
            if (typeof v.onlineActionInFlight !== 'undefined') onlineActionInFlight = v.onlineActionInFlight;
            if (typeof v.myRoomId !== 'undefined') myRoomId = v.myRoomId;
            if (typeof v.myOriginalPlayerIndex !== 'undefined') myOriginalPlayerIndex = v.myOriginalPlayerIndex;
            if (typeof v.myPlayerName !== 'undefined') myPlayerName = v.myPlayerName;
            if (typeof v.reconnectToken !== 'undefined') reconnectToken = v.reconnectToken;
        };
        this.getOnlineLobbyState = () => ({ createPending: onlineCreateRoomPending, joinPending: onlineJoinRoomPending, kind: onlineLobbyRequestKind });
        this.getOnlineState = () => ({ socket, isOnlineGame, isReconnectingOnline, reconnectState: getOnlineReconnectState(), isRoomHost, onlineActionInFlight });
        this.myPlayerIndex = myPlayerIndex;
    `, context);
    context.elements = elements;

    return context;
}

const rt = loadOnlineRuntime();
const { GameManager, Player, CARDS, CARD_IDS, createCardByName, GAME_PHASES, LOG_TYPES } = rt;

function makeGame(count = 2) {
    const g = new GameManager(count);
    rt.setGame(g);
    // SHOP_STOCK を初期化
    for (const card of CARDS) rt.getShopStock()[card.name] = 6;
    return g;
}

runTest('GAME_ACTION_REGISTRY は client applyAction で網羅される', () => {
    const runtime = loadOnlineRuntime();
    const actions = Object.values(runtime.GAME_ACTIONS).sort();
    const registry = runtime.GAME_ACTION_REGISTRY;
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'online.js'), 'utf8');

    assert.deepStrictEqual(Object.keys(registry).sort(), actions);
    for (const action of actions) {
        const entry = registry[action];
        assert.strictEqual(entry.action, action);
        assert.ok(entry.payloadKind);
        assert.strictEqual(entry.clientApply, true);
    }

    const clientActions = actions.filter(action => registry[action].clientApply);
    assert.deepStrictEqual(extractSwitchActionCases(extractFunctionBody(source, 'applyAction')), clientActions);
});

runTest('online.js は未使用 remote action helper を残さない', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'online.js'), 'utf8');
    assert.ok(!source.includes('function handleRemoteAction'));
});


runTest('online.jsのreconnect観測状態は既存booleanの優先順位を維持する', () => {
    const localRt = loadOnlineRuntime();
    assert.strictEqual(localRt.getOnlineState().reconnectState, 'idle');

    localRt.setOnlineState({ isOnlineGame: true });
    assert.strictEqual(localRt.getOnlineState().reconnectState, 'active');

    localRt.setOnlineState({ isReconnectingOnline: true, socket: { connected: false } });
    assert.strictEqual(localRt.getOnlineState().reconnectState, 'connecting');

    localRt.setOnlineState({ socket: { connected: true } });
    assert.strictEqual(localRt.getOnlineState().reconnectState, 'rejoining');

    localRt.setOnlineState({ onlineRestoreInProgress: true });
    assert.strictEqual(localRt.getOnlineState().reconnectState, 'restoring');

    localRt.setOnlineState({ isReplaying: true });
    assert.strictEqual(localRt.getOnlineState().reconnectState, 'replaying');

    localRt.setOnlineState({ rejoinRetryExhausted: true });
    assert.strictEqual(localRt.getOnlineState().reconnectState, 'failed');
});
runTest('rejoinRoom送信経路はbuildOnlineRejoinPayloadでclientVersion契約を共有する', () => {
    const onlineSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'online.js'), 'utf8');
    const storageSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
    const directOnlineRejoinEmits = onlineSource.match(/socket\.emit\('rejoinRoom'/g) || [];

    assert.strictEqual(directOnlineRejoinEmits.length, 1);
    assert.strictEqual((onlineSource.match(/socket\.emit\('rejoinRoom', buildOnlineRejoinPayload/g) || []).length, 1);
    assert.ok(onlineSource.includes('function _emitOnlineRejoinRequest(sessionOverride = null)'));
    assert.ok(onlineSource.includes('_armOnlineRejoinResponseTimeout();'));
    assert.ok(storageSource.includes('_emitOnlineRejoinRequest(session)'));
    assert.ok(!storageSource.includes("socket.emit('rejoinRoom'"));
    assert.ok(storageSource.includes('clientVersion: getStorageClientVersion()'));
});
runTest('buildOnlineRejoinPayload はclientVersionを含める', () => {
    const localRt = loadOnlineRuntime();
    localRt.window.MACHIKORO_CLIENT_VERSION = 'build-rejoin-1';

    assert.deepStrictEqual(JSON.parse(JSON.stringify(localRt.buildOnlineRejoinPayload({
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token-1',
    }))), {
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token-1',
        clientVersion: 'build-rejoin-1',
        hostlessRestoreVersion: 1,
    });
});

runTest('getClientVersion はindexへ注入されたビルドハッシュを使う', () => {
    const localRt = loadOnlineRuntime();
    assert.strictEqual(localRt.getClientVersion(), 'unknown');

    localRt.window.MACHIKORO_CLIENT_VERSION = 'build-123';

    assert.strictEqual(localRt.getClientVersion(), 'build-123');
});

runTest('onlineStorage facade は既存キーとroom-scoped fallback契約を固定する', () => {
    const { createStorage } = require('./helpers/test-utils');
    const { localStorage } = createStorage();
    const facade = require('../js/onlineStorage').createOnlineStorageFacade({
        storage: localStorage,
        getCurrentRoomId: () => 'room01',
        sessionKey: 'onlineSession',
        storageKeys: {
            gameStart: 'onlineGameStart',
            actionLog: 'onlineActionLog',
            stateSnapshot: 'onlineStateSnapshot',
            restoreAudit: 'onlineRestoreAudit',
            pendingAction: 'onlinePendingAction',
        },
        roomIndexKey: 'onlineRestoreRoomIndex',
        roomIndexSchemaVersion: 1,
        roomKeySeparator: ':room:',
        maxRestoreActionSeq: (_gameStart, _snapshot, _actionLog, pending) => pending?.seq || 0,
    });

    assert.strictEqual(facade.roomStorageKey('onlineGameStart', ' room01 '), 'onlineGameStart:room:ROOM01');
    assert.deepStrictEqual(facade.roomStorageKeys('onlineGameStart', 'room01'), ['onlineGameStart', 'onlineGameStart:room:ROOM01']);
    facade.writeRestoreStorageJson('onlineGameStart', { roomId: 'ROOM01' }, ' room01 ');
    assert.deepStrictEqual(JSON.parse(localStorage.getItem('onlineGameStart')), { roomId: 'ROOM01' });
    assert.deepStrictEqual(JSON.parse(localStorage.getItem('onlineGameStart:room:ROOM01')), { roomId: 'ROOM01' });
    localStorage.setItem('onlinePendingAction:room:ROOM01', JSON.stringify({ seq: 9 }));
    const indexEntry = facade.refreshRestoreRoomIndex('room01', 1234)[0];
    assert.strictEqual(indexEntry.roomId, 'ROOM01');
    assert.strictEqual(indexEntry.hasGameStart, true);
    assert.strictEqual(indexEntry.hasPendingAction, true);
    assert.strictEqual(indexEntry.actionSeq, 9);
    facade.removeRestoreStorageItem('onlineGameStart', 'room01');
    assert.strictEqual(localStorage.getItem('onlineGameStart'), null);
    assert.strictEqual(localStorage.getItem('onlineGameStart:room:ROOM01'), null);
});

runTest('_onlineRoomStorageKey はroom idを正規化し二重scopingしない', () => {
    const rt = loadOnlineRuntime();
    assert.strictEqual(rt._normalizeOnlineRoomId(' room01 '), 'ROOM01');
    assert.strictEqual(rt._normalizeOnlineRoomId(123), '');
    assert.strictEqual(rt._onlineRoomStorageKey('onlinePendingAction', ' room01 '), 'onlinePendingAction:room:ROOM01');
    assert.strictEqual(rt._onlineRoomStorageKey('onlinePendingAction', ''), 'onlinePendingAction');
    assert.strictEqual(rt._onlineRoomStorageKey('onlinePendingAction:room:ROOM01', 'ROOM02'), 'onlinePendingAction:room:ROOM01');
});

runTest('_normalizePendingOutboundAction は保存済みpending actionを最小形へ正規化する', () => {
    const rt = loadOnlineRuntime();
    assert.strictEqual(rt._normalizePendingOutboundAction(null), null);
    assert.strictEqual(rt._normalizePendingOutboundAction({ data: {} }), null);
    assert.strictEqual(rt._normalizePendingOutboundAction({ action: 'unknownAction', data: {}, roomId: 'ROOM01' }), null);
    assert.strictEqual(rt._isKnownOnlineGameAction('buildCard'), true);
    assert.strictEqual(rt._isKnownOnlineGameAction('unknownAction'), false);

    const normalizeForAssert = value => JSON.parse(JSON.stringify(value));
    assert.deepStrictEqual(normalizeForAssert(rt._normalizePendingOutboundAction({
        action: 'buildCard',
        data: { cardName: '麦畑' },
        playerIndex: 0,
        roomId: ' room01 ',
        seq: 7,
        clientActionId: 'client-7',
        extra: 'ignored',
    })), {
        action: 'buildCard',
        data: { cardName: '麦畑' },
        playerIndex: 0,
        roomId: 'ROOM01',
        seq: 7,
        clientActionId: 'client-7',
    });
    assert.deepStrictEqual(normalizeForAssert(rt._normalizePendingOutboundAction({
        action: 'nextTurn',
        data: null,
        playerIndex: 1.5,
        roomId: 123,
        seq: -1.2,
        clientActionId: 456,
    })), { action: 'nextTurn', data: {} });
});

runTest('onlineSession storage helper は legacy と room-scoped copy を同期する', () => {
    const rt = loadOnlineRuntime();
    const session = { roomId: ' room01 ', playerIndex: 0, playerName: 'Alice', reconnectToken: 'token' };

    rt._writeOnlineSessionStorageJson(session, session.roomId);

    assert.deepStrictEqual(JSON.parse(rt.localStorage.getItem('onlineSession')), session);
    assert.deepStrictEqual(JSON.parse(rt.localStorage.getItem('onlineSession:room:ROOM01')), session);

    rt._removeOnlineSessionStorageItem(' room01 ');

    assert.strictEqual(rt.localStorage.getItem('onlineSession'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineSession:room:ROOM01'), null);
});

runTest('_onlineRoomStorageKeys は legacy と scoped restore key を同じ順序で返す', () => {
    const rt = loadOnlineRuntime();
    assert.deepStrictEqual(
        Array.from(rt._onlineRoomStorageKeys('onlineGameStart', ' room01 ')),
        ['onlineGameStart', 'onlineGameStart:room:ROOM01']
    );
    assert.deepStrictEqual(Array.from(rt._onlineRoomStorageKeys('onlineGameStart', '')), ['onlineGameStart']);
    assert.deepStrictEqual(
        Array.from(rt._onlineRoomStorageKeys('onlineGameStart:room:ROOM01', 'ROOM02')),
        ['onlineGameStart:room:ROOM01']
    );
});

runTest('restore room index は scoped bundle 更新をroom単位で追跡する', () => {
    const rt = loadOnlineRuntime();
    const session = { roomId: ' room01 ', playerIndex: 0, playerName: 'Alice', reconnectToken: 'token' };

    rt._writeOnlineSessionStorageJson(session, session.roomId);
    rt.localStorage.setItem(rt._onlineRoomStorageKey('onlineGameStart', 'ROOM01'), JSON.stringify({ actionSeq: 2 }));
    rt.localStorage.setItem(rt._onlineRoomStorageKey('onlineActionLog', 'ROOM01'), JSON.stringify([{ action: 'nextTurn', seq: 4 }]));
    rt.localStorage.setItem(rt._onlineRoomStorageKey('onlineStateSnapshot', 'ROOM01'), JSON.stringify({ actionSeq: 3 }));
    rt.localStorage.setItem(rt._onlineRoomStorageKey('onlineRestoreAudit', 'ROOM01'), JSON.stringify({ schemaVersion: 1, roomId: 'ROOM01', signed: true }));
    rt._refreshOnlineRestoreRoomIndex('ROOM01', 1700000000000);

    const index = rt._readOnlineRestoreRoomIndex();
    assert.strictEqual(index.length, 1);
    assert.strictEqual(index[0].roomId, 'ROOM01');
    assert.strictEqual(index[0].playerName, 'Alice');
    assert.strictEqual(index[0].playerIndex, 0);
    assert.strictEqual(index[0].actionSeq, 4);
    assert.strictEqual(index[0].hasGameStart, true);
    assert.strictEqual(index[0].hasActionLog, true);
    assert.strictEqual(index[0].hasStateSnapshot, true);
    assert.strictEqual(index[0].hasRestoreAudit, true);
});

runTest('restore room index pruning は実体のない stale entry だけを落とす', () => {
    const rt = loadOnlineRuntime();
    rt.localStorage.setItem('onlineRestoreRoomIndex', JSON.stringify([
        { roomId: 'ROOM01', updatedAt: 2, hasGameStart: true },
        { roomId: 'ROOM02', updatedAt: 1, hasGameStart: true },
    ]));
    rt.localStorage.setItem(rt._onlineRoomStorageKey('onlineGameStart', 'ROOM02'), JSON.stringify({ actionSeq: 1 }));

    const pruned = rt._pruneOnlineRestoreRoomIndex();

    assert.strictEqual(pruned.length, 1);
    assert.strictEqual(pruned[0].roomId, 'ROOM02');
    const index = rt._readOnlineRestoreRoomIndex();
    assert.strictEqual(index.length, 1);
    assert.strictEqual(index[0].roomId, 'ROOM02');
    assert.ok(rt.localStorage.getItem(rt._onlineRoomStorageKey('onlineGameStart', 'ROOM02')));
});

runTest('online.js はlocalStorage取得拒否でも初期化を継続する', () => {
    const rt = loadOnlineRuntime({ throwStorageAccess: true });
    assert.doesNotThrow(() => rt.initSocket());
    assert.strictEqual(typeof rt.getSocketHandlers().roomCreated, 'function');
});

runTest('initSocket はSocket.IO script未読込時に状態を変更しない', () => {
    const localRt = loadOnlineRuntime({ withoutIo: true });

    localRt.initSocket();

    assert.strictEqual(localRt.getOnlineState().socket, null);
    assert.deepStrictEqual(Object.keys(localRt.getSocketHandlers()), []);
});

runTest('showCreateRoom はSocket.IO script未読込時に送信せずエラー表示する', () => {
    const localRt = loadOnlineRuntime({ withoutIo: true });
    localRt.document.getElementById('playerNameInput').value = 'Alice';
    localRt.document.getElementById('onlineCpuSpeed').value = '1500';

    localRt.showCreateRoom();

    assert.strictEqual(localRt.getOnlineState().socket, null);
    assert.strictEqual(localRt.getSocketEmits().length, 0);
    assert.strictEqual(localRt.elements.onlineStatus.textContent, '❌ オンライン機能を読み込めませんでした。サーバーURLから開き直してください。');
});

runTest('joinRoom はSocket.IO script未読込時に送信せずhost状態を落とす', () => {
    const localRt = loadOnlineRuntime({ withoutIo: true });
    localRt.document.getElementById('playerNameInput').value = 'Bob';
    localRt.document.getElementById('roomIdInput').value = 'room01';
    localRt.setOnlineState({ isRoomHost: true });

    localRt.joinRoom();

    assert.strictEqual(localRt.getOnlineState().socket, null);
    assert.strictEqual(localRt.getOnlineState().isRoomHost, false);
    assert.strictEqual(localRt.getSocketEmits().length, 0);
    assert.strictEqual(localRt.elements.onlineStatus.textContent, '❌ オンライン機能を読み込めませんでした。サーバーURLから開き直してください。');
});

runTest('initSocket はSocket.IO script未読込時に診断を送る', () => {
    const localRt = loadOnlineRuntime({ withoutIo: true });

    assert.strictEqual(localRt.initSocket(), false);
    assert.strictEqual(localRt.initSocket(), false);

    assert.strictEqual(localRt.getClientFlowCheckpoints().length, 1);
    assert.strictEqual(localRt.getClientFlowCheckpoints()[0].name, 'socket-io-unavailable');
    assert.strictEqual(localRt.getClientErrorReports().length, 1);
    assert.strictEqual(localRt.getClientErrorReports()[0].source, 'socket-io-unavailable');
});

runTest('onChangeOnlinePlayerType はRL選択時にモデルを先読みする', async () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineSelectedCount(4);
    rt.setOnlinePlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.onChangeOnlinePlayerType(2, 'rl');
    await Promise.resolve();

    assert.deepStrictEqual(JSON.parse(JSON.stringify(rt.getRlPreloadCalls().pop())), {
        playerCount: 4,
        options: { attempts: 3, retryDelayMs: 0 },
    });
});

runTest('renderOnlinePlayerSettings はRLモデルloading中に部屋作成ボタンを止める', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineSelectedCount(3);
    rt.setOnlinePlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl' },
        { type: 'human', difficulty: 'normal' },
    ]);
    rt.RLModelPortfolio.eligibleLoadState = () => ({ status: 'loading', ready: 0, total: 1, errors: [] });

    rt.renderOnlinePlayerSettings();

    assert.strictEqual(rt.elements.onlineCreateSubmitButton.disabled, true);
    assert.strictEqual(rt.elements.onlineCreateSubmitButton.textContent, 'モデル読み込み中');
    assert.ok(rt.elements.onlineRlModelStatus.textContent.includes('読み込んでいます'));
});

runTest('renderOnlinePlayerSettings はRLモデルfailed時に部屋作成を再試行表示にする', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineSelectedCount(3);
    rt.setOnlinePlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl' },
        { type: 'human', difficulty: 'normal' },
    ]);
    rt.RLModelPortfolio.eligibleLoadState = () => ({ status: 'failed', ready: 0, total: 1, errors: ['network'] });

    rt.renderOnlinePlayerSettings();

    assert.strictEqual(rt.elements.onlineCreateSubmitButton.disabled, false);
    assert.strictEqual(rt.elements.onlineCreateSubmitButton.textContent, 'モデルを再試行');
    assert.ok(rt.elements.onlineRlModelStatus.textContent.includes('再試行'));
});

runTest('onChangeOnlinePlayerType はRL解除時に部屋作成ボタンを戻す', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineSelectedCount(2);
    rt.setOnlinePlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl' },
    ]);
    rt.RLModelPortfolio.eligibleLoadState = () => ({ status: 'loading', ready: 0, total: 1, errors: [] });
    rt.renderOnlinePlayerSettings();

    rt.onChangeOnlinePlayerType(1, 'normal');

    assert.strictEqual(rt.elements.onlineCreateSubmitButton.disabled, false);
    assert.strictEqual(rt.elements.onlineCreateSubmitButton.textContent, 'ルームを作る');
    assert.strictEqual(rt.elements.onlineRlModelStatus.textContent, '');
});

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

    assert.ok(localRt.elements.onlinePlayerSettings.innerHTML.includes('value="rl" selected'));
    assert.ok(!localRt.elements.onlinePlayerSettings.innerHTML.includes('value="rl" disabled'));
    assert.ok(localRt.elements.onlinePlayerSettings.innerHTML.includes('脅威度上位3人の相手を見て判断します'));
    assert.ok(localRt.elements.onlinePlayerSettings.innerHTML.includes('data-ui-change="onlinePlayerType"'));
    assert.ok(!localRt.elements.onlinePlayerSettings.innerHTML.includes('onChangeOnlinePlayerType('));
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
    assert.deepStrictEqual(Array.from(cpuPlayers[1].options.expertOpponentDifficulties), ['human', 'normal']);
});

runTest('showCreateRoom は作成中の連打でcreateRoomを重複送信しない', () => {
    const rt = loadOnlineRuntime();
    rt.document.getElementById('playerNameInput').value = 'Alice';
    rt.document.getElementById('onlineCpuSpeed').value = '1500';

    rt.showCreateRoom();
    rt.showCreateRoom();

    const emits = rt.getSocketEmits().filter(e => e.name === 'createRoom');
    assert.strictEqual(emits.length, 1);
    assert.strictEqual(rt.elements.onlineCreateSubmitButton.disabled, true);
    assert.strictEqual(rt.elements.onlineCreateSubmitButton.textContent, '作成中');

    rt.getSocketHandlers().roomCreated({ roomId: 'ROOM01', playerIndex: 0, reconnectToken: 'token-1' });

    assert.strictEqual(rt.elements.onlineCreateSubmitButton.disabled, false);
    assert.strictEqual(rt.elements.onlineCreateSubmitButton.textContent, 'ルームを作る');
});

runTest('オンライン待機要求はtimeoutとdisconnectで操作可能に戻る', () => {
    const rt = loadOnlineRuntime();
    rt.document.getElementById('playerNameInput').value = 'Alice';
    rt.document.getElementById('onlineCpuSpeed').value = '1500';
    rt.showCreateRoom();
    const createTimer = rt.getTimeoutHandlers().find(entry => entry.ms === 15000);
    assert.ok(createTimer);
    createTimer.handler();
    assert.strictEqual(rt.getOnlineLobbyState().createPending, false);
    assert.strictEqual(rt.elements.onlineCreateSubmitButton.disabled, false);

    rt.document.getElementById('roomIdInput').value = 'ROOM01';
    rt.joinRoom();
    rt.joinRoom();
    assert.strictEqual(rt.getSocketEmits().filter(event => event.name === 'joinRoom').length, 1);
    assert.strictEqual(rt.elements.onlineJoinSubmitButton.disabled, true);
    rt.getSocketHandlers().disconnect();
    assert.strictEqual(rt.getOnlineLobbyState().joinPending, false);
    assert.strictEqual(rt.elements.onlineJoinSubmitButton.disabled, false);
});

runTest('roomCreated はゲーム開始前から再接続資格情報を保存する', () => {
    const rt = loadOnlineRuntime();
    rt.document.getElementById('playerNameInput').value = 'Alice';
    rt.document.getElementById('onlineCpuSpeed').value = '1500';
    rt.showCreateRoom();
    rt.getSocketHandlers().roomCreated({ roomId: 'ROOM01', playerIndex: 0, reconnectToken: 'token-1' });
    const session = JSON.parse(rt.localStorage.getItem('onlineSession'));
    assert.strictEqual(session.roomId, 'ROOM01');
    assert.strictEqual(session.playerName, 'Alice');
    assert.strictEqual(session.reconnectToken, 'token-1');
});

runTest('showCreateRoom はRL CPUモデルを作成payload内で固定する', async () => {
    const runtime = loadOnlineRuntime();
    runtime.RLModelPortfolio = {
        preloadEligibleModels(playerCount) {
            assert.strictEqual(playerCount, 3);
            return Promise.resolve([]);
        },
        selectRandomModel(playerCount) {
            assert.strictEqual(playerCount, 3);
            return { id: 'frozen-online-rl' };
        },
    };
    runtime.document.getElementById('playerNameInput').value = 'Alice';
    runtime.document.getElementById('onlineCpuSpeed').value = '1500';
    runtime.setOnlineSelectedCount(3);
    runtime.setOnlinePlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl' },
        { type: 'cpu', difficulty: 'strong' },
    ]);

    runtime.showCreateRoom();
    await Promise.resolve();

    const emitted = runtime.getSocketEmits().filter(event => event.name === 'createRoom').pop();
    assert.ok(emitted, 'createRoom emit should exist');
    assert.strictEqual(emitted.payload.playerSettings[1].difficulty, 'rl');
    assert.strictEqual(emitted.payload.playerSettings[1].rlModelId, 'frozen-online-rl');
    assert.strictEqual(emitted.payload.playerSettings[2].difficulty, 'strong');
});

runTest('showCreateRoom はRL preload失敗時に部屋作成せず差し替えもしない', async () => {
    const runtime = loadOnlineRuntime();
    runtime.console = Object.assign({}, console, { error() {} });
    runtime.RLModelPortfolio = {
        shouldAvoidSynchronousModelLoad() { return true; },
        preloadEligibleModels() { return Promise.reject(new Error('preload failed')); },
        selectRandomModel() { return { id: 'should-not-freeze' }; },
    };
    runtime.document.getElementById('playerNameInput').value = 'Alice';
    runtime.document.getElementById('onlineCpuSpeed').value = '1500';
    runtime.setOnlineSelectedCount(3);
    runtime.setOnlinePlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl' },
        { type: 'cpu', difficulty: 'strong' },
    ]);

    runtime.showCreateRoom();
    await Promise.resolve();

    const emitted = runtime.getSocketEmits().filter(event => event.name === 'createRoom').pop();
    assert.strictEqual(emitted, undefined);
});

runTest('initOnlineGame: 5人以上のRL CPUはplayerOrder後もrlとして生成する', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initOnlineGame(
        ['Alice', 'RL CPU', 'Bob', 'Strong CPU', 'Carol'],
        [
            { type: 'human' },
            { type: 'cpu', difficulty: 'rl', rlModelId: 'fixed-rl' },
            { type: 'human' },
            { type: 'cpu', difficulty: 'strong' },
            { type: 'human' },
        ],
        [3, 1, 0, 2, 4]
    );

    const game = rt.getGame();
    const cpuPlayers = rt.getCpuPlayers();
    const names = game.players.map(player => player.name);
    assert.strictEqual(names.join(','), 'Strong CPU,RL CPU,Alice,Bob,Carol');
    assert.strictEqual(cpuPlayers.length, 5);
    assert.strictEqual(cpuPlayers[0].difficulty, 'strong');
    assert.strictEqual(cpuPlayers[1].difficulty, 'rl');
    assert.strictEqual(cpuPlayers[1].options.playerCount, 5);
    assert.strictEqual(cpuPlayers[1].options.rlModelId, 'fixed-rl');
    assert.deepStrictEqual(Array.from(rt.getCreatedCpuPlayerCalls().map(call => call.difficulty)), ['strong', 'rl']);
    assert.strictEqual(rt.getCreatedCpuPlayerCalls()[1].options.rlModelId, 'fixed-rl');
    assert.strictEqual(rt.getCreatedCpuPlayerCalls()[1].options.playerCount, 5);
    assert.deepStrictEqual(Array.from(cpuPlayers[0].options.expertOpponentDifficulties), ['strong', 'rl', 'human', 'human', 'human']);
    assert.strictEqual(cpuPlayers[2], null);
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
        hostPlayerIndex: 0,
    });
    const storedGameStart = JSON.parse(rt.localStorage.getItem('onlineGameStart'));
    assert.strictEqual(storedGameStart.hostPlayerIndex, 0);
    rt.getGame().phase = GAME_PHASES.BUILD;
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

runTest('rejoinData は署名なしsnapshotでローカル完全actionLogを短い残差logで上書きしない', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    const game = new rt.GameManager(2);
    rt.setGame(game);
    for (const card of CARDS) rt.getShopStock()[card.name] = 6;
    rt.initSocket();
    rt.setOnlineState({
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 1,
        myPlayerName: 'Bob',
        reconnectToken: 'token-bob',
        isRoomHost: false,
    });
    const fullActionLog = [
        { action: 'rollDice', data: { forceDice: 1 }, playerIndex: 0, seq: 1 },
        { action: 'nextTurn', data: {}, playerIndex: 0, seq: 2 },
    ];
    const gameStartPayload = {
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
        hostEpoch: 1,
        actionSeq: 2,
    };
    rt.localStorage.setItem('onlineGameStart', JSON.stringify(gameStartPayload));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify(fullActionLog));
    const stateSnapshot = rt.buildOnlineSnapshot();
    stateSnapshot.actionSeq = 2;

    rt.getSocketHandlers().rejoinData({
        gameStartPayload: Object.assign({}, gameStartPayload),
        stateSnapshot,
        actionLog: [],
        playerIndex: 1,
        hostPlayerIndex: 0,
        hostEpoch: 1,
    });

    const storedActionLog = rt._readOnlineActionLog();
    assert.strictEqual(storedActionLog.length, 2);
    assert.strictEqual(JSON.stringify(storedActionLog.map(entry => entry.seq)), JSON.stringify([1, 2]));
    assert.strictEqual(JSON.parse(rt.localStorage.getItem('onlineActionLog')).length, 2);
});

runTest('rejoinData は build action replay から undoState を復元する', () => {
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    const handlers = rt.getSocketHandlers();

    handlers.rejoinData({
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
        },
        stateSnapshot: null,
        actionLog: [
            { action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] } },
            { action: 'buildCard', data: { cardName: 'カフェ' } },
        ],
        playerIndex: 0,
        hostPlayerIndex: 0,
    });

    const undoState = rt.getUndoState();
    assert.ok(undoState);
    assert.strictEqual(undoState.playerCoins[0], 4);
    assert.strictEqual(undoState.shopStock['カフェ'], 6);
});

runTest('gameStart はRL CPUモデルをpreloadしてから初期化する', async () => {
    const rt = loadOnlineRuntime();
    let resolvePreload;
    rt.RLModelPortfolio = {
        preloadEligibleModels(playerCount, options) {
            rt.getRlPreloadCalls().push({ playerCount, options });
            return new Promise(resolve => { resolvePreload = resolve; });
        },
    };
    rt.initSocket();

    rt.getSocketHandlers().gameStart({
        playerNames: ['Alice', 'RL CPU', 'Bob'],
        playerSettings: [
            { type: 'human' },
            { type: 'cpu', difficulty: 'rl', rlModelId: 'fixed-rl' },
            { type: 'human' },
        ],
        cpuSpeed: 1500,
        playerOrder: [0, 1, 2],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        versions: ['test-version'],
        hostPlayerIndex: 0,
        hostEpoch: 1,
        actionSeq: 0,
    });

    assert.strictEqual(rt.getGame(), null);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(rt.getRlPreloadCalls().pop())), { playerCount: 3, options: { attempts: 3 } });
    resolvePreload([]);
    await Promise.resolve();

    assert.ok(rt.getGame());
    assert.strictEqual(rt.getCpuPlayers()[1].difficulty, 'rl');
});

runTest('gameStart はRL preload失敗時にオンライン状態と復元bundleを確定しない', async () => {
    const rt = loadOnlineRuntime();
    rt.RLModelPortfolio = {
        preloadEligibleModels() {
            return Promise.reject(new Error('model down'));
        },
    };
    rt.initSocket();

    rt.getSocketHandlers().gameStart({
        playerNames: ['Alice', 'RL CPU', 'Bob'],
        playerSettings: [
            { type: 'human' },
            { type: 'cpu', difficulty: 'rl', rlModelId: 'fixed-rl' },
            { type: 'human' },
        ],
        cpuSpeed: 1500,
        playerOrder: [0, 1, 2],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        versions: ['test-version'],
        hostPlayerIndex: 0,
        hostEpoch: 1,
        actionSeq: 0,
    });
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(rt.getGame(), null);
    assert.strictEqual(rt.getOnlineState().isOnlineGame, false);
    assert.strictEqual(rt.localStorage.getItem('onlineGameStart'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineSession'), null);
    assert.ok(rt.elements.onlineStatus.textContent.includes('復元を待っています'));
});

runTest('rejoinData はRL preload失敗時にオンライン復元を確定しない', async () => {
    const rt = loadOnlineRuntime();
    rt.RLModelPortfolio = {
        preloadEligibleModels() {
            return Promise.reject(new Error('rejoin model down'));
        },
    };
    rt.initSocket();

    rt.getSocketHandlers().rejoinData({
        gameStartPayload: {
            schemaVersion: 2,
            playerNames: ['Alice', 'RL CPU', 'Bob'],
            playerSettings: [
                { type: 'human' },
                { type: 'cpu', difficulty: 'rl', rlModelId: 'fixed-rl' },
                { type: 'human' },
            ],
            cpuSpeed: 1500,
            playerOrder: [0, 1, 2],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
            reconnectTokenHashes: ['hash-a', '', 'hash-b'],
            hostPlayerIndex: 0,
            hostEpoch: 1,
            actionSeq: 0,
        },
        stateSnapshot: null,
        actionLog: [],
        playerIndex: 0,
        hostPlayerIndex: 0,
        hostEpoch: 1,
    });
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(rt.getGame(), null);
    assert.strictEqual(rt.getOnlineState().isOnlineGame, false);
    assert.strictEqual(rt.getOnlineState().isReconnectingOnline, true);
    assert.strictEqual(rt.localStorage.getItem('onlineGameStart'), null);
    assert.ok(rt.elements.onlineStatus.textContent.includes('復元を待っています'));
});

runTest('rejoinData はRL preload中に受信したgameActionを復元後に一度だけ適用する', async () => {
    const rt = loadOnlineRuntime();
    vm.runInContext(`
        let resolveRestorePreload;
        RLModelPortfolio = {
            preloadEligibleModels() { return new Promise(resolve => { resolveRestorePreload = resolve; }); }
        };
        this.resolveRestorePreload = () => resolveRestorePreload([]);
    `, rt);
    rt.initSocket();
    const handlers = rt.getSocketHandlers();
    handlers.rejoinData({
        gameStartPayload: {
            schemaVersion: 2, playerNames: ['Alice', 'RL CPU'],
            playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'rl', rlModelId: 'fixed-rl' }],
            cpuSpeed: 1500, playerOrder: [0, 1], enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(), hostPlayerIndex: 0, hostEpoch: 1, actionSeq: 0
        },
        stateSnapshot: null, actionLog: [], playerIndex: 0, hostPlayerIndex: 0, hostEpoch: 1
    });
    handlers.gameAction({ action: 'rollDice', data: { forceDice: 2 }, playerIndex: 0, seq: 1 });
    assert.strictEqual(rt.getGame(), null);

    rt.resolveRestorePreload();
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(rt.getGame().lastDiceResult, 2);
    assert.strictEqual(rt._readOnlineActionLog().filter(entry => entry.seq === 1).length, 1);
});

runTest('gameAction はゲーム未初期化なら適用せず再接続表示にする', () => {
    const rt = loadOnlineRuntime();
    rt.initSocket();
    rt.setOnlineState({
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        myRoomId: 'ROOM01',
        reconnectToken: 'token-alice',
    });

    rt.getSocketHandlers().gameAction({ action: 'nextTurn', data: {}, playerIndex: 0, seq: 1 });

    assert.strictEqual(rt.getGame(), null);
    assert.strictEqual(rt.getOnlineState().isReconnectingOnline, true);
    assert.strictEqual(rt.elements.onlineStatus.textContent, '⚠️ ゲーム状態を準備できていないため、再接続しています...');
    assert.strictEqual(rt.getSocketEmits().some(event => event.name === 'rejoinRoom'), true);
});

runTest('gameStart は restore bundle を room-scoped key にも保存する', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    rt.setOnlineState({ myRoomId: 'ROOM01', myOriginalPlayerIndex: 0 });

    rt.getSocketHandlers().gameStart({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        versions: ['a'],
        hostPlayerIndex: 0,
        actionSeq: 0,
    });

    const scopedGameStart = JSON.parse(rt.localStorage.getItem(rt._onlineRoomStorageKey('onlineGameStart', 'ROOM01')));
    const scopedActionLog = JSON.parse(rt.localStorage.getItem(rt._onlineRoomStorageKey('onlineActionLog', 'ROOM01')));
    assert.strictEqual(scopedGameStart.hostPlayerIndex, 0);
    assert.strictEqual(scopedGameStart.actionSeq, 0);
    assert.deepStrictEqual(scopedActionLog, []);
});

runTest('rejoinData は canonical に受理済みの未ackアクションを破棄する', () => {
    const rt = loadOnlineRuntime();
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
        hostPlayerIndex: 0,
    });
    rt.getGame().phase = GAME_PHASES.BUILD;
    rt.sendAction('nextTurn', {});
    const pending = rt._readPendingOutboundAction();
    assert.ok(pending);

    handlers.rejoinData({
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
        },
        stateSnapshot: null,
        actionLog: [{
            action: pending.action,
            data: pending.data,
            playerIndex: pending.playerIndex,
            seq: pending.seq,
            clientActionId: pending.clientActionId,
        }],
        playerIndex: 0,
        hostPlayerIndex: 0,
    });

    assert.strictEqual(rt._readPendingOutboundAction(), null);
});

runTest('rejoinData は snapshot に畳み込まれた未ackアクションを再送しない', () => {
    const rt = loadOnlineRuntime();
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
        hostPlayerIndex: 0,
        actionSeq: 0,
    });
    rt.getGame().phase = GAME_PHASES.BUILD;
    rt.sendAction('nextTurn', {});
    const pending = rt._readPendingOutboundAction();
    const beforeEmitCount = rt.getSocketEmits().length;
    rt.applyAction('nextTurn', {});
    const stateSnapshot = rt.buildOnlineSnapshot();
    stateSnapshot.actionSeq = pending.seq;

    handlers.rejoinData({
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
            actionSeq: pending.seq,
        },
        stateSnapshot,
        actionLog: [],
        acceptedClientActions: [{ playerIndex: pending.playerIndex, clientActionId: pending.clientActionId, seq: pending.seq }],
        playerIndex: 0,
        hostPlayerIndex: 0,
    });

    assert.strictEqual(rt._readPendingOutboundAction(), null);
    assert.strictEqual(rt.getSocketEmits().length, beforeEmitCount);
    assert.strictEqual(rt.getGame().currentPlayerIndex, 1);
});

runTest('rejoinData は受理済みclientActionIdでsnapshot未達seqの未ackアクションを破棄する', () => {
    const rt = loadOnlineRuntime();
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
        hostPlayerIndex: 0,
        actionSeq: 0,
    });
    rt.getGame().phase = GAME_PHASES.BUILD;
    rt.sendAction('nextTurn', {});
    const pending = rt._readPendingOutboundAction();
    const beforeEmitCount = rt.getSocketEmits().length;
    const stateSnapshot = rt.buildOnlineSnapshot();
    stateSnapshot.actionSeq = pending.seq - 1;

    handlers.rejoinData({
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
            actionSeq: pending.seq - 1,
        },
        stateSnapshot,
        actionLog: [],
        acceptedClientActions: [{ playerIndex: pending.playerIndex, clientActionId: pending.clientActionId, seq: pending.seq + 20 }],
        playerIndex: 0,
        hostPlayerIndex: 0,
    });

    assert.strictEqual(rt._readPendingOutboundAction(), null);
    assert.strictEqual(rt.getSocketEmits().length, beforeEmitCount);
    assert.strictEqual(rt.getGame().currentPlayerIndex, 0);
});

runTest('rejoinData は canonical に無い未ackアクションを保持して再送する', () => {
    const rt = loadOnlineRuntime();
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
        hostPlayerIndex: 0,
    });
    rt.getGame().phase = GAME_PHASES.BUILD;
    rt.sendAction('nextTurn', {});
    const pending = rt._readPendingOutboundAction();
    const beforeEmitCount = rt.getSocketEmits().length;

    handlers.rejoinData({
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
        },
        stateSnapshot: null,
        actionLog: [],
        playerIndex: 0,
        hostPlayerIndex: 0,
    });

    assert.deepStrictEqual(rt._readPendingOutboundAction(), pending);
    assert.strictEqual(rt.getSocketEmits().length, beforeEmitCount + 1);
    assert.strictEqual(rt.getSocketEmits()[rt.getSocketEmits().length - 1].name, 'gameAction');
    assert.strictEqual(rt.getSocketEmits()[rt.getSocketEmits().length - 1].payload.clientActionId, pending.clientActionId);
});

runTest('rejoinData はホスト移譲後の旧ホストCPU pending actionを再送しない', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    rt.setOnlineState({
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        myRoomId: 'ROOM01',
        reconnectToken: 'token-a',
        isRoomHost: false,
    });
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        seq: 7,
        clientActionId: 'old-host-cpu-action',
    }));

    rt.getSocketHandlers().rejoinData({
        gameStartPayload: {
            playerNames: ['Alice', 'Bob', 'CPU'],
            playerSettings: [{ type: 'human' }, { type: 'human' }, { type: 'cpu', difficulty: 'normal' }],
            cpuSpeed: 1500,
            playerOrder: [2, 0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
            hostPlayerIndex: 1,
            hostEpoch: 1,
            actionSeq: 6,
        },
        stateSnapshot: null,
        actionLog: [],
        playerIndex: 0,
        hostPlayerIndex: 1,
        hostEpoch: 1,
    });

    assert.strictEqual(rt.getSocketEmits().length, 0);
    assert.strictEqual(rt._readPendingOutboundAction(), null);
    assert.strictEqual(rt.getOnlineState().onlineActionInFlight, false);
});

runTest('rejoinData は stateSnapshot actionSeq だけ高い場合もclientActionId付きpendingを受理済みにしない', () => {
    const rt = loadOnlineRuntime();
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
        hostPlayerIndex: 0,
        actionSeq: 0,
    });
    rt.getGame().phase = GAME_PHASES.BUILD;
    rt.sendAction('nextTurn', {});
    const pending = rt._readPendingOutboundAction();
    const beforeEmitCount = rt.getSocketEmits().length;
    const stateSnapshot = rt.buildOnlineSnapshot();
    stateSnapshot.actionSeq = pending.seq + 10;

    handlers.rejoinData({
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
            actionSeq: pending.seq + 10,
        },
        stateSnapshot,
        actionLog: [],
        acceptedClientActions: [],
        playerIndex: 0,
        hostPlayerIndex: 0,
    });

    assert.strictEqual(rt._readPendingOutboundAction().clientActionId, pending.clientActionId);
    assert.strictEqual(rt.getSocketEmits().length, beforeEmitCount + 1);
    assert.strictEqual(rt.getSocketEmits()[rt.getSocketEmits().length - 1].payload.clientActionId, pending.clientActionId);
});

runTest('rejoinData は actionSeq だけ高い場合は未ackアクションを受理済みにしない', () => {
    const rt = loadOnlineRuntime();
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
        hostPlayerIndex: 0,
    });
    rt.getGame().phase = GAME_PHASES.BUILD;
    rt.sendAction('nextTurn', {});
    const pending = rt._readPendingOutboundAction();
    const beforeEmitCount = rt.getSocketEmits().length;

    handlers.rejoinData({
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
            actionSeq: pending.seq + 5,
        },
        stateSnapshot: null,
        actionLog: [],
        playerIndex: 0,
        hostPlayerIndex: 0,
    });

    assert.deepStrictEqual(rt._readPendingOutboundAction(), pending);
    assert.strictEqual(rt.getSocketEmits().length, beforeEmitCount + 1);
    assert.strictEqual(rt.getSocketEmits()[rt.getSocketEmits().length - 1].payload.clientActionId, pending.clientActionId);
});

runTest('rejoinData は localStorage の古い高 actionSeq を canonical 値で上書きする', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 99,
    }));
    rt.initSocket();
    const handlers = rt.getSocketHandlers();

    handlers.rejoinData({
        gameStartPayload: {
            schemaVersion: 2,
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
            reconnectTokenHashes: ['hash-a', 'hash-b'],
            hostPlayerIndex: 0,
            hostEpoch: 0,
            actionSeq: 1,
        },
        stateSnapshot: null,
        actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 1 }],
        playerIndex: 0,
        hostPlayerIndex: 0,
        hostEpoch: 0,
    });

    const stored = JSON.parse(rt.localStorage.getItem('onlineGameStart'));
    assert.strictEqual(stored.actionSeq, 1);
});

runTest('rejoinData は共通fixtureの最大 actionSeq を local sequencing 用に保存する', () => {
    const fixture = makeSeqRankUsesMaxFieldsFixture();
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();

    rt.getSocketHandlers().rejoinData({
        gameStartPayload: Object.assign({}, fixture.gameStartPayload),
        stateSnapshot: null,
        actionLog: fixture.actionLog,
        playerIndex: fixture.playerIndex,
        hostPlayerIndex: fixture.gameStartPayload.hostPlayerIndex,
        hostEpoch: fixture.expectedRank.hostEpoch,
    });

    const stored = JSON.parse(rt.localStorage.getItem('onlineGameStart'));
    assert.strictEqual(stored.hostEpoch, fixture.expectedRank.hostEpoch);
    assert.strictEqual(stored.actionSeq, fixture.expectedRank.actionSeq);
});

runTest('_onlineRestoreRank は共通fixtureのreplay可能action数を復元rankに使う', () => {
    const fixture = makeSeqRankUsesMaxFieldsFixture();
    const rt = loadOnlineRuntime();

    const rank = rt._onlineRestoreRank(
        Object.assign({}, fixture.gameStartPayload),
        Object.assign({}, fixture.stateSnapshotOverrides),
        fixture.actionLog
    );
    assert.strictEqual(rank.hostEpoch, fixture.expectedRank.hostEpoch);
    assert.strictEqual(rank.actionSeq, fixture.expectedRank.actionSeq);
});

runTest('_onlineRestoreRank は未知actionをreplay可能件数に含めない', () => {
    const rt = loadOnlineRuntime();
    const rank = rt._onlineRestoreRank(
        { hostEpoch: 1, actionSeq: 20 },
        { actionSeq: 4 },
        [
            { action: 'unknownAction', data: {}, playerIndex: 0, seq: 5 },
            { action: 'nextTurn', data: {}, playerIndex: 0, seq: 6 },
        ]
    );
    assert.strictEqual(rank.hostEpoch, 1);
    assert.strictEqual(rank.actionSeq, 5);
});

runTest('rejoinData は共通fixtureで aggregate actionSeq だけでは pending をack扱いしない', () => {
    const fixture = makePendingAckRequiresLogOrSnapshotFixture();
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    rt.setOnlineState({
        myOriginalPlayerIndex: fixture.pendingAction.playerIndex,
        myPlayerName: fixture.serverBundle.gameStartPayload.playerNames[fixture.pendingAction.playerIndex],
        myRoomId: 'ROOM01',
        reconnectToken: 'token-alice',
        isRoomHost: true,
    });
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify(fixture.pendingAction));

    rt.getSocketHandlers().rejoinData(fixture.serverBundle);

    const stored = JSON.parse(rt.localStorage.getItem('onlineGameStart'));
    const pending = rt._readPendingOutboundAction();
    assert.strictEqual(stored.actionSeq, fixture.serverBundle.gameStartPayload.actionSeq);
    assert.strictEqual(pending.action, fixture.pendingAction.action);
    assert.deepStrictEqual(Object.assign({}, pending.data), fixture.pendingAction.data);
    assert.strictEqual(pending.playerIndex, fixture.pendingAction.playerIndex);
    assert.strictEqual(pending.seq, fixture.pendingAction.seq);
    assert.strictEqual(pending.clientActionId, fixture.pendingAction.clientActionId);
    assert.strictEqual(rt.getSocketEmits().filter(e => e.name === 'gameAction').length, 1);
});

runTest('rejoinData は共通fixtureで stateSnapshot に畳み込まれた pending をack扱いする', () => {
    const fixture = makePendingAckRequiresLogOrSnapshotFixture();
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    rt.setOnlineState({
        myOriginalPlayerIndex: fixture.pendingAction.playerIndex,
        myPlayerName: fixture.snapshotCompactedBundle.gameStartPayload.playerNames[fixture.pendingAction.playerIndex],
        myRoomId: 'ROOM01',
        reconnectToken: 'token-alice',
        isRoomHost: true,
    });
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify(fixture.pendingAction));

    rt.getSocketHandlers().rejoinData(fixture.snapshotCompactedBundle);

    const stored = JSON.parse(rt.localStorage.getItem('onlineGameStart'));
    assert.strictEqual(stored.actionSeq, fixture.snapshotCompactedBundle.gameStartPayload.actionSeq);
    assert.strictEqual(rt._readPendingOutboundAction(), null);
    assert.strictEqual(rt.getSocketEmits().filter(e => e.name === 'gameAction').length, 0);
    assert.strictEqual(rt.getGame().currentPlayerIndex, fixture.snapshotCompactedBundle.stateSnapshot.currentPlayerIndex);
});

runTest('rejoinData は別roomの未ackアクションを再送しない', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    rt.setOnlineState({
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        myRoomId: 'ROOM01',
        reconnectToken: 'token-alice',
        isRoomHost: true,
    });
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        roomId: 'OTHER',
        clientActionId: 'other-room-action',
    }));

    rt.getSocketHandlers().rejoinData({
        gameStartPayload: {
            schemaVersion: 2,
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
            reconnectTokenHashes: ['hash-a', 'hash-b'],
            hostPlayerIndex: 0,
            hostEpoch: 0,
            actionSeq: 0,
        },
        stateSnapshot: null,
        actionLog: [],
        playerIndex: 0,
        hostPlayerIndex: 0,
        hostEpoch: 0,
    });

    assert.strictEqual(rt.getSocketEmits().some(e => e.name === 'gameAction' && e.payload.clientActionId === 'other-room-action'), false);
    assert.strictEqual(rt.localStorage.getItem('onlinePendingAction'), null);
});

runTest('rejoinData はroomIdなし未ackアクションを再送しない', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    rt.setOnlineState({
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        myRoomId: 'ROOM01',
        reconnectToken: 'token-alice',
        isRoomHost: true,
    });
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        clientActionId: 'legacy-roomless-action',
    }));

    rt.getSocketHandlers().rejoinData({
        gameStartPayload: {
            schemaVersion: 2,
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
            reconnectTokenHashes: ['hash-a', 'hash-b'],
            hostPlayerIndex: 0,
            hostEpoch: 0,
            actionSeq: 0,
        },
        stateSnapshot: null,
        actionLog: [],
        playerIndex: 0,
        hostPlayerIndex: 0,
        hostEpoch: 0,
    });

    assert.strictEqual(rt.getSocketEmits().some(e => e.name === 'gameAction' && e.payload.clientActionId === 'legacy-roomless-action'), false);
    assert.strictEqual(rt.localStorage.getItem('onlinePendingAction'), null);
});

runTest('rejoinData はサーバー上のホストが別人なら古いホスト復元payloadを送らない', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    rt.setOnlineState({
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        myRoomId: 'ROOM01',
        reconnectToken: 'token-alice',
        isRoomHost: true,
    });
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
        hostEpoch: 2,
        actionSeq: 5,
    }));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([
        { action: 'nextTurn', data: {}, playerIndex: 0, seq: 5 },
    ]));

    rt.getSocketHandlers().rejoinData({
        gameStartPayload: {
            schemaVersion: 2,
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
            reconnectTokenHashes: ['hash-a', 'hash-b'],
            hostPlayerIndex: 1,
            hostEpoch: 2,
            actionSeq: 5,
        },
        stateSnapshot: null,
        actionLog: [],
        playerIndex: 0,
        hostPlayerIndex: 1,
        hostEpoch: 2,
    });

    assert.strictEqual(rt.getSocketEmits().filter(e => e.name === 'recreateRoom').length, 0);
    assert.strictEqual(rt.getOnlineState().isRoomHost, false);
    const stored = JSON.parse(rt.localStorage.getItem('onlineGameStart'));
    assert.strictEqual(stored.hostPlayerIndex, 1);
    assert.strictEqual(stored.actionSeq, 5);
});

runTest('rejoinData はサーバー上のホストが古くても新しいローカルホストbundleを送る', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    rt.setOnlineState({
        myOriginalPlayerIndex: 1,
        myPlayerName: 'Bob',
        myRoomId: 'ROOM01',
        reconnectToken: 'token-bob',
        isRoomHost: true,
    });
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 1,
        hostEpoch: 3,
        actionSeq: 12,
    }));

    rt.getSocketHandlers().rejoinData({
        gameStartPayload: {
            schemaVersion: 2,
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
            reconnectTokenHashes: ['hash-a', 'hash-b'],
            hostPlayerIndex: 0,
            hostEpoch: 2,
            actionSeq: 8,
        },
        stateSnapshot: null,
        actionLog: [],
        playerIndex: 1,
        hostPlayerIndex: 0,
        hostEpoch: 2,
    });

    const emitted = rt.getSocketEmits().filter(e => e.name === 'recreateRoom').pop();
    assert.ok(emitted);
    assert.strictEqual(emitted.payload.gameStartPayload.hostPlayerIndex, 1);
    assert.strictEqual(emitted.payload.gameStartPayload.hostEpoch, 3);
});

runTest('actionAccepted undoBuild は送信者もサーバー確定stateへ補正する', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    rt.initOnlineGame(['Alice', 'Bob'], null, [0, 1]);
    const handlers = rt.getSocketHandlers();
    const serverGame = new GameManager(2);
    serverGame.players[0].coins = 12;

    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'undoBuild', data: { state: { game: serverGame } }, playerIndex: 0, clientActionId: 'undo-accepted-1'
    }));
    handlers.actionAccepted({ action: 'undoBuild', data: { state: { game: serverGame } }, playerIndex: 0, clientActionId: 'undo-accepted-1' });

    assert.strictEqual(rt.getGame(), serverGame);
    assert.strictEqual(rt.getGame().players[0].coins, 12);
});

runTest('actionAccepted buildCard は送信者の undoState を復元snapshot用に保持する', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    rt.initOnlineGame(['Alice', 'Bob'], null, [0, 1]);
    rt.getGame().phase = GAME_PHASES.BUILD;
    rt.getGame().players[0].coins = 4;

    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'buildCard', data: { cardName: 'カフェ' }, playerIndex: 0, seq: 1, clientActionId: 'accepted-build-1'
    }));
    rt.getSocketHandlers().actionAccepted({
        action: 'buildCard',
        data: { cardName: 'カフェ' },
        playerIndex: 0,
        seq: 1,
        clientActionId: 'accepted-build-1',
    });

    const undoState = rt.getUndoState();
    assert.ok(undoState);
    assert.strictEqual(undoState.playerCoins[0], 4);
    assert.strictEqual(undoState.shopStock['カフェ'], 6);
    assert.strictEqual(rt.buildOnlineSnapshot().undoState.playerCoins[0], 4);
});

runTest('gameAction buildCard は受信側の undoState を復元snapshot用に保持する', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    rt.getSocketHandlers().gameStart({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        versions: ['a'],
        hostPlayerIndex: 0,
    });
    rt.getGame().phase = GAME_PHASES.BUILD;
    rt.getGame().players[0].coins = 4;

    rt.getSocketHandlers().gameAction({
        action: 'buildCard',
        data: { cardName: 'カフェ' },
        playerIndex: 0,
        seq: 1,
        clientActionId: 'remote-build-1',
    });

    const undoState = rt.getUndoState();
    assert.ok(undoState);
    assert.strictEqual(undoState.playerCoins[0], 4);
    assert.strictEqual(undoState.shopStock['カフェ'], 6);
    assert.strictEqual(rt.buildOnlineSnapshot().undoState.playerCoins[0], 4);
});

runTest('sendAction は actionAccepted まで二重送信を止める', () => {
    const rt = loadOnlineRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    rt.setGame(game);
    rt.initSocket();
    vm.runInContext('isOnlineGame = true;', rt);

    assert.strictEqual(rt.sendAction('nextTurn', {}), true);
    assert.strictEqual(rt.sendAction('nextTurn', {}), false);
    assert.strictEqual(rt.getSocketEmits().length, 1);
    assert.strictEqual(rt.getOnlineState().onlineActionInFlight, true);

    const pending = rt._readPendingOutboundAction();
    rt.getSocketHandlers().actionAccepted({
        action: 'nextTurn', data: {}, playerIndex: pending.playerIndex, clientActionId: pending.clientActionId
    });

    assert.strictEqual(rt.getOnlineState().onlineActionInFlight, false);
});

runTest('sendAction はack timeoutでpendingを残して再同期する', () => {
    const rt = loadOnlineRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    rt.setGame(game);
    rt.initSocket();
    rt.setOnlineState({
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        reconnectToken: 'token',
    });
    vm.runInContext('isOnlineGame = true;', rt);

    assert.strictEqual(rt.sendAction('nextTurn', {}), true);
    const pending = rt._readPendingOutboundAction();
    assert.strictEqual(rt.getOnlineState().onlineActionInFlight, true);
    assert.strictEqual(rt.getTimeoutHandlers().length, 1);

    assert.strictEqual(rt._handleOnlineActionTimeout(), true);

    assert.strictEqual(rt.getOnlineState().onlineActionInFlight, false);
    assert.strictEqual(rt.getOnlineState().isReconnectingOnline, true);
    assert.deepStrictEqual(rt._readPendingOutboundAction(), pending);
    const rejoin = rt.getSocketEmits().filter(e => e.name === 'rejoinRoom').pop();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(rejoin.payload)), {
        roomId: 'ROOM01',
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken: 'token',
        clientVersion: 'unknown',
        hostlessRestoreVersion: 1,
    });
});

runTest('resetOnlineState は room-scoped pending outbound copy も消す', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineState({ myRoomId: 'ROOM01' });
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        roomId: 'ROOM01',
        seq: 7,
        clientActionId: 'pending-reset',
    }));
    const scopedKey = rt._onlineRoomStorageKey('onlinePendingAction', 'ROOM01');
    rt.localStorage.setItem(scopedKey, JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        roomId: 'ROOM01',
        seq: 7,
        clientActionId: 'pending-reset',
    }));

    rt.resetOnlineState();

    assert.strictEqual(rt.localStorage.getItem('onlinePendingAction'), null);
    assert.strictEqual(rt.localStorage.getItem(scopedKey), null);
});

runTest('_clearOnlineRestoreBundle は room-scoped pending outbound copy も消す', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineState({ myRoomId: 'ROOM01' });
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        roomId: 'ROOM01',
        seq: 8,
        clientActionId: 'pending-clear-bundle',
    }));
    const scopedKey = rt._onlineRoomStorageKey('onlinePendingAction', 'ROOM01');
    rt.localStorage.setItem(scopedKey, JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        roomId: 'ROOM01',
        seq: 8,
        clientActionId: 'pending-clear-bundle',
    }));

    rt._clearOnlineRestoreBundle();

    assert.strictEqual(rt.localStorage.getItem('onlinePendingAction'), null);
    assert.strictEqual(rt.localStorage.getItem(scopedKey), null);
});

runTest('_readPendingOutboundAction は current room の scoped pending を legacy より優先する', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineState({ myRoomId: 'ROOM02' });
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: { legacy: true },
        playerIndex: 0,
        roomId: 'ROOM01',
        seq: 1,
        clientActionId: 'legacy-pending',
    }));
    rt.localStorage.setItem(rt._onlineRoomStorageKey('onlinePendingAction', 'ROOM02'), JSON.stringify({
        action: 'buildCard',
        data: { cardName: '牧場' },
        playerIndex: 1,
        roomId: 'ROOM02',
        seq: 3,
        clientActionId: 'scoped-pending',
    }));

    const pending = rt._readPendingOutboundAction();
    assert.strictEqual(pending.clientActionId, 'scoped-pending');
    assert.strictEqual(pending.roomId, 'ROOM02');
});

runTest('_readPendingOutboundAction は scoped pending がなければ legacy pending を読む', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineState({ myRoomId: 'ROOM02' });
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        roomId: 'ROOM01',
        seq: 1,
        clientActionId: 'legacy-fallback',
    }));

    const pending = rt._readPendingOutboundAction();
    assert.strictEqual(pending.clientActionId, 'legacy-fallback');
});

runTest('_readPendingOutboundActionForCurrentSession はlegacy pendingのroomId表記ゆれを同一roomとして扱う', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineState({ myRoomId: 'ROOM02' });
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        roomId: ' room02 ',
        seq: 1,
        clientActionId: 'legacy-same-room-normalized',
    }));

    const pending = rt._readPendingOutboundActionForCurrentSession({ requireRoomId: true });
    assert.strictEqual(pending.clientActionId, 'legacy-same-room-normalized');
    assert.strictEqual(pending.roomId, 'ROOM02');
});

runTest('_readPendingOutboundActionForCurrentSession は別roomのlegacy pendingを除外する', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineState({ myRoomId: 'ROOM02' });
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        roomId: 'ROOM01',
        seq: 1,
        clientActionId: 'legacy-other-room',
    }));

    assert.strictEqual(rt._readPendingOutboundActionForCurrentSession({ requireRoomId: true }), null);
});

runTest('_readPendingOutboundActionForCurrentSession はroomIdなしlegacy pendingを復元対象にしない', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineState({ myRoomId: 'ROOM02' });
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        seq: 1,
        clientActionId: 'legacy-roomless',
    }));

    assert.strictEqual(rt._readPendingOutboundActionForCurrentSession({ requireRoomId: true }), null);
});

runTest('sendAction は pending outbound を room-scoped key にも保存して消す', () => {
    const rt = loadOnlineRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    rt.setGame(game);
    rt.initSocket();
    rt.setOnlineState({
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        reconnectToken: 'token',
    });
    vm.runInContext('isOnlineGame = true;', rt);

    assert.strictEqual(rt.sendAction('nextTurn', {}), true);
    const legacyPending = JSON.parse(rt.localStorage.getItem('onlinePendingAction'));
    const scopedKey = rt._onlineRoomStorageKey('onlinePendingAction', 'ROOM01');
    const scopedPending = JSON.parse(rt.localStorage.getItem(scopedKey));
    assert.strictEqual(scopedKey, 'onlinePendingAction:room:ROOM01');
    assert.deepStrictEqual(scopedPending, legacyPending);

    rt.getSocketHandlers().actionAccepted({ action: 'nextTurn', data: {}, playerIndex: 0, clientActionId: legacyPending.clientActionId });

    assert.strictEqual(rt.localStorage.getItem('onlinePendingAction'), null);
    assert.strictEqual(rt.localStorage.getItem(scopedKey), null);
});

runTest('sendAction は未ackアクションを復元用に保存し actionAccepted で消す', () => {
    const rt = loadOnlineRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    rt.setGame(game);
    rt.initSocket();
    rt.setOnlineState({
        isRoomHost: true,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        reconnectToken: 'token',
    });
    vm.runInContext('isOnlineGame = true;', rt);

    assert.strictEqual(rt.sendAction('nextTurn', {}), true);
    const pending = rt._readPendingOutboundAction();
    assert.strictEqual(pending.action, 'nextTurn');
    assert.deepStrictEqual(Object.assign({}, pending.data), {});
    assert.strictEqual(pending.playerIndex, 0);
    assert.strictEqual(Number.isInteger(pending.seq), true);
    assert.strictEqual(typeof pending.clientActionId, 'string');
    const emitted = rt.getSocketEmits().filter(e => e.name === 'gameAction').pop();
    assert.strictEqual(emitted.payload.clientActionId, pending.clientActionId);

    rt.getSocketHandlers().actionAccepted({ action: 'nextTurn', data: {}, playerIndex: 0, clientActionId: pending.clientActionId });

    assert.strictEqual(rt._readPendingOutboundAction(), null);
});

runTest('actionAccepted は遅延した別actionのACKで現在flightと状態を変更しない', () => {
    const rt = loadOnlineRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    rt.setGame(game);
    rt.initSocket();
    rt.setOnlineState({ myOriginalPlayerIndex: 0, myRoomId: 'ROOM01' });
    vm.runInContext('isOnlineGame = true;', rt);

    assert.strictEqual(rt.sendAction('nextTurn', {}), true);
    const pending = rt._readPendingOutboundAction();
    const playerBefore = game.currentPlayerIndex;
    rt.getSocketHandlers().actionAccepted({
        action: 'nextTurn', data: {}, playerIndex: 0, seq: pending.seq - 1, clientActionId: 'stale-action-id'
    });

    assert.strictEqual(game.currentPlayerIndex, playerBefore);
    assert.strictEqual(rt.getOnlineState().onlineActionInFlight, true);
    assert.strictEqual(rt._readPendingOutboundAction().clientActionId, pending.clientActionId);
});

runTest('actionAccepted は別clientActionIdのackでpending actionを消さない', () => {
    const rt = loadOnlineRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    rt.setGame(game);
    rt.initSocket();
    rt.setOnlineState({
        myOriginalPlayerIndex: 0,
        myRoomId: 'ROOM01',
        myPlayerName: 'Alice',
        reconnectToken: 'token',
    });
    vm.runInContext('isOnlineGame = true;', rt);

    assert.strictEqual(rt.sendAction('nextTurn', {}), true);
    const pending = rt._readPendingOutboundAction();

    rt.getSocketHandlers().actionAccepted({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        seq: pending.seq,
        clientActionId: 'other-client-action',
    });

    assert.strictEqual(rt._readPendingOutboundAction().clientActionId, pending.clientActionId);
});

runTest('actionAccepted は clientActionId を復元ログへ保存する', () => {
    const rt = loadOnlineRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    rt.setGame(game);
    rt.initSocket();
    rt.setOnlineState({
        myOriginalPlayerIndex: 0,
    });
    vm.runInContext('isOnlineGame = true;', rt);

    assert.strictEqual(rt.sendAction('nextTurn', {}), true);
    const pending = rt._readPendingOutboundAction();

    rt.getSocketHandlers().actionAccepted({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        seq: 1,
        clientActionId: pending.clientActionId,
    });

    const actionLog = rt._readOnlineActionLog();
    assert.strictEqual(actionLog.length, 1);
    assert.strictEqual(actionLog[0].clientActionId, pending.clientActionId);
});

runTest('gameAction は clientActionId を受信側の復元ログへ保存する', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    rt.getSocketHandlers().gameStart({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        versions: ['a'],
        hostPlayerIndex: 0,
    });
    rt.getGame().phase = GAME_PHASES.BUILD;

    rt.getSocketHandlers().gameAction({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        seq: 1,
        clientActionId: 'remote-action-1',
    });

    const actionLog = rt._readOnlineActionLog();
    assert.strictEqual(actionLog.length, 1);
    assert.strictEqual(actionLog[0].clientActionId, 'remote-action-1');
});

runTest('_tryRestoreRoom は未ackアクションを復元actionLogへ混ぜない', () => {
    const rt = loadOnlineRuntime();
    rt.initSocket();
    rt.setOnlineState({
        isRoomHost: true,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        reconnectToken: 'token',
    });
    vm.runInContext('isOnlineGame = true;', rt);
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'ROOM01',
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken: 'token',
        isRoomHost: true,
    }));
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
    }));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([{ action: 'rollDice', data: { forceDice: 1 }, playerIndex: 0 }]));
    rt.sendAction('nextTurn', {});

    rt._tryRestoreRoom();

    const emitted = rt.getSocketEmits().filter(e => e.name === 'recreateRoom').pop();
    assert.ok(emitted);
    assert.strictEqual(emitted.payload.gameStartPayload.hostPlayerIndex, 0);
    assert.strictEqual(emitted.payload.actionLog.length, 1);
    assert.strictEqual(emitted.payload.actionLog.some(entry => entry.action === 'nextTurn'), false);
    assert.strictEqual(rt._readPendingOutboundAction().action, 'nextTurn');
});

runTest('_tryRestoreRoom は別roomの未ackアクションを復元actionLogへ混ぜない', () => {
    const rt = loadOnlineRuntime();
    rt.initSocket();
    rt.setOnlineState({
        isRoomHost: true,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        reconnectToken: 'token',
    });
    vm.runInContext('isOnlineGame = true;', rt);
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
    }));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([{ action: 'rollDice', data: { forceDice: 1 }, playerIndex: 0 }]));
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        roomId: 'OTHER',
        clientActionId: 'other-room-action',
    }));

    rt._tryRestoreRoom();

    const emitted = rt.getSocketEmits().filter(e => e.name === 'recreateRoom').pop();
    assert.ok(emitted);
    assert.strictEqual(emitted.payload.actionLog.length, 1);
    assert.strictEqual(emitted.payload.actionLog.some(entry => entry.clientActionId === 'other-room-action'), false);
});

runTest('_tryRestoreRoom はroomIdなし未ackアクションを復元actionLogへ混ぜない', () => {
    const rt = loadOnlineRuntime();
    rt.initSocket();
    rt.setOnlineState({
        isRoomHost: true,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        reconnectToken: 'token',
    });
    vm.runInContext('isOnlineGame = true;', rt);
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
    }));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([{ action: 'rollDice', data: { forceDice: 1 }, playerIndex: 0 }]));
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        clientActionId: 'legacy-roomless-action',
    }));

    rt._tryRestoreRoom();

    const emitted = rt.getSocketEmits().filter(e => e.name === 'recreateRoom').pop();
    assert.ok(emitted);
    assert.strictEqual(emitted.payload.actionLog.length, 1);
    assert.strictEqual(emitted.payload.actionLog.some(entry => entry.clientActionId === 'legacy-roomless-action'), false);
});

runTest('ROOM_NOT_FOUND のホスト復元経路は未ackアクションを消さずに送る', () => {
    const rt = loadOnlineRuntime();
    rt.initSocket();
    rt.setOnlineState({
        isRoomHost: true,
        isReconnectingOnline: false,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        reconnectToken: 'token',
    });
    vm.runInContext('isOnlineGame = true;', rt);
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'ROOM01',
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken: 'token',
        isRoomHost: true,
    }));
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
    }));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([]));
    rt.sendAction('nextTurn', {});
    rt.setOnlineState({ isReconnectingOnline: true });

    rt.handleAppError('ROOM_NOT_FOUND');

    const emitted = rt.getSocketEmits().filter(e => e.name === 'recreateRoom').pop();
    assert.ok(emitted);
    assert.strictEqual(emitted.payload.gameStartPayload.hostPlayerIndex, 0);
    assert.strictEqual(emitted.payload.actionLog.length, 0);
    assert.strictEqual(rt._readPendingOutboundAction().action, 'nextTurn');
});

runTest('_tryRestoreRoom は同内容の過去ログがあっても未ackアクションを復元ログへ混ぜない', () => {
    const rt = loadOnlineRuntime();
    rt.initSocket();
    rt.setOnlineState({
        isRoomHost: true,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        reconnectToken: 'token',
    });
    vm.runInContext('isOnlineGame = true;', rt);
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
    }));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([
        { action: 'nextTurn', data: {}, playerIndex: 0, seq: 1 },
    ]));
    rt.sendAction('nextTurn', {});

    rt._tryRestoreRoom();

    const emitted = rt.getSocketEmits().filter(e => e.name === 'recreateRoom').pop();
    assert.ok(emitted);
    assert.strictEqual(emitted.payload.actionLog.length, 1);
    assert.strictEqual(emitted.payload.actionLog.some(entry => typeof entry.clientActionId === 'string'), false);
    assert.strictEqual(rt._readPendingOutboundAction().action, 'nextTurn');
});

runTest('_tryRestoreRoom は古い復元schemaを送信せず破棄する', () => {
    const rt = loadOnlineRuntime();
    rt.initSocket();
    rt.setOnlineState({
        isRoomHost: true,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        reconnectToken: 'token',
    });
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        hostPlayerIndex: 0,
    }));

    rt._tryRestoreRoom();

    const emitted = rt.getSocketEmits().filter(e => e.name === 'recreateRoom').pop();
    assert.strictEqual(emitted, undefined);
    assert.strictEqual(rt.localStorage.getItem('onlineGameStart'), null);
    assert.strictEqual(rt.elements.onlineStatus.textContent, '❌ 古い復元データのため再接続できません');
});

runTest('gameStart はサーバーの hostPlayerIndex で stale host 状態を補正する', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    const handlers = rt.getSocketHandlers();

    rt.setOnlineState({ isRoomHost: true });
    handlers.roomJoined({ roomId: 'ROOM01', playerIndex: 1, reconnectToken: 'token-bob' });
    handlers.gameStart({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
    });

    assert.strictEqual(rt.getOnlineState().isRoomHost, false);
    const storedGameStart = JSON.parse(rt.localStorage.getItem('onlineGameStart'));
    assert.strictEqual(storedGameStart.hostPlayerIndex, 0);
});

runTest('joinRoom は createRoom 失敗後に残った host 状態を落とす', () => {
    const rt = loadOnlineRuntime();
    rt.document.getElementById('playerNameInput').value = 'Bob';
    rt.document.getElementById('roomIdInput').value = 'room01';
    rt.setOnlineState({ isRoomHost: true });

    rt.joinRoom();

    assert.strictEqual(rt.getOnlineState().isRoomHost, false);
    const emitted = rt.getSocketEmits().pop();
    assert.strictEqual(emitted.name, 'joinRoom');
    assert.strictEqual(emitted.payload.roomId, 'ROOM01');
});

runTest('hostChanged 後のホスト復元payloadは新ホストindexを保存する', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    const handlers = rt.getSocketHandlers();

    handlers.roomJoined({ roomId: 'ROOM01', playerIndex: 1, reconnectToken: 'token-bob' });
    handlers.gameStart({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
    });

    handlers.hostChanged({ newHostPlayerIndex: 1 });
    const storedGameStart = JSON.parse(rt.localStorage.getItem('onlineGameStart'));
    assert.strictEqual(storedGameStart.hostPlayerIndex, 1);

    rt._tryRestoreRoom();

    const emitted = rt.getSocketEmits().filter(e => e.name === 'recreateRoom').pop();
    assert.ok(emitted);
    assert.strictEqual(emitted.payload.playerIndex, 1);
    assert.strictEqual(emitted.payload.gameStartPayload.hostPlayerIndex, 1);
});

runTest('rejoinData は hostPlayerIndex 欠落時に非ホスト扱いへ倒す', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineState({ isRoomHost: true });
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initSocket();
    const handlers = rt.getSocketHandlers();

    handlers.rejoinData({
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: CARDS.map(c => c.name),
            enabledLandmarks: Player.landmarkNames(),
        },
        stateSnapshot: null,
        actionLog: [],
        playerIndex: 0,
    });

    assert.strictEqual(rt.getOnlineState().isRoomHost, false);
});

runTest('initSocket gameStart はバージョン不一致時だけ警告ログを追加する', () => {
    const rt = loadOnlineRuntime();
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
        versions: ['same', 'same'],
    });
    assert.ok(!rt.getGame().log.some(entry => entry.message.includes('バージョン不一致')));

    handlers.gameStart({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(c => c.name),
        enabledLandmarks: Player.landmarkNames(),
        versions: ['old', 'new'],
    });

    const mismatchLog = rt.getGame().log.find(entry => entry.message.includes('バージョン不一致'));
    assert.ok(mismatchLog);
    assert.strictEqual(mismatchLog.type, LOG_TYPES.SYSTEM);
    assert.ok(mismatchLog.message.includes('全員アプリをリロードしてください'));
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
        shopStock: { 麦畑: 4, [CARD_IDS.BAKERY]: 5 },
    });
    const g = rt.getGame();
    assert.strictEqual(g.currentPlayerIndex, 1);
    assert.strictEqual(g.players[0].coins, 7);
    assert.strictEqual(g.players[0].dormantCards.length, 1);
    assert.strictEqual(rt.getShopStock()['麦畑'], 4);
    assert.strictEqual(rt.getShopStock()['パン屋'], 5);
    assert.strictEqual(g.turnCount, 4);
});

runTest('restoreOnlineSnapshot は古いsnapshotでcardsが欠落しても落ちない', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initOnlineGame(['Alice', 'Bob'], null, [0, 1]);
    const beforeCards = rt.getGame().players[0].cards.length;

    rt.restoreOnlineSnapshot({
        players: [
            {
                name: 'Alice',
                coins: 5,
                landmarks: { 駅: true },
            },
        ],
        currentPlayerIndex: 0,
        shopStock: {},
    });

    const g = rt.getGame();
    assert.strictEqual(g.players[0].coins, 5);
    assert.strictEqual(g.players[0].cards.length, beforeCards);
    assert.strictEqual(g.players[0].landmarks['駅'], true);
    assert.strictEqual(g.players[0].landmarks['ショッピングモール'], false);
    assert.strictEqual(g.players[0].landmarks['空港'], false);
});

runTest('_readOnlineActionLog は不正形を空配列へ正規化する', () => {
    const rt = loadOnlineRuntime();
    rt.localStorage.setItem('onlineActionLog', JSON.stringify({ action: 'nextTurn', data: {} }));
    assert.strictEqual(rt._readOnlineActionLog().length, 0);

    rt.localStorage.setItem('onlineActionLog', JSON.stringify([null, { data: {} }, { action: 'nextTurn' }]));
    const log = rt._readOnlineActionLog();
    assert.strictEqual(log.length, 1);
    assert.strictEqual(log[0].action, 'nextTurn');
    assert.strictEqual(Object.keys(log[0].data).length, 0);
});

runTest('restore bundle read は current room の scoped copy を legacy より優先する', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineState({ myRoomId: 'ROOM02' });
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({ roomMarker: 'legacy', actionSeq: 1 }));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([{ action: 'nextTurn', seq: 1 }]));
    rt.localStorage.setItem('onlineStateSnapshot', JSON.stringify({ roomMarker: 'legacy', actionSeq: 1 }));
    rt.localStorage.setItem(rt._onlineRoomStorageKey('onlineGameStart', 'ROOM02'), JSON.stringify({ roomMarker: 'scoped', actionSeq: 8 }));
    rt.localStorage.setItem(rt._onlineRoomStorageKey('onlineActionLog', 'ROOM02'), JSON.stringify([{ action: 'buildLandmark', data: { name: '駅' }, seq: 8 }]));
    rt.localStorage.setItem(rt._onlineRoomStorageKey('onlineStateSnapshot', 'ROOM02'), JSON.stringify({ roomMarker: 'scoped', actionSeq: 7 }));

    assert.strictEqual(rt._readOnlineGameStartPayload().roomMarker, 'scoped');
    assert.strictEqual(rt._readOnlineStateSnapshot().roomMarker, 'scoped');
    const actionLog = rt._readOnlineActionLog();
    assert.strictEqual(actionLog.length, 1);
    assert.strictEqual(actionLog[0].action, 'buildLandmark');
    assert.strictEqual(actionLog[0].seq, 8);
});

runTest('restore bundle read は壊れた scoped copy を捨てて legacy へfallbackする', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineState({ myRoomId: 'ROOM02' });
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({ roomMarker: 'legacy-start', actionSeq: 1 }));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([{ action: 'nextTurn', seq: 1 }]));
    rt.localStorage.setItem('onlineStateSnapshot', JSON.stringify({ roomMarker: 'legacy-snapshot', actionSeq: 1 }));
    rt.localStorage.setItem(rt._onlineRoomStorageKey('onlineGameStart', 'ROOM02'), '{broken');
    rt.localStorage.setItem(rt._onlineRoomStorageKey('onlineActionLog', 'ROOM02'), '{broken');
    rt.localStorage.setItem(rt._onlineRoomStorageKey('onlineStateSnapshot', 'ROOM02'), '{broken');

    assert.strictEqual(rt._readOnlineGameStartPayload().roomMarker, 'legacy-start');
    assert.strictEqual(rt._readOnlineStateSnapshot().roomMarker, 'legacy-snapshot');
    const actionLog = rt._readOnlineActionLog();
    assert.strictEqual(actionLog.length, 1);
    assert.strictEqual(actionLog[0].action, 'nextTurn');
});

runTest('restore bundle read は scoped copy がなければ legacy へfallbackする', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineState({ myRoomId: 'ROOM02' });
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({ roomMarker: 'legacy', actionSeq: 1 }));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([{ action: 'nextTurn', seq: 1 }]));
    rt.localStorage.setItem('onlineStateSnapshot', JSON.stringify({ roomMarker: 'legacy', actionSeq: 1 }));

    assert.strictEqual(rt._readOnlineGameStartPayload().roomMarker, 'legacy');
    assert.strictEqual(rt._readOnlineStateSnapshot().roomMarker, 'legacy');
    const actionLog = rt._readOnlineActionLog();
    assert.strictEqual(actionLog.length, 1);
    assert.strictEqual(actionLog[0].action, 'nextTurn');
});

runTest('_saveActionLog はサーバー署名snapshot受信時にsnapshot以前のactionLogをpruneする', () => {
    const rt = loadOnlineRuntime();
    rt.setOnlineState({ myRoomId: 'ROOM01' });
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({ actionSeq: 0 }));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([
        { action: 'nextTurn', data: {}, seq: 199, playerIndex: 0, restoreActionAudit: { schemaVersion: 1, roomId: 'ROOM01', signed: true } },
        { action: 'nextTurn', data: {}, seq: 200, playerIndex: 1, restoreActionAudit: { schemaVersion: 1, roomId: 'ROOM01', signed: true } },
    ]));
    const stateSnapshot = { actionSeq: 201, currentPlayerIndex: 1, players: [], shopStock: {} };
    const restoreAudit = { schemaVersion: 1, roomId: 'ROOM01', signed: true };

    rt._saveActionLog('nextTurn', {}, { seq: 201, playerIndex: 0, stateSnapshot, restoreAudit });

    const log = rt._readOnlineActionLog();
    assert.strictEqual(log.length, 0);
    assert.deepStrictEqual(JSON.parse(rt.localStorage.getItem('onlineStateSnapshot')), stateSnapshot);
    assert.deepStrictEqual(JSON.parse(rt.localStorage.getItem('onlineRestoreAudit')), restoreAudit);
    assert.strictEqual(JSON.parse(rt.localStorage.getItem('onlineGameStart')).actionSeq, 201);
});

runTest('_saveActionLog はしきい値超過時も署名済みactionLogを維持してsnapshotを補助保存する', () => {
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
    assert.strictEqual(log.length, 201);
    assert.strictEqual(log[200].action, 'buildLandmark');
    assert.strictEqual(snapshot.players[0].coins, 9);
    assert.strictEqual(rt.localStorage.getItem('onlineRestoreAudit'), null);
});

runTest('_saveActionLog は restore bundle 更新を room-scoped key にも保存する', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.setOnlineState({ myRoomId: 'ROOM01' });
    rt.initOnlineGame(['Alice', 'Bob'], null, [0, 1]);
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({ actionSeq: 0 }));
    const game = rt.getGame();
    game.currentPlayer().coins = 9;
    for (let i = 1; i <= 200; i++) {
        rt._saveActionLog('nextTurn', {}, { seq: i, playerIndex: 0 });
    }
    rt._saveActionLog('buildLandmark', { name: '駅' }, { seq: 201, playerIndex: 0 });

    const scopedGameStart = JSON.parse(rt.localStorage.getItem(rt._onlineRoomStorageKey('onlineGameStart', 'ROOM01')));
    const scopedActionLog = JSON.parse(rt.localStorage.getItem(rt._onlineRoomStorageKey('onlineActionLog', 'ROOM01')));
    const scopedSnapshot = JSON.parse(rt.localStorage.getItem(rt._onlineRoomStorageKey('onlineStateSnapshot', 'ROOM01')));
    assert.strictEqual(scopedGameStart.actionSeq, 201);
    assert.strictEqual(scopedActionLog.length, 201);
    assert.strictEqual(scopedActionLog[200].seq, 201);
    assert.strictEqual(scopedSnapshot.players[0].coins, 9);
    assert.strictEqual(rt.localStorage.getItem(rt._onlineRoomStorageKey('onlineRestoreAudit', 'ROOM01')), null);
});

runTest('_saveActionLog は未適用の受信actionをsnapshotのactionSeqに含めない', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initOnlineGame(['Alice', 'Bob'], null, [0, 1]);
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({ actionSeq: 0 }));
    for (let i = 1; i <= 200; i++) {
        rt._saveActionLog('nextTurn', {}, { seq: i, playerIndex: 0 });
    }

    rt._saveActionLog('buildLandmark', { name: '駅' }, { seq: 201, playerIndex: 0 });

    const log = rt._readOnlineActionLog();
    const snapshot = JSON.parse(rt.localStorage.getItem('onlineStateSnapshot'));
    const storedGameStart = JSON.parse(rt.localStorage.getItem('onlineGameStart'));
    assert.strictEqual(snapshot.actionSeq, 200);
    assert.strictEqual(log.length, 201);
    assert.strictEqual(log[200].seq, 201);
    assert.strictEqual(storedGameStart.actionSeq, 201);
});

runTest('_saveActionLog は適用済みactionのsnapshot補助保存時もactionLogを維持する', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initOnlineGame(['Alice', 'Bob'], null, [0, 1]);
    const game = rt.getGame();
    game.nextTurn();
    for (let i = 0; i < 200; i++) {
        rt._saveActionLog('rollDice', { forceDice: 1, tunaDice: null });
    }
    rt._saveActionLog('nextTurn', {}, { alreadyApplied: true });
    const log = rt._readOnlineActionLog();
    const snapshot = JSON.parse(rt.localStorage.getItem('onlineStateSnapshot'));
    assert.strictEqual(log.length, 201);
    assert.strictEqual(log[200].action, 'nextTurn');
    assert.strictEqual(snapshot.currentPlayerIndex, game.currentPlayerIndex);
    assert.strictEqual(snapshot.turnCount, game.turnCount);
});

runTest('buildOnlineSnapshot は server mirror snapshot と主要キーが一致する', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initOnlineGame(['Alice', 'Bob'], null, [0, 1]);

    const clientSnapshot = rt.buildOnlineSnapshot();
    const serverSnapshot = serializeMirrorState(rt.getGame(), Object.assign({}, rt.getShopStock()));

    assert.deepStrictEqual(Object.keys(clientSnapshot).sort(), Object.keys(serverSnapshot).sort());
    assert.deepStrictEqual(Object.keys(clientSnapshot.players[0]).sort(), Object.keys(serverSnapshot.players[0]).sort());
});

runTest('client apply と server mirror は同じaction列から同じsnapshotへ収束する', () => {
    const runtime = loadOnlineRuntime();
    runtime.setEnabledCards(new Set(runtime.CARDS.map(card => card.name)));
    runtime.setEnabledLandmarks(new Set(runtime.Player.landmarkNames()));
    runtime.initOnlineGame(['Alice', 'Bob'], null, [0, 1]);

    const serverGame = new runtime.GameManager(2);
    serverGame.players[0].name = 'Alice';
    serverGame.players[1].name = 'Bob';
    const serverStock = Object.assign({}, runtime.getShopStock());
    const actions = [
        { action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] } },
        { action: 'buildCard', data: { cardName: '麦畑' } },
        { action: 'nextTurn', data: {} },
        { action: 'rollDice', data: { forceDice: 2, tunaDice: [1, 1] } },
        { action: 'buildCard', data: { cardName: 'パン屋' } },
    ];

    for (const entry of actions) {
        runtime.applyAction(entry.action, entry.data);
        assert.strictEqual(
            applyActionToMirror(serverGame, serverStock, entry.action, entry.data, runtime.createCardByName),
            true,
            entry.action
        );
    }

    const clientSnapshot = JSON.parse(JSON.stringify(runtime.buildOnlineSnapshot()));
    const serverSnapshot = JSON.parse(JSON.stringify(serializeMirrorState(serverGame, serverStock)));
    assert.deepStrictEqual(clientSnapshot, serverSnapshot);
});

runTest('online snapshot は build/restore/build でroundtripできる', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initOnlineGame(['Alice', 'Bob'], null, [0, 1]);
    const game = rt.getGame();
    game.players[0].coins = 8;
    game.players[0].cards.push(createCardByName('カフェ'));
    game.players[0].dormantCards = [game.players[0].cards[1]];
    game.players[0].landmarks['駅'] = true;
    game.players[0].itVentureCoins = 2;
    game.players[0].hasYakusho = false;
    game.currentPlayerIndex = 1;
    game.phase = GAME_PHASES.PENDING;
    game.log = [{ type: LOG_TYPES.SYSTEM, message: 'roundtrip' }];
    game.lastDiceResult = 10;
    game.lastDice1 = 4;
    game.lastDice2 = 6;
    game.builtThisTurn = true;
    game.pendingTV = 1;
    game.usedReroll = true;
    game.pendingTunaDice = [3, 4];
    game.turnCount = 7;
    game.hadAmusementParkAtRoll = true;
    rt.getShopStock()['カフェ'] = 5;
    rt.setUndoState({
        playerCoins: [4, 3],
        playerCardNames: [['麦畑'], ['麦畑']],
        playerDormantIndices: [[], []],
        playerLandmarks: [Object.assign({}, game.players[0].landmarks), Object.assign({}, game.players[1].landmarks)],
        playerItVenture: [0, 0],
        playerHasYakusho: [true, true],
        shopStock: Object.assign({}, rt.getShopStock()),
        builtThisTurn: false,
        log: [],
    });
    const snapshot = rt.buildOnlineSnapshot();

    rt.restoreOnlineSnapshot(snapshot);
    const roundtrip = rt.buildOnlineSnapshot();

    assert.deepStrictEqual(roundtrip, snapshot);
});

runTest('buildOnlineSnapshot は建設後のUndo状態を保持する', () => {
    const rt = loadOnlineRuntime();
    rt.setEnabledCards(new Set(CARDS.map(c => c.name)));
    rt.setEnabledLandmarks(new Set(Player.landmarkNames()));
    rt.initOnlineGame(['Alice', 'Bob'], null, [0, 1]);
    rt.setUndoState({
        playerCoins: [4, 3],
        playerCardNames: [['麦畑'], ['麦畑']],
        playerDormantIndices: [[], []],
        playerLandmarks: [Object.assign({}, rt.getGame().players[0].landmarks), Object.assign({}, rt.getGame().players[1].landmarks)],
        playerItVenture: [0, 0],
        playerHasYakusho: [true, true],
        shopStock: Object.assign({}, rt.getShopStock()),
        builtThisTurn: false,
        log: [],
    });

    const snapshot = rt.buildOnlineSnapshot();

    assert.ok(snapshot.undoState);
    assert.deepStrictEqual(snapshot.undoState.playerCoins, [4, 3]);
});

runTest('handleAppError は別roomのpending actionを消さない', () => {
    const rt = loadOnlineRuntime();
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        roomId: 'ACTIVE1',
        seq: 3,
        clientActionId: 'active-action',
    }));
    rt.setOnlineState({
        myRoomId: 'STALE1',
        myOriginalPlayerIndex: 0,
        isReconnectingOnline: false,
    });

    rt.handleAppError('古いタブのエラー');

    assert.strictEqual(JSON.parse(rt.localStorage.getItem('onlinePendingAction')).clientActionId, 'active-action');
});

runTest('handleAppError は一般エラーでは現在roomのpending actionを消さない', () => {
    const rt = loadOnlineRuntime();
    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        roomId: 'ROOM01',
        seq: 3,
        clientActionId: 'current-action',
    }));
    rt.setOnlineState({
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        isReconnectingOnline: false,
    });

    rt.handleAppError('現在タブのエラー');

    assert.strictEqual(rt._readPendingOutboundAction().clientActionId, 'current-action');
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

runTest('handleAppError は無効操作時もroomIdなしlegacy pendingを即削除しない', () => {
    const rt = loadOnlineRuntime();
    const emits = [];
    rt.setOnlineState({
        socket: { emit(name, payload) { emits.push({ name, payload }); } },
    });
    vm.runInContext(`
        isOnlineGame = true;
        myRoomId = 'ROOM01';
        myOriginalPlayerIndex = 1;
        myPlayerName = 'Alice';
        reconnectToken = 'token-1';
    `, rt);

    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 1,
        seq: 4,
        clientActionId: 'legacy-roomless-invalid',
    }));

    rt.handleAppError('無効な操作です');

    assert.strictEqual(rt._readPendingOutboundAction().clientActionId, 'legacy-roomless-invalid');
    assert.strictEqual(rt.getOnlineState().isReconnectingOnline, true);
    assert.strictEqual(emits.length, 1);
    assert.strictEqual(emits[0].name, 'rejoinRoom');
});

runTest('handleAppError は無効操作時にオンライン状態を再同期する', () => {
    const rt = loadOnlineRuntime();
    const emits = [];
    rt.setOnlineState({
        socket: { emit(name, payload) { emits.push({ name, payload }); } },
    });
    vm.runInContext(`
        isOnlineGame = true;
        myRoomId = 'ROOM01';
        myOriginalPlayerIndex = 1;
        myPlayerName = 'Alice';
        reconnectToken = 'token-1';
    `, rt);

    rt.localStorage.setItem('onlinePendingAction', JSON.stringify({
        action: 'nextTurn',
        data: {},
        playerIndex: 1,
        roomId: 'ROOM01',
        seq: 4,
        clientActionId: 'invalid-action',
    }));

    rt.handleAppError('無効な操作です');

    assert.strictEqual(rt._readPendingOutboundAction(), null);
    assert.strictEqual(rt.getOnlineState().isReconnectingOnline, true);
    assert.strictEqual(emits.length, 1);
    assert.strictEqual(emits[0].name, 'rejoinRoom');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(emits[0].payload)), {
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token-1',
        clientVersion: 'unknown',
        hostlessRestoreVersion: 1,
    });
});


runTest('live gameAction duplicate is ignored and sequence gap starts rejoin', () => {
    const runtime = loadOnlineRuntime(); runtime.initSocket();
    runtime.setOnlineState({ myRoomId: 'ROOM01', myOriginalPlayerIndex: 0, myPlayerName: 'Alice', reconnectToken: 'token-a' });
    runtime.getSocketHandlers().gameStart({ playerNames: ['Alice', 'Bob'], playerSettings: [{ type: 'human' }, { type: 'human' }], playerOrder: [0, 1], enabledCards: CARDS.map(card => card.name), enabledLandmarks: Player.landmarkNames(), hostPlayerIndex: 0, actionSeq: 0 });
    const handlers = runtime.getSocketHandlers();
    handlers.gameAction({ action: 'nextTurn', data: {}, playerIndex: 1, seq: 1 });
    handlers.gameAction({ action: 'nextTurn', data: {}, playerIndex: 1, seq: 1 });
    assert.strictEqual(runtime._readOnlineActionLog().length, 1);
    handlers.gameAction({ action: 'nextTurn', data: {}, playerIndex: 1, seq: 3 });
    assert.strictEqual(runtime._readOnlineActionLog().length, 1);
    assert.strictEqual(runtime.getOnlineState().isReconnectingOnline, true);
    assert.ok(runtime.getSocketEmits().some(event => event.name === 'rejoinRoom'));
});

runTest('live sequence tracking survives localStorage write failures', () => {
    const runtime = loadOnlineRuntime();
    runtime.initSocket();
    runtime.setOnlineState({ myRoomId: 'ROOM01', myOriginalPlayerIndex: 0, myPlayerName: 'Alice', reconnectToken: 'token-a' });
    const handlers = runtime.getSocketHandlers();
    handlers.gameStart({ playerNames: ['Alice', 'Bob'], playerSettings: [{ type: 'human' }, { type: 'human' }], playerOrder: [0, 1], enabledCards: CARDS.map(card => card.name), enabledLandmarks: Player.landmarkNames(), hostPlayerIndex: 0, actionSeq: 0 });
    runtime.localStorage.setItem = () => { throw new Error('quota exceeded'); };

    handlers.gameAction({ action: 'nextTurn', data: {}, playerIndex: 1, seq: 1 });
    handlers.gameAction({ action: 'nextTurn', data: {}, playerIndex: 1, seq: 2 });

    assert.strictEqual(runtime.getGame().currentPlayerIndex, 0);
    assert.strictEqual(runtime.getOnlineState().isReconnectingOnline, false);
    assert.ok(!runtime.getSocketEmits().some(event => event.name === 'rejoinRoom'));
});

runTest('queued action apply failure preserves the failed event and following events for resync', async () => {
    const runtime = loadOnlineRuntime();
    let resolvePreload;
    runtime.RLModelPortfolio = { preloadEligibleModels() { return new Promise(resolve => { resolvePreload = resolve; }); } };
    runtime.initSocket();
    runtime.setOnlineState({ myRoomId: 'ROOM01', myOriginalPlayerIndex: 0, myPlayerName: 'Alice', reconnectToken: 'token-a' });
    const handlers = runtime.getSocketHandlers();
    handlers.gameStart({ playerNames: ['Alice', 'Bob'], playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'rl', rlModelId: 'fixed-rl' }], playerOrder: [0, 1], enabledCards: CARDS.map(card => card.name), enabledLandmarks: Player.landmarkNames(), hostPlayerIndex: 0, actionSeq: 0 });
    handlers.gameAction({ action: 'nextTurn', data: {}, playerIndex: 0, seq: 1 });
    handlers.gameAction({ action: 'nextTurn', data: {}, playerIndex: 1, seq: 2 });
    vm.runInContext('applyReplayedAction = () => { throw new Error("apply failed"); };', runtime);

    resolvePreload([]);
    await Promise.resolve();

    assert.strictEqual(runtime.getOnlineState().isReconnectingOnline, true);
    assert.strictEqual(runtime.getOnlineRestoreQueue().length, 2);
    assert.ok(runtime.getSocketEmits().some(event => event.name === 'rejoinRoom'));

    handlers.gameAction({ action: 'nextTurn', data: {}, playerIndex: 0, seq: 3 });
    assert.strictEqual(runtime.getOnlineRestoreQueue().length, 3);
});

runTest('duplicate rejoinData preserves events queued by the prior restore generation', () => {
    const runtime = loadOnlineRuntime();
    runtime.RLModelPortfolio = { preloadEligibleModels() { return new Promise(() => {}); } };
    runtime.initSocket();
    const handlers = runtime.getSocketHandlers();
    const payload = {
        gameStartPayload: { schemaVersion: 2, playerNames: ['Alice', 'RL CPU'], playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'rl', rlModelId: 'fixed-rl' }], cpuSpeed: 1500, playerOrder: [0, 1], enabledCards: CARDS.map(card => card.name), enabledLandmarks: Player.landmarkNames(), hostPlayerIndex: 0, hostEpoch: 1, actionSeq: 0 },
        stateSnapshot: null, actionLog: [], playerIndex: 0, hostPlayerIndex: 0, hostEpoch: 1
    };
    handlers.rejoinData(payload);
    handlers.gameAction({ action: 'nextTurn', data: {}, playerIndex: 0, seq: 1 });
    assert.strictEqual(runtime.getOnlineRestoreQueue().length, 1);

    handlers.rejoinData(payload);

    assert.strictEqual(runtime.getOnlineRestoreQueue().length, 1);
});

runTest('pending outbound memory accepts ACK when localStorage writes fail', async () => {
    const runtime = loadOnlineRuntime();
    runtime.initSocket();
    runtime.setOnlineState({ myRoomId: 'ROOM01', myOriginalPlayerIndex: 0, myPlayerName: 'Alice', reconnectToken: 'token-a' });
    const handlers = runtime.getSocketHandlers();
    handlers.gameStart({ playerNames: ['Alice', 'Bob'], playerSettings: [{ type: 'human' }, { type: 'human' }], playerOrder: [0, 1], enabledCards: CARDS.map(card => card.name), enabledLandmarks: Player.landmarkNames(), hostPlayerIndex: 0, actionSeq: 0 });
    await Promise.resolve();
    await Promise.resolve();
    vm.runInContext('game.phase = GAME_PHASES.BUILD;', runtime);
    runtime.localStorage.setItem = () => { throw new Error('quota exceeded'); };
    runtime.sendAction('nextTurn', {});
    const sent = runtime.getSocketEmits().filter(event => event.name === 'gameAction').pop();

    handlers.actionAccepted({ action: 'nextTurn', data: {}, playerIndex: 0, seq: 1, clientActionId: sent.payload.clientActionId });

    assert.strictEqual(runtime.getGame().currentPlayerIndex, 1);
    assert.strictEqual(runtime.getOnlineState().onlineActionInFlight, false);
});

runTest('queued actionAccepted sequence gap keeps quarantine until canonical restore', async () => {
    const runtime = loadOnlineRuntime();
    let resolvePreload;
    runtime.RLModelPortfolio = { preloadEligibleModels() { return new Promise(resolve => { resolvePreload = resolve; }); } };
    runtime.initSocket();
    runtime.setOnlineState({ myRoomId: 'ROOM01', myOriginalPlayerIndex: 0, myPlayerName: 'Alice', reconnectToken: 'token-a' });
    runtime.localStorage.setItem('onlinePendingAction', JSON.stringify({ action: 'nextTurn', data: {}, playerIndex: 0, roomId: 'ROOM01', seq: 2, clientActionId: 'gap-action' }));
    const handlers = runtime.getSocketHandlers();
    handlers.rejoinData({
        gameStartPayload: { schemaVersion: 2, playerNames: ['Alice', 'RL CPU'], playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'rl', rlModelId: 'fixed-rl' }], cpuSpeed: 1500, playerOrder: [0, 1], enabledCards: CARDS.map(card => card.name), enabledLandmarks: Player.landmarkNames(), hostPlayerIndex: 0, hostEpoch: 1, actionSeq: 0 },
        stateSnapshot: null, actionLog: [], playerIndex: 0, hostPlayerIndex: 0, hostEpoch: 1
    });
    handlers.actionAccepted({ action: 'nextTurn', data: {}, playerIndex: 0, seq: 2, clientActionId: 'gap-action' });
    resolvePreload([]);
    await Promise.resolve();
    await Promise.resolve();
    handlers.gameAction({ action: 'nextTurn', data: {}, playerIndex: 0, seq: 1 });

    assert.strictEqual(runtime.getOnlineState().isReconnectingOnline, true);
    assert.strictEqual(runtime.getOnlineRestoreQueue().length, 2);
});

runTest('pending outbound memory is isolated by room', () => {
    const runtime = loadOnlineRuntime();
    runtime.setOnlineState({ myRoomId: 'ROOM-A' });
    runtime.localStorage.setItem('onlinePendingAction', JSON.stringify({ action: 'nextTurn', data: {}, playerIndex: 0, roomId: 'ROOM-A', clientActionId: 'action-a' }));
    assert.strictEqual(runtime._readPendingOutboundAction().clientActionId, 'action-a');

    runtime.setOnlineState({ myRoomId: 'ROOM-B' });
    runtime.localStorage.setItem(runtime._onlineRoomStorageKey('onlinePendingAction', 'ROOM-B'), JSON.stringify({ action: 'nextTurn', data: {}, playerIndex: 1, roomId: 'ROOM-B', clientActionId: 'action-b' }));

    assert.strictEqual(runtime._readPendingOutboundAction().clientActionId, 'action-b');
});

runTest('disconnect during initial RL preload invalidates stale start and reconnects canonically', async () => {
    const runtime = loadOnlineRuntime();
    let resolvePreload;
    runtime.RLModelPortfolio = { preloadEligibleModels() { return new Promise(resolve => { resolvePreload = resolve; }); } };
    runtime.initSocket();
    runtime.setOnlineState({ myRoomId: 'ROOM01', myOriginalPlayerIndex: 0, myPlayerName: 'Alice', reconnectToken: 'token-a' });
    const handlers = runtime.getSocketHandlers();
    handlers.gameStart({ playerNames: ['Alice', 'Bob'], playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'rl', rlModelId: 'fixed-rl' }], playerOrder: [0, 1], enabledCards: CARDS.map(card => card.name), enabledLandmarks: Player.landmarkNames(), hostPlayerIndex: 0, actionSeq: 0 });

    handlers.disconnect();
    handlers.connect();
    resolvePreload([]);
    await Promise.resolve();

    assert.strictEqual(runtime.getGame(), null);
    assert.strictEqual(runtime.getOnlineState().isReconnectingOnline, true);
    assert.ok(runtime.getSocketEmits().some(event => event.name === 'rejoinRoom'));
});

runTest('gameStart queues actions and host changes while RL preload is pending', async () => {
    const runtime = loadOnlineRuntime(); let resolvePreload;
    runtime.RLModelPortfolio = { preloadEligibleModels() { return new Promise(resolve => { resolvePreload = resolve; }); } };
    runtime.initSocket(); runtime.setOnlineState({ myRoomId: 'ROOM01', myOriginalPlayerIndex: 1, myPlayerName: 'Bob', reconnectToken: 'token-b' });
    const handlers = runtime.getSocketHandlers();
    handlers.gameStart({ playerNames: ['Alice', 'Bob'], playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'rl', rlModelId: 'fixed-rl' }], playerOrder: [0, 1], enabledCards: CARDS.map(card => card.name), enabledLandmarks: Player.landmarkNames(), hostPlayerIndex: 0, hostEpoch: 1, actionSeq: 0 });
    handlers.gameAction({ action: 'nextTurn', data: {}, playerIndex: 0, seq: 1 }); handlers.hostChanged({ newHostPlayerIndex: 1, hostEpoch: 2 });
    assert.strictEqual(runtime.getGame(), null); resolvePreload([]); await Promise.resolve();
    assert.ok(runtime.getGame()); assert.strictEqual(runtime._readOnlineActionLog().length, 1);
    assert.strictEqual(runtime._readOnlineGameStartPayload().hostPlayerIndex, 1); assert.strictEqual(runtime.getOnlineState().isRoomHost, true);
});

runTest('rejoinData hydrates canonical build then undo into the exact pre-build client state', async () => {
    const runtime = loadOnlineRuntime();
    runtime.initSocket();
    runtime.setOnlineState({ myRoomId: 'UNDO01', myOriginalPlayerIndex: 1, myPlayerName: 'Bob', reconnectToken: 'token-b' });
    const start = {
        schemaVersion: 2, playerNames: ['Alice', 'Bob'], playerSettings: [{ type: 'human' }, { type: 'human' }],
        playerOrder: [0, 1], enabledCards: CARDS.map(card => card.name), enabledLandmarks: Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'], hostPlayerIndex: 0, actionSeq: 3,
    };
    const stock = Object.fromEntries(CARDS.map(card => [card.name, 6]));
    const undoState = {
        playerCoins: [4, 4],
        playerCardNames: [['麦畑', 'パン屋'], ['麦畑', 'パン屋']],
        playerDormantIndices: [[], []],
        playerLandmarks: [{}, {}],
        playerItVenture: [0, 0],
        playerHasYakusho: [true, true],
        shopStock: stock,
        builtThisTurn: false,
        log: [],
    };
    runtime.getSocketHandlers().rejoinData({
        gameStartPayload: start,
        stateSnapshot: null,
        actionLog: [
            { action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] }, playerIndex: 0, seq: 1 },
            { action: 'buildCard', data: { cardName: '麦畑' }, playerIndex: 0, seq: 2 },
            { action: 'undoBuild', data: { state: undoState }, playerIndex: 0, seq: 3 },
        ],
        acceptedClientActions: [], playerIndex: 1, hostPlayerIndex: 0,
    });
    await Promise.resolve(); await Promise.resolve();
    const snapshot = JSON.parse(JSON.stringify(runtime.buildOnlineSnapshot()));
    assert.deepStrictEqual(snapshot.players.map(player => player.coins), [4, 4]);
    assert.deepStrictEqual(snapshot.players.map(player => player.cards), [['麦畑', 'パン屋'], ['麦畑', 'パン屋']]);
    assert.deepStrictEqual(snapshot.shopStock, stock);
    assert.strictEqual(snapshot.undoState, null);
    assert.strictEqual(snapshot.builtThisTurn, false);
});

runTest('rejoinData hydrates and resolves TV, Business, and IT pending variants', async () => {
    const cases = [
        { field: 'pendingTV', action: 'resolveTV', data: { targetIndex: 1 } },
        { field: 'pendingBusiness', action: 'resolveBusiness', data: { myCard: 0, targetIndex: 1, theirCard: 0 } },
        { field: 'pendingIT', action: 'resolveIT', data: { doSave: false }, queue: false },
    ];
    for (const testCase of cases) {
        const runtime = loadOnlineRuntime();
        runtime.initSocket();
        runtime.setOnlineState({ myRoomId: 'PENDING01', myOriginalPlayerIndex: 0, myPlayerName: 'Alice', reconnectToken: 'token-a' });
        const game = new runtime.GameManager(2);
        runtime.setGame(game);
        for (const card of runtime.CARDS) runtime.getShopStock()[card.name] = 6;
        game.phase = runtime.GAME_PHASES.PENDING;
        game[testCase.field] = testCase.field === 'pendingIT' ? true : 1;
        game.pendingActionQueue = testCase.queue === false ? [] : [{ action: testCase.action, field: testCase.field }];
        const snapshot = runtime.buildOnlineSnapshot();
        snapshot.actionSeq = 5;
        runtime.getSocketHandlers().rejoinData({
            gameStartPayload: {
                schemaVersion: 2, playerNames: ['Alice', 'Bob'], playerSettings: [{ type: 'human' }, { type: 'human' }],
                playerOrder: [0, 1], enabledCards: runtime.CARDS.map(card => card.name), enabledLandmarks: runtime.Player.landmarkNames(),
                reconnectTokenHashes: ['hash-a', 'hash-b'], hostPlayerIndex: 0, actionSeq: 5,
            },
            stateSnapshot: snapshot, actionLog: [], acceptedClientActions: [], playerIndex: 0, hostPlayerIndex: 0,
        });
        await Promise.resolve(); await Promise.resolve();
        assert.strictEqual(runtime.getGame().phase, runtime.GAME_PHASES.PENDING);
        assert.strictEqual(runtime.getGame()[testCase.field], testCase.field === 'pendingIT' ? true : 1);
        runtime.getSocketHandlers().gameAction({ action: testCase.action, data: testCase.data, playerIndex: 0, seq: 6 });
        assert.ok(!runtime.getGame()[testCase.field], testCase.action + ' consumes restored pending state');
        assert.strictEqual(runtime._readOnlineActionLog().slice(-1)[0].seq, 6);
    }
});

runTest('two independent online runtimes converge after one client misses a live action and rejoins', async () => {
    const runtimes = [loadOnlineRuntime(), loadOnlineRuntime()];
    const start = {
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: CARDS.map(card => card.name),
        enabledLandmarks: Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
    };
    runtimes.forEach((runtime, index) => {
        runtime.initSocket();
        runtime.setOnlineState({
            myRoomId: 'MULTI01',
            myOriginalPlayerIndex: index,
            myPlayerName: start.playerNames[index],
            reconnectToken: 'token-' + index,
        });
        runtime.getSocketHandlers().gameStart(start);
    });
    await Promise.resolve();
    await Promise.resolve();

    const firstData = { forceDice: 1, tunaDice: [1, 1] };
    runtimes[0].sendAction('rollDice', firstData);
    const firstSent = runtimes[0].getSocketEmits().filter(event => event.name === 'gameAction').pop();
    const first = { action: 'rollDice', data: firstData, playerIndex: 0, seq: 1, clientActionId: firstSent.payload.clientActionId };
    runtimes[0].getSocketHandlers().actionAccepted(first);
    runtimes[1].getSocketHandlers().gameAction(first);
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(runtimes[0].buildOnlineSnapshot())),
        JSON.parse(JSON.stringify(runtimes[1].buildOnlineSnapshot()))
    );

    runtimes[0].sendAction('nextTurn', {});
    const secondSent = runtimes[0].getSocketEmits().filter(event => event.name === 'gameAction').pop();
    const second = { action: 'nextTurn', data: {}, playerIndex: 0, seq: 2, clientActionId: secondSent.payload.clientActionId };
    runtimes[0].getSocketHandlers().actionAccepted(second);
    assert.notStrictEqual(runtimes[0].getGame().currentPlayerIndex, runtimes[1].getGame().currentPlayerIndex);

    const restoredStart = Object.assign({}, start, { actionSeq: 2 });
    runtimes[1].getSocketHandlers().rejoinData({
        gameStartPayload: restoredStart,
        stateSnapshot: null,
        actionLog: [first, second],
        acceptedClientActions: [],
        playerIndex: 1,
        hostPlayerIndex: 0,
        hostEpoch: 0,
    });
    await Promise.resolve();
    await Promise.resolve();

    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(runtimes[1].buildOnlineSnapshot())),
        JSON.parse(JSON.stringify(runtimes[0].buildOnlineSnapshot()))
    );
    assert.strictEqual(runtimes[1]._readOnlineActionLog().slice(-1)[0].seq, 2);
});

runTest('restore event queue は上限超過時に破棄して再同期する', () => {
    const runtime = loadOnlineRuntime();
    runtime.RLModelPortfolio = { preloadEligibleModels() { return new Promise(() => {}); } };
    runtime.initSocket();
    runtime.setOnlineState({ myRoomId: 'ROOM01', myOriginalPlayerIndex: 0, myPlayerName: 'Alice', reconnectToken: 'token-a' });
    const handlers = runtime.getSocketHandlers();
    handlers.rejoinData({
        gameStartPayload: { schemaVersion: 2, playerNames: ['Alice', 'RL CPU'], playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'rl', rlModelId: 'fixed-rl' }], cpuSpeed: 1500, playerOrder: [0, 1], enabledCards: CARDS.map(card => card.name), enabledLandmarks: Player.landmarkNames(), hostPlayerIndex: 0, hostEpoch: 1, actionSeq: 0 },
        stateSnapshot: null, actionLog: [], playerIndex: 0, hostPlayerIndex: 0, hostEpoch: 1
    });
    for (let seq = 1; seq <= 257; seq++) {
        handlers.gameAction({ action: 'nextTurn', data: {}, playerIndex: 0, seq });
    }
    assert.strictEqual(runtime.getOnlineRestoreQueue().length, 0);
    assert.strictEqual(runtime.getOnlineState().isReconnectingOnline, true);
    assert.ok(runtime.getSocketEmits().some(event => event.name === 'rejoinRoom'));
});

if (process.exitCode) {
    throw new Error('onlineテストで失敗が発生しました');
}
