'use strict';

const assert = require('assert');
const GameSnapshot = require('../js/gameSnapshot');
const LocalSaveRepository = require('../js/localSaveRepository');
const { runTest } = require('./helpers/test-utils');

function makeStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        get(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
        set(key, value) { values.set(key, String(value)); return true; },
        remove(key) { values.delete(key); },
        value(key) { return values.get(key) || null; },
    };
}

runTest('local save repositoryは既定OFFでlegacy keyだけを書き込む', () => {
    const storage = makeStorage();
    const repository = LocalSaveRepository.create({ storage });
    const state = { players: [{ name: 'Alice' }] };

    assert.deepStrictEqual(repository.save(state), {
        legacyWritten: true,
        versionedWritten: false,
    });
    assert.deepStrictEqual(JSON.parse(storage.value(LocalSaveRepository.keys.legacy)), state);
    assert.strictEqual(storage.value(LocalSaveRepository.keys.versioned), null);
});

runTest('local save repositoryは有効時もlegacyを維持してv1 shadowを併記する', () => {
    const storage = makeStorage();
    const repository = LocalSaveRepository.create({ storage, versionedEnabled: true });
    const state = { players: [{ name: 'Alice' }] };

    assert.deepStrictEqual(repository.save(state), {
        legacyWritten: true,
        versionedWritten: true,
    });
    assert.deepStrictEqual(JSON.parse(storage.value(LocalSaveRepository.keys.legacy)), state);
    assert.deepStrictEqual(JSON.parse(storage.value(LocalSaveRepository.keys.versioned)),
        GameSnapshot.createSnapshotEnvelope(state));
});

runTest('local save repositoryは有効時に検証済みv1を優先する', () => {
    const legacy = { players: [{ name: 'Legacy' }] };
    const versioned = { players: [{ name: 'Versioned' }] };
    const storage = makeStorage({
        savedGame: JSON.stringify(legacy),
        savedGameV1: JSON.stringify(GameSnapshot.createSnapshotEnvelope(versioned)),
    });
    const repository = LocalSaveRepository.create({ storage, versionedEnabled: true });

    const read = repository.read(state => Array.isArray(state.players));
    assert.strictEqual(read.ok, true);
    assert.strictEqual(read.sourceKey, LocalSaveRepository.keys.versioned);
    assert.strictEqual(read.schemaVersion, GameSnapshot.schemaVersion);
    assert.deepStrictEqual(read.state, versioned);
    assert.ok(Object.isFrozen(read));
});

runTest('local save repositoryは壊れたv1からlegacyへfallbackする', () => {
    const legacy = { players: [{ name: 'Legacy' }] };
    const storage = makeStorage({
        savedGame: JSON.stringify(legacy),
        savedGameV1: JSON.stringify({ schemaVersion: 99, snapshot: {} }),
    });
    const repository = LocalSaveRepository.create({ storage, versionedEnabled: true });

    const read = repository.read(state => Array.isArray(state.players));
    assert.strictEqual(read.ok, true);
    assert.strictEqual(read.sourceKey, LocalSaveRepository.keys.legacy);
    assert.strictEqual(read.legacy, true);
    assert.deepStrictEqual(read.state, legacy);
});

runTest('local save repositoryはlegacy削除後にv1 shadowだけを復活させない', () => {
    const storage = makeStorage({
        savedGameV1: JSON.stringify(GameSnapshot.createSnapshotEnvelope({ players: [] })),
    });
    const repository = LocalSaveRepository.create({ storage, versionedEnabled: true });

    assert.strictEqual(repository.exists(), false);
    assert.strictEqual(repository.read(() => true).ok, false);
});

runTest('local save repositoryはv1更新失敗時に古いshadowを消してlegacyへ戻す', () => {
    const storage = makeStorage({ savedGameV1: '{"old":true}' });
    const write = storage.set;
    storage.set = (key, value) => key === LocalSaveRepository.keys.versioned
        ? false
        : write(key, value);
    const repository = LocalSaveRepository.create({ storage, versionedEnabled: true });
    const state = { players: [{ name: 'Latest' }] };

    assert.deepStrictEqual(repository.save(state), {
        legacyWritten: true,
        versionedWritten: false,
    });
    assert.strictEqual(storage.value(LocalSaveRepository.keys.versioned), null);
    assert.deepStrictEqual(repository.read(() => true).state, state);
});

runTest('local save repositoryはflag OFFならv1 shadowをauthorityにしない', () => {
    const storage = makeStorage({
        savedGameV1: JSON.stringify(GameSnapshot.createSnapshotEnvelope({ players: [] })),
    });
    const repository = LocalSaveRepository.create({ storage, versionedEnabled: false });

    assert.strictEqual(repository.exists(), false);
    assert.strictEqual(repository.read(() => true).ok, false);
});

runTest('local save repositoryは直前2世代を保持して世代指定で読み出す', () => {
    const storage = makeStorage();
    const repository = LocalSaveRepository.create({ storage });
    repository.save({ players: [{ name: 'first' }] });
    repository.save({ players: [{ name: 'second' }] });
    repository.save({ players: [{ name: 'third' }] });
    repository.save({ players: [{ name: 'latest' }] });

    assert.deepStrictEqual(repository.readHistory().map(entry => entry.state.players[0].name), [
        'third', 'second',
    ]);
    assert.strictEqual(repository.read(() => true, 0).state.players[0].name, 'latest');
    assert.strictEqual(repository.read(() => true, 1).state.players[0].name, 'third');
    assert.strictEqual(repository.read(() => true, 2).state.players[0].name, 'second');
    assert.strictEqual(repository.read(() => true, 3).ok, false);
});

