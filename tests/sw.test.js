const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function runTest(name, fn) {
    try {
        await fn();
        console.log(`テスト成功: ${name}`);
    } catch (error) {
        console.error(`テスト失敗: ${name}`);
        console.error(error.stack);
        process.exitCode = 1;
    }
}

function makeResponse(label, status = 200) {
    return {
        label,
        status,
        clone() {
            return makeResponse(`${label}:clone`, status);
        },
    };
}

function makeRequest(url, options = {}) {
    return {
        url,
        method: options.method || 'GET',
        headers: {
            get(name) {
                if (String(name).toLowerCase() === 'accept') return options.accept || '';
                return null;
            },
        },
    };
}

function loadServiceWorker(options = {}) {
    const listeners = {};
    const cacheEntries = new Map(options.cacheEntries || []);
    const addAllCalls = [];
    const addCalls = [];
    const putCalls = [];
    const fetchCalls = [];
    const deletedCaches = [];
    const cache = {
        addAll(assets) {
            addAllCalls.push(assets.slice());
            return Promise.resolve();
        },
        add(asset) {
            addCalls.push(asset);
            if (options.addReject && options.addReject(asset)) return Promise.reject(new Error('add failed: ' + asset));
            return Promise.resolve();
        },
        put(request, response) {
            putCalls.push({ request, response });
            if (options.putReject) return Promise.reject(new Error('put failed'));
            cacheEntries.set(request.url || request, response);
            return Promise.resolve();
        },
    };
    const context = {
        URL,
        Response,
        console,
        self: {
            addEventListener(type, listener) {
                listeners[type] = listener;
            },
            skipWaitingCalled: false,
            skipWaiting() {
                this.skipWaitingCalled = true;
            },
            clients: {
                claimed: false,
                claim() {
                    this.claimed = true;
                },
            },
        },
        caches: {
            open(name) {
                context.lastOpenedCache = name;
                return Promise.resolve(cache);
            },
            keys() {
                return Promise.resolve(options.cacheKeys || ['machikoro-v3', 'machikoro-v4']);
            },
            delete(name) {
                deletedCaches.push(name);
                return Promise.resolve(true);
            },
            match(request) {
                return Promise.resolve(cacheEntries.get(request.url || request));
            },
        },
        fetch(request) {
            fetchCalls.push(request);
            if (options.fetchReject) return Promise.reject(new Error('network down'));
            if (options.fetchResponse) return Promise.resolve(options.fetchResponse(request));
            return Promise.resolve(makeResponse(request.url || request));
        },
    };
    context.globalThis = context;
    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    vm.runInContext(source, context, { filename: 'sw.js' });
    return { context, listeners, addAllCalls, addCalls, putCalls, fetchCalls, deletedCaches };
}

async function dispatchInstall(runtime) {
    let waitPromise = Promise.resolve();
    runtime.listeners.install({
        waitUntil(promise) {
            waitPromise = promise;
        },
    });
    await waitPromise;
}

async function dispatchActivate(runtime) {
    let waitPromise = Promise.resolve();
    runtime.listeners.activate({
        waitUntil(promise) {
            waitPromise = promise;
        },
    });
    await waitPromise;
}

async function dispatchFetch(runtime, request) {
    let responsePromise = null;
    const waitUntilPromises = [];
    runtime.listeners.fetch({
        request,
        respondWith(promise) {
            responsePromise = promise;
        },
        waitUntil(promise) {
            waitUntilPromises.push(promise);
        },
    });
    const response = responsePromise ? await responsePromise : null;
    return { response, waitUntilPromises };
}

function dispatchMessage(runtime, data) {
    runtime.listeners.message({ data });
}

