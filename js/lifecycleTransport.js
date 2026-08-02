'use strict';

const LifecycleTransport = (() => {
    function errorMessage(error) {
        return error && error.message || String(error);
    }

    function send(options) {
        const event = options.event;
        const checkpoint = options.checkpoint;
        if (!options.enabled) {
            checkpoint('game-lifecycle-disabled', { event });
            return false;
        }
        if (typeof options.fetchImpl !== 'function') {
            checkpoint('game-lifecycle-fetch-unavailable', { event });
            return false;
        }

        const payload = options.buildPayload();
        try {
            checkpoint('game-lifecycle-fetch-start', {
                event,
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
                    checkpoint('game-lifecycle-fetch-complete', {
                        event,
                        ok: response && response.ok !== false,
                        status: response && response.status,
                    });
                }).catch(error => {
                    checkpoint('game-lifecycle-fetch-failed', {
                        event,
                        message: errorMessage(error),
                    });
                });
            }
            return true;
        } catch (error) {
            checkpoint('game-lifecycle-fetch-threw', {
                event,
                message: errorMessage(error),
            });
            return false;
        }
    }

    return Object.freeze({ send });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LifecycleTransport;
if (typeof window !== 'undefined') window.LifecycleTransport = LifecycleTransport;
if (typeof globalThis !== 'undefined') globalThis.LifecycleTransport = LifecycleTransport;
