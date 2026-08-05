'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const OnlineRejoinRuntime = require('../js/onlineRejoinRuntime');
const { runTest } = require('./helpers/test-utils');

function decodedValue(overrides = {}) {
    return {
        acceptedClientActions: [],
        actionLog: [],
        gameStartPayload: {
            gameSchema: { actionVersion: 1, snapshotVersion: 1 },
            playerNames: ['Alice', 'CPU'],
            playerSettings: [{ type: 'human' }, { type: 'cpu' }],
        },
        hostEpoch: 1,
        hostPlayerIndex: 0,
        playerIndex: 0,
        provisionalRestore: false,
        restoreAudit: null,
        stateSnapshot: null,
        ...overrides,
    };
}

function preparedContext(overrides = {}) {
    return {
        playerNames: ['Alice', 'CPU'],
        playerSettings: [{ type: 'human' }, { type: 'cpu' }],
        ready: true,
        restoreGeneration: 7,
        ...overrides,
    };
}

function createHarness(options = {}) {
    const calls = [];
    const value = decodedValue(options.value);
    const prepared = options.prepared || preparedContext();
    const preparationRuntime = {
        prepare: input => {
            calls.push(['prepare', input]);
            return prepared;
        },
        persist: input => calls.push(['persist', input]),
    };
    const activationRuntime = {
        handle(input, effects) {
            calls.push(['activate', input]);
            effects.persistRejoinBundle();
            return options.activationResult !== false;
        },
    };
    const runtime = OnlineRejoinRuntime.createRuntime({
        abortRestore: (...args) => calls.push(['abortRestore', ...args]),
        acceptSchema: schema => {
            calls.push(['acceptSchema', schema]);
            return options.schemaAccepted !== false;
        },
        activationRuntime,
        console: { error: error => calls.push(['consoleError', error.message]) },
        decodePayload: payload => {
            calls.push(['decodePayload', payload]);
            return options.decodeFailed
                ? { ok: false, reason: 'bad-snapshot' }
                : { ok: true, value };
        },
        getRestoreGeneration: () => {
            calls.push(['getRestoreGeneration']);
            return options.generation === undefined ? 7 : options.generation;
        },
        preloadModels: (...args) => {
            calls.push(['preloadModels', ...args]);
            return options.preload || null;
        },
        preparationRuntime,
        setSchema: schema => calls.push(['setSchema', schema]),
        setStatusText: message => calls.push(['setStatusText', message]),
    });
    return { activationRuntime, calls, preparationRuntime, prepared, runtime, value };
}

runTest('online rejoin runtimeはdecode・schema・prepare・preload・activateを順序通り合成する', () => {
    const harness = createHarness();
    const payload = { wire: true };
    assert.strictEqual(harness.runtime.handle(payload), true);
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'decodePayload', 'acceptSchema', 'setSchema', 'prepare',
        'preloadModels', 'activate', 'persist',
    ]);
    assert.strictEqual(harness.calls[3][1], harness.value);
    assert.deepStrictEqual(harness.calls[4], [
        'preloadModels', 2, harness.prepared.playerSettings,
    ]);
    assert.strictEqual(harness.calls[6][1], harness.prepared);
});

runTest('online rejoin runtimeはSnapshot decode失敗をschema準備前に拒否する', () => {
    const harness = createHarness({ decodeFailed: true });
    assert.strictEqual(harness.runtime.handle({ wire: false }), false);
    assert.deepStrictEqual(harness.calls, [
        ['decodePayload', { wire: false }],
        ['setStatusText', OnlineRejoinRuntime.STATUS.SNAPSHOT_SCHEMA_UNSUPPORTED],
    ]);
});

runTest('online rejoin runtimeはgame schema拒否をprepare前に表示する', () => {
    const harness = createHarness({ schemaAccepted: false });
    assert.strictEqual(harness.runtime.handle({}), false);
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'decodePayload', 'acceptSchema', 'setStatusText',
    ]);
    assert.deepStrictEqual(harness.calls.at(-1), [
        'setStatusText', OnlineRejoinRuntime.STATUS.GAME_SCHEMA_UNSUPPORTED,
    ]);
});

runTest('online rejoin runtimeはlocal bundle offer後にpreloadとactivationを行わない', () => {
    const harness = createHarness({
        prepared: { ready: false, reason: 'local-bundle-offered' },
    });
    assert.strictEqual(harness.runtime.handle({}), false);
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'decodePayload', 'acceptSchema', 'setSchema', 'prepare',
    ]);
});

runTest('online rejoin runtimeはRL preload完了後に同じprepared contextを確定する', async () => {
    let resolvePreload;
    const preload = new Promise(resolve => { resolvePreload = resolve; });
    const harness = createHarness({ preload });
    assert.strictEqual(harness.runtime.handle({}), true);
    assert.deepStrictEqual(harness.calls.slice(-2), [
        ['preloadModels', 2, harness.prepared.playerSettings],
        ['setStatusText', OnlineRejoinRuntime.STATUS.MODEL_LOADING],
    ]);
    resolvePreload();
    await preload;
    await Promise.resolve();
    assert.deepStrictEqual(harness.calls.slice(-2), [
        ['activate', harness.prepared],
        ['persist', harness.prepared],
    ]);
});

runTest('online rejoin runtimeは同一世代のRL preload失敗だけをabortする', async () => {
    const preload = Promise.reject(new Error('model failed'));
    const harness = createHarness({ preload });
    harness.runtime.handle({});
    await preload.catch(() => {});
    await Promise.resolve();
    assert.deepStrictEqual(harness.calls.slice(-4), [
        ['setStatusText', OnlineRejoinRuntime.STATUS.MODEL_LOADING],
        ['getRestoreGeneration'],
        ['consoleError', 'model failed'],
        ['abortRestore', 7, OnlineRejoinRuntime.STATUS.MODEL_FAILED],
    ]);
});

runTest('online rejoin runtimeはstale世代のRL preload失敗を破棄する', async () => {
    const preload = Promise.reject(new Error('stale model failed'));
    const harness = createHarness({ generation: 8, preload });
    harness.runtime.handle({});
    await preload.catch(() => {});
    await Promise.resolve();
    assert.strictEqual(harness.calls.some(call => call[0] === 'consoleError'), false);
    assert.strictEqual(harness.calls.some(call => call[0] === 'abortRestore'), false);
    assert.strictEqual(harness.calls.at(-1)[0], 'getRestoreGeneration');
});

runTest('online.jsはrejoinData transactionを専用runtimeへ委譲する', () => {
    const online = fs.readFileSync(path.join(__dirname, '..', 'js/online.js'), 'utf8');
    const runtime = fs.readFileSync(path.join(__dirname, '..', 'js/onlineRejoinRuntime.js'), 'utf8');
    assert.ok(online.includes('OnlineRejoinRuntime.createRuntime'));
    assert.ok(online.includes('payload => onlineRejoinRuntime.handle(payload)'));
    assert.strictEqual(online.includes('const restoreOnlineGame ='), false);
    assert.strictEqual(online.includes("preload.then(restoreOnlineGame)"), false);
    assert.ok(runtime.includes('function activatePrepared(prepared)'));
});

runTest('online rejoin runtimeは必須adapter欠落を初期化前に拒否する', () => {
    assert.throws(() => OnlineRejoinRuntime.createRuntime(), /dependency is required/);
    const harness = createHarness();
    assert.ok(Object.isFrozen(harness.runtime));
    assert.ok(Object.isFrozen(OnlineRejoinRuntime.STATUS));
});
