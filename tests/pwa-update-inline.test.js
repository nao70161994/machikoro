const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeElement, runTest, waitForTests } = require('./helpers/test-utils');

function inlinePwaSource() {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const marker = "if ('serviceWorker' in navigator)";
    const markerAt = html.indexOf(marker);
    assert.ok(markerAt >= 0, 'PWA inline script marker is required');
    const scriptStart = html.lastIndexOf('<script>', markerAt);
    const scriptEnd = html.indexOf('</script>', markerAt);
    assert.ok(scriptStart >= 0 && scriptEnd > markerAt, 'PWA inline script is required');
    const source = html.slice(scriptStart + '<script>'.length, scriptEnd);
    return source.replace(/\n\s*}\s*$/, `
        window.__pwaUpdateTest = {
          handleWaiting: _handleWaitingSW,
          refresh: refreshPwaUpdateState,
          snapshot: () => ({
            controllerReloadPending: _controllerReloadPending,
            hasWaitingWorker: !!_waitingSW,
            hadServiceWorkerController,
            refreshingByServiceWorker,
            updateRequestedByUser,
          }),
        };
      }
    `);
}

function createRuntime(options = {}) {
    const serviceWorkerListeners = {};
    const windowListeners = {};
    const dismiss = makeElement();
    const elements = {
        gameScreen: makeElement({ style: { display: options.inGame === false ? 'none' : 'block' } }),
        pwaInstallBanner: makeElement({ style: { display: 'none' } }),
        pwaUpdateBanner: makeElement({
            style: { display: 'none' },
            querySelector(selector) {
                return selector === '[data-ui-action="hidePwaUpdateBanner"]' ? dismiss : null;
            },
        }),
        pwaUpdateBtn: makeElement({ dataset: {} }),
        pwaUpdateMsg: makeElement(),
        onlineStatus: makeElement(),
    };
    let reloadCount = 0;
    const serviceWorker = {
        controller: options.initialController === false ? null : { id: 'current-controller' },
        addEventListener(name, handler) { serviceWorkerListeners[name] = handler; },
        register() { return Promise.resolve({ waiting: null, addEventListener() {} }); },
        getRegistrations() { return Promise.resolve([]); },
    };
    const windowRef = {
        MACHIKORO_CLIENT_VERSION: 'test-version',
        addEventListener(name, handler) { windowListeners[name] = handler; },
    };
    const context = vm.createContext({
        Promise,
        URL,
        caches: { keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) },
        console: { log() {}, warn() {}, error() {} },
        document: {
            body: makeElement(),
            getElementById(id) { return elements[id] || null; },
        },
        fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
        isOnlineGame: options.online === true,
        isReconnectingOnline: false,
        location: {
            href: 'https://example.test/',
            origin: 'https://example.test',
            reload() { reloadCount++; },
        },
        navigator: { serviceWorker },
        window: windowRef,
    });
    windowRef.window = windowRef;
    windowRef.location = context.location;
    vm.runInContext(inlinePwaSource(), context, { filename: 'index-inline-pwa.js' });
    return {
        context,
        dismiss,
        elements,
        serviceWorkerListeners,
        testApi: windowRef.__pwaUpdateTest,
        applyUpdate: windowRef.pwaApplyUpdate,
        reloadCount: () => reloadCount,
    };
}

function createWorker() {
    const messages = [];
    return {
        messages,
        postMessage(message) { messages.push(message); },
    };
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

runTest('PWA inline更新は外部tabでactivate済みのworkerを再通知せず一度だけreloadする', () => {
    const runtime = createRuntime({ inGame: true });
    const oldWaiting = createWorker();
    runtime.testApi.handleWaiting(oldWaiting);

    runtime.serviceWorkerListeners.controllerchange();

    assert.deepStrictEqual(plain(runtime.testApi.snapshot()), {
        controllerReloadPending: true,
        hasWaitingWorker: false,
        hadServiceWorkerController: true,
        refreshingByServiceWorker: false,
        updateRequestedByUser: false,
    });
    assert.strictEqual(runtime.elements.pwaUpdateBanner.style.display, 'block');
    assert.strictEqual(runtime.reloadCount(), 0);

    runtime.applyUpdate();
    runtime.applyUpdate();
    runtime.serviceWorkerListeners.controllerchange();

    assert.strictEqual(runtime.reloadCount(), 1);
    assert.deepStrictEqual(oldWaiting.messages, []);
});

runTest('PWA inline更新は自tabのwaiting workerをactivateしてcontrollerchange後にreloadする', () => {
    const runtime = createRuntime({ inGame: true });
    const waiting = createWorker();
    runtime.testApi.handleWaiting(waiting);

    runtime.applyUpdate();
    assert.deepStrictEqual(plain(waiting.messages), [{ type: 'SKIP_WAITING' }]);
    assert.strictEqual(runtime.reloadCount(), 0);

    runtime.serviceWorkerListeners.controllerchange();
    runtime.serviceWorkerListeners.controllerchange();
    assert.strictEqual(runtime.reloadCount(), 1);
});

runTest('PWA inline更新は初回controllerをreloadせず外部更新だけをdeferredにする', () => {
    const runtime = createRuntime({ initialController: false, inGame: true });

    runtime.serviceWorkerListeners.controllerchange();
    assert.strictEqual(runtime.reloadCount(), 0);
    assert.strictEqual(runtime.testApi.snapshot().controllerReloadPending, false);

    runtime.serviceWorkerListeners.controllerchange();
    assert.strictEqual(runtime.reloadCount(), 0);
    assert.strictEqual(runtime.testApi.snapshot().controllerReloadPending, true);
});

runTest('PWA inline更新はdeferred中に来た新waiting workerを先にactivateする', () => {
    const runtime = createRuntime({ inGame: true });
    runtime.serviceWorkerListeners.controllerchange();
    const newerWaiting = createWorker();
    runtime.testApi.handleWaiting(newerWaiting);

    runtime.applyUpdate();
    assert.deepStrictEqual(plain(newerWaiting.messages), [{ type: 'SKIP_WAITING' }]);
    assert.strictEqual(runtime.reloadCount(), 0);

    runtime.serviceWorkerListeners.controllerchange();
    assert.strictEqual(runtime.reloadCount(), 1);
});

runTest('PWA inline更新はonline context中の操作を引き続き保留する', () => {
    const runtime = createRuntime({ inGame: true, online: true });
    const waiting = createWorker();
    runtime.testApi.handleWaiting(waiting);

    runtime.applyUpdate();

    assert.strictEqual(runtime.reloadCount(), 0);
    assert.deepStrictEqual(waiting.messages, []);
    assert.strictEqual(runtime.elements.pwaUpdateBtn.disabled, true);
    assert.strictEqual(runtime.dismiss.style.display, 'none');
});

waitForTests();
