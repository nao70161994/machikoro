'use strict';

function makeGameStartLifecycle(dependencies) {
    if (!dependencies || typeof dependencies.resetRoomCanonicalMirror !== 'function') {
        throw new TypeError('resetRoomCanonicalMirror must be a function');
    }
    if (typeof dependencies.persistRoomCanonicalState !== 'function') {
        throw new TypeError('persistRoomCanonicalState must be a function');
    }
    const { resetRoomCanonicalMirror, persistRoomCanonicalState } = dependencies;

    function markRoomGameStarted(room, gameStartPayload, now = Date.now()) {
        room.started = true;
        room.gameStartPayload = gameStartPayload;
        room.stateSnapshot = null;
        room.actionLog = [];
        room.lastUndoState = null;
        resetRoomCanonicalMirror(room);
        room.lastTouchedAt = now;
        const persistence = persistRoomCanonicalState(room.roomId, room, 'game-start', now);
        if (persistence && persistence.errorCode === 'CANONICAL_STATE_UNAVAILABLE') {
            room.canonicalStateUnavailable = true;
            return false;
        }
    }

    return Object.freeze({ markRoomGameStarted });
}

module.exports = makeGameStartLifecycle;
