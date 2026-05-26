const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createStorage, loadScripts, makeElement, runTest } = require('./helpers/test-utils');
const releaseAsyncTests = [];

function runAsyncTest(name, fn) {
    const result = runTest(name, fn);
    releaseAsyncTests.push(result);
    return result;
}

process.on('beforeExit', () => {
    if (releaseAsyncTests.length === 0) return;
    const pending = releaseAsyncTests.splice(0);
    Promise.all(pending).catch((error) => {
        console.error(error && error.stack ? error.stack : error);
        process.exitCode = 1;
    });
});
const {
    __rooms,
    CLIENT_ERROR_LIMITS,
    handleClientErrorTestRequest,
    serializeMirrorState,
    restoreMirrorState,
    handleRecreateRoom,
    loadGameRuntime,
} = require('../server');

const repoRoot = path.join(__dirname, '..');

const MOBILE_PROFILES = Object.freeze([
    {
        name: 'iPhone Safari',
        viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
    },
    {
        name: 'Android Chrome',
        viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    },
]);

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function makeResponseRecorder() {
    const recorder = { statusCode: null, body: null };
    return {
        recorder,
        res: {
            status(code) {
                recorder.statusCode = code;
                return this;
            },
            json(body) {
                recorder.body = body;
                return this;
            },
        },
    };
}

function makeSnapshot(overrides = {}) {
    const runtime = loadGameRuntime();
    const game = new runtime.GameManager(2);
    game.players[0].name = 'Alice';
    game.players[1].name = 'Bob';
    const shopStock = { '麦畑': 6, 'パン屋': 0, 'カフェ': 0, 'ビジネスセンター': 0, '引越し屋': 0 };
    return Object.assign(serializeMirrorState(game, shopStock, null, 0), overrides);
}

function loadAppShellRuntime(profile = MOBILE_PROFILES[0]) {
    const { localStorage } = createStorage();
    const fetchCalls = [];
    const elements = {
        crashScreen: makeElement(),
        crashMessage: makeElement(),
        crashResumeBtn: makeElement(),
        pwaInstallBanner: makeElement(),
        offlineNotice: makeElement(),
        tabOnline: makeElement(),
        onlineCreateSubmitButton: makeElement(),
        onlineJoinSubmitButton: makeElement(),
    };
    const context = {
        console,
        localStorage,
        navigator: {
            userAgent: profile.userAgent,
            onLine: true,
        },
        window: {
            MACHIKORO_CLIENT_VERSION: 'test-build',
            location: { href: 'https://machikoro.example.test/?room=ABCD' },
            innerWidth: profile.viewport.width,
            innerHeight: profile.viewport.height,
            devicePixelRatio: profile.viewport.deviceScaleFactor,
            matchMedia(query) {
                return { matches: query === '(display-mode: standalone)' ? false : query.includes('pointer: coarse') };
            },
            addEventListener(type, handler) {
                context.windowListeners[type] = handler;
            },
        },
        windowListeners: {},
        document: {
            getElementById(id) {
                if (!elements[id]) elements[id] = makeElement();
                return elements[id];
            },
        },
        fetch(url, options) {
            fetchCalls.push({ url, options });
            return Promise.resolve({ ok: true });
        },
        Date,
        game: { phase: 'build' },
        myRoomId: 'ABCD',
        myPlayerIndex: 1,
        cpuScheduleToken: 0,
        resumeGame() {},
        loadSettings() {},
        renderOnlinePlayerSettings() {},
        updateResumeButton() {},
        drawCitySkyline() {},
    };
    context.global = context;
    vm.createContext(context);
    loadScripts(context, ['js/appShell.js']);
    return { context, elements, fetchCalls };
}

