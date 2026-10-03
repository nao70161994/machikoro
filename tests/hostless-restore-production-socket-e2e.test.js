'use strict';

const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const {
    configureSocketE2EHeartbeat,
    onceSocketEvent,
} = require('./helpers/socket-e2e');

process.env.CANONICAL_STATE_STORE = 'noop';
process.env.HOSTLESS_RESTORE_ENABLED = '1';
process.env.RESTORE_AUDIT_SECRET = 'hostless-production-socket-e2e-secret';

const serverModule = require('../server');
const connectClient = require('socket.io-client');

const WAIT_TIMEOUT_MS = 150_000;
const PLAYER_NAMES = ['Host', 'Guest 1', 'Guest 2', 'Guest 3'];

function connect(origin) {
    return connectClient(origin, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
    });
}

function onceConfirmation(sockets) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('hostlessRestoreConfirmation timed out'));
        }, WAIT_TIMEOUT_MS);
        const handlers = sockets.map(({ socket, playerIndex }) => {
            const handler = payload => {
                cleanup();
                resolve({ socket, playerIndex, payload });
            };
            socket.once('hostlessRestoreConfirmation', handler);
            return { socket, handler };
        });
        function cleanup() {
            clearTimeout(timer);
            handlers.forEach(({ socket, handler }) => {
                socket.off('hostlessRestoreConfirmation', handler);
            });
        }
    });
}

