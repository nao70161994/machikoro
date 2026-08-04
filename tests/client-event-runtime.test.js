'use strict';

const assert = require('assert');
const ClientEventRuntime = require('../js/clientEventRuntime');
const { runTest } = require('./helpers/test-utils');

runTest('client event runtimeはcrash handlerを既存property/listener順で登録する', () => {
    const calls = [];
    const target = {
        _onerror: null,
        _onrejection: null,
        set onerror(value) { calls.push(['set', 'onerror']); this._onerror = value; },
        get onerror() { return this._onerror; },
        set onunhandledrejection(value) { calls.push(['set', 'onunhandledrejection']); this._onrejection = value; },
        get onunhandledrejection() { return this._onrejection; },
        addEventListener(event, handler) { calls.push(['add', event, handler]); },
    };
    const errors = [];
    const handleError = value => errors.push(['error', value]);
    const handleRejection = value => errors.push(['rejection', value]);
    const handlers = ClientEventRuntime.bindCrashHandlers({
        windowTarget: target,
        handleWindowErrorEvent: handleError,
        handleWindowUnhandledRejection: handleRejection,
    });
    assert.deepStrictEqual(calls, [
        ['set', 'onerror'],
        ['set', 'onunhandledrejection'],
        ['add', 'error', handleError],
        ['add', 'unhandledrejection', handleRejection],
    ]);
    const error = new Error('boom');
    assert.strictEqual(target.onerror('message', 'file.js', 3, 4, error), false);
    assert.deepStrictEqual(errors, [[
        'error',
        { message: 'message', filename: 'file.js', lineno: 3, colno: 4, error },
    ]]);
    assert.strictEqual(target.onunhandledrejection, handleRejection);
    assert.ok(Object.isFrozen(handlers));
});

runTest('client event runtimeはonline/offline購読後に一度だけ初期更新する', () => {
    const calls = [];
    const update = () => calls.push(['update']);
    const result = ClientEventRuntime.bindOnlineStatusHandlers({
        windowTarget: {
            addEventListener(event, handler) { calls.push(['add', event, handler]); },
        },
        updateOnlineStatus: update,
    });
    assert.strictEqual(result, update);
    assert.deepStrictEqual(calls, [
        ['add', 'online', update],
        ['add', 'offline', update],
        ['update'],
    ]);
});

runTest('client event runtimeは不完全な配線を副作用前に拒否する', () => {
    const calls = [];
    const target = { addEventListener() { calls.push('add'); } };
    assert.throws(() => ClientEventRuntime.bindCrashHandlers({
        windowTarget: target,
        handleWindowErrorEvent() {},
    }), /handleWindowUnhandledRejection is required/);
    assert.throws(() => ClientEventRuntime.bindOnlineStatusHandlers({
        windowTarget: target,
    }), /updateOnlineStatus is required/);
    assert.throws(() => ClientEventRuntime.bindCrashHandlers({ windowTarget: null }), /windowTarget/);
    assert.deepStrictEqual(calls, []);
    assert.ok(Object.isFrozen(ClientEventRuntime));
});

runTest('client event binding controllerは名前付きbind状態を一箇所で所有する', () => {
    const keys = ClientEventRuntime.bindingKeys;
    const controller = ClientEventRuntime.createBindingController([keys.CONSOLE_ERROR]);
    assert.strictEqual(controller.isBound(keys.CONSOLE_ERROR), true);
    assert.strictEqual(controller.isBound(keys.ONLINE_STATUS), false);
    assert.strictEqual(controller.markBound(keys.ONLINE_STATUS), true);
    assert.strictEqual(controller.markBound(keys.ONLINE_STATUS), false);
    assert.deepStrictEqual(controller.snapshot(), {
        boundKeys: [keys.CONSOLE_ERROR, keys.ONLINE_STATUS],
    });
    assert.ok(Object.isFrozen(controller.snapshot()));
    assert.ok(Object.isFrozen(controller.snapshot().boundKeys));
    assert.ok(Object.isFrozen(keys));
});
