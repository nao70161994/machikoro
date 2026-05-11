const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSequenceRandom, createStorage, makeElement, runTest } = require('./helpers/test-utils');

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

    const sentActions = [];
    const timeouts = [];
    const eventHandlers = {};
    const counters = {
        renderOnlinePlayerSettings: 0,
        updateResumeButton: 0,
        loadSettings: 0,
        drawCitySkyline: 0,
        resumeGame: 0,
    };
    const { storage: localStorageData, localStorage } = createStorage();
    const createdButtons = {
        '#onlineCreate button': makeElement(),
        '#onlineJoin button': makeElement(),
    };

    const context = {
        console,
        Math,
        counters,
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
        localStorage,
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
        renderOnlinePlayerSettings() { counters.renderOnlinePlayerSettings++; },
        updateResumeButton() { counters.updateResumeButton++; },
        loadSettings() { counters.loadSettings++; },
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
            { name: 'スタジアム', cost: 6, color: 'purple' },
        ],
        SHOP_STOCK: {},
        getInitialCardStock(card, playerCount) {
            return card.color === 'purple' ? playerCount : 6;
        },
        drawCitySkyline() { counters.drawCitySkyline++; },
        resumeGame() { counters.resumeGame++; },
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
            setEnabledCards: (value) => { enabledCards = value; },
            setGame: (value) => { game = value; },
            getGame: () => game,
            getShopStock: () => SHOP_STOCK,
            setCpuPlayers: (value) => { cpuPlayers = value; },
            setAutoSkipState: (pending, timeout) => { autoSkipPending = pending; autoSkipTimeout = timeout; },
            getAutoSkipPending: () => autoSkipPending,
            getCpuScheduleToken: () => cpuScheduleToken,
            counters,
        };
    `, context);
    context.__test.elements = elements;
    return context;
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

runTest('main renderPlayerSettings は CPU（最強）オプションを表示する', () => {
    const rt = loadMainRuntime();
    rt.__test.setSelectedCount(2);
    rt.__test.setPlayerSettings([{ type: 'cpu', difficulty: 'expert' }, { type: 'human', difficulty: 'normal' }]);

    rt.renderPlayerSettings();

    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('CPU（最強）'));
    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('value="expert"'));
});

runTest('main renderPlayerSettings は学習AIの選択方針を説明する', () => {
    const rt = loadMainRuntime();
    rt.__test.setSelectedCount(2);
    rt.__test.setPlayerSettings([{ type: 'cpu', difficulty: 'rl' }, { type: 'human', difficulty: 'normal' }]);

    rt.renderPlayerSettings();

    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('2人用の複数モデルからランダム'));

    rt.__test.setSelectedCount(4);
    rt.__test.setPlayerSettings([
        { type: 'cpu', difficulty: 'rl' },
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.renderPlayerSettings();

    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('3〜4人用の深層学習モデルからランダム'));
});

runTest('main renderPlayerSettings は5人以上で学習AIを選択不可にする', () => {
    const rt = loadMainRuntime();
    rt.__test.setSelectedCount(5);
    rt.__test.setPlayerSettings([
        { type: 'cpu', difficulty: 'rl' },
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.renderPlayerSettings();

    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('value="rl" disabled'));
    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('value="expert" selected'));
    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('AI（深層学習）は別系統の学習CPUで、現在2〜4人戦のみ対応です'));
    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('安定したルールベースのCPU（最強）'));
});

runTest('main formatCpuSpeedLabel は超高速値を専用ラベルにする', () => {
    const rt = loadMainRuntime();

    assert.strictEqual(rt.formatCpuSpeedLabel(100), '超高速');
    assert.strictEqual(rt.formatCpuSpeedLabel(500), '0.5秒');
});

runTest('main renderPlayerSettings は人間プレイヤーに名前入力欄を表示する', () => {
    const rt = loadMainRuntime();
    rt.__test.setSelectedCount(2);
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal', name: '太郎' },
        { type: 'cpu', difficulty: 'strong', name: 'unused' },
    ]);

    rt.renderPlayerSettings();

    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('value="太郎"'));
    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('onChangePlayerName(0, this.value)'));
    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('CPU（強）として統計を記録'));
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

runTest('main checkAutoSkip は予約後にオンライン手番が変わったら送信しない', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    game.builtThisTurn = false;
    game.pendingRenovation = 0;
    game.currentPlayer().coins = 0;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);
    rt.isOnlineGame = true;
    rt.myPlayerIndex = 0;

    rt.checkAutoSkip();
    game.currentPlayerIndex = 1;
    rt.__test.flushTimeouts();

    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.deepStrictEqual(rt.__test.sentActions, []);
    assert.strictEqual(rt.__test.getAutoSkipPending(), false);
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

runTest('main init は固定乱数でプレイヤー順シャッフル後も名前設定を反映する', () => {
    const rt = loadMainRuntime();
    rt.Math.random = createSequenceRandom([0.9, 0.0, 0.0]);
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal', name: '花子' },
        { type: 'cpu', difficulty: 'strong', name: 'ignored' },
        { type: 'human', difficulty: 'normal', name: '太郎' },
    ]);
    rt.__test.setEnabledCards(new Set(['麦畑', '鉱山', 'スタジアム']));
    rt.enabledLandmarks = new Set(['駅', '空港']);

    rt.init(3);

    const names = rt.__test.getGame().players.map(player => player.name);
    assert.deepStrictEqual(names, ['CPU（強）', '花子', '太郎']);
    assert.strictEqual(rt.__test.getShopStock()['麦畑'], 6);
    assert.strictEqual(rt.__test.getShopStock()['スタジアム'], 3);
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

runTest('appShell pwaInstallDismiss はバナーを閉じて localStorage に記録する', () => {
    const rt = loadMainRuntime();
    rt.__test.elements.pwaInstallBanner.style.display = 'block';

    rt.pwaInstallDismiss();

    assert.strictEqual(rt.__test.elements.pwaInstallBanner.style.display, 'none');
    assert.strictEqual(rt.localStorage.getItem('pwaInstallDismissed'), '1');
});

runTest('appShell crashResume はクラッシュ画面を閉じて resumeGame を呼ぶ', () => {
    const rt = loadMainRuntime();
    rt.showCrashScreen(new Error('boom'));

    rt.crashResume();

    assert.strictEqual(rt.__test.elements.crashScreen.style.display, 'none');
    assert.strictEqual(rt.__test.counters.resumeGame, 1);
});

runTest('appShell bindCrashHandlers は error と rejection を crash 画面へ流す', () => {
    const rt = loadMainRuntime();

    rt.__test.eventHandlers.error({ message: 'sync boom' });
    assert.strictEqual(rt.__test.elements.crashScreen.style.display, 'flex');

    rt.crashResume();
    rt.__test.eventHandlers.unhandledrejection({ reason: new Error('async boom') });
    assert.ok(rt.__test.elements.crashMessage.textContent.includes('async boom'));
});

runTest('appShell initMainView は shell 初期化をまとめて呼ぶ', () => {
    const rt = loadMainRuntime();
    const before = { ...rt.__test.counters };

    rt.initMainView();

    assert.ok(rt.__test.counters.loadSettings >= before.loadSettings + 1);
    assert.ok(rt.__test.counters.renderOnlinePlayerSettings >= before.renderOnlinePlayerSettings + 1);
    assert.ok(rt.__test.counters.updateResumeButton >= before.updateResumeButton + 1);
    assert.ok(rt.__test.eventHandlers.resize);
});

runTest('index.html は統計タブをオンラインタブの外に配置している', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const onlineStart = html.indexOf('<div id="tabContentOnline"');
    const statsStart = html.indexOf('<div id="tabContentStats"');
    const localStart = html.indexOf('<div id="tabContentLocal"');
    const onlineStatus = html.indexOf('<div id="onlineStatus"');
    const gameScreen = html.indexOf('<div id="gameScreen"');
    const scriptStats = html.indexOf('<script src="js/stats.js"></script>');
    const scriptUi = html.indexOf('<script src="js/ui.js"></script>');
    const scriptMain = html.indexOf('<script src="js/main.js"></script>');

    assert.ok(localStart >= 0);
    assert.ok(onlineStart >= 0);
    assert.ok(statsStart >= 0);
    assert.ok(onlineStatus >= 0);
    assert.ok(gameScreen >= 0);
    assert.ok(scriptStats >= 0);
    assert.ok(scriptUi >= 0);
    assert.ok(scriptMain >= 0);
    assert.ok(localStart < onlineStart);
    assert.ok(onlineStart < onlineStatus);
    assert.ok(onlineStatus < statsStart);
    assert.ok(statsStart < gameScreen);
    assert.ok(scriptUi < scriptStats);
    assert.ok(scriptStats < scriptMain);
});

if (process.exitCode) {
    throw new Error('mainテストで失敗が発生しました');
}
