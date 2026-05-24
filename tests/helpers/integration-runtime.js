const vm = require('vm');
const { createStorage, loadScripts, makeElement } = require('./test-utils');

function loadIntegrationRuntime(options = {}) {
    const { storage, localStorage } = createStorage();
    const alerts = [];
    const elements = {
        playerCount: makeElement({ textContent: '2' }),
        playerSettings: makeElement(),
        cpuSpeed: makeElement({ value: '1500' }),
        speedLabel: makeElement(),
        resumeSection: makeElement(),
        onlineResumeSection: makeElement(),
        cityCanvas: makeElement(),
        crashScreen: makeElement(),
        crashMessage: makeElement(),
        crashResumeBtn: makeElement(),
        tabOnline: makeElement(),
        tabLocal: makeElement(),
        tabStats: makeElement(),
        tabContentLocal: makeElement(),
        tabContentOnline: makeElement(),
        tabContentStats: makeElement(),
        offlineNotice: makeElement(),
        pwaInstallBanner: makeElement(),
        pwaUpdateBanner: makeElement({ style: { display: 'none' } }),
        pendingModal: makeElement(),
        pendingMenu: makeElement(),
        confirmModal: makeElement(),
        confirmMessage: makeElement(),
        confirmOkBtn: makeElement(),
        confirmCancelBtn: makeElement(),
        onlineCreateSubmitButton: makeElement(),
        onlineJoinSubmitButton: makeElement(),
        titleScreen: makeElement(),
        gameScreen: makeElement(),
        status: makeElement(),
        tutorialBox: makeElement(),
        btnRoll: makeElement(),
        btnSkip: makeElement(),
        btnReroll: makeElement(),
        diceChoose: makeElement(),
        diceResult: makeElement(),
        buildMenu: makeElement(),
        log: makeElement(),
        logTitle: makeElement(),
        logSummary: makeElement(),
        players: makeElement(),
        onlineStatus: makeElement(),
        playerNameInput: makeElement({ value: 'Alice' }),
        roomIdInput: makeElement({ value: 'ROOM01' }),
    };
    const timeouts = [];
    const intervals = [];
    const eventHandlers = {};
    const socketHandlers = {};
    const socketEmits = [];
    const fetchCalls = [];
    const dateState = { now: Date.now() };
    class FakeDate extends Date {
        constructor(...args) {
            super(...(args.length ? args : [dateState.now]));
        }
        static now() { return dateState.now; }
    }
    let socketDisconnected = false;
    const context = {
        console,
        Math,
        Date: FakeDate,
        elements,
        storage,
        localStorage,
        document: {
            activeElement: null,
            body: makeElement(),
            getElementById(id) {
                if (!elements[id]) elements[id] = makeElement();
                return elements[id];
            },
            querySelector(selector) {
                return null;
            },
            querySelectorAll() { return []; },
            createElement() { return makeElement(); },
        },
        window: {
            innerWidth: 360,
            addEventListener(name, handler) { eventHandlers[name] = handler; },
            matchMedia() { return { matches: false }; },
        },
        navigator: { onLine: true },
        fetch(url, options) {
            fetchCalls.push({ url, options });
            return Promise.resolve({ json: () => Promise.resolve({ hash: 'test' }) });
        },
        io() {
            return {
                on(name, handler) { socketHandlers[name] = handler; },
                emit(name, payload) { socketEmits.push({ name, payload }); },
                disconnect() { socketDisconnected = true; },
            };
        },
        setTimeout(fn) {
            timeouts.push(fn);
            return timeouts.length;
        },
        clearTimeout() {},
        setInterval(fn) {
            intervals.push(fn);
            return intervals.length;
        },
        clearInterval() {},
        alert(message) { alerts.push(message); },
        showNotice(message) { alerts.push(message); },
        showConfirm(message, cb) { cb(); },
        drawCitySkyline() {},
        playSound() {},
        startConfetti() {},
        stopConfetti() {},
        showTurnAnnouncer() {},
        showCardDetail() {},
        showLandmarkDetail() {},
        updateDiceDisplay() {},
        cancelAutoSkip() {},
        renderOnlinePlayerSettings() {},
        escapeHtml(value) { return String(value); },
        tutorialEnabled: false,
        tutorialLevel: 'beginner',
        enabledCards: new Set(),
        enabledLandmarks: new Set(),
        isOnlineGame: false,
        myPlayerIndex: 0,
        isReplaying: false,
        fullLog: [],
        prevLogLength: 0,
        prevPlayerIndex: -1,
        announcerTimer: null,
        cardFilter: '',
        LANDMARK_NAMES: {
            YAKUSHO: '役所',
        },
    };
    context.global = context;
    vm.createContext(context);
    const files = [
        'js/Card.js',
        'js/Player.js',
        'js/GameManager.js',
        'js/cpuTuning.js',
        'js/cpuDiagnostics.js',
        'js/cpuEvaluationCache.js',
        'js/CPU.js',
        'js/appShell.js',
        'js/storage.js',
        'js/stats.js',
        'js/ui.js',
    ];
    if (options.includeOnline) files.push('js/online.js');
    files.push('js/main.js');
    loadScripts(context, files);
    vm.runInContext(`
        this.CARDS = CARDS;
        this.Player = Player;
        this.GAME_PHASES = GAME_PHASES;
        this.createCardByName = createCardByName;
    `, context);
    context.__test = {
        elements,
        storage,
        timeouts,
        intervals,
        eventHandlers,
        socketHandlers,
        socketEmits,
        fetchCalls,
        alerts,
        isSocketDisconnected: () => socketDisconnected,
        flushTimeouts: () => { while (timeouts.length) timeouts.shift()(); },
        runIntervals: (count = 1) => { for (let i = 0; i < count; i++) intervals.slice().forEach(fn => fn()); },
        advanceTime: ms => { dateState.now += ms; },
        setPlayerSettings(value) { context.__tmpPlayerSettings = value; vm.runInContext('playerSettings = __tmpPlayerSettings', context); delete context.__tmpPlayerSettings; },
        getGame() { return vm.runInContext('game', context); },
        setGame(value) { context.__tmpGame = value; vm.runInContext('game = __tmpGame', context); delete context.__tmpGame; },
        getCpuPlayers() { return vm.runInContext('cpuPlayers', context); },
        setCpuPlayers(value) { context.__tmpCpuPlayers = value; vm.runInContext('cpuPlayers = __tmpCpuPlayers', context); delete context.__tmpCpuPlayers; },
        setOnlineState(value) {
            context.__tmpOnlineState = value;
            vm.runInContext(`
                if (typeof __tmpOnlineState.socket !== 'undefined') socket = __tmpOnlineState.socket;
                if (typeof __tmpOnlineState.isOnlineGame !== 'undefined') isOnlineGame = __tmpOnlineState.isOnlineGame;
                if (typeof __tmpOnlineState.isReconnectingOnline !== 'undefined') isReconnectingOnline = __tmpOnlineState.isReconnectingOnline;
                if (typeof __tmpOnlineState.isRoomHost !== 'undefined') isRoomHost = __tmpOnlineState.isRoomHost;
                if (typeof __tmpOnlineState.myRoomId !== 'undefined') myRoomId = __tmpOnlineState.myRoomId;
                if (typeof __tmpOnlineState.myOriginalPlayerIndex !== 'undefined') myOriginalPlayerIndex = __tmpOnlineState.myOriginalPlayerIndex;
                if (typeof __tmpOnlineState.myPlayerIndex !== 'undefined') myPlayerIndex = __tmpOnlineState.myPlayerIndex;
                if (typeof __tmpOnlineState.myPlayerName !== 'undefined') myPlayerName = __tmpOnlineState.myPlayerName;
                if (typeof __tmpOnlineState.reconnectToken !== 'undefined') reconnectToken = __tmpOnlineState.reconnectToken;
            `, context);
            delete context.__tmpOnlineState;
        },
        getOnlineState() {
            return vm.runInContext('({ socket, isOnlineGame, isReconnectingOnline, isRoomHost, myRoomId, myOriginalPlayerIndex, myPlayerIndex, myPlayerName, reconnectToken })', context);
        },
    };
    return context;
}

module.exports = {
    loadIntegrationRuntime,
};
