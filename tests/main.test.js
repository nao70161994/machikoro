const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSequenceRandom, createStorage, makeElement, runTest } = require('./helpers/test-utils');

function loadMainRuntime(options = {}) {
    const elements = {
        playerCount: makeElement(),
        playerSettings: makeElement(),
        cpuSpeed: makeElement({ value: '1500' }),
        speedLabel: makeElement(),
        resumeSection: makeElement(),
        onlineResumeSection: makeElement(),
        cityCanvas: makeElement(),
        crashScreen: makeElement({
            querySelector(selector) { return selector === '[data-ui-action="reloadPage"]' ? elements.crashReloadBtn : null; },
        }),
        crashMessage: makeElement(),
        crashResumeBtn: makeElement(),
        crashReloadBtn: makeElement(),
        tabOnline: makeElement(),
        offlineNotice: makeElement(),
        pwaInstallBanner: makeElement(),
        pwaUpdateBanner: makeElement({ style: { display: 'none' } }),
        diceChoose: makeElement({
            addEventListener(name, handler) { eventHandlers[`diceChoose:${name}`] = handler; },
        }),
        pendingMenu: makeElement({
            addEventListener(name, handler) { eventHandlers[`pendingMenu:${name}`] = handler; },
        }),
        buildMenu: makeElement({
            addEventListener(name, handler) { eventHandlers[`buildMenu:${name}`] = handler; },
        }),
        players: makeElement({
            addEventListener(name, handler) { eventHandlers[`players:${name}`] = handler; },
        }),
        onlineCreateSubmitButton: makeElement(),
        onlineJoinSubmitButton: makeElement(),
        titleScreen: makeElement(),
        gameScreen: makeElement(),
    };

    const sentActions = [];
    const timeouts = [];
    const alerts = [];
    const fetchCalls = [];
    const consoleErrors = [];
    const testConsole = {
        log() {},
        warn(...args) { consoleErrors.push(args); },
        error(...args) { consoleErrors.push(args); },
    };
    const eventHandlers = {};
    const eventAddCounts = {};
    const counters = {
        renderOnlinePlayerSettings: 0,
        updateResumeButton: 0,
        loadSettings: 0,
        drawCitySkyline: 0,
        resumeGame: 0,
    };
    const { storage: localStorageData, localStorage } = createStorage();
    if (options.pwaInstallDismissed) {
        localStorage.setItem('pwaInstallDismissed', '1');
    }

    const context = {
        console: testConsole,
        Math,
        counters,
        elements,
        eventHandlers,
        eventAddCounts,
        localStorageData,
        timeouts,
        alerts,
        sentActions,
        fetchCalls,
        consoleErrors,
        document: {
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
            addEventListener(name, handler) {
                eventAddCounts[`document:${name}`] = (eventAddCounts[`document:${name}`] || 0) + 1;
                eventHandlers[`document:${name}`] = handler;
            },
        },
        window: {
            innerWidth: 360,
            location: {
                href: 'https://example.test/play',
                reload() { context.reloadCount = (context.reloadCount || 0) + 1; },
            },
            MACHIKORO_CLIENT_VERSION: 'test-version',
            addEventListener(name, handler) {
                eventAddCounts[`window:${name}`] = (eventAddCounts[`window:${name}`] || 0) + 1;
                eventHandlers[name] = handler;
            },
            matchMedia() { return { matches: !!options.standalone }; },
        },
        navigator: { onLine: true, userAgent: options.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1' },
        localStorage,
        setTimeout(fn) {
            timeouts.push(fn);
            return timeouts.length;
        },
        clearTimeout() {},
        stopConfetti() { counters.stopConfetti = (counters.stopConfetti || 0) + 1; },
        playSound() {},
        showConfirm(message, cb) {
            if (typeof context.beforeConfirm === 'function') context.beforeConfirm(message);
            cb();
        },
        resetStatsRecorded() {},
        resetOnlineState() {},
        resetFullLog() {},
        renderOnlinePlayerSettings() { counters.renderOnlinePlayerSettings++; },
        updateResumeButton() { counters.updateResumeButton++; },
        loadSettings() { counters.loadSettings++; },
        syncTutorialControls() {},
        onToggleTutorial(enabled) { localStorage.setItem('tutorialEnabled', enabled ? 'true' : 'false'); },
        onChangeTutorialLevel(level) { localStorage.setItem('tutorialLevel', level); },
        render() {},
        switchTab() {},
        scheduleCPU() {},
        saveSettings() {},
        updateDiceDisplay() {},
        sendAction(action, data) { sentActions.push({ action, data }); },
        saveGameState() {},
        saveUndoState() {},
        cancelAutoSkip() {},
        alert(message) { alerts.push(message); },
        showNotice(message) { alerts.push(message); },
        bcSelectCard(btn, inputId) {
            const group = btn.closest('.bc-chip-group');
            if (group) group.querySelectorAll('.bc-chip').forEach(b => {
                b.classList.remove('selected');
                if (typeof b.setAttribute === 'function') b.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('selected');
            if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-pressed', 'true');
            context.document.getElementById(inputId).value = btn.dataset.idx;
        },
        fetch(url, options) {
            fetchCalls.push({ url, options });
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ hash: 'test' }) });
        },
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
        GAME_ACTIONS: {
            ROLL_DICE: 'rollDice',
            SELECT_DICE: 'selectDice',
            REROLL_DICE: 'rerollDice',
            SKIP_REROLL: 'skipReroll',
            RESOLVE_HARBOR: 'resolveHarbor',
            RESOLVE_TV: 'resolveTV',
            RESOLVE_BUSINESS: 'resolveBusiness',
            RESOLVE_CLEANING: 'resolveCleaning',
            RESOLVE_MOVER: 'resolveMover',
            RESOLVE_RENOVATION: 'resolveRenovation',
            RESOLVE_IT: 'resolveIT',
            BUILD_CARD: 'buildCard',
            BUILD_LANDMARK: 'buildLandmark',
            NEXT_TURN: 'nextTurn',
            UNDO_BUILD: 'undoBuild',
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
        CPU: class CPU {
            constructor(difficulty, options) {
                this.difficulty = difficulty;
                this.options = options;
            }
        },
        GameManager: class GameManager {
            static pendingActionsFor(game) {
                if (!game) return [];
                if (game.pendingIT) return [{ action: 'resolveIT', field: 'pendingIT', count: 1 }];
                if (game.phase !== 'pending') return [];
                const actions = [];
                const addPending = (field, action) => {
                    if (game[field] > 0) actions.push({ action, field, count: game[field] });
                };
                addPending('pendingTV', 'resolveTV');
                addPending('pendingBusiness', 'resolveBusiness');
                addPending('pendingCleaning', 'resolveCleaning');
                addPending('pendingMover', 'resolveMover');
                addPending('pendingRenovation', 'resolveRenovation');
                return actions;
            }
            static nextPendingActionFor(game) {
                return GameManager.pendingActionsFor(game)[0] || null;
            }
            static allowedActionsFor(game) {
                if (game.pendingIT || game.phase === 'pending') {
                    return new Set(GameManager.pendingActionsFor(game).map(pending => pending.action));
                }
                return new Set({
                    roll: ['rollDice'],
                    selectDice: ['selectDice'],
                    rerollConfirm: ['rerollDice', 'skipReroll'],
                    harborChoice: ['resolveHarbor'],
                    build: ['buildCard', 'buildLandmark', 'nextTurn', 'undoBuild'],
                }[game.phase] || []);
            }
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
            selectDiceCount(useTwo, d1, d2, tunaDice) {
                this.selectedDice = { useTwo, d1, d2, tunaDice };
            }
            buildCard(card) {
                this.builtCard = card.name;
                this.builtThisTurn = true;
                return true;
            }
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
        getShopStockCount(shopStock, card) {
            return shopStock?.[card.name] || 0;
        },
        setShopStockCount(shopStock, card, count) {
            shopStock[card.name] = count;
            return true;
        },
        decrementShopStock(shopStock, card) {
            if ((shopStock?.[card.name] || 0) <= 0) return false;
            shopStock[card.name]--;
            return true;
        },
        drawCitySkyline() { counters.drawCitySkyline++; },
        resumeGame() { counters.resumeGame++; },
        RLModelPortfolio: {
            supportsPlayerCount(playerCount) { return Number(playerCount) <= 10; },
            createRandomCpu(options) { return { difficulty: 'rl', options }; },
        },
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
            eventAddCounts,
            localStorageData,
            sentActions,
            alerts,
            fetchCalls,
            consoleErrors,
            flushTimeouts: () => { while (timeouts.length) timeouts.shift()(); },
            setSelectedCount: (value) => { selectedCount = value; },
            getSelectedCount: () => selectedCount,
            setPlayerSettings: (value) => { playerSettings = value; },
            getPlayerSettings: () => playerSettings,
            setEnabledCards: (value) => { enabledCards = value; },
            setGame: (value) => { game = value; },
            getGame: () => game,
            getShopStock: () => SHOP_STOCK,
            setCpuPlayers: (value) => { cpuPlayers = value; },
            getCpuPlayers: () => cpuPlayers,
            setAutoSkipState: (pending, timeout) => { autoSkipPending = pending; autoSkipTimeout = timeout; },
            getAutoSkipPending: () => autoSkipPending,
            getCpuScheduleToken: () => cpuScheduleToken,
            scheduleCPU: () => scheduleCPU(),
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
    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('data-ui-change="localPlayerType"'));
    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('aria-label="プレイヤー1の種類"'));
    assert.ok(!rt.__test.elements.playerSettings.innerHTML.includes('onchange="onChangePlayerType'));
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

    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('多人数用の深層学習モデルから選び'));
});

runTest('main renderPlayerSettings は5人以上でも学習AIを選択できる', () => {
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

    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('value="rl" selected'));
    assert.ok(!rt.__test.elements.playerSettings.innerHTML.includes('value="rl" disabled'));
    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('脅威度上位3人の相手を見て判断します'));
});

runTest('main formatCpuSpeedLabel は超高速値を専用ラベルにする', () => {
    const rt = loadMainRuntime();

    assert.strictEqual(rt.formatCpuSpeedLabel(100), '超高速');
    assert.strictEqual(rt.formatCpuSpeedLabel(500), '0.5秒');
});

