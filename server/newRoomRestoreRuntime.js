'use strict';

function makeNewRoomRestoreRuntime(dependencies = {}) {
    const required = [
        'prepareRoom',
        'activateRoom',
        'emitAppError',
        'roomExists',
        'detachExisting',
        'deleteExisting',
        'installRoom',
        'persistRoom',
        'joinSocket',
        'emitRejoinData',
        'log',
    ];
    for (const name of required) {
        if (typeof dependencies[name] !== 'function') {
            throw new TypeError(name + ' dependency is required');
        }
    }

    function handle(input = {}) {
        const admission = input.admission || {};
        const preparation = dependencies.prepareRoom({
            roomId: admission.roomId,
            playerIndex: admission.playerIndex,
            playerName: admission.playerName,
            reconnectToken: admission.reconnectToken,
            approvedHostless: admission.approvedHostless,
            socketId: input.socket && input.socket.id,
            gameStartPayload: admission.gameStartPayload,
            stateSnapshot: admission.stateSnapshot,
            replayStateSnapshot: admission.replayStateSnapshot,
            actionLog: admission.actionLog,
            canonicalRecord: admission.canonicalRecord,
            clientSnapshotTrusted: admission.clientSnapshotTrusted,
            candidateCount: input.candidateCount,
        });
        if (preparation.ok !== true) {
            dependencies.emitAppError(input.socket, preparation.errorMessage);
            return undefined;
        }

        const context = {
            socket: input.socket,
            roomId: admission.roomId,
            playerIndex: admission.playerIndex,
            playerName: admission.playerName,
            approvedHostless: admission.approvedHostless,
            gameStartPayload: preparation.gameStartPayload,
            restoredRoom: preparation.restoredRoom,
        };
        const activationResult = dependencies.activateRoom({
            roomExists: dependencies.roomExists(context.roomId),
            approvedHostless: context.approvedHostless,
            roomId: context.roomId,
            playerName: context.playerName,
            playerIndex: context.playerIndex,
            restoredRoom: context.restoredRoom,
        }, {
            detachExisting: () => dependencies.detachExisting(context),
            deleteExisting: () => dependencies.deleteExisting(context),
            install: () => dependencies.installRoom(context),
            persist: () => dependencies.persistRoom(context),
            joinSocket: () => dependencies.joinSocket(context),
            assignSocketRoom: () => {
                context.socket.roomId = context.roomId;
            },
            assignSocketPlayer: () => {
                context.socket.playerIndex = context.playerIndex;
            },
            emitRejoinData: () => dependencies.emitRejoinData(context),
            log: message => dependencies.log(message),
        });
        if (activationResult.ok !== true) {
            dependencies.emitAppError(input.socket, activationResult.errorMessage);
            return { ok: false, reason: activationResult.reason };
        }
        return activationResult;
    }

    return Object.freeze({ handle });
}

module.exports = makeNewRoomRestoreRuntime;
