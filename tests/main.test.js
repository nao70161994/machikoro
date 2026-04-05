const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeElement(overrides = {}) {
    return Object.assign({
        style: {},
        textContent: '',
        innerHTML: '',
        value: '',
        checked: false,
        disabled: false,
        classList: { toggle() {} },
        appendChild() {},
        remove() {},
        getContext() {
            return {
                clearRect() {},
                createLinearGradient() { return { addColorStop() {} }; },
                createRadialGradient() { return { addColorStop() {} }; },
                fillRect() {},
                beginPath() {},
                arc() {},
                fill() {},
                ellipse() {},
                strokeRect() {},
                moveTo() {},
                lineTo() {},
                stroke() {},
            };
        },
    }, overrides);
}

function loadMainRuntime() {
    const elements = {
        playerCount: makeElement(),
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
        offlineNotice: makeElement(),
        pwaInstallBanner: makeElement(),
        titleScreen: makeElement(),
        gameScreen: makeElement(),
    };

    const localStorageData = new Map();
    const sentActions = [];
    const timeouts = [];
    const eventHandlers = {};
    const createdButtons = {
        '#onlineCreate button': makeElement(),
        '#onlineJoin button': makeElement(),
    };

    const context = {
        console,
        Math,
        elements,
        eventHandlers,
        localStorageData,
        timeouts,
        sentActions,
        document: {
            getElementById(id) {
                if (!elements[id]) elements[id] = makeElement();
                return elements[id];
            },
            querySelector(selector) {
                return createdButtons[selector] || null;
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
        localStorage: {
            getItem(key) { return localStorageData.has(key) ? localStorageData.get(key) : null; },
            setItem(key, value) { localStorageData.set(key, String(value)); },
            removeItem(key) { localStorageData.delete(key); },
        },
        setTimeout(fn) {
            timeouts.push(fn);
            return timeouts.length;
        },
        clearTimeout() {},
        stopConfetti() {},
        playSound() {},
        showConfirm(message, cb) { cb(); },
        resetStatsRecorded() {},
        resetOnlineState() {},
        resetFullLog() {},
        renderOnlinePlayerSettings() {},
        updateResumeButton() {},
        loadSettings() {},
        syncTutorialControls() {},
        render() {},
        switchTab() {},
        scheduleCPU() {},
        saveSettings() {},
        updateDiceDisplay() {},
        sendAction(action, data) { sentActions.push({ action, data }); },
        saveGameState() {},
        cancelAutoSkip() {},
        alert() {},
        fetch() { return Promise.resolve({ json: () => Promise.resolve({ hash: 'test' }) }); },
        io() { return { on() {}, emit() {}, disconnect() {} }; },
        enabledCards: new Set(),
        enabledLandmarks: new Set(),
        isOnlineGame: false,
        isReplaying: false,
        myPlayerIndex: 0,
        winSoundPlayed: false,
        LOG_TYPES: { SYSTEM: 'system' },
        GAME_PHASES: {
            ROLL: 'roll',
            SELECT_DICE: 'selectDice',
            REROLL_CONFIRM: 'rerollConfirm',
            HARBOR_CHOICE: 'harborChoice',
            PENDING: 'pending',
            BUILD: 'build',
        },
        LANDMARK_NAMES: {
            STATION: '駅',
            AIRPORT: '空港',
            YAKUSHO: '役所',
        },
        Player: {
            landmarkNames() { return ['駅', 'ショッピングモール', '遊園地', '電波塔', '港', '空港']; },
            landmarkCost() { return 4; },
        },
        CPU: class CPU {},
        GameManager: class GameManager {
            constructor(count) {
                this.players = Array.from({ length: count }, (_, i) => ({
                    name: `P${i + 1}`,
                    coins: 0,
                    cards: [],
                    landmarks: { 駅: false, 空港: false, 役所: false },
                    countCard() { return 0; },
                }));
                this.currentPlayerIndex = 0;
                this.phase = 'build';
                this.pendingRenovation = 0;
                this.builtThisTurn = false;
            }
            currentPlayer() { return this.players[this.currentPlayerIndex]; }
            nextTurn() { this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length; }
            checkWinner() { return null; }
            addLog() {}
        },
        CARDS: [
            { name: '麦畑', cost: 1, color: 'blue' },
            { name: '鉱山', cost: 6, color: 'green' },
        ],
        SHOP_STOCK: {},
    };
    context.global = context;
    vm.createContext(context);

    const appShellSource = fs.readFileSync(path.join(__dirname, '..', 'js/appShell.js'), 'utf8');
    vm.runInContext(appShellSource, context, { filename: 'js/appShell.js' });
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'js/main.js'), 'utf8');
    vm.runInContext(mainSource, context, { filename: 'js/main.js' });
    vm.runInContext(`
        this.__test = {
            elements,
            eventHandlers,
            localStorageData,
            sentActions,
            flushTimeouts: () => { while (timeouts.length) timeouts.shift()(); },
            setSelectedCount: (value) => { selectedCount = value; },
            getSelectedCount: () => selectedCount,
            setPlayerSettings: (value) => { playerSettings = value; },
            setGame: (value) => { game = value; },
            setCpuPlayers: (value) => { cpuPlayers = value; },
            setAutoSkipState: (pending, timeout) => { autoSkipPending = pending; autoSkipTimeout = timeout; },
            getAutoSkipPending: () => autoSkipPending,
            getCpuScheduleToken: () => cpuScheduleToken,
        };
    `, context);
    context.__test.elements = elements;
    return context;
}

