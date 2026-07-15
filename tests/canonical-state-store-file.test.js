const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    CANONICAL_STATE_STORE_MODES,
    canonicalStateStoreMode,
    createCanonicalStateStoreFromEnv,
    createFileCanonicalStateStore,
} = require('../server/canonicalStateStore');

function record(roomId) {
    return {
        schemaVersion: 1,
        roomId,
        persistedAt: 1,
        reason: 'test',
        gameStartPayload: null,
        stateSnapshot: null,
        actionLog: [],
        acceptedClientActions: [],
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
        lastTouchedAt: 1,
        ownerId: 'test-owner',
        leaseExpiresAt: 1000,
        revision: 0,
        acceptedClientActionWatermarks: {},
    };
}

function withTempStore(run) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-state-'));
    try { run(path.join(directory, 'state.json')); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

assert.strictEqual(canonicalStateStoreMode({}), CANONICAL_STATE_STORE_MODES.NOOP);
assert.strictEqual(canonicalStateStoreMode({ CANONICAL_STATE_STORE: 'unknown' }), CANONICAL_STATE_STORE_MODES.NOOP);
assert.strictEqual(createCanonicalStateStoreFromEnv({}).mode, CANONICAL_STATE_STORE_MODES.NOOP);
assert.strictEqual(createCanonicalStateStoreFromEnv({ CANONICAL_STATE_STORE: 'file', CANONICAL_STATE_STORE_FILE: '/tmp/unused-canonical-state' }).mode, CANONICAL_STATE_STORE_MODES.FILE);

withTempStore((filePath) => {
    const store = createFileCanonicalStateStore(filePath);
    assert.deepStrictEqual(store.save(record('ROOM01'), { expectedRevision: 0 }), { ok: true, revision: 1 });
    assert.strictEqual(store.load('ROOM01').revision, 1);
    assert.deepStrictEqual(store.save(record('ROOM01'), { expectedRevision: 0 }), { ok: false, reason: 'revision-conflict', revision: 1 });

    fs.writeFileSync(filePath, '{partial');
    assert.strictEqual(store.load('ROOM01').revision, 1, 'journal must recover a partial primary write');
});

withTempStore((filePath) => {
    fs.writeFileSync(filePath, JSON.stringify({ schemaVersion: 1, records: [], checksum: 'wrong' }));
    const store = createFileCanonicalStateStore(filePath);
    assert.throws(() => store.list(), (error) => error && error.code === 'CANONICAL_STATE_CORRUPT');
});

withTempStore((filePath) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(`${filePath}.lock`, JSON.stringify({ pid: 99999999, createdAt: Date.now() - 60000 }));
    const store = createFileCanonicalStateStore(filePath);
    assert.strictEqual(store.save(record('ROOM02')).ok, true, 'dead process lock must be removed once');
});

withTempStore((filePath) => {
    fs.writeFileSync(`${filePath}.${process.pid}.tmp`, '{partial');
    assert.deepStrictEqual(createFileCanonicalStateStore(filePath).list(), [], 'uncommitted temp file must be ignored');
});

console.log('canonical file store experimental tests passed');