function loadUiModalRuntime() {
    const opener = makeElement();
    const first = makeElement();
    const last = makeElement();
    const elements = {
        rulesModal: makeElement({
            querySelectorAll() { return [first, last]; },
        }),
        pendingModal: makeElement(),
        pendingMenu: makeElement(),
    };
    const context = {
        console,
        document: {
            activeElement: opener,
            getElementById(id) { return elements[id] || null; },
            addEventListener(type, handler) { context.keydownHandler = handler; },
        },
        setTimeout(fn) { fn(); return 1; },
        clearTimeout() {},
        localStorage: createStorage().localStorage,
        enabledLandmarks: new Set(),
        isOnlineGame: false,
        myPlayerIndex: 0,
        isReplaying: false,
        tutorialEnabled: false,
        tutorialLevel: 'beginner',
        prevPlayerIndex: -1,
        prevLogLength: 0,
        fullLog: [],
        announcerTimer: null,
        cardFilter: '',
        cpuPlayers: [null, null],
        game: null,
        LOG_TYPES: {},
        GAME_PHASES: { PENDING: 'pending' },
    };
    opener.focus = () => { opener.focused = true; context.document.activeElement = opener; };
    first.focus = () => { first.focused = true; context.document.activeElement = first; };
    last.focus = () => { last.focused = true; context.document.activeElement = last; };
    elements.rulesModal.focus = () => { elements.rulesModal.focused = true; context.document.activeElement = elements.rulesModal; };
    context.global = context;
    vm.createContext(context);
    loadScripts(context, ['js/Card.js', 'js/Player.js', 'js/ui.js']);
    return { context, elements, opener, first, last };
}

function loadServiceWorkerRuntime() {
    const listeners = {};
    const deletedCaches = [];
    const context = {
        URL,
        console,
        self: {
            skipWaitingCalled: false,
            addEventListener(type, handler) { listeners[type] = handler; },
            skipWaiting() { this.skipWaitingCalled = true; },
            clients: {
                claimed: false,
                claim() { this.claimed = true; return Promise.resolve(); },
            },
        },
        caches: {
            open() { return Promise.resolve({ addAll() { return Promise.resolve(); } }); },
            keys() { return Promise.resolve(['machikoro-old', 'machikoro-current']); },
            delete(name) { deletedCaches.push(name); return Promise.resolve(true); },
            match() { return Promise.resolve(null); },
        },
        fetch() { return Promise.resolve({ ok: true, clone() { return this; } }); },
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(readRepoFile('sw.js'), context, { filename: 'sw.js' });
    return { context, listeners, deletedCaches };
}

runTest('release mobile profiles は viewport/touch/safe-area と主要UAを定義する', () => {
    const index = readRepoFile('index.html');
    const css = readRepoFile('style.css');

    assert.ok(index.includes('viewport-fit=cover'), 'iPhone safe-area needs viewport-fit=cover');
    assert.ok(css.includes('env(safe-area-inset-top)'), 'CSS must use top safe-area inset');
    assert.ok(css.includes('env(safe-area-inset-bottom'), 'CSS must use bottom safe-area inset');
    assert.ok(css.includes(':focus-visible'), 'keyboard focus visibility is required');
    assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion fallback is required');

    for (const profile of MOBILE_PROFILES) {
        assert.strictEqual(profile.viewport.isMobile, true, profile.name);
        assert.strictEqual(profile.viewport.hasTouch, true, profile.name);
        assert.ok(profile.viewport.width >= 360 && profile.viewport.width <= 430, profile.name);
        assert.ok(/Mobile/.test(profile.userAgent), profile.name);
    }
});

runTest('release UI action registry containers は index.html に存在する', () => {
    const index = readRepoFile('index.html');
    ['btnRoll', 'btnSkip', 'diceChoose', 'buildMenu', 'pendingModal', 'pendingMenu'].forEach(id => {
        assert.ok(new RegExp('id=[\"\']' + id + '[\"\']').test(index), id + ' exists');
    });
});

runTest('release client error capture は iPhone Safari 風コンテキストと重複抑止を保持する', () => {
    const { context, fetchCalls } = loadAppShellRuntime(MOBILE_PROFILES[0]);
    const report = context.buildClientErrorReport({
        source: 'window.onerror',
        message: 'updatePendingModalContent recursion',
        filename: 'js/ui.js',
        line: 381,
        column: 9,
        stack: 'x'.repeat(CLIENT_ERROR_LIMITS.maxStackLength + 100),
    });

    assert.strictEqual(report.phase, 'build');
    assert.strictEqual(report.roomId, 'ABCD');
    assert.strictEqual(report.playerIndex, 1);
    assert.ok(report.userAgent.includes('iPhone'));
    assert.strictEqual(report.appVersion, 'test-build');
    assert.strictEqual(report.url, 'https://machikoro.example.test/');
    assert.ok(report.stack.length <= CLIENT_ERROR_LIMITS.maxStackLength + 3);

    assert.strictEqual(context.reportClientError({ source: 'window.onerror', message: 'same', filename: 'x.js', line: 1, column: 1 }), true);
    assert.strictEqual(context.reportClientError({ source: 'window.onerror', message: 'same', filename: 'x.js', line: 1, column: 1 }), false);
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(fetchCalls[0].url, '/api/client-error');
    assert.strictEqual(JSON.parse(fetchCalls[0].options.body).source, 'window.onerror');
});

runAsyncTest('release ntfy client-error-test は実送信せず mock fetch で通知内容を検証する', async () => {
    const calls = [];
    const { recorder, res } = makeResponseRecorder();
    await handleClientErrorTestRequest({
        headers: {},
        get() { return undefined; },
        protocol: 'https',
    }, res, {
        env: { NODE_ENV: 'test', NTFY_TOPIC: 'mock-topic' },
        now: Date.UTC(2026, 4, 20, 12, 0, 0),
        buildHash: 'release-test',
        notifyOptions: {
            topic: 'mock-topic',
            fetchImpl(url, options) {
                calls.push({ url, options });
                return Promise.resolve({ ok: true });
            },
        },
    });

    assert.strictEqual(recorder.statusCode, 202);
    assert.strictEqual(recorder.body.ok, true);
    assert.strictEqual(recorder.body.test, true);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'https://ntfy.sh/mock-topic');
    assert.strictEqual(calls[0].options.headers.Title, '[ダイスシティ] Client Error');
    assert.ok(calls[0].options.body.includes('phase=test'));
    assert.ok(calls[0].options.body.includes('ダイスシティ ntfy test notification'));
    assert.ok(calls[0].options.body.includes('room=hash:'));
    assert.ok(!calls[0].options.body.includes('room=TEST01'));
});

