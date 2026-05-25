const CANONICAL_STATE_STORE_SCHEMA_VERSION = 1;
const CANONICAL_STATE_STORE_MODES = Object.freeze({
    NOOP: 'noop',
    MEMORY: 'memory',
});

function cloneJson(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function canonicalStateStoreMode(env = process.env) {
    const mode = String(env.CANONICAL_STATE_STORE || env.CANONICAL_STATE_STORE_MODE || '').trim().toLowerCase();
    return mode === CANONICAL_STATE_STORE_MODES.MEMORY ? CANONICAL_STATE_STORE_MODES.MEMORY : CANONICAL_STATE_STORE_MODES.NOOP;
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
    return { ok: true };
}

function createNoopCanonicalStateStore() {
    return Object.freeze({
        mode: CANONICAL_STATE_STORE_MODES.NOOP,
        save() { return { ok: true, skipped: true }; },
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
        save(record) {
            const validation = validateCanonicalStateRecord(record);
            if (!validation.ok) return validation;
            records.set(record.roomId, cloneJson(record));
            return { ok: true };
        },
        load(roomId) {
            const record = records.get(String(roomId || ''));
            return record ? cloneJson(record) : null;
        },
        delete(roomId) {
            records.delete(String(roomId || ''));
            return { ok: true };
        },
        list() {
            return Array.from(records.values()).map(cloneJson);
        },
    });
}

function createCanonicalStateStoreFromEnv(env = process.env) {
    return canonicalStateStoreMode(env) === CANONICAL_STATE_STORE_MODES.MEMORY
        ? createMemoryCanonicalStateStore()
        : createNoopCanonicalStateStore();
}

module.exports = {
    CANONICAL_STATE_STORE_SCHEMA_VERSION,
    CANONICAL_STATE_STORE_MODES,
    canonicalStateStoreMode,
    buildCanonicalStateRecord,
    validateCanonicalStateRecord,
    createNoopCanonicalStateStore,
    createMemoryCanonicalStateStore,
    createCanonicalStateStoreFromEnv,
};
