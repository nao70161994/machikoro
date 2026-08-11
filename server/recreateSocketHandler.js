'use strict';

const { isRateLimited } = require('./reportThrottle');

const DEFAULT_RECREATE_COOLDOWN_MS = 1000;

function makeRecreateAttemptAdmission(options = {}) {
    const limits = Object.freeze({
        windowMs: Number.isFinite(options.windowMs) && options.windowMs > 0
            ? options.windowMs : 60_000,
        max: Number.isSafeInteger(options.max) && options.max > 0
            ? options.max : 20,
        maxBuckets: Number.isSafeInteger(options.maxBuckets) && options.maxBuckets > 0
            ? options.maxBuckets : 2000,
    });
    const buckets = options.buckets instanceof Map ? options.buckets : new Map();

    function isAttemptRateLimited(rateKey, now = Date.now()) {
        if (!rateKey) return false;
        return isRateLimited(rateKey, now, buckets, limits);
    }

    return Object.freeze({ isRateLimited: isAttemptRateLimited });
}

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
        if (typeof dependencies.isAttemptRateLimited === 'function' &&
                dependencies.isAttemptRateLimited(socket, requestedAt)) {
            dependencies.emitAppError(socket, '復元処理が短時間に集中しています。少し待ってから再試行してください');
            return;
        }
        socket.lastRecreateRoomAt = requestedAt;
        if (typeof dependencies.validateRawPayload === 'function' &&
                !dependencies.validateRawPayload(payload)) {
            dependencies.emitAppError(socket, '復元データが不完全です');
            return;
        }
        const decoded = dependencies.decodePayload(payload);
        if (!decoded || decoded.ok !== true) {
            dependencies.emitAppError(socket, '復元データが不完全です');
            return;
        }
        const result = dependencies.handleRecreateRoom(socket, decoded.value);
        if (result && result.ok) dependencies.hostRestored(result.roomId);
    });
}

module.exports = Object.freeze({
    DEFAULT_RECREATE_COOLDOWN_MS,
    makeRecreateAttemptAdmission,
    registerRecreateSocketHandler,
});
