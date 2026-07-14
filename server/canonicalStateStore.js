const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CANONICAL_STATE_STORE_SCHEMA_VERSION = 1;
const MAX_CANONICAL_ACTION_STREAMS = 320;
const CANONICAL_STATE_STORE_MODES = Object.freeze({
    NOOP: 'noop',
    MEMORY: 'memory',
    FILE: 'file',
});

function cloneJson(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function canonicalStateStoreMode(env = process.env) {
    const mode = String(env.CANONICAL_STATE_STORE || env.CANONICAL_STATE_STORE_MODE || '').trim().toLowerCase();
    if (mode === CANONICAL_STATE_STORE_MODES.NOOP || mode === CANONICAL_STATE_STORE_MODES.MEMORY) return mode;
    return CANONICAL_STATE_STORE_MODES.FILE;
}

function acceptedClientActionRefsFromRoom(room) {
    if (!room || !room.acceptedClientActions) return [];
    return Object.values(room.acceptedClientActions)
        .filter(entry => entry && typeof entry.clientActionId === 'string' && Number.isInteger(entry.playerIndex))
        .map(entry => cloneJson(entry));
}

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
        hostEpoch: Number.isInteger(room.hostEpoch) ? room.hostEpoch : 0,
        actionSeq: Number.isInteger(room.actionSeq) ? room.actionSeq : 0,
        lastTouchedAt: Number.isInteger(room.lastTouchedAt) ? room.lastTouchedAt : null,
        ownerId: typeof options.ownerId === 'string' ? options.ownerId : null,
        leaseExpiresAt: Number.isInteger(options.leaseExpiresAt) ? options.leaseExpiresAt : null,
        revision: Number.isInteger(options.revision) ? options.revision : (Number.isInteger(room.canonicalRevision) ? room.canonicalRevision : 0),
        acceptedClientActionWatermarks: cloneJson(room.acceptedClientActionWatermarks || {}),
    };
}

function validateCanonicalStateRecord(record) {
    if (!record || typeof record !== 'object') return { ok: false, reason: 'not-object' };
    if (record.schemaVersion !== CANONICAL_STATE_STORE_SCHEMA_VERSION) return { ok: false, reason: 'schema-version' };
    if (typeof record.roomId !== 'string' || !record.roomId.trim()) return { ok: false, reason: 'room-id' };
    if (!Array.isArray(record.actionLog)) return { ok: false, reason: 'action-log' };
    if (!Array.isArray(record.acceptedClientActions)) return { ok: false, reason: 'accepted-client-actions' };
    if (!Number.isInteger(record.hostEpoch) || record.hostEpoch < 0) return { ok: false, reason: 'host-epoch' };
    if (!Number.isInteger(record.actionSeq) || record.actionSeq < 0) return { ok: false, reason: 'action-seq' };
    if (!Number.isInteger(record.revision) || record.revision < 0) return { ok: false, reason: 'revision' };
    if (!record.acceptedClientActionWatermarks || typeof record.acceptedClientActionWatermarks !== 'object' || Array.isArray(record.acceptedClientActionWatermarks)) return { ok: false, reason: 'accepted-client-action-watermarks' };
    const watermarkEntries = Object.entries(record.acceptedClientActionWatermarks);
    if (watermarkEntries.length > MAX_CANONICAL_ACTION_STREAMS) return { ok: false, reason: 'accepted-client-action-watermark-limit' };
    for (const [key, counter] of watermarkEntries) {
        if (!/^\d+:[A-Za-z0-9_-]{8,24}$/.test(key) || !Number.isSafeInteger(counter) || counter < 1) return { ok: false, reason: 'accepted-client-action-watermark' };
    }
    const snapshotSeq = Number.isInteger(record.stateSnapshot?.actionSeq) ? record.stateSnapshot.actionSeq : 0;
    let previousActionSeq = snapshotSeq;
    for (const entry of record.actionLog) {
        if (!entry || !Number.isInteger(entry.seq) || entry.seq !== previousActionSeq + 1 || entry.seq > record.actionSeq) return { ok: false, reason: 'action-log-seq' };
        previousActionSeq = entry.seq;
    }
    if (previousActionSeq !== record.actionSeq) return { ok: false, reason: 'action-log-tail-seq' };
    const acceptedKeys = new Set();
    const acceptedSeqs = new Set();
    for (const entry of record.acceptedClientActions) {
        if (!entry || typeof entry.clientActionId !== 'string' || !entry.clientActionId || !Number.isInteger(entry.playerIndex)) return { ok: false, reason: 'accepted-client-action' };
        const key = `${entry.playerIndex}:${entry.clientActionId}`;
        if (acceptedKeys.has(key)) return { ok: false, reason: 'duplicate-accepted-client-action' };
        acceptedKeys.add(key);
        if (!Number.isInteger(entry.seq) || entry.seq < 1 || entry.seq > record.actionSeq) return { ok: false, reason: 'accepted-client-action-seq' };
        if (acceptedSeqs.has(entry.seq)) return { ok: false, reason: 'duplicate-accepted-client-action-seq' };
        acceptedSeqs.add(entry.seq);
    }
    return { ok: true };
}

