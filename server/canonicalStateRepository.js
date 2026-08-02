'use strict';

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(name + ' must be a function');
    return value;
}

/**
 * Creates the runtime boundary between room orchestration and a canonical state store.
 * Record schema and store implementation remain injected.
 * @param {Object} dependencies
 * @returns {{
 *   persistRoomCanonicalState: function(string, Object, string, number=, Object=): Object,
 *   loadRoomCanonicalStateRecord: function(string, Object=): Object|null
 * }}
 */
function makeCanonicalStateRepository(dependencies = {}) {
    const buildRecord = requireFunction(dependencies.buildRecord, 'buildRecord');
    const validateRecord = requireFunction(dependencies.validateRecord, 'validateRecord');
    const defaultStore = dependencies.defaultStore || null;
    const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now;
    const warn = typeof dependencies.warn === 'function'
        ? dependencies.warn
        : (...args) => console.warn(...args);

    function persistRoomCanonicalState(
        roomId,
        room,
        reason,
        persistedAt = now(),
        store = defaultStore
    ) {
        if (!store || typeof store.save !== 'function') {
            return { ok: true, skipped: true };
        }
        const record = buildRecord(roomId, room, { reason, now: persistedAt });
        if (!record) return { ok: false, reason: 'invalid-record' };
        try {
            return store.save(record);
        } catch (error) {
            warn(
                '[canonical-state-store] save failed:',
                error && error.message || error
            );
            return { ok: false, reason: 'save-failed' };
        }
    }

    function loadRoomCanonicalStateRecord(roomId, store = defaultStore) {
        if (!store || typeof store.load !== 'function') return null;
        try {
            const record = store.load(roomId);
            const validation = validateRecord(record);
            if (!validation.ok || record.roomId !== roomId) return null;
            return record;
        } catch (error) {
            warn(
                '[canonical-state-store] load failed:',
                error && error.message || error
            );
            return null;
        }
    }

    return Object.freeze({
        persistRoomCanonicalState,
        loadRoomCanonicalStateRecord,
    });
}

module.exports = makeCanonicalStateRepository;
