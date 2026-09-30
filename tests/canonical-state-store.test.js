const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    CANONICAL_STATE_STORE_MODES,
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

runTest('canonical state record はepochとaction seqをnonnegative safe integerへ限定する', () => {
    const maximum = record();
    maximum.hostEpoch = Number.MAX_SAFE_INTEGER;
    maximum.actionSeq = Number.MAX_SAFE_INTEGER;
    assert.deepStrictEqual(validateCanonicalStateRecord(maximum), { ok: true });

    for (const [field, value, reason] of [
        ['hostEpoch', -1, 'host-epoch'],
        ['hostEpoch', Number.MAX_SAFE_INTEGER + 1, 'host-epoch'],
        ['hostEpoch', Number.MAX_VALUE, 'host-epoch'],
        ['actionSeq', -1, 'action-seq'],
        ['actionSeq', Number.MAX_SAFE_INTEGER + 1, 'action-seq'],
        ['actionSeq', Number.MAX_VALUE, 'action-seq'],
    ]) {
        const invalid = record();
        invalid[field] = value;
        assert.deepStrictEqual(validateCanonicalStateRecord(invalid), { ok: false, reason });
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

runTest('file canonical store はdurabilityと単一instanceの明示後だけ永続authorityを提供する', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'machikoro-canonical-'));
    try {
        assert.throws(() => createFileCanonicalStateStore(directory, {
            retentionMs: 60_000,
        }), /attestations/);
        assert.throws(() => createCanonicalStateStoreFromEnv({
            CANONICAL_STATE_STORE: 'file',
            CANONICAL_STATE_STORE_DIR: directory,
            CANONICAL_STATE_STORE_DURABLE: 'true',
            CANONICAL_STATE_STORE_SINGLE_INSTANCE: 'true',
        }), /RETENTION_MS/);

        const env = {
            CANONICAL_STATE_STORE: 'file',
            CANONICAL_STATE_STORE_DIR: directory,
            CANONICAL_STATE_STORE_DURABLE: 'true',
            CANONICAL_STATE_STORE_SINGLE_INSTANCE: 'true',
            CANONICAL_STATE_RETENTION_MS: '60000',
        };
        const store = createCanonicalStateStoreFromEnv(env);
        const currentRecord = record('ROOM01', Date.now());
        assert.strictEqual(store.mode, CANONICAL_STATE_STORE_MODES.FILE);
        assert.strictEqual(isAuthoritativeCanonicalStateStore(store), true);
        assert.deepStrictEqual(store.save(currentRecord, { expectedRevision: 0 }), { ok: true });
        assert.strictEqual(store.load('ROOM01').storeRevision, 1);
        assert.deepStrictEqual(store.save(currentRecord, { expectedRevision: 0 }), {
            ok: false,
            reason: 'revision-conflict',
            currentRevision: 1,
        });

        const afterRestart = createCanonicalStateStoreFromEnv(env);
        const currentState = store.load('ROOM01');
        assert.deepStrictEqual(afterRestart.load('ROOM01'), currentState);
        const restartSource = [
            "const {createCanonicalStateStoreFromEnv}=require('./server/canonicalStateStore');",
            "const store=createCanonicalStateStoreFromEnv({CANONICAL_STATE_STORE:'file',CANONICAL_STATE_STORE_DIR:process.argv[1],CANONICAL_STATE_STORE_DURABLE:'true',CANONICAL_STATE_STORE_SINGLE_INSTANCE:'true',CANONICAL_STATE_RETENTION_MS:'60000'});",
            "console.log(JSON.stringify(store.load('ROOM01')));",
        ].join('\n');
        const restartedProcess = spawnSync(
            process.execPath,
            ['-e', restartSource, directory],
            { cwd: path.join(__dirname, '..'), encoding: 'utf8' }
        );
        assert.strictEqual(restartedProcess.status, 0, restartedProcess.stderr);
        assert.deepStrictEqual(JSON.parse(restartedProcess.stdout), currentState);
        const nested = afterRestart.runExclusive('ROOM01', () =>
            afterRestart.save(record('ROOM01', Date.now()), { expectedRevision: 1 })
        );
        assert.deepStrictEqual(nested, { ok: true });
        assert.strictEqual(afterRestart.load('ROOM01').storeRevision, 2);
        assert.deepStrictEqual(afterRestart.list().map(value => value.roomId), ['ROOM01']);
        assert.deepStrictEqual(afterRestart.delete('ROOM01'), { ok: true });
        assert.strictEqual(afterRestart.load('ROOM01'), null);

        const lockedStore = createFileCanonicalStateStore(directory, {
            retentionMs: 60_000,
            lockTimeoutMs: 100,
            durableAttested: true,
            singleInstanceAttested: true,
        });
        const childSource = [
            "const {createFileCanonicalStateStore}=require('./server/canonicalStateStore');",
            'const store=createFileCanonicalStateStore(process.argv[1],{retentionMs:60000,lockTimeoutMs:100,durableAttested:true,singleInstanceAttested:true});',
            "try { store.runExclusive('ROOM01',()=>{}); } catch (error) { console.log(error.code); }",
        ].join('\n');
        const contention = lockedStore.runExclusive('ROOM01', () => spawnSync(
            process.execPath,
            ['-e', childSource, directory],
            { cwd: path.join(__dirname, '..'), encoding: 'utf8' }
        ));
        assert.strictEqual(contention.status, 0, contention.stderr);
        assert.strictEqual(contention.stdout.trim(), 'CANONICAL_STATE_LOCK_TIMEOUT');

        let now = 1_000;
        const retentionStore = createFileCanonicalStateStore(directory, {
            retentionMs: 100,
            now: () => now,
            durableAttested: true,
            singleInstanceAttested: true,
        });
        assert.deepStrictEqual(retentionStore.save(record('ROOM02', now)), { ok: true });
        now = 1_100;
        assert.deepStrictEqual(retentionStore.prune(), { ok: true, deleted: 1 });
        assert.strictEqual(retentionStore.load('ROOM02'), null);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