function createNoopCanonicalStateStore() {
    return Object.freeze({
        mode: CANONICAL_STATE_STORE_MODES.NOOP,
        save() { return { ok: true, skipped: true }; },
        renewLease() { return { ok: true, skipped: true }; },
        verifyDurability() { return { ok: true, skipped: true }; },
        load() { return null; },
        delete() { return { ok: true, skipped: true }; },
        list() { return []; },
    });
}

function createMemoryCanonicalStateStore(initialRecords = []) {
    const records = new Map();
    for (const record of initialRecords) {
        const validation = validateCanonicalStateRecord(record);
        if (validation.ok) records.set(record.roomId, cloneJson(record));
    }
    return Object.freeze({
        mode: CANONICAL_STATE_STORE_MODES.MEMORY,
        save(record, options = {}) {
            const validation = validateCanonicalStateRecord(record);
            if (!validation.ok) return validation;
            const current = records.get(record.roomId);
            const currentRevision = Number.isInteger(current?.revision) ? current.revision : 0;
            if (Number.isInteger(options.expectedRevision) && options.expectedRevision !== currentRevision) return { ok: false, reason: 'revision-conflict', revision: currentRevision };
            const saved = cloneJson(record);
            saved.revision = currentRevision + 1;
            records.set(record.roomId, saved);
            return Number.isInteger(options.expectedRevision) ? { ok: true, revision: saved.revision } : { ok: true };
        },
        verifyDurability(options = {}) {
            if (!options.roomId) return { ok: true };
            const record = records.get(String(options.roomId));
            if (!record) return { ok: false, reason: 'not-found' };
            if (Number.isInteger(options.expectedRevision) && record.revision !== options.expectedRevision) return { ok: false, reason: 'revision-conflict', revision: record.revision };
            if (options.ownerId && record.ownerId !== options.ownerId) return { ok: false, reason: 'owner-conflict', ownerId: record.ownerId };
            return { ok: true };
        },
        renewLease(roomId, options = {}) {
            const key = String(roomId || '');
            const current = records.get(key);
            if (!current) return { ok: false, reason: 'not-found' };
            if (Number.isInteger(options.expectedRevision) && options.expectedRevision !== current.revision) return { ok: false, reason: 'revision-conflict', revision: current.revision };
            current.ownerId = options.ownerId || current.ownerId;
            current.leaseExpiresAt = options.leaseExpiresAt;
            current.persistedAt = options.now;
            current.revision++;
            return { ok: true, revision: current.revision };
        },
        load(roomId) {
            const record = records.get(String(roomId || ''));
            return record ? cloneJson(record) : null;
        },
        delete(roomId, options = {}) {
            const key = String(roomId || '');
            const current = records.get(key);
            if (Number.isInteger(options.expectedRevision) && options.expectedRevision !== (current?.revision || 0)) return { ok: false, reason: 'revision-conflict' };
            if (Number.isInteger(options.leaseExpiredAt) && Number.isInteger(current?.leaseExpiresAt) && current.leaseExpiresAt > options.leaseExpiredAt) return { ok: false, reason: 'lease-active' };
            records.delete(key);
            return { ok: true };
        },
        list() {
            return Array.from(records.values()).map(cloneJson);
        },
    });
}

