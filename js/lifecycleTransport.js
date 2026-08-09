'use strict';

const LifecycleTransport = (() => {
    const DEFAULT_MAX_ENTRIES = 8;
    const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    const DEFAULT_RETRY_AFTER_MS = 5000;
    const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

    function errorMessage(error) {
        return error && error.message || String(error);
    }

    function persistedPayload(payload = {}) {
        const persisted = {
            event: String(payload.event || '').slice(0, 40),
            mode: String(payload.mode || '').slice(0, 40),
            playerCount: Number(payload.playerCount) || 0,
            cpuCount: Number(payload.cpuCount) || 0,
            sessionId: String(payload.sessionId || '').slice(0, 120),
            appVersion: String(payload.appVersion || '').slice(0, 80),
        };
        if (payload.turn !== undefined) persisted.turn = Number(payload.turn) || 0;
        if (payload.winnerKind) {
            persisted.winnerKind = String(payload.winnerKind).slice(0, 40);
        }
        if (payload.winnerCpuDifficulty) {
            persisted.winnerCpuDifficulty =
                String(payload.winnerCpuDifficulty).slice(0, 40);
        }
        return Object.freeze(persisted);
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
                Number.isFinite(entry.createdAt) && entry.createdAt >= cutoff &&
                entry.payload);
            if (entries.length !== parsed.length) save(entries);
            return entries.slice(-maxEntries);
        }

        function enqueue(payload) {
            const createdAt = now();
            const persisted = persistedPayload(payload);
            const entries = load();
            const serialized = JSON.stringify(persisted);
            const duplicate = entries.find(entry =>
                JSON.stringify(entry.payload) === serialized);
            if (duplicate) return duplicate;
            const entry = {
                id: `${createdAt}-${sequence++}`,
                createdAt,
                attempts: 0,
                nextAttemptAt: createdAt,
                payload: persisted,
            };
            entries.push(entry);
            save(entries);
            return entry;
        }

        function pending() {
            const currentTime = now();
            return load().filter(entry => !inFlight.has(entry.id) &&
                (!Number.isFinite(entry.nextAttemptAt) ||
                    entry.nextAttemptAt <= currentTime));
        }

        function nextDelayMs() {
            const currentTime = now();
            const delays = load()
                .filter(entry => !inFlight.has(entry.id))
                .map(entry => Number.isFinite(entry.nextAttemptAt)
                    ? Math.max(0, entry.nextAttemptAt - currentTime)
                    : 0);
            return delays.length > 0 ? Math.min(...delays) : null;
        }

        function begin(id) {
            if (inFlight.has(id)) return false;
            inFlight.add(id);
            return true;
        }

        function release(id) {
            inFlight.delete(id);
        }

        function defer(id, minimumDelayMs = 0) {
            const entries = load();
            const entry = entries.find(candidate => candidate.id === id);
            if (entry) {
                entry.attempts = Math.max(0, Number(entry.attempts) || 0) + 1;
                const exponentialDelay = Math.min(
                    MAX_RETRY_DELAY_MS,
                    1000 * (2 ** (entry.attempts - 1))
                );
                const delayMs = Math.min(
                    MAX_RETRY_DELAY_MS,
                    Math.max(exponentialDelay, Number(minimumDelayMs) || 0)
                );
                entry.nextAttemptAt = now() + delayMs;
                save(entries);
                release(id);
                return delayMs;
            }
            release(id);
            return 0;
        }

        function complete(id) {
            save(load().filter(entry => entry.id !== id));
            release(id);
        }

        return Object.freeze({
            enqueue,
            pending,
            nextDelayMs,
            begin,
            release,
            defer,
            complete,
        });
    }

    function responseRetryAfterMs(response, now = Date.now()) {
        const value = response && response.headers &&
            typeof response.headers.get === 'function'
            ? response.headers.get('Retry-After')
            : '';
        if (value) {
            const seconds = Number(value);
            if (Number.isFinite(seconds) && seconds >= 0) {
                return Math.min(MAX_RETRY_DELAY_MS, Math.ceil(seconds * 1000));
            }
            const timestamp = Date.parse(value);
            if (Number.isFinite(timestamp)) {
                return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, timestamp - now));
            }
        }
        if (response && (response.status === 429 || response.status === 503)) {
            return DEFAULT_RETRY_AFTER_MS;
        }
        return 0;
    }

    function deferAndSchedule(options, entry, response) {
        if (!options.outbox) return;
        const delayMs = options.outbox.defer(
            entry.id,
            responseRetryAfterMs(response, Date.now())
        );
        if (delayMs > 0 && typeof options.scheduleRetry === 'function') {
            options.scheduleRetry(delayMs);
        }
    }

    function deliver(options, entry, retry = false) {
        const checkpoint = options.checkpoint;
        const outbox = options.outbox;
        if (outbox && !outbox.begin(entry.id)) return false;
        const payload = entry.payload;
        try {
            checkpoint(retry ? 'game-lifecycle-retry-start' : 'game-lifecycle-fetch-start', {
                event: payload.event,
                mode: payload.mode,
                playerCount: payload.playerCount,
                cpuCount: payload.cpuCount,
            });
            const request = options.fetchImpl(options.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true,
            });
            if (request && typeof request.then === 'function') {
                request.then(response => {
                    const ok = Boolean(response && response.ok === true);
                    if (outbox) {
                        if (ok) {
                            outbox.complete(entry.id);
                            if (typeof options.scheduleRetry === 'function') {
                                options.scheduleRetry(DEFAULT_RETRY_AFTER_MS);
                            }
                        } else {
                            deferAndSchedule(options, entry, response);
                        }
                    }
                    checkpoint('game-lifecycle-fetch-complete', {
                        event: payload.event,
                        ok,
                        status: response && response.status,
                    });
                }).catch(error => {
                    deferAndSchedule(options, entry);
                    checkpoint('game-lifecycle-fetch-failed', {
                        event: payload.event,
                        message: errorMessage(error),
                    });
                });
            } else if (outbox) {
                deferAndSchedule(options, entry);
            }
            return true;
        } catch (error) {
            deferAndSchedule(options, entry);
            checkpoint('game-lifecycle-fetch-threw', {
                event: payload.event,
                message: errorMessage(error),
            });
            return false;
        }
    }

    function send(options) {
        const event = options.event;
        const checkpoint = options.checkpoint;
        if (!options.enabled) {
            checkpoint('game-lifecycle-disabled', { event });
            return false;
        }
        if (typeof options.fetchImpl !== 'function' && !options.outbox) {
            checkpoint('game-lifecycle-fetch-unavailable', { event });
            return false;
        }

        const payload = options.buildPayload();
        const queued = options.outbox ? options.outbox.enqueue(payload) : null;
        if (typeof options.fetchImpl !== 'function') {
            checkpoint('game-lifecycle-fetch-unavailable', { event });
            return false;
        }
        const entry = queued
            ? { id: queued.id, payload }
            : { id: '', payload };
        return deliver(options, entry);
    }

    function flush(options) {
        if (!options.outbox || typeof options.fetchImpl !== 'function') return 0;
        let started = 0;
        const maxDeliveries = Number.isSafeInteger(options.maxDeliveries) &&
            options.maxDeliveries > 0
            ? options.maxDeliveries
            : Infinity;
        for (const entry of options.outbox.pending()) {
            if (started >= maxDeliveries) break;
            if (deliver(options, entry, true)) started += 1;
        }
        if (started === 0 && typeof options.scheduleRetry === 'function' &&
            typeof options.outbox.nextDelayMs === 'function') {
            const delayMs = options.outbox.nextDelayMs();
            if (delayMs !== null) options.scheduleRetry(delayMs);
        }
        return started;
    }

    return Object.freeze({
        createOutbox,
        persistedPayload,
        responseRetryAfterMs,
        send,
        flush,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LifecycleTransport;
if (typeof window !== 'undefined') window.LifecycleTransport = LifecycleTransport;
if (typeof globalThis !== 'undefined') globalThis.LifecycleTransport = LifecycleTransport;
