'use strict';

function requiredFunction(name, candidate) {
    if (typeof candidate !== 'function') throw new TypeError(`${name} must be a function`);
    return candidate;
}

function makeGameStartCoordinator(dependencies) {
    if (!dependencies || !dependencies.rooms || typeof dependencies.rooms !== 'object') {
        throw new TypeError('rooms must be an object');
    }
    const rooms = dependencies.rooms;
    const countRoomHumanSlots = requiredFunction('countRoomHumanSlots', dependencies.countRoomHumanSlots);
    const buildGameStartPayload = requiredFunction('buildGameStartPayload', dependencies.buildGameStartPayload);
    const markRoomGameStarted = requiredFunction('markRoomGameStarted', dependencies.markRoomGameStarted);
    const logGameStarted = requiredFunction('logGameStarted', dependencies.logGameStarted);

    function checkGameStart(io, roomId) {
        const room = rooms[roomId];
        if (!room || room.started) return;
        if (room.players.length < countRoomHumanSlots(room)) return;

        const gameStartPayload = buildGameStartPayload(io, room);
        if (!gameStartPayload) return;
        markRoomGameStarted(room, gameStartPayload);
        io.to(roomId).emit('gameStart', gameStartPayload);
        logGameStarted(roomId, gameStartPayload);
    }

    return Object.freeze({ checkGameStart });
}

module.exports = makeGameStartCoordinator;