runTest('release modal/toast は non-blocking 表示、focus trap、Esc close、focus restore を近似する', () => {
    const { context, elements, opener, first, last } = loadUiModalRuntime();
    let prevented = 0;

    context.showRules();
    assert.strictEqual(elements.rulesModal.style.display, 'flex');
    assert.strictEqual(elements.rulesModal.getAttribute('role'), 'dialog');
    assert.strictEqual(elements.rulesModal.getAttribute('aria-modal'), 'true');
    assert.strictEqual(context.document.activeElement, first);

    context.document.activeElement = last;
    context.handleModalKeydown({ key: 'Tab', preventDefault() { prevented++; } });
    assert.strictEqual(context.document.activeElement, first);
    assert.strictEqual(prevented, 1);

    context.handleModalKeydown({ key: 'Escape', preventDefault() { prevented++; } });
    assert.strictEqual(elements.rulesModal.style.display, 'none');
    assert.strictEqual(context.document.activeElement, opener);
});

runTest('release iPhone Safari pending UI は pointer-events none 残留を正規化する', () => {
    const { context, elements } = loadUiModalRuntime();
    const makePlayer = (name, cardNames) => ({
        name,
        coins: 3,
        cards: cardNames.map(cardName => ({ name: cardName, color: 'blue' })),
        getMinorCards() { return this.cards; },
        isDormant() { return false; },
    });
    context.game = {
        phase: 'pending',
        currentPlayerIndex: 0,
        pendingTV: 0,
        pendingBusiness: 1,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        allowedActions() { return new Set(['resolveBusiness']); },
        players: [makePlayer('Alice', ['パン屋']), makePlayer('Bob', ['牧場'])],
        currentPlayer() { return this.players[this.currentPlayerIndex]; },
    };
    elements.pendingModal.style.pointerEvents = 'none';
    elements.pendingMenu.style.pointerEvents = 'none';

    context.renderPending();

    assert.strictEqual(elements.pendingModal.style.display, 'flex');
    assert.strictEqual(elements.pendingModal.style.pointerEvents, 'auto');
    assert.strictEqual(elements.pendingMenu.style.pointerEvents, 'auto');
    assert.ok(elements.pendingMenu.innerHTML.includes('data-action="resolveBusiness"'));
});

