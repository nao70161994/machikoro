'use strict';

const { GAME_START_DECISIONS, planGameStart } = require('./gameStartAdmission');
const { executeGameStartEffects } = require('./gameStartRuntime');

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
        const requiredHumanSlots = room && !room.started
            ? countRoomHumanSlots(room)
            : 0;
        const plan = planGameStart(room, requiredHumanSlots);
        if (plan.decision !== GAME_START_DECISIONS.START) return;

        const gameStartPayload = buildGameStartPayload(io, plan.room);
        if (!gameStartPayload) return;
        executeGameStartEffects({
            roomId,
            room: plan.room,
            payload: gameStartPayload,
        }, {
            markRoomGameStarted,
            emitGameStart: (targetRoomId, payload) => {
                io.to(targetRoomId).emit('gameStart', payload);
            },
            logGameStarted,
        });
    }

    return Object.freeze({ checkGameStart });
}

module.exports = makeGameStartCoordinator;
