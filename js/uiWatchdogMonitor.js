'use strict';

const UiWatchdogMonitor = (() => {
    const ACTIONS = Object.freeze({
        NONE: 'none',
        RECOVER: 'recover',
        REPORT_AND_RECOVER: 'report-and-recover',
    });

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

    return Object.freeze({ ACTIONS, create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiWatchdogMonitor;
if (typeof window !== 'undefined') Object.assign(window, { UiWatchdogMonitor });
if (typeof globalThis !== 'undefined') globalThis.UiWatchdogMonitor = UiWatchdogMonitor;
