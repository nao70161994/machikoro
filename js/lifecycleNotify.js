'use strict';

const LifecycleNotify = (() => {
    function isDisabledValue(value) {
        return ['0', 'false', 'no', 'off', 'disabled'].includes(String(value || '').toLowerCase());
    }

    function startSignature(mode, playerCount, cpuCount) {
        return [mode, playerCount, cpuCount].join('|');
    }

    function notificationState(key, legacyKey, value) {
        return Object.freeze({
            key,
            legacyKey,
            value,
            enabled: !isDisabledValue(value),
            defaultEnabled: value === null,
        });
    }

    function createSessionId(now, randomValue) {
        const random = Number(randomValue).toString(36).slice(2, 10);
        return Number(now).toString(36) + '-' + random;
    }

    function isRecentStart(raw, signature, now, suppressMs) {
        try {
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            return !!(parsed &&
                parsed.signature === signature &&
                now - Number(parsed.timestamp || 0) < suppressMs);
        } catch (_) {
            return false;
        }
    }

    function serializeStartMarker(signature, timestamp) {
        return JSON.stringify({ signature, timestamp }).slice(0, 300);
    }

    function finishPayloadExtras(turn, winnerCpuDifficulty) {
        return Object.freeze({
            turn,
            winnerKind: winnerCpuDifficulty ? 'cpu' : 'human',
            winnerCpuDifficulty,
        });
    }

    function buildPayload(options) {
        const payload = {
            event: options.event,
            mode: options.mode,
            playerCount: options.playerCount,
            cpuCount: options.cpuCount,
            sessionId: options.sessionId,
            appVersion: options.appVersion,
        };
        if (options.turn !== undefined) payload.turn = options.turn;
        if (options.winnerKind) payload.winnerKind = options.winnerKind;
        if (options.winnerCpuDifficulty) payload.winnerCpuDifficulty = options.winnerCpuDifficulty;
        return payload;
    }

    return Object.freeze({
        isDisabledValue,
        startSignature,
        notificationState,
        createSessionId,
        isRecentStart,
        serializeStartMarker,
        finishPayloadExtras,
        buildPayload,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LifecycleNotify;
if (typeof window !== 'undefined') window.LifecycleNotify = LifecycleNotify;
if (typeof globalThis !== 'undefined') globalThis.LifecycleNotify = LifecycleNotify;
