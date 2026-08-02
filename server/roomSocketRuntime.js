'use strict';

function makeRoomSocketRuntime({
    defaultIo,
    emitAppError,
    buildRoomHostChangedPayload,
    isRoomHostConnectedForSockets,
}) {
    if (!defaultIo || !defaultIo.sockets || !defaultIo.sockets.sockets ||
        typeof defaultIo.sockets.sockets.get !== 'function') {
        throw new TypeError('defaultIo socket map is required');
    }
    if (typeof emitAppError !== 'function') {
        throw new TypeError('emitAppError must be a function');
    }
    if (typeof buildRoomHostChangedPayload !== 'function') {
        throw new TypeError('buildRoomHostChangedPayload must be a function');
    }
    if (typeof isRoomHostConnectedForSockets !== 'function') {
        throw new TypeError('isRoomHostConnectedForSockets must be a function');
    }

    function roomHostChangedPayload(room) {
        return buildRoomHostChangedPayload(room);
    }

    function emitRoomHostChanged(roomId, room, ioInstance = defaultIo) {
        ioInstance.to(roomId).emit('hostChanged', roomHostChangedPayload(room));
    }

    function detachSocketFromRoom(socketId, roomId, message = 'INVALID_SESSION') {
        if (!socketId) return;
        const oldSocket = defaultIo.sockets.sockets.get(socketId);
        if (!oldSocket) return;
        emitAppError(oldSocket, message);
        oldSocket.leave(roomId);
        if (oldSocket.roomId === roomId) {
            oldSocket.roomId = null;
            oldSocket.playerIndex = null;
        }
    }

    function detachExistingPlayerSocket(room, roomId, playerIndex, newSocketId) {
        const existing = room?.players?.find(player => player.index === playerIndex);
        if (!existing || !existing.id || existing.id === newSocketId) return;
        detachSocketFromRoom(existing.id, roomId, 'INVALID_SESSION');
    }

    function detachRoomSockets(roomId, room, message = 'ROOM_REPLACED') {
        if (!room || !Array.isArray(room.players)) return;
        for (const player of room.players) {
            detachSocketFromRoom(player.id, roomId, message);
            player.id = null;
        }
    }

    function isRoomHostConnected(room) {
        return isRoomHostConnectedForSockets(room, defaultIo.sockets.sockets);
    }

    return {
        roomHostChangedPayload,
        emitRoomHostChanged,
        detachSocketFromRoom,
        detachExistingPlayerSocket,
        detachRoomSockets,
        isRoomHostConnected,
    };
}

module.exports = makeRoomSocketRuntime;
