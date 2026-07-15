'use strict';

const LifecycleNotify = (() => {
    function isDisabledValue(value) {
        return ['0', 'false', 'no', 'off', 'disabled'].includes(String(value || '').toLowerCase());
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

    return Object.freeze({ isDisabledValue, buildPayload });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LifecycleNotify;
if (typeof window !== 'undefined') window.LifecycleNotify = LifecycleNotify;
if (typeof globalThis !== 'undefined') globalThis.LifecycleNotify = LifecycleNotify;
