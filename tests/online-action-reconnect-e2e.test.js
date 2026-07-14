const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

process.env.CANONICAL_STATE_STORE = 'memory';
const serverModule = require('../server');
const runtime = serverModule.loadGameRuntime();
const clientBundlePath = path.join(path.dirname(require.resolve('socket.io/package.json')), 'client-dist', 'socket.io.js');
const connectClient = require(clientBundlePath);
const NAMES = ['Alice', 'Bob'];

function onceEvent(socket, event, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(event, onEvent);
            reject(new Error(event + ' timed out'));
        }, timeoutMs);
        function onEvent(payload) {
            clearTimeout(timer);
            resolve(payload);
        }
        socket.once(event, onEvent);
    });
}

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

runTest('online action reconnect e2e: build/undo residualとTV pending snapshotをtransport復元する', async () => {
    const httpServer = serverModule.__io.httpServer;
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
        const joinedPromise = onceEvent(clients[1], 'roomJoined');
        clients[1].emit('joinRoom', {
            roomId: created.roomId,
            playerName: NAMES[1],
            clientVersion: 'action-reconnect-e2e',
        });
        const joined = await joinedPromise;
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
    } finally {
        clients.forEach(socket => socket.close());
        await new Promise(resolve => serverModule.__io.close(resolve));
    }
});