runTest('main restartGame はゲーム状態とUI lockを未開始状態へ完全リセットする', () => {
    const rt = loadMainRuntime();
    rt.startGame();
    assert.ok(rt.__test.getGame());

    rt.localStorage.setItem('savedGame', 'old');
    rt.localStorage.setItem('onlineSession', 'old-online');
    rt.localStorage.setItem('onlineGameStart', 'old-game-start');
    rt.localStorage.setItem('onlineActionLog', 'old-action-log');
    rt.localStorage.setItem('onlineStateSnapshot', 'old-state-snapshot');
    rt.localStorage.setItem('onlinePendingAction', 'old-pending-action');
    rt.localStorage.setItem('machikoroFreezeSnapshot', 'old-freeze');
    rt.localStorage.setItem('machikoroLifecycleStartSent', JSON.stringify({ signature: 'local|2|0', timestamp: Date.now() }));
    rt.__test.elements.gameScreen.style.display = 'block';
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');
    rt.__test.elements.titleScreen.inert = true;
    rt.__test.elements.titleScreen.setAttribute('aria-hidden', 'true');
    rt.document.getElementById('confirmModal').style.display = 'flex';
    rt.document.getElementById('pendingModal').style.display = 'flex';
    rt.document.body.classList.add('modal-open');
    rt.__test.setAutoSkipState(true, 123);
    const tokenBefore = rt.__test.getCpuScheduleToken();

    rt.restartGame();

    assert.strictEqual(rt.__test.getGame(), null);
    assert.strictEqual(rt.localStorage.getItem('savedGame'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineSession'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineGameStart'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineActionLog'), null);
    assert.strictEqual(rt.localStorage.getItem('onlineStateSnapshot'), null);
    assert.strictEqual(rt.localStorage.getItem('onlinePendingAction'), null);
    assert.strictEqual(rt.localStorage.getItem('machikoroFreezeSnapshot'), null);
    assert.strictEqual(rt.localStorage.getItem('machikoroLifecycleStartSent'), null);
    assert.strictEqual(rt.__test.elements.gameScreen.style.display, 'none');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(rt.__test.elements.titleScreen.style.display, 'block');
    assert.strictEqual(rt.__test.elements.titleScreen.inert, false);
    assert.strictEqual(rt.__test.elements.titleScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(rt.document.getElementById('confirmModal').style.display, 'none');
    assert.strictEqual(rt.document.getElementById('pendingModal').style.display, 'none');
    assert.strictEqual(rt.document.body.classList.contains('modal-open'), false);
    assert.strictEqual(rt.__test.getAutoSkipPending(), false);
    assert.ok(rt.__test.getCpuScheduleToken() > tokenBefore);
    assert.ok(rt.counters.stopConfetti >= 1);
});

runTest('main restart後のstartGameは古いgameScreen lockを引き継がず開始通知を再送できる', () => {
    const rt = loadMainRuntime();
    rt.startGame();
    assert.strictEqual(rt.fetchCalls.filter(call => call.url === '/api/game-lifecycle').length, 1);

    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');
    rt.__test.elements.gameScreen.style.display = 'none';
    rt.localStorage.setItem('machikoroFreezeSnapshot', 'old-freeze');
    rt.restartGame();
    rt.startGame();

    assert.ok(rt.__test.getGame());
    assert.strictEqual(rt.__test.elements.gameScreen.style.display, 'block');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(rt.__test.elements.titleScreen.style.display, 'none');
    assert.strictEqual(rt.localStorage.getItem('machikoroFreezeSnapshot'), null);
    assert.strictEqual(rt.fetchCalls.filter(call => call.url === '/api/game-lifecycle').length, 2);
});

runTest('main createCpuPlayer は live v2simple 明示時も v2 既定modeを補う', () => {
    const rt = loadMainRuntime();
    const cpu = rt.createCpuPlayer('expert', {
        expertPurpose: "live",
        expertPreset: "v2simple",
    });

    assert.strictEqual(cpu.options.expertDiceMode, "strongCrowdThreshold");
    assert.strictEqual(cpu.options.expertRerollMode, "simple");
    assert.strictEqual(cpu.options.expertBuildMode, "ev");
    assert.strictEqual(cpu.options.expertBusinessMode, "simple");
    assert.strictEqual(cpu.options.expertComboMode, "core");
    assert.strictEqual(cpu.options.expertBuildTempoWeight, 0.03);
    assert.strictEqual(cpu.options.expertAirportSkipMode, "whenNoLandmark");
});

runTest('main createCpuPlayer は live expert 未指定presetを v2simple 既定modeにする', () => {
    const rt = loadMainRuntime();
    const cpu = rt.createCpuPlayer('expert', {
        expertPurpose: "live",
    });

    assert.strictEqual(cpu.options.expertPreset, "v2simple");
    assert.strictEqual(cpu.options.expertDiceMode, "strongCrowdThreshold");
    assert.strictEqual(cpu.options.expertRerollMode, "simple");
    assert.strictEqual(cpu.options.expertBuildMode, "ev");
    assert.strictEqual(cpu.options.expertBusinessMode, "simple");
    assert.strictEqual(cpu.options.expertComboMode, "core");
    assert.strictEqual(cpu.options.expertBuildTempoWeight, 0.03);
    assert.strictEqual(cpu.options.expertAirportSkipMode, "whenNoLandmark");
});

runTest('main createCpuPlayer は live CPU（最強）を v2simple 凍結候補に固定する', () => {
    const rt = loadMainRuntime();
    const cpu = rt.createCpuPlayer('expert', {
        expertPurpose: "live",
    });

    assert.strictEqual(cpu.options.expertPreset, "v2simple");
    assert.strictEqual(cpu.options.expertDiceMode, "strongCrowdThreshold");
    assert.strictEqual(cpu.options.expertRerollMode, "simple");
    assert.strictEqual(cpu.options.expertBuildMode, "ev");
    assert.strictEqual(cpu.options.expertInvestMode, "always");
    assert.strictEqual(cpu.options.expertTvMode, "simple");
    assert.strictEqual(cpu.options.expertBusinessMode, "simple");
    assert.notStrictEqual(cpu.options.expertBusinessMode, "harmfulGift");
    assert.strictEqual(cpu.options.expertCleaningMode, "simple");
    assert.strictEqual(cpu.options.expertHarborMode, "simple");
    assert.strictEqual(cpu.options.expertMoverMode, "simple");
    assert.strictEqual(cpu.options.expertRenovationMode, "simple");
    assert.strictEqual(cpu.options.expertComboMode, "core");
    assert.strictEqual(cpu.options.expertBuildTempoWeight, 0.03);
    assert.strictEqual(cpu.options.expertAirportSkipMode, "whenNoLandmark");
    assert.notStrictEqual(cpu.options.expertAirportSkipMode, "never");
});

runTest('main createCpuPlayer は live v2simple の明示modeを上書きしない', () => {
    const rt = loadMainRuntime();
    const cpu = rt.createCpuPlayer('expert', {
        expertPurpose: "live",
        expertPreset: "v2simple",
        expertBusinessMode: "simple",
        expertBuildTempoWeight: 0.2,
        expertAirportSkipMode: "none",
    });

    assert.strictEqual(cpu.options.expertBusinessMode, "simple");
    assert.strictEqual(cpu.options.expertBuildTempoWeight, 0.2);
    assert.strictEqual(cpu.options.expertAirportSkipMode, "none");
});

runTest('main createCpuPlayer は5人以上でも学習AIを生成する', () => {
    const rt = loadMainRuntime();

    const cpu = rt.createCpuPlayer('rl', { playerCount: 5, expertPurpose: "live" });

    assert.strictEqual(cpu.difficulty, 'rl');
    assert.strictEqual(cpu.options.playerCount, 5);
    assert.strictEqual(cpu.options.expertPurpose, "live");
    assert.deepStrictEqual(rt.__test.alerts, []);
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
    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('data-ui-input="localPlayerName"'));
    assert.ok(rt.__test.elements.playerSettings.innerHTML.includes('data-player-index="0"'));
    assert.ok(!rt.__test.elements.playerSettings.innerHTML.includes('onChangePlayerName('));
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
    assert.deepStrictEqual(rt.__test.sentActions, []);
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

    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.deepStrictEqual(rt.__test.sentActions, []);
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

runTest('main scheduleCPU は不正なTV targetを合法な相手へfallbackして解決する', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.PENDING;
    game.pendingTV = 1;
    game.players[0].cards = [{ name: 'テレビ局', category: '大施設' }];
    game.players[1].cards = [{ name: '麦畑', category: '農園' }];
    game.resolveTV = (targetIndex) => {
        game.resolvedTV = targetIndex;
        game.pendingTV = 0;
        game.phase = rt.GAME_PHASES.BUILD;
        return true;
    };
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([{
        chooseTVTarget() { return 0; },
        chooseBusinessMove() { return null; },
        chooseCleaningTarget() { return null; },
        chooseMoverMove() { return null; },
        chooseRenovationTarget() { return null; },
        chooseITInvest() { return false; },
        chooseDiceCount() { return false; },
        chooseReroll() { return false; },
        chooseHarbor() { return false; },
        build() {},
    }, null]);
    rt.isOnlineGame = false;

    rt.__test.scheduleCPU();
    rt.__test.flushTimeouts();

    assert.strictEqual(game.resolvedTV, 1);
    assert.deepStrictEqual(rt.__test.sentActions, []);
});

runTest('main scheduleCPU は不正なcleaning targetを盤面上の合法カードへfallbackする', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.PENDING;
    game.pendingCleaning = 1;
    game.players[0].cards = [{ name: '清掃業', category: '大施設' }];
    game.players[1].cards = [{ name: '麦畑', category: '農園' }];
    game.players[1].isDormant = () => false;
    game.resolveCleaning = (cardName) => {
        game.resolvedCleaning = cardName;
        game.pendingCleaning = 0;
        game.phase = rt.GAME_PHASES.BUILD;
        return true;
    };
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([{
        chooseTVTarget() { return null; },
        chooseBusinessMove() { return null; },
        chooseCleaningTarget() { return '存在しない施設'; },
        chooseMoverMove() { return null; },
        chooseRenovationTarget() { return null; },
        chooseITInvest() { return false; },
        chooseDiceCount() { return false; },
        chooseReroll() { return false; },
        chooseHarbor() { return false; },
        build() {},
    }, null]);

    rt.__test.scheduleCPU();
    rt.__test.flushTimeouts();

    assert.strictEqual(game.resolvedCleaning, '麦畑');
    assert.deepStrictEqual(rt.__test.sentActions, []);
});

runTest('main fallback pending は queue 先頭actionだけを見る', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
    assert.ok(source.includes('GameManager.nextPendingActionFor(game)'));
    assert.ok(source.includes('pendingAction === GAME_ACTIONS.RESOLVE_CLEANING'));
    assert.ok(!source.includes('pendingActions.has(GAME_ACTIONS.RESOLVE_CLEANING)'));
});

runTest('main scheduleCPU はCPUターンの pendingIT をpending handlerで自動解決する', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.PENDING;
    game.pendingIT = true;
    game.pendingBusiness = 1;
    game.players[0].coins = 3;
    game.players[0].cards = [{ name: 'ITベンチャー', effect: 'itstartup' }];
    game.resolveIT = (doSave) => {
        game.resolvedIT = doSave;
        game.pendingIT = false;
        game.currentPlayerIndex = 1;
        game.phase = rt.GAME_PHASES.ROLL;
        return true;
    };
    let chooseITInvestCalls = 0;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([{
        chooseTVTarget() { return 1; },
        chooseBusinessMove() { return null; },
        chooseCleaningTarget() { return null; },
        chooseMoverMove() { return null; },
        chooseRenovationTarget() { return null; },
        chooseITInvest() { chooseITInvestCalls++; return false; },
        chooseDiceCount() { return false; },
        chooseReroll() { return false; },
        chooseHarbor() { return false; },
        build() { throw new Error('pendingIT should resolve before build'); },
    }, null]);
    rt.isOnlineGame = false;

    rt.__test.scheduleCPU();
    rt.__test.flushTimeouts();

    assert.strictEqual(chooseITInvestCalls, 1);
    assert.strictEqual(game.pendingIT, false);
    assert.strictEqual(game.resolvedIT, false);
    assert.strictEqual(game.pendingBusiness, 1);
    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'scheduleCPU-pending-resolution' && entry.details.action === 'resolveIT'));
    assert.deepStrictEqual(rt.__test.sentActions, []);
});

