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
    assert.strictEqual(rt.__test.socketEmits[0].payload.clientVersion, 'integration-build');
    const state = rt.__test.getOnlineState();
    assert.strictEqual(state.myOriginalPlayerIndex, 1);
    assert.strictEqual(state.myPlayerIndex, 1);
});

runTest('online integration: gameStart はtitle modal lockを解除してlifecycle startを送る', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.initSocket();
    rt.document.getElementById('rulesModal').style.display = 'flex';
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');
    rt.document.body.classList.add('modal-open');

    rt.__test.socketHandlers.gameStart({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: rt.CARDS.map(card => card.name),
        enabledLandmarks: rt.Player.landmarkNames(),
        versions: ['x'],
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
    });

    assert.strictEqual(rt.document.getElementById('rulesModal').style.display, 'none');
    assert.strictEqual(rt.__test.elements.gameScreen.style.display, 'block');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(rt.document.body.classList.contains('modal-open'), false);
    const lifecycleCalls = rt.__test.fetchCalls.filter(call => call.url === '/api/game-lifecycle');
    assert.strictEqual(lifecycleCalls.length, 1);
    const payload = JSON.parse(lifecycleCalls[0].options.body);
    assert.strictEqual(payload.event, 'play-start');
    assert.strictEqual(payload.mode, 'online');
    assert.strictEqual(payload.roomId, undefined);
    assert.strictEqual(payload.playerName, undefined);
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
        hostPlayerIndex: 0,
    });
    rt.__test.getGame().phase = rt.GAME_PHASES.BUILD;
    rt.__test.socketHandlers.gameAction({ action: 'buildCard', data: { cardName: '麦畑' }, playerIndex: 0 });
    const snapshot = rt.buildOnlineSnapshot();
    const gameStart = JSON.parse(rt.localStorage.getItem('onlineGameStart'));
    assert.deepStrictEqual(gameStart.reconnectTokenHashes, ['hash-a', 'hash-b']);
    assert.strictEqual(gameStart.hostPlayerIndex, 0);
    rt.document.getElementById('cardDetailModal').style.display = 'flex';
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');
    rt.document.body.classList.add('modal-open');

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
    assert.strictEqual(rt.document.getElementById('cardDetailModal').style.display, 'none');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(rt.document.body.classList.contains('modal-open'), false);
    assert.strictEqual(game.players[0].name, 'Alice');
    assert.ok(game.players[0].countCard('麦畑') >= 2);
    assert.strictEqual(game.currentPlayerIndex, 1);
});

