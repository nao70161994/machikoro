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

    function createLifecycleController(initial = {}) {
        let bindingClaimed = initial.bindingClaimed === true;
        let hiddenAt = Number.isFinite(initial.hiddenAt) ? initial.hiddenAt : 0;

        function snapshot() {
            return Object.freeze({ bindingClaimed, hiddenAt });
        }

        function claimBinding() {
            if (bindingClaimed) return false;
            bindingClaimed = true;
            return true;
        }

        function beginActivation(pageHidden, now) {
            if (pageHidden && !hiddenAt) hiddenAt = now;
            return Object.freeze({
                pageHidden: pageHidden === true,
                hiddenForMs: hiddenDurationMs(hiddenAt, now),
            });
        }

        function finishActivation(pageHidden) {
            if (pageHidden !== true) hiddenAt = 0;
            return snapshot();
        }

        function setHiddenAt(value) {
            hiddenAt = value;
            return snapshot();
        }

        return Object.freeze({
            snapshot,
            claimBinding,
            beginActivation,
            finishActivation,
            setHiddenAt,
            hiddenDurationMs(now) {
                return hiddenDurationMs(hiddenAt, now);
            },
        });
    }

    return Object.freeze({ cpuOutcome, hiddenDurationMs, createLifecycleController });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PageActivationPolicy;
if (typeof window !== 'undefined') window.PageActivationPolicy = PageActivationPolicy;
if (typeof globalThis !== 'undefined') globalThis.PageActivationPolicy = PageActivationPolicy;
