const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const {
    configureSocketE2EHeartbeat,
    onceSocketEvent: onceEvent,
} = require('./helpers/socket-e2e');

process.env.CANONICAL_STATE_STORE = 'noop';
const serverModule = require('../server');
const runtime = serverModule.loadGameRuntime();
const connectClient = require('socket.io-client');
const NAMES = ['Alice', 'Bob'];
const { loadIntegrationRuntime } = require('./helpers/integration-runtime');

function connect(origin) {
    return connectClient(origin, { transports: ['websocket'], forceNew: true, reconnection: false });
}

async function rejoin(origin, clients, credentials, index) {
    clients[index].close();
    const socket = connect(origin);
    clients[index] = socket;
    await onceEvent(socket, 'connect');
    const promise = onceEvent(socket, 'rejoinData');
    socket.emit('rejoinRoom', {
        roomId: credentials.roomId,
        playerIndex: index,
        playerName: NAMES[index],
        reconnectToken: credentials.tokens[index],
        clientVersion: 'action-reconnect-e2e',
    });
    return { socket, data: await promise };
}

async function verifyClientUiActions(origin) {
    const clients = [];
    const runtimes = NAMES.map(() => loadIntegrationRuntime({ includeOnline: true }));
    const errors = [];
    try {
        for (const [index, client] of runtimes.entries()) {
            client.io = () => connect(origin);
            client.initSocket();
            const socket = client.__test.getOnlineState().socket;
            clients.push(socket);
            socket.on('appError', error => errors.push(error));
            await onceEvent(socket, 'connect');
            client.__test.setOnlineState({ myPlayerName: NAMES[index] });
        }
        const starts = clients.map(socket => onceEvent(socket, 'gameStart'));
        const createdPromise = onceEvent(clients[0], 'roomCreated');
        const host = runtimes[0];
        const selectionEvents = {};
        host.document.getElementById('cardSelectModal').addEventListener = (name, handler) => {
            selectionEvents[name] = handler;
        };
        host.__test.hideAllModals();
        host.handleStaticUiClick({
            target: { dataset: { uiAction: 'showCardSelect' } },
            preventDefault() {},
        });
        assert.strictEqual(host.__test.elements.cardSelectModal.style.display, 'flex');
        assert.strictEqual(typeof selectionEvents.click, 'function');
        for (const cardName of ['牧場', 'カフェ']) {
            selectionEvents.click({ target: { dataset: { action: 'toggleCard', cardName } }, preventDefault() {} });
        }
        selectionEvents.click({ target: { dataset: { action: 'closeCardSelect' } }, preventDefault() {} });
        host.showCreateRoom();
        const created = await createdPromise;
        clients[0].emit('setWaitingReady', { roomId: created.roomId, ready: true });
        const joinedPromise = onceEvent(clients[1], 'roomJoined');
        clients[1].emit('joinRoom', {
            roomId: created.roomId, playerName: NAMES[1], clientVersion: 'integration-build',
        });
        await joinedPromise;
        await new Promise(resolve => setImmediate(resolve));
        const openingUpdates = clients.map(socket => onceEvent(socket, 'playerList'));
        assert.strictEqual(host.showCardSelect(), true);
        await Promise.all(openingUpdates);
        assert.strictEqual(host.__test.elements.marketRuleSelect.disabled, true);
        selectionEvents.click({
            target: { dataset: { action: 'toggleCard', cardName: '森林' } }, preventDefault() {},
        });
        selectionEvents.click({
            target: { dataset: { action: 'toggleLandmark', landmarkName: '港' } }, preventDefault() {},
        });
        const selectionUpdates = clients.map(socket => onceEvent(socket, 'playerList'));
        host.closeCardSelect();
        await Promise.all(selectionUpdates);
        const room = serverModule.__rooms[created.roomId];
        assert.ok(!room.enabledCards.includes('森林'));
        assert.ok(!room.enabledLandmarks.includes('港'));
        assert.ok(room.players.every(player => player.ready === false));
        assert.strictEqual(runtimes[1].showCardSelect(), false, 'guest cannot change the room rules locally');
        assert.ok(!runtimes[1].GameSelectionState.runtime.snapshot().enabledCards.includes('森林'));
        clients[0].emit('setWaitingReady', { roomId: created.roomId, ready: true });
        clients[1].emit('setWaitingReady', { roomId: created.roomId, ready: true });
        const [start] = await Promise.all(starts);
        // gameStart initializes each real client runtime asynchronously.
        await new Promise(resolve => setImmediate(resolve));
        for (const entry of runtimes) {
            for (const name of ['牧場', 'カフェ', '森林']) {
                assert.ok(!entry.GameSelectionState.runtime.snapshot().enabledCards.includes(name));
                assert.ok(!entry.__test.elements.buildMenu.innerHTML.includes(`data-card-name="${name}"`));
            }
        }
        const actor = start.playerOrder[0];
        const client = runtimes[actor];
        async function perform(invoke) {
            const replies = [
                onceEvent(clients[actor], 'actionAccepted'),
                onceEvent(clients[1 - actor], 'gameAction'),
            ];
            invoke();
            const [accepted] = await Promise.all(replies);
            assert.deepStrictEqual(errors, []);
            assert.strictEqual(client.getOnlineActionFlightState().inFlight, false);
            return accepted;
        }
        await perform(() => client.sendAction('rollDice', {}));
        const before = runtimes.map(entry => entry.__test.getGame().currentPlayer().coins);
        const coinChanges = runtimes.map(() => []);
        runtimes.forEach((entry, index) => {
            entry.showCoinAnimation = (playerIndex, diff) => coinChanges[index].push(diff);
        });
        const click = (action, cardName) => client.handleBuildMenuClick({
            target: { dataset: { action, cardName } },
            preventDefault() {},
        });
        await perform(() => {
            click('buildCard', '麦畑');
            client.__test.elements.confirmOkBtn.onclick();
        });
        runtimes.forEach((entry, index) => {
            assert.strictEqual(entry.__test.getGame().currentPlayer().coins, before[index] - 1);
            assert.ok(coinChanges[index].includes(-1));
        });
        assert.ok(client.__test.elements.buildMenu.innerHTML.includes('data-action="undoBuild"'));
        const undone = await perform(() => {
            click('undoBuild');
            client.__test.elements.confirmOkBtn.onclick();
        });
        assert.ok(undone.data.state, 'server supplies the authoritative undo snapshot');
        runtimes.forEach((entry, index) => {
            assert.strictEqual(entry.__test.getGame().currentPlayer().coins, before[index]);
            assert.strictEqual(entry.__test.getGame().builtThisTurn, false);
        });
        // Exercise a pending-card button through the same client/server boundary.
        const mirror = serverModule.getRoomCanonicalMirror(serverModule.__rooms[created.roomId]);
        for (const game of [mirror.game, ...runtimes.map(entry => entry.__test.getGame())]) {
            game.phase = runtime.GAME_PHASES.PENDING;
            game.pendingTV = 1;
            game.pendingActionQueue = [{ action: 'resolveTV', field: 'pendingTV' }];
            game.players[1].coins = 10;
        }
        runtimes.forEach(entry => entry.render());
        await perform(() => client.handlePendingActionClick({
            target: { dataset: { action: 'resolveTV', targetIndex: '1' } },
            preventDefault() {},
        }));
        runtimes.forEach(entry => {
            assert.strictEqual(entry.__test.getGame().pendingTV, 0);
            assert.strictEqual(entry.__test.getGame().players[1].coins, 5);
            assert.strictEqual(entry.__test.elements.pendingModal.style.display, 'none');
        });
    } finally {
        clients.forEach(socket => socket.close());
    }
}