runAsyncTest('release PWA install/update と Service Worker lifecycle を疑似実行する', async () => {
    const index = readRepoFile('index.html');
    assert.ok(index.includes("navigator.serviceWorker.register('/sw.js')"));
    assert.ok(index.includes('updatefound'));
    assert.ok(index.includes('controllerchange'));
    assert.ok(index.includes('SKIP_WAITING'));
    assert.ok(index.includes('function checkClientVersionMismatch()'));
    assert.ok(index.includes("fetch('/api/version',"));
    assert.ok(index.includes('古いバージョンです。修正済みバグを避けるため更新してください。'));
    assert.ok(index.includes('_forceVersionReload();'));

    const appShell = loadAppShellRuntime(MOBILE_PROFILES[1]);
    let prevented = false;
    let prompted = false;
    appShell.context.bindPwaInstallHandlers();
    appShell.context.windowListeners.beforeinstallprompt({
        preventDefault() { prevented = true; },
        prompt() { prompted = true; },
        userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    assert.strictEqual(prevented, true);
    assert.strictEqual(appShell.elements.pwaInstallBanner.style.display, 'block');
    appShell.context.pwaInstallPrompt();
    assert.strictEqual(prompted, true);

    const sw = loadServiceWorkerRuntime();
    await new Promise(resolve => sw.listeners.message({ data: { type: 'SKIP_WAITING' } }) || resolve());
    assert.strictEqual(sw.context.self.skipWaitingCalled, true);
    let waitUntil = Promise.resolve();
    sw.listeners.activate({ waitUntil(promise) { waitUntil = promise; } });
    await waitUntil;
    assert.strictEqual(sw.context.self.clients.claimed, true);
    assert.ok(sw.deletedCaches.includes('machikoro-old'));
});

runTest('release reconnect/restore/host migration は server restart 相当の復元経路で維持される', () => {
    const emitted = [];
    const joined = [];
    const roomId = 'RELRESTORE01';
    const tokenAlice = 'token-alice';
    const tokenBob = 'token-bob';
    const reconnectTokenHashes = [tokenAlice, tokenBob].map(token => crypto.createHash('sha256').update(token).digest('hex'));
    const gameStartPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
    };
    const socket = {
        id: 'socket-alice-restored',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(id) { joined.push(id); },
    };

    try {
        delete __rooms[roomId];
        handleRecreateRoom(socket, {
            roomId,
            gameStartPayload,
            stateSnapshot: makeSnapshot(),
            actionLog: [],
            playerIndex: 0,
            playerName: 'Alice',
            reconnectToken: tokenAlice,
        });

        assert.deepStrictEqual(joined, [roomId]);
        assert.strictEqual(__rooms[roomId].restored, true);
        assert.strictEqual(__rooms[roomId].hostPlayerIndex, 0);
        assert.strictEqual(emitted[0].name, 'rejoinData');
        assert.ok(emitted[0].payload.stateSnapshot);

        const bobSocket = {
            id: 'socket-bob-new-host',
            emit(name, payload) { emitted.push({ name, payload }); },
            join(id) { joined.push(id); },
        };
        const newerPayload = Object.assign({}, gameStartPayload, { hostPlayerIndex: 1, hostEpoch: 1, actionSeq: 1 });
        handleRecreateRoom(bobSocket, {
            roomId,
            gameStartPayload: newerPayload,
            stateSnapshot: makeSnapshot({ currentPlayerIndex: 0, phase: 'build' }),
            actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 1 }],
            playerIndex: 1,
            playerName: 'Bob',
            reconnectToken: tokenBob,
        });

        assert.strictEqual(__rooms[roomId].hostPlayerIndex, 1);
        assert.strictEqual(__rooms[roomId].hostEpoch, 1);
        assert.strictEqual(__rooms[roomId].actionSeq, 0);
        assert.notStrictEqual(__rooms[roomId].stateSnapshot.actionSeq, 1);
        assert.strictEqual(emitted[1].name, 'rejoinData');
        assert.strictEqual(emitted[1].payload.gameStartPayload, gameStartPayload);
    } finally {
        delete __rooms[roomId];
    }
});