runTest('local save repositoryは同じ状態の再保存で復元世代を消費しない', () => {
    const storage = makeStorage();
    const repository = LocalSaveRepository.create({ storage });
    for (const turn of [1, 2, 3, 3, 3]) repository.save({ turn });

    assert.strictEqual(repository.read(() => true).state.turn, 3);
    assert.deepStrictEqual(repository.readHistory().map(entry => entry.state.turn), [2, 1]);
});

runTest('local save repositoryは最新保存の書き込み失敗で復元世代を消費しない', () => {
    const storage = makeStorage();
    const repository = LocalSaveRepository.create({ storage, versionedEnabled: true });
    for (const turn of [1, 2, 3]) repository.save({ turn });
    const before = Object.fromEntries(Object.values(LocalSaveRepository.keys).map(key =>
        [key, storage.value(key)]));
    const write = storage.set;
    storage.set = (key, value) => key === LocalSaveRepository.keys.legacy
        ? false
        : write(key, value);

    assert.strictEqual(repository.save({ turn: 4 }).legacyWritten, false);
    for (const [key, value] of Object.entries(before)) assert.strictEqual(storage.value(key), value);
    assert.strictEqual(repository.read(() => true).state.turn, 3);
    assert.deepStrictEqual(repository.readHistory().map(entry => entry.state.turn), [2, 1]);
});

runTest('local save repositoryは同じ状態でもshadowのflag切替と再作成を適用する', () => {
    const storage = makeStorage();
    const enabled = LocalSaveRepository.create({ storage, versionedEnabled: true });
    enabled.save({ turn: 1 });
    enabled.save({ turn: 2 });
    LocalSaveRepository.create({ storage }).save({ turn: 2 });
    assert.strictEqual(storage.value(LocalSaveRepository.keys.versioned), null);
    assert.strictEqual(enabled.save({ turn: 2 }).versionedWritten, true);
    assert.strictEqual(enabled.read(() => true).state.turn, 2);
    assert.deepStrictEqual(enabled.readHistory().map(entry => entry.state.turn), [1]);
});

runTest('local save repositoryは不正な旧世代を検証してfail closedにする', () => {
    const storage = makeStorage({
        savedGame: JSON.stringify({ players: [{ name: 'latest' }] }),
        savedGameHistoryV1: JSON.stringify([{ state: { invalid: true } }]),
    });
    const repository = LocalSaveRepository.create({ storage });
    assert.strictEqual(repository.read(state => Array.isArray(state.players), 1).ok, false);
});

runTest('local save repositoryは旧世代だけが残っても復元でき孤立shadowは使わない', () => {
    const storage = makeStorage({
        savedGameV1: JSON.stringify(GameSnapshot.createSnapshotEnvelope({ turn: 99 })),
        savedGameHistoryV1: JSON.stringify([{ state: { turn: 7 } }]),
    });
    const repository = LocalSaveRepository.create({ storage, versionedEnabled: true });
    assert.strictEqual(repository.exists(), true);
    assert.strictEqual(repository.read(() => true).ok, false);
    assert.strictEqual(repository.read(() => true, 1).state.turn, 7);
});

runTest('local save repositoryの削除はlegacy・v1 shadow・旧世代を同時に消す', () => {
    const storage = makeStorage({ savedGame: '{}', savedGameV1: '{}', savedGameHistoryV1: '[]' });
    const repository = LocalSaveRepository.create({ storage, versionedEnabled: true });

    repository.remove();

    assert.strictEqual(storage.value(LocalSaveRepository.keys.legacy), null);
    assert.strictEqual(storage.value(LocalSaveRepository.keys.versioned), null);
    assert.strictEqual(storage.value(LocalSaveRepository.keys.history), null);
});

runTest('local save repositoryはON→OFF→ONでも最新の保存から復帰する', () => {
    const storage = makeStorage();
    const enabled = LocalSaveRepository.create({ storage, versionedEnabled: true });
    enabled.save({ turn: 1 });
    LocalSaveRepository.create({ storage }).save({ turn: 2 });
    assert.strictEqual(storage.value(LocalSaveRepository.keys.versioned), null);
    assert.strictEqual(enabled.read(() => true).state.turn, 2);
});

runTest('local save repositoryはlegacy書き込み拒否で既存shadowを削除しない', () => {
    const storage = makeStorage();
    const enabled = LocalSaveRepository.create({ storage, versionedEnabled: true });
    enabled.save({ turn: 1 });
    storage.set = () => false;
    for (const versionedEnabled of [false, true]) {
        const repository = LocalSaveRepository.create({ storage, versionedEnabled });
        assert.strictEqual(repository.save({ turn: 2 }).legacyWritten, false);
        assert.strictEqual(enabled.read(() => true).state.turn, 1);
        assert.notStrictEqual(storage.value(LocalSaveRepository.keys.versioned), null);
    }
});
