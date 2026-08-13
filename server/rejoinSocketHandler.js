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
        admitRejoin,
        detachExistingPlayerSocket,
        resolveRejoinPlayer,
        buildRejoinDataPayload,
        isRoomHostConnected,
        setRoomHostPlayerIndex,
        emitRoomHostChanged,
        persistRoomCanonicalState,
        io,
        pruneExpiredWaitingReservations,
        isWaitingReservation,
        buildPlayerList,
        checkGameStart,
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
        if (!room.started) pruneExpiredWaitingReservations(room, now());
        const roomEntry = validateSocketCanEnterRoom(socket, roomId, rooms);
        if (!roomEntry.ok) { emitAppError(socket, roomEntry.message); return; }
        const expectedReconnectTokenHash = getExpectedReconnectTokenHash(room, playerIndex, playerName);
        if (!expectedReconnectTokenHash || hashReconnectToken(reconnectToken) !== expectedReconnectTokenHash) {
            emitAppError(socket, 'INVALID_TOKEN');
            return;
        }

        const schemaResolution = resolveGameSchemaCapabilities(gameSchemaCapabilities);
        if (!schemaResolution.ok) { emitAppError(socket, 'SCHEMA_CAPABILITY_INVALID'); return; }
        if (!room.started) {
            const reservedPlayer = room.players.find(player =>
                player.index === playerIndex && player.name === playerName);
            if (!isWaitingReservation(reservedPlayer, now())) {
                emitAppError(socket, 'WAITING_RESERVATION_EXPIRED');
                return;
            }
            socket.gameSchemaCapabilities = schemaResolution.capabilities;
            const admission = admitRejoin(socket, roomId, playerIndex);
            if (!admission.ok) { emitAppError(socket, admission.message); return; }
            reservedPlayer.id = socket.id;
            delete reservedPlayer.reservedUntil;
            reservedPlayer.gameSchemaCapabilities = schemaResolution.capabilities;
            socket.join(roomId);
            socket.roomId = roomId;
            socket.playerIndex = playerIndex;
            room.lastTouchedAt = now();
            socket.emit('roomJoined', {
                roomId, playerIndex, reconnectToken, hostPlayerIndex: room.hostPlayerIndex,
            });
            io.to(roomId).emit('playerList', buildPlayerList(room));
            checkGameStart(io, roomId);
            log(`待機室へ再接続: ${playerName} (ルーム: ${roomId})`);
            return;
        }
        if (!supportsSelectedSchema(schemaResolution.capabilities, room.gameStartPayload && room.gameStartPayload.gameSchema)) {
            emitAppError(socket, 'SCHEMA_VERSION_UNSUPPORTED');
            return;
        }
        socket.gameSchemaCapabilities = schemaResolution.capabilities;
        const admission = admitRejoin(socket, roomId, playerIndex);
        if (!admission.ok) { emitAppError(socket, admission.message); return; }
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
