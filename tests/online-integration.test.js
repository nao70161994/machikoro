const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const { loadIntegrationRuntime } = require('./helpers/integration-runtime');

runTest('online integration: reconnectOnline は rejoinRoom を送信して online タブを開く', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token-1',
        isRoomHost: false,
    }));

    rt.reconnectOnline();

    assert.strictEqual(rt.__test.elements.tabContentOnline.style.display, 'flex');
    assert.strictEqual(rt.__test.elements.onlineStatus.textContent, '再接続中...');
    assert.strictEqual(rt.__test.socketEmits.length, 1);
    assert.strictEqual(rt.__test.socketEmits[0].name, 'rejoinRoom');
    assert.strictEqual(rt.__test.socketEmits[0].payload.roomId, 'ROOM01');
});

runTest('online integration: gameStart から rejoinData で画面と状態を復元する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.initSocket();

    rt.__test.socketHandlers.gameStart({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: rt.CARDS.map(card => card.name),
        enabledLandmarks: rt.Player.landmarkNames(),
        versions: ['x'],
        reconnectTokenHashes: ['hash-a', 'hash-b'],
    });
    rt.__test.socketHandlers.gameAction({ action: 'buildCard', data: { cardName: '麦畑' }, playerIndex: 0 });
    const snapshot = rt.buildOnlineSnapshot();
    const gameStart = JSON.parse(rt.localStorage.getItem('onlineGameStart'));
    assert.deepStrictEqual(gameStart.reconnectTokenHashes, ['hash-a', 'hash-b']);

    rt.__test.socketHandlers.rejoinData({
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: rt.CARDS.map(card => card.name),
            enabledLandmarks: rt.Player.landmarkNames(),
        },
        stateSnapshot: snapshot,
        actionLog: [{ action: 'nextTurn', data: {} }],
        playerIndex: 0,
    });

    const game = rt.__test.getGame();
    assert.strictEqual(rt.__test.elements.titleScreen.style.display, 'none');
    assert.strictEqual(rt.__test.elements.gameScreen.style.display, 'block');
    assert.strictEqual(game.players[0].name, 'Alice');
    assert.ok(game.players[0].countCard('麦畑') >= 2);
    assert.strictEqual(game.currentPlayerIndex, 1);
});

runTest('online integration: socket再接続時はrejoinRoomで最新状態を取り直す', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.initSocket();
    rt.__test.setOnlineState({
        isOnlineGame: true,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 1,
        myPlayerName: 'Alice',
        reconnectToken: 'token-1',
    });

    rt.__test.socketHandlers.connect();

    assert.strictEqual(rt.__test.socketEmits.length, 1);
    assert.strictEqual(rt.__test.socketEmits[0].name, 'rejoinRoom');
    assert.strictEqual(rt.__test.socketEmits[0].payload.roomId, 'ROOM01');
    assert.strictEqual(rt.__test.socketEmits[0].payload.playerIndex, 1);
    assert.strictEqual(rt.__test.socketEmits[0].payload.playerName, 'Alice');
    assert.strictEqual(rt.__test.socketEmits[0].payload.reconnectToken, 'token-1');
    assert.strictEqual(rt.__test.getOnlineState().isReconnectingOnline, true);
});

runTest('online integration: rejoinData は現在のホスト状態で保存セッションを更新する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.initSocket();
    rt.__test.setOnlineState({
        isRoomHost: true,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        reconnectToken: 'token-1',
    });

    rt.__test.socketHandlers.rejoinData({
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: rt.CARDS.map(card => card.name),
            enabledLandmarks: rt.Player.landmarkNames(),
        },
        stateSnapshot: null,
        actionLog: [],
        playerIndex: 0,
        hostPlayerIndex: 1,
    });

    const session = JSON.parse(rt.localStorage.getItem('onlineSession'));
    assert.strictEqual(rt.__test.getOnlineState().isRoomHost, false);
    assert.strictEqual(session.isRoomHost, false);
});

runTest('online integration: rejoinData は復元用snapshotとactionLogを保存し直す', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([{ action: 'stale', data: {} }]));
    rt.initSocket();
    rt.__test.setOnlineState({
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        reconnectToken: 'token-1',
    });
    const gameStartPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: rt.CARDS.map(card => card.name),
        enabledLandmarks: rt.Player.landmarkNames(),
    };
    const stateSnapshot = {
        players: [],
        currentPlayerIndex: 0,
        shopStock: {},
    };
    const actionLog = [{ action: 'nextTurn', data: {} }];

    rt.__test.socketHandlers.rejoinData({
        gameStartPayload,
        stateSnapshot,
        actionLog,
        playerIndex: 0,
        hostPlayerIndex: 0,
    });

    assert.deepStrictEqual(JSON.parse(rt.localStorage.getItem('onlineGameStart')).playerNames, ['Alice', 'Bob']);
    assert.deepStrictEqual(JSON.parse(rt.localStorage.getItem('onlineStateSnapshot')), stateSnapshot);
    assert.deepStrictEqual(JSON.parse(rt.localStorage.getItem('onlineActionLog')), actionLog);
});