runTest('main scheduleCPU はローカルCPU build failureをpass扱いでnextTurnへ進める', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    let buildCalls = 0;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([{
        chooseTVTarget() { return 1; },
        chooseBusinessMove() { return null; },
        chooseCleaningTarget() { return null; },
        chooseMoverMove() { return null; },
        chooseRenovationTarget() { return null; },
        chooseITInvest() { return false; },
        chooseDiceCount() { return false; },
        chooseReroll() { return false; },
        chooseHarbor() { return false; },
        build() { buildCalls++; return false; },
    }, null]);

    rt.__test.scheduleCPU();
    rt.__test.flushTimeouts();

    assert.strictEqual(buildCalls, 1);
    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.deepStrictEqual(rt.__test.sentActions, []);
});

runTest('main onSelectDiceCount は遅延中にオンライン手番が変わったら送信しない', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.SELECT_DICE;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);
    rt.isOnlineGame = true;
    rt.myPlayerIndex = 0;

    rt.onSelectDiceCount(false);
    game.currentPlayerIndex = 1;
    rt.__test.flushTimeouts();

    assert.strictEqual(game.selectedDice, undefined);
    assert.deepStrictEqual(rt.__test.sentActions, []);
});

runTest('main init は遅延中のdice選択callbackを無効化する', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.SELECT_DICE;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);
    rt.isOnlineGame = true;
    rt.myPlayerIndex = 0;

    rt.onSelectDiceCount(false);
    rt.isOnlineGame = false;
    rt.init(2);
    rt.__test.flushTimeouts();

    assert.deepStrictEqual(rt.__test.sentActions, []);
    assert.strictEqual(rt.__test.getGame().selectedDice, undefined);
});

runTest('main onReroll は phase が変わっていたら送信しない', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);
    rt.isOnlineGame = true;
    rt.myPlayerIndex = 0;

    rt.onReroll();

    assert.deepStrictEqual(rt.__test.sentActions, []);
});

runTest('main onBuildCard はconfirm後に phase が変わったら送信しない', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    game.currentPlayer().coins = 3;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);
    rt.isOnlineGame = true;
    rt.myPlayerIndex = 0;
    rt.SHOP_STOCK['麦畑'] = 6;
    rt.beforeConfirm = () => {
        game.phase = rt.GAME_PHASES.ROLL;
    };

    rt.onBuildCard('麦畑');

    assert.strictEqual(game.builtCard, undefined);
    assert.deepStrictEqual(rt.__test.sentActions, []);
});

runTest('main onBuildCard はconfirm後にオンライン手番が変わったら送信しない', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    game.currentPlayer().coins = 3;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);
    rt.isOnlineGame = true;
    rt.myPlayerIndex = 0;
    rt.SHOP_STOCK['麦畑'] = 6;
    rt.beforeConfirm = () => {
        game.currentPlayerIndex = 1;
    };

    rt.onBuildCard('麦畑');

    assert.strictEqual(game.builtCard, undefined);
    assert.deepStrictEqual(rt.__test.sentActions, []);
});

runTest('main onSkip はオンラインで自分の手番でなければローカル適用しない', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    game.currentPlayerIndex = 1;
    game.players[1].landmarks.空港 = false;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);
    rt.isOnlineGame = true;
    rt.myPlayerIndex = 0;

    rt.onSkip();

    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.deepStrictEqual(rt.__test.sentActions, []);
});

runTest('main showCrashScreen はクラッシュ表示と保存データ復帰ボタンを出す', () => {
    const rt = loadMainRuntime();
    rt.localStorage.setItem('savedGame', '{"ok":true}');
    const beforeToken = rt.__test.getCpuScheduleToken();

    rt.showCrashScreen(new Error('boom'));

    assert.strictEqual(rt.__test.elements.crashScreen.style.display, 'flex');
    assert.ok(rt.__test.elements.crashMessage.textContent.includes('boom'));
    assert.strictEqual(rt.__test.elements.crashResumeBtn.style.display, 'block');
    assert.strictEqual(rt.__test.elements.crashResumeBtn.focused, true);
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
    assert.deepStrictEqual(Array.from(rt.__test.getCpuPlayers()[0].options.expertOpponentDifficulties), ['strong', 'human', 'human']);
    assert.strictEqual(rt.__test.getShopStock()['麦畑'], 6);
    assert.strictEqual(rt.__test.getShopStock()['スタジアム'], 3);
});

runTest('main init は10人開始時に不足設定を補い学習AIを維持する', () => {
    const rt = loadMainRuntime();
    rt.Math.random = () => 0;
    rt.__test.setPlayerSettings([
        { type: 'cpu', difficulty: 'rl', name: 'unused' },
        { type: 'cpu', difficulty: 'strong', name: 'unused' },
    ]);
    rt.__test.setEnabledCards(new Set(['麦畑', 'スタジアム']));
    rt.enabledLandmarks = new Set(['駅', '空港']);

    rt.init(10);

    const game = rt.__test.getGame();
    assert.strictEqual(game.players.length, 10);
    assert.ok(game.players.every(player => !player.name.includes('NaN')));
    assert.strictEqual(rt.__test.getShopStock()['スタジアム'], 10);
    const cpuDifficulties = rt.__test.getCpuPlayers().filter(Boolean).map(cpu => cpu.difficulty).sort().join(',');
    assert.strictEqual(cpuDifficulties, 'rl,strong');
    assert.deepStrictEqual(rt.__test.alerts, []);
});

runTest('main delegated/static UI handler は重複登録しない', () => {
    const rt = loadMainRuntime();
    const documentHandlerCounts = () => Object.fromEntries(
        Object.entries(rt.__test.eventAddCounts).filter(([key]) => key.startsWith('document:'))
    );
    assert.deepStrictEqual(documentHandlerCounts(), {
        'document:click': 1,
        'document:input': 1,
        'document:change': 1,
        'document:keydown': 1,
    });

    rt.bindStaticUiHandlers();
    rt.bindDelegatedUiHandlers();

    assert.deepStrictEqual(documentHandlerCounts(), {
        'document:click': 1,
        'document:input': 1,
        'document:change': 1,
        'document:keydown': 1,
    });
});

runTest('main static UI handler は data-ui-action/input/change を処理する', () => {
    const rt = loadMainRuntime();

    rt.__test.eventHandlers['document:click']({
        preventDefault() {},
        target: {
            disabled: false,
            dataset: { uiAction: 'changeCount', delta: '1' },
            closest() { return this; },
        },
    });
    assert.strictEqual(rt.__test.getSelectedCount(), 3);

    rt.__test.eventHandlers['document:input']({
        target: {
            value: '100',
            dataset: { uiInput: 'cpuSpeed' },
            closest() { return this; },
        },
    });
    assert.strictEqual(rt.__test.elements.speedLabel.textContent, '超高速');

    rt.__test.eventHandlers['document:change']({
        target: {
            checked: false,
            dataset: { uiChange: 'toggleTutorialEnabled' },
            closest() { return this; },
        },
    });
    assert.strictEqual(rt.localStorage.getItem('tutorialEnabled'), 'false');

    rt.__test.setPlayerSettings([{ type: 'human', difficulty: 'normal', name: 'Alice' }]);
    rt.__test.eventHandlers['document:change']({
        target: {
            value: 'strong',
            dataset: { uiChange: 'localPlayerType', playerIndex: '0' },
            closest() { return this; },
        },
    });
    assert.strictEqual(rt.__test.getPlayerSettings()[0].type, 'cpu');
    assert.strictEqual(rt.__test.getPlayerSettings()[0].difficulty, 'strong');

    rt.__test.eventHandlers['document:input']({
        target: {
            value: '新名',
            dataset: { uiInput: 'localPlayerName', playerIndex: '0' },
            closest() { return this; },
        },
    });
    assert.strictEqual(rt.__test.getPlayerSettings()[0].name, '新名');
});

runTest('main static UI handler は role button の Enter/Space を処理する', () => {
    const rt = loadMainRuntime();
    let prevented = false;
    rt.__test.eventHandlers['document:keydown']({
        key: 'Enter',
        preventDefault() { prevented = true; },
        target: {
            disabled: false,
            dataset: { uiAction: 'changeCount', delta: '1' },
            getAttribute(name) { return name === 'role' ? 'button' : null; },
            closest() { return this; },
        },
    });

    assert.strictEqual(prevented, true);
    assert.strictEqual(rt.__test.getSelectedCount(), 3);
});

runTest('main delegated handler は dice choice action を呼ぶ', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.HARBOR_CHOICE;
    game.lastDiceResult = 8;
    let resolvedBonus = null;
    game.resolveHarbor = (useBonus) => { resolvedBonus = useBonus; };
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);

    rt.__test.eventHandlers['diceChoose:click']({
        preventDefault() {},
        target: {
            disabled: false,
            dataset: { action: 'resolveHarbor', useBonus: 'true' },
            closest() { return this; },
        },
    });

    assert.strictEqual(resolvedBonus, true);
});

runTest('main delegated handler は Business Center chip 選択を hidden input へ反映する', () => {
    const rt = loadMainRuntime();
    const removed = [];
    const added = [];
    const ariaUpdates = [];
    const sibling = {
        classList: { remove(value) { removed.push(value); } },
        setAttribute(name, value) { ariaUpdates.push({ target: 'sibling', name, value }); },
    };
    const button = {
        disabled: false,
        dataset: { action: 'selectBusinessCard', idx: '2', inputId: 'myCardSelect' },
        classList: { add(value) { added.push(value); } },
        setAttribute(name, value) { ariaUpdates.push({ target: 'button', name, value }); },
        closest(selector) {
            if (selector === '[data-action]') return this;
            if (selector === '.bc-chip-group') return { querySelectorAll() { return [sibling]; } };
            return null;
        },
    };
    rt.__test.elements.myCardSelect = { value: '0' };

    rt.__test.eventHandlers['pendingMenu:click']({ preventDefault() {}, target: button });

    assert.deepStrictEqual(removed, ['selected']);
    assert.deepStrictEqual(added, ['selected']);
    assert.deepStrictEqual(ariaUpdates, [
        { target: 'sibling', name: 'aria-pressed', value: 'false' },
        { target: 'button', name: 'aria-pressed', value: 'true' },
    ]);
    assert.strictEqual(rt.__test.elements.myCardSelect.value, '2');
});

runTest('main delegated handler は data-action から pending action を呼ぶ', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.PENDING;
    game.pendingTV = 1;
    let resolvedTarget = null;
    game.resolveTV = (targetIndex) => { resolvedTarget = targetIndex; };
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);

    rt.__test.eventHandlers['pendingMenu:click']({
        preventDefault() {},
        target: {
            disabled: false,
            dataset: { action: 'resolveTV', targetIndex: '1' },
            closest() { return this; },
        },
    });

    assert.strictEqual(resolvedTarget, 1);
});

runTest('main delegated handler は build menu action を呼ぶ', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    game.currentPlayer().coins = 10;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);
    rt.__test.getShopStock()['麦畑'] = 6;

    rt.__test.eventHandlers['buildMenu:click']({
        preventDefault() {},
        target: {
            disabled: false,
            dataset: { action: 'buildCard', cardName: '麦畑' },
            closest() { return this; },
        },
    });

    assert.strictEqual(game.builtCard, '麦畑');
});