(async () => {
    await runTest('Service Worker install はRLモデルをprecacheしない', async () => {
        const runtime = loadServiceWorker();
        await dispatchInstall(runtime);
        assert.strictEqual(runtime.addAllCalls.length, 0);
        const assets = runtime.addCalls;
        assert.ok(assets.includes('/index.html'));
        assert.ok(assets.includes('/js/RLModelPortfolio.js'));
        assert.ok(!assets.some(asset => asset.includes('/models/rl_model/portfolio/')), 'RL models must not be install precached');
    });

    await runTest('Service Worker install は任意asset失敗だけなら完了する', async () => {
        const runtime = loadServiceWorker({ addReject: asset => asset === '/icons/icon-512.png' });
        await dispatchInstall(runtime);
        assert.ok(runtime.addCalls.includes('/index.html'));
        assert.ok(runtime.addCalls.includes('/icons/icon-512.png'));
    });

    await runTest('Service Worker install は重要asset失敗なら失敗する', async () => {
        const runtime = loadServiceWorker({ addReject: asset => asset === '/index.html' });
        await assert.rejects(() => dispatchInstall(runtime), /Critical precache failed/);
    });

    await runTest('Service Worker activate はclients.claimをwaitUntil内で完了する', async () => {
        const runtime = loadServiceWorker();
        await dispatchActivate(runtime);

        assert.deepStrictEqual(runtime.deletedCaches, ['machikoro-v3']);
        assert.strictEqual(runtime.context.self.clients.claimed, true);
    });

    await runTest('Service Worker はSKIP_WAITING messageでskipWaitingする', async () => {
        const runtime = loadServiceWorker();
        dispatchMessage(runtime, { type: 'SKIP_WAITING' });

        assert.strictEqual(runtime.context.self.skipWaitingCalled, true);
    });

    await runTest('Service Worker は未知messageでskipWaitingしない', async () => {
        const runtime = loadServiceWorker();
        dispatchMessage(runtime, { type: 'UNKNOWN_MESSAGE' });

        assert.strictEqual(runtime.context.self.skipWaitingCalled, false);
    });

    await runTest('PWA model loading docs はRLモデルJSONのnetwork-first fallback方針を記載する', async () => {
        const docs = fs.readFileSync(path.join(__dirname, '..', 'docs', 'PWA_MODEL_LOADING.md'), 'utf8');

        assert.ok(docs.includes('network-first'));
        assert.ok(docs.includes('cached fallback'));
        assert.ok(!docs.includes('cache-first で扱う'));
    });

    await runTest('Service Worker runtime cache put 失敗でもnetwork responseを返す', async () => {
        const network = makeResponse('network-model');
        const request = makeRequest('https://example.test/models/rl_model/portfolio/seed103-4p.browser.json');
        const runtime = loadServiceWorker({
            putReject: true,
            fetchResponse: () => network,
        });
        const { response, waitUntilPromises } = await dispatchFetch(runtime, request);

        assert.strictEqual(response, network);
        await Promise.all(waitUntilPromises);
        assert.strictEqual(runtime.putCalls.length, 1);
    });

    await runTest('Service Worker はRLモデルJSONをruntime network-firstで更新する', async () => {
        const cached = makeResponse('cached-model');
        const network = makeResponse('network-model');
        const request = makeRequest('https://example.test/models/rl_model/portfolio/seed103-4p.browser.json');
        const runtime = loadServiceWorker({
            cacheEntries: [[request.url, cached]],
            fetchResponse: () => network,
        });
        const { response, waitUntilPromises } = await dispatchFetch(runtime, request);

        assert.strictEqual(response, network);
        assert.strictEqual(runtime.fetchCalls.length, 1);
        assert.strictEqual(waitUntilPromises.length, 1);
        await Promise.all(waitUntilPromises);
        assert.strictEqual(runtime.putCalls.length, 1);
        assert.strictEqual(runtime.putCalls[0].request, request);
    });

    await runTest('Service Worker はoffline時にcached RLモデルJSONへfallbackする', async () => {
        const cached = makeResponse('cached-model');
        const request = makeRequest('https://example.test/models/rl_model/portfolio/seed71-top3.browser.json');
        const runtime = loadServiceWorker({
            cacheEntries: [[request.url, cached]],
            fetchReject: true,
        });
        const { response, waitUntilPromises } = await dispatchFetch(runtime, request);

        assert.strictEqual(response, cached);
        assert.strictEqual(runtime.fetchCalls.length, 1);
    });

    await runTest('Service Worker はRLモデルJSONのHTTP失敗時にcached fallbackを返す', async () => {
        const cached = makeResponse('cached-model');
        const network = makeResponse('server-error', 503);
        const request = makeRequest('https://example.test/models/rl_model/portfolio/seed71-top3.browser.json');
        const runtime = loadServiceWorker({
            cacheEntries: [[request.url, cached]],
            fetchResponse: () => network,
        });
        const { response, waitUntilPromises } = await dispatchFetch(runtime, request);

        assert.strictEqual(response, cached);
        assert.strictEqual(runtime.fetchCalls.length, 1);
    });

    await runTest('Service Worker はHTML requestをoffline時にshellへfallbackする', async () => {
        const shell = makeResponse('shell');
        const request = makeRequest('https://example.test/some/page', { accept: 'text/html' });
        const runtime = loadServiceWorker({
            fetchReject: true,
            cacheEntries: [['/', shell]],
        });
        const { response, waitUntilPromises } = await dispatchFetch(runtime, request);
        assert.strictEqual(response, shell);
    });

    await runTest('Service Worker はHTML HTTP失敗時にcached pageへfallbackする', async () => {
        const cached = makeResponse('cached-page');
        const network = makeResponse('server-error', 503);
        const request = makeRequest('https://example.test/some/page', { accept: 'text/html' });
        const runtime = loadServiceWorker({
            fetchResponse: () => network,
            cacheEntries: [[request.url, cached]],
        });
        const { response, waitUntilPromises } = await dispatchFetch(runtime, request);
        assert.strictEqual(response, cached);
    });


    await runTest('Service Worker はallowlist外GETをruntime cacheしない', async () => {
        const request = makeRequest('https://example.test/scripts/private-report.js');
        const runtime = loadServiceWorker({
            fetchResponse: () => makeResponse('private-script'),
        });
        const { response, waitUntilPromises } = await dispatchFetch(runtime, request);

        assert.strictEqual(response.label, 'private-script');
        assert.strictEqual(waitUntilPromises.length, 0);
        assert.strictEqual(runtime.putCalls.length, 0);
    });

    await runTest('Service Worker はsocket.io requestを横取りしない', async () => {
        const request = makeRequest('https://example.test/socket.io/socket.io.js');
        const runtime = loadServiceWorker();
        const { response, waitUntilPromises } = await dispatchFetch(runtime, request);
        assert.strictEqual(response, null);
    });
})();
