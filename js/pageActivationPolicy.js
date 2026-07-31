'use strict';

/**
 * @typedef {{
 *   isCpuTurn?: boolean,
 *   blockedReason?: string,
 *   stepScheduled?: boolean
 * }} CpuSchedulerHealthLike
 */

const PageActivationPolicy = (() => {
    /**
     * @param {CpuSchedulerHealthLike | null | undefined} before
     * @param {CpuSchedulerHealthLike | null | undefined} after
     * @param {boolean} pageHidden
     * @returns {string}
     */
    function cpuOutcome(before, after, pageHidden) {
        if (pageHidden) return 'page-hidden';
        if (!before || !before.isCpuTurn) return 'not-cpu-turn';
        if (before.blockedReason) return 'blocked:' + before.blockedReason;
        if (before.stepScheduled) return 'already-scheduled';
        if (after && after.stepScheduled) return 'rescheduled';
        return 'not-rescheduled';
    }

    /**
     * @param {number} hiddenAt
     * @param {number} now
     * @returns {number | null}
     */
    function hiddenDurationMs(hiddenAt, now) {
        if (!Number.isFinite(hiddenAt) || hiddenAt <= 0) return null;
        return Math.max(0, now - hiddenAt);
    }

    return Object.freeze({ cpuOutcome, hiddenDurationMs });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PageActivationPolicy;
if (typeof window !== 'undefined') window.PageActivationPolicy = PageActivationPolicy;
if (typeof globalThis !== 'undefined') globalThis.PageActivationPolicy = PageActivationPolicy;
