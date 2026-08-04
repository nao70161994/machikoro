'use strict';

const UiWatchdogMonitor = (() => {
    const ACTIONS = Object.freeze({
        NONE: 'none',
        RECOVER: 'recover',
        REPORT_AND_RECOVER: 'report-and-recover',
    });

    function createPendingBatchController() {
        let remaining = 0;

        function snapshot() {
            return Object.freeze({ pending: remaining > 0, remaining });
        }

        function begin(taskCount) {
            if (remaining > 0) return false;
            remaining = Number.isInteger(taskCount) && taskCount > 0 ? taskCount : 0;
            return remaining > 0;
        }

        function complete() {
            if (remaining > 0) remaining--;
            return snapshot();
        }

        return Object.freeze({ snapshot, begin, complete });
    }

    function create(options = {}) {
        const thresholdMs = Number.isFinite(options.thresholdMs) ? options.thresholdMs : 5000;
        const reportSuppressMs = Number.isFinite(options.reportSuppressMs)
            ? options.reportSuppressMs
            : 60000;
        let lastKey = '';
        let lastChangedAt = 0;
        let lastReportKey = '';
        let lastReportAt = 0;

        function reset() {
            lastKey = '';
            lastChangedAt = 0;
            lastReportKey = '';
            lastReportAt = 0;
        }

        function observeProgress(key, now) {
            if (key !== lastKey) {
                lastKey = key;
                lastChangedAt = now;
                return Object.freeze({ shouldClassify: false, stagnantMs: 0 });
            }
            if (!lastChangedAt) lastChangedAt = now;
            const stagnantMs = now - lastChangedAt;
            return Object.freeze({
                shouldClassify: stagnantMs >= thresholdMs,
                stagnantMs,
            });
        }

        function decideReport(freezeKind, reportKey, now) {
            if (!freezeKind) return ACTIONS.NONE;
            if (lastReportKey === reportKey && now - lastReportAt < reportSuppressMs) {
                return ACTIONS.RECOVER;
            }
            lastReportKey = reportKey;
            lastReportAt = now;
            return ACTIONS.REPORT_AND_RECOVER;
        }

        function snapshot() {
            return Object.freeze({ lastKey, lastChangedAt, lastReportKey, lastReportAt });
        }

        return Object.freeze({ reset, observeProgress, decideReport, snapshot });
    }

    return Object.freeze({ ACTIONS, createPendingBatchController, create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiWatchdogMonitor;
if (typeof window !== 'undefined') Object.assign(window, { UiWatchdogMonitor });
if (typeof globalThis !== 'undefined') globalThis.UiWatchdogMonitor = UiWatchdogMonitor;