runTest('appShell updateOnlineTabState はオフライン時にオンライン操作を無効化する', () => {
    const rt = loadMainRuntime();
    rt.navigator.onLine = false;
    rt.updateOnlineTabState();

    assert.strictEqual(rt.__test.elements.offlineNotice.style.display, 'block');
    assert.strictEqual(rt.__test.elements.tabOnline.style.opacity, '0.4');
    assert.strictEqual(rt.__test.elements.onlineCreateSubmitButton.disabled, true);
    assert.strictEqual(rt.__test.elements.onlineJoinSubmitButton.disabled, true);

    rt.navigator.onLine = true;
    rt.updateOnlineTabState();

    assert.strictEqual(rt.__test.elements.offlineNotice.style.display, 'none');
    assert.strictEqual(rt.__test.elements.tabOnline.style.opacity, '');
    assert.strictEqual(rt.__test.elements.onlineCreateSubmitButton.disabled, false);
    assert.strictEqual(rt.__test.elements.onlineJoinSubmitButton.disabled, false);
});

runTest('appShell bindPwaInstallHandlers は beforeinstallprompt を購読する', () => {
    const rt = loadMainRuntime();
    assert.ok(rt.__test.eventHandlers.beforeinstallprompt);
});

runTest('appShell beforeinstallprompt は標準promptを止めてバナーから実行する', () => {
    const rt = loadMainRuntime();
    let prevented = false;
    let prompted = false;
    const event = {
        preventDefault() { prevented = true; },
        prompt() { prompted = true; },
        userChoice: { then(callback) { callback(); } },
    };

    rt.__test.eventHandlers.beforeinstallprompt(event);
    assert.strictEqual(prevented, true);
    assert.strictEqual(rt.__test.elements.pwaInstallBanner.style.display, 'block');
    assert.strictEqual(rt.document.body.classList.contains('pwa-banner-open'), true);

    rt.pwaInstallPrompt();
    assert.strictEqual(prompted, true);
    assert.strictEqual(rt.__test.elements.pwaInstallBanner.style.display, 'none');
    assert.strictEqual(rt.document.body.classList.contains('pwa-banner-open'), false);
});

runTest('appShell beforeinstallprompt は更新バナー表示中のinstallバナー重複を抑止する', () => {
    const rt = loadMainRuntime();
    let prevented = false;
    const event = {
        preventDefault() { prevented = true; },
        prompt() {},
        userChoice: { then() {} },
    };

    rt.__test.elements.pwaUpdateBanner.style.display = 'block';
    rt.__test.eventHandlers.beforeinstallprompt(event);

    assert.strictEqual(prevented, true);
    assert.notStrictEqual(rt.__test.elements.pwaInstallBanner.style.display, 'block');
    assert.strictEqual(rt.document.body.classList.contains('pwa-banner-open'), true);
});

runTest('main delegated handler は pwaApplyUpdate 不在でもreloadへfallbackする', () => {
    const rt = loadMainRuntime();
    rt.pwaApplyUpdate = undefined;

    rt.__test.eventHandlers['document:click']({
        target: {
            disabled: false,
            dataset: { uiAction: 'pwaApplyUpdate' },
            closest(selector) { return selector === '[data-ui-action]' ? this : null; },
        },
        preventDefault() {},
    });

    assert.strictEqual(rt.reloadCount, 1);
});

runTest('appShell hidePwaUpdateBanner は保留中のinstall promptを再表示する', () => {
    const rt = loadMainRuntime();
    let prompted = false;
    const event = {
        preventDefault() {},
        prompt() { prompted = true; },
        userChoice: { then(callback) { callback(); } },
    };

    rt.__test.elements.pwaUpdateBanner.style.display = 'block';
    rt.__test.eventHandlers.beforeinstallprompt(event);
    rt.__test.eventHandlers['document:click']({
        target: {
            disabled: false,
            dataset: { uiAction: 'hidePwaUpdateBanner' },
            closest(selector) { return selector === '[data-ui-action]' ? this : null; },
        },
        preventDefault() {},
    });

    assert.strictEqual(rt.__test.elements.pwaUpdateBanner.style.display, 'none');
    assert.strictEqual(rt.__test.elements.pwaInstallBanner.style.display, 'block');
    rt.pwaInstallPrompt();
    assert.strictEqual(prompted, true);
});

runTest('appShell bindPwaInstallHandlers は standalone では購読しない', () => {
    const standalone = loadMainRuntime({ standalone: true });
    assert.strictEqual(standalone.__test.eventHandlers.beforeinstallprompt, undefined);
});

runTest('appShell pwaInstallDismiss はバナーを閉じて localStorage に記録する', () => {
    const rt = loadMainRuntime();
    rt.__test.elements.pwaInstallBanner.style.display = 'block';

    rt.pwaInstallDismiss();

    assert.strictEqual(rt.__test.elements.pwaInstallBanner.style.display, 'none');
    assert.strictEqual(rt.localStorage.getItem('pwaInstallDismissed'), '1');
});

runTest('appShell beforeinstallprompt はdismiss後の同一セッション再表示を抑止する', () => {
    const rt = loadMainRuntime();
    let prevented = false;
    const event = {
        preventDefault() { prevented = true; },
        prompt() {},
        userChoice: { then() {} },
    };

    rt.pwaInstallDismiss();
    rt.__test.eventHandlers.beforeinstallprompt(event);

    assert.strictEqual(prevented, true);
    assert.notStrictEqual(rt.__test.elements.pwaInstallBanner.style.display, 'block');
});

runTest('appShell beforeinstallprompt はdismiss済み起動でも標準promptを抑止する', () => {
    const rt = loadMainRuntime({ pwaInstallDismissed: true });
    let prevented = false;
    const event = {
        preventDefault() { prevented = true; },
        prompt() {},
        userChoice: { then() {} },
    };

    rt.__test.eventHandlers.beforeinstallprompt(event);

    assert.strictEqual(prevented, true);
    assert.notStrictEqual(rt.__test.elements.pwaInstallBanner.style.display, 'block');
});

runTest('appShell crashResume はクラッシュ画面を閉じて resumeGame を呼ぶ', () => {
    const rt = loadMainRuntime();
    rt.showCrashScreen(new Error('boom'));

    rt.crashResume();

    assert.strictEqual(rt.__test.elements.crashScreen.style.display, 'none');
    assert.strictEqual(rt.__test.counters.resumeGame, 1);
});

runTest('appShell bindCrashHandlers は error と rejection を crash 画面へ流し通知する', () => {
    const rt = loadMainRuntime();
    rt.__test.setGame({ phase: 'build' });

    rt.__test.eventHandlers.error({ message: 'sync boom', filename: 'js/ui.js', lineno: 12, colno: 3 });
    assert.strictEqual(rt.__test.elements.crashScreen.style.display, 'flex');
    assert.strictEqual(rt.__test.fetchCalls[0].url, '/api/client-error');
    const syncReport = JSON.parse(rt.__test.fetchCalls[0].options.body);
    assert.strictEqual(syncReport.message, 'sync boom');
    assert.strictEqual(syncReport.filename, 'js/ui.js');
    assert.strictEqual(syncReport.line, 12);
    assert.strictEqual(syncReport.column, 3);
    assert.strictEqual(syncReport.phase, 'build');
    assert.strictEqual(syncReport.appVersion, 'test-version');
    assert.strictEqual(syncReport.url, 'https://example.test/play');
    assert.ok(syncReport.userAgent.includes('iPhone'));

    rt.crashResume();
    rt.__test.eventHandlers.unhandledrejection({ reason: new Error('async boom') });
    assert.ok(rt.__test.elements.crashMessage.textContent.includes('async boom'));
    assert.strictEqual(rt.__test.fetchCalls.length, 2);
});

runTest('appShell console.error hook は最小限のクライアントエラー通知を送る', () => {
    const rt = loadMainRuntime();
    const before = rt.__test.fetchCalls.length;

    rt.console.error(new Error('logged boom'));

    assert.strictEqual(rt.__test.fetchCalls.length, before + 1);
    const report = JSON.parse(rt.__test.fetchCalls[before].options.body);
    assert.strictEqual(report.source, 'console.error');
    assert.strictEqual(report.message, 'logged boom');
    assert.ok(report.stack.includes('logged boom'));
});

runTest('appShell initMainView は shell 初期化をまとめて呼ぶ', () => {
    const rt = loadMainRuntime();
    const before = { ...rt.__test.counters };

    rt.initMainView();
    rt.initMainView();

    assert.ok(rt.__test.counters.loadSettings >= before.loadSettings + 2);
    assert.ok(rt.__test.counters.renderOnlinePlayerSettings >= before.renderOnlinePlayerSettings + 2);
    assert.ok(rt.__test.counters.updateResumeButton >= before.updateResumeButton + 2);
    assert.ok(rt.__test.eventHandlers.resize);
    assert.strictEqual(rt.__test.eventAddCounts['window:resize'], 1);
    assert.strictEqual(rt.__test.eventAddCounts['window:online'], 1);
    assert.strictEqual(rt.__test.eventAddCounts['window:offline'], 1);
    assert.strictEqual(rt.__test.eventAddCounts['window:beforeinstallprompt'], 1);
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

runTest('onlineStatus はライブリージョンとして宣言されている', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('id="onlineStatus" class="online-status" role="status" aria-live="polite" aria-atomic="true"'));
});

runTest('card detail button はタッチ向けhit areaを持つ', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    const match = css.match(/\.card-detail-btn\s*{([\s\S]*?)}/);
    assert.ok(match);
    assert.ok(match[1].includes('width: 36px;'));
    assert.ok(match[1].includes('height: 36px;'));
});

runTest('player setting select は local/online とも programmatic label を持つ', () => {
    const main = fs.readFileSync(path.join(__dirname, '..', 'js/main.js'), 'utf8');
    const online = fs.readFileSync(path.join(__dirname, '..', 'js/online.js'), 'utf8');

    assert.ok(main.includes('aria-label=\"プレイヤー${i + 1}の種類\"'));
    assert.ok(online.includes('aria-label=\"プレイヤー${i + 1}の種類\"'));
});

runTest('主要HTML/JSには inline handler 属性を再導入しない', () => {
    const files = [
        'index.html',
        'js/main.js',
        'js/ui.js',
        'js/online.js',
        'js/stats.js',
    ];
    for (const file of files) {
        const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        assert.ok(!/on(?:click|change|input)=/.test(source), `inline handler attribute found in ${file}`);
    }
});

runTest('index.html のbrowser-global script orderは主要依存順を維持する', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(match => match[1]);
    const indexOf = (script) => {
        const index = scripts.indexOf(script);
        assert.ok(index >= 0, `missing script: ${script}`);
        return index;
    };
    const assertBefore = (before, after) => {
        assert.ok(indexOf(before) < indexOf(after), `${before} must load before ${after}`);
    };

    assertBefore('js/Card.js', 'js/GameManager.js');
    assertBefore('js/Player.js', 'js/GameManager.js');
    assertBefore('js/GameManager.js', 'js/CPU.js');
    assertBefore('js/cpuTuning.js', 'js/CPU.js');
    assertBefore('js/cpuDiagnostics.js', 'js/CPU.js');
    assertBefore('js/cpuEvaluationCache.js', 'js/CPU.js');
    assertBefore('js/CPU.js', 'js/RLCPU.js');
    assertBefore('js/RLModelPortfolio.js', 'js/online.js');
    assertBefore('js/uiNotice.js', 'js/ui.js');
    assertBefore('js/ui.js', 'js/storage.js');
    assertBefore('js/storage.js', 'js/appShell.js');
    assertBefore('js/appShell.js', 'js/main.js');
    assertBefore('js/stats.js', 'js/main.js');
});

runTest('Service Worker STATIC_ASSETS は index.html のJS読み込みと同期している', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const scriptAssets = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)]
        .map(match => '/' + match[1]);

    for (const asset of scriptAssets) {
        assert.ok(sw.includes(`'${asset}'`), `missing STATIC_ASSETS entry: ${asset}`);
    }
});