runTest('online integration: 既定event authorityは開始・切断・再join・復元をclean parityで完了する', () => {
    const rt = loadIntegrationRuntime({
        includeOnline: true,
        onlineReconnectEventAuthorityEnabled: true,
        onlineReconnectEffectAuthorityEnabled: true,
        onlineReconnectTimerAuthorityEnabled: true,
        onlineReconnectCallbackAuthorityEnabled: true,
    });
    delete rt.window.MACHIKORO_ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED;
    delete rt.window.MACHIKORO_ONLINE_RECONNECT_EFFECT_AUTHORITY_ENABLED;
    rt.window.MACHIKORO_ONLINE_SOCKET_CONNECT_PLAN_AUTHORITY_ENABLED = true;
    rt.window.MACHIKORO_ONLINE_SOCKET_CONNECT_EFFECT_AUTHORITY_ENABLED = true;
    rt.window.MACHIKORO_ONLINE_SOCKET_DISCONNECT_PLAN_AUTHORITY_ENABLED = true;
    rt.window.MACHIKORO_ONLINE_SOCKET_DISCONNECT_EFFECT_AUTHORITY_ENABLED = true;
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.initSocket();
    rt.__test.socketHandlers.roomCreated({ roomId: 'ROOM01', playerIndex: 0, reconnectToken: 'token-1' });
    rt.__test.setOnlineState({ myPlayerName: 'Alice' });
    const gameStartPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: rt.CARDS.map(card => card.name),
        enabledLandmarks: rt.Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
    };
    rt.__test.socketHandlers.gameStart(gameStartPayload);

    let snapshot = rt.__test.getOnlineState().reconnectStateSnapshot;
    assert.strictEqual(snapshot.authority.source, 'event');
    assert.strictEqual(snapshot.authority.state, 'active');
    assert.strictEqual(snapshot.effectAuthority.source, 'event');
    assert.strictEqual(snapshot.effectAuthority.reconnecting, false);
    assert.strictEqual(snapshot.timerAuthority.source, 'event');
    assert.strictEqual(snapshot.timerAuthority.pending, false);
    assert.strictEqual(snapshot.callbackAuthority.source, 'event');
    assert.strictEqual(rt.__test.getOnlineState().isReconnectingOnline, false);

    rt.__test.getOnlineState().socket.connected = false;
    rt.__test.socketHandlers.disconnect();
    snapshot = rt.__test.getOnlineState().reconnectStateSnapshot;
    assert.strictEqual(snapshot.authority.source, 'event');
    assert.strictEqual(snapshot.authority.state, 'connecting');
    assert.strictEqual(snapshot.effectAuthority.source, 'event');
    assert.strictEqual(snapshot.effectAuthority.reconnecting, true);
    assert.strictEqual(snapshot.timerAuthority.source, 'event');
    assert.strictEqual(snapshot.timerAuthority.pending, false);
    assert.strictEqual(rt.__test.getOnlineState().isReconnectingOnline, true);
    assert.strictEqual(
        rt.__test.elements.onlineGameStatus.textContent,
        '⏳ 接続が切れました。再接続しています...'
    );
    assert.strictEqual(rt.__test.elements.onlineGameStatus.style.display, 'block');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(snapshot.socketDisconnectPlanAuthority)), {
        plan: { active: true, abortRestore: false },
        source: 'pure-plan',
        fallbackReason: '',
    });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(snapshot.socketDisconnectEffectAuthority)), {
        source: 'executor',
        fallbackReason: '',
    });

    rt.__test.getOnlineState().socket.connected = true;
    rt.__test.socketHandlers.connect();
    snapshot = rt.__test.getOnlineState().reconnectStateSnapshot;
    assert.strictEqual(snapshot.authority.source, 'event');
    assert.strictEqual(snapshot.authority.state, 'rejoining');
    assert.strictEqual(snapshot.effectAuthority.source, 'event');
    assert.strictEqual(snapshot.effectAuthority.reconnecting, true);
    assert.strictEqual(snapshot.timerAuthority.source, 'event');
    assert.strictEqual(snapshot.timerAuthority.pending, true);
    assert.ok(snapshot.timerAuthority.deadline > 0);
    assert.strictEqual(rt.__test.getOnlineState().isReconnectingOnline, true);
    assert.strictEqual(snapshot.socketConnectPlanAuthority.source, 'pure-plan');
    assert.strictEqual(snapshot.socketConnectEffectAuthority.source, 'executor');
    assert.strictEqual(
        rt.__test.elements.onlineGameStatus.textContent,
        '⏳ サーバーに再参加しています...'
    );

    rt.__test.socketHandlers.rejoinData({
        gameStartPayload,
        stateSnapshot: null,
        actionLog: [],
        playerIndex: 0,
        hostPlayerIndex: 0,
    });
    snapshot = rt.__test.getOnlineState().reconnectStateSnapshot;
    assert.strictEqual(snapshot.authority.source, 'event');
    assert.strictEqual(snapshot.authority.state, 'active');
    assert.strictEqual(snapshot.effectAuthority.source, 'event');
    assert.strictEqual(snapshot.effectAuthority.reconnecting, false);
    assert.strictEqual(snapshot.timerAuthority.source, 'event');
    assert.strictEqual(snapshot.timerAuthority.pending, false);
    assert.strictEqual(snapshot.timerAuthority.deadline, 0);
    assert.strictEqual(rt.__test.getOnlineState().isReconnectingOnline, false);
    assert.strictEqual(rt.__test.elements.onlineGameStatus.textContent, '');
    assert.strictEqual(rt.__test.elements.onlineGameStatus.style.display, 'none');
    assert.strictEqual(snapshot.projectionMismatchCount, 0);
    assert.strictEqual(snapshot.invalidEventTransitionCount, 0);
});

