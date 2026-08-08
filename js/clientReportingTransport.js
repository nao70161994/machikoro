'use strict';

const ClientReportingTransport = (() => {
    const DEFAULT_MAX_ENTRIES = 8;
    const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

    function errorMessage(error) {
        return error && error.message || String(error);
    }

    function persistedReport(report = {}) {
        return Object.freeze({
            source: String(report.source || 'unknown').slice(0, 80),
            message: String(report.message || '').slice(0, 500),
            stack: String(report.stack || '').slice(0, 2400),
            userAgent: String(report.userAgent || '').slice(0, 300),
            phase: String(report.phase || '').slice(0, 80),
            playerIndex: Number.isInteger(report.playerIndex) ? report.playerIndex : -1,
            appVersion: String(report.appVersion || '').slice(0, 80),
            url: String(report.url || '').slice(0, 500),
        });
    }

    function createOutbox(options = {}) {
        const read = options.read;
        const write = options.write;
        const now = options.now || (() => Date.now());
        const maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES;
        const maxAgeMs = options.maxAgeMs || DEFAULT_MAX_AGE_MS;
        if (typeof read !== 'function' || typeof write !== 'function') {
            throw new TypeError('outbox read and write are required');
        }
        let sequence = 0;
        const inFlight = new Set();

        function sameReport(left, right) {
            return JSON.stringify(left) === JSON.stringify(right);
        }

        function save(entries) {
            write(JSON.stringify(entries.slice(-maxEntries)));
        }

        function load() {
            let parsed;
            try {
                parsed = JSON.parse(read() || '[]');
            } catch (_) {
                parsed = [];
            }
            if (!Array.isArray(parsed)) parsed = [];
            const cutoff = now() - maxAgeMs;
            const entries = parsed.filter(entry => entry && typeof entry.id === 'string' &&
                Number.isFinite(entry.createdAt) && entry.createdAt >= cutoff && entry.report);
            if (entries.length !== parsed.length) save(entries);
            return entries.slice(-maxEntries);
        }

        function enqueue(report) {
            const createdAt = now();
            const persisted = persistedReport(report);
            const entries = load();
            const duplicate = entries.find(entry => sameReport(entry.report, persisted));
            if (duplicate) return duplicate;
            const entry = {
                id: `${createdAt}-${sequence++}`,
                createdAt,
                attempts: 0,
                nextAttemptAt: createdAt,
                report: persisted,
            };
            entries.push(entry);
            save(entries);
            return entry;
        }

        function pending() {
            const currentTime = now();
            return load().filter(entry => !inFlight.has(entry.id) &&
                (!Number.isFinite(entry.nextAttemptAt) || entry.nextAttemptAt <= currentTime));
        }

        function begin(id) {
            if (inFlight.has(id)) return false;
            inFlight.add(id);
            return true;
        }

        function release(id) {
            inFlight.delete(id);
        }

        function defer(id) {
            const entries = load();
            const entry = entries.find(candidate => candidate.id === id);
            if (entry) {
                entry.attempts = Math.max(0, Number(entry.attempts) || 0) + 1;
                entry.nextAttemptAt = now() + Math.min(60000, 1000 * (2 ** (entry.attempts - 1)));
                save(entries);
            }
            release(id);
        }

        function complete(id) {
            save(load().filter(entry => entry.id !== id));
            release(id);
        }

        return Object.freeze({ enqueue, pending, begin, release, defer, complete });
    }

    function deliver(options, entry, retry = false) {
        const checkpoint = options.checkpoint;
        const outbox = options.outbox;
        if (outbox && !outbox.begin(entry.id)) return false;
        const report = entry.report;
        try {
            checkpoint(retry ? 'client-error-retry-start' : 'client-error-fetch-start', {
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
                    const ok = Boolean(response && response.ok === true);
                    if (outbox) {
                        if (ok) outbox.complete(entry.id);
                        else outbox.defer(entry.id);
                    }
                    checkpoint('client-error-fetch-complete', {
                        source: report.source,
                        ok,
                        status: response && response.status,
                    });
                }).catch(error => {
                    if (outbox) outbox.defer(entry.id);
                    checkpoint('client-error-fetch-failed', {
                        source: report.source,
                        message: errorMessage(error),
                    });
                });
            } else if (outbox) {
                outbox.defer(entry.id);
            }
            return true;
        } catch (error) {
            if (outbox) outbox.defer(entry.id);
            checkpoint('client-error-fetch-threw', {
                source: report.source,
                message: errorMessage(error),
            });
            return false;
        }
    }

    function send(options) {
        const checkpoint = options.checkpoint;
        if (typeof options.fetchImpl !== 'function') {
            checkpoint('client-error-fetch-unavailable', { source: options.source });
            return false;
        }

        const report = options.buildReport();
        if (!options.shouldSend(report)) return false;

        const queued = options.outbox ? options.outbox.enqueue(report) : null;
        const entry = queued ? { id: queued.id, report } : { id: '', report };
        return deliver(options, entry);
    }

    function flush(options) {
        if (!options.outbox || typeof options.fetchImpl !== 'function') return 0;
        let started = 0;
        for (const entry of options.outbox.pending()) {
            if (deliver(options, entry, true)) started += 1;
        }
        return started;
    }

    return Object.freeze({ createOutbox, persistedReport, send, flush });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ClientReportingTransport;
if (typeof window !== 'undefined') window.ClientReportingTransport = ClientReportingTransport;
if (typeof globalThis !== 'undefined') globalThis.ClientReportingTransport = ClientReportingTransport;
