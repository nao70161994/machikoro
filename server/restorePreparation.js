'use strict';

function makeRestorePreparation(dependencies = {}) {
    const requiredFunctions = [
        'planGameStartAdmission',
        'planIdentityAdmission',
        'planReplayAdmission',
        'planRoomMetadata',
        'applyRoomMetadata',
        'buildRoom',
        'prepareMirror',
        'rememberAcceptedAction',
        'createMirror',
        'buildMirrorStatePlan',
        'applyMirrorStatePlan',
        'now',
    ];
    for (const name of requiredFunctions) {
        if (typeof dependencies[name] !== 'function') {
            throw new TypeError(name + ' dependency is required');
        }
    }
    if (typeof dependencies.hostlessRestoreGenerationField !== 'string' ||
        typeof dependencies.hostlessRestoreCountField !== 'string') {
        throw new TypeError('hostless restore metadata fields are required');
    }

    function prepareRestoredRoom(input = {}) {
        const gameStartPayload = input.gameStartPayload;
        const gameStartAdmission = dependencies.planGameStartAdmission(gameStartPayload);
        if (gameStartAdmission.ok !== true) return gameStartAdmission;

        const playerNames = gameStartAdmission.playerNames;
        gameStartPayload.playerSettings = gameStartAdmission.playerSettings;
        const identityAdmission = dependencies.planIdentityAdmission({
            gameStartPayload,
            playerNames,
            playerIndex: input.playerIndex,
            playerName: input.playerName,
            reconnectToken: input.reconnectToken,
            approvedHostless: input.approvedHostless,
            socketId: input.socketId,
        });
        if (identityAdmission.ok !== true) return identityAdmission;

        const replayAdmission = dependencies.planReplayAdmission({
            actionLog: input.actionLog,
            roomId: input.roomId,
            replayStateSnapshot: input.replayStateSnapshot,
            canonicalRecord: input.canonicalRecord,
            clientSnapshotTrusted: input.clientSnapshotTrusted,
            stateSnapshot: input.stateSnapshot,
            gameStartPayload,
        });
        if (replayAdmission.ok !== true) return replayAdmission;

        const restoredMetadata = dependencies.planRoomMetadata({
            playerIndex: input.playerIndex,
            hostEpoch: replayAdmission.restoredRank.hostEpoch,
            actionSeq: replayAdmission.restoredRank.actionSeq,
            approvedHostless: input.approvedHostless,
            hostlessRestoreGeneration: gameStartPayload[dependencies.hostlessRestoreGenerationField],
            hostlessRestoreCount: gameStartPayload[dependencies.hostlessRestoreCountField],
        });
        dependencies.applyRoomMetadata(gameStartPayload, restoredMetadata, {
            hostlessRestoreGenerationField: dependencies.hostlessRestoreGenerationField,
            hostlessRestoreCountField: dependencies.hostlessRestoreCountField,
        });
        const restoredRoom = dependencies.buildRoom({
            roomId: input.roomId,
            restoredPlayers: identityAdmission.restoredPlayers,
            playerSettings: gameStartPayload.playerSettings,
            playerNames,
            playerIndex: input.playerIndex,
            restoredHostEpoch: restoredMetadata.hostEpoch,
            restoredActionSeq: replayAdmission.restoredRank.actionSeq,
            gameGeneration: gameStartPayload.gameGeneration,
            enabledCards: gameStartPayload.enabledCards,
            enabledLandmarks: gameStartPayload.enabledLandmarks,
            cpuSpeed: gameStartPayload.cpuSpeed,
            gameStartPayload,
            replayStateSnapshot: input.replayStateSnapshot,
            sanitizedActionLog: replayAdmission.sanitizedActionLog,
            now: dependencies.now(),
            approvedHostless: input.approvedHostless,
            hostlessRestoreGeneration: gameStartPayload[dependencies.hostlessRestoreGenerationField],
            hostlessRestoreCount: gameStartPayload[dependencies.hostlessRestoreCountField],
            candidateCount: input.candidateCount,
        });
        const mirrorPreparation = dependencies.prepareMirror(restoredRoom, {
            rememberAcceptedAction: dependencies.rememberAcceptedAction,
            createMirror: dependencies.createMirror,
            buildStatePlan: dependencies.buildMirrorStatePlan,
            applyStatePlan: dependencies.applyMirrorStatePlan,
        });
        if (mirrorPreparation.ok !== true) return mirrorPreparation;

        return Object.freeze({
            ok: true,
            gameStartPayload,
            restoredRoom,
        });
    }

    return Object.freeze({ prepareRestoredRoom });
}

module.exports = makeRestorePreparation;