runTest('online integration: status effect authorityは対応eventだけをevent表示へ移す', () => {
    const rt = loadIntegrationRuntime({
        includeOnline: true,
        onlineReconnectEventAuthorityEnabled: true,
        onlineReconnectEffectAuthorityEnabled: true,
        onlineReconnectStatusEffectAuthorityEnabled: true,
    });
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.initSocket();
    rt.__test.socketHandlers.roomCreated({ roomId: 'ROOM01', playerIndex: 0, reconnectToken: 'token-1' });
    rt.__test.setOnlineState({ myPlayerName: 'Alice' });
    rt.__test.socketHandlers.gameStart({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: rt.CARDS.map(card => card.name),
        enabledLandmarks: rt.Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
    });
    rt.__test.getOnlineState().socket.connected = false;
    rt.__test.socketHandlers.disconnect();
    assert.strictEqual(
        rt.__test.elements.onlineStatus.textContent,
        '⏳ 接続が切れました。再接続しています...'
    );
    const selection = rt._applyOnlineReconnectStatusEffectAuthority(
        'game-activated',
        'legacy unsupported'
    );
    assert.strictEqual(selection.source, 'legacy-fallback');
    assert.strictEqual(rt.__test.elements.onlineStatus.textContent, 'legacy unsupported');
});

runTest('online integration: restore lifecycle status authorityは復元完了時に表示を閉じる', async () => {
    const rt = loadIntegrationRuntime({
        includeOnline: true,
        onlineReconnectEventAuthorityEnabled: true,
        onlineReconnectEffectAuthorityEnabled: true,
        onlineReconnectStatusEffectAuthorityEnabled: true,
    });
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.initSocket();
    rt.__test.socketHandlers.roomCreated({ roomId: 'ROOM01', playerIndex: 0, reconnectToken: 'token-1' });
    rt.__test.setOnlineState({ myPlayerName: 'Alice' });
    await rt.__test.socketHandlers.gameStart({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: rt.CARDS.map(card => card.name),
        enabledLandmarks: rt.Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
    });
    rt.__test.elements.onlineStatus.textContent = 'legacy restore status';
    await rt.__test.socketHandlers.rejoinData({
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: rt.CARDS.map(card => card.name),
            enabledLandmarks: rt.Player.landmarkNames(),
            reconnectTokenHashes: ['hash-a', 'hash-b'],
            hostPlayerIndex: 0,
        },
        stateSnapshot: null,
        actionLog: [],
        playerIndex: 0,
        hostPlayerIndex: 0,
    });
    const snapshot = rt.__test.getOnlineState().reconnectStateSnapshot;
    assert.strictEqual(snapshot.eventState, 'active');
    assert.strictEqual(snapshot.projectionMismatchCount, 0);
    assert.strictEqual(snapshot.invalidEventTransitionCount, 0);
    assert.strictEqual(rt.__test.elements.onlineStatus.textContent, '');
});

runTest('online integration: timer authorityは再join上限でfailedへ遷移する', () => {
    const rt = loadIntegrationRuntime({
        includeOnline: true,
        onlineReconnectEventAuthorityEnabled: true,
        onlineReconnectEffectAuthorityEnabled: true,
        onlineReconnectStatusEffectAuthorityEnabled: true,
        onlineReconnectTimerAuthorityEnabled: true,
        onlineReconnectCallbackAuthorityEnabled: true,
    });
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.initSocket();
    rt.__test.socketHandlers.roomCreated({ roomId: 'ROOM01', playerIndex: 0, reconnectToken: 'token-1' });
    rt.__test.setOnlineState({ myPlayerName: 'Alice' });
    rt.__test.socketHandlers.gameStart({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: rt.CARDS.map(card => card.name),
        enabledLandmarks: rt.Player.landmarkNames(),
        reconnectTokenHashes: ['hash-a', 'hash-b'],
        hostPlayerIndex: 0,
    });

    const socket = rt.__test.getOnlineState().socket;
    socket.connected = false;
    rt.__test.socketHandlers.disconnect();
    socket.connected = true;
    rt.__test.socketHandlers.connect();
    rt.__test.flushTimeouts();

    const rejoinRequests = rt.__test.socketEmits.filter(event => event.name === 'rejoinRoom');
    const snapshot = rt.__test.getOnlineState().reconnectStateSnapshot;
    assert.strictEqual(rejoinRequests.length, 8);
    assert.strictEqual(snapshot.eventState, 'failed');
    assert.strictEqual(snapshot.effectAuthority.source, 'event');
    assert.strictEqual(snapshot.effectAuthority.reconnecting, true);
    assert.strictEqual(snapshot.timerAuthority.source, 'event');
    assert.strictEqual(snapshot.timerAuthority.pending, false);
    assert.strictEqual(snapshot.timerAuthority.deadline, 0);
    assert.strictEqual(snapshot.callbackAuthority.source, 'event');
    assert.strictEqual(snapshot.projectionMismatchCount, 0);
    assert.strictEqual(snapshot.invalidEventTransitionCount, 0);
    assert.strictEqual(
        rt.__test.elements.onlineStatus.textContent,
        '❌ 再接続がタイムアウトしました。再接続をやり直すか、タイトルへ戻ってください。'
    );
});

