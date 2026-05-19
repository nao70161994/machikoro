'use strict';

function restorePayloadRankDetails(gameStartPayload, stateSnapshot, actionLog) {
    const hostEpoch = Number.isInteger(gameStartPayload?.hostEpoch) ? gameStartPayload.hostEpoch : 0;
    const gameStartSeq = Number.isInteger(gameStartPayload?.actionSeq) ? gameStartPayload.actionSeq : 0;
    const snapshotSeq = Number.isInteger(stateSnapshot?.actionSeq) ? stateSnapshot.actionSeq : 0;
    let logSeq = 0;
    if (Array.isArray(actionLog)) {
        for (const entry of actionLog) {
            if (Number.isInteger(entry?.seq)) logSeq = Math.max(logSeq, entry.seq);
        }
    }
    const actionSeq = Math.max(0, gameStartSeq, snapshotSeq, logSeq);
    const source = actionSeq === logSeq && logSeq > 0
        ? 'actionLog'
        : (actionSeq === snapshotSeq && snapshotSeq > 0 ? 'stateSnapshot' : 'gameStartPayload');
    return {
        hostEpoch,
        actionSeq,
        gameStartSeq,
        snapshotSeq,
        logSeq,
        replayedActionSeq: Math.max(snapshotSeq, logSeq),
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
