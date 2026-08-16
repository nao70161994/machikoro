'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const OnlineLobbyStartRuntime = require('../js/onlineLobbyStartRuntime');
const OnlineRoomShare = require('../js/onlineRoomShare');
const { runTest } = require('./helpers/test-utils');

function startPayload(overrides = {}) {
    return {
        playerNames: ['Alice', 'CPU'],
        playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'normal' }],
        cpuSpeed: 1200,
        playerOrder: [0, 1],
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        versions: ['v1', 'v1'],
        reconnectTokenHashes: ['a', ''],
        hostPlayerIndex: 0,
        hostEpoch: 2,
        actionSeq: 4,
        gameGeneration: 3,
        hostlessRestoreCapabilities: null,
        hostlessRestoreGeneration: 1,
        hostlessRestoreCount: 2,
        gameSchema: { actionVersion: 1, snapshotVersion: 1 },
        ...overrides,
    };
}

function createHarness(options = {}) {
    const calls = [];
    let generation = 0;
    const game = { addLog: (...args) => calls.push(['addLog', ...args]) };
    const handlers = { gameAction() {}, actionAccepted() {}, hostChanged() {} };
    const runtime = OnlineLobbyStartRuntime.createRuntime({
        abortRestore: (...args) => calls.push(['abortRestore', ...args]),
        acceptRoom: value => calls.push(['acceptRoom', value]),
        acceptSchema: schema => { calls.push(['acceptSchema', schema]); return options.schemaAccepted !== false; },
        applyHostPayload(payload, hostPlayerIndex, hostEpoch) {
            calls.push(['applyHostPayload', payload, hostPlayerIndex, hostEpoch]);
            return { ...payload, hostEpoch };
        },
        clearHostlessState: () => calls.push(['clearHostlessState']),
        clearPending: () => calls.push(['clearPending']),
        clearRejoinRetry: () => calls.push(['clearRejoinRetry']),
        clearRestoreBundleIncomplete: () => calls.push(['clearRestoreBundleIncomplete']),
        clearRestoreEventQueue: () => calls.push(['clearRestoreEventQueue']),
        clearRestoreQuarantine: () => calls.push(['clearRestoreQuarantine']),
        console: { error: error => calls.push(['consoleError', error.message]) },
        defaultLandmarks: () => { calls.push(['defaultLandmarks']); return ['役所']; },
        finishLobbyRequest: kind => calls.push(['finishLobbyRequest', kind]),
        flushRestoreEvents: (...args) => { calls.push(['flushRestoreEvents', ...args]); return options.flushed !== false; },
        focusGame: () => calls.push(['focusGame']),
        getGame: () => game,
        getRestoreEventHandlers: () => { calls.push(['getRestoreEventHandlers']); return handlers; },
        getRestoreGeneration: () => { calls.push(['getRestoreGeneration']); return generation; },
        getSession: () => ({
            myRoomId: 'ROOM01',
            isRoomHost: options.isRoomHost === true,
            myOriginalPlayerIndex: Number.isInteger(options.myPlayerIndex) ? options.myPlayerIndex : 0,
        }),
        incrementRestoreGeneration: () => { generation++; calls.push(['incrementRestoreGeneration', generation]); return generation; },
        initGame: (...args) => calls.push(['initGame', ...args]),
        logTypes: { SYSTEM: 'system' },
        notifyLifecycleStart: () => calls.push(['notifyLifecycleStart']),
        observeReconnect: event => calls.push(['observeReconnect', event]),
        preloadModels: (...args) => { calls.push(['preloadModels', ...args]); return options.preload || null; },
        reconnectEvents: { GAME_ACTIVATED: 'game-activated' },
        removeRestoreItem: key => calls.push(['removeRestoreItem', key]),
        replaceActionSequence: value => { calls.push(['replaceActionSequence', value]); return value; },
        replaceEnabledCards: values => calls.push(['replaceEnabledCards', values]),
        replaceEnabledLandmarks: values => calls.push(['replaceEnabledLandmarks', values]),
        resetReconnectCompletion: () => calls.push(['resetReconnectCompletion']),
        resetUiLocks: reason => calls.push(['resetUiLocks', reason]),
        roomShare: OnlineRoomShare,
        restoreKeys: { gameStart: 'game-start', stateSnapshot: 'snapshot', actionLog: 'log' },
        restoreSchemaVersion: 2,
        saveSession: () => calls.push(['saveSession']),
        setActionFlight: value => calls.push(['setActionFlight', value]),
        setCpuSpeed: value => calls.push(['setCpuSpeed', value]),
        setHostState: value => calls.push(['setHostState', value]),
        setOnline: value => calls.push(['setOnline', value]),
        setReconnectFlag: value => calls.push(['setReconnectFlag', value]),
        setSchema: value => calls.push(['setSchema', value]),
        renderWaitingLobby: (...values) => calls.push(['renderWaitingLobby', ...values]),
        setStatusText: value => calls.push(['setStatusText', value]),
        showGame: () => calls.push(['showGame']),
        startRestore: () => calls.push(['startRestore']),
        writeRestoreJson: (key, value) => {
            calls.push(['writeRestoreJson', key, value]);
            if (options.storageError) throw new Error('storage failed');
        },
    });
    return {
        calls,
        game,
        handlers,
        runtime,
        setGeneration: value => { generation = value; },
    };
}