runTest('online integration: timer authorityはparity不一致時にlegacy timerへ戻る', () => {
    const rt = loadIntegrationRuntime({
        includeOnline: true,
        onlineReconnectEventAuthorityEnabled: true,
        onlineReconnectEffectAuthorityEnabled: true,
        onlineReconnectTimerAuthorityEnabled: true,
        onlineReconnectCallbackAuthorityEnabled: true,
    });
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Bob',
        reconnectToken: 'token-bob',
    }));
    rt.initSocket();
    rt.__test.setOnlineState({
        isReconnectingOnline: true,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 1,
        myPlayerName: 'Bob',
        reconnectToken: 'token-bob',
    });

    rt._scheduleRejoinRetry();

    const snapshot = rt.__test.getOnlineState().reconnectStateSnapshot;
    assert.strictEqual(snapshot.timerAuthority.source, 'legacy-fallback');
    assert.strictEqual(snapshot.timerAuthority.pending, true);
    assert.strictEqual(snapshot.timerAuthority.fallbackReason, 'state-mismatch');
    assert.strictEqual(snapshot.callbackAuthority.source, 'legacy-fallback');
    assert.strictEqual(snapshot.callbackAuthority.fallbackReason, 'state-mismatch');
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
    assert.strictEqual(rt.__test.socketEmits[0].payload.clientVersion, 'integration-build');
    assert.strictEqual(rt.__test.getOnlineState().isReconnectingOnline, true);
});

runTest('online integration: connect は待機表示を消して再joinを送る', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.window.MACHIKORO_ONLINE_SOCKET_CONNECT_PLAN_AUTHORITY_ENABLED = true;
    rt.window.MACHIKORO_ONLINE_SOCKET_CONNECT_EFFECT_AUTHORITY_ENABLED = true;
    rt.initSocket();
    rt.__test.elements.onlineStatus.textContent = '⏳ ホストの復元を待っています... (1/8)';
    rt.__test.setOnlineState({
        isOnlineGame: true,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 1,
        myPlayerName: 'Alice',
        reconnectToken: 'token-1',
    });

    rt.__test.socketHandlers.connect();

    assert.strictEqual(rt.__test.elements.onlineStatus.textContent, '');
    assert.strictEqual(rt.__test.socketEmits[0].name, 'rejoinRoom');
    const reconnectSnapshot = rt.__test.getOnlineState().reconnectStateSnapshot;
    assert.deepStrictEqual(JSON.parse(JSON.stringify(reconnectSnapshot.socketConnectPlanAuthority)), {
        plan: { clearWaitingStatus: true, requestRejoin: true },
        source: 'legacy-fallback',
        fallbackReason: 'socket-connect-state-not-connecting',
    });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(reconnectSnapshot.socketConnectEffectAuthority)), {
        source: 'legacy-fallback',
        fallbackReason: 'socket-connect-plan-not-authoritative',
    });
});

runTest('online integration: rejoinData は現在のホスト状態で保存セッションを更新する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.initSocket();
    rt.window.MACHIKORO_ONLINE_REJOIN_PERSISTENCE_PLAN_AUTHORITY_ENABLED = true;
    rt.window.MACHIKORO_ONLINE_REJOIN_PERSISTENCE_EFFECT_AUTHORITY_ENABLED = true;
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
    const reconnectSnapshot = rt.__test.getOnlineState().reconnectStateSnapshot;
    assert.strictEqual(reconnectSnapshot.rejoinPersistencePlanAuthority.source, 'pure-plan');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(
        reconnectSnapshot.rejoinPersistenceEffectAuthority
    )), { source: 'executor', fallbackReason: '' });
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

runTest('online integration: rejoinData は actionLog 欠落時も空ログとして復元する', () => {
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
        playerIndex: 0,
        hostPlayerIndex: 0,
    });

    assert.deepStrictEqual(JSON.parse(rt.localStorage.getItem('onlineActionLog')), []);
    assert.strictEqual(rt.__test.getGame().players[0].name, 'Alice');
});

