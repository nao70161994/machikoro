const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CANONICAL_STATE_STORE_SCHEMA_VERSION = 1;
const CANONICAL_STATE_STORE_MODES = Object.freeze({
    NOOP: 'noop',
    MEMORY: 'memory',
    FILE: 'file',
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
    if (mode === CANONICAL_STATE_STORE_MODES.MEMORY || mode === CANONICAL_STATE_STORE_MODES.FILE) return mode;
    return CANONICAL_STATE_STORE_MODES.NOOP;
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

/**
 * Creates a synchronous JSON-file store for a single service instance on durable local storage.
 * A dead process lock is reclaimed; an unreadable lock fails closed and requires operator cleanup.
 * @param {string} directory
 * @param {{retentionMs?: number, now?: function(): number, lockTimeoutMs?: number, durableAttested?: boolean, singleInstanceAttested?: boolean}} [options]
 */
function createFileCanonicalStateStore(directory, options = {}) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) {
        throw new TypeError('canonical state directory must be an absolute path');
    }
    if (options.durableAttested !== true || options.singleInstanceAttested !== true) {
        throw new TypeError('file canonical store requires durable-storage and single-instance attestations');
    }
    const retentionMs = options.retentionMs;
    if (!Number.isSafeInteger(retentionMs) || retentionMs <= 0) {
        throw new TypeError('file canonical store requires a positive retention period');
    }
    const lockTimeoutMs = Number.isSafeInteger(options.lockTimeoutMs) && options.lockTimeoutMs > 0
        ? options.lockTimeoutMs
        : 5_000;
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const localLocks = new Map();
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const directoryInfo = fs.lstatSync(directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
        throw new TypeError('canonical state directory must be a real directory');
    }
    if ((directoryInfo.mode & 0o077) !== 0) {
        throw new TypeError('canonical state directory must not be accessible by group or other users');
    }

    function roomKey(roomId) {
        return crypto.createHash('sha256').update(String(roomId || '')).digest('hex');
    }

    function recordPath(roomId) {
        return path.join(directory, roomKey(roomId) + '.json');
    }

    function lockDirectory(roomId) {
        return path.join(directory, roomKey(roomId) + '.lock');
    }

    function readRecord(roomId) {
        let source;
        try {
            source = fs.readFileSync(recordPath(roomId), 'utf8');
        } catch (error) {
            if (error && error.code === 'ENOENT') return null;
            throw error;
        }
        const record = JSON.parse(source);
        const validation = validateCanonicalStateRecord(record);
        if (!validation.ok || record.roomId !== roomId) {
            throw new Error('invalid canonical state record: ' + (validation.reason || 'room-id'));
        }
        return record;
    }

    function isDeadLock(lockPath) {
        try {
            const owner = JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8'));
            if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) return false;
            try {
                process.kill(owner.pid, 0);
                return false;
            } catch (error) {
                return !!error && error.code === 'ESRCH';
            }
        } catch (_) {
            // Incomplete lock metadata is ambiguous; never steal it.
            return false;
        }
    }

    function acquireRoomLock(roomId) {
        const target = lockDirectory(roomId);
        const nonce = crypto.randomBytes(16).toString('hex');
        const staging = target + '-' + nonce;
        fs.mkdirSync(staging, { mode: 0o700 });
        try {
            const ownerPath = path.join(staging, 'owner.json');
            fs.writeFileSync(ownerPath, JSON.stringify({ pid: process.pid, nonce }), {
                encoding: 'utf8', mode: 0o600, flag: 'wx',
            });
            const ownerFd = fs.openSync(ownerPath, 'r');
            try { fs.fsyncSync(ownerFd); } finally { fs.closeSync(ownerFd); }
        } catch (error) {
            fs.rmSync(staging, { recursive: true, force: true });
            throw error;
        }

        const deadline = Date.now() + lockTimeoutMs;
        while (true) {
            try {
                // Publish only complete lock metadata. Directory rename is atomic on the local filesystem.
                fs.renameSync(staging, target);
                return { target, nonce };
            } catch (error) {
                if (!error || !['EEXIST', 'ENOTEMPTY'].includes(error.code)) {
                    fs.rmSync(staging, { recursive: true, force: true });
                    throw error;
                }
                if (isDeadLock(target)) {
                    fs.rmSync(target, { recursive: true, force: true });
                    continue;
                }
                if (Date.now() >= deadline) {
                    fs.rmSync(staging, { recursive: true, force: true });
                    /** @type {Error & {code?: string}} */
                    const timeout = new Error('canonical state room lock timed out');
                    timeout.code = 'CANONICAL_STATE_LOCK_TIMEOUT';
                    throw timeout;
                }
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
            }
        }
    }

    function runExclusive(roomId, operation) {
        const key = String(roomId || '');
        if (!key || typeof operation !== 'function') return { ok: false, reason: 'invalid-operation' };
        const active = localLocks.get(key);
        if (active) {
            active.depth++;
            try { return operation(); } finally { active.depth--; }
        }
        const lock = acquireRoomLock(key);
        localLocks.set(key, { nonce: lock.nonce, depth: 1 });
        try {
            return operation();
        } finally {
            localLocks.delete(key);
            try {
                const owner = JSON.parse(fs.readFileSync(path.join(lock.target, 'owner.json'), 'utf8'));
                if (owner.nonce === lock.nonce) fs.rmSync(lock.target, { recursive: true, force: true });
            } catch (_) {
                // Preserve a lock if ownership cannot be proven.
            }
        }
    }

    function writeRecord(record) {
        const target = recordPath(record.roomId);
        const temporary = target + '.' + crypto.randomBytes(16).toString('hex') + '.tmp';
        try {
            const fd = fs.openSync(temporary, 'wx', 0o600);
            try {
                fs.writeFileSync(fd, JSON.stringify(record), 'utf8');
                fs.fsyncSync(fd);
            } finally {
                fs.closeSync(fd);
            }
            fs.renameSync(temporary, target);
            const directoryFd = fs.openSync(directory, 'r');
            try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
        } catch (error) {
            fs.rmSync(temporary, { force: true });
            throw error;
        }
    }

    function removeRecord(target) {
        fs.rmSync(target, { force: true });
        const directoryFd = fs.openSync(directory, 'r');
        try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
    }

    function isExpired(record, at = now()) {
        return Number.isSafeInteger(record.persistedAt) && record.persistedAt + retentionMs <= at;
    }

    function pruneExpiredFiles(at = now()) {
        let deleted = 0;
        for (const name of fs.readdirSync(directory)) {
            if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
            let record;
            try {
                record = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
            } catch (_) {
                continue;
            }
            if (!validateCanonicalStateRecord(record).ok || name !== roomKey(record.roomId) + '.json' ||
                    !isExpired(record, at)) continue;
            const result = runExclusive(record.roomId, () => {
                const latest = readRecord(record.roomId);
                if (!latest || !isExpired(latest, at)) return false;
                removeRecord(recordPath(record.roomId));
                return true;
            });
            if (result === true) deleted++;
        }
        return deleted;
    }

    return Object.freeze({
        mode: CANONICAL_STATE_STORE_MODES.FILE,
        capabilities: canonicalStateStoreCapabilities({
            durable: true,
            atomicCompareAndSwap: true,
            processSafeLocking: true,
            retention: true,
        }),
        save(record, saveOptions = {}) {
            const validation = validateCanonicalStateRecord(record);
            if (!validation.ok) return validation;
            return runExclusive(record.roomId, () => {
                const current = readRecord(record.roomId);
                const currentRevision = current?.storeRevision || 0;
                if (saveOptions.expectedRevision != null && saveOptions.expectedRevision !== currentRevision) {
                    return { ok: false, reason: 'revision-conflict', currentRevision };
                }
                const stored = cloneJson(record);
                stored.storeRevision = currentRevision + 1;
                writeRecord(stored);
                return { ok: true };
            });
        },
        load(roomId) {
            const key = String(roomId || '');
            const record = readRecord(key);
            if (!record || !isExpired(record)) return record ? cloneJson(record) : null;
            return runExclusive(key, () => {
                const latest = readRecord(key);
                if (!latest) return null;
                if (!isExpired(latest)) return cloneJson(latest);
                removeRecord(recordPath(key));
                return null;
            });
        },
        delete(roomId) {
            const key = String(roomId || '');
            return runExclusive(key, () => {
                removeRecord(recordPath(key));
                return { ok: true };
            });
        },
        list() {
            const records = [];
            pruneExpiredFiles();
            for (const name of fs.readdirSync(directory)) {
                if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
                try {
                    const record = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
                    if (validateCanonicalStateRecord(record).ok &&
                            name === roomKey(record.roomId) + '.json' && !isExpired(record)) {
                        records.push(cloneJson(record));
                    }
                } catch (_) {
                    // Keep corrupt files for diagnosis, but never return them as canonical records.
                }
            }
            return records;
        },
        prune(at = now()) {
            return { ok: true, deleted: pruneExpiredFiles(at) };
        },
        runExclusive,
    });
}

/** @returns {CanonicalStateStoreAdapter} */
function createCanonicalStateStoreFromEnv(env = process.env) {
    const mode = canonicalStateStoreMode(env);
    if (mode === CANONICAL_STATE_STORE_MODES.MEMORY) {
        return createMemoryCanonicalStateStore([], { retentionMs: canonicalStateStoreRetentionMs(env) });
    }
    if (mode === CANONICAL_STATE_STORE_MODES.FILE) {
        const retentionMs = canonicalStateStoreRetentionMs(env);
        if (retentionMs == null) {
            throw new TypeError('file canonical store requires CANONICAL_STATE_RETENTION_MS');
        }
        return createFileCanonicalStateStore(env.CANONICAL_STATE_STORE_DIR, {
            retentionMs,
            durableAttested: String(env.CANONICAL_STATE_STORE_DURABLE || '').toLowerCase() === 'true',
            singleInstanceAttested: String(env.CANONICAL_STATE_STORE_SINGLE_INSTANCE || '').toLowerCase() === 'true',
        });
    }
    return createNoopCanonicalStateStore();
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
    createFileCanonicalStateStore,
    createCanonicalStateStoreFromEnv,
};
