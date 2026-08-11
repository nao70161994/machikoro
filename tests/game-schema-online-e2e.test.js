'use strict';

const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const {
    configureSocketE2EHeartbeat,
    onceSocketEvent: onceEvent,
} = require('./helpers/socket-e2e');

process.env.CANONICAL_STATE_STORE = 'noop';
process.env.EXISTING_ROOM_REJOIN_EFFECT_AUTHORITY_ENABLED = '1';
process.env.GAME_SCHEMA_NEGOTIATION_ENABLED = '1';
process.env.GAME_SCHEMA_SHADOW_ENABLED = '1';
process.env.GAME_ENGINE_TRANSITION_AUTHORITY_ENABLED = '1';
process.env.GAME_SCHEMA_WIRE_ENABLED = '1';
process.env.GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED = '1';
process.env.GAME_SCHEMA_RECREATE_WIRE_ENABLED = '1';
const serverModule = require('../server');
const { DEFAULT_RECREATE_COOLDOWN_MS } = require('../server/recreateSocketHandler');
const connectClient = require('socket.io-client');

const CAPABILITIES = Object.freeze({ actionVersions: [0, 1], snapshotVersions: [0, 1] });

function connect(origin) {
    return connectClient(origin, { transports: ['websocket'], forceNew: true, reconnection: false });
}

function capabilityPayload(payload, capabilities) {
    if (capabilities !== undefined) payload.gameSchemaCapabilities = capabilities;
    return payload;
}

async function startPair(origin, host, guest, suffix, hostCapabilities, guestCapabilities) {
    const starts = [onceEvent(host, 'gameStart'), onceEvent(guest, 'gameStart')];
    const createdPromise = onceEvent(host, 'roomCreated');
    host.emit('createRoom', capabilityPayload({
        playerName: 'Host-' + suffix, playerCount: 2,
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        clientVersion: 'schema-e2e',
    }, hostCapabilities));
    const created = await createdPromise;
    const joinedPromise = onceEvent(guest, 'roomJoined');
    guest.emit('joinRoom', capabilityPayload({
        roomId: created.roomId, playerName: 'Guest-' + suffix, clientVersion: 'schema-e2e',
    }, guestCapabilities));
    const joined = await joinedPromise;
    const gameStarts = await Promise.all(starts);
    return { created, joined, gameStarts };
}