runTest('online integration: rejoinData は actionLog の不正要素を無視して復元する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.initSocket();
    rt.__test.setOnlineState({
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
        stateSnapshot: { currentPlayerIndex: 0, phase: rt.GAME_PHASES.BUILD, players: [], shopStock: {} },
        actionLog: [null, { data: {} }, { action: 'nextTurn' }],
        playerIndex: 0,
        hostPlayerIndex: 0,
    });

    assert.deepStrictEqual(JSON.parse(rt.localStorage.getItem('onlineActionLog')), [{ action: 'nextTurn', data: {} }]);
    assert.strictEqual(rt.__test.getGame().currentPlayerIndex, 1);
});

runTest('online integration: reconnectOnline はSocket.IO未読込時にセッションを消さず送信しない', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true, withoutIo: true });
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'ROOM01',
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken: 'token-1',
        isRoomHost: true,
    }));

    rt.reconnectOnline();

    assert.strictEqual(rt.localStorage.getItem('onlineSession') !== null, true);
    assert.strictEqual(rt.__test.socketEmits.length, 0);
    assert.strictEqual(rt.__test.elements.onlineStatus.textContent, '❌ オンライン機能を読み込めませんでした。サーバーURLから開き直してください。');
    assert.strictEqual(rt.__test.elements.noticeToast.style.display, 'flex');
    assert.strictEqual(rt.__test.elements.noticeToastMessage.textContent,
        'オンライン機能を読み込めませんでした。サーバーURLから開き直してください。');
    assert.strictEqual(rt.__test.elements.noticeToast.getAttribute('aria-live'), 'off');
    assert.strictEqual(rt.__test.getOnlineState().isReconnectingOnline, false);
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
    assert.strictEqual(rt.__test.elements.noticeToast.style.display, 'flex');
    assert.strictEqual(rt.__test.elements.noticeToastMessage.textContent, '再接続データの読み込みに失敗しました');
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
    rt.window.MACHIKORO_ONLINE_HOST_CHANGED_PLAN_AUTHORITY_ENABLED = true;
    rt.window.MACHIKORO_ONLINE_HOST_CHANGED_EFFECT_AUTHORITY_ENABLED = true;
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
    const snapshot = rt.__test.getOnlineState().reconnectStateSnapshot;
    assert.strictEqual(snapshot.hostChangedPlanAuthority.source, 'pure-plan');
    assert.strictEqual(snapshot.hostChangedPlanAuthority.plan.isHost, true);
    assert.strictEqual(snapshot.hostChangedEffectAuthority.source, 'executor');
});

runTest('online integration: hostChanged は非ホスト化も保存セッションへ反映する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.window.MACHIKORO_ONLINE_HOST_CHANGED_PLAN_AUTHORITY_ENABLED = true;
    rt.window.MACHIKORO_ONLINE_HOST_CHANGED_EFFECT_AUTHORITY_ENABLED = true;
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'ROOM01',
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken: 'token-1',
        isRoomHost: true,
    }));
    rt.initSocket();
    rt.initOnlineGame(['Alice', 'Bob'], [{ type: 'human' }, { type: 'human' }], [0, 1]);
    rt.__test.setOnlineState({
        myOriginalPlayerIndex: 0,
        myPlayerIndex: 0,
        reconnectToken: 'token-1',
        isRoomHost: true,
    });

    rt.__test.socketHandlers.hostChanged({ newHostPlayerIndex: 1 });

    const session = JSON.parse(rt.localStorage.getItem('onlineSession'));
    assert.strictEqual(rt.__test.getOnlineState().isRoomHost, false);
    assert.strictEqual(session.isRoomHost, false);
    const snapshot = rt.__test.getOnlineState().reconnectStateSnapshot;
    assert.strictEqual(snapshot.hostChangedPlanAuthority.source, 'pure-plan');
    assert.strictEqual(snapshot.hostChangedPlanAuthority.plan.isHost, false);
    assert.strictEqual(snapshot.hostChangedEffectAuthority.source, 'executor');
});

