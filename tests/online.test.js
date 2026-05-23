const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createStorage, loadScripts, loadScript, runTest } = require('./helpers/test-utils');
const { serializeMirrorState } = require('../server');
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
        function setTimeout(handler, ms) {
            timeoutHandlers.push({ handler, ms });
            return timeoutHandlers.length;
        }
        function clearTimeout(id) {
            if (Number.isInteger(id) && timeoutHandlers[id - 1]) timeoutHandlers[id - 1].cleared = true;
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
        function restoreUndoSnapshot(state) { game = state.game; }
        function updateResumeButton() {}
        let io;
        if (!__onlineRuntimeOptions.withoutIo) {
            io = () => ({
                on(name, handler) { socketHandlers[name] = handler; },
                emit(name, payload) { socketEmits.push({ name, payload }); },
                disconnect() { socketDisconnected = true; },
            });
        }
        const alert = () => {};
        const showNotice = () => {};
    `, context);

    // online.js をロード
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
        this.setEnabledCards = (s) => { enabledCards = s; };
        this.setEnabledLandmarks = (s) => { enabledLandmarks = s; };
        this.getStatsResetCount = () => statsResetCount;
        this.getRenderCount = () => renderCount;
        this.getScheduleCount = () => scheduleCount;
        this.getSocketHandlers = () => socketHandlers;
        this.getSocketEmits = () => socketEmits;
        this.getSocketDisconnected = () => socketDisconnected;
        this.getUndoState = () => undoState;
        this.setUndoState = (value) => { undoState = value; };
        this.applyAction = applyAction;
        this.APP_ERROR_EVENT = APP_ERROR_EVENT;
        this.getClientVersion = getClientVersion;
        this.renderOnlinePlayerSettings = renderOnlinePlayerSettings;
        this.setOnlineSelectedCount = (value) => { onlineSelectedCount = value; };
        this.setOnlinePlayerSettings = (value) => { onlinePlayerSettings = value; };
        this._saveActionLog = _saveActionLog;
        this._readOnlineActionLog = _readOnlineActionLog;
        this._readPendingOutboundAction = _readPendingOutboundAction;
        this._onlineRestoreRank = _onlineRestoreRank;
        this._tryRestoreRoom = _tryRestoreRoom;
        this._canResendPendingOutboundAction = _canResendPendingOutboundAction;
        this._handleOnlineActionTimeout = _handleOnlineActionTimeout;
        this.getTimeoutHandlers = () => timeoutHandlers;
        this.buildOnlineSnapshot = buildOnlineSnapshot;
        this.handleAppError = handleAppError;
        this.sendAction = sendAction;
        this.restoreOnlineSnapshot = restoreOnlineSnapshot;
        this.initOnlineGame = initOnlineGame;
        this.initSocket = initSocket;
        this.joinRoom = joinRoom;
        this.setOnlineState = (v) => {
            if (typeof v.socket !== 'undefined') socket = v.socket;
            if (typeof v.isReconnectingOnline !== 'undefined') isReconnectingOnline = v.isReconnectingOnline;
            if (typeof v.isRoomHost !== 'undefined') isRoomHost = v.isRoomHost;
            if (typeof v.onlineActionInFlight !== 'undefined') onlineActionInFlight = v.onlineActionInFlight;
            if (typeof v.myRoomId !== 'undefined') myRoomId = v.myRoomId;
            if (typeof v.myOriginalPlayerIndex !== 'undefined') myOriginalPlayerIndex = v.myOriginalPlayerIndex;
            if (typeof v.myPlayerName !== 'undefined') myPlayerName = v.myPlayerName;
            if (typeof v.reconnectToken !== 'undefined') reconnectToken = v.reconnectToken;
        };
        this.getOnlineState = () => ({ socket, isReconnectingOnline, isRoomHost, onlineActionInFlight });
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

runTest('getClientVersion はindexへ注入されたビルドハッシュを使う', () => {
    const localRt = loadOnlineRuntime();
    assert.strictEqual(localRt.getClientVersion(), 'unknown');

    localRt.window.MACHIKORO_CLIENT_VERSION = 'build-123';

    assert.strictEqual(localRt.getClientVersion(), 'build-123');
});

runTest('initSocket はSocket.IO script未読込時に状態を変更しない', () => {
    const localRt = loadOnlineRuntime({ withoutIo: true });

    localRt.initSocket();

    assert.strictEqual(localRt.getOnlineState().socket, null);
    assert.deepStrictEqual(Object.keys(localRt.getSocketHandlers()), []);
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
        playerIndex: 0,
        hostPlayerIndex: 0,
    });

    assert.strictEqual(rt._readPendingOutboundAction(), null);
    assert.strictEqual(rt.getSocketEmits().length, beforeEmitCount);
    assert.strictEqual(rt.getGame().currentPlayerIndex, 1);
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

runTest('rejoinData は共通fixtureの最大 actionSeq を canonical 値として保存する', () => {
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

runTest('_onlineRestoreRank は共通fixtureの最大 actionSeq を復元rankに使う', () => {
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

    handlers.actionAccepted({ action: 'undoBuild', data: { state: { game: serverGame } } });

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

    rt.getSocketHandlers().actionAccepted({ action: 'nextTurn', data: {} });

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
    });
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

    rt.getSocketHandlers().actionAccepted({ action: 'nextTurn', data: {}, playerIndex: 0 });

    assert.strictEqual(rt._readPendingOutboundAction(), null);
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

runTest('_tryRestoreRoom は未ackアクションを復元actionLogへ含める', () => {
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
    assert.strictEqual(emitted.payload.actionLog.length, 2);
    assert.strictEqual(emitted.payload.actionLog[1].action, 'nextTurn');
    assert.strictEqual(emitted.payload.actionLog[1].playerIndex, 0);
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
    assert.strictEqual(emitted.payload.actionLog.length, 1);
    assert.strictEqual(emitted.payload.actionLog[0].action, 'nextTurn');
    assert.strictEqual(rt._readPendingOutboundAction().action, 'nextTurn');
});

runTest('_tryRestoreRoom は同内容の過去ログがあっても未ackアクションを落とさない', () => {
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
    assert.strictEqual(emitted.payload.actionLog.length, 2);
    assert.strictEqual(emitted.payload.actionLog[1].action, 'nextTurn');
    assert.strictEqual(typeof emitted.payload.actionLog[1].clientActionId, 'string');
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
    assert.strictEqual(log.length, 1);
    assert.strictEqual(log[0].seq, 201);
    assert.strictEqual(storedGameStart.actionSeq, 201);
});

runTest('_saveActionLog は適用済みactionの圧縮時に同じactionを二重保存しない', () => {
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
    assert.strictEqual(log.length, 0);
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

    rt.handleAppError('無効な操作です');

    assert.strictEqual(rt.getOnlineState().isReconnectingOnline, true);
    assert.strictEqual(emits.length, 1);
    assert.strictEqual(emits[0].name, 'rejoinRoom');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(emits[0].payload)), {
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token-1',
    });
});

if (process.exitCode) {
    throw new Error('onlineテストで失敗が発生しました');
}
