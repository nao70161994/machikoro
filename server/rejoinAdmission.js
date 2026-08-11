'use strict';

const { isRateLimited } = require('./reportThrottle');

const REJOIN_ADMISSION_ERRORS = Object.freeze({
    SOCKET_COOLDOWN: '再接続処理を続けて実行できません',
    IDENTITY_RATE_LIMIT: '再接続処理が短時間に集中しています。少し待ってから再試行してください',
});

function makeRejoinAdmission(options = {}) {
    const configured = options.limits || {};
    const limits = Object.freeze({
        socketCooldownMs: Number.isFinite(configured.socketCooldownMs)
            ? Math.max(0, configured.socketCooldownMs)
            : 1000,
        identityRateLimitWindowMs: Number.isFinite(configured.identityRateLimitWindowMs) &&
            configured.identityRateLimitWindowMs > 0
            ? configured.identityRateLimitWindowMs
            : 60_000,
        identityRateLimitMax: Number.isSafeInteger(configured.identityRateLimitMax) &&
            configured.identityRateLimitMax > 0
            ? configured.identityRateLimitMax
            : 12,
        identityRateLimitMaxBuckets: Number.isSafeInteger(configured.identityRateLimitMaxBuckets) &&
            configured.identityRateLimitMaxBuckets > 0
            ? configured.identityRateLimitMaxBuckets
            : 2000,
    });
    const identityBuckets = options.identityBuckets instanceof Map
        ? options.identityBuckets
        : new Map();

    function identityRateKey(roomId, playerIndex) {
        return `${roomId}:${playerIndex}`;
    }

    function admit(socket, roomId, playerIndex, now = Date.now()) {
        const lastAcceptedAt = socket && socket.lastAuthenticatedRejoinAt;
        if (Number.isFinite(lastAcceptedAt) && now - lastAcceptedAt < limits.socketCooldownMs) {
            return Object.freeze({ ok: false, message: REJOIN_ADMISSION_ERRORS.SOCKET_COOLDOWN });
        }
        const limited = isRateLimited(
            identityRateKey(roomId, playerIndex),
            now,
            identityBuckets,
            {
                windowMs: limits.identityRateLimitWindowMs,
                max: limits.identityRateLimitMax,
                maxBuckets: limits.identityRateLimitMaxBuckets,
            }
        );
        if (limited) {
            return Object.freeze({ ok: false, message: REJOIN_ADMISSION_ERRORS.IDENTITY_RATE_LIMIT });
        }
        if (socket) socket.lastAuthenticatedRejoinAt = now;
        return Object.freeze({ ok: true, message: '' });
    }

    return Object.freeze({ admit, identityRateKey, limits });
}

module.exports = Object.freeze({
    REJOIN_ADMISSION_ERRORS,
    makeRejoinAdmission,
});