runTest('online lobby start runtimeはroom作成・参加・一覧を同じsession境界へ反映する', () => {
    const harness = createHarness();
    harness.runtime.handleRoomCreated({
        roomId: 'ROOM01', playerIndex: 0, reconnectToken: 'token-a',
    });
    assert.deepStrictEqual(harness.calls.slice(0, 6).map(call => call[0]), [
        'finishLobbyRequest', 'clearRejoinRetry', 'setReconnectFlag',
        'acceptRoom', 'saveSession', 'renderWaitingLobby',
    ]);
    assert.deepStrictEqual(harness.calls[3][1], {
        playerIndex: 0, roomId: 'ROOM01', reconnectToken: 'token-a',
    });
    assert.strictEqual(harness.calls[5][1], 'ルーム ROOM01 を作成しました。参加者を待っています。');
    assert.ok(harness.calls[5][2].includes('プレイヤーを待っています'));
    assert.ok(harness.calls[5][2].includes('data-ui-action="copyOnlineRoomId"'));
    assert.ok(harness.calls[5][2].includes('この6文字を参加者に共有してください'));

    harness.calls.length = 0;
    harness.runtime.handleRoomJoined({
        roomId: 'ROOM01', playerIndex: 1, reconnectToken: 'token-b',
    });
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'finishLobbyRequest', 'clearRejoinRetry', 'setReconnectFlag',
        'acceptRoom', 'saveSession', 'setStatusText',
    ]);
    assert.strictEqual(harness.calls[5][1], 'ルーム ROOM01 に参加しました！');

    harness.calls.length = 0;
    harness.runtime.handlePlayerList(['Alice', '待機中...']);
    assert.strictEqual(harness.calls[0][0], 'renderWaitingLobby');
    assert.strictEqual(harness.calls[0][1], 'ルーム ROOM01。2枠中1人が参加しています。');
    assert.ok(harness.calls[0][2].includes('参加枠（2枠）: Alice、待機中...'));
    assert.ok(harness.calls[0][2].includes('参加枠が揃い、全員が準備完了になると自動開始します'));
    assert.ok(harness.calls[0][2].includes('data-ui-action="copyOnlineRoomId"'));
});

runTest('online lobby start runtimeはhostへ参加者管理metadataを渡す', () => {
    const harness = createHarness({ isRoomHost: true, myPlayerIndex: 0 });
    harness.runtime.handlePlayerList(['Alice', 'Bob'], {
        hostPlayerIndex: 0,
        participants: [
            { index: 0, name: 'Alice', connected: true, ready: false },
            { index: 1, name: 'Bob', connected: true, ready: true },
        ],
        setupSummary: {
            playerSlots: ['人間', '人間'],
            cpuSpeed: 1500,
            enabledCards: ['麦畑', 'パン屋'],
            enabledLandmarks: ['駅'],
            marketRule: 'standard',
        },
    });
    assert.ok(harness.calls[0][2].includes('removeOnlineLobbyPlayer'));
    assert.ok(harness.calls[0][2].includes('data-player-index="1"'));
    assert.ok(harness.calls[0][2].includes('Alice（ホスト・あなた）'));
    assert.ok(harness.calls[0][2].includes('data-ui-action="setOnlineLobbyReady" data-ready="true"'));
    assert.ok(harness.calls[0][2].includes('対戦設定'));
    assert.ok(harness.calls[0][2].includes('2人（人間2・CPU0）'));
    assert.ok(harness.calls[0][2].includes('麦畑、パン屋'));
});

runTest('online game start runtimeはschemaからactive gameまで既存effect順を維持する', () => {
    const harness = createHarness();
    const payload = startPayload();
    harness.runtime.handle(payload);
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'acceptSchema', 'setSchema', 'clearRejoinRetry', 'clearHostlessState',
        'clearRestoreQuarantine', 'incrementRestoreGeneration', 'startRestore',
        'clearRestoreEventQueue', 'applyHostPayload', 'preloadModels',
        'getRestoreGeneration', 'resetReconnectCompletion', 'setOnline', 'setHostState',
        'setCpuSpeed', 'replaceEnabledCards', 'replaceEnabledLandmarks',
        'writeRestoreJson', 'removeRestoreItem', 'writeRestoreJson',
        'clearRestoreBundleIncomplete', 'clearPending',
        'saveSession', 'resetUiLocks', 'showGame', 'initGame', 'focusGame', 'notifyLifecycleStart',
        'replaceActionSequence', 'getRestoreEventHandlers', 'flushRestoreEvents',
        'observeReconnect',
    ]);
    const built = harness.calls[8][1];
    assert.strictEqual(built.schemaVersion, 2);
    assert.strictEqual(built.actionSeq, 4);
    assert.strictEqual(built.gameGeneration, 3);
    assert.strictEqual(built.hostlessRestoreGeneration, 1);
    assert.deepStrictEqual(built.enabledCards, ['麦畑']);
    assert.notStrictEqual(built.enabledCards, payload.enabledCards);
    assert.deepStrictEqual(harness.calls[23], [
        'resetUiLocks', OnlineLobbyStartRuntime.UI_RESET_REASON,
    ]);
    assert.ok(harness.calls.findIndex(call => call[0] === 'initGame') <
        harness.calls.findIndex(call => call[0] === 'focusGame'));
});

