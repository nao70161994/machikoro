'use strict';

/**
 * Computes restore ownership/sequence metadata without mutating the payload.
 * @param {{playerIndex?: number, hostEpoch?: number, actionSeq?: number, approvedHostless?: boolean, hostlessRestoreGeneration?: *, hostlessRestoreCount?: *}} input
 * @returns {{hostPlayerIndex: number|undefined, hostEpoch: number|undefined, actionSeq: number|undefined, applyHostlessMetadata: boolean, hostlessRestoreGeneration: *, hostlessRestoreCount: *}}
 */
function planRestoredRoomMetadata(input = {}) {
    const approvedHostless = input.approvedHostless === true;
    const hostlessRestoreGeneration = input.hostlessRestoreGeneration || 0;
    const hostlessRestoreCount = input.hostlessRestoreCount || 0;
    return Object.freeze({
        hostPlayerIndex: input.playerIndex,
        hostEpoch: approvedHostless ? input.hostEpoch + 1 : input.hostEpoch,
        actionSeq: input.actionSeq,
        applyHostlessMetadata: approvedHostless,
        hostlessRestoreGeneration: approvedHostless
            ? hostlessRestoreGeneration + 1
            : hostlessRestoreGeneration,
        hostlessRestoreCount: approvedHostless
            ? hostlessRestoreCount + 1
            : hostlessRestoreCount,
    });
}

/**
 * Builds the mutable room shell from already-validated restore inputs.
 * Validation, authority, replay, persistence, socket effects, and mirror ownership
 * deliberately remain with the caller.
 * @param {{sanitizeStateSnapshot?: function(*, number): *}} [dependencies]
 * @returns {{buildRestoredRoom: function(Object): Object, planRestoredRoomMetadata: function(Object): Object}}
 */
function makeRestoredRoom(dependencies = {}) {
    if (typeof dependencies.sanitizeStateSnapshot !== 'function') {
        throw new TypeError('sanitizeStateSnapshot dependency is required');
    }

    function buildRestoredRoom(input = {}) {
        const playerNames = Array.isArray(input.playerNames) ? input.playerNames : [];
        return {
            roomId: input.roomId,
            players: input.restoredPlayers,
            playerSettings: input.playerSettings,
            maxPlayers: playerNames.length,
            started: true,
            restored: true,
            hostPlayerIndex: input.playerIndex,
            hostEpoch: input.restoredHostEpoch,
            actionSeq: input.restoredActionSeq,
            enabledCards: input.enabledCards || [],
            enabledLandmarks: input.enabledLandmarks || [],
            cpuSpeed: input.cpuSpeed || 1500,
            gameStartPayload: input.gameStartPayload,
            stateSnapshot: dependencies.sanitizeStateSnapshot(
                input.replayStateSnapshot,
                playerNames.length
            ),
            acceptedClientActions: {},
            actionLog: input.sanitizedActionLog,
            lastUndoState: null,
            lastTouchedAt: input.now,
            provisionalRestore: input.approvedHostless === true,
            hostlessRestoreGeneration: input.hostlessRestoreGeneration || 0,
            hostlessRestoreCount: input.hostlessRestoreCount || 0,
            hostlessRestoreCandidateCount: input.approvedHostless === true &&
                Number.isInteger(input.candidateCount)
                ? input.candidateCount
                : 0,
        };
    }

    return Object.freeze({ buildRestoredRoom, planRestoredRoomMetadata });
}

module.exports = makeRestoredRoom;