runTest('release workflow と checklist は static safety gate と nightly gate を含む', () => {
    const workflow = readRepoFile('.github/workflows/release-test.yml');
    const nightlyWorkflow = readRepoFile('.github/workflows/nightly-release-test.yml');
    const apkWorkflow = readRepoFile('.github/workflows/build-apk.yml');
    const checklist = readRepoFile('docs/RELEASE_CHECKLIST.md');
    const operations = readRepoFile('docs/OPERATIONS.md');

    assert.ok(workflow.includes('npm run test:static'));
    assert.ok(workflow.includes('npm run test:pwa'));
    assert.ok(workflow.indexOf('npm run test:static') < workflow.indexOf('npm test'));
    assert.ok(workflow.indexOf('npm test') < workflow.indexOf('npm run test:pwa'));
    assert.ok(workflow.indexOf('npm run test:pwa') < workflow.indexOf('npm run test:release'));
    assert.ok(nightlyWorkflow.includes('schedule:'));
    assert.ok(nightlyWorkflow.includes('npm run test:release'));
    assert.ok(nightlyWorkflow.includes('npm run test:pwa'));
    assert.ok(nightlyWorkflow.includes('npm run test:online'));
    assert.ok(nightlyWorkflow.includes('NTFY_CI_TOPIC'));
    assert.ok(nightlyWorkflow.includes('failure()'));
    assert.ok(checklist.includes('npm run test:static'));
    assert.ok(checklist.includes('npm run test:smoke'));
    assert.ok(checklist.includes('CI also runs `npm run test:static`, `npm test`, `npm run test:pwa`, and `npm run test:release`'));
    assert.ok(checklist.includes('Nightly regression runs `npm run test:release`, `npm run test:pwa`, and `npm run test:online`'));
    assert.ok(checklist.includes('docs/OPERATIONS.md'));
    assert.ok(operations.includes('classification=unknown'));
    assert.ok(operations.includes('stale-client'));
    assert.ok(apkWorkflow.includes('npm run test:static'));
    assert.ok(apkWorkflow.includes('npm test'));
    assert.ok(apkWorkflow.indexOf('npm run test:static') < apkWorkflow.indexOf('npm test'));
});

runTest('release shortened long-run smoke は 60分相当を短縮して snapshot roundtrip を繰り返す', () => {
    const runtime = loadGameRuntime();
    const game = new runtime.GameManager(2);
    const shopStock = { '麦畑': 6, 'パン屋': 6, 'カフェ': 6 };

    for (let i = 0; i < 180; i++) {
        if (game.phase === runtime.GAME_PHASES.ROLL) game.rollDice((i % 6) + 1);
        if (game.phase === runtime.GAME_PHASES.BUILD) game.nextTurn();
        if (i % 15 === 0) {
            const snapshot = serializeMirrorState(game, shopStock, null, i);
            const restored = new runtime.GameManager(2);
            const restoredStock = {};
            assert.doesNotThrow(() => restoreMirrorState(restored, restoredStock, snapshot, runtime.createCardByName));
            const roundtrip = serializeMirrorState(restored, restoredStock, null, i);
            assert.strictEqual(roundtrip.currentPlayerIndex, snapshot.currentPlayerIndex);
            assert.strictEqual(roundtrip.phase, snapshot.phase);
            assert.deepStrictEqual(roundtrip.shopStock, snapshot.shopStock);
        }
    }

    assert.ok(game.turnCount > 50, 'long-run smoke should advance many turns');
});
