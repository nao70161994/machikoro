const CANONICAL_STATE_STORE_SCHEMA_VERSION = 1;
const CANONICAL_STATE_STORE_MODES = Object.freeze({
    NOOP: 'noop',
    MEMORY: 'memory',
});
const CANONICAL_STATE_STORE_REQUIRED_METHODS = Object.freeze([
    'save',
    'load',
    'delete',
    'list',
    'prune',
    'runExclusive',
]);
const CANONICAL_STATE_STORE_CAPABILITY_KEYS = Object.freeze([
    'durable',
    'atomicCompareAndSwap',
    'processSafeLocking',
    'retention',
]);


/**
 * @typedef {Object} CanonicalStateStoreCapabilities
 * @property {boolean} durable Survives process and host restart.
 * @property {boolean} atomicCompareAndSwap Enforces expected revision atomically.
 * @property {boolean} processSafeLocking Serializes a room across processes.
 * @property {boolean} retention Enforces bounded record lifetime.
 */

/**
 * @typedef {Object} CanonicalStateRecord
 * @property {number} schemaVersion
 * @property {string} roomId
 * @property {number} persistedAt
 * @property {string} reason
 * @property {Object|null} gameStartPayload
 * @property {Object|null} stateSnapshot
 * @property {Array<Object>} actionLog
 * @property {Array<Object>} acceptedClientActions
 * @property {number|null} hostPlayerIndex
 * @property {number} hostEpoch
 * @property {number} actionSeq
 * @property {number|null} lastTouchedAt
 * @property {number} [storeRevision]
 */

/**
 * @callback CanonicalStateStoreSave
 * @param {CanonicalStateRecord} record
 * @param {Object} [options]
 * @returns {Object}
 */

/**
 * @callback CanonicalStateStoreLoad
 * @param {string} roomId
 * @returns {CanonicalStateRecord|null}
 */

/**
 * @callback CanonicalStateStoreRoomOperation
 * @param {string} roomId
 * @returns {Object}
 */

/**
 * @callback CanonicalStateStoreList
 * @returns {Array<CanonicalStateRecord>}
 */

/**
 * @callback CanonicalStateStorePrune
 * @param {number} [now]
 * @returns {Object}
 */

/**
 * @callback CanonicalStateStoreRunExclusive
 * @param {string} roomId
 * @param {function(): *} operation
 * @returns {*}
 */

/**
 * @typedef {Object} CanonicalStateStoreAdapter
 * @property {string} mode
 * @property {CanonicalStateStoreCapabilities} capabilities
 * @property {CanonicalStateStoreSave} save
 * @property {CanonicalStateStoreLoad} load
 * @property {CanonicalStateStoreRoomOperation} delete
 * @property {CanonicalStateStoreList} list
 * @property {CanonicalStateStorePrune} prune
 * @property {CanonicalStateStoreRunExclusive} runExclusive
 */