runTest('online integration: 非ホストはオンラインCPU手番をスケジュールしない', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setOnlineState({
        isOnlineGame: true,
        isRoomHost: false,
        myOriginalPlayerIndex: 1,
        myPlayerIndex: 1,
    });

    rt.initOnlineGame(['CPU1', 'Alice'], [{ type: 'cpu', difficulty: 'normal' }, { type: 'human' }], [0, 1]);

    assert.strictEqual(rt.__test.timeouts.length, 0);
});

runTest('online integration: hostChanged でホスト化するとオンラインCPU手番をスケジュールする', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.window.MACHIKORO_ONLINE_HOST_CHANGED_PLAN_AUTHORITY_ENABLED = true;
    rt.window.MACHIKORO_ONLINE_HOST_CHANGED_EFFECT_AUTHORITY_ENABLED = true;
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.initSocket();
    rt.__test.setOnlineState({
        isOnlineGame: true,
        isRoomHost: false,
        myOriginalPlayerIndex: 1,
        myPlayerIndex: 1,
    });
    rt.initOnlineGame(['CPU1', 'Alice'], [{ type: 'cpu', difficulty: 'normal' }, { type: 'human' }], [0, 1]);
    assert.strictEqual(rt.__test.timeouts.length, 0);

    rt.__test.socketHandlers.hostChanged({ newHostPlayerIndex: 1 });

    assert.ok(rt.__test.timeouts.length > 0);
    const snapshot = rt.__test.getOnlineState().reconnectStateSnapshot;
    assert.strictEqual(snapshot.hostChangedEffectAuthority.source, 'executor');
});

runTest('online integration: playerDisconnected/playerRejoined はゲームログへ反映する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.initSocket();
    rt.initOnlineGame(['Alice', 'Bob'], [{ type: 'human' }, { type: 'human' }], [0, 1]);
    rt.__test.setOnlineState({ myOriginalPlayerIndex: 0 });

    rt.__test.socketHandlers.playerDisconnected({ playerIndex: 1, playerName: 'Bob' });
    rt.__test.socketHandlers.playerRejoined({ playerIndex: 1, playerName: 'Bob' });
    rt.__test.socketHandlers.playerRejoined({ playerIndex: 0, playerName: 'Alice' });

    const messages = rt.__test.getGame().log.map(entry => entry.message);
    assert.ok(messages.includes('🔌 Bobが切断しました'));
    assert.ok(messages.includes('🔌 Bobが再接続しました'));
    assert.ok(!messages.includes('🔌 Aliceが再接続しました'));
});

runTest('online integration: gameAction undoBuild は保存ログに残り状態を復元する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.initSocket();
    rt.initOnlineGame(['Alice', 'Bob'], [{ type: 'human' }, { type: 'human' }], [0, 1]);
    const game = rt.__test.getGame();
    game.players[0].coins = 9;
    const undoState = {
        playerCoins: [3, 3],
        playerCardNames: [
            ['麦畑'],
            ['麦畑'],
        ],
        playerDormantIndices: [[], []],
        playerLandmarks: game.players.map(player => Object.assign({}, player.landmarks)),
        playerItVenture: [0, 0],
        playerHasYakusho: [true, true],
        hadAmusementParkAtRoll: false,
        shopStock: Object.assign({}, rt.SHOP_STOCK || {}),
        builtThisTurn: false,
        log: [{ type: 'system', message: 'undo target' }],
    };

    rt.__test.socketHandlers.gameAction({ action: 'undoBuild', data: { state: undoState }, playerIndex: 0 });

    const after = rt.__test.getGame();
    const actionLog = JSON.parse(rt.localStorage.getItem('onlineActionLog'));
    assert.strictEqual(after.players[0].coins, 3);
    assert.strictEqual(after.log[0].message, 'undo target');
    assert.strictEqual(actionLog[actionLog.length - 1].action, 'undoBuild');
});

runTest('online integration: ROOM_NOT_FOUND でホストは recreateRoom を送る', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: rt.CARDS.map(card => card.name),
        enabledLandmarks: rt.Player.landmarkNames(),
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
        reconnectTokenHashes: ['hash-a', 'hash-b'],
    }));
    rt.localStorage.setItem('onlineStateSnapshot', JSON.stringify({
        players: [],
        currentPlayerIndex: 0,
        shopStock: {},
    }));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([{ action: 'nextTurn', data: {}, playerIndex: 0 }]));
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
    assert.strictEqual(rt.__test.socketEmits[0].payload.gameStartPayload.hostPlayerIndex, 0);
    assert.strictEqual(rt.__test.socketEmits[0].payload.actionLog[0].playerIndex, 0);
    assert.strictEqual(rt.__test.elements.onlineStatus.textContent, '♻️ サーバー再起動を検知。ゲームを復元中...');
});