runTest('公開タイトル変更後のロゴ/PWA/公開ページはダイスシティで一貫し折り返し対策を持つ', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    const privacy = fs.readFileSync(path.join(__dirname, '..', 'privacy.html'), 'utf8');
    const rules = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8');
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    const riskPlan = fs.readFileSync(path.join(__dirname, '..', 'docs/RISK_REDUCTION_PLAN.md'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    const webmanifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
    const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const ntfyDocs = fs.readFileSync(path.join(__dirname, '..', 'docs/NTFY_ERROR_REPORTING.md'), 'utf8');
    const publicSurfaces = [html, privacy, rules, readme, riskPlan, ntfyDocs].join('\n');

    assert.ok(html.includes('<title>ダイスシティ</title>'));
    assert.ok(html.includes('<h1>ダイスシティ</h1>'));
    const titleScreen = html.slice(html.indexOf('<div id="titleScreen"'), html.indexOf('<div id="gameScreen"'));
    const pwaBanners = html.slice(html.indexOf('<div id="pwaUpdateBanner"'), html.indexOf('<script src="js/Card.js"></script>'));
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(titleScreen));
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(pwaBanners));
    assert.ok(!titleScreen.includes('?? ルール'));
    assert.ok(!titleScreen.includes('?? ローカル'));
    assert.ok(!pwaBanners.includes('??'));
    assert.ok(html.includes('data-ui-action="showRules">ルール</button>'));
    assert.ok(html.includes('id="tabLocal" role="tab" aria-selected="true" aria-controls="tabContentLocal">ローカル</button>'));
    assert.ok(html.includes('<span class="pwa-banner-icon">更新</span>'));
    assert.ok(html.includes('<span class="pwa-banner-icon">追加</span>'));
    assert.ok(html.includes('content="ダイスシティ'));
    assert.ok(privacy.includes('<title>プライバシーポリシー - ダイスシティ</title>'));
    assert.ok(rules.includes('<title>ルール - ダイスシティ</title>'));
    assert.strictEqual(manifest.name, 'ダイスシティ');
    assert.strictEqual(manifest.short_name, 'ダイスシティ');
    assert.strictEqual(manifest.start_url, '/');
    assert.strictEqual(manifest.display, 'standalone');
    assert.deepStrictEqual(manifest.icons.map((icon) => icon.src).sort(), ['/icons/icon-192.png', '/icons/icon-512.png']);
    assert.ok(manifest.icons.every((icon) => icon.purpose === 'any maskable'));
    assert.strictEqual(webmanifest.name, 'ダイスシティ');
    assert.strictEqual(webmanifest.short_name, 'ダイスシティ');
    assert.strictEqual(webmanifest.start_url, '/');
    assert.strictEqual(webmanifest.display, 'standalone');
    assert.deepStrictEqual(webmanifest.icons.map((icon) => icon.src).sort(), ['/icons/icon-192.png', '/icons/icon-512.png']);
    assert.ok(webmanifest.icons.every((icon) => icon.purpose === 'any maskable'));
    assert.ok(html.includes('<link rel="apple-touch-icon" href="/icons/icon-192.png">'));
    assert.ok(css.includes('.title-header h1'));
    assert.ok(css.includes('font-size: clamp(24px, 9vw, 52px);'));
    assert.ok(css.includes('white-space: nowrap;'));
    assert.ok(css.includes('letter-spacing: clamp(1px, 0.8vw, 6px);'));
    assert.ok(css.includes('.title-logo-sub'));
    assert.ok(css.includes('font-size: clamp(9px, 2.8vw, 11px);'));
    assert.ok(!publicSurfaces.includes('街コロ'));
    assert.ok(!publicSurfaces.includes('[Machikoro]'));
    assert.ok(!publicSurfaces.includes('Machikoro ntfy'));
    assert.ok(!server.includes('[Machikoro]'));
    assert.ok(server.includes('[ダイスシティ] Client Error'));
    assert.ok(riskPlan.includes('2026-05-26 Title Logo Layout Update'));
    assert.ok(riskPlan.includes('2026-05-26 Public Name Final Audit'));
});
runTest('PWA と TWA の更新検知に必要な安全弁がある', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const uiSource = fs.readFileSync(path.join(__dirname, '..', 'js/ui.js'), 'utf8');
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'js/main.js'), 'utf8');
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/build-apk.yml'), 'utf8');

    assert.ok(html.includes('refreshingByServiceWorker'));
    assert.ok(html.includes('let hadServiceWorkerController = !!navigator.serviceWorker.controller;'));
    assert.ok(html.includes('hadServiceWorkerController = true;'));
    assert.ok(html.includes('let updateRequestedByUser = false;'));
    assert.ok(html.includes('let _versionMismatchDetected = false;'));
    assert.ok(html.includes('function refreshPwaUpdateState()'));
    assert.ok(html.includes('function checkClientVersionMismatch()'));
    assert.ok(html.includes("fetch('/api/version',"));
    assert.ok(html.includes("cache: 'no-store'"));
    assert.ok(html.includes('client-version-mismatch'));
    assert.ok(html.includes('reportClientError({'));
    assert.ok(html.includes('window.__machikoroCheckVersionMismatch = checkClientVersionMismatch;'));
    assert.ok(html.includes('window.refreshPwaUpdateState = refreshPwaUpdateState;'));
    assert.ok(html.includes('if (_isInGame() && !updateRequestedByUser) {\n            _showPwaUpdateBanner();\n            return;\n          }'));
    assert.ok(html.includes('updateRequestedByUser = true;'));
    assert.ok(html.includes('_forceVersionReload();'));
    assert.ok(html.includes('caches.keys()'));
    assert.ok(mainSource.includes("if (typeof refreshPwaUpdateState === 'function') refreshPwaUpdateState();"));
    assert.ok(html.includes('id="pwaUpdateBanner" class="pwa-banner" role="region" aria-labelledby="pwaUpdateMsg"'));
    assert.ok(html.includes('id="pwaUpdateMsg" aria-live="polite" aria-atomic="true"'));
    assert.ok(html.includes('id="pwaInstallBanner" class="pwa-banner" role="status" aria-live="polite" aria-atomic="true"'));
    assert.ok(html.includes('aria-label="ルール説明を閉じる"'));
    assert.ok(html.includes('aria-label="カード選択を閉じる"'));
    assert.ok(html.includes('aria-label="カード詳細を閉じる"'));
    assert.ok(html.includes('id="noticeToast" class="notice-toast" role="status" aria-live="polite"'));
    assert.ok(html.includes('id="pendingModal" class="pending-modal" role="region" aria-label="追加効果の選択" aria-live="polite"'));
    assert.ok(!html.includes('id="pendingModal" class="pending-modal" role="dialog" aria-modal="true"'));
    assert.ok(html.includes('role="dialog" aria-modal="true" aria-labelledby="rulesModalTitle"'));
    assert.ok(html.includes('role="dialog" aria-modal="true" aria-labelledby="cardSelectModalTitle"'));
    assert.ok(html.includes('data-action="toggleSet" data-set="basic"'));
    assert.ok(html.includes('data-action="closeCardSelect"'));
    assert.ok(!html.includes('onclick="toggleSet'));
    assert.ok(!html.includes('onclick="closeCardSelect'));
    assert.ok(html.includes('role="dialog" aria-modal="true" aria-labelledby="cardDetailTitle"'));
    assert.ok(html.includes('role="dialog" aria-modal="true" aria-labelledby="confirmMessage"'));
    assert.ok(html.includes('id="onlineCreateSubmitButton"'));
    assert.ok(html.includes('id="onlineJoinSubmitButton"'));
    assert.ok(html.includes("msg.textContent = message || '新しいバージョンがあります';"));
    assert.ok(html.includes('btn.disabled = false;'));
    assert.ok(html.includes("btn.style.opacity = '';"));
    assert.ok(html.includes('data-ui-action="showRules"'));
    assert.ok(html.includes('class="log-header" data-ui-action="toggleLog" role="button" tabindex="0" aria-expanded="true"'));
    assert.ok(html.includes('data-ui-action="switchTab" data-tab="online"'));
    assert.ok(html.includes('for="cpuSpeed"'));
    assert.ok(html.includes('aria-describedby="speedLabel"'));
    assert.ok(html.includes('for="onlineCpuSpeed"'));
    assert.ok(html.includes('aria-describedby="onlineSpeedLabel"'));
    assert.ok(html.includes('for="playerNameInput"'));
    assert.ok(html.includes('for="roomIdInput"'));
    assert.ok(html.includes('aria-label="保存データを削除"'));
    assert.ok(html.includes('aria-label="オンライン再接続データを削除"'));
    assert.ok(html.includes('id="offlineNotice" class="offline-notice" role="status" aria-live="polite"'));
    assert.ok(html.includes('id="crashScreen" role="alertdialog" aria-modal="true" aria-labelledby="crashTitle" tabindex="-1"'));
    assert.ok(html.includes('id="crashTitle" class="crash-title"'));
    assert.ok(html.includes('class="tab-bar" role="tablist" aria-label="ゲームモード"'));
    assert.ok(html.includes('id="tabLocal" role="tab" aria-selected="true" aria-controls="tabContentLocal"'));
    assert.ok(html.includes('id="tabContentLocal" class="tab-content" role="tabpanel" aria-labelledby="tabLocal"'));
    assert.ok(html.includes('class="online-tabs" role="tablist" aria-label="オンライン操作"'));
    assert.ok(html.includes('id="onlineTabCreate" role="tab" aria-selected="true" aria-controls="onlineCreate"'));
    assert.ok(html.includes('id="onlineCreate" role="tabpanel" aria-labelledby="onlineTabCreate"'));
    assert.ok(html.includes('aria-label="更新通知を閉じる"'));
    assert.ok(html.includes('aria-label="インストール案内を閉じる"'));
    assert.ok(html.includes('aria-label="チュートリアル表示を切り替える"'));
    assert.ok(html.includes('aria-label="チュートリアルの詳しさ"'));
    assert.ok(html.includes('data-ui-input="cpuSpeed"'));
    assert.ok(html.includes('data-ui-change="toggleTutorialEnabled"'));
    assert.ok(!html.includes('onclick='));
    assert.ok(!html.includes('oninput='));
    assert.ok(!html.includes('onchange='));
    assert.ok(css.includes('--z-pwa-banner: 500;'));
    assert.ok(css.includes('--z-pending-modal: 600;'));
    assert.ok(css.includes('--z-modal: 1000;'));
    assert.ok(css.includes('#pwaUpdateBanner'));
    assert.ok(css.includes('z-index: var(--z-pwa-banner);'));
    assert.ok(css.includes('body.pwa-banner-open #gameScreen'));
    assert.ok(css.indexOf('max-height: min(calc(100vh - 24px), 70vh);') < css.indexOf('max-height: min(calc(100dvh - 24px), 70dvh);'));
    assert.ok(css.includes('calc(12px + env(safe-area-inset-bottom, 0px))'));
    assert.ok(css.includes('z-index: var(--z-modal);'));
    assert.ok(css.includes(':focus-visible'));
    assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
    assert.ok(css.includes('.notice-toast'));
    assert.ok(css.includes('body.modal-open'));
    assert.ok(css.includes('body.modal-open #titleScreen'));
    assert.ok(uiSource.includes('function isVisibleFocusableElement'));
    assert.ok(uiSource.includes("header.setAttribute('aria-expanded'"));
    assert.ok(css.includes('overscroll-behavior: contain'));
    assert.ok(sw.includes("event.data?.type === 'SKIP_WAITING'"));
    assert.ok(sw.includes("const CACHE_NAME = 'machikoro-v4';"));
    const indexScripts = [...html.matchAll(/<script src=\"(js\/[^\"]+)\"/g)].map(match => `/${match[1]}`);
    const cachedAssets = [...sw.matchAll(/'([^']+)'/g)].map(match => match[1]);
    for (const script of indexScripts) {
        assert.ok(cachedAssets.includes(script), `${script} is missing from service worker cache`);
    }
    const releaseGateIndex = workflow.indexOf('APK build 前リリースゲート');
    const buildIndex = workflow.indexOf('bubblewrap build');
    assert.ok(releaseGateIndex >= 0);
    assert.ok(buildIndex >= 0);
    assert.ok(releaseGateIndex < buildIndex);
    assert.ok(workflow.includes('npm run test:static'));
    assert.ok(workflow.includes('npm run test:pwa'));
    assert.ok(workflow.includes('npm run test:release'));
    assert.ok(workflow.includes('test -s app-release-signed.apk'));
    assert.ok(workflow.includes('if-no-files-found: error'));
});

