'use strict';

const ONLINE_REMATCH_IDENTITY_EVENT = 'onlineRematchIdentity';

function isPreviousGenerationToken(room, player, payloadGeneration, presentedTokenHash) {
    if (!room?.started || !player || player.id ||
            !Number.isSafeInteger(payloadGeneration) || payloadGeneration < 0) {
        return false;
    }
    if (!Number.isSafeInteger(room.gameGeneration) || room.gameGeneration <= 0 ||
            (payloadGeneration !== room.gameGeneration - 1 &&
            payloadGeneration !== room.gameGeneration)) return false;
    return player.previousReconnectTokenGeneration === room.gameGeneration - 1 &&
        typeof player.previousReconnectTokenHash === 'string' &&
        player.previousReconnectTokenHash !== '' &&
        presentedTokenHash === player.previousReconnectTokenHash;
}

function consumePreviousGenerationToken(roomId, room, player, persistRoomCanonicalState) {
    const hadPreviousGenerationToken = Object.prototype.hasOwnProperty.call(
        player, 'previousReconnectTokenHash'
    ) || Object.prototype.hasOwnProperty.call(player, 'previousReconnectTokenGeneration');
    if (!hadPreviousGenerationToken) return false;
    delete player.previousReconnectTokenHash;
    delete player.previousReconnectTokenGeneration;
    persistRoomCanonicalState(roomId, room, 'rematch-reconnect-token-consumed');
    return true;
}

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
        buildLobbyState,
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
        const {
            roomId, playerIndex, playerName, reconnectToken, gameGeneration,
            clientVersion, hostlessRestoreVersion, gameSchemaCapabilities,
        } = payload;
        socket.clientVersion = clientVersion || 'unknown';
        socket.hostlessRestoreVersion = hostlessRestoreVersion === 1 ? 1 : 0;
        if (!isValidRoomId(roomId)) { emitAppError(socket, 'ROOM_NOT_FOUND'); return; }
        const room = rooms[roomId];
        if (!room) { emitAppError(socket, 'ROOM_NOT_FOUND'); return; }
        if (!room.started) pruneExpiredWaitingReservations(room, now());
        const roomEntry = validateSocketCanEnterRoom(socket, roomId, rooms);
        if (!roomEntry.ok) { emitAppError(socket, roomEntry.message); return; }
        const expectedReconnectTokenHash = getExpectedReconnectTokenHash(room, playerIndex, playerName);
        if (!expectedReconnectTokenHash) {
            emitAppError(socket, 'INVALID_TOKEN');
            return;
        }
        const presentedReconnectTokenHash = hashReconnectToken(reconnectToken);
        const tokenPlayer = Array.isArray(room.players) ? room.players.find(player =>
            player.index === playerIndex && player.name === playerName) : null;
        const usesPreviousGenerationToken = expectedReconnectTokenHash !== presentedReconnectTokenHash &&
            isPreviousGenerationToken(room, tokenPlayer, gameGeneration, presentedReconnectTokenHash);
        if (presentedReconnectTokenHash !== expectedReconnectTokenHash && !usesPreviousGenerationToken) {
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
            io.to(roomId).emit('playerList', buildPlayerList(room), buildLobbyState(room));
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
        const effectiveReconnectToken = usesPreviousGenerationToken
            ? tokenPlayer && tokenPlayer.reconnectToken
            : reconnectToken;
        const player = resolveRejoinPlayer(
            room, playerIndex, playerName, effectiveReconnectToken, socket.id
        );
        if (!player) { emitAppError(socket, '再接続情報が一致しません'); return; }
        player.gameSchemaCapabilities = schemaResolution.capabilities;

        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = playerIndex;
        if (usesPreviousGenerationToken) {
            const identityGeneration = room.gameGeneration;
            const identityPreviousGeneration = player.previousReconnectTokenGeneration;
            const identityPreviousHash = player.previousReconnectTokenHash;
            try {
                socket.emit(ONLINE_REMATCH_IDENTITY_EVENT, {
                    roomId,
                    playerIndex,
                    reconnectToken: player.reconnectToken,
                    gameGeneration: room.gameGeneration,
                }, () => {
                    if (player.id !== socket.id || socket.roomId !== roomId ||
                            socket.playerIndex !== playerIndex ||
                            room.gameGeneration !== identityGeneration ||
                            player.previousReconnectTokenGeneration !== identityPreviousGeneration ||
                            player.previousReconnectTokenHash !== identityPreviousHash) return;
                    consumePreviousGenerationToken(
                        roomId, room, player, persistRoomCanonicalState
                    );
                });
            } catch (_) {
                player.id = null;
                if (typeof socket.leave === 'function') socket.leave(roomId);
                if (socket.roomId === roomId) delete socket.roomId;
                if (socket.playerIndex === playerIndex) delete socket.playerIndex;
                emitAppError(socket, '再接続情報を更新できませんでした');
                return;
            }
        }
        if (!isRoomHostConnected(room)) {
            setRoomHostPlayerIndex(room, playerIndex);
            emitRoomHostChanged(roomId, room, io);
            persistRoomCanonicalState(roomId, room, 'host-reselected');
            log(`ホスト再選出: ${roomId} → プレイヤー${room.hostPlayerIndex}`);
        }
        room.lastTouchedAt = now();

        if (!usesPreviousGenerationToken) {
            consumePreviousGenerationToken(roomId, room, player, persistRoomCanonicalState);
        }
        socket.emit('rejoinData', buildRejoinDataPayload(room, playerIndex));
        io.to(roomId).emit('playerRejoined', { playerIndex, playerName });
        log(`再接続: ${playerName} (ルーム: ${roomId})`);
    });
}

module.exports = Object.freeze({
    ONLINE_REMATCH_IDENTITY_EVENT,
    consumePreviousGenerationToken,
    isPreviousGenerationToken,
    registerRejoinSocketHandler,
});
