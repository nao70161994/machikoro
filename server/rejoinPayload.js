'use strict';

function makeRejoinPayload({ acceptedClientActionRefs, buildRestoreSnapshotAudit, encodeSnapshotField }) {
    function buildRejoinDataPayload(room, playerIndex, overrides = {}) {
        const gameStartPayload = overrides.gameStartPayload || room.gameStartPayload;
        const stateSnapshot = overrides.stateSnapshot !== undefined ? overrides.stateSnapshot : (room.stateSnapshot || null);
        const payload = {
            gameStartPayload,
            stateSnapshot,
            actionLog: overrides.actionLog || room.actionLog || [],
            acceptedClientActions: acceptedClientActionRefs(room),
            playerIndex,
            hostPlayerIndex: overrides.hostPlayerIndex !== undefined ? overrides.hostPlayerIndex : room.hostPlayerIndex,
            hostEpoch: Number.isInteger(overrides.hostEpoch) ? overrides.hostEpoch : (room.hostEpoch || 0),
        };
        const restoreAudit = overrides.restoreAudit !== undefined
            ? overrides.restoreAudit
            : buildRestoreSnapshotAudit(room.roomId, gameStartPayload, stateSnapshot);
        if (restoreAudit) payload.restoreAudit = restoreAudit;
        if (room.provisionalRestore === true) {
            payload.provisionalRestore = true;
            payload.hostlessRestoreGeneration = room.hostlessRestoreGeneration || 0;
            payload.hostlessRestoreCount = room.hostlessRestoreCount || 0;
        }
        return payload;
    }

    function buildWireRejoinDataPayload(room, playerIndex, overrides = {}, snapshotWireEnabled = false) {
        const payload = buildRejoinDataPayload(room, playerIndex, overrides);
        if (typeof encodeSnapshotField !== 'function') return payload;
        const selection = payload.gameStartPayload && payload.gameStartPayload.gameSchema || null;
        const encoded = encodeSnapshotField(snapshotWireEnabled, selection, payload);
        return encoded && encoded.ok ? encoded.value : null;
    }

    return { buildRejoinDataPayload, buildWireRejoinDataPayload };
}

module.exports = makeRejoinPayload;
