'use strict';

const DEFAULT_RECREATE_COOLDOWN_MS = 1000;

function registerRecreateSocketHandler(socket, dependencies = {}) {
    const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now;
    const cooldownMs = Number.isFinite(dependencies.cooldownMs)
        ? Math.max(0, dependencies.cooldownMs)
        : DEFAULT_RECREATE_COOLDOWN_MS;
    socket.on('recreateRoom', payload => {
        const requestedAt = now();
        if (Number.isFinite(socket.lastRecreateRoomAt) &&
                requestedAt - socket.lastRecreateRoomAt < cooldownMs) {
            dependencies.emitAppError(socket, '復元処理を続けて実行できません');
            return;
        }
        if (typeof dependencies.validateRawPayload === 'function' &&
                !dependencies.validateRawPayload(payload)) {
            socket.lastRecreateRoomAt = requestedAt;
            dependencies.emitAppError(socket, '復元データが不完全です');
            return;
        }
        const decoded = dependencies.decodePayload(payload);
        if (!decoded || decoded.ok !== true) {
            dependencies.emitAppError(socket, '復元データが不完全です');
            return;
        }
        socket.lastRecreateRoomAt = requestedAt;
        const result = dependencies.handleRecreateRoom(socket, decoded.value);
        if (result && result.ok) dependencies.hostRestored(result.roomId);
    });
}

module.exports = Object.freeze({ DEFAULT_RECREATE_COOLDOWN_MS, registerRecreateSocketHandler });
