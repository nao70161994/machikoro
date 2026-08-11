'use strict';

const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const {
    configureSocketE2EHeartbeat,
    onceSocketEvent: onceEvent,
} = require('./helpers/socket-e2e');

process.env.CANONICAL_STATE_STORE = 'noop';
const serverModule = require('../server');
const connectClient = require('socket.io-client');

function connect(origin) {
    return connectClient(origin, { transports: ['websocket'], forceNew: true, reconnection: false });
}

async function createStartedRoom(clients, names) {
    const starts = clients.map(socket => onceEvent(socket, 'gameStart'));
    const createdPromise = onceEvent(clients[0], 'roomCreated');
    clients[0].emit('createRoom', {
        playerName: names[0],
        playerCount: 2,
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        clientVersion: 'rejoin-room-lifecycle-e2e',
    });
    const created = await createdPromise;
    const joinedPromise = onceEvent(clients[1], 'roomJoined');
    clients[1].emit('joinRoom', {
        roomId: created.roomId,
        playerName: names[1],
        clientVersion: 'rejoin-room-lifecycle-e2e',
    });
    const joined = await joinedPromise;
    await Promise.all(starts);
    return { roomId: created.roomId, tokens: [created.reconnectToken, joined.reconnectToken] };
}

runTest('rejoin room lifecycle e2e: active socketは別roomへ再参加せず元roomの切断処理を維持する', async () => {
    const httpServer = serverModule.__io.httpServer;
    const restoreHeartbeat = configureSocketE2EHeartbeat(serverModule.__io);
    await new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(0, '127.0.0.1', resolve);
    });
    const origin = 'http://127.0.0.1:' + httpServer.address().port;
    const roomAClients = [connect(origin), connect(origin)];
    const roomBClients = [connect(origin), connect(origin)];
    const clients = roomAClients.concat(roomBClients);

    try {
        await Promise.all(clients.map(socket => onceEvent(socket, 'connect')));
        const roomA = await createStartedRoom(roomAClients, ['Alice', 'Amy']);
        const roomB = await createStartedRoom(roomBClients, ['Bob', 'Ben']);
        const rejected = onceEvent(roomAClients[0], 'appError');

        roomAClients[0].emit('rejoinRoom', {
            roomId: roomB.roomId,
            playerIndex: 0,
            playerName: 'Bob',
            reconnectToken: roomB.tokens[0],
            clientVersion: 'rejoin-room-lifecycle-e2e',
        });

        assert.strictEqual(await rejected, 'すでに別のルームに参加しています');
        const serverSocket = serverModule.__io.sockets.sockets.get(roomAClients[0].id);
        assert.strictEqual(serverSocket.roomId, roomA.roomId);
        assert.strictEqual(serverSocket.playerIndex, 0);
        assert.strictEqual(serverSocket.rooms.has(roomA.roomId), true);
        assert.strictEqual(serverSocket.rooms.has(roomB.roomId), false);
        assert.strictEqual(serverModule.__rooms[roomA.roomId].players[0].id, roomAClients[0].id);
        assert.strictEqual(serverModule.__rooms[roomB.roomId].players[0].id, roomBClients[0].id);

        const disconnected = onceEvent(roomAClients[1], 'playerDisconnected');
        const hostChanged = onceEvent(roomAClients[1], 'hostChanged');
        roomAClients[0].close();
        assert.strictEqual((await disconnected).playerIndex, 0);
        assert.strictEqual((await hostChanged).newHostPlayerIndex, 1);
        assert.strictEqual(serverModule.__rooms[roomA.roomId].players[0].id, null);
        assert.strictEqual(serverModule.__rooms[roomA.roomId].hostPlayerIndex, 1);
    } finally {
        clients.forEach(socket => socket.close());
        await new Promise(resolve => serverModule.__io.close(resolve));
        restoreHeartbeat();
    }
});