runTest('online action reconnect e2e: build/undo residualとTV pending snapshotをtransport復元する', async () => {
    const httpServer = serverModule.__io.httpServer;
    const restoreHeartbeat = configureSocketE2EHeartbeat(serverModule.__io);
    await new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(0, '127.0.0.1', resolve);
    });
    const origin = 'http://127.0.0.1:' + httpServer.address().port;
    const clients = [connect(origin), connect(origin)];

    try {
        await Promise.all(clients.map(socket => onceEvent(socket, 'connect')));
        const starts = clients.map(socket => onceEvent(socket, 'gameStart'));
        const createdPromise = onceEvent(clients[0], 'roomCreated');
        clients[0].emit('createRoom', {
            playerName: NAMES[0],
            playerCount: 2,
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            enabledCards: ['麦畑', 'テレビ局'],
            clientVersion: 'action-reconnect-e2e',
        });
        const created = await createdPromise;
        clients[0].emit('setWaitingReady', { roomId: created.roomId, ready: true });
        const joinedPromise = onceEvent(clients[1], 'roomJoined');
        clients[1].emit('joinRoom', {
            roomId: created.roomId,
            playerName: NAMES[1],
            clientVersion: 'action-reconnect-e2e',
        });
        const joined = await joinedPromise;
        clients[1].emit('setWaitingReady', { roomId: created.roomId, ready: true });
        const gameStarts = await Promise.all(starts);
        const start = gameStarts[0];
        const credentials = { roomId: created.roomId, tokens: [created.reconnectToken, joined.reconnectToken] };
        const game = new runtime.GameManager(2);
        let seq = 0;

        async function send(action, data = {}) {
            const originalIndex = start.playerOrder[game.currentPlayerIndex];
            const promise = onceEvent(clients[originalIndex], 'actionAccepted');
            const clientActionId = 'action-reconnect-' + (seq + 1);
            clients[originalIndex].emit('gameAction', { action, data, clientActionId });
            const accepted = await promise;
            seq++;
            assert.strictEqual(accepted.seq, seq);
            assert.strictEqual(accepted.clientActionId, clientActionId);
            return accepted;
        }

        const firstRoll = await send('rollDice', { forceDice: 1, tunaDice: [1, 1] });
        game.rollDice(firstRoll.data.forceDice, firstRoll.data.tunaDice);
        assert.strictEqual(game.phase, runtime.GAME_PHASES.BUILD);
        const firstActorOriginal = start.playerOrder[game.currentPlayerIndex];
        const observerOriginal = firstActorOriginal === 0 ? 1 : 0;
        const built = await send('buildCard', { cardName: '麦畑' });
        assert.strictEqual(built.action, 'buildCard');
        clients[observerOriginal].close();
        const undone = await send('undoBuild');
        assert.strictEqual(undone.action, 'undoBuild');
        assert.ok(undone.data.state, 'server canonical undo stateを返すこと');
        const undoRejoin = await rejoin(origin, clients, credentials, observerOriginal);
        const undoTail = undoRejoin.data.actionLog.slice(-2);
        assert.deepStrictEqual(undoTail.map(entry => entry.action), ['buildCard', 'undoBuild']);
        assert.deepStrictEqual(undoTail.map(entry => entry.seq), [seq - 1, seq]);

        const room = serverModule.__rooms[created.roomId];
        const mirror = serverModule.getRoomCanonicalMirror(room);
        mirror.game.currentPlayer().coins = 7;
        game.currentPlayer().coins = 7;
        const tvBuilt = await send('buildCard', { cardName: 'テレビ局' });
        assert.strictEqual(tvBuilt.data.cardName, 'テレビ局');
        assert.strictEqual(game.buildCard(runtime.createCardByName('テレビ局')), true);

        mirror.game.phase = runtime.GAME_PHASES.PENDING;
        mirror.game.pendingTV = 1;
        mirror.game.pendingActionQueue = [{ action: 'resolveTV', field: 'pendingTV' }];
        game.phase = runtime.GAME_PHASES.PENDING;
        game.pendingTV = 1;
        game.pendingActionQueue = [{ action: 'resolveTV', field: 'pendingTV' }];
        room.stateSnapshot = serverModule.serializeMirrorState(mirror.game, mirror.shopStock, mirror.lastUndoState, room.actionSeq);
        room.actionLog = [];
        serverModule.markRoomCanonicalMirrorCurrent(room);

        const pendingActorOriginal = start.playerOrder[game.currentPlayerIndex];
        const pendingSeq = seq;
        const pendingRejoin = await rejoin(origin, clients, credentials, pendingActorOriginal);
        assert.strictEqual(pendingRejoin.data.stateSnapshot.actionSeq, pendingSeq);
        assert.strictEqual(pendingRejoin.data.stateSnapshot.phase, runtime.GAME_PHASES.PENDING);
        assert.strictEqual(pendingRejoin.data.stateSnapshot.pendingTV, 1);
        assert.deepStrictEqual(pendingRejoin.data.stateSnapshot.pendingActions, [{ action: 'resolveTV', field: 'pendingTV' }]);
        const targetIndex = (game.currentPlayerIndex + 1) % game.players.length;
        const resolved = await send('resolveTV', { targetIndex });
        assert.strictEqual(resolved.action, 'resolveTV');
        assert.strictEqual(resolved.seq, pendingSeq + 1);
        await verifyClientUiActions(origin);
    } finally {
        clients.forEach(socket => socket.close());
        await new Promise(resolve => serverModule.__io.close(resolve));
        restoreHeartbeat();
    }
});
