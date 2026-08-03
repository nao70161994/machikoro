'use strict';

function requiredFunction(name, candidate) {
    if (typeof candidate !== 'function') throw new TypeError(`${name} must be a function`);
    return candidate;
}

function executeGameStartEffects(context, effects) {
    const markRoomGameStarted = requiredFunction('markRoomGameStarted', effects?.markRoomGameStarted);
    const emitGameStart = requiredFunction('emitGameStart', effects?.emitGameStart);
    const logGameStarted = requiredFunction('logGameStarted', effects?.logGameStarted);

    markRoomGameStarted(context.room, context.payload);
    emitGameStart(context.roomId, context.payload);
    logGameStarted(context.roomId, context.payload);
}

module.exports = { executeGameStartEffects };
