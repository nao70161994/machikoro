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
            return Promise.resolve();
        },
        put(request, response) {
            putCalls.push({ request, response });
            cacheEntries.set(request.url || request, response);
            return Promise.resolve();
        },
    };
    const context = {
        URL,
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
    runtime.listeners.fetch({
        request,
        respondWith(promise) {
            responsePromise = promise;
        },
    });
    return responsePromise ? responsePromise : null;
}

(async () => {
    await runTest('Service Worker install はRLモデルをprecacheしない', async () => {
        const runtime = loadServiceWorker();
        await dispatchInstall(runtime);
        assert.strictEqual(runtime.addAllCalls.length, 1);
        const assets = runtime.addAllCalls[0];
        assert.ok(assets.includes('/index.html'));
        assert.ok(assets.includes('/js/RLModelPortfolio.js'));
        assert.ok(!assets.some(asset => asset.includes('/models/rl_model/portfolio/')), 'RL models must not be install precached');
        assert.deepStrictEqual(runtime.addCalls, []);
    });

    await runTest('Service Worker activate はclients.claimをwaitUntil内で完了する', async () => {
        const runtime = loadServiceWorker();
        await dispatchActivate(runtime);

        assert.deepStrictEqual(runtime.deletedCaches, ['machikoro-v3']);
        assert.strictEqual(runtime.context.self.clients.claimed, true);
    });

    await runTest('PWA model loading docs はRLモデルJSONのnetwork-first fallback方針を記載する', async () => {
        const docs = fs.readFileSync(path.join(__dirname, '..', 'docs', 'PWA_MODEL_LOADING.md'), 'utf8');

        assert.ok(docs.includes('network-first'));
        assert.ok(docs.includes('cached fallback'));
        assert.ok(!docs.includes('cache-first で扱う'));
    });

    await runTest('Service Worker はRLモデルJSONをruntime network-firstで更新する', async () => {
        const cached = makeResponse('cached-model');
        const network = makeResponse('network-model');
        const request = makeRequest('https://example.test/models/rl_model/portfolio/seed103-4p.browser.json');
        const runtime = loadServiceWorker({
            cacheEntries: [[request.url, cached]],
            fetchResponse: () => network,
        });
        const response = await dispatchFetch(runtime, request);

        assert.strictEqual(response, network);
        assert.strictEqual(runtime.fetchCalls.length, 1);
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
        const response = await dispatchFetch(runtime, request);

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
        const response = await dispatchFetch(runtime, request);
        assert.strictEqual(response, shell);
    });

    await runTest('Service Worker はsocket.io requestを横取りしない', async () => {
        const request = makeRequest('https://example.test/socket.io/socket.io.js');
        const runtime = loadServiceWorker();
        const response = await dispatchFetch(runtime, request);
        assert.strictEqual(response, null);
    });
})();
