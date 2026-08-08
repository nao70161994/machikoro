'use strict';

const AppShellClientReportingRuntime = (() => {
    function createRuntime(dependencies = {}) {
        const {
            buildSnapshot,
            checkpoint,
            endpoint,
            getFetch,
            getGameSnapshot,
            getLocation,
            getOnlineSnapshot,
            getUserAgent,
            getVersion,
            messageLimit,
            now,
            outbox,
            reporting,
            schemaVersion,
            stackLimit,
            suppressMs,
            transport,
        } = dependencies;
        const requiredFunctions = {
            buildSnapshot,
            checkpoint,
            getFetch,
            getGameSnapshot,
            getLocation,
            getOnlineSnapshot,
            getUserAgent,
            getVersion,
            now,
        };
        for (const [name, dependency] of Object.entries(requiredFunctions)) {
            if (typeof dependency !== 'function') throw new TypeError(`${name} is required`);
        }
        if (!reporting || !transport || !endpoint) {
            throw new TypeError('client reporting runtime dependencies are required');
        }
        const admission = reporting.createAdmissionController({ suppressMs, now });

        function clientUrl() {
            return reporting.clientUrl(getLocation());
        }

        function context() {
            const gameState = getGameSnapshot();
            const onlineState = getOnlineSnapshot();
            return reporting.runtimeContext({
                userAgent: getUserAgent(),
                phase: gameState.game ? gameState.game.phase : '',
                roomId: onlineState.myRoomId || '',
                playerIndex: onlineState.myPlayerIndex,
                appVersion: getVersion(),
                url: clientUrl(),
            });
        }

        function compactFreezeSummaryStack(stack, limit = stackLimit) {
            return reporting.compactFreezeSummaryStack(stack, { limit, schemaVersion });
        }

        function stackForReport(input) {
            return reporting.stackForReport(input, { limit: stackLimit, schemaVersion });
        }

        function buildReport(input) {
            return reporting.buildReport(input, context(), {
                messageLimit,
                stack: stackForReport(input || {}),
            });
        }

        function reportKey(report) {
            return reporting.reportKey(report);
        }

        function report(input) {
            return transport.send({
                fetchImpl: getFetch(),
                endpoint,
                source: input && input.source || 'unknown',
                buildReport: () => buildReport(input || {}),
                shouldSend(reportPayload) {
                    const decision = admission.admit(reportKey(reportPayload));
                    if (!decision.shouldSend) {
                        checkpoint('client-error-suppressed', {
                            source: reportPayload.source,
                            message: reportPayload.message,
                        });
                        return false;
                    }
                    return true;
                },
                checkpoint,
                outbox,
            });
        }

        function flush() {
            return transport.flush({
                fetchImpl: getFetch(),
                endpoint,
                checkpoint,
                outbox,
            });
        }

        function sendDebugReport(message = 'manual client error test') {
            checkpoint('debug-client-error-report-start', { message });
            return report({
                source: 'debug-client-test',
                message,
                stack: 'Manual client-side debug report; no real error occurred. ' +
                    JSON.stringify(buildSnapshot('debug-client-test')).slice(0, 1600),
            });
        }

        return Object.freeze({
            clientUrl,
            context,
            compactFreezeSummaryStack,
            stackForReport,
            buildReport,
            reportKey,
            report,
            flush,
            sendDebugReport,
        });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AppShellClientReportingRuntime;
if (typeof window !== 'undefined') window.AppShellClientReportingRuntime = AppShellClientReportingRuntime;
if (typeof globalThis !== 'undefined') globalThis.AppShellClientReportingRuntime = AppShellClientReportingRuntime;
