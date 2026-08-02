'use strict';

const ClientReportingTransport = (() => {
    function errorMessage(error) {
        return error && error.message || String(error);
    }

    function send(options) {
        const checkpoint = options.checkpoint;
        if (typeof options.fetchImpl !== 'function') {
            checkpoint('client-error-fetch-unavailable', { source: options.source });
            return false;
        }

        const report = options.buildReport();
        if (!options.shouldSend(report)) return false;

        try {
            checkpoint('client-error-fetch-start', {
                source: report.source,
                message: report.message,
            });
            const request = options.fetchImpl(options.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(report),
                keepalive: true,
            });
            if (request && typeof request.then === 'function') {
                request.then(response => {
                    checkpoint('client-error-fetch-complete', {
                        source: report.source,
                        ok: response && response.ok !== false,
                        status: response && response.status,
                    });
                }).catch(error => {
                    checkpoint('client-error-fetch-failed', {
                        source: report.source,
                        message: errorMessage(error),
                    });
                });
            }
            return true;
        } catch (error) {
            checkpoint('client-error-fetch-threw', {
                source: report.source,
                message: errorMessage(error),
            });
            return false;
        }
    }

    return Object.freeze({ send });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ClientReportingTransport;
if (typeof window !== 'undefined') window.ClientReportingTransport = ClientReportingTransport;
if (typeof globalThis !== 'undefined') globalThis.ClientReportingTransport = ClientReportingTransport;
