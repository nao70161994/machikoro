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

    function isAuthoritativeStore(store) {
        return !!(store && store.capabilities &&
            store.capabilities.durable === true &&
            store.capabilities.atomicCompareAndSwap === true &&
            store.capabilities.processSafeLocking === true &&
            store.capabilities.retention === true);
    }

    function authoritativeWriteFailure(reason, room) {
        if (room && typeof room === 'object') room.canonicalStateUnavailable = true;
        return Object.freeze({
            ok: false,
            reason: 'authoritative-write-failed',
            detail: String(reason || 'store-error'),
            errorCode: 'CANONICAL_STATE_UNAVAILABLE',
        });
    }

    function persistRoomCanonicalState(
        roomId,
        room,
        reason,
        persistedAt = now(),
        store = defaultStore
    ) {
        if (room && room.provisionalRestore === true) {
            return { ok: true, skipped: true, reason: 'provisional-hostless-restore' };
        }
        if (!store || typeof store.save !== 'function') {
            return { ok: true, skipped: true };
        }
        const record = buildRecord(roomId, room, { reason, now: persistedAt });
        if (!record) {
            if (isAuthoritativeStore(store)) return authoritativeWriteFailure('invalid-record', room);
            return { ok: false, reason: 'invalid-record' };
        }
        try {
            const result = store.save(record);
            if (isAuthoritativeStore(store) && (!result || result.ok !== true)) {
                return authoritativeWriteFailure(result && result.reason || 'store-rejected-write', room);
            }
            return result;
        } catch (error) {
            warn(
                '[canonical-state-store] save failed:',
                error && error.message || error
            );
            if (isAuthoritativeStore(store)) {
                return authoritativeWriteFailure(error && error.message || 'store-error', room);
            }
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
            if (isAuthoritativeStore(store)) {
                /** @type {Error & {code?: string}} */
                const failure = new Error('authoritative canonical state could not be loaded');
                failure.code = 'CANONICAL_STATE_READ_FAILED';
                throw failure;
            }
            return null;
        }
    }

    return Object.freeze({
        persistRoomCanonicalState,
        loadRoomCanonicalStateRecord,
    });
}

module.exports = makeCanonicalStateRepository;
