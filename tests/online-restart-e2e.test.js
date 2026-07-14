const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { runTest } = require('./helpers/test-utils');

const clientBundlePath = path.join(path.dirname(require.resolve('socket.io/package.json')), 'client-dist', 'socket.io.js');
const connectClient = require(clientBundlePath);
const PLAYER_NAMES = ['Alice', 'Bob'];

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

function availablePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(error => error ? reject(error) : resolve(port));
        });
    });
}

function startServer(port, storeFile) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['server.js'], {
            cwd: path.join(__dirname, '..'),
            env: Object.assign({}, process.env, {
                PORT: String(port),
                CANONICAL_STATE_STORE: 'file',
                CANONICAL_STATE_STORE_FILE: storeFile,
                NODE_ENV: 'test',
            }),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error('server startup timed out: ' + output));
        }, 5000);
        function consume(chunk) {
            output += chunk.toString();
            if (output.includes('サーバー起動:')) {
                clearTimeout(timer);
                resolve(child);
            }
        }
        child.stdout.on('data', consume);
        child.stderr.on('data', consume);
        child.once('exit', code => {
            clearTimeout(timer);
            if (!output.includes('サーバー起動:')) reject(new Error('server exited before startup: ' + code + ' ' + output));
        });
    });
}

function stopServer(child, signal = 'SIGTERM') {
    if (!child || child.exitCode !== null) return Promise.resolve();
    return new Promise(resolve => {
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
        }, 1000);
        child.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
        child.kill(signal);
    });
}

function connect(origin) {
    return connectClient(origin, { transports: ['websocket'], forceNew: true, reconnection: false });
}