function cloneJson(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function canonicalStateStoreMode(env = process.env) {
    const mode = String(env.CANONICAL_STATE_STORE || env.CANONICAL_STATE_STORE_MODE || '').trim().toLowerCase();
    return mode === CANONICAL_STATE_STORE_MODES.MEMORY ? CANONICAL_STATE_STORE_MODES.MEMORY : CANONICAL_STATE_STORE_MODES.NOOP;
}

function canonicalStateStoreRetentionMs(env = process.env) {
    const value = Number(env.CANONICAL_STATE_RETENTION_MS);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** @returns {CanonicalStateStoreCapabilities} */
function canonicalStateStoreCapabilities(overrides = {}) {
    return Object.freeze({
        durable: overrides.durable === true,
        atomicCompareAndSwap: overrides.atomicCompareAndSwap === true,
        processSafeLocking: overrides.processSafeLocking === true,
        retention: overrides.retention === true,
    });
}

/**
 * @param {CanonicalStateStoreAdapter|Object} store
 * @param {{requireAuthoritative?: boolean}} [options]
 * @returns {Object}
 */
function validateCanonicalStateStoreAdapter(store, options = {}) {
    if (!store || typeof store !== 'object') return { ok: false, reason: 'not-object' };
    for (const method of CANONICAL_STATE_STORE_REQUIRED_METHODS) {
        if (typeof store[method] !== 'function') return { ok: false, reason: 'missing-' + method };
    }
    if (!store.capabilities || typeof store.capabilities !== 'object') {
        return { ok: false, reason: 'missing-capabilities' };
    }
    for (const capability of CANONICAL_STATE_STORE_CAPABILITY_KEYS) {
        if (typeof store.capabilities[capability] !== 'boolean') {
            return { ok: false, reason: 'invalid-capability-' + capability };
        }
    }
    if (options.requireAuthoritative === true) {
        const missing = CANONICAL_STATE_STORE_CAPABILITY_KEYS
            .filter(capability => store.capabilities[capability] !== true);
        if (missing.length > 0) return { ok: false, reason: 'not-authoritative', missing };
    }
    return { ok: true };
}

function isAuthoritativeCanonicalStateStore(store) {
    return validateCanonicalStateStoreAdapter(store, { requireAuthoritative: true }).ok;
}

function acceptedClientActionRefsFromRoom(room) {
    if (!room || !room.acceptedClientActions) return [];
    return Object.values(room.acceptedClientActions)
        .filter(entry => entry && typeof entry.clientActionId === 'string' && Number.isInteger(entry.playerIndex))
        .map(entry => {
            const ref = { playerIndex: entry.playerIndex, clientActionId: entry.clientActionId };
            if (Number.isInteger(entry.seq)) ref.seq = entry.seq;
            return ref;
        });
}

/**
 * @param {string} roomId
 * @param {Object} room
 * @param {{now?: number, reason?: string}} [options]
 * @returns {CanonicalStateRecord|null}
 */
function buildCanonicalStateRecord(roomId, room, options = {}) {
    if (!room || typeof roomId !== 'string' || !roomId.trim()) return null;
    return {
        schemaVersion: CANONICAL_STATE_STORE_SCHEMA_VERSION,
        roomId,
        persistedAt: Number.isInteger(options.now) ? options.now : Date.now(),
        reason: String(options.reason || ''),
        gameStartPayload: cloneJson(room.gameStartPayload || null),
        stateSnapshot: cloneJson(room.stateSnapshot || null),
        actionLog: cloneJson(Array.isArray(room.actionLog) ? room.actionLog : []),
        acceptedClientActions: cloneJson(acceptedClientActionRefsFromRoom(room)),
        hostPlayerIndex: Number.isInteger(room.hostPlayerIndex) ? room.hostPlayerIndex : null,
        hostEpoch: Number.isSafeInteger(room.hostEpoch) && room.hostEpoch >= 0 ? room.hostEpoch : 0,
        actionSeq: Number.isSafeInteger(room.actionSeq) && room.actionSeq >= 0 ? room.actionSeq : 0,
        lastTouchedAt: Number.isInteger(room.lastTouchedAt) ? room.lastTouchedAt : null,
    };
}

function validateCanonicalStateRecord(record) {
    if (!record || typeof record !== 'object') return { ok: false, reason: 'not-object' };
    if (record.schemaVersion !== CANONICAL_STATE_STORE_SCHEMA_VERSION) return { ok: false, reason: 'schema-version' };
    if (typeof record.roomId !== 'string' || !record.roomId.trim()) return { ok: false, reason: 'room-id' };
    if (!Array.isArray(record.actionLog)) return { ok: false, reason: 'action-log' };
    if (!Array.isArray(record.acceptedClientActions)) return { ok: false, reason: 'accepted-client-actions' };
    if (!Number.isSafeInteger(record.hostEpoch) || record.hostEpoch < 0) return { ok: false, reason: 'host-epoch' };
    if (!Number.isSafeInteger(record.actionSeq) || record.actionSeq < 0) return { ok: false, reason: 'action-seq' };
    if (record.storeRevision != null &&
            (!Number.isSafeInteger(record.storeRevision) || record.storeRevision < 1)) {
        return { ok: false, reason: 'store-revision' };
    }
    return { ok: true };
}

/** @returns {CanonicalStateStoreAdapter} */
function createNoopCanonicalStateStore() {
    return Object.freeze({
        mode: CANONICAL_STATE_STORE_MODES.NOOP,
        capabilities: canonicalStateStoreCapabilities(),
        save() { return { ok: true, skipped: true }; },
        load() { return null; },
        delete() { return { ok: true, skipped: true }; },
        list() { return []; },
        prune() { return { ok: true, skipped: true, deleted: 0 }; },
        runExclusive(roomId, operation) {
            if (typeof operation !== 'function') return { ok: false, reason: 'invalid-operation' };
            return operation();
        },
    });
}

/** @returns {CanonicalStateStoreAdapter} */
function createMemoryCanonicalStateStore(initialRecords = [], options = {}) {
    const records = new Map();
    const locks = new Set();
    const retentionMs = Number.isSafeInteger(options.retentionMs) && options.retentionMs > 0
        ? options.retentionMs
        : null;
    const now = typeof options.now === 'function' ? options.now : Date.now;

    function isExpired(record, at = now()) {
        return retentionMs != null &&
            Number.isInteger(record?.persistedAt) &&
            record.persistedAt + retentionMs <= at;
    }

    function pruneRecords(at = now()) {
        let deleted = 0;
        for (const [roomId, record] of records) {
            if (!isExpired(record, at)) continue;
            records.delete(roomId);
            deleted++;
        }
        return { ok: true, deleted };
    }

    for (const record of initialRecords) {
        const validation = validateCanonicalStateRecord(record);
        if (validation.ok && !isExpired(record)) {
            const stored = cloneJson(record);
            stored.storeRevision = Number.isSafeInteger(stored.storeRevision) ? stored.storeRevision : 1;
            records.set(record.roomId, stored);
        }
    }
    return Object.freeze({
        mode: CANONICAL_STATE_STORE_MODES.MEMORY,
        capabilities: canonicalStateStoreCapabilities({
            atomicCompareAndSwap: true,
            retention: retentionMs != null,
        }),
        save(record, saveOptions = {}) {
            const validation = validateCanonicalStateRecord(record);
            if (!validation.ok) return validation;
            const current = records.get(record.roomId);
            const currentRevision = current?.storeRevision || 0;
            if (saveOptions.expectedRevision != null &&
                    saveOptions.expectedRevision !== currentRevision) {
                return { ok: false, reason: 'revision-conflict', currentRevision };
            }
            const stored = cloneJson(record);
            stored.storeRevision = currentRevision + 1;
            records.set(record.roomId, stored);
            return { ok: true };
        },
        load(roomId) {
            const key = String(roomId || '');
            const record = records.get(key);
            if (record && isExpired(record)) {
                records.delete(key);
                return null;
            }
            return record ? cloneJson(record) : null;
        },
        delete(roomId) {
            records.delete(String(roomId || ''));
            return { ok: true };
        },
        list() {
            pruneRecords();
            return Array.from(records.values()).map(cloneJson);
        },
        prune: pruneRecords,
        runExclusive(roomId, operation) {
            const key = String(roomId || '');
            if (!key || typeof operation !== 'function') return { ok: false, reason: 'invalid-operation' };
            if (locks.has(key)) return { ok: false, reason: 'lock-conflict' };
            locks.add(key);
            try {
                return operation();
            } finally {
                locks.delete(key);
            }
        },
    });
}

/** @returns {CanonicalStateStoreAdapter} */
function createCanonicalStateStoreFromEnv(env = process.env) {
    return canonicalStateStoreMode(env) === CANONICAL_STATE_STORE_MODES.MEMORY
        ? createMemoryCanonicalStateStore([], { retentionMs: canonicalStateStoreRetentionMs(env) })
        : createNoopCanonicalStateStore();
}

module.exports = {
    CANONICAL_STATE_STORE_SCHEMA_VERSION,
    CANONICAL_STATE_STORE_MODES,
    CANONICAL_STATE_STORE_REQUIRED_METHODS,
    CANONICAL_STATE_STORE_CAPABILITY_KEYS,
    canonicalStateStoreMode,
    canonicalStateStoreRetentionMs,
    canonicalStateStoreCapabilities,
    validateCanonicalStateStoreAdapter,
    isAuthoritativeCanonicalStateStore,
    buildCanonicalStateRecord,
    validateCanonicalStateRecord,
    createNoopCanonicalStateStore,
    createMemoryCanonicalStateStore,
    createCanonicalStateStoreFromEnv,
};
