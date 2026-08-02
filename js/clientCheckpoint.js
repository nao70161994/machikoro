'use strict';

const ClientCheckpoint = (() => {
    const DEFAULT_MAX_ENTRIES = 80;
    const DEFAULT_PERSIST_LIMIT = 5000;

    function createCheckpoint(options) {
        try {
            return {
                event: options.event,
                details: options.details,
                snapshot: options.buildSnapshot(),
                timestamp: options.timestamp(),
            };
        } catch (_) {
            try {
                return {
                    event: options.event,
                    details: options.details,
                    snapshot: null,
                    timestamp: options.timestamp(),
                    snapshotFailed: true,
                };
            } catch (_) {
                return null;
            }
        }
    }

    function appendToRoot(root, checkpoint, maxEntries) {
        if (!root) return;
        const list = Array.isArray(root.__machikoroClientCheckpoints)
            ? root.__machikoroClientCheckpoints
            : [];
        list.push(checkpoint);
        while (list.length > maxEntries) list.shift();
        root.__machikoroClientCheckpoints = list;
    }

    function record(options) {
        const checkpoint = createCheckpoint(options);
        if (!checkpoint) return null;

        try {
            appendToRoot(
                options.getRoot(),
                checkpoint,
                Number.isInteger(options.maxEntries) ? options.maxEntries : DEFAULT_MAX_ENTRIES
            );
        } catch (_) {}

        try {
            const limit = Number.isInteger(options.persistLimit)
                ? options.persistLimit
                : DEFAULT_PERSIST_LIMIT;
            options.persist(JSON.stringify(checkpoint).slice(0, limit));
        } catch (_) {}
        return checkpoint;
    }

    return Object.freeze({ record });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ClientCheckpoint;
if (typeof window !== 'undefined') window.ClientCheckpoint = ClientCheckpoint;
if (typeof globalThis !== 'undefined') globalThis.ClientCheckpoint = ClientCheckpoint;