function createFileCanonicalStateStore(filePath) {
    const resolvedPath = path.resolve(filePath || path.join(process.cwd(), 'data', 'canonical-state.json'));
    const backupPath = `${resolvedPath}.bak`;
    const backup2Path = `${resolvedPath}.bak2`;
    const journalPath = `${resolvedPath}.journal`;
    const lockPath = `${resolvedPath}.lock`;
    const LOCK_STALE_MS = 30000;
    function recordsChecksum(records) {
        return crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');
    }
    function processIdentity(pid) {
        try {
            const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
            const closeParen = stat.lastIndexOf(')');
            return stat.slice(closeParen + 2).trim().split(/\s+/)[19] || null;
        } catch {
            return null;
        }
    }
    function parseRecords(targetPath) {
        const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        if (!parsed || parsed.schemaVersion !== CANONICAL_STATE_STORE_SCHEMA_VERSION || !Array.isArray(parsed.records)) throw new Error('invalid canonical state envelope');
        if (parsed.checksum && parsed.checksum !== recordsChecksum(parsed.records)) throw new Error('canonical state checksum mismatch');
        for (const record of parsed.records) {
            if (!Number.isInteger(record.revision)) record.revision = 0;
            if (!record.acceptedClientActionWatermarks || typeof record.acceptedClientActionWatermarks !== 'object') record.acceptedClientActionWatermarks = {};
        }
        if (parsed.records.some(record => !validateCanonicalStateRecord(record).ok)) throw new Error('invalid canonical state record');
        if (new Set(parsed.records.map(record => record.roomId)).size !== parsed.records.length) throw new Error('duplicate canonical state room');
        return new Map(parsed.records.map(record => [record.roomId, record]));
    }
    function readRecordsReadOnly() {
        const errors = [];
        for (const candidate of [journalPath, resolvedPath, backupPath, backup2Path]) {
            try { return parseRecords(candidate); }
            catch (error) { if (error.code !== 'ENOENT') errors.push(error); }
        }
        if (errors.length === 0) return new Map();
        const wrapped = new Error(`canonical state is unreadable: ${errors[0].message}`);
        wrapped.code = 'CANONICAL_STATE_CORRUPT';
        throw wrapped;
    }
    function readRecordsForWrite() {
        return readRecordsReadOnly();
    }
    function fsyncFile(targetPath) {
        const fd = fs.openSync(targetPath, 'r');
        try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    function fsyncDirectory() {
        const fd = fs.openSync(path.dirname(resolvedPath), 'r');
        try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    function fsyncDirectoryBestEffort() {
        try { fsyncDirectory(); } catch (error) { console.warn('[canonical-state-store] directory fsync failed after commit:', error.message); }
    }
    function writeRecords(records) {
        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        const serializedRecords = Array.from(records.values());
        const envelope = JSON.stringify({ schemaVersion: CANONICAL_STATE_STORE_SCHEMA_VERSION, records: serializedRecords, checksum: recordsChecksum(serializedRecords) });
        const tempPath = `${resolvedPath}.${process.pid}.tmp`;
        const tempFd = fs.openSync(tempPath, 'w', 0o600);
        try { fs.writeFileSync(tempFd, envelope); fs.fsyncSync(tempFd); } finally { fs.closeSync(tempFd); }

        try {
            parseRecords(resolvedPath);
            try {
                parseRecords(backupPath);
                const backup2TempPath = `${backup2Path}.${process.pid}.tmp`;
                fs.copyFileSync(backupPath, backup2TempPath);
                fsyncFile(backup2TempPath);
                fs.renameSync(backup2TempPath, backup2Path);
            } catch (error) { if (error.code !== 'ENOENT') throw error; }
            const backupTempPath = `${backupPath}.${process.pid}.tmp`;
            fs.copyFileSync(resolvedPath, backupTempPath);
            fsyncFile(backupTempPath);
            fs.renameSync(backupTempPath, backupPath);
        } catch (error) {
            const corruptPrimary = error instanceof SyntaxError || /canonical state|checksum|duplicate/.test(error.message);
            if (error.code !== 'ENOENT' && !corruptPrimary) {
                try { fs.unlinkSync(tempPath); } catch {}
                throw error;
            }
            if (error.code !== 'ENOENT') {
                try { fs.renameSync(resolvedPath, `${resolvedPath}.corrupt-${Date.now()}-${process.pid}`); } catch {}
            }
        }

        const journalTempPath = `${journalPath}.${process.pid}.tmp`;
        fs.copyFileSync(tempPath, journalTempPath);
        fsyncFile(journalTempPath);
        fs.renameSync(journalTempPath, journalPath);
        // The journal rename is the commit point. All later failures must not turn the save into a rollback.
        let degraded = false;
        try { fsyncDirectory(); } catch (error) {
            degraded = true;
            console.warn('[canonical-state-store] journal directory fsync failed after commit:', error.message);
        }
        try {
            fs.renameSync(tempPath, resolvedPath);
            fsyncDirectoryBestEffort();
        } catch (error) {
            console.warn('[canonical-state-store] primary refresh failed after journal commit:', error.message);
        }
        return { degraded };
    }

    function clearDeadProcessLock() {
        let lock;
        try {
            const text = fs.readFileSync(lockPath, 'utf8');
            try { lock = JSON.parse(text); }
            catch { const stat = fs.statSync(lockPath); lock = { pid: Number.parseInt(text, 10), createdAt: Math.trunc(stat.mtimeMs) }; }
        } catch (error) { return error.code === 'ENOENT'; }
        const ownerPid = lock && lock.pid;
        const createdAt = lock && lock.createdAt;
        const stale = !Number.isInteger(createdAt) || createdAt <= 0 || Date.now() - createdAt > LOCK_STALE_MS;
        if (Number.isInteger(ownerPid) && ownerPid > 0) {
            try {
                process.kill(ownerPid, 0);
                const currentIdentity = processIdentity(ownerPid);
                if (!lock.processIdentity || !currentIdentity || lock.processIdentity === currentIdentity) return false;
            } catch (error) { if (error.code !== 'ESRCH') return false; }
        } else if (!stale) return false;
        try { fs.unlinkSync(lockPath); return true; }
        catch (error) { return error.code === 'ENOENT'; }
    }
    function withWriteLock(operation, retried = false) {
        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        let lockFd;
        let acquired = false;
        try {
            try {
                lockFd = fs.openSync(lockPath, 'wx', 0o600);
                fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, createdAt: Date.now(), processIdentity: processIdentity(process.pid) }));
                fs.fsyncSync(lockFd);
                acquired = true;
            } catch (error) {
                if (lockFd !== undefined) { try { fs.closeSync(lockFd); } catch {} lockFd = undefined; }
                if (error.code === 'EEXIST') {
                    if (!retried && clearDeadProcessLock()) return withWriteLock(operation, true);
                    return { ok: false, reason: 'store-busy' };
                }
                try { fs.unlinkSync(lockPath); } catch (cleanupError) { if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError; }
                throw error;
            }
            const result = operation();
            acquired = false;
            let cleanupDegraded = false;
            try { fs.closeSync(lockFd); } catch (error) { cleanupDegraded = true; console.warn('[canonical-state-store] lock close failed after commit:', error.message); }
            try { fs.unlinkSync(lockPath); } catch (error) { if (error.code !== 'ENOENT') { cleanupDegraded = true; console.warn('[canonical-state-store] lock cleanup failed after commit:', error.message); } }
            if (cleanupDegraded && result && result.ok) result.degraded = true;
            return result;
        } finally {
            if (acquired) {
                try { fs.closeSync(lockFd); } catch {}
                try { fs.unlinkSync(lockPath); } catch {}
            }
        }
    }
    return Object.freeze({
        mode: CANONICAL_STATE_STORE_MODES.FILE,
        filePath: resolvedPath,
        save(record, options = {}) {
            const validation = validateCanonicalStateRecord(record);
            if (!validation.ok) return validation;
            return withWriteLock(() => {
                const records = readRecordsForWrite();
                const current = records.get(record.roomId);
                const currentRevision = Number.isInteger(current?.revision) ? current.revision : 0;
                if (Number.isInteger(options.expectedRevision) && options.expectedRevision !== currentRevision) return { ok: false, reason: 'revision-conflict', revision: currentRevision };
                const saved = cloneJson(record);
                saved.revision = currentRevision + 1;
                records.set(record.roomId, saved);
                const writeResult = writeRecords(records);
                const result = Number.isInteger(options.expectedRevision) ? { ok: true, revision: saved.revision } : { ok: true };
                if (writeResult.degraded) result.degraded = true;
                return result;
            });
        },
        verifyDurability(options = {}) {
            try {
                try {
                    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
                    if (lock && lock.pid === process.pid && lock.processIdentity === processIdentity(process.pid)) fs.unlinkSync(lockPath);
                } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
                const result = withWriteLock(() => {
                    const records = readRecordsForWrite();
                    if (options.roomId) {
                        const record = records.get(String(options.roomId));
                        if (!record) return { ok: false, reason: 'not-found' };
                        if (Number.isInteger(options.expectedRevision) && record.revision !== options.expectedRevision) {
                            return { ok: false, reason: 'revision-conflict', revision: record.revision };
                        }
                        if (options.ownerId && record.ownerId !== options.ownerId) {
                            return { ok: false, reason: 'owner-conflict', ownerId: record.ownerId };
                        }
                    }
                    fsyncFile(journalPath);
                    fsyncDirectory();
                    return { ok: true };
                });
                return result;
            } catch (error) { return { ok: false, reason: 'fsync-failed' }; }
        },
        renewLease(roomId, options = {}) { return withWriteLock(() => {
            const records = readRecordsForWrite();
            const key = String(roomId || '');
            const current = records.get(key);
            if (!current) return { ok: false, reason: 'not-found' };
            if (Number.isInteger(options.expectedRevision) && options.expectedRevision !== current.revision) return { ok: false, reason: 'revision-conflict', revision: current.revision };
            current.ownerId = options.ownerId || current.ownerId;
            current.leaseExpiresAt = options.leaseExpiresAt;
            current.persistedAt = options.now;
            current.revision++;
            const writeResult = writeRecords(records);
            const result = { ok: true, revision: current.revision };
            if (writeResult.degraded) result.degraded = true;
            return result;
        }); },
        load(roomId) { const record = readRecordsReadOnly().get(String(roomId || '')); return record ? cloneJson(record) : null; },
        delete(roomId, options = {}) { return withWriteLock(() => {
            const records = readRecordsForWrite();
            const key = String(roomId || '');
            const current = records.get(key);
            const currentRevision = Number.isInteger(current?.revision) ? current.revision : 0;
            if (Number.isInteger(options.expectedRevision) && options.expectedRevision !== currentRevision) return { ok: false, reason: 'revision-conflict' };
            if (Number.isInteger(options.leaseExpiredAt) && Number.isInteger(current?.leaseExpiresAt) && current.leaseExpiresAt > options.leaseExpiredAt) return { ok: false, reason: 'lease-active' };
            records.delete(key);
            const writeResult = writeRecords(records);
            return writeResult.degraded ? { ok: true, degraded: true } : { ok: true };
        }); },
        list() { return Array.from(readRecordsReadOnly().values()).map(cloneJson); },
    });
}

function createCanonicalStateStoreFromEnv(env = process.env) {
    const mode = canonicalStateStoreMode(env);
    if (mode === CANONICAL_STATE_STORE_MODES.NOOP) return createNoopCanonicalStateStore();
    if (mode === CANONICAL_STATE_STORE_MODES.MEMORY) return createMemoryCanonicalStateStore();
    return createFileCanonicalStateStore(env.CANONICAL_STATE_STORE_FILE);
}

module.exports = {
    CANONICAL_STATE_STORE_SCHEMA_VERSION,
    MAX_CANONICAL_ACTION_STREAMS,
    CANONICAL_STATE_STORE_MODES,
    canonicalStateStoreMode,
    buildCanonicalStateRecord,
    validateCanonicalStateRecord,
    createNoopCanonicalStateStore,
    createMemoryCanonicalStateStore,
    createFileCanonicalStateStore,
    createCanonicalStateStoreFromEnv,
};
