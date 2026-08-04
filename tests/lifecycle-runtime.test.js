'use strict';

const assert = require('assert');
const LifecycleNotify = require('../js/lifecycleNotify');
const LifecycleRuntime = require('../js/lifecycleRuntime');
const { runTest } = require('./helpers/test-utils');

function createStorageAccess(initial = {}) {
    const values = new Map(Object.entries(initial));
    const storage = {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
    };
    return { access: callback => callback(storage), values };
}

function createRuntime(options = {}) {
    const store = createStorageAccess(options.storage);
    const sends = [];
    const checkpoints = [];
    const players = [{ name: 'Alice' }, { name: 'CPU' }];
    const cpuPlayers = [null, { difficulty: 'strong' }];
    const runtime = LifecycleRuntime.create({
        policy: LifecycleNotify,
        storageAccess: store.access,
        gameSnapshot: () => ({
            game: { players, turnCount: 12 },
            cpuPlayers,
        }),
        onlineSnapshot: () => ({ isOnlineGame: true }),
        setupSnapshot: () => ({ selectedCount: 4 }),
        getAppVersion: () => 'build-1',
        getFetch: () => 'fetch-stub',
        now: () => 1000,
        random: () => 0.5,
        checkpoint: (...args) => checkpoints.push(args),
        sendTransport(input) {
            if (!input.enabled) {
                sends.push({ ...input, payload: null });
                return false;
            }
            const payload = input.buildPayload();
            sends.push({ ...input, payload });
            return payload;
        },
    });
    return { checkpoints, cpuPlayers, players, runtime, sends, store };
}

runTest('lifecycle runtimeはstart/finish payloadと一度だけ送信する契約を所有する', () => {
    const fixture = createRuntime();
    const start = fixture.runtime.notifyStart();
    assert.deepStrictEqual(start, {
        event: 'play-start',
        mode: 'online',
        playerCount: 2,
        cpuCount: 1,
        sessionId: 'rs-i',
        appVersion: 'build-1',
    });
    assert.strictEqual(fixture.runtime.notifyStart(), false);

    const finish = fixture.runtime.notifyFinish(fixture.players[1]);
    assert.strictEqual(finish.event, 'play-finish');
    assert.strictEqual(finish.turn, 12);
    assert.strictEqual(finish.winnerKind, 'cpu');
    assert.strictEqual(finish.winnerCpuDifficulty, 'strong');
    assert.strictEqual(fixture.runtime.notifyFinish(fixture.players[1]), false);
    assert.deepStrictEqual(fixture.sends.map(entry => entry.event), ['play-start', 'play-finish']);
    assert.ok(fixture.store.values.has(LifecycleNotify.storageKeys.startSent));
});

runTest('lifecycle runtimeは通知設定とresetを既存storage keyで扱う', () => {
    const fixture = createRuntime();
    assert.strictEqual(fixture.runtime.notificationState().defaultEnabled, true);
    assert.strictEqual(fixture.runtime.setNotificationEnabled(false), false);
    assert.strictEqual(fixture.store.values.get(LifecycleNotify.storageKeys.notify), 'false');
    assert.strictEqual(fixture.runtime.notifyStart(), false);
    assert.strictEqual(fixture.sends.length, 1);
    assert.strictEqual(fixture.sends[0].enabled, false);

    fixture.runtime.reset('test-reset');
    assert.strictEqual(fixture.store.values.has(LifecycleNotify.storageKeys.startSent), false);
    assert.deepStrictEqual(fixture.checkpoints.at(-1), ['test-reset', { lifecycle: 'reset' }]);
});

runTest('lifecycle runtimeは必須依存の欠落を初期化時に拒否する', () => {
    assert.throws(() => LifecycleRuntime.create(), /lifecycle policy is required/);
    assert.throws(() => LifecycleRuntime.create({ policy: LifecycleNotify }), /storageAccess is required/);
});