runTest('online integration: ROOM_NOT_FOUND 復元は壊れた snapshot だけを捨てて送る', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: rt.CARDS.map(card => card.name),
        enabledLandmarks: rt.Player.landmarkNames(),
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
        reconnectTokenHashes: ['hash-a', 'hash-b'],
    }));
    rt.localStorage.setItem('onlineStateSnapshot', '{broken');
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([{ action: 'nextTurn', data: {}, playerIndex: 0 }]));
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
    assert.strictEqual(rt.__test.socketEmits[0].payload.stateSnapshot, null);
    assert.strictEqual(rt.__test.socketEmits[0].payload.actionLog.length, 1);
    assert.strictEqual(rt.__test.socketEmits[0].payload.actionLog[0].playerIndex, 0);
});

runTest('online integration: ROOM_NOT_FOUND 復元は壊れた actionLog を空配列として送る', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: rt.CARDS.map(card => card.name),
        enabledLandmarks: rt.Player.landmarkNames(),
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
        reconnectTokenHashes: ['hash-a', 'hash-b'],
    }));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify({ action: 'nextTurn', data: {} }));
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
    assert.strictEqual(rt.__test.socketEmits[0].payload.actionLog.length, 0);
});

runTest('online integration: ROOM_NOT_FOUND 復元は壊れた actionLog JSON でも送る', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: rt.CARDS.map(card => card.name),
        enabledLandmarks: rt.Player.landmarkNames(),
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
        reconnectTokenHashes: ['hash-a', 'hash-b'],
    }));
    rt.localStorage.setItem('onlineStateSnapshot', JSON.stringify({
        players: [],
        currentPlayerIndex: 0,
        shopStock: {},
    }));
    rt.localStorage.setItem('onlineRestoreAudit', JSON.stringify({ schemaVersion: 1, roomId: 'ROOM01', signed: true }));
    rt.localStorage.setItem('onlineActionLog', '{broken');
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
    assert.strictEqual(rt.__test.socketEmits[0].payload.stateSnapshot.currentPlayerIndex, 0);
    assert.strictEqual(rt.__test.socketEmits[0].payload.actionLog.length, 0);
});

runTest('online integration: reconnectOnline 後のROOM_NOT_FOUNDでホストは保存indexを使って復元する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'ROOM01',
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken: 'token-1',
        isRoomHost: true,
    }));
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: rt.CARDS.map(card => card.name),
        enabledLandmarks: rt.Player.landmarkNames(),
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
        reconnectTokenHashes: ['hash-a', 'hash-b'],
    }));

    rt.reconnectOnline();
    rt.__test.socketEmits.length = 0;
    rt.__test.socketHandlers.appError('ROOM_NOT_FOUND');

    assert.strictEqual(rt.__test.socketEmits.length, 1);
    assert.strictEqual(rt.__test.socketEmits[0].name, 'recreateRoom');
    assert.strictEqual(rt.__test.socketEmits[0].payload.playerIndex, 0);
    assert.strictEqual(rt.__test.socketEmits[0].payload.gameStartPayload.hostPlayerIndex, 0);
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

    assert.strictEqual(rt.__test.socketEmits.length, 8);
    assert.strictEqual(rt.__test.socketEmits.every(event => event.name === 'rejoinRoom'), true);
    assert.strictEqual(rt.__test.socketEmits[0].payload.playerIndex, 1);
    assert.strictEqual(rt.__test.socketEmits[0].payload.playerName, 'Alice');
    assert.strictEqual(rt.__test.elements.onlineStatus.textContent.includes('タイムアウト'), true);
});

runTest('online integration: rejoin retry は正規化済みsessionで再送する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: ' room01 ',
        playerIndex: 1,
        playerName: ' Bob ',
        reconnectToken: ' token-bob ',
    }));
    rt.initSocket();
    rt.__test.setOnlineState({
        isReconnectingOnline: true,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 1,
        myPlayerName: 'Bob',
        reconnectToken: 'token-bob',
    });

    rt._scheduleRejoinRetry();
    rt.__test.flushTimeouts();

    const emitted = rt.__test.socketEmits[rt.__test.socketEmits.length - 1];
    assert.strictEqual(emitted.name, 'rejoinRoom');
    assert.deepStrictEqual(Object.assign({}, emitted.payload), {
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Bob',
        reconnectToken: 'token-bob',
        clientVersion: 'integration-build',
        hostlessRestoreVersion: 1,
    });
});

