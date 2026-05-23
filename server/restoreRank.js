'use strict';

function restorePayloadRankDetails(gameStartPayload, stateSnapshot, actionLog) {
    const hostEpoch = Number.isInteger(gameStartPayload?.hostEpoch) ? gameStartPayload.hostEpoch : 0;
    const gameStartSeq = Number.isInteger(gameStartPayload?.actionSeq) ? gameStartPayload.actionSeq : 0;
    const snapshotSeq = Number.isInteger(stateSnapshot?.actionSeq) ? stateSnapshot.actionSeq : 0;
    const replayedActionCount = Array.isArray(actionLog)
        ? actionLog.filter(entry => entry && typeof entry.action === 'string').length
        : 0;
    const logSeq = snapshotSeq + replayedActionCount;
    const actionSeq = Math.max(0, snapshotSeq, logSeq);
    const source = replayedActionCount > 0 && actionSeq === logSeq && logSeq > 0
        ? 'actionLog'
        : (actionSeq === snapshotSeq && snapshotSeq > 0 ? 'stateSnapshot' : 'none');
    return {
        hostEpoch,
        actionSeq,
        gameStartSeq,
        snapshotSeq,
        logSeq,
        replayedActionSeq: logSeq,
        replayedActionCount,
        source,
    };
}

function restorePayloadRank(gameStartPayload, stateSnapshot, actionLog) {
    const details = restorePayloadRankDetails(gameStartPayload, stateSnapshot, actionLog);
    return { hostEpoch: details.hostEpoch, actionSeq: details.actionSeq };
}

function isIncomingRestoreNewer(room, gameStartPayload, stateSnapshot, actionLog) {
    const currentRank = restorePayloadRank(room.gameStartPayload, room.stateSnapshot, room.actionLog);
    const current = {
        hostEpoch: Number.isInteger(room.hostEpoch) ? room.hostEpoch : currentRank.hostEpoch,
        actionSeq: Number.isInteger(room.actionSeq) ? room.actionSeq : currentRank.actionSeq,
    };
    const incoming = restorePayloadRank(gameStartPayload, stateSnapshot, actionLog);
    return incoming.hostEpoch > current.hostEpoch ||
        (incoming.hostEpoch === current.hostEpoch && incoming.actionSeq > current.actionSeq);
}

function canReplaceRestoredRoom(room, playerIndex, gameStartPayload, stateSnapshot, actionLog) {
    if (!room || room.restored !== true) return false;
    if (!Number.isInteger(playerIndex) || gameStartPayload?.hostPlayerIndex !== playerIndex) return false;
    const currentRank = restorePayloadRank(room.gameStartPayload, room.stateSnapshot, room.actionLog);
    const currentHostEpoch = Number.isInteger(room.hostEpoch) ? room.hostEpoch : currentRank.hostEpoch;
    const incomingRank = restorePayloadRank(gameStartPayload, stateSnapshot, actionLog);
    if (Number.isInteger(room.hostPlayerIndex) &&
            room.hostPlayerIndex !== playerIndex &&
            incomingRank.hostEpoch <= currentHostEpoch) {
        return false;
    }
    return isIncomingRestoreNewer(room, gameStartPayload, stateSnapshot, actionLog);
}

module.exports = {
    restorePayloadRank,
    restorePayloadRankDetails,
    isIncomingRestoreNewer,
    canReplaceRestoredRoom,
};