runTest('online integration: reconnectOnline は壊れたセッションを破棄して警告する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.localStorage.setItem('onlineSession', '{broken');
    rt.localStorage.setItem('savedGame', '{"ok":true}');
    rt.updateResumeButton();

    rt.reconnectOnline();

    assert.strictEqual(rt.localStorage.getItem('onlineSession'), null);
    assert.strictEqual(rt.__test.elements.onlineResumeSection.style.display, 'none');
    assert.strictEqual(rt.__test.elements.resumeSection.style.display, 'flex');
    assert.strictEqual(rt.__test.alerts.length, 1);
    assert.strictEqual(rt.__test.alerts[0], '再接続データの読み込みに失敗しました');
});

runTest('online integration: appError は再接続中のセッションを破棄して切断する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token-1',
        isRoomHost: false,
    }));
    rt.updateResumeButton();
    rt.initSocket();
    rt.__test.setOnlineState({ isReconnectingOnline: true, isRoomHost: false });

    rt.__test.socketHandlers.appError('再接続に失敗');

    assert.strictEqual(rt.localStorage.getItem('onlineSession'), null);
    assert.strictEqual(rt.__test.elements.onlineResumeSection.style.display, 'none');
    assert.strictEqual(rt.__test.isSocketDisconnected(), true);
    assert.strictEqual(rt.__test.getOnlineState().isReconnectingOnline, false);
    assert.strictEqual(rt.__test.elements.onlineStatus.textContent, '❌ 再接続に失敗');
});

runTest('online integration: hostChanged はホスト状態と保存済みセッションを更新する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'old-token',
        isRoomHost: false,
    }));
    rt.initSocket();
    rt.initOnlineGame(['Bob', 'Alice'], [{ type: 'human' }, { type: 'human' }], [0, 1]);
    rt.__test.setOnlineState({
        myOriginalPlayerIndex: 1,
        myPlayerIndex: 1,
        reconnectToken: 'new-token',
        isRoomHost: false,
    });

    rt.__test.socketHandlers.hostChanged({ newHostPlayerIndex: 1 });

    const session = JSON.parse(rt.localStorage.getItem('onlineSession'));
    assert.strictEqual(rt.__test.getOnlineState().isRoomHost, true);
    assert.strictEqual(session.isRoomHost, true);
    assert.strictEqual(session.reconnectToken, 'new-token');
});

runTest('online integration: ROOM_NOT_FOUND でホストは recreateRoom を送る', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: rt.CARDS.map(card => card.name),
        enabledLandmarks: rt.Player.landmarkNames(),
    }));
    rt.localStorage.setItem('onlineStateSnapshot', JSON.stringify({
        players: [],
        currentPlayerIndex: 0,
        shopStock: {},
    }));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([{ action: 'nextTurn', data: {} }]));
    rt.initSocket();
    rt.__test.setOnlineState({
        isReconnectingOnline: true,
        isRoomHost: true,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        reconnectToken: 'token-1',
    });

    rt.__test.socketHandlers.appError('ROOM_NOT_FOUND');

    assert.strictEqual(rt.__test.socketEmits.length, 1);
    assert.strictEqual(rt.__test.socketEmits[0].name, 'recreateRoom');
    assert.strictEqual(rt.__test.socketEmits[0].payload.roomId, 'ROOM01');
    assert.strictEqual(rt.__test.socketEmits[0].payload.reconnectToken, 'token-1');
    assert.strictEqual(rt.__test.elements.onlineStatus.textContent, '♻️ サーバー再起動を検知。ゲームを復元中...');
});

runTest('online integration: ROOM_NOT_FOUND で非ホストは再接続リトライを送る', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token-1',
        isRoomHost: false,
    }));
    rt.initSocket();
    rt.__test.setOnlineState({
        isReconnectingOnline: true,
        isRoomHost: false,
    });

    rt.__test.socketHandlers.appError('ROOM_NOT_FOUND');
    assert.strictEqual(rt.__test.elements.onlineStatus.textContent, '⏳ ホストの復元を待っています... (1/8)');

    rt.__test.flushTimeouts();

    assert.strictEqual(rt.__test.socketEmits.length, 1);
    assert.strictEqual(rt.__test.socketEmits[0].name, 'rejoinRoom');
    assert.strictEqual(rt.__test.socketEmits[0].payload.playerIndex, 1);
    assert.strictEqual(rt.__test.socketEmits[0].payload.playerName, 'Alice');
});

if (process.exitCode) {
    throw new Error('online integrationテストで失敗が発生しました');
}