function runTest(name, fn) {
    try {
        fn();
        console.log(`テスト成功: ${name}`);
    } catch (error) {
        console.error(`テスト失敗: ${name}`);
        console.error(error.stack);
        process.exitCode = 1;
    }
}

runTest('main changeCount は人数を2..10にクランプして表示を更新する', () => {
    const rt = loadMainRuntime();
    rt.__test.setSelectedCount(2);
    rt.__test.setPlayerSettings([{ type: 'human', difficulty: 'normal' }]);

    rt.changeCount(-5);
    assert.strictEqual(rt.__test.getSelectedCount(), 2);
    assert.strictEqual(rt.__test.elements.playerCount.textContent, 2);

    rt.changeCount(20);
    assert.strictEqual(rt.__test.getSelectedCount(), 10);
    assert.strictEqual(rt.__test.elements.playerCount.textContent, 10);
});

runTest('main renderPlayerSettings は AI（最強）オプションを表示する', () => {
    const rt = loadMainRuntime();
    rt.__test.setSelectedCount(2);
    rt.__test.setPlayerSettings([{ type: 'cpu', difficulty: 'expert' }, { type: 'human', difficulty: 'normal' }]);

    rt.renderPlayerSettings();

    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('AI（最強）'));
    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('value="expert"'));
});

runTest('main checkAutoSkip は建設不能時に nextTurn を送信する', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    game.builtThisTurn = false;
    game.pendingRenovation = 0;
    game.currentPlayer().coins = 0;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);
    rt.isOnlineGame = false;
    rt.myPlayerIndex = 0;

    rt.checkAutoSkip();
    rt.__test.flushTimeouts();

    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.deepStrictEqual(rt.__test.sentActions.map(x => x.action), ['nextTurn']);
    assert.strictEqual(rt.__test.getAutoSkipPending(), false);
});

runTest('main checkAutoSkip は無効化ランドマークしか残っていない場合も自動終了する', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    game.currentPlayer().coins = 10;
    game.currentPlayer().landmarks.駅 = false;
    game.currentPlayer().landmarks.空港 = false;
    rt.enabledLandmarks = new Set();
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);

    rt.checkAutoSkip();
    rt.__test.flushTimeouts();

    assert.deepStrictEqual(rt.__test.sentActions.map(x => x.action), ['nextTurn']);
});

runTest('main showCrashScreen はクラッシュ表示と保存データ復帰ボタンを出す', () => {
    const rt = loadMainRuntime();
    rt.localStorage.setItem('savedGame', '{"ok":true}');
    const beforeToken = rt.__test.getCpuScheduleToken();

    rt.showCrashScreen(new Error('boom'));

    assert.strictEqual(rt.__test.elements.crashScreen.style.display, 'flex');
    assert.ok(rt.__test.elements.crashMessage.textContent.includes('boom'));
    assert.strictEqual(rt.__test.elements.crashResumeBtn.style.display, 'block');
    assert.strictEqual(rt.__test.getCpuScheduleToken(), beforeToken + 1);
});

runTest('appShell updateOnlineTabState はオフライン時にオンライン操作を無効化する', () => {
    const rt = loadMainRuntime();
    rt.navigator.onLine = false;
    rt.updateOnlineTabState();

    assert.strictEqual(rt.__test.elements.offlineNotice.style.display, 'block');
    assert.strictEqual(rt.__test.elements.tabOnline.style.opacity, '0.4');
});

runTest('appShell bindPwaInstallHandlers は beforeinstallprompt を購読する', () => {
    const rt = loadMainRuntime();
    assert.ok(rt.__test.eventHandlers.beforeinstallprompt);
});

runTest('index.html は統計タブをオンラインタブの外に配置している', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const onlineStart = html.indexOf('<div id="tabContentOnline"');
    const statsStart = html.indexOf('<div id="tabContentStats"');
    const onlineStatus = html.indexOf('<div id="onlineStatus"');
    const gameScreen = html.indexOf('<div id="gameScreen"');

    assert.ok(onlineStart >= 0);
    assert.ok(statsStart >= 0);
    assert.ok(onlineStatus >= 0);
    assert.ok(gameScreen >= 0);
    assert.ok(onlineStart < onlineStatus);
    assert.ok(onlineStatus < statsStart);
    assert.ok(statsStart < gameScreen);
});

if (process.exitCode) {
    throw new Error('mainテストで失敗が発生しました');
}
