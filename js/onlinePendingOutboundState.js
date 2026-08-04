'use strict';

const OnlinePendingOutboundState = (() => {
    function createController(options = {}) {
        const normalizeRoomId = typeof options.normalizeRoomId === 'function'
            ? options.normalizeRoomId
            : roomId => typeof roomId === 'string' ? roomId.trim().toUpperCase() : '';
        const entries = new Map();

        function roomKey(roomId) {
            return normalizeRoomId(roomId) || '';
        }

        function store(entry, fallbackRoomId = '') {
            if (!entry || typeof entry !== 'object') {
                throw new TypeError('pending outbound entry must be an object');
            }
            const key = roomKey(entry.roomId) || roomKey(fallbackRoomId);
            entries.set(key, entry);
            return entry;
        }

        function read(roomId) {
            const key = roomKey(roomId);
            return entries.has(key) ? entries.get(key) : null;
        }

        function remove(roomId) {
            return entries.delete(roomKey(roomId));
        }

        function clear() {
            entries.clear();
        }

        function snapshot() {
            return Object.freeze(Array.from(entries, ([roomId, entry]) =>
                Object.freeze({ roomId, entry })
            ));
        }

        return Object.freeze({ store, read, remove, clear, snapshot });
    }

    return Object.freeze({ createController });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlinePendingOutboundState;
if (typeof window !== 'undefined') window.OnlinePendingOutboundState = OnlinePendingOutboundState;
if (typeof globalThis !== 'undefined') globalThis.OnlinePendingOutboundState = OnlinePendingOutboundState;