runTest('公開ページはOGP/Twitter preview用メタ情報と画像を持つ', () => {
    const pages = [
        { file: 'index.html', title: 'ダイスシティ', type: 'website' },
        { file: 'rules.html', title: 'ルール - ダイスシティ', type: 'article' },
        { file: 'privacy.html', title: 'プライバシーポリシー - ダイスシティ', type: 'article' }
    ];

    for (const page of pages) {
        const html = fs.readFileSync(path.join(__dirname, '..', page.file), 'utf8');
        const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));

        assert.ok(html.includes('<html lang="ja">'));
        assert.ok(head.includes(`<title>${page.title}</title>`));
        assert.ok(head.includes('<link rel="stylesheet" href="style.css">'));
        assert.ok(head.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">'));
        assert.strictEqual((head.match(/<meta name="robots"/g) || []).length, 1);
        assert.ok(head.includes('<meta name="robots" content="index,follow">'));
        assert.ok(!head.includes('noindex'));
        assert.ok(!head.includes('machikoro-9jv2.onrender.com'));
        assert.ok(!head.includes('localhost'));
        const getMetaContent = (pattern) => {
            const match = head.match(pattern);
            assert.ok(match, 'missing meta in ' + page.file + ': ' + pattern);
            return match[1];
        };
        const countMeta = (pattern) => (head.match(pattern) || []).length;
        assert.strictEqual(countMeta(/<meta name="description"/g), 1);
        assert.strictEqual(countMeta(/<meta property="og:title"/g), 1);
        assert.strictEqual(countMeta(/<meta property="og:description"/g), 1);
        assert.strictEqual(countMeta(/<meta property="og:image"/g), 1);
        assert.strictEqual(countMeta(/<meta property="og:image:width"/g), 1);
        assert.strictEqual(countMeta(/<meta property="og:image:height"/g), 1);
        assert.strictEqual(countMeta(/<meta property="og:image:alt"/g), 1);
        assert.strictEqual(countMeta(/<meta name="twitter:card"/g), 1);
        assert.strictEqual(countMeta(/<meta name="twitter:title"/g), 1);
        assert.strictEqual(countMeta(/<meta name="twitter:description"/g), 1);
        assert.strictEqual(countMeta(/<meta name="twitter:image"/g), 1);
        assert.strictEqual(countMeta(/<meta name="twitter:image:alt"/g), 1);
        const description = getMetaContent(/<meta name="description" content="([^"]+)">/);
        const ogDescription = getMetaContent(/<meta property="og:description" content="([^"]+)">/);
        const twitterDescription = getMetaContent(/<meta name="twitter:description" content="([^"]+)">/);
        const ogImage = getMetaContent(/<meta property="og:image" content="([^"]+)">/);
        const twitterImage = getMetaContent(/<meta name="twitter:image" content="([^"]+)">/);
        assert.strictEqual(ogImage, '/icons/icon-512.png');
        assert.strictEqual(twitterImage, '/icons/icon-512.png');
        assert.ok(!/^https?:\/\//.test(ogImage));
        assert.ok(!/^https?:\/\//.test(twitterImage));
        const previewDescriptions = [description, ogDescription, twitterDescription];
        assert.ok(description.length > 20);
        assert.ok(description.length <= 160);
        assert.ok(ogDescription.length <= 160);
        assert.ok(twitterDescription.length <= 160);
        assert.ok(head.includes('<meta property="og:site_name" content="ダイスシティ">'));
        assert.ok(head.includes(`<meta property="og:type" content="${page.type}">`));
        assert.ok(head.includes(`<meta property="og:title" content="${page.title}">`));
        assert.ok(head.includes('<meta property="og:description"'));
        assert.ok(head.includes('<meta property="og:image" content="/icons/icon-512.png">'));
        assert.ok(head.includes('<meta property="og:image:width" content="512">'));
        assert.ok(head.includes('<meta property="og:image:height" content="512">'));
        assert.ok(head.includes('<meta property="og:image:alt" content="ダイスシティのアプリアイコン">'));
        assert.ok(head.includes('<meta name="twitter:card" content="summary">'));
        assert.ok(head.includes(`<meta name="twitter:title" content="${page.title}">`));
        assert.ok(head.includes('<meta name="twitter:description"'));
        assert.ok(head.includes('<meta name="twitter:image" content="/icons/icon-512.png">'));
        assert.ok(head.includes('<meta name="twitter:image:alt" content="ダイスシティのアプリアイコン">'));
        if (page.file === 'index.html') {
            for (const previewDescription of previewDescriptions) {
                assert.ok(previewDescription.includes('登録不要'));
            }
        }
        if (page.file === 'rules.html') {
            for (const previewDescription of previewDescriptions) {
                assert.ok(previewDescription.includes('アカウント登録なし'));
                assert.ok(previewDescription.includes('勝利条件'));
                assert.ok(previewDescription.includes('カード選択'));
                assert.ok(previewDescription.includes('保存と再開'));
            }
        }
        if (page.file === 'privacy.html') {
            for (const previewDescription of previewDescriptions) {
                assert.ok(previewDescription.includes('アカウント登録不要'));
                assert.ok(previewDescription.includes('エラー通知'));
                assert.ok(previewDescription.includes('AdSense審査'));
                assert.ok(previewDescription.includes('広告'));
            }
        }
    }

    assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons/icon-512.png')));
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons/icon-192.png')));
});

