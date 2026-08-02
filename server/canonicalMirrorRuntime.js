'use strict';

const BUILD_ACTIONS = Object.freeze(['buildCard', 'buildLandmark']);
const CLEAR_UNDO_ACTIONS = Object.freeze(['undoBuild', 'nextTurn']);

function requiredFunction(name, candidate) {
    if (typeof candidate !== 'function') throw new TypeError(`${name} must be a function`);
    return candidate;
}

function makeCanonicalMirrorRuntime(dependencies) {
    const roomCanonicalMirrorMarker = requiredFunction('roomCanonicalMirrorMarker', dependencies?.roomCanonicalMirrorMarker);
    const canonicalMirrorStateHash = requiredFunction('canonicalMirrorStateHash', dependencies?.canonicalMirrorStateHash);
    const createRoomMirror = requiredFunction('createRoomMirror', dependencies?.createRoomMirror);
    const makeUndoStateFromMirror = requiredFunction('makeUndoStateFromMirror', dependencies?.makeUndoStateFromMirror);
    const applyActionToMirror = requiredFunction('applyActionToMirror', dependencies?.applyActionToMirror);
    const createCardByName = requiredFunction('createCardByName', dependencies?.createCardByName);
    const now = requiredFunction('now', dependencies?.now);
    const warn = requiredFunction('warn', dependencies?.warn);

    function recordCanonicalMirrorMismatch(room, marker, previousHash, rebuiltHash) {
        if (!room || !previousHash || !rebuiltHash || previousHash === rebuiltHash) return;
        room.lastCanonicalMirrorMismatch = {
            previousHash,
            rebuiltHash,
            marker,
            detectedAt: now(),
        };
        warn('canonical mirror mismatch detected', {
            roomId: room.roomId || null,
            previousHash,
            rebuiltHash,
            marker,
        });
    }

    function markRoomCanonicalMirrorCurrent(room) {
        const marker = roomCanonicalMirrorMarker(room);
        room.canonicalMirrorActionSeq = marker.actionSeq;
        room.canonicalMirrorActionLogLength = marker.actionLogLength;
        room.canonicalMirrorStateHash = canonicalMirrorStateHash(room.canonicalMirror);
    }

    function resetRoomCanonicalMirror(room) {
        room.canonicalMirror = createRoomMirror(room);
        markRoomCanonicalMirrorCurrent(room);
        return room.canonicalMirror;
    }

    function getRoomCanonicalMirror(room) {
        if (!room) return null;
        const marker = roomCanonicalMirrorMarker(room);
        if (!room.canonicalMirror ||
                room.canonicalMirrorActionSeq !== marker.actionSeq ||
                room.canonicalMirrorActionLogLength !== marker.actionLogLength) {
            const recordedHash = room.canonicalMirrorStateHash;
            const currentHash = canonicalMirrorStateHash(room.canonicalMirror);
            const mirror = createRoomMirror(room);
            const rebuiltHash = canonicalMirrorStateHash(mirror);
            if (recordedHash && currentHash && recordedHash !== currentHash) {
                recordCanonicalMirrorMismatch(room, marker, currentHash, rebuiltHash);
            }
            room.canonicalMirror = mirror;
            markRoomCanonicalMirrorCurrent(room);
            return room.canonicalMirror;
        }
        return room.canonicalMirror;
    }

    function applyAcceptedActionToRoomCanonicalMirror(room, mirror, actionEntry) {
        if (!room || !mirror || !actionEntry) return false;
        const { action, data } = actionEntry;
        if (BUILD_ACTIONS.includes(action)) {
            mirror.lastUndoState = makeUndoStateFromMirror(mirror.game, mirror.shopStock);
        }
        const ok = applyActionToMirror(
            mirror.game,
            mirror.shopStock,
            action,
            data,
            createCardByName
        ) !== false;
        if (!ok) return false;
        if (CLEAR_UNDO_ACTIONS.includes(action)) mirror.lastUndoState = null;
        room.canonicalMirror = mirror;
        return true;
    }

    return Object.freeze({
        recordCanonicalMirrorMismatch,
        markRoomCanonicalMirrorCurrent,
        resetRoomCanonicalMirror,
        getRoomCanonicalMirror,
        applyAcceptedActionToRoomCanonicalMirror,
    });
}

module.exports = {
    BUILD_ACTIONS,
    CLEAR_UNDO_ACTIONS,
    makeCanonicalMirrorRuntime,
};
