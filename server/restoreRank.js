'use strict';

const RESTORE_RANK_ACTIONS = new Set([
    'rollDice',
    'selectDice',
    'rerollDice',
    'skipReroll',
    'resolveHarbor',
    'resolveTV',
    'resolveBusiness',
    'resolveCleaning',
    'resolveMover',
    'resolveRenovation',
    'resolveIT',
    'buildCard',
    'buildLandmark',
    'undoBuild',
    'nextTurn',
]);

function isRestoreRankAction(entry) {
    return !!(entry && typeof entry.action === 'string' && RESTORE_RANK_ACTIONS.has(entry.action));
}

function nonnegativeSafeIntegerOrZero(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function restorePayloadRankDetails(gameStartPayload, stateSnapshot, actionLog) {
    const hostEpoch = nonnegativeSafeIntegerOrZero(gameStartPayload?.hostEpoch);
    const gameStartSeq = nonnegativeSafeIntegerOrZero(gameStartPayload?.actionSeq);
    const snapshotSeq = nonnegativeSafeIntegerOrZero(stateSnapshot?.actionSeq);
    const replayedActionCount = Array.isArray(actionLog)
        ? actionLog.filter(isRestoreRankAction).length
        : 0;
    const logSeq = Number.isSafeInteger(snapshotSeq + replayedActionCount)
        ? snapshotSeq + replayedActionCount
        : snapshotSeq;
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
        hostEpoch: Number.isSafeInteger(room.hostEpoch) && room.hostEpoch >= 0
            ? room.hostEpoch : currentRank.hostEpoch,
        actionSeq: Number.isSafeInteger(room.actionSeq) && room.actionSeq >= 0
            ? room.actionSeq : currentRank.actionSeq,
    };
    const incoming = restorePayloadRank(gameStartPayload, stateSnapshot, actionLog);
    return incoming.hostEpoch > current.hostEpoch ||
        (incoming.hostEpoch === current.hostEpoch && incoming.actionSeq > current.actionSeq);
}

function canReplaceRestoredRoom(room, playerIndex, gameStartPayload, stateSnapshot, actionLog) {
    if (!room || room.restored !== true) return false;
    if (!Number.isInteger(playerIndex) || gameStartPayload?.hostPlayerIndex !== playerIndex) return false;
    const currentRank = restorePayloadRank(room.gameStartPayload, room.stateSnapshot, room.actionLog);
    const currentHostEpoch = Number.isSafeInteger(room.hostEpoch) && room.hostEpoch >= 0
        ? room.hostEpoch : currentRank.hostEpoch;
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
    isRestoreRankAction,
    isIncomingRestoreNewer,
    canReplaceRestoredRoom,
};
