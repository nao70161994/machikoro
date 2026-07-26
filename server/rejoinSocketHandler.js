'use strict';

function registerRejoinSocketHandler(socket, dependencies) {
    const {
        requirePlainSocketPayload,
        isValidRoomId,
        emitAppError,
        rooms,
        getExpectedReconnectTokenHash,
        hashReconnectToken,
        detachExistingPlayerSocket,
        resolveRejoinPlayer,
        buildRejoinDataPayload,
        io,
    } = dependencies;
    const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now;
    const log = typeof dependencies.log === 'function' ? dependencies.log : console.log;

    socket.on('rejoinRoom', payload => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        const { roomId, playerIndex, playerName, reconnectToken, clientVersion, hostlessRestoreVersion } = payload;
        socket.clientVersion = clientVersion || 'unknown';
        socket.hostlessRestoreVersion = hostlessRestoreVersion === 1 ? 1 : 0;
        if (!isValidRoomId(roomId)) { emitAppError(socket, 'ROOM_NOT_FOUND'); return; }
        const room = rooms[roomId];
        if (!room) { emitAppError(socket, 'ROOM_NOT_FOUND'); return; }
        if (!room.started) { emitAppError(socket, 'ゲームはまだ開始されていません'); return; }
        const expectedReconnectTokenHash = getExpectedReconnectTokenHash(room, playerIndex, playerName);
        if (!expectedReconnectTokenHash || hashReconnectToken(reconnectToken) !== expectedReconnectTokenHash) {
            emitAppError(socket, 'INVALID_TOKEN');
            return;
        }

        detachExistingPlayerSocket(room, roomId, playerIndex, socket.id);
        const player = resolveRejoinPlayer(room, playerIndex, playerName, reconnectToken, socket.id);
        if (!player) { emitAppError(socket, '再接続情報が一致しません'); return; }

        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = playerIndex;
        room.lastTouchedAt = now();

        socket.emit('rejoinData', buildRejoinDataPayload(room, playerIndex));
        io.to(roomId).emit('playerRejoined', { playerIndex, playerName });
        log(`再接続: ${playerName} (ルーム: ${roomId})`);
    });
}

module.exports = Object.freeze({ registerRejoinSocketHandler });
