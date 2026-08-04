'use strict';

function makeRecreateRoomRuntime(dependencies = {}) {
    const required = ['planAdmission', 'emitAppError', 'hasRoom', 'roomForId'];
    for (const name of required) {
        if (typeof dependencies[name] !== 'function') {
            throw new TypeError(name + ' dependency is required');
        }
    }
    if (!dependencies.existingRoomRuntime ||
            typeof dependencies.existingRoomRuntime.handle !== 'function') {
        throw new TypeError('existingRoomRuntime dependency is required');
    }
    if (!dependencies.newRoomRuntime ||
            typeof dependencies.newRoomRuntime.handle !== 'function') {
        throw new TypeError('newRoomRuntime dependency is required');
    }

    function handle(socket, payload = {}, options = {}) {
        const admission = dependencies.planAdmission(payload, options);
        if (admission.ok !== true) {
            dependencies.emitAppError(socket, admission.errorMessage);
            return admission.result;
        }
        const {
            roomId,
            playerIndex,
            playerName,
            reconnectToken,
            canonicalRecord,
            clientSnapshotTrusted,
            replayStateSnapshot,
            gameStartPayload,
            actionLog,
        } = admission;
        if (dependencies.hasRoom(roomId)) {
            const room = dependencies.roomForId(roomId);
            const existingRoomResult = dependencies.existingRoomRuntime.handle({
                socket,
                room,
                roomId,
                playerIndex,
                playerName,
                reconnectToken,
                admissionInput: {
                    room,
                    roomId,
                    playerIndex,
                    playerName,
                    reconnectToken,
                    actionLog,
                    replayStateSnapshot,
                    canonicalRecord,
                    gameStartPayload,
                    clientSnapshotTrusted,
                },
            });
            if (existingRoomResult.handled) return undefined;
        }
        return dependencies.newRoomRuntime.handle({
            socket,
            admission,
            candidateCount: options.candidateCount,
        });
    }

    return Object.freeze({ handle });
}

module.exports = makeRecreateRoomRuntime;
