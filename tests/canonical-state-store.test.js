const assert = require('assert');
const {
    CANONICAL_STATE_STORE_MODES,
    canonicalStateStoreRetentionMs,
    canonicalStateStoreCapabilities,
    validateCanonicalStateStoreAdapter,
    isAuthoritativeCanonicalStateStore,
    buildCanonicalStateRecord,
    createNoopCanonicalStateStore,
    createMemoryCanonicalStateStore,
    createCanonicalStateStoreFromEnv,
} = require('../server/canonicalStateStore');
const { runTest } = require('./helpers/test-utils');

function record(roomId = 'ROOM01', now = 1_000) {
    return buildCanonicalStateRecord(roomId, {
        gameStartPayload: { playerNames: ['A', 'B'] },
        stateSnapshot: { actionSeq: 2 },
        actionLog: [],
        acceptedClientActions: {},
        hostPlayerIndex: 0,
        hostEpoch: 1,
        actionSeq: 2,
        lastTouchedAt: now,
    }, { now, reason: 'test' });
}

runTest('canonical store retention env は明示した正のsafe integerだけを受理する', () => {
    assert.strictEqual(canonicalStateStoreRetentionMs({}), null);
    assert.strictEqual(canonicalStateStoreRetentionMs({ CANONICAL_STATE_RETENTION_MS: '60000' }), 60_000);
    for (const value of ['', '0', '-1', '1.5', 'unsafe']) {
        assert.strictEqual(canonicalStateStoreRetentionMs({ CANONICAL_STATE_RETENTION_MS: value }), null);
    }
});

runTest('canonical store adapter契約はauthoritativeに必要な4 capabilityを固定する', () => {
    const noop = createNoopCanonicalStateStore();
    assert.deepStrictEqual(validateCanonicalStateStoreAdapter(noop), { ok: true });
    const authority = validateCanonicalStateStoreAdapter(noop, { requireAuthoritative: true });
    assert.strictEqual(authority.ok, false);
    assert.strictEqual(authority.reason, 'not-authoritative');
    assert.deepStrictEqual(authority.missing, [
        'durable',
        'atomicCompareAndSwap',
        'processSafeLocking',
        'retention',
    ]);
    assert.strictEqual(isAuthoritativeCanonicalStateStore(noop), false);

    const provider = {
        capabilities: canonicalStateStoreCapabilities({
            durable: true,
            atomicCompareAndSwap: true,
            processSafeLocking: true,
            retention: true,
        }),
        save() {},
        load() {},
        delete() {},
        list() {},
        prune() {},
        runExclusive() {},
    };
    assert.strictEqual(isAuthoritativeCanonicalStateStore(provider), true);
    delete provider.prune;
    assert.deepStrictEqual(validateCanonicalStateStoreAdapter(provider), {
        ok: false,
        reason: 'missing-prune',
    });
});

runTest('memory canonical store はcloneとcompare-and-swap revisionを提供する', () => {
    const store = createMemoryCanonicalStateStore();
    const first = record();
    assert.deepStrictEqual(store.save(first, { expectedRevision: 0 }), { ok: true });
    first.stateSnapshot.actionSeq = 99;
    assert.strictEqual(store.load('ROOM01').stateSnapshot.actionSeq, 2);
    assert.strictEqual(store.load('ROOM01').storeRevision, 1);
    assert.deepStrictEqual(store.save(record('ROOM01', 2_000), { expectedRevision: 0 }), {
        ok: false,
        reason: 'revision-conflict',
        currentRevision: 1,
    });
    assert.deepStrictEqual(store.save(record('ROOM01', 2_000), { expectedRevision: 1 }), { ok: true });
    assert.strictEqual(store.load('ROOM01').storeRevision, 2);
    assert.strictEqual(isAuthoritativeCanonicalStateStore(store), false);
});

runTest('memory canonical store は明示retentionで期限切れrecordだけをpruneする', () => {
    let now = 1_000;
    const store = createMemoryCanonicalStateStore([], { retentionMs: 500, now: () => now });
    store.save(record('ROOM01', 1_000));
    store.save(record('ROOM02', 1_200));
    now = 1_600;
    assert.strictEqual(store.load('ROOM01'), null);
    assert.strictEqual(store.load('ROOM02').roomId, 'ROOM02');
    assert.deepStrictEqual(store.prune(1_800), { ok: true, deleted: 1 });
    assert.deepStrictEqual(store.list(), []);
});

runTest('memory canonical store lock は同一roomの再入をfail closedにし別roomを許可する', () => {
    const store = createMemoryCanonicalStateStore();
    const result = store.runExclusive('ROOM01', () => ({
        same: store.runExclusive('ROOM01', () => 'unexpected'),
        other: store.runExclusive('ROOM02', () => 'ok'),
    }));
    assert.deepStrictEqual(result, {
        same: { ok: false, reason: 'lock-conflict' },
        other: 'ok',
    });
    assert.strictEqual(store.runExclusive('ROOM01', () => 'released'), 'released');
});

runTest('env factory は既定noopを維持しmemory retentionもauthority扱いしない', () => {
    assert.strictEqual(createCanonicalStateStoreFromEnv({}).mode, CANONICAL_STATE_STORE_MODES.NOOP);
    const memory = createCanonicalStateStoreFromEnv({
        CANONICAL_STATE_STORE: 'memory',
        CANONICAL_STATE_RETENTION_MS: '60000',
    });
    assert.strictEqual(memory.mode, CANONICAL_STATE_STORE_MODES.MEMORY);
    assert.strictEqual(memory.capabilities.retention, true);
    assert.strictEqual(isAuthoritativeCanonicalStateStore(memory), false);
});