runTest('AdSense 審査コードはhead内に1回だけ読み込まれる', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    const matches = [...html.matchAll(/<script[^>]+pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-8683516545883768[^>]*><\/script>/g)];

    assert.strictEqual(matches.length, 1);
    assert.ok(head.includes(matches[0][0]));
    assert.ok(/<script\s+async\s+src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-8683516545883768"[\s\S]*crossorigin="anonymous"><\/script>/.test(matches[0][0]));
});
runTest('広告 placeholder は許可された画面だけに配置される', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const docs = fs.readFileSync(path.join(__dirname, '..', 'docs/ADS_PLAN.md'), 'utf8');
    const releaseChecklist = fs.readFileSync(path.join(__dirname, '..', 'docs/RELEASE_CHECKLIST.md'), 'utf8');
    const adsenseSetup = fs.readFileSync(path.join(__dirname, '..', 'docs/ADSENSE_SETUP.md'), 'utf8');
    const operations = fs.readFileSync(path.join(__dirname, '..', 'docs/OPERATIONS.md'), 'utf8');
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    const privacy = fs.readFileSync(path.join(__dirname, '..', 'privacy.html'), 'utf8');
    const rules = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8');
    const { AD_SLOT_CONFIGS, renderAdSlot } = require('../js/adSlots.js');

    assert.deepStrictEqual(Object.keys(AD_SLOT_CONFIGS).sort(), ['result-bottom', 'rules-bottom', 'title-bottom']);
    assert.ok(html.includes('id="adSlotTitleBottom" class="ad-slot-host" data-ad-slot-host="title-bottom"'));
    assert.ok(html.includes('id="adSlotRulesBottom" class="ad-slot-host" data-ad-slot-host="rules-bottom"'));
    assert.ok(html.includes('href="privacy.html"'));
    assert.ok(html.includes('href="rules.html"'));
    const titleAdIndex = html.indexOf('id="adSlotTitleBottom"');
    const legalLinksIndex = html.indexOf('class="legal-links" aria-label="サイト情報"');
    const gameScreenIndex = html.indexOf('<div id="gameScreen"');
    assert.ok(titleAdIndex > 0);
    assert.ok(legalLinksIndex > titleAdIndex);
    assert.ok(legalLinksIndex < gameScreenIndex);
    const countMatches = (source, pattern) => (source.match(pattern) || []).length;
    assert.strictEqual(countMatches(html, /<nav class="legal-links" aria-label="サイト情報">/g), 1);
    const legalLinksEndIndex = html.indexOf('</nav>', legalLinksIndex);
    const legalLinksHtml = html.slice(legalLinksIndex, legalLinksEndIndex);
    assert.deepStrictEqual([...legalLinksHtml.matchAll(/href="([^"]+)"/g)].map((match) => match[1]), ['rules.html', 'privacy.html']);
    assert.deepStrictEqual([...legalLinksHtml.matchAll(/<a href="[^"]+">([^<]+)<\/a>/g)].map((match) => match[1]), ['ルール', 'プライバシーポリシー']);
    assert.ok(!legalLinksHtml.includes('target="_blank"'));
    assert.ok(!legalLinksHtml.includes('download'));
    assert.strictEqual(countMatches(rules, /<main class="static-page-content">/g), 1);
    assert.strictEqual(countMatches(privacy, /<main class="static-page-content">/g), 1);
    assert.strictEqual(countMatches(rules, /<h1>/g), 1);
    assert.strictEqual(countMatches(privacy, /<h1>/g), 1);
    assert.strictEqual(countMatches(rules, /<nav class="static-page-links" aria-label="関連ページ">/g), 1);
    assert.strictEqual(countMatches(privacy, /<nav class="static-page-links" aria-label="関連ページ">/g), 1);
    assert.ok(rules.trim().endsWith('</html>'));
    assert.ok(privacy.trim().endsWith('</html>'));
    assert.ok(rules.includes('<body class="static-page">'));
    assert.ok(rules.includes('class="static-page-links" aria-label="関連ページ"'));
    assert.ok(rules.includes('<a href="/">ゲームへ戻る</a>'));
    assert.ok(rules.includes('<main class="static-page-content">'));
    assert.ok(rules.includes('<p class="static-page-eyebrow">ダイスシティ</p>'));
    assert.ok(rules.includes('<h1>ルール</h1>'));
    assert.ok(rules.includes('<h2>勝利条件</h2>'));
    assert.ok(rules.includes('<h2>はじめて遊ぶ方へ</h2>'));
    assert.ok(rules.includes('アカウント登録なしでブラウザから遊び始められます。'));
    assert.ok(rules.includes('<h2>保存と再開</h2>'));
    assert.ok(rules.includes('<h2>ターンの流れ</h2>'));
    assert.ok(rules.includes('<h2>カードの色</h2>'));
    assert.ok(rules.includes('<h2>発動順序</h2>'));
    assert.ok(rules.includes('<h2>ランドマーク</h2>'));
    assert.ok(rules.includes('<a href="privacy.html">プライバシーポリシー</a>'));
    assert.ok(privacy.includes('<body class="static-page">'));
    assert.ok(privacy.includes('<main class="static-page-content">'));
    assert.ok(privacy.includes('<p class="static-page-eyebrow">ダイスシティ</p>'));
    assert.ok(privacy.includes('<h1>プライバシーポリシー</h1>'));
    assert.ok(privacy.includes('<h2>取得する情報</h2>'));
    assert.ok(privacy.includes('<h2>エラー通知</h2>'));
    assert.ok(privacy.includes('<h2>広告について</h2>'));
    assert.ok(privacy.includes('<h2>保存データの削除</h2>'));
    assert.ok(privacy.includes('<h2>お問い合わせ</h2>'));
    assert.ok(privacy.includes('class="static-page-links" aria-label="関連ページ"'));
    assert.ok(privacy.includes('<a href="/">ゲームへ戻る</a>'));
    assert.ok(privacy.includes('<a href="rules.html">ルール</a>'));
    assert.ok(!privacy.includes('data-ad-slot-host'));
    assert.ok(!rules.includes('data-ad-slot-host'));
    assert.ok(!privacy.includes('<script'));
    assert.ok(!rules.includes('<script'));
    assert.ok(!privacy.includes(' style='));
    assert.ok(!rules.includes(' style='));
    for (const staticPage of [privacy, rules]) {
        assert.ok(!staticPage.includes(' id="'));
        assert.ok(!staticPage.includes('data-'));
        assert.ok(!staticPage.includes('data-ui-action'));
        assert.ok(!/\son[a-z]+=/.test(staticPage));
        assert.ok(!staticPage.includes(' src="'));
        assert.ok(!staticPage.includes('http-equiv="refresh"'));
        assert.ok(!staticPage.includes("http-equiv='refresh'"));
        assert.ok(!staticPage.includes('<button'));
        assert.ok(!staticPage.includes('<input'));
        assert.ok(!staticPage.includes('<select'));
        assert.ok(!staticPage.includes('<textarea'));
        assert.ok(!staticPage.includes('<form'));
        assert.ok(!staticPage.includes('<iframe'));
        assert.ok(!staticPage.includes('<embed'));
        assert.ok(!staticPage.includes('<object'));
        assert.ok(!staticPage.includes('<canvas'));
        assert.ok(!staticPage.includes('role="button"'));
        assert.ok(!staticPage.includes('aria-live'));
        assert.ok(!staticPage.includes('aria-busy'));
        assert.ok(!staticPage.includes('aria-disabled'));
        assert.ok(!staticPage.includes('aria-modal'));
        assert.ok(!staticPage.includes('inert'));
        assert.ok(!staticPage.includes('hidden'));
        assert.ok(!staticPage.includes('target="_blank"'));
        assert.ok(!staticPage.includes('download'));
    }
    const getHrefs = (pageSource) => [...pageSource.matchAll(/href="([^"]+)"/g)]
        .map((match) => match[1])
        .sort();
    assert.deepStrictEqual(getHrefs(rules), ['/', 'privacy.html', 'style.css']);
    assert.deepStrictEqual(getHrefs(privacy), ['/', 'rules.html', 'style.css']);
    assert.ok(!privacy.includes('adsbygoogle.js'));
    assert.ok(!rules.includes('adsbygoogle.js'));
    assert.ok(html.includes('<script src="js/adSlots.js"></script>'));
    assert.ok(sw.includes("'/js/adSlots.js'"));
    assert.ok(sw.includes("'/privacy.html'"));
    assert.ok(sw.includes("'/rules.html'"));
    assert.ok(css.includes('.ad-slot'));
    assert.ok(css.includes('pointer-events: none;'));
    assert.ok(css.includes('.legal-links'));
    assert.ok(css.includes('.static-page section + section'));
    assert.ok(css.includes('width: min(100%, 720px);'));
    assert.ok(css.includes('.static-page-links a:focus-visible'));
    assert.ok(css.includes('padding: 4px 0;'));
    assert.ok(privacy.includes('広告審査中および広告表示時'));
    assert.ok(privacy.includes('Google AdSense'));
    assert.ok(privacy.includes('審査用スクリプト'));
    assert.ok(privacy.includes('実際の広告ユニット'));
    assert.ok(privacy.includes('アカウント登録'));
    assert.ok(privacy.includes('メールアドレス'));
    assert.ok(privacy.includes('Cookie'));
    assert.ok(privacy.includes('ブラウザ設定'));
    assert.ok(privacy.includes('最終更新日: 2026-05-27'));
    assert.ok(rules.includes('最終更新日: 2026-05-27'));
    assert.ok(privacy.includes('エラー'));
    assert.ok(privacy.includes('再接続トークン'));
    assert.ok(privacy.includes('保存データ全体'));
    assert.ok(privacy.includes('完全なスナップショット'));
    assert.ok(privacy.includes('ブラウザのサイトデータ削除'));
    assert.ok(privacy.includes('アプリ内の保存データ削除操作'));
    assert.ok(privacy.includes('公開リポジトリの issue'));
    assert.ok(rules.includes('勝利'));
    assert.ok(rules.includes('ランドマークをすべて建設'));
    assert.ok(rules.includes('はじめて遊ぶ方へ'));
    assert.ok(rules.includes('タイトル画面でプレイ人数'));
    assert.ok(rules.includes('ローカル対戦'));
    assert.ok(rules.includes('オンライン対戦'));
    assert.ok(rules.includes('ルームを作る'));
    assert.ok(rules.includes('ルームID'));
    assert.ok(rules.includes('ルームに参加'));
    assert.ok(rules.includes('カード選択'));
    assert.ok(rules.includes('今回使う施設カード'));
    assert.ok(rules.includes('サイコロを振り'));
    assert.ok(rules.includes('コインを集め'));
    assert.ok(rules.includes('建設フェーズ'));
    assert.ok(rules.includes('保存と再開'));
    assert.ok(rules.includes('タイトル画面から続きが再開'));
    assert.ok(rules.includes('同じ端末から再接続'));

    const titleSlot = renderAdSlot('title-bottom');
    const rulesSlot = renderAdSlot('rules-bottom');
    const resultSlot = renderAdSlot('result-bottom');
    assert.ok(titleSlot.includes('data-ad-location="title-bottom"'));
    assert.ok(rulesSlot.includes('data-ad-location="rules-bottom"'));
    assert.ok(resultSlot.includes('data-ad-location="result-bottom"'));
    for (const slot of [titleSlot, rulesSlot, resultSlot]) {
        assert.ok(slot.includes('広告枠'));
        assert.ok(!slot.includes('今すぐ'));
        assert.ok(!slot.includes('報酬'));
    }
    assert.strictEqual(renderAdSlot('game-action'), '');
    assert.ok(docs.includes('AdSense / AdMob'));
    assert.ok(docs.includes('`title-bottom`'));
    assert.ok(docs.includes('`rules-bottom`'));
    assert.ok(docs.includes('`result-bottom`'));
    assert.ok(docs.includes('公開用の `rules.html` には広告 placeholder を配置しない'));
    assert.ok(docs.includes('privacy.html` は広告の説明だけを置く静的ページ'));
    assert.ok(docs.includes('広告 placeholder や AdSense loader は配置しない'));
    assert.ok(docs.includes('ゲーム中の主要操作'));
    assert.ok(docs.includes('誤タップ誘導に見える文言'));
    assert.ok(docs.includes('報酬示唆'));
    assert.ok(releaseChecklist.includes('docs/ADSENSE_SETUP.md'));
    assert.ok(releaseChecklist.includes('privacy.html'));
    assert.ok(releaseChecklist.includes('account-free play'));
    assert.ok(releaseChecklist.includes('error notification exclusions'));
    assert.ok(releaseChecklist.includes('AdSense review script'));
    assert.ok(releaseChecklist.includes('future ad provider data use'));
    assert.ok(releaseChecklist.includes('Cookie handling'));
    assert.ok(releaseChecklist.includes('contact guidance'));
    assert.ok(releaseChecklist.includes('last updated date'));
    assert.ok(releaseChecklist.includes('remain static explanation pages'));
    assert.ok(releaseChecklist.includes('no page script, form, button, extra `src` asset load, embedded media element, inline event handler, app `id`/`data-*` attribute, `data-ui-action`, automatic redirect / meta refresh, ad placeholder, or AdSense loader'));
    assert.ok(releaseChecklist.includes('rules.html'));
    assert.ok(releaseChecklist.includes('explains the win condition'));
    assert.ok(releaseChecklist.includes('card selection works'));
    assert.ok(releaseChecklist.includes('save/resume works'));
    assert.ok(releaseChecklist.includes('both `og:image` and `twitter:image` pointing to `/icons/icon-512.png`'));
    assert.ok(releaseChecklist.includes('image alt metadata'));
    assert.ok(releaseChecklist.includes('title page and rule-page metadata mention 登録不要 / no-registration play'));
    assert.ok(releaseChecklist.includes('privacy-page metadata mentions error reporting / AdSense review / ad topics'));
    assert.ok(releaseChecklist.includes('pointer-events: none'));
    assert.ok(releaseChecklist.includes('no in-game ad slot'));
    assert.ok(releaseChecklist.includes('gameplay-near SDK placement'));
    assert.ok(readme.includes('docs/OPERATIONS.md'));
    assert.ok(readme.includes('AdSense Review Change Policy'));
    assert.ok(readme.includes('docs / OGP / 遊び方説明 / unknown通知 / CI失敗 / typo / 静的ページCSS に限定'));
    assert.ok(readme.includes('UI大改修、広告位置変更、PWA挙動変更、URL変更、ルール変更、大規模リファクタ'));
    assert.ok(readme.includes('docs/static 変更でも最低限 `git diff --check`, `node tests/main.test.js`, `npm run test:static`'));
    assert.ok(readme.includes('docs/RELEASE_CHECKLIST.md'));
    assert.ok(readme.includes('docs/ADSENSE_SETUP.md'));
    assert.ok(readme.includes('AdSense 審査中の公開ページはトップページ'));
    assert.ok(readme.includes('トップページと `rules.html` の説明メタは登録不要のプレイ'));
    assert.ok(readme.includes('privacy.html` の説明メタはエラー通知、AdSense審査、広告の説明'));
    assert.ok(readme.includes('rules.html` は勝利条件と遊び方を公開 URL で確認できる'));
    assert.ok(readme.includes('自動遷移や meta refresh を追加しません'));
    assert.ok(readme.includes('manifest.json` / `manifest.webmanifest'));
    assert.ok(adsenseSetup.includes('indexable metadata'));
    assert.ok(adsenseSetup.includes('privacy policy is public, indexable'));
    assert.ok(adsenseSetup.includes('rules page is public, indexable'));
    assert.ok(adsenseSetup.includes('links back to the game and rules page'));
    assert.ok(adsenseSetup.includes('links back to the game and privacy policy'));
    assert.ok(adsenseSetup.includes('account registration or email address'));
    assert.ok(adsenseSetup.includes('contact guidance'));
    assert.ok(adsenseSetup.includes('last updated date'));
    assert.ok(adsenseSetup.includes('error notification exclusions'));
    assert.ok(adsenseSetup.includes('privacy.html` description / OGP / Twitter metadata mention account-free play, error reporting, AdSense review, and ads'));
    assert.ok(adsenseSetup.includes('stale privacy-page content'));
    assert.ok(adsenseSetup.includes('<PUBLIC_ORIGIN>/privacy.html'));
    assert.ok(adsenseSetup.includes('<PUBLIC_ORIGIN>/rules.html'));
    assert.ok(adsenseSetup.includes('their description / OGP / Twitter metadata matches the current privacy and rule-page wording'));
    assert.ok(adsenseSetup.includes('does not hardcode staging origins or localhost into preview tags'));
    assert.ok(adsenseSetup.includes('curl -fI "$PUBLIC_ORIGIN/"'));
    assert.ok(adsenseSetup.includes('curl -fI "$PUBLIC_ORIGIN/privacy.html"'));
    assert.ok(adsenseSetup.includes('curl -fI "$PUBLIC_ORIGIN/rules.html"'));
    assert.ok(adsenseSetup.includes('<PUBLIC_ORIGIN>/manifest.webmanifest'));
    assert.ok(adsenseSetup.includes('card selection'));
    assert.ok(adsenseSetup.includes('description / OGP / Twitter metadata'));
    assert.ok(adsenseSetup.includes('Keep each public-page description / OGP / Twitter description concise'));
    assert.ok(adsenseSetup.includes('登録不要 / no-registration play'));
    assert.ok(adsenseSetup.includes('The title page is reachable from the public origin'));
    assert.ok(adsenseSetup.includes('account-free play, the win condition, card selection, and save/resume'));
    assert.ok(adsenseSetup.includes('shared previews do not show stale rule-page content'));
    assert.ok(adsenseSetup.includes('remain static explanation pages without page scripts, forms, buttons, extra `src` asset loads, embedded media elements, inline event handlers, app `id`/`data-*` attributes, `data-ui-action`, automatic redirects / meta refresh, ad placeholders, or an AdSense loader'));
    assert.ok(adsenseSetup.includes('`og:image` and `twitter:image` both point to `/icons/icon-512.png`'));
    assert.ok(adsenseSetup.includes('Preview image metadata should stay same-origin relative'));
    assert.ok(adsenseSetup.includes('image alt text is present'));
    assert.ok(adsenseSetup.includes('Apple touch icon still reference `/icons/icon-192.png`'));
    assert.ok(adsenseSetup.includes('save/resume behavior'));
    assert.ok(adsenseSetup.includes('landmarks, and the last updated date'));
    assert.ok(adsenseSetup.includes('curl -fI "$PUBLIC_ORIGIN/manifest.json"'));
    assert.ok(adsenseSetup.includes('curl -fI "$PUBLIC_ORIGIN/manifest.webmanifest"'));
    assert.ok(adsenseSetup.includes('curl -s "$PUBLIC_ORIGIN/manifest.json" | grep -E "ダイスシティ|start_url|standalone|icon-192|icon-512"'));
    assert.ok(adsenseSetup.includes('curl -s "$PUBLIC_ORIGIN/manifest.webmanifest" | grep -E "ダイスシティ|start_url|standalone|icon-192|icon-512"'));
    assert.ok(adsenseSetup.includes('curl -fI "$PUBLIC_ORIGIN/sw.js"'));
    assert.ok(adsenseSetup.includes('curl -s "$PUBLIC_ORIGIN/api/version" | grep -E "hash"'));
    assert.ok(adsenseSetup.includes('grep -E "index,follow|登録不要|privacy.html|rules.html|og:description|twitter:description|og:image|twitter:image|og:image:alt|twitter:image:alt"'));
    assert.ok(adsenseSetup.includes('grep -E "index,follow|privacy.html|アカウント登録なし|勝利条件|カード選択|保存と再開|最終更新日|og:description|twitter:description|og:image|twitter:image|og:image:alt|twitter:image:alt"'));
    assert.ok(adsenseSetup.includes('grep -E "index,follow|rules.html|アカウント登録|メールアドレス|エラー通知|Cookie|AdSense審査|Google AdSense|審査用スクリプト|実際の広告ユニット|お問い合わせ|最終更新日|og:description|twitter:description|og:image|twitter:image|og:image:alt|twitter:image:alt"'));
    assert.ok(adsenseSetup.includes('/api/client-error-test'));
    assert.ok(adsenseSetup.includes('NTFY_TOPIC` is not public or guessable'));
    assert.ok(adsenseSetup.includes('placeholder-only until real ad units are configured'));
    assert.ok(adsenseSetup.includes('Allowed placeholder locations are `title-bottom`, `rules-bottom`, and `result-bottom` only'));
    assert.ok(adsenseSetup.includes('does not look like a reward, button, or call to action'));
    assert.ok(adsenseSetup.includes('pagead2.googlesyndication.com'));
    assert.ok(adsenseSetup.includes('index.html'));
    assert.ok(operations.includes('AdSense Review Change Policy'));
    assert.ok(operations.includes('keep changes small and stability-focused'));
    assert.ok(operations.includes('Keep commits small'));
    assert.ok(operations.includes('docs cleanup'));
    assert.ok(operations.includes('OGP/image metadata improvements'));
    assert.ok(operations.includes('how-to text'));
    assert.ok(operations.includes('unknown notification fixes'));
    assert.ok(operations.includes('CI failure fixes'));
    assert.ok(operations.includes('Unknown client-error notifications and CI failures are allowed during review'));
    assert.ok(operations.includes('do not hide the notification by only reclassifying or suppressing it'));
    assert.ok(operations.includes('typo fixes'));
    assert.ok(operations.includes('minor CSS for static pages'));
    assert.ok(operations.includes('without automatic redirects or meta refresh'));
    assert.ok(operations.includes('Do not change during review unless an urgent incident or CI fix requires it'));
    assert.ok(operations.includes('large UI redesigns'));
    assert.ok(operations.includes('ad placement changes'));
    assert.ok(operations.includes('PWA behavior changes'));
    assert.ok(operations.includes('URL changes'));
    assert.ok(operations.includes('rule changes'));
    assert.ok(operations.includes('broad refactors'));
    assert.ok(operations.includes('git diff --check'));
    assert.ok(operations.includes('node tests/main.test.js'));
    assert.ok(operations.includes('npm run test:static'));
    assert.ok(operations.includes('title page and rule-page metadata mention 登録不要 / no-registration play'));
    assert.ok(operations.includes('privacy-page metadata mentions error reporting / AdSense review / ad topics'));
    assert.ok(operations.includes('rules.html` explains the win condition'));
    assert.ok(operations.includes('OGP/Twitter rule-page metadata current'));
    assert.ok(operations.includes('contact guidance and the last updated date'));
});

runTest('docs は pending HTML helper 化の現在地を記載している', () => {
    const handoff = fs.readFileSync(path.join(__dirname, '..', 'docs/AI_HANDOFF.md'), 'utf8');
    const audit = fs.readFileSync(path.join(__dirname, '..', 'docs/POST_IMPLEMENTATION_AUDIT.md'), 'utf8');
    const uiRefactor = fs.readFileSync(path.join(__dirname, '..', 'docs/UI_REFACTOR.md'), 'utf8');

    for (const doc of [handoff, audit]) {
        assert.ok(doc.includes('PENDING_MENU_RENDERERS'));
        assert.ok(doc.includes('pending 種別 HTML'));
        assert.ok(!doc.includes('pending 種別 HTML の分割は targeted HTML assertion 追加後に行う'));
        assert.ok(!doc.includes('pending 種別ごとの HTML helper 化は未完了'));
    }
    assert.ok(!uiRefactor.includes('renderPending の pending 種別ごとの helper 分離。'));
});

runTest('docs は Phase 1〜7 実装後の設計状態と矛盾しない', () => {
    const decisions = fs.readFileSync(path.join(__dirname, '..', 'docs/IMPLEMENTATION_DECISIONS.md'), 'utf8');
    const handoff = fs.readFileSync(path.join(__dirname, '..', 'docs/AI_HANDOFF.md'), 'utf8');
    const modalAdr = fs.readFileSync(path.join(__dirname, '..', 'docs/ADR_MODAL_STACK_POLICY.md'), 'utf8');
    const onlineSync = fs.readFileSync(path.join(__dirname, '..', 'docs/ONLINE_SYNC.md'), 'utf8');

    assert.ok(decisions.includes('Future nested blocking modal exceptions'));
    assert.ok(decisions.includes('Durable canonical state adapter'));
    assert.ok(decisions.includes('Scoped reads prefer'));
    assert.ok(!decisions.includes('Modal registry and deny-by-default implementation.'));
    assert.ok(!decisions.includes('Per-room restore index and visible multi-room resume UI.'));
    assert.ok(!decisions.includes('Old global keys are read only through scoped migration.'));
    assert.ok(handoff.includes('modal deny-by-default は実装済み'));
    assert.ok(handoff.includes('existing per-room restore index only as a locator'));
    assert.ok(!handoff.includes('modal stack / deny-nesting policy は design required'));
    assert.ok(modalAdr.includes('## Implementation Status'));
    assert.ok(modalAdr.includes('MODAL_STACK_EXCEPTION_REGISTRY'));
    assert.ok(!modalAdr.includes('This ADR intentionally does not change code'));
    assert.ok(onlineSync.includes('live dice と in-memory canonical mirror は導入済み'));
});

runTest('docs は hostless restore の再評価gateを記載している', () => {
    const hostless = fs.readFileSync(path.join(__dirname, '..', 'docs/HOSTLESS_RESTORE_DESIGN.md'), 'utf8');
    const adr = fs.readFileSync(path.join(__dirname, '..', 'docs/ADR_RESTORE_TRUST_BOUNDARY.md'), 'utf8');
    const decisions = fs.readFileSync(path.join(__dirname, '..', 'docs/IMPLEMENTATION_DECISIONS.md'), 'utf8');

    assert.ok(hostless.includes('2026-05-26 Re-evaluation Gate'));
    assert.ok(hostless.includes('onlineRestoreRoomIndex'));
    assert.ok(hostless.includes('restoreAudit'));
    assert.ok(hostless.includes('restored room replacement remains host-only'));
    assert.ok(adr.includes('Option A remains the active implementation'));
    assert.ok(decisions.includes('Still deferred after 2026-05-26 footing review'));
});

runTest('docs は multiple room resume の設計足場を記載している', () => {
    const design = fs.readFileSync(path.join(__dirname, '..', 'docs/MULTI_ROOM_RESUME_DESIGN.md'), 'utf8');
    const decisions = fs.readFileSync(path.join(__dirname, '..', 'docs/IMPLEMENTATION_DECISIONS.md'), 'utf8');
    const handoff = fs.readFileSync(path.join(__dirname, '..', 'docs/AI_HANDOFF.md'), 'utf8');

    assert.ok(design.includes('onlineRestoreRoomIndex'));
    assert.ok(design.includes('live-reconnect'));
    assert.ok(design.includes('restart-restore-candidate'));
    assert.ok(design.includes('non-host bundle'));
    assert.ok(decisions.includes('docs/MULTI_ROOM_RESUME_DESIGN.md'));
    assert.ok(handoff.includes('Multiple room resume design footing'));
});

runTest('docs は live v2simple の実装済み既定値を記載している', () => {
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    const claude = fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8');
    const diagnostics = fs.readFileSync(path.join(__dirname, '..', 'docs/expert-v2-diagnostics.md'), 'utf8');

    for (const doc of [readme, claude, diagnostics]) {
        assert.ok(doc.includes('dice=strongCrowdThreshold'));
        assert.ok(doc.includes('business=simple'));
        assert.ok(doc.includes('airportSkip=whenNoLandmark'));
    }
    assert.ok(!claude.includes('business=simple` を維持'));
});

if (process.exitCode) {
    throw new Error('mainテストで失敗が発生しました');
}