async function waitForDisconnectedSocket(io, socketId) {
    const deadline = Date.now() + 5000;
    while (io.sockets.sockets.has(socketId)) {
        if (Date.now() >= deadline) throw new Error('server did not detach socket ' + socketId);
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

runTest('hostless restore production Socket E2E: 本番配線・既定猶予・認証・切断後確認・snapshot復元を通す', async () => {
    const io = serverModule.__io;
    const httpServer = io.httpServer;
    const restoreHeartbeat = configureSocketE2EHeartbeat(io, 240_000);
    await new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(0, '127.0.0.1', resolve);
    });

    const origin = 'http://127.0.0.1:' + httpServer.address().port;
    const initialClients = PLAYER_NAMES.map(() => connect(origin));
    let recoveryClients = [];
    let roomId = '';
    const statusEvents = [];
    try {
        await Promise.all(initialClients.map(socket => onceSocketEvent(socket, 'connect')));
        const startEvents = initialClients.map(socket => onceSocketEvent(socket, 'gameStart'));
        const createdEvent = onceSocketEvent(initialClients[0], 'roomCreated');
        initialClients[0].emit('createRoom', {
            playerName: PLAYER_NAMES[0],
            playerCount: PLAYER_NAMES.length,
            playerSettings: PLAYER_NAMES.map(() => ({ type: 'human' })),
            clientVersion: 'hostless-production-e2e',
            hostlessRestoreVersion: 1,
        });
        const created = await createdEvent;
        roomId = created.roomId;
        const tokensByIndex = new Array(PLAYER_NAMES.length);
        tokensByIndex[created.playerIndex] = created.reconnectToken;
        initialClients[0].emit('setWaitingReady', { roomId, ready: true });

        for (let playerIndex = 1; playerIndex < PLAYER_NAMES.length; playerIndex++) {
            const joinedEvent = onceSocketEvent(initialClients[playerIndex], 'roomJoined');
            initialClients[playerIndex].emit('joinRoom', {
                roomId,
                playerName: PLAYER_NAMES[playerIndex],
                clientVersion: 'hostless-production-e2e',
                hostlessRestoreVersion: 1,
            });
            const joined = await joinedEvent;
            assert.strictEqual(joined.playerIndex, playerIndex);
            tokensByIndex[joined.playerIndex] = joined.reconnectToken;
            initialClients[playerIndex].emit('setWaitingReady', { roomId, ready: true });
        }

        const gameStarts = await Promise.all(startEvents);
        const gameStartPayload = gameStarts[0];
        assert.ok(gameStartPayload.hostlessRestoreCapabilities.every(value => value === 1));
        assert.ok(gameStarts.every(payload =>
            JSON.stringify(payload) === JSON.stringify(gameStartPayload)
        ));

        const liveRoom = serverModule.__rooms[roomId];
        assert.ok(liveRoom && liveRoom.started);
        const mirror = serverModule.getRoomCanonicalMirror(liveRoom);
        const stateSnapshot = serverModule.serializeMirrorState(
            mirror.game,
            mirror.shopStock,
            mirror.lastUndoState || null,
            liveRoom.actionSeq || 0
        );
        assert.ok(stateSnapshot);
        const restoreAudit = serverModule.buildRestoreSnapshotAudit(
            roomId,
            gameStartPayload,
            stateSnapshot,
            Date.now()
        );
        assert.ok(restoreAudit?.signed, 'server HMAC should authorize the candidate snapshot');

        await Promise.all(initialClients.map(socket => new Promise(resolve => {
            socket.once('disconnect', resolve);
            socket.close();
        })));

        // Model process memory loss while keeping this production Socket.IO assembly alive.
        assert.strictEqual(serverModule.__rooms[roomId], liveRoom);
        delete serverModule.__rooms[roomId];
        assert.strictEqual(serverModule.__rooms[roomId], undefined);

        recoveryClients = PLAYER_NAMES.slice(1).map(() => connect(origin));
        await Promise.all(recoveryClients.map(socket => onceSocketEvent(socket, 'connect')));
        recoveryClients.forEach(socket => socket.on('hostlessRestoreStatus', status => statusEvents.push(status)));

        const reconnectInfo = PLAYER_NAMES.slice(1).map((playerName, offset) => {
            const playerIndex = offset + 1;
            return {
                socket: recoveryClients[offset],
                playerIndex,
                payload: {
                    roomId,
                    gameStartPayload,
                    stateSnapshot,
                    actionLog: [],
                    restoreAudit,
                    playerIndex,
                    playerName,
                    reconnectToken: tokensByIndex[playerIndex],
                    capabilityVersion: 1,
                    generation: gameStartPayload.hostlessRestoreGeneration,
                    attemptCount: gameStartPayload.hostlessRestoreCount,
                },
            };
        });

        const waitingStatuses = reconnectInfo.map(({ socket }) =>
            onceSocketEvent(socket, 'hostlessRestoreStatus')
        );
        const collectingEvents = reconnectInfo.slice(1).map(({ socket }) =>
            onceSocketEvent(socket, 'hostlessRestoreCollect', WAIT_TIMEOUT_MS)
        );
        reconnectInfo.forEach(({ socket, payload }) => socket.emit('requestHostlessRestore', payload));
        const waiting = await Promise.all(waitingStatuses);
        assert.ok(waiting.every(status => status.reason === 'waiting-for-host'));

        // One signed-in player leaves during the default 60-second host grace.
        const disconnectedRequester = reconnectInfo[0];
        const disconnected = onceSocketEvent(disconnectedRequester.socket, 'disconnect', 10_000);
        disconnectedRequester.socket.close();
        await disconnected;
        await waitForDisconnectedSocket(io, disconnectedRequester.socket.id);

        const collection = await Promise.all(collectingEvents);
        assert.ok(collection.every(event => event.timeoutMs === 30_000));
        reconnectInfo.slice(1).forEach(({ socket, payload }) => {
            socket.emit('submitHostlessRestoreCandidate', payload);
        });

        const remainingRequesters = reconnectInfo.slice(1);
        const firstConfirmationPromise = onceConfirmation(remainingRequesters);
        const firstConfirmation = await firstConfirmationPromise;
        assert.ok(remainingRequesters.some(item => item.playerIndex === firstConfirmation.playerIndex));
        assert.strictEqual(firstConfirmation.payload.candidateCount, 2);

        const nextConfirmationPromise = onceConfirmation(
            remainingRequesters.filter(item => item.playerIndex !== firstConfirmation.playerIndex)
        );
        const ownerDisconnected = onceSocketEvent(firstConfirmation.socket, 'disconnect', 10_000);
        firstConfirmation.socket.close();
        await ownerDisconnected;
        const nextConfirmation = await nextConfirmationPromise;
        assert.notStrictEqual(nextConfirmation.playerIndex, firstConfirmation.playerIndex);

        const approvedEvent = onceSocketEvent(nextConfirmation.socket, 'hostlessRestoreApproved');
        const rejoinEvent = onceSocketEvent(nextConfirmation.socket, 'rejoinData');
        nextConfirmation.socket.emit('confirmHostlessRestore', { roomId, approved: true });
        const [approved, rejoinData] = await Promise.all([approvedEvent, rejoinEvent]);
        assert.strictEqual(approved.provisional, true);
        assert.strictEqual(approved.hostPlayerIndex, nextConfirmation.playerIndex);
        assert.deepStrictEqual(
            JSON.parse(JSON.stringify(rejoinData.stateSnapshot)),
            JSON.parse(JSON.stringify(stateSnapshot))
        );
        assert.strictEqual(rejoinData.actionLog.length, 0);
        assert.ok(serverModule.__rooms[roomId]?.provisionalRestore);
        assert.strictEqual(serverModule.__rooms[roomId].hostPlayerIndex, nextConfirmation.playerIndex);
    } catch (error) {
        error.message += ' hostlessStatus=' + JSON.stringify(statusEvents);
        throw error;
    } finally {
        recoveryClients.concat(initialClients).forEach(socket => socket.close());
        await new Promise(resolve => io.close(resolve));
        restoreHeartbeat();
        if (roomId) delete serverModule.__rooms[roomId];
    }
});
