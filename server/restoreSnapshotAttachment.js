'use strict';

function makeRestoreSnapshotAttachment({ maxActionLogLength, buildRestoreSnapshotAudit }) {
    if (!Number.isInteger(maxActionLogLength) || maxActionLogLength < 0) {
        throw new TypeError('maxActionLogLength must be a non-negative integer');
    }
    if (typeof buildRestoreSnapshotAudit !== 'function') {
        throw new TypeError('buildRestoreSnapshotAudit must be a function');
    }

    function attachCompactedRestoreSnapshotToAction(roomId, room, actionEntry, actionLogLengthBeforeCompact) {
        if (!room || !actionEntry || !room.stateSnapshot) return null;
        if (!Number.isInteger(actionLogLengthBeforeCompact) || actionLogLengthBeforeCompact <= maxActionLogLength) return null;
        if (Array.isArray(room.actionLog) && room.actionLog.length !== 0) return null;
        const restoreAudit = buildRestoreSnapshotAudit(roomId, room.gameStartPayload, room.stateSnapshot);
        if (!restoreAudit) return null;
        actionEntry.stateSnapshot = room.stateSnapshot;
        actionEntry.restoreAudit = restoreAudit;
        return { stateSnapshot: actionEntry.stateSnapshot, restoreAudit };
    }

    return { attachCompactedRestoreSnapshotToAction };
}

module.exports = makeRestoreSnapshotAttachment;