runTest('online game start runtimeは再戦世代を保存しlegacy欠落を0へ正規化する', () => {
    const current = createHarness();
    current.runtime.handle(startPayload({ gameGeneration: 2 }));
    const currentWrite = current.calls.find(call =>
        call[0] === 'writeRestoreJson' && call[1] === 'game-start');
    assert.strictEqual(currentWrite[2].gameGeneration, 2);

    const legacy = createHarness();
    legacy.runtime.handle(startPayload({ gameGeneration: undefined }));
    const legacyWrite = legacy.calls.find(call =>
        call[0] === 'writeRestoreJson' && call[1] === 'game-start');
    assert.strictEqual(legacyWrite[2].gameGeneration, 0);
});

runTest('online game start runtimeは非対応schemaをrestore開始前に拒否する', () => {
    const harness = createHarness({ schemaAccepted: false });
    harness.runtime.handle(startPayload());
    assert.deepStrictEqual(harness.calls, [
        ['acceptSchema', { actionVersion: 1, snapshotVersion: 1 }],
        ['setStatusText', OnlineLobbyStartRuntime.STATUS.SCHEMA_UNSUPPORTED],
    ]);
});

runTest('online game start runtimeはversion不一致だけを初期化後にlog化する', () => {
    const harness = createHarness();
    harness.runtime.handle(startPayload({ versions: ['a', 'b'] }));
    const log = harness.calls.find(call => call[0] === 'addLog');
    assert.deepStrictEqual(log, [
        'addLog', 'system', OnlineLobbyStartRuntime.VERSION_WARNING,
    ]);
    assert.ok(harness.calls.findIndex(call => call[0] === 'initGame') <
        harness.calls.findIndex(call => call[0] === 'addLog'));
});

runTest('online game start runtimeはRL preload中の世代変更でstale開始を捨てる', async () => {
    let resolvePreload;
    const preload = new Promise(resolve => { resolvePreload = resolve; });
    const harness = createHarness({ preload });
    harness.runtime.handle(startPayload());
    assert.deepStrictEqual(harness.calls.slice(-2).map(call => call[0]), [
        'preloadModels', 'setStatusText',
    ]);
    harness.setGeneration(2);
    resolvePreload();
    await preload;
    await Promise.resolve();
    assert.strictEqual(harness.calls.filter(call => call[0] === 'initGame').length, 0);
    assert.strictEqual(harness.calls.at(-1)[0], 'getRestoreGeneration');
});

runTest('online game start runtimeはRL preload失敗を同一世代だけrollbackする', async () => {
    const preload = Promise.reject(new Error('model down'));
    const harness = createHarness({ preload });
    harness.runtime.handle(startPayload());
    await preload.catch(() => {});
    await Promise.resolve();
    assert.deepStrictEqual(harness.calls.slice(-5), [
        ['getRestoreGeneration'],
        ['consoleError', 'model down'],
        ['setOnline', false],
        ['setActionFlight', false],
        ['abortRestore', 1, OnlineLobbyStartRuntime.STATUS.MODEL_FAILED],
    ]);
});

runTest('online game start runtimeはstorage失敗を開始処理の外へ伝播しない', () => {
    const harness = createHarness({ storageError: true });
    assert.doesNotThrow(() => harness.runtime.handle(startPayload()));
    assert.ok(harness.calls.some(call => call[0] === 'initGame'));
    assert.ok(harness.calls.some(call => call[0] === 'observeReconnect'));
});

runTest('online.jsはgameStart transactionを専用runtimeへ委譲する', () => {
    const online = fs.readFileSync(path.join(__dirname, '..', 'js/online.js'), 'utf8');
    const runtime = fs.readFileSync(path.join(__dirname, '..', 'js/onlineLobbyStartRuntime.js'), 'utf8');
    assert.ok(online.includes('OnlineLobbyStartRuntime.createRuntime'));
    assert.strictEqual(online.includes("'online-game-start-reset-ui-locks'"), false);
    assert.strictEqual(online.includes('const startOnlineGame = () =>'), false);
    assert.ok(runtime.includes('const startOnlineGame = () =>'));
});

runTest('online game start runtimeは必須adapter欠落を初期化前に拒否する', () => {
    assert.throws(() => OnlineLobbyStartRuntime.createRuntime(), /dependency is required/);
    const harness = createHarness();
    assert.ok(Object.isFrozen(harness.runtime));
    assert.ok(Object.isFrozen(OnlineLobbyStartRuntime.STATUS));
});
