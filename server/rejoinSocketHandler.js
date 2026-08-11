'use strict';

function registerRejoinSocketHandler(socket, dependencies) {
    const {
        requirePlainSocketPayload,
        isValidRoomId,
        validateSocketCanEnterRoom,
        emitAppError,
        rooms,
        getExpectedReconnectTokenHash,
        hashReconnectToken,
        detachExistingPlayerSocket,
        resolveRejoinPlayer,
        buildRejoinDataPayload,
        isRoomHostConnected,
        setRoomHostPlayerIndex,
        emitRoomHostChanged,
        persistRoomCanonicalState,
        io,
    } = dependencies;
    const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now;
    const log = typeof dependencies.log === 'function' ? dependencies.log : console.log;
    const resolveGameSchemaCapabilities = typeof dependencies.resolveClientGameSchemaCapabilities === 'function'
        ? dependencies.resolveClientGameSchemaCapabilities
        : (() => ({ ok: true, capabilities: null, reason: '' }));
    const supportsSelectedSchema = typeof dependencies.supportsSelectedGameSchema === 'function'
        ? dependencies.supportsSelectedGameSchema
        : (() => true);

    socket.on('rejoinRoom', payload => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        const { roomId, playerIndex, playerName, reconnectToken, clientVersion, hostlessRestoreVersion, gameSchemaCapabilities } = payload;
        socket.clientVersion = clientVersion || 'unknown';
        socket.hostlessRestoreVersion = hostlessRestoreVersion === 1 ? 1 : 0;
        if (!isValidRoomId(roomId)) { emitAppError(socket, 'ROOM_NOT_FOUND'); return; }
        const room = rooms[roomId];
        if (!room) { emitAppError(socket, 'ROOM_NOT_FOUND'); return; }
        if (!room.started) { emitAppError(socket, 'ゲームはまだ開始されていません'); return; }
        const roomEntry = validateSocketCanEnterRoom(socket, roomId, rooms);
        if (!roomEntry.ok) { emitAppError(socket, roomEntry.message); return; }
        const expectedReconnectTokenHash = getExpectedReconnectTokenHash(room, playerIndex, playerName);
        if (!expectedReconnectTokenHash || hashReconnectToken(reconnectToken) !== expectedReconnectTokenHash) {
            emitAppError(socket, 'INVALID_TOKEN');
            return;
        }

        const schemaResolution = resolveGameSchemaCapabilities(gameSchemaCapabilities);
        if (!schemaResolution.ok) { emitAppError(socket, 'SCHEMA_CAPABILITY_INVALID'); return; }
        if (!supportsSelectedSchema(schemaResolution.capabilities, room.gameStartPayload && room.gameStartPayload.gameSchema)) {
            emitAppError(socket, 'SCHEMA_VERSION_UNSUPPORTED');
            return;
        }
        socket.gameSchemaCapabilities = schemaResolution.capabilities;
        detachExistingPlayerSocket(room, roomId, playerIndex, socket.id);
        const player = resolveRejoinPlayer(room, playerIndex, playerName, reconnectToken, socket.id);
        if (!player) { emitAppError(socket, '再接続情報が一致しません'); return; }
        player.gameSchemaCapabilities = schemaResolution.capabilities;

        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = playerIndex;
        if (!isRoomHostConnected(room)) {
            setRoomHostPlayerIndex(room, playerIndex);
            emitRoomHostChanged(roomId, room, io);
            persistRoomCanonicalState(roomId, room, 'host-reselected');
            log(`ホスト再選出: ${roomId} → プレイヤー${room.hostPlayerIndex}`);
        }
        room.lastTouchedAt = now();

        socket.emit('rejoinData', buildRejoinDataPayload(room, playerIndex));
        io.to(roomId).emit('playerRejoined', { playerIndex, playerName });
        log(`再接続: ${playerName} (ルーム: ${roomId})`);
    });
}

module.exports = Object.freeze({ registerRejoinSocketHandler });
