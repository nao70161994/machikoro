'use strict';

const OnlineRestoreMetadata = (() => {
    const HOSTLESS_RESTORE_MAX_ATTEMPTS = 3;

    function isNonnegativeSafeInteger(value) {
        return Number.isSafeInteger(value) && value >= 0;
    }

    function normalizeCounter(value, max = Number.MAX_SAFE_INTEGER) {
        return isNonnegativeSafeInteger(value) && value <= max ? value : 0;
    }

    function addProgress(base, increment) {
        const normalizedBase = normalizeCounter(base);
        const normalizedIncrement = normalizeCounter(increment);
        const total = normalizedBase + normalizedIncrement;
        return Number.isSafeInteger(total) && total >= normalizedBase
            ? total
            : normalizedBase;
    }

    function incrementEpoch(value) {
        return addProgress(value, 1);
    }

    return Object.freeze({
        hostlessRestoreMaxAttempts: HOSTLESS_RESTORE_MAX_ATTEMPTS,
        isNonnegativeSafeInteger,
        normalizeCounter,
        addProgress,
        incrementEpoch,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineRestoreMetadata;
if (typeof window !== 'undefined') window.OnlineRestoreMetadata = OnlineRestoreMetadata;
if (typeof globalThis !== 'undefined') {
    /** @type {any} */ (globalThis).OnlineRestoreMetadata = OnlineRestoreMetadata;
}