runTest('schema negotiation online e2e: opt-in・legacy fallback・rejoin gateを実transportで固定する', async () => {
    const httpServer = serverModule.__io.httpServer;
    const restoreHeartbeat = configureSocketE2EHeartbeat(serverModule.__io);
    await new Promise((resolve, reject) => { httpServer.once('error', reject); httpServer.listen(0, '127.0.0.1', resolve); });
    const origin = 'http://127.0.0.1:' + httpServer.address().port;
    const clients = Array.from({ length: 4 }, () => connect(origin));
    let rejoined = null;
    let legacyAttempt = null;
    let recreateProbe = null;
    try {
        await Promise.all(clients.map(socket => onceEvent(socket, 'connect')));
        const html = await (await fetch(origin + '/')).text();
        assert.ok(html.includes('window.MACHIKORO_GAME_SCHEMA_NEGOTIATION_ENABLED=true;'));
        assert.ok(html.includes('js/gameSchemaNegotiation.js'));
        assert.ok(html.includes('window.MACHIKORO_GAME_SCHEMA_WIRE_ENABLED=true;'));
        assert.ok(html.includes('window.MACHIKORO_GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED=true;'));
        assert.ok(html.includes('window.MACHIKORO_GAME_SCHEMA_RECREATE_WIRE_ENABLED=true;'));

        const currentRoom = await startPair(origin, clients[0], clients[1], 'current', CAPABILITIES, CAPABILITIES);
        currentRoom.gameStarts.forEach(start => assert.deepStrictEqual(start.gameSchema, { actionVersion: 1, snapshotVersion: 1 }));
        const currentStart = currentRoom.gameStarts[0];
        const currentOriginalIndex = currentStart.playerOrder[0];
        const currentSocket = currentOriginalIndex === currentRoom.created.playerIndex ? clients[0] : clients[1];
        const rejectedLegacyWire = onceEvent(currentSocket, 'appError');
        currentSocket.emit('gameAction', {
            action: 'rollDice', data: {}, clientActionId: 'schema-shadow-legacy-rejected',
        });
        assert.strictEqual(await rejectedLegacyWire, '無効な操作です');
        const acceptedPromise = onceEvent(currentSocket, 'actionAccepted');
        currentSocket.emit('gameAction', {
            schemaVersion: 1, action: 'rollDice', data: {}, clientActionId: 'schema-shadow-roll-1',
        });
        const accepted = await acceptedPromise;
        assert.strictEqual(accepted.schemaVersion, 1);
        assert.strictEqual(accepted.action, 'rollDice');
        assert.strictEqual(
            serverModule.__rooms[currentRoom.created.roomId].lastGameSchemaShadow.status,
            'matched'
        );
        assert.deepStrictEqual(
            serverModule.__rooms[currentRoom.created.roomId].lastGameEngineAuthority,
            { authority: 'pure-transition', reason: '' }
        );

        const currentSnapshot = { actionSeq: 1, phase: 'roll', marker: 'snapshot-wire-e2e' };
        serverModule.__rooms[currentRoom.created.roomId].stateSnapshot = currentSnapshot;
        const duplicateActionId = 'schema-snapshot-duplicate';
        const currentServerRoom = serverModule.__rooms[currentRoom.created.roomId];
        currentServerRoom.acceptedClientActions[
            `${currentOriginalIndex}:${duplicateActionId}`
        ] = {
            action: 'rollDice',
            data: { forceDice: 1, tunaDice: [1, 1] },
            playerIndex: currentOriginalIndex,
            seq: 2,
            clientActionId: duplicateActionId,
            stateSnapshot: currentSnapshot,
            restoreAudit: { schemaVersion: 1, signature: 'snapshot-wire-e2e' },
        };
        const compactedAcceptedPromise = onceEvent(currentSocket, 'actionAccepted');
        currentSocket.emit('gameAction', {
            schemaVersion: 1,
            action: 'rollDice',
            data: {},
            clientActionId: duplicateActionId,
        });
        const compactedAccepted = await compactedAcceptedPromise;
        assert.deepStrictEqual(compactedAccepted.stateSnapshot, {
            schemaVersion: 1,
            snapshot: currentSnapshot,
        });
        clients[1].close();
        rejoined = connect(origin);
        await onceEvent(rejoined, 'connect');
        const rejoinDataPromise = onceEvent(rejoined, 'rejoinData');
        rejoined.emit('rejoinRoom', capabilityPayload({
            roomId: currentRoom.created.roomId, playerIndex: currentRoom.joined.playerIndex,
            playerName: 'Guest-current', reconnectToken: currentRoom.joined.reconnectToken,
            clientVersion: 'schema-e2e',
        }, CAPABILITIES));
        const rejoinData = await rejoinDataPromise;
        assert.deepStrictEqual(rejoinData.gameStartPayload.gameSchema, { actionVersion: 1, snapshotVersion: 1 });
        assert.deepStrictEqual(rejoinData.stateSnapshot, {
            schemaVersion: 1,
            snapshot: currentSnapshot,
        });

        legacyAttempt = connect(origin);
        await onceEvent(legacyAttempt, 'connect');
        const unsupportedPromise = onceEvent(legacyAttempt, 'appError');
        legacyAttempt.emit('rejoinRoom', {
            roomId: currentRoom.created.roomId, playerIndex: currentRoom.joined.playerIndex,
            playerName: 'Guest-current', reconnectToken: currentRoom.joined.reconnectToken,
            clientVersion: 'legacy-schema-e2e',
        });
        assert.strictEqual(await unsupportedPromise, 'SCHEMA_VERSION_UNSUPPORTED');

        recreateProbe = connect(origin);
        await onceEvent(recreateProbe, 'connect');
        const malformedRecreatePromise = onceEvent(recreateProbe, 'appError');
        recreateProbe.emit('recreateRoom', {
            schemaVersion: 1,
            recreateRoom: {
                roomId: currentRoom.created.roomId,
                gameStartPayload: currentStart,
                stateSnapshot: { schemaVersion: 99, snapshot: currentSnapshot },
                actionLog: [],
                playerIndex: currentRoom.created.playerIndex,
                playerName: 'Host-current',
                reconnectToken: currentRoom.created.reconnectToken,
            },
        });
        assert.strictEqual(await malformedRecreatePromise, '復元データが不完全です');

        const validRecreatePayload = {
            schemaVersion: 1,
            recreateRoom: {
                roomId: currentRoom.created.roomId,
                gameStartPayload: currentStart,
                stateSnapshot: { schemaVersion: 1, snapshot: currentSnapshot },
                actionLog: [{
                    schemaVersion: 1,
                    action: 'rollDice',
                    data: {},
                    playerIndex: currentOriginalIndex,
                    seq: 1,
                    clientActionId: 'schema-recreate-roll-1',
                }],
                restoreAudit: null,
                playerIndex: currentRoom.created.playerIndex,
                playerName: 'Host-current',
                reconnectToken: currentRoom.created.reconnectToken,
            },
        };
        const cooldownErrorPromise = onceEvent(recreateProbe, 'appError');
        recreateProbe.emit('recreateRoom', validRecreatePayload);
        assert.strictEqual(await cooldownErrorPromise, '復元処理を続けて実行できません');

        await new Promise(resolve => setTimeout(resolve, DEFAULT_RECREATE_COOLDOWN_MS + 50));
        const recreatedRejoinPromise = onceEvent(recreateProbe, 'rejoinData');
        recreateProbe.emit('recreateRoom', validRecreatePayload);
        const recreatedRejoin = await recreatedRejoinPromise;
        assert.strictEqual(recreatedRejoin.playerIndex, currentRoom.created.playerIndex);
        assert.deepStrictEqual(recreatedRejoin.gameStartPayload.gameSchema, {
            actionVersion: 1,
            snapshotVersion: 1,
        });

        const legacyRoom = await startPair(origin, clients[2], clients[3], 'legacy', CAPABILITIES, undefined);
        legacyRoom.gameStarts.forEach(start => assert.deepStrictEqual(start.gameSchema, { actionVersion: 0, snapshotVersion: 0 }));
        const legacyStart = legacyRoom.gameStarts[0];
        const legacyOriginalIndex = legacyStart.playerOrder[0];
        const legacySocket = legacyOriginalIndex === legacyRoom.created.playerIndex ? clients[2] : clients[3];
        const legacyAcceptedPromise = onceEvent(legacySocket, 'actionAccepted');
        legacySocket.emit('gameAction', {
            action: 'rollDice', data: {}, clientActionId: 'schema-legacy-roll-1',
        });
        const legacyAccepted = await legacyAcceptedPromise;
        assert.strictEqual(Object.prototype.hasOwnProperty.call(legacyAccepted, 'schemaVersion'), false);
    } finally {
        clients.forEach(socket => socket.close());
        if (rejoined) rejoined.close();
        if (legacyAttempt) legacyAttempt.close();
        if (recreateProbe) recreateProbe.close();
        await new Promise(resolve => serverModule.__io.close(resolve));
        restoreHeartbeat();
    }
});
