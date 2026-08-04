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


function createShellHarness() {
    const calls = [];
    const listeners = {};
    const consoleTarget = { error: (...args) => calls.push(['console', ...args]) };
    const bindingController = ClientEventRuntime.createBindingController();
    const windowTarget = {
        addEventListener(event, handler) { calls.push(['add', event]); listeners[event] = handler; },
    };
    const runtime = ClientEventRuntime.createShellBindings({
        bindingController,
        checkFreezeWatchdog: () => calls.push(['watchdog']),
        consoleErrorInput: args => ({ kind: 'console', args }),
        freezeWatchdogIntervalMs: 1000,
        getConsole: () => consoleTarget,
        pwaInstallController: { bindInstallHandlers: () => { calls.push(['pwa']); return 'pwa-result'; } },
        reportClientError: input => calls.push(['report', input]),
        resizeHandler: () => calls.push(['resize']),
        setIntervalFn: (handler, delay) => calls.push(['interval', handler, delay]),
        showCrashScreen: error => calls.push(['crash', error]),
        unhandledRejectionInput: event => ({ kind: 'rejection', event }),
        updateOnlineStatus: () => calls.push(['online-status']),
        windowErrorInput: event => ({ kind: 'error', event }),
        windowTarget,
    });
    return { bindingController, calls, consoleTarget, listeners, runtime };
}

runTest('client shell bindingsはcrashとconsole reportingを一度だけ登録する', () => {
    const harness = createShellHarness();
    assert.strictEqual(harness.runtime.bindCrashReporting(), true);
    assert.strictEqual(harness.runtime.bindCrashReporting(), false);
    const error = new Error('boom');
    harness.listeners.error({ error });
    harness.consoleTarget.error('console-boom');
    assert.deepStrictEqual(harness.calls.slice(0, 4), [
        ['add', 'error'], ['add', 'unhandledrejection'],
        ['report', { kind: 'error', event: { error } }], ['crash', error],
    ]);
    assert.deepStrictEqual(harness.calls.slice(-2), [
        ['console', 'console-boom'],
        ['report', { kind: 'console', args: ['console-boom'] }],
    ]);
});

runTest('client shell bindingsはonline・resize・watchdog・PWAの既存binding契約を所有する', () => {
    const harness = createShellHarness();
    assert.strictEqual(harness.runtime.bindOnlineStatus(), true);
    assert.strictEqual(harness.runtime.bindOnlineStatus(), false);
    assert.strictEqual(harness.runtime.bindMainViewResize(), true);
    assert.strictEqual(harness.runtime.bindMainViewResize(), false);
    assert.strictEqual(harness.runtime.startFreezeWatchdog(), true);
    assert.strictEqual(harness.runtime.startFreezeWatchdog(), false);
    assert.strictEqual(harness.runtime.bindPwaInstallHandlers(), 'pwa-result');
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'add', 'add', 'online-status', 'online-status', 'add', 'interval', 'pwa',
    ]);
    assert.strictEqual(harness.calls[5][2], 1000);
});

runTest('client shell bindingsは不完全な必須配線を初期化時に拒否する', () => {
    assert.throws(() => ClientEventRuntime.createShellBindings({
        windowTarget: { addEventListener() {} },
    }), /bindingController is required/);
});