runTest('online integration: 非ホストはホスト待機上限後もhostless復元を送らない', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Bob',
        reconnectToken: 'token-bob',
        isRoomHost: false,
    }));
    rt.localStorage.setItem('onlineGameStart', JSON.stringify({
        schemaVersion: 2,
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        enabledCards: rt.CARDS.map(card => card.name),
        enabledLandmarks: rt.Player.landmarkNames(),
        hostPlayerIndex: 0,
        hostEpoch: 1,
        actionSeq: 2,
        reconnectTokenHashes: ['hash-a', 'hash-b'],
    }));
    rt.localStorage.setItem('onlineStateSnapshot', JSON.stringify({
        actionSeq: 2,
        players: [],
        currentPlayerIndex: 0,
        shopStock: {},
    }));
    rt.localStorage.setItem('onlineActionLog', JSON.stringify([]));
    rt.initSocket();
    rt.__test.setOnlineState({
        isReconnectingOnline: true,
        isRoomHost: false,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 1,
        myPlayerName: 'Bob',
        reconnectToken: 'token-bob',
    });

    rt._scheduleRejoinRetry();
    rt.__test.flushTimeouts();

    assert.strictEqual(rt.__test.socketEmits.filter(event => event.name === 'rejoinRoom').length, 8);
    assert.strictEqual(rt.__test.socketEmits.some(event => event.name === 'recreateRoom'), false);
    assert.strictEqual(rt.__test.elements.onlineStatus.textContent, '❌ 再接続がタイムアウトしました。再接続をやり直すか、タイトルへ戻ってください。');
});

runTest('online integration: rejoin retry timeout 後も入力をブロックする', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);
    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.BUILD;
    game.builtThisTurn = true;
    rt.initSocket();
    rt.__test.setOnlineState({
        isOnlineGame: true,
        isReconnectingOnline: true,
        myPlayerIndex: 0,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        reconnectToken: 'token-a',
    });
    rt.render();
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, true);

    rt._scheduleRejoinRetry();
    rt.__test.flushTimeouts();

    assert.strictEqual(rt.__test.socketEmits.filter(event => event.name === 'rejoinRoom').length, 8);
    assert.strictEqual(rt.__test.elements.onlineStatus.textContent.includes('タイムアウト'), true);
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, true);
    assert.strictEqual(rt.__test.getOnlineState().isReconnectingOnline, true);
});

runTest('online integration: 未接続で予約した再接続はconnect後に送信する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.localStorage.setItem('onlineSession', JSON.stringify({
        roomId: 'ROOM01', playerIndex: 1, playerName: 'Bob', reconnectToken: 'token-bob'
    }));
    rt.initSocket();
    const socket = rt.__test.getOnlineState().socket;
    socket.connected = false;

    rt.reconnectOnline();
    assert.strictEqual(rt.__test.getOnlineState().isReconnectingOnline, true);
    assert.strictEqual(rt.__test.socketEmits.length, 0);

    socket.connected = true;
    rt.__test.socketHandlers.connect();
    assert.strictEqual(rt.__test.socketEmits.length, 1);
    assert.strictEqual(rt.__test.socketEmits[0].name, 'rejoinRoom');
});

runTest('online integration: page復帰時に期限切れrejoin待機を即再送する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.initSocket();
    rt.__test.setOnlineState({
        isReconnectingOnline: true,
        myRoomId: 'ROOM01', myOriginalPlayerIndex: 1, myPlayerName: 'Bob', reconnectToken: 'token-bob'
    });
    rt._scheduleRejoinRetry();
    rt.__test.advanceTime(3001);

    assert.strictEqual(rt.resumeOnlineReconnectAfterPageActivation(), true);
    assert.strictEqual(rt.__test.socketEmits.length, 1);
    assert.strictEqual(rt.__test.socketEmits[0].name, 'rejoinRoom');
});
if (process.exitCode) {
    throw new Error('online integrationテストで失敗が発生しました');
}
