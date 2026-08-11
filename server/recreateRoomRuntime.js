'use strict';

function makeRecreateRoomRuntime(dependencies = {}) {
    const required = [
        'planAdmission',
        'emitAppError',
        'hasRoom',
        'roomForId',
        'validateCreateRoomLifecycle',
        'markCreateRoomForSocket',
        'createRoomRateKeyForSocket',
        'markCreateRoomForRateKey',
    ];
    for (const name of required) {
        if (typeof dependencies[name] !== 'function') {
            throw new TypeError(name + ' dependency is required');
        }
    }
    const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now;
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
        const roomExists = dependencies.hasRoom(roomId);
        if (roomExists) {
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
        const createdAt = now();
        if (!roomExists) {
            const lifecycle = dependencies.validateCreateRoomLifecycle(
                socket,
                createdAt,
                dependencies.rooms
            );
            if (!lifecycle.ok) {
                dependencies.emitAppError(socket, lifecycle.message);
                return undefined;
            }
        }
        const result = dependencies.newRoomRuntime.handle({
            socket,
            admission,
            candidateCount: options.candidateCount,
        });
        if (!roomExists && result && result.ok) {
            dependencies.markCreateRoomForSocket(socket, createdAt);
            dependencies.markCreateRoomForRateKey(
                dependencies.createRoomRateKeyForSocket(socket),
                createdAt
            );
        }
        return result;
    }

    return Object.freeze({ handle });
}

module.exports = makeRecreateRoomRuntime;