runTest('online restart e2e: 201 action圧縮時のACK消失をfile canonicalから非host復元する', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'machikoro-restart-e2e-'));
    const storeFile = path.join(tempDir, 'canonical.json');
    const port = await availablePort();
    const origin = 'http://127.0.0.1:' + port;
    let child = null;
    let sockets = [];

    try {
        child = await startServer(port, storeFile);
        sockets = [connect(origin), connect(origin)];
        await Promise.all(sockets.map(socket => onceEvent(socket, 'connect')));
        const gameStarts = sockets.map(socket => onceEvent(socket, 'gameStart'));
        const createdPromise = onceEvent(sockets[0], 'roomCreated');
        sockets[0].emit('createRoom', {
            playerName: PLAYER_NAMES[0],
            playerCount: 2,
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            clientVersion: 'restart-e2e',
        });
        const created = await createdPromise;
        const joinedPromise = onceEvent(sockets[1], 'roomJoined');
        sockets[1].emit('joinRoom', {
            roomId: created.roomId,
            playerName: PLAYER_NAMES[1],
            clientVersion: 'restart-e2e',
        });
        const joined = await joinedPromise;
        const starts = await Promise.all(gameStarts);
        assert.deepStrictEqual(starts[0].playerOrder, starts[1].playerOrder);
        const gameStartPayload = starts[0];
        const tokens = [created.reconnectToken, joined.reconnectToken];
        let warmSeq = 0;
        let gamePosition = 0;
        async function sendWarmAction(action, data) {
            const originalIndex = gameStartPayload.playerOrder[gamePosition];
            const promise = onceEvent(sockets[originalIndex], 'actionAccepted');
            sockets[originalIndex].emit('gameAction', {
                action,
                data,
                clientActionId: 'restart-warm-' + (warmSeq + 1),
            });
            const accepted = await promise;
            warmSeq++;
            assert.strictEqual(accepted.seq, warmSeq);
            return accepted;
        }
        for (let turn = 0; turn < 100; turn++) {
            await sendWarmAction('rollDice', { forceDice: 1, tunaDice: [1, 1] });
            await sendWarmAction('nextTurn', {});
            gamePosition = (gamePosition + 1) % 2;
        }
        assert.strictEqual(warmSeq, 200);
        const targetSeq = 201;
        const actorIndex = gameStartPayload.playerOrder[gamePosition];
        const observerIndex = actorIndex === 0 ? 1 : 0;
        const clientActionId = 'restart-ack-loss-1';
        const observedPromise = onceEvent(sockets[observerIndex], 'gameAction');
        let droppedAck = null;
        const originalOnevent = sockets[actorIndex].onevent;
        sockets[actorIndex].onevent = function(packet) {
            if (packet.data?.[0] === 'actionAccepted' && packet.data?.[1]?.clientActionId === clientActionId && !droppedAck) {
                droppedAck = packet.data[1];
                return;
            }
            return originalOnevent.call(this, packet);
        };

        sockets[actorIndex].emit('gameAction', {
            action: 'rollDice',
            data: { forceDice: 1, tunaDice: [1, 1] },
            clientActionId,
        });
        const observed = await observedPromise;
        assert.strictEqual(observed.seq, targetSeq);
        assert.strictEqual(observed.clientActionId, clientActionId);
        await new Promise(resolve => setTimeout(resolve, 50));
        assert.ok(droppedAck, '最初のactionAcceptedをclient application層で決定的にdropすること');
        assert.ok(fs.existsSync(storeFile), 'ACK前にcanonical stateがfileへ保存されること');
        const persisted = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
        const persistedRoom = persisted.records.find(record => record.roomId === created.roomId);
        assert.ok(persistedRoom, '対象roomがcanonical fileに存在すること');
        assert.strictEqual(persistedRoom.actionSeq, targetSeq);
        assert.ok(persistedRoom.stateSnapshot && persistedRoom.stateSnapshot.actionSeq === targetSeq,
            '201 action目がsnapshotへ圧縮されること');
        assert.deepStrictEqual(persistedRoom.actionLog, []);
        assert.ok(persistedRoom.acceptedClientActions.some(entry => entry.clientActionId === clientActionId && entry.seq === targetSeq));

        await stopServer(child, 'SIGKILL');
        sockets.forEach(socket => socket.close());
        sockets = [];
        child = await startServer(port, storeFile);

        const recreatorIndex = 1;
        const recreator = connect(origin);
        sockets.push(recreator);
        await onceEvent(recreator, 'connect');
        const recreatedPromise = onceEvent(recreator, 'rejoinData');
        recreator.emit('recreateRoom', {
            roomId: created.roomId,
            gameStartPayload,
            stateSnapshot: null,
            actionLog: [],
            restoreAudit: null,
            playerIndex: recreatorIndex,
            playerName: PLAYER_NAMES[recreatorIndex],
            reconnectToken: tokens[recreatorIndex],
        });
        const recreated = await recreatedPromise;
        assert.strictEqual(recreated.playerIndex, recreatorIndex);
        assert.ok(recreated.stateSnapshot && recreated.stateSnapshot.actionSeq === targetSeq);
        assert.deepStrictEqual(recreated.stateSnapshot, persistedRoom.stateSnapshot,
            'file canonicalの圧縮stateを欠落なく復元すること');
        assert.ok(recreated.acceptedClientActions.some(entry => entry.clientActionId === clientActionId && entry.seq === targetSeq));

        const socketsByIndex = { [recreatorIndex]: recreator };
        const otherIndex = recreatorIndex === 0 ? 1 : 0;
        const otherSocket = connect(origin);
        sockets.push(otherSocket);
        socketsByIndex[otherIndex] = otherSocket;
        await onceEvent(otherSocket, 'connect');
        const rejoinedPromise = onceEvent(otherSocket, 'rejoinData');
        otherSocket.emit('rejoinRoom', {
            roomId: created.roomId,
            playerIndex: otherIndex,
            playerName: PLAYER_NAMES[otherIndex],
            reconnectToken: tokens[otherIndex],
            clientVersion: 'restart-e2e',
        });
        await rejoinedPromise;
        const actorSocket = socketsByIndex[actorIndex];
        const broadcastObserver = socketsByIndex[actorIndex === 0 ? 1 : 0];

        let duplicateBroadcasts = 0;
        broadcastObserver.on('gameAction', entry => {
            if (entry.clientActionId === clientActionId) duplicateBroadcasts++;
        });
        const dedupePromise = onceEvent(actorSocket, 'actionAccepted');
        actorSocket.emit('gameAction', {
            action: 'rollDice',
            data: { forceDice: 6, tunaDice: [6, 6] },
            clientActionId,
        });
        const deduplicated = await dedupePromise;
        assert.strictEqual(deduplicated.seq, targetSeq);
        assert.strictEqual(deduplicated.clientActionId, clientActionId);
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.strictEqual(duplicateBroadcasts, 0, 'dedupe ACKを他clientへ再broadcastしないこと');

        const nextAcceptedPromise = onceEvent(actorSocket, 'actionAccepted');
        const nextBroadcastPromise = onceEvent(broadcastObserver, 'gameAction');
        actorSocket.emit('gameAction', {
            action: 'nextTurn',
            data: {},
            clientActionId: 'restart-after-restore-202',
        });
        const [nextAccepted, nextBroadcast] = await Promise.all([nextAcceptedPromise, nextBroadcastPromise]);
        assert.strictEqual(nextAccepted.seq, targetSeq + 1);
        assert.strictEqual(nextBroadcast.seq, targetSeq + 1);
        assert.strictEqual(nextAccepted.clientActionId, 'restart-after-restore-202');
    } finally {
        sockets.forEach(socket => socket.close());
        await stopServer(child);
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
