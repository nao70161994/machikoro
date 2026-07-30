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
    const rlPreloadCalls = [];
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
        rlPreloadCalls,
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
        rollRandomDie() { return 3; },
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
        ...(typeof options.onlineReconnectInputBlocked === 'boolean' ? {
            isOnlineReconnectInputBlocked() {
                counters.onlineReconnectInputBlockedCalls = (counters.onlineReconnectInputBlockedCalls || 0) + 1;
                return options.onlineReconnectInputBlocked;
            },
        } : {}),
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
            preloadEligibleModels(playerCount, options) {
                rlPreloadCalls.push({ playerCount, options });
                return Promise.resolve([]);
            },
        },
    };
    if (options.throwStorageAccess) {
        Object.defineProperty(context, 'localStorage', {
            configurable: true,
            get() { throw new Error('storage blocked'); },
        });
    }
    context.global = context;
    vm.createContext(context);

    const clientStorageSource = fs.readFileSync(path.join(__dirname, '..', 'js/clientStorage.js'), 'utf8');
    vm.runInContext(clientStorageSource, context, { filename: 'js/clientStorage.js' });
    const appShellStorageSource = fs.readFileSync(path.join(__dirname, '..', 'js/appShellStorage.js'), 'utf8');
    vm.runInContext(appShellStorageSource, context, { filename: 'js/appShellStorage.js' });
    const clientReportingSource = fs.readFileSync(path.join(__dirname, '..', 'js/clientReporting.js'), 'utf8');
    vm.runInContext(clientReportingSource, context, { filename: 'js/clientReporting.js' });
    const lifecycleNotifySource = fs.readFileSync(path.join(__dirname, '..', 'js/lifecycleNotify.js'), 'utf8');
    vm.runInContext(lifecycleNotifySource, context, { filename: 'js/lifecycleNotify.js' });
    const uiWatchdogSource = fs.readFileSync(path.join(__dirname, '..', 'js/uiWatchdog.js'), 'utf8');
    vm.runInContext(uiWatchdogSource, context, { filename: 'js/uiWatchdog.js' });
    const actionContractSource = fs.readFileSync(path.join(__dirname, '..', 'js/actionContract.js'), 'utf8');
    vm.runInContext(actionContractSource, context, { filename: 'js/actionContract.js' });
    const cpuActionProposalSource = fs.readFileSync(path.join(__dirname, '..', 'js/cpuActionProposal.js'), 'utf8');
    vm.runInContext(cpuActionProposalSource, context, { filename: 'js/cpuActionProposal.js' });
    const actionUiRegistrySource = fs.readFileSync(path.join(__dirname, '..', 'js/actionUiRegistry.js'), 'utf8');
    vm.runInContext(actionUiRegistrySource, context, { filename: 'js/actionUiRegistry.js' });
    const pwaShellSource = fs.readFileSync(path.join(__dirname, '..', 'js/pwaShell.js'), 'utf8');
    vm.runInContext(pwaShellSource, context, { filename: 'js/pwaShell.js' });
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
            rlPreloadCalls,
            consoleErrors,
            flushTimeouts: () => { while (timeouts.length) timeouts.shift()(); },
            flushOneTimeout: () => { if (timeouts.length) timeouts.shift()(); },
            getTimeoutCount: () => timeouts.length,
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
            getCpuSchedulerHealth: () => cpuTurnScheduler.getHealth(),
            scheduleCpuTurn: (reason) => cpuTurnScheduler.schedule(reason),
            canRunLocalHumanAction: (expectedPlayerIndex) => canRunLocalHumanAction(expectedPlayerIndex),
            isMainOnlineReconnectInputBlocked: () => isMainOnlineReconnectInputBlocked(),
            cancelCpuSchedule: (reason) => cpuTurnScheduler.cancel(reason),
            expireCpuScheduleLease: () => { cpuStepScheduledUntil = 0; },
            expireDelayedHumanAction: () => {
                if (delayedHumanActionState) delayedHumanActionState.deadline = 0;
            },
            getDelayedHumanActionPending: () => delayedHumanActionPending,
            setPageHiddenAt: (value) => { pageHiddenAt = value; },
            scheduleCPU: () => scheduleCPU(),
            cpuDo: (action, data, fallback) => cpuDo(action, data, fallback),
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

runTest('main createCpuPlayer はRLモデル失敗時にCPU最強へ差し替えない', () => {
    const rt = loadMainRuntime();
    rt.RLModelPortfolio.createRandomCpu = () => { throw new Error('model unavailable'); };

    assert.throws(
        () => rt.createCpuPlayer('rl', { playerCount: 2, expertPurpose: "live" }),
        /model unavailable/
    );
    assert.deepStrictEqual(rt.__test.alerts, []);
});

runTest('main onChangePlayerType はRL選択時にモデルを先読みする', async () => {
    const rt = loadMainRuntime();
    rt.__test.setSelectedCount(3);
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal', name: 'A' },
        { type: 'human', difficulty: 'normal', name: 'B' },
        { type: 'human', difficulty: 'normal', name: 'C' },
    ]);

    rt.onChangePlayerType(1, 'rl');
    await Promise.resolve();

    assert.deepStrictEqual(JSON.parse(JSON.stringify(rt.__test.rlPreloadCalls.pop())), {
        playerCount: 3,
        options: { attempts: 3, retryDelayMs: 0 },
    });
});

runTest('main renderPlayerSettings はRLモデルloading中に開始ボタンを止める', () => {
    const rt = loadMainRuntime();
    rt.__test.setSelectedCount(2);
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal', name: 'A' },
        { type: 'cpu', difficulty: 'rl', name: 'B' },
    ]);
    rt.RLModelPortfolio.eligibleLoadState = () => ({ status: 'loading', ready: 0, total: 3, errors: [] });

    rt.renderPlayerSettings();

    assert.strictEqual(rt.__test.elements.btnStart.disabled, true);
    assert.strictEqual(rt.__test.elements.btnStart.textContent, 'モデル読み込み中');
    assert.ok(rt.__test.elements.localRlModelStatus.textContent.includes('読み込んでいます'));
});

runTest('main renderPlayerSettings はRLモデルfailed時に再試行表示にする', () => {
    const rt = loadMainRuntime();
    rt.__test.setSelectedCount(2);
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal', name: 'A' },
        { type: 'cpu', difficulty: 'rl', name: 'B' },
    ]);
    rt.RLModelPortfolio.eligibleLoadState = () => ({ status: 'failed', ready: 0, total: 3, errors: ['network'] });

    rt.renderPlayerSettings();

    assert.strictEqual(rt.__test.elements.btnStart.disabled, false);
    assert.strictEqual(rt.__test.elements.btnStart.textContent, 'モデルを再試行');
    assert.ok(rt.__test.elements.localRlModelStatus.textContent.includes('再試行'));
});

runTest('main startGame はRL preload完了後にクリック時点の設定で開始する', async () => {
    const rt = loadMainRuntime();
    let resolvePreload;
    rt.RLModelPortfolio.preloadEligibleModels = (playerCount, options) => {
        rt.__test.rlPreloadCalls.push({ playerCount, options });
        return new Promise(resolve => { resolvePreload = resolve; });
    };
    rt.__test.setSelectedCount(2);
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal', name: 'A' },
        { type: 'cpu', difficulty: 'rl', name: 'B' },
    ]);

    rt.startGame();
    rt.__test.setSelectedCount(4);
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal', name: 'A' },
        { type: 'cpu', difficulty: 'normal', name: 'B' },
        { type: 'cpu', difficulty: 'normal', name: 'C' },
        { type: 'cpu', difficulty: 'normal', name: 'D' },
    ]);
    resolvePreload([]);
    await Promise.resolve();

    assert.strictEqual(rt.__test.rlPreloadCalls[0].playerCount, 2);
    assert.strictEqual(rt.__test.getGame().players.length, 2);
    assert.strictEqual(rt.__test.getCpuPlayers().length, 2);
});

runTest('main startGame はRL preload失敗時にゲームを開始しない', async () => {
    const rt = loadMainRuntime();
    rt.console = Object.assign({}, console, { error() {} });
    rt.RLModelPortfolio.preloadEligibleModels = () => Promise.reject(new Error('preload failed'));
    rt.__test.setSelectedCount(2);
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal', name: 'A' },
        { type: 'cpu', difficulty: 'rl', name: 'B' },
    ]);

    rt.startGame();
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(rt.__test.getGame(), undefined);
    assert.ok(rt.__test.alerts.some(message => message.includes('読み込めませんでした')));
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

runTest('main local CPU actionはcanonical proposalを共有Game Engineへ適用する', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);
    const calls = [];
    let fallbackCalls = 0;
    rt.GameEngine = {
        applyMutableAction(context) {
            calls.push(context);
            return true;
        },
    };

    rt.__test.cpuDo('nextTurn', {}, () => { fallbackCalls++; });

    assert.strictEqual(fallbackCalls, 0);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].game, game);
    assert.strictEqual(calls[0].action, 'nextTurn');
    assert.strictEqual(JSON.stringify(calls[0].data), '{}');
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

runTest('main cpuTurnScheduler はCPU手番の予約状態をhealthで返す', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
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
        build() { return false; },
    }, null]);

    const health = rt.__test.scheduleCpuTurn('test-scheduler-health');

    assert.strictEqual(health.isCpuTurn, true);
    assert.strictEqual(health.blockedReason, '');
    assert.strictEqual(health.stepScheduled, true);
    assert.strictEqual(rt.__test.getTimeoutCount(), 1);
});

runTest('main cpuTurnScheduler はstale timeoutを予約中healthにしない', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
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
        build() { throw new Error('stale timeout should not run'); },
    }, null]);

    rt.__test.scheduleCpuTurn('test-stale-schedule');
    rt.__test.cancelCpuSchedule('test-stale-cancel');
    rt.__test.flushOneTimeout();
    const health = rt.__test.getCpuSchedulerHealth();

    assert.strictEqual(health.stepScheduled, false);
    assert.strictEqual(rt.__test.getTimeoutCount(), 0);
});

runTest('main cpuTurnScheduler はCPU予約不可理由をhealthに返す', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);

    const humanHealth = rt.__test.scheduleCpuTurn('test-human-turn-blocked');
    assert.strictEqual(humanHealth.blockedReason, 'human-turn');
    assert.strictEqual(humanHealth.stepScheduled, false);

    rt.isOnlineGame = true;
    rt.isRoomHost = false;
    rt.__test.setCpuPlayers([{ build() {} }, null]);
    const nonHostHealth = rt.__test.scheduleCpuTurn('test-non-host-blocked');
    assert.strictEqual(nonHostHealth.blockedReason, 'non-host');
    assert.strictEqual(nonHostHealth.stepScheduled, false);
});

runTest('main online gateは共有reconnect state判定をCPU予約と人間操作へ使う', () => {
    const rt = loadMainRuntime({ onlineReconnectInputBlocked: true });
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([{ build() {} }, null]);
    rt.isOnlineGame = true;
    rt.isRoomHost = true;
    rt.socket = { connected: true };
    rt.onlineActionInFlight = false;

    const health = rt.__test.scheduleCpuTurn('test-reconnect-state-blocked');

    assert.strictEqual(health.blockedReason, 'reconnecting');
    assert.strictEqual(health.stepScheduled, false);
    assert.strictEqual(rt.__test.canRunLocalHumanAction(), false);
    assert.ok(rt.__test.counters.onlineReconnectInputBlockedCalls >= 2);
});

runTest('main online gateは共有判定不在時にlegacy reconnect booleanへfallbackする', () => {
    const rt = loadMainRuntime();
    rt.isReconnectingOnline = true;

    assert.strictEqual(rt.__test.isMainOnlineReconnectInputBlocked(), true);
});

runTest('main cpuTurnScheduler は画面復帰時に未予約のローカルCPU手番を再開する', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
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
        build() { return false; },
    }, null]);
    rt.__test.scheduleCpuTurn('test-page-resume-pending');
    const tokenBeforeResume = rt.__test.getCpuScheduleToken();
    rt.__test.expireCpuScheduleLease();
    const expiredHealth = rt.__test.getCpuSchedulerHealth();
    assert.strictEqual(expiredHealth.stepScheduled, false);
    assert.ok(Number.isInteger(expiredHealth.token));
    rt.__test.setPageHiddenAt(Date.now() - 198131);
    rt.document.hidden = true;
    rt.__test.eventHandlers['document:visibilitychange']();
    const hiddenActivation = rt.window.__machikoroClientCheckpoints.find(entry => entry.event === 'page-activation-hidden');
    assert.ok(hiddenActivation);
    assert.strictEqual(hiddenActivation.details.cpuOutcome, 'page-hidden');
    assert.strictEqual(rt.__test.getCpuSchedulerHealth().stepScheduled, false);
    rt.document.hidden = false;

    rt.__test.eventHandlers['document:visibilitychange']();

    const health = rt.__test.getCpuSchedulerHealth();
    assert.strictEqual(health.stepScheduled, true);
    assert.strictEqual(rt.__test.getTimeoutCount(), 2);
    assert.ok(rt.__test.getCpuScheduleToken() > tokenBeforeResume);
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'scheduleCPU-enter' && entry.details.reason === 'visibility-resume'));
    const activation = rt.window.__machikoroClientCheckpoints.find(entry => entry.event === 'page-activation-resume');
    assert.ok(activation);
    assert.strictEqual(activation.details.reason, 'visibility-resume');
    assert.strictEqual(activation.details.cpuOutcome, 'rescheduled');
    assert.strictEqual(activation.details.cpuBefore.stepScheduled, false);
    assert.strictEqual(activation.details.cpuAfter.stepScheduled, true);
    assert.ok(activation.details.hiddenForMs >= 198131);
    assert.ok(activation.details.hiddenForMs < 199000);
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

runTest('main scheduleCPU は未知CPUのBUILD例外でもローカル手番をpassする', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([{
        build() { throw new Error('unknown cpu build failure'); },
    }, null]);

    rt.__test.scheduleCPU();
    rt.__test.flushTimeouts();

    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.strictEqual(game.builtThisTurn, false);
    assert.ok(rt.consoleErrors.some(args => args.includes('[cpu] phase step failed:')));
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'scheduleCPU-step-error' && entry.details.step === 'build'));
});

runTest('main scheduleCPU は診断checkpoint例外でもBUILD手番を完了する', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    let buildCalls = 0;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([{
        build() { buildCalls++; return false; },
    }, null]);
    vm.runInContext(`markClientFlowCheckpoint = () => { throw new Error('diagnostic storage failed'); };`, rt);

    rt.__test.scheduleCPU();
    rt.__test.flushTimeouts();

    assert.strictEqual(buildCalls, 1);
    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.strictEqual(rt.__test.getCpuSchedulerHealth().stepScheduled, false);
});

runTest('main scheduleCPU は現在フェーズ以外のCPU手順で遅延しない', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.BUILD;
    let buildCalls = 0;
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([{
        chooseTVTarget() { throw new Error('pending step should be skipped'); },
        chooseBusinessMove() { return null; },
        chooseCleaningTarget() { return null; },
        chooseMoverMove() { return null; },
        chooseRenovationTarget() { return null; },
        chooseITInvest() { return false; },
        chooseDiceCount() { throw new Error('selectDice step should be skipped'); },
        chooseReroll() { throw new Error('reroll step should be skipped'); },
        chooseHarbor() { throw new Error('harbor step should be skipped'); },
        build() { buildCalls++; return false; },
    }, null]);

    rt.__test.scheduleCPU();

    assert.strictEqual(rt.__test.getTimeoutCount(), 1);
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'scheduleCPU-step-skip-phase' && entry.details.step === 'roll'));
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'scheduleCPU-step-skip-phase' && entry.details.step === 'pending'));

    rt.__test.flushOneTimeout();

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

runTest('main は画面復帰時に期限切れのdice選択を一度だけ完了する', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.SELECT_DICE;
    let selectCalls = 0;
    const originalSelectDiceCount = game.selectDiceCount.bind(game);
    game.selectDiceCount = (...args) => {
        selectCalls++;
        originalSelectDiceCount(...args);
    };
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);

    rt.onSelectDiceCount(false);
    rt.__test.expireDelayedHumanAction();
    rt.__test.eventHandlers['document:visibilitychange']();
    rt.__test.eventHandlers.pageshow();
    rt.__test.flushTimeouts();

    assert.strictEqual(selectCalls, 1);
    assert.strictEqual(rt.__test.getDelayedHumanActionPending(), false);
    assert.strictEqual(game.selectedDice.useTwo, false);
});

runTest('main は画面復帰時に期限切れのrollを一度だけ完了する', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.ROLL;
    let rollCalls = 0;
    game.rollDice = () => { rollCalls++; };
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);

    rt.onRoll();
    rt.__test.expireDelayedHumanAction();
    rt.__test.eventHandlers.pageshow();
    rt.__test.eventHandlers['document:visibilitychange']();
    rt.__test.flushTimeouts();

    assert.strictEqual(rollCalls, 1);
    assert.strictEqual(rt.__test.getDelayedHumanActionPending(), false);
});

runTest('main は期限前の連続した画面復帰でdice選択を再予約して二重実行しない', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.SELECT_DICE;
    let selectCalls = 0;
    game.selectDiceCount = () => { selectCalls++; };
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);

    rt.onSelectDiceCount(true);
    rt.__test.eventHandlers['document:visibilitychange']();
    rt.__test.eventHandlers.pageshow();
    rt.__test.flushTimeouts();

    assert.strictEqual(selectCalls, 1);
    assert.strictEqual(rt.__test.getDelayedHumanActionPending(), false);
});

runTest('main は画面復帰時にdice選択の手番が変わっていたら遅延操作を破棄する', () => {
    const rt = loadMainRuntime();
    const game = new rt.GameManager(2);
    game.phase = rt.GAME_PHASES.SELECT_DICE;
    let selectCalls = 0;
    game.selectDiceCount = () => { selectCalls++; };
    rt.__test.setGame(game);
    rt.__test.setCpuPlayers([null, null]);

    rt.onSelectDiceCount(false);
    game.currentPlayerIndex = 1;
    rt.__test.eventHandlers.pageshow();
    rt.__test.flushTimeouts();

    assert.strictEqual(selectCalls, 0);
    assert.strictEqual(rt.__test.getDelayedHumanActionPending(), false);
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
        'document:visibilitychange': 1,
    });

    rt.bindStaticUiHandlers();
    rt.bindDelegatedUiHandlers();

    assert.deepStrictEqual(documentHandlerCounts(), {
        'document:click': 1,
        'document:input': 1,
        'document:change': 1,
        'document:keydown': 1,
        'document:visibilitychange': 1,
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

runTest('SafariでlocalStorage取得が拒否されてもmain初期化とcrash handler登録を継続する', () => {
    const rt = loadMainRuntime({ throwStorageAccess: true });
    assert.strictEqual(rt.__test.counters.loadSettings, 1);
    assert.strictEqual(typeof rt.__test.eventHandlers.error, 'function');
    rt.showCrashScreen(new Error('startup failure'));
    assert.strictEqual(rt.__test.elements.crashScreen.style.display, 'flex');
    assert.strictEqual(rt.__test.elements.crashResumeBtn.style.display, 'none');
});

runTest('markClientFlowCheckpoint はsnapshot生成失敗を外へ伝播しない', () => {
    const rt = loadMainRuntime();
    vm.runInContext("buildClientRuntimeSnapshot = () => { throw new Error('snapshot failed'); };", rt);
    let checkpoint;
    assert.doesNotThrow(() => { checkpoint = rt.markClientFlowCheckpoint('snapshot-failure'); });
    assert.strictEqual(checkpoint.snapshot, null);
    assert.strictEqual(checkpoint.snapshotFailed, true);
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

runTest('index.html はオンライン待機室と接続要求中のPWA更新を保留する', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('function _isOnlineFlowActive()'));
    assert.ok(html.includes("typeof myRoomId !== 'undefined' && !!myRoomId"));
    assert.ok(html.includes("typeof onlineCreateRoomPending !== 'undefined' && onlineCreateRoomPending"));
    assert.ok(html.includes("typeof onlineJoinRoomPending !== 'undefined' && onlineJoinRoomPending"));
    assert.ok(html.includes("if (!_isInGame() && !_isOnlineFlowActive())"));
    assert.ok(html.includes("if ((_isInGame() || _isOnlineFlowActive()) && !updateRequestedByUser)"));
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
        'js/uiLogDisplay.js',
        'js/uiCardOrder.js',
        'js/uiPlayerDisplay.js',
        'js/uiBuildMenu.js',
        'js/uiCardDetail.js',
        'js/uiCardSelect.js',
        'js/uiTutorial.js',
        'js/uiDiceChoice.js',
        'js/ui.js',
        'js/onlineStorage.js',
        'js/online.js',
        'js/stats.js',
    ];
    for (const file of files) {
        const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        assert.ok(!/on(?:click|change|input)=/.test(source), `inline handler attribute found in ${file}`);
    }
});

runTest('UI interactability registry は描画されるaction child selectorと同期する', () => {
    const appShell = [
        'js/actionContract.js',
        'js/actionUiRegistry.js',
        'js/appShell.js',
    ].map(file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).join('\n');
    const uiSources = [
        'js/ui.js',
        'js/uiBuildMenu.js',
        'js/uiPendingMenu.js',
        'js/uiCardDetail.js',
        'js/uiCardSelect.js',
        'js/uiDiceChoice.js',
    ].map(file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).join('\\n');
    const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const actionContainers = {
        rollDice: 'btnRoll',
        selectDice: 'diceChoose',
        rerollDice: 'diceChoose',
        skipReroll: 'diceChoose',
        resolveHarbor: 'diceChoose',
        resolveTV: 'pendingMenu',
        resolveBusiness: 'pendingMenu',
        resolveCleaning: 'pendingMenu',
        resolveMover: 'pendingMenu',
        resolveRenovation: 'pendingMenu',
        resolveIT: 'pendingMenu',
        buildCard: 'buildMenu',
        buildLandmark: 'buildMenu',
        undoBuild: 'buildMenu',
        nextTurn: 'btnSkip',
    };
    for (const [action, targetId] of Object.entries(actionContainers)) {
        assert.ok(appShell.includes("'" + action + "'"), action + ' missing from appShell action registry');
        assert.ok(appShell.includes("targetId: '" + targetId + "'"), targetId + ' target missing for ' + action);
        assert.ok(new RegExp('id=["\']' + targetId + '["\']').test(index), targetId + ' container missing from index.html');
    }

    const childActions = {
        selectDice: 'selectDiceCount',
        rerollDice: 'rerollDice',
        skipReroll: 'skipReroll',
        resolveHarbor: 'resolveHarbor',
        resolveTV: 'resolveTV',
        resolveBusiness: 'resolveBusiness',
        resolveCleaning: 'resolveCleaning',
        resolveMover: 'resolveMover',
        resolveRenovation: 'resolveRenovation',
        resolveIT: 'resolveIT',
        buildCard: 'buildCard',
        buildLandmark: 'buildLandmark',
        undoBuild: 'undoBuild',
    };
    const actionContract = require('../js/actionContract');
    for (const [registryAction, renderedAction] of Object.entries(childActions)) {
        const selector = actionContract.uiChildSelectors[registryAction];
        assert.ok(selector, registryAction + ' child selector registry missing');
        assert.ok(selector.selector.includes('data-action="' + renderedAction + '"'), renderedAction + ' selector missing from registry');
        assert.ok(uiSources.includes('data-action="' + renderedAction + '"'), renderedAction + ' is not rendered by UI sources');
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
    assertBefore('js/actionContract.js', 'js/GameManager.js');
    assertBefore('js/gameSnapshot.js', 'js/online.js');
    assertBefore('js/gameEngine.js', 'js/online.js');
    assertBefore('js/gameSchemaNegotiation.js', 'js/online.js');
    assertBefore('js/gameSnapshot.js', 'js/gameSchemaCodec.js');
    assertBefore('js/gameSchemaCodec.js', 'js/gameSchemaWire.js');
    assertBefore('js/gameSchemaWire.js', 'js/online.js');
    assertBefore('js/gameSchemaCodec.js', 'js/gameEngine.js');
    assertBefore('js/GameManager.js', 'js/CPU.js');
    assertBefore('js/cpuTuning.js', 'js/CPU.js');
    assertBefore('js/cpuProfile.js', 'js/CPU.js');
    assertBefore('js/cpuLegalMoves.js', 'js/CPU.js');
    assertBefore('js/cpuBusinessMoves.js', 'js/CPU.js');
    assertBefore('js/cpuActionProposal.js', 'js/cpuBuildExecution.js');
    assertBefore('js/cpuBuildExecution.js', 'js/CPU.js');
    assertBefore('js/cpuSimulation.js', 'js/CPU.js');
    assertBefore('js/cpuDiagnostics.js', 'js/CPU.js');
    assertBefore('js/cpuEvaluationCache.js', 'js/cpuPendingResolution.js');
    assertBefore('js/cpuPendingResolution.js', 'js/CPU.js');
    assertBefore('js/CPU.js', 'js/RLCPU.js');
    assertBefore('js/RLModelPortfolio.js', 'js/online.js');
    assertBefore('js/onlineStorage.js', 'js/online.js');
    assertBefore('js/onlinePayload.js', 'js/online.js');
    assertBefore('js/uiNotice.js', 'js/ui.js');
    assertBefore('js/uiLogDisplay.js', 'js/ui.js');
    assertBefore('js/uiCardOrder.js', 'js/ui.js');
    assertBefore('js/uiPlayerDisplay.js', 'js/ui.js');
    assertBefore('js/uiBuildMenu.js', 'js/ui.js');
    assertBefore('js/uiPendingMenu.js', 'js/ui.js');
    assertBefore('js/uiCardDetail.js', 'js/ui.js');
    assertBefore('js/uiCardSelect.js', 'js/ui.js');
    assertBefore('js/uiTutorial.js', 'js/ui.js');
    assertBefore('js/uiDiceChoice.js', 'js/ui.js');
    assertBefore('js/uiModalPolicy.js', 'js/ui.js');
    assertBefore('js/uiWinner.js', 'js/ui.js');
    assertBefore('js/ui.js', 'js/savedGameValidation.js');
    assertBefore('js/savedGameValidation.js', 'js/storage.js');
    assertBefore('js/storageSettings.js', 'js/storage.js');
    assertBefore('js/storage.js', 'js/appShell.js');
    assertBefore('js/clientStorage.js', 'js/appShellStorage.js');
    assertBefore('js/clientStorage.js', 'js/storage.js');
    assertBefore('js/appShellStorage.js', 'js/appShell.js');
    assertBefore('js/clientReporting.js', 'js/appShell.js');
    assertBefore('js/lifecycleNotify.js', 'js/appShell.js');
    assertBefore('js/uiWatchdog.js', 'js/appShell.js');
    assertBefore('js/pwaShell.js', 'js/appShell.js');
    assertBefore('js/actionUiRegistry.js', 'js/appShell.js');
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
    const howToPlay = fs.readFileSync(path.join(__dirname, '..', 'how-to-play.html'), 'utf8');
    const cardsPage = fs.readFileSync(path.join(__dirname, '..', 'cards.html'), 'utf8');
    const aiCpu = fs.readFileSync(path.join(__dirname, '..', 'ai-cpu.html'), 'utf8');
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    const riskPlan = fs.readFileSync(path.join(__dirname, '..', 'docs/RISK_REDUCTION_PLAN.md'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    const webmanifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
    const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const ntfyDocs = fs.readFileSync(path.join(__dirname, '..', 'docs/NTFY_ERROR_REPORTING.md'), 'utf8');
    const publicSurfaces = [html, privacy, rules, howToPlay, cardsPage, aiCpu, readme, riskPlan, ntfyDocs].join('\n');
    assert.ok(ntfyDocs.includes('browser client-error and lifecycle notifications'));
    assert.ok(ntfyDocs.includes('NODE_ENV=production'));
    assert.ok(ntfyDocs.includes('BUILD_HASH'));
    assert.ok(ntfyDocs.includes('docs/OPERATIONS.md` as the source of truth'));
    assert.ok(ntfyDocs.includes('GitHub Actions UI monitoring as the fallback'));
    assert.ok(ntfyDocs.includes('unknown/CI notification fixes must stay within `docs/OPERATIONS.md` の `AdSense Review Change Policy`'));
    assert.ok(!ntfyDocs.includes('topic name to publish client errors to'));

    const manifestKeys = ['background_color', 'description', 'display', 'icons', 'id', 'lang', 'name', 'orientation', 'short_name', 'start_url', 'theme_color'];
    assert.deepStrictEqual(Object.keys(manifest).sort(), manifestKeys);
    assert.deepStrictEqual(Object.keys(webmanifest).sort(), manifestKeys);
    assert.deepStrictEqual(webmanifest, manifest);

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
    assert.ok(howToPlay.includes('<title>遊び方 - ダイスシティ</title>'));
    assert.ok(cardsPage.includes('<title>カードとランドマーク - ダイスシティ</title>'));
    assert.ok(aiCpu.includes('<title>CPUとAI - ダイスシティ</title>'));
    assert.strictEqual(manifest.name, 'ダイスシティ');
    assert.strictEqual(manifest.short_name, 'ダイスシティ');
    assert.strictEqual(manifest.description, 'ダイスシティ - オンライン・オフライン対応のブラウザボードゲーム');
    assert.strictEqual(manifest.lang, 'ja');
    assert.strictEqual(manifest.id, '/');
    assert.strictEqual(manifest.start_url, '/');
    assert.strictEqual(manifest.display, 'standalone');
    assert.strictEqual(manifest.background_color, '#0f0e17');
    assert.strictEqual(manifest.theme_color, '#0f0e17');
    assert.strictEqual(manifest.orientation, 'portrait');
    assert.deepStrictEqual(manifest.icons.map((icon) => icon.src).sort(), ['/icons/icon-192.png', '/icons/icon-512.png']);
    assert.deepStrictEqual(manifest.icons.map((icon) => icon.sizes).sort(), ['192x192', '512x512']);
    assert.ok(manifest.icons.every((icon) => icon.type === 'image/png'));
    assert.ok(manifest.icons.every((icon) => icon.purpose === 'any maskable'));
    assert.strictEqual(webmanifest.name, 'ダイスシティ');
    assert.strictEqual(webmanifest.short_name, 'ダイスシティ');
    assert.strictEqual(webmanifest.description, 'ダイスシティ - オンライン・オフライン対応のブラウザボードゲーム');
    assert.strictEqual(webmanifest.lang, 'ja');
    assert.strictEqual(webmanifest.id, '/');
    assert.strictEqual(webmanifest.start_url, '/');
    assert.strictEqual(webmanifest.display, 'standalone');
    assert.strictEqual(webmanifest.background_color, '#0f0e17');
    assert.strictEqual(webmanifest.theme_color, '#0f0e17');
    assert.strictEqual(webmanifest.orientation, 'portrait');
    assert.deepStrictEqual(webmanifest.icons.map((icon) => icon.src).sort(), ['/icons/icon-192.png', '/icons/icon-512.png']);
    assert.deepStrictEqual(webmanifest.icons.map((icon) => icon.sizes).sort(), ['192x192', '512x512']);
    assert.ok(webmanifest.icons.every((icon) => icon.type === 'image/png'));
    assert.ok(webmanifest.icons.every((icon) => icon.purpose === 'any maskable'));
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    assert.strictEqual((head.match(/<link rel="manifest"/g) || []).length, 1);
    assert.ok(head.includes('<link rel="manifest" href="/manifest.webmanifest">'));
    assert.strictEqual((head.match(/<meta name="theme-color"/g) || []).length, 1);
    assert.ok(head.includes('<meta name="theme-color" content="#0f0e17">'));
    assert.strictEqual((head.match(/<meta name="mobile-web-app-capable"/g) || []).length, 1);
    assert.ok(head.includes('<meta name="mobile-web-app-capable" content="yes">'));
    assert.strictEqual((head.match(/<meta name="apple-mobile-web-app-capable"/g) || []).length, 1);
    assert.ok(head.includes('<meta name="apple-mobile-web-app-capable" content="yes">'));
    assert.strictEqual((head.match(/<meta name="apple-mobile-web-app-status-bar-style"/g) || []).length, 1);
    assert.ok(head.includes('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'));
    assert.strictEqual((head.match(/<meta name="apple-mobile-web-app-title"/g) || []).length, 1);
    assert.ok(head.includes('<meta name="apple-mobile-web-app-title" content="ダイスシティ">'));
    assert.strictEqual((head.match(/<link rel="apple-touch-icon"/g) || []).length, 1);
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
    assert.ok(html.includes(`if (!_waitingSW) {
            if (_versionMismatchDetected)`));
    assert.ok(html.includes('function checkClientVersionMismatch()'));
    assert.ok(html.includes("fetch('/api/version',"));
    assert.ok(html.includes("cache: 'no-store'"));
    assert.ok(html.includes('client-version-mismatch'));
    assert.ok(html.includes('reportClientError({'));
    assert.ok(html.includes('function checkOnlineDelivery()'));
    assert.ok(html.includes("fetch('/socket.io/socket.io.js'"));
    assert.ok(html.includes('online-delivery-check-failed'));
    assert.ok(html.includes('window.__machikoroCheckOnlineDelivery = checkOnlineDelivery;'));
    assert.ok(html.includes('function shouldKeepPwaUpdateBannerVisible()'));
    assert.ok(html.includes('window.shouldKeepPwaUpdateBannerVisible = shouldKeepPwaUpdateBannerVisible;'));
    assert.ok(html.includes('(_versionMismatchDetected || !!_waitingSW) && _isOnlineFlowActive()'));
    assert.ok(mainSource.includes("shouldKeepPwaUpdateBannerVisible()"));
    assert.ok(html.includes('checkOnlineDelivery();'));
    assert.ok(html.includes('window.__machikoroCheckVersionMismatch = checkClientVersionMismatch;'));
    assert.ok(html.includes('window.refreshPwaUpdateState = refreshPwaUpdateState;'));
    const appShellSource = fs.readFileSync(path.join(__dirname, '..', 'js/appShell.js'), 'utf8');
    assert.ok(appShellSource.includes("markClientFlowCheckpoint('freeze-watchdog-report'"));
    assert.ok(!appShellSource.includes("markClientFlowCheckpoint('freeze-watchdog-tick'"));
    assert.ok(html.includes('if ((_isInGame() || _isOnlineFlowActive()) && !updateRequestedByUser) {\n            _showPwaUpdateBanner();\n            return;\n          }'));
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
    assert.ok(css.includes('--z-notice-toast: 800;'));
    assert.ok(css.includes('--z-modal: 1000;'));
    assert.ok(css.includes('#pwaUpdateBanner'));
    assert.ok(css.includes('z-index: var(--z-pwa-banner);'));
    assert.ok(css.includes('body.pwa-banner-open #gameScreen'));
    assert.ok(css.indexOf('max-height: min(calc(100vh - 24px), 70vh);') < css.indexOf('max-height: min(calc(100dvh - 24px), 70dvh);'));
    assert.ok(css.includes('calc(12px + env(safe-area-inset-bottom, 0px))'));
    assert.ok(css.includes('z-index: var(--z-modal);'));
    assert.ok(css.includes('.confirm-modal-content'));
    assert.ok(css.includes('animation: none;'));
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
        {
            file: 'index.html',
            title: 'ダイスシティ',
            type: 'website',
            description: 'ダイスシティは、登録不要でサイコロと街づくりを楽しめるブラウザボードゲームです。目的、カード、CPU、PWA対応も案内します。',
            previewDescription: 'ダイスシティは、登録不要でサイコロと街づくりを楽しめるブラウザボードゲームです。目的、カード、CPU、PWA対応も案内します。'
        },
        {
            file: 'rules.html',
            title: 'ルール - ダイスシティ',
            type: 'article',
            description: 'ダイスシティの基本ルール。アカウント登録なしのはじめ方、勝利条件、カード選択、施設とランドマーク建設、保存と再開を説明します。',
            previewDescription: 'アカウント登録なしのはじめ方、勝利条件、カード選択、施設とランドマーク建設、保存と再開など、ダイスシティの基本ルールを説明します。'
        },
        {
            file: 'how-to-play.html',
            title: '遊び方 - ダイスシティ',
            type: 'article',
            description: 'ダイスシティの遊び方。目的、勝利条件、ターンの流れ、サイコロとカード、PWAとしての遊び方を説明します。',
            previewDescription: '目的、勝利条件、ターンの流れ、サイコロとカード、PWAとしての遊び方が分かるダイスシティのガイドです。'
        },
        {
            file: 'cards.html',
            title: 'カードとランドマーク - ダイスシティ',
            type: 'article',
            description: 'ダイスシティのカードカテゴリ、色ごとの発動条件、ランドマーク効果、建設方針を説明します。',
            previewDescription: 'カードカテゴリ、色ごとの発動条件、ランドマーク効果、建設方針をまとめたダイスシティの施設ガイドです。'
        },
        {
            file: 'ai-cpu.html',
            title: 'CPUとAI - ダイスシティ',
            type: 'article',
            description: 'ダイスシティのCPU難易度、最強CPU、AI深層学習CPU、ローカル練習とオンラインCPU補充を説明します。',
            previewDescription: 'CPU難易度、最強CPU、AI深層学習CPU、ローカル練習とオンラインCPU補充を説明するダイスシティのAIガイドです。'
        },
        {
            file: 'privacy.html',
            title: 'プライバシーポリシー - ダイスシティ',
            type: 'article',
            description: 'ダイスシティのプライバシーポリシー。アカウント登録不要の遊び方、保存データ、オンライン対戦、エラー通知・開始終了通知、AdSense審査と広告について説明します。',
            previewDescription: 'アカウント登録不要の遊び方、保存データ、オンライン対戦、エラー通知・開始終了通知、AdSense審査と広告について説明します。'
        }
    ];

    for (const page of pages) {
        const html = fs.readFileSync(path.join(__dirname, '..', page.file), 'utf8');
        const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));

        assert.ok(html.includes('<html lang="ja">'));
        assert.strictEqual((head.match(/<meta charset=/g) || []).length, 1);
        assert.strictEqual((head.match(/<title>/g) || []).length, 1);
        assert.strictEqual((head.match(/<meta name="viewport"/g) || []).length, 1);
        assert.ok(head.includes('<meta charset="UTF-8">'));
        assert.ok(head.includes(`<title>${page.title}</title>`));
        assert.strictEqual((head.match(/<link rel="stylesheet"/g) || []).length, 1);
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
        assert.strictEqual(countMeta(/<meta property="og:site_name"/g), 1);
        assert.strictEqual(countMeta(/<meta property="og:type"/g), 1);
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
        const ogSiteName = getMetaContent(/<meta property="og:site_name" content="([^"]+)">/);
        const ogType = getMetaContent(/<meta property="og:type" content="([^"]+)">/);
        const twitterCard = getMetaContent(/<meta name="twitter:card" content="([^"]+)">/);
        assert.strictEqual(ogSiteName, 'ダイスシティ');
        assert.strictEqual(ogType, page.type);
        assert.strictEqual(twitterCard, 'summary');
        const ogTitle = getMetaContent(/<meta property="og:title" content="([^"]+)">/);
        const twitterTitle = getMetaContent(/<meta name="twitter:title" content="([^"]+)">/);
        assert.strictEqual(ogTitle, page.title);
        assert.strictEqual(twitterTitle, page.title);
        assert.ok(page.title.length <= 60);
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
        assert.strictEqual(description, page.description);
        assert.strictEqual(ogDescription, page.previewDescription);
        assert.strictEqual(twitterDescription, page.previewDescription);
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
        if (page.file === 'how-to-play.html') {
            for (const previewDescription of previewDescriptions) {
                assert.ok(previewDescription.includes('目的'));
                assert.ok(previewDescription.includes('勝利条件'));
                assert.ok(previewDescription.includes('ターンの流れ'));
                assert.ok(previewDescription.includes('PWA'));
            }
        }
        if (page.file === 'cards.html') {
            for (const previewDescription of previewDescriptions) {
                assert.ok(previewDescription.includes('カードカテゴリ'));
                assert.ok(previewDescription.includes('ランドマーク'));
                assert.ok(previewDescription.includes('建設方針'));
            }
        }
        if (page.file === 'ai-cpu.html') {
            for (const previewDescription of previewDescriptions) {
                assert.ok(previewDescription.includes('CPU難易度'));
                assert.ok(previewDescription.includes('AI深層学習CPU'));
                assert.ok(previewDescription.includes('オンラインCPU補充'));
            }
        }
    }

    const readPngSize = (relativePath) => {
        const bytes = fs.readFileSync(path.join(__dirname, '..', relativePath));
        assert.strictEqual(bytes.slice(1, 4).toString('ascii'), 'PNG');
        return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    };
    assert.deepStrictEqual(readPngSize('icons/icon-512.png'), { width: 512, height: 512 });
    assert.deepStrictEqual(readPngSize('icons/icon-192.png'), { width: 192, height: 192 });
});

runTest('AdSense 審査コードはhead内に1回だけ読み込まれる', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    const scriptTags = [...html.matchAll(/<script\b[^>]*><\/script>/gi)].map((match) => match[0]);
    const getAttrValue = (tagSource, attrName) => {
        const quoted = tagSource.match(new RegExp("\\s" + attrName + "\\s*=\\s*([\"'])(.*?)\\1", "i"));
        if (quoted) return quoted[2];
        const unquoted = tagSource.match(new RegExp('\\s' + attrName + '\\s*=\\s*([^\\s>]+)', 'i'));
        return unquoted ? unquoted[1] : '';
    };
    const expectedSrc = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8683516545883768';
    const matches = scriptTags.filter((tag) => getAttrValue(tag, 'src') === expectedSrc);

    assert.strictEqual(matches.length, 1);
    assert.ok(head.includes(matches[0]));
    assert.ok(head.indexOf('rel="apple-touch-icon"') < head.indexOf(matches[0]));
    assert.ok(html.indexOf(matches[0]) < html.indexOf('</head>'));
    assert.strictEqual(getAttrValue(matches[0], 'async'), '');
    assert.strictEqual(getAttrValue(matches[0], 'crossorigin'), 'anonymous');
    const externalScriptSrcs = scriptTags
        .map((tag) => getAttrValue(tag, 'src'))
        .filter((src) => /^https?:\/\//.test(src));
    assert.deepStrictEqual(externalScriptSrcs, [expectedSrc]);
});
runTest('広告 placeholder は許可された画面だけに配置される', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const adSlotsSource = fs.readFileSync(path.join(__dirname, '..', 'js/adSlots.js'), 'utf8');
    const docs = fs.readFileSync(path.join(__dirname, '..', 'docs/ADS_PLAN.md'), 'utf8');
    const releaseChecklist = fs.readFileSync(path.join(__dirname, '..', 'docs/RELEASE_CHECKLIST.md'), 'utf8');
    const adsenseSetup = fs.readFileSync(path.join(__dirname, '..', 'docs/ADSENSE_SETUP.md'), 'utf8');
    const operations = fs.readFileSync(path.join(__dirname, '..', 'docs/OPERATIONS.md'), 'utf8');
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    const handoff = fs.readFileSync(path.join(__dirname, '..', 'docs/AI_HANDOFF.md'), 'utf8');
    const privacy = fs.readFileSync(path.join(__dirname, '..', 'privacy.html'), 'utf8');
    const rules = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8');
    const howToPlay = fs.readFileSync(path.join(__dirname, '..', 'how-to-play.html'), 'utf8');
    const cardsPage = fs.readFileSync(path.join(__dirname, '..', 'cards.html'), 'utf8');
    const aiCpu = fs.readFileSync(path.join(__dirname, '..', 'ai-cpu.html'), 'utf8');
    const staticPages = [rules, privacy, howToPlay, cardsPage, aiCpu];
    const { AD_SLOT_CONFIGS, renderAdSlot } = require('../js/adSlots.js');

    assert.deepStrictEqual(Object.keys(AD_SLOT_CONFIGS).sort(), ['result-bottom', 'rules-bottom', 'title-bottom']);
    assert.ok(html.includes('id="adSlotTitleBottom" class="ad-slot-host" data-ad-slot-host="title-bottom"'));
    assert.ok(html.includes('id="adSlotRulesBottom" class="ad-slot-host" data-ad-slot-host="rules-bottom"'));
    assert.deepStrictEqual([...html.matchAll(/data-ad-slot-host="([^"]+)"/g)].map((match) => match[1]), ['title-bottom', 'rules-bottom']);
    assert.ok(html.includes('href="privacy.html"'));
    assert.ok(html.includes('href="rules.html"'));
    assert.ok(html.includes('href="how-to-play.html"'));
    assert.ok(html.includes('href="cards.html"'));
    assert.ok(html.includes('href="ai-cpu.html"'));
    const titleAdIndex = html.indexOf('id="adSlotTitleBottom"');
    const legalLinksIndex = html.indexOf('class="legal-links" aria-label="サイト情報"');
    const gameScreenIndex = html.indexOf('<div id="gameScreen"');
    assert.ok(titleAdIndex > 0);
    assert.ok(titleAdIndex > html.indexOf('class="title-about"'));
    assert.ok(legalLinksIndex > titleAdIndex);
    assert.ok(legalLinksIndex < gameScreenIndex);
    const countMatches = (source, pattern) => (source.match(pattern) || []).length;
    assert.strictEqual(countMatches(html, /<nav class="legal-links" aria-label="サイト情報">/g), 1);
    const getHtmlTags = (pageSource, tagName) => [...pageSource.matchAll(new RegExp('<' + tagName + '\\b[^>]*>', 'gi'))].map((match) => match[0]);
    const getAttrValue = (tagSource, attrName) => {
        const quoted = tagSource.match(new RegExp("\\s" + attrName + "\\s*=\\s*([\"'])(.*?)\\1", "i"));
        if (quoted) return quoted[2];
        const unquoted = tagSource.match(new RegExp("\\s" + attrName + "\\s*=\\s*([^\\s>]+)", "i"));
        return unquoted ? unquoted[1] : '';
    };
    const tagHasRelToken = (tagSource, forbiddenTokens) => {
        const rel = getAttrValue(tagSource, 'rel').toLowerCase();
        return rel.split(/\s+/).some((token) => forbiddenTokens.includes(token));
    };
    const tagHasNameOrProperty = (tagSource, forbiddenValues) => {
        const values = [getAttrValue(tagSource, 'name'), getAttrValue(tagSource, 'property')]
            .map((value) => value.toLowerCase());
        return values.some((value) => forbiddenValues.includes(value));
    };
    for (const publicPageSource of [html, ...staticPages]) {
        assert.ok(!/<meta[^>]+http-equiv\s*=\s*["']?refresh/i.test(publicPageSource));
        assert.ok(!/<base\b/i.test(publicPageSource));
        assert.ok(!getHtmlTags(publicPageSource, 'link').some((tag) => tagHasRelToken(tag, ['canonical'])));
        assert.ok(!getHtmlTags(publicPageSource, 'meta').some((tag) => tagHasNameOrProperty(tag, ['og:url', 'twitter:url'])));
        assert.ok(!getHtmlTags(publicPageSource, 'link').some((tag) => tagHasRelToken(tag, ['preconnect', 'dns-prefetch', 'preload', 'modulepreload'])));
        assert.ok(!getHtmlTags(publicPageSource, 'link').some((tag) => tagHasRelToken(tag, ['stylesheet']) && /^https?:\/\//i.test(getAttrValue(tag, 'href'))));
    }
    const legalLinksEndIndex = html.indexOf('</nav>', legalLinksIndex);
    const legalLinksHtml = html.slice(legalLinksIndex, legalLinksEndIndex);
    assert.deepStrictEqual([...legalLinksHtml.matchAll(/href="([^"]+)"/g)].map((match) => match[1]), ['how-to-play.html', 'cards.html', 'ai-cpu.html', 'rules.html', 'privacy.html']);
    assert.deepStrictEqual([...legalLinksHtml.matchAll(/<a href="[^"]+">([^<]+)<\/a>/g)].map((match) => match[1]), ['遊び方', 'カード', 'CPUとAI', 'ルール', 'プライバシーポリシー']);
    assert.ok(!legalLinksHtml.includes('target="_blank"'));
    assert.ok(!legalLinksHtml.includes('download'));
    const unsafeHrefPattern = /^(?:https?:)?\/\/|^javascript:|^data:/i;
    for (const href of [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1])) {
        assert.ok(!unsafeHrefPattern.test(href));
    }
    for (const staticPage of staticPages) {
        assert.strictEqual(countMatches(staticPage, /<main class="static-page-content">/g), 1);
        assert.strictEqual(countMatches(staticPage, /<h1>/g), 1);
        assert.strictEqual(countMatches(staticPage, /<nav class="static-page-links" aria-label="関連ページ">/g), 1);
        assert.ok(staticPage.trim().endsWith('</html>'));
    }
    assert.ok(rules.includes('<body class="static-page">'));
    assert.ok(rules.includes('class="static-page-links" aria-label="関連ページ"'));
    assert.ok(rules.includes('<a href="/">ゲームへ戻る</a>'));
    assert.ok(rules.includes('<main class="static-page-content">'));
    assert.ok(rules.includes('<p class="static-page-eyebrow">ダイスシティ</p>'));
    assert.ok(rules.includes('<h1>ルール</h1>'));
    const getH2Texts = (pageSource) => [...pageSource.matchAll(/<h2>([^<]+)<\/h2>/g)].map((match) => match[1]);
    assert.deepStrictEqual(getH2Texts(rules), [
        '勝利条件',
        'はじめて遊ぶ方へ',
        '施設とランドマークの建設',
        '保存と再開',
        'ターンの流れ',
        'カードの色',
        '発動順序',
        'ランドマーク'
    ]);
    assert.ok(rules.includes('<h2>勝利条件</h2>'));
    assert.ok(rules.includes('<h2>はじめて遊ぶ方へ</h2>'));
    assert.ok(rules.includes('アカウント登録なしでブラウザから遊び始められます。'));
    assert.ok(rules.includes('<h2>施設とランドマークの建設</h2>'));
    assert.ok(rules.includes('施設カードは、サイコロの出目に応じて'));
    assert.ok(rules.includes('未建設のランドマーク'));
    assert.ok(rules.includes('建設せずにターンを終了できます'));
    assert.ok(rules.includes('<h2>保存と再開</h2>'));
    assert.ok(rules.includes('<h2>ターンの流れ</h2>'));
    assert.ok(rules.includes('<h2>カードの色</h2>'));
    assert.ok(rules.includes('<h2>発動順序</h2>'));
    assert.ok(rules.includes('<h2>ランドマーク</h2>'));
    const getMetaContentFromPage = (pageSource, pattern) => {
        const match = pageSource.match(pattern);
        assert.ok(match);
        return match[1];
    };
    const rulesMetaDescriptions = [
        getMetaContentFromPage(rules, /<meta name="description" content="([^"]+)">/),
        getMetaContentFromPage(rules, /<meta property="og:description" content="([^"]+)">/),
        getMetaContentFromPage(rules, /<meta name="twitter:description" content="([^"]+)">/)
    ];
    for (const metaDescription of rulesMetaDescriptions) {
        for (const keyword of ['勝利条件', 'カード選択', '施設とランドマーク建設', '保存と再開']) {
            assert.ok(metaDescription.includes(keyword));
            assert.ok(rules.includes(keyword));
        }
    }
    assert.ok(rules.includes('<a href="privacy.html">プライバシーポリシー</a>'));
    assert.ok(privacy.includes('<body class="static-page">'));
    assert.ok(privacy.includes('<main class="static-page-content">'));
    assert.ok(privacy.includes('<p class="static-page-eyebrow">ダイスシティ</p>'));
    assert.ok(privacy.includes('<h1>プライバシーポリシー</h1>'));
    assert.deepStrictEqual(getH2Texts(privacy), [
        '取得する情報',
        'エラー通知',
        '広告について',
        '保存データの削除',
        'お問い合わせ'
    ]);
    assert.ok(privacy.includes('<h2>取得する情報</h2>'));
    assert.ok(privacy.includes('<h2>エラー通知</h2>'));
    assert.ok(privacy.includes('<h2>広告について</h2>'));
    assert.ok(privacy.includes('<h2>保存データの削除</h2>'));
    assert.ok(privacy.includes('<h2>お問い合わせ</h2>'));
    const privacyMetaDescriptions = [
        getMetaContentFromPage(privacy, /<meta name="description" content="([^"]+)">/),
        getMetaContentFromPage(privacy, /<meta property="og:description" content="([^"]+)">/),
        getMetaContentFromPage(privacy, /<meta name="twitter:description" content="([^"]+)">/)
    ];
    for (const metaDescription of privacyMetaDescriptions) {
        for (const keyword of ['エラー通知', 'AdSense審査', '広告']) {
            assert.ok(metaDescription.includes(keyword));
            assert.ok(privacy.includes(keyword));
        }
    }
    assert.ok(privacy.includes('class="static-page-links" aria-label="関連ページ"'));
    for (const staticPage of staticPages) {
        assert.strictEqual((staticPage.match(/class="static-page-updated"/g) || []).length, 1);
        assert.ok(/<p class="static-page-updated">最終更新日: 20\d{2}-\d{2}-\d{2}<\/p>/.test(staticPage));
    }
    assert.ok(privacy.includes('<a href="/">ゲームへ戻る</a>'));
    assert.ok(privacy.includes('<a href="rules.html">ルール</a>'));
    assert.ok(!privacy.includes('data-ad-slot-host'));
    assert.ok(!rules.includes('data-ad-slot-host'));
    assert.ok(!privacy.includes('<script'));
    assert.ok(!rules.includes('<script'));
    assert.ok(!privacy.includes(' style='));
    assert.ok(!rules.includes(' style='));
    for (const staticPage of staticPages) {
        const normalizedStaticPage = staticPage.toLowerCase();
        assert.ok(!/\sid\s*=/.test(normalizedStaticPage));
        assert.ok(!normalizedStaticPage.includes('data-'));
        assert.ok(!normalizedStaticPage.includes('data-ui-action'));
        assert.ok(!/\son[a-z]+\s*=/.test(normalizedStaticPage));
        assert.ok(!/\ssrc\s*=/.test(normalizedStaticPage));
        assert.ok(!/\sstyle\s*=/.test(normalizedStaticPage));
        assert.ok(!/http-equiv\s*=\s*["']refresh["']/.test(normalizedStaticPage));
        for (const forbiddenTag of ['script', 'button', 'input', 'select', 'textarea', 'form', 'dialog', 'details', 'summary', 'iframe', 'embed', 'object', 'canvas', 'img', 'picture', 'source', 'video', 'audio', 'svg']) {
            assert.ok(!new RegExp('<\\s*' + forbiddenTag + '\\b').test(normalizedStaticPage));
        }
        assert.ok(!/role\s*=\s*["']button["']/.test(normalizedStaticPage));
        assert.ok(!normalizedStaticPage.includes('aria-live'));
        assert.ok(!normalizedStaticPage.includes('aria-busy'));
        assert.ok(!normalizedStaticPage.includes('aria-disabled'));
        assert.ok(!normalizedStaticPage.includes('aria-modal'));
        assert.ok(!normalizedStaticPage.includes('inert'));
        assert.ok(!normalizedStaticPage.includes('hidden'));
        assert.ok(!/target\s*=\s*["']_blank["']/.test(normalizedStaticPage));
        assert.ok(!normalizedStaticPage.includes('download'));
    }
    const getHrefs = (pageSource) => [...pageSource.matchAll(/href\s*=\s*(["'])(.*?)\1/gi)]
        .map((match) => match[2])
        .sort();
    assert.deepStrictEqual(getHrefs(rules), ['/', 'ai-cpu.html', 'cards.html', 'how-to-play.html', 'privacy.html', 'style.css']);
    assert.deepStrictEqual(getHrefs(privacy), ['/', 'ai-cpu.html', 'cards.html', 'how-to-play.html', 'rules.html', 'style.css']);
    assert.deepStrictEqual(getHrefs(howToPlay), ['/', 'ai-cpu.html', 'cards.html', 'privacy.html', 'rules.html', 'style.css']);
    assert.deepStrictEqual(getHrefs(cardsPage), ['/', 'ai-cpu.html', 'how-to-play.html', 'privacy.html', 'rules.html', 'style.css']);
    assert.deepStrictEqual(getHrefs(aiCpu), ['/', 'cards.html', 'how-to-play.html', 'privacy.html', 'rules.html', 'style.css']);
    assert.ok(!privacy.includes('adsbygoogle.js'));
    assert.ok(!rules.includes('adsbygoogle.js'));
    const getLinkTags = (pageSource) => [...pageSource.matchAll(/<link[^>]+>/g)].map((match) => match[0]).sort();
    for (const staticPageSource of staticPages) {
        assert.deepStrictEqual(getLinkTags(staticPageSource), ['<link rel="stylesheet" href="style.css">']);
    }
    for (const staticPageSource of staticPages) {
        assert.ok(!staticPageSource.includes('pagead2.googlesyndication.com'));
        assert.ok(!staticPageSource.includes('ca-pub-8683516545883768'));
    }
    for (const publicPageSource of [html, ...staticPages]) {
        assert.ok(!/<ins[^>]+class\s*=\s*(["'])[^"']*adsbygoogle/i.test(publicPageSource));
        assert.ok(!/data-ad-client\s*=/i.test(publicPageSource));
        assert.ok(!/data-ad-slot\s*=/i.test(publicPageSource));
    }
    const liveAdUnitSources = [adSlotsSource, renderAdSlot('title-bottom'), renderAdSlot('rules-bottom'), renderAdSlot('result-bottom')];
    for (const liveAdUnitSource of liveAdUnitSources) {
        assert.ok(!/<ins[^>]+class\s*=\s*(["'])[^"']*adsbygoogle/i.test(liveAdUnitSource));
        assert.ok(!/data-ad-client\s*=/i.test(liveAdUnitSource));
        assert.ok(!/data-ad-slot\s*=/i.test(liveAdUnitSource));
        assert.ok(!/ca-pub-/i.test(liveAdUnitSource));
        assert.ok(!/pagead2\.googlesyndication\.com/i.test(liveAdUnitSource));
    }
    assert.ok(html.includes('<script src="js/adSlots.js"></script>'));
    assert.ok(sw.includes("'/js/adSlots.js'"));
    assert.ok(sw.includes("'/privacy.html'"));
    assert.ok(sw.includes("'/rules.html'"));
    assert.ok(sw.includes("'/how-to-play.html'"));
    assert.ok(sw.includes("'/cards.html'"));
    assert.ok(sw.includes("'/ai-cpu.html'"));
    assert.ok(css.includes('.ad-slot'));
    assert.ok(css.includes('pointer-events: none;'));
    assert.ok(css.includes('.legal-links'));
    assert.ok(css.includes('.static-page section + section'));
    assert.ok(css.includes('width: min(100%, 720px);'));
    assert.ok(css.includes('@media (max-width: 480px)'));
    assert.ok(css.includes('padding: 16px 12px;'));
    assert.ok(css.includes('font-size: 26px;'));
    assert.ok(css.includes('.static-page-links a:focus-visible'));
    assert.ok(css.includes('padding: 4px 0;'));
    assert.ok(privacy.includes('広告審査中および広告表示時'));
    assert.ok(privacy.includes('Google AdSense'));
    assert.ok(privacy.includes('審査用スクリプト'));
    assert.ok(privacy.includes('仮の表示枠（placeholder）'));
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
    assert.ok(privacy.includes('ゲーム開始や終了を知らせる簡単な通知'));
    assert.ok(privacy.includes('プレイヤー名、ルームコード、再接続トークン'));
    assert.ok(privacy.includes('カード一覧'));
    assert.ok(privacy.includes('保存データ全体、ゲームの完全なスナップショットは含めません'));
    assert.ok(privacy.includes('ブラウザのサイトデータ削除'));
    assert.ok(privacy.includes('アプリ内の保存データ削除操作'));
    assert.ok(privacy.includes('公開リポジトリの issue'));
    assert.ok(privacy.includes('再接続トークン、通知本文、保存データなどの秘密情報'));
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
    assert.ok(rules.includes('サイコロの出目と同じ数字を持つ施設'));
    assert.ok(rules.includes('出やすい数字の施設'));
    assert.ok(rules.includes('建設フェーズ'));
    assert.ok(rules.includes('施設とランドマークの建設'));
    assert.ok(rules.includes('街の収入源'));
    assert.ok(rules.includes('コインを残したい場合'));
    assert.ok(rules.includes('保存と再開'));
    assert.ok(rules.includes('タイトル画面から続きが再開'));
    assert.ok(rules.includes('同じ端末から再接続'));
    assert.ok(html.includes('このゲームについて'));
    assert.ok(html.includes('サイコロで街を育てる対戦ゲーム'));
    assert.ok(html.includes('PWAとして起動'));
    assert.ok(howToPlay.includes('<h1>遊び方</h1>'));
    assert.ok(howToPlay.includes('<h2>ダイスシティとは</h2>'));
    assert.ok(howToPlay.includes('<h2>ゲームの目的と勝利条件</h2>'));
    assert.ok(howToPlay.includes('<h2>ターンの流れ</h2>'));
    assert.ok(howToPlay.includes('<h2>サイコロとカードの仕組み</h2>'));
    assert.ok(howToPlay.includes('<h2>PWAとして遊ぶ</h2>'));
    assert.ok(cardsPage.includes('<h1>カードとランドマーク</h1>'));
    assert.ok(cardsPage.includes('<h2>カードの色と発動条件</h2>'));
    assert.ok(cardsPage.includes('<h2>カードカテゴリ</h2>'));
    assert.ok(cardsPage.includes('<h2>ランドマークの役割</h2>'));
    assert.ok(aiCpu.includes('<h1>CPUとAI</h1>'));
    assert.ok(aiCpu.includes('<h2>CPU難易度</h2>'));
    assert.ok(aiCpu.includes('<h2>AI深層学習CPU</h2>'));
    assert.ok(aiCpu.includes('<h2>オンライン対戦でのCPU</h2>'));

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
    assert.ok(docs.includes('ダイスシティに本物の広告 SDK を入れる前段階'));
    assert.ok(!docs.includes('街コロに本物の広告 SDK'));
    assert.ok(docs.includes('AdSense 審査中は placeholder-only を維持'));
    assert.ok(docs.includes('審査後に将来 AdSense / AdMob / TWA 経由の広告に差し替えやすい場所と helper を固定'));
    assert.ok(docs.includes('## AdSense 審査中の禁止事項'));
    assert.ok(docs.includes('## 審査後に SDK を入れるときの注意'));
    assert.ok(docs.includes('AdSense 審査中の placeholder-only 状態では、SDK 未導入でも console error なしで起動する'));
    assert.ok(docs.includes('AdSense 審査中の docs/static 変更では `git diff --check`, `node tests/main.test.js`, `npm run test:static` が通る'));
    assert.ok(docs.includes('docs/static 変更でも URL/PWA/広告位置/ルール/広範な UI 挙動を変えない'));
    assert.ok(docs.includes('ad unit ids'));
    assert.ok(docs.includes('広告位置、PWA更新、公開URL、ゲームルールに影響する変更は docs/static 名目でも行わない'));
    assert.ok(!docs.includes('ad unit id)'));
    assert.ok(docs.includes('審査後に広告 SDK や広告実装を変更する場合は、追加で `npm run test:smoke`, `npm test` も通す'));
    assert.ok(docs.includes('AdSense 審査中は新しい広告 slot'));
    assert.ok(docs.includes('SDK adapter、広告位置変更、広告拡張を追加しない'));
    assert.ok(docs.includes('広告計画は `AdSense Review Change Policy` の例外ではない'));
    assert.ok(docs.includes('実広告ユニット'));
    assert.ok(docs.includes('data-ad-client'));
    assert.ok(docs.includes('data-ad-slot'));
    assert.ok(docs.includes('AdSense Review Change Policy'));
    assert.ok(docs.includes('`title-bottom`'));
    assert.ok(docs.includes('`rules-bottom`'));
    assert.ok(docs.includes('`result-bottom`'));
    assert.ok(docs.includes('公開用の `rules.html` には広告 placeholder を配置しない'));
    assert.ok(docs.includes('privacy.html` は広告の説明だけを置く静的ページ'));
    assert.ok(docs.includes('広告 placeholder や AdSense loader は配置しない'));
    assert.ok(docs.includes('ゲーム中の主要操作'));
    assert.ok(docs.includes('誤タップ誘導に見える文言'));
    assert.ok(docs.includes('報酬示唆'));
    assert.ok(releaseChecklist.includes('enabling ads after review'));
    assert.ok(releaseChecklist.includes('AdSense Review Change Policy'));
    assert.ok(releaseChecklist.includes('UI大改修'));
    assert.ok(releaseChecklist.includes('広告位置変更'));
    assert.ok(releaseChecklist.includes('PWA挙動変更'));
    assert.ok(releaseChecklist.includes('URL変更'));
    assert.ok(releaseChecklist.includes('ルール変更'));
    assert.ok(releaseChecklist.includes('大規模リファクタ'));
    assert.ok(releaseChecklist.includes('live ad units, SDK adapters, or ad expansion'));
    assert.ok(releaseChecklist.includes('docs/ADSENSE_SETUP.md'));
    assert.ok(releaseChecklist.includes('AdSense public URL setup / review recheck'));
    assert.ok(releaseChecklist.includes('Before public traffic, AdSense review submission/recheck, ads after review, or broader PWA install testing'));
    assert.ok(releaseChecklist.includes('ntfy topic for browser error and lifecycle notifications'));
    assert.ok(releaseChecklist.includes('Actions UI monitoring as the fallback'));
    assert.ok(releaseChecklist.includes('If delivery has not been proven by a controlled or real failure'));
    assert.ok(releaseChecklist.includes('client error and lifecycle reports only write server-side warnings'));
    assert.ok(releaseChecklist.includes('privacy.html'));
    assert.ok(releaseChecklist.includes('account-free play'));
    assert.ok(releaseChecklist.includes('lifecycle notification privacy'));
    assert.ok(releaseChecklist.includes('error notification exclusions'));
    assert.ok(releaseChecklist.includes('AdSense review script'));
    assert.ok(releaseChecklist.includes('future ad provider data use'));
    assert.ok(releaseChecklist.includes('Cookie handling'));
    assert.ok(releaseChecklist.includes('contact guidance'));
    assert.ok(releaseChecklist.includes('public-secret redaction guidance'));
    assert.ok(releaseChecklist.includes('last updated date'));
    assert.ok(releaseChecklist.includes('remain static explanation pages'));
    assert.ok(releaseChecklist.includes('no page script, form, button, `dialog` / `details` / `summary`, extra `src` asset load, embedded media element, inline event handler, app `id`/`data-*` attribute, `data-ui-action`, automatic redirect / meta refresh, ad placeholder, or AdSense loader'));
    assert.ok(releaseChecklist.includes('Run the URL metadata / external stylesheet / public-page link hint checks, public OGP/PWA icon reachability checks, local OGP/PWA icon dimension check, and static explanation page negative checks in `docs/ADSENSE_SETUP.md`'));
    assert.ok(releaseChecklist.includes('before submitting and when rechecking public pages during review'));
    assert.ok(releaseChecklist.includes('Static explanation page negative checks passed'));
    assert.ok(releaseChecklist.includes('Public page URL metadata, external stylesheet, and public-page link hint checks passed'));
    assert.ok(releaseChecklist.includes('Local OGP/PWA icon dimension checks passed'));
    assert.ok(releaseChecklist.includes('review-period static-page CSS expectations are locked by the public-page assertions in `node tests/main.test.js`'));
    assert.ok(releaseChecklist.includes('intentional review-period copy or shared CSS change'));
    assert.ok(releaseChecklist.includes('CI green does not cover the full local automated gate above'));
    assert.ok(releaseChecklist.includes('Unknown notification fixes, CI failure fixes, and minor shared CSS are emergency exceptions only when needed to preserve review stability'));
    assert.ok(releaseChecklist.includes('rules.html'));
    assert.ok(releaseChecklist.includes('explains the win condition'));
    assert.ok(releaseChecklist.includes('card selection works'));
    assert.ok(releaseChecklist.includes('facility/landmark construction works'));
    assert.ok(releaseChecklist.includes('save/resume works'));
    assert.ok(releaseChecklist.includes('both `og:image` and `twitter:image` pointing to `/icons/icon-512.png`'));
    assert.ok(releaseChecklist.includes('same-origin relative paths'));
    assert.ok(releaseChecklist.includes('image alt metadata'));
    assert.ok(releaseChecklist.includes('the local OGP/PWA icon dimension check in `docs/ADSENSE_SETUP.md` passes'));
    assert.ok(releaseChecklist.includes('OGP and PWA icon metadata sizes stay aligned with the 512x512 and 192x192 PNG assets'));
    assert.ok(releaseChecklist.includes('manifest `id`, `start_url`, language, display mode, theme colors, and portrait orientation stay stable'));
    assert.ok(releaseChecklist.includes('title-page PWA head metadata keeps one manifest link to `/manifest.webmanifest` and stays aligned with the manifest name, theme color, mobile web app flags, status bar style, and Apple touch icon'));
    assert.ok(releaseChecklist.includes('`og:site_name`, `og:type`, and `twitter:card` stay stable'));
    assert.ok(releaseChecklist.includes('exactly one charset, one viewport, one HTML title, one `robots` meta with `index,follow`, and one shared `style.css` stylesheet'));
    assert.ok(releaseChecklist.includes('review-period external CSS hosts'));
    assert.ok(releaseChecklist.includes('HTML title, OGP title, and Twitter title stay consistent and concise'));
    assert.ok(releaseChecklist.includes('public-page description / OGP / Twitter descriptions stay concise'));
    assert.ok(releaseChecklist.includes('public HTML metadata does not hardcode staging origins, localhost, or review-period external CSS hosts'));
    assert.ok(releaseChecklist.includes('do not add `canonical`, `og:url`, or `twitter:url` metadata'));
    assert.ok(releaseChecklist.includes('public-page tests currently lock those URL metadata tags out'));
    assert.ok(releaseChecklist.includes('do not add public-page link hints such as `preconnect`, `dns-prefetch`, `preload`, or `modulepreload`'));
    assert.ok(releaseChecklist.includes('public-page tests currently lock those external connection hints out'));
    assert.ok(releaseChecklist.includes('title page and rule-page metadata mention 登録不要 / no-registration play'));
    assert.ok(releaseChecklist.includes('privacy-page metadata mentions error reporting / lifecycle notifications / AdSense review / ad topics'));
    assert.ok(releaseChecklist.includes('pointer-events: none'));
    assert.ok(releaseChecklist.includes('no in-game ad slot'));
    assert.ok(releaseChecklist.includes('gameplay-near SDK placement'));
    assert.ok(releaseChecklist.includes('Live ad units (`<ins class="adsbygoogle">`, `data-ad-client`, `data-ad-slot`, ad unit ids) remain absent during review'));
    assert.ok(releaseChecklist.includes('Review cleanup must not add ad slots or move the review loader'));
    assert.ok(releaseChecklist.includes('After review, before adding ad slots or expanding beyond the review loader'));
    assert.ok(releaseChecklist.includes('do not add live ad units'));
    assert.ok(releaseChecklist.includes('<ins class="adsbygoogle">'));
    assert.ok(releaseChecklist.includes('data-ad-client'));
    assert.ok(releaseChecklist.includes('data-ad-slot'));
    assert.ok(readme.includes('docs/OPERATIONS.md'));
    assert.ok(readme.includes('unknown 通知の最優先対応'));
    assert.ok(readme.includes('AdSense Review Change Policy'));
    assert.ok(readme.includes('審査中は docs/static 中心に限定'));
    assert.ok(readme.includes('docs/static 変更でも URL/PWA/広告位置/ルール/広範な UI 挙動を変えません'));
    assert.ok(readme.includes('UI大改修、PWA挙動変更、URL変更、ルール変更、大規模リファクタ、実広告ユニット、SDK adapter、広告位置変更、広告拡張は行いません'));
    assert.ok(readme.includes('実広告ユニット'));
    assert.ok(readme.includes('SDK adapter'));
    assert.ok(readme.includes('docs/static 変更でも最低限 `git diff --check`, `node tests/main.test.js`, `npm run test:static`'));
    assert.ok(readme.includes('docs/RELEASE_CHECKLIST.md'));
    assert.ok(readme.includes('AdSense 審査中は `index.html` head の審査コードを1つだけ維持'));
    assert.ok(readme.includes('実広告ユニットや追加 loader は入れません'));
    assert.ok(readme.includes('AdSense 審査提出前 / 審査中の公開 URL 確認'));
    assert.ok(readme.includes('docs/ADSENSE_SETUP.md'));
    assert.ok(readme.includes('docs/ADS_PLAN.md'));
    assert.ok(readme.includes('静的ページ負の確認'));
    assert.ok(readme.includes('URLメタ / external stylesheet / public-page link hint 確認'));
    assert.ok(readme.includes('OGP/PWA icon 到達確認、ローカル寸法確認'));
    assert.ok(readme.includes('審査提出前と審査中の公開ページ再確認'));
    assert.ok(readme.includes('Static explanation page negative checks passed'));
    assert.ok(readme.includes('Public page URL metadata, external stylesheet, and public-page link hint checks passed'));
    assert.ok(readme.includes('Local OGP/PWA icon dimension checks passed'));
    assert.ok(readme.includes('`canonical` / `og:url` / `twitter:url`'));
    assert.ok(readme.includes('`preconnect` / `dns-prefetch` / `preload` / `modulepreload`'));
    assert.ok(readme.includes('外部接続方針変更'));
    assert.ok(readme.includes('AdSense 審査中の公開ページはトップページ'));
    assert.ok(readme.includes('トップページと `rules.html` の説明メタは登録不要のプレイ'));
    assert.ok(readme.includes('privacy.html` の説明メタはエラー通知・開始終了通知、AdSense審査、広告の説明を伝え、本文は開始終了通知のプライバシーと秘密情報の公開禁止も説明します'));
    assert.ok(readme.includes('rules.html` は勝利条件、施設とランドマークの建設、遊び方を公開 URL で確認できる'));
    assert.ok(readme.includes('施設とランドマークの建設'));
    assert.ok(readme.includes('公開ページは `robots` メタを `index,follow` に保ちます'));
    assert.ok(readme.includes('自動遷移や meta refresh を追加しません'));
    assert.ok(readme.includes('静的ページ CSS は共有 `style.css` に限定'));
    assert.ok(readme.includes('外部 CSS host を追加しません'));
    assert.ok(readme.includes('shared `style.css` を触る場合は狭いモバイル幅で本文と関連ページリンクのはみ出しも確認します'));
    assert.ok(readme.includes('manifest.json` / `manifest.webmanifest'));
    assert.ok(adsenseSetup.includes('when rechecking public pages during review'));
    assert.ok(adsenseSetup.includes('Public URL Checks After Render Deploy / During Review'));
    assert.ok(adsenseSetup.includes('html=$(curl -fsS "$PUBLIC_ORIGIN/$page")'));
    assert.ok(adsenseSetup.includes('Unexpected status or redirect for $path'));
    assert.ok(adsenseSetup.includes('<meta[^>]+http-equiv'));
    assert.ok(adsenseSetup.includes('stylesheet([[:space:]]|'));
    assert.ok(adsenseSetup.includes('href[[:space:]]*=[[:space:]]*["'));
    assert.ok(adsenseSetup.includes('Unexpected external stylesheet found in /$page'));
    assert.ok(adsenseSetup.includes('https?://'));
    assert.ok(adsenseSetup.includes('<base\\b'));
    assert.ok(adsenseSetup.includes('[[:space:]]on[a-z]+[[:space:]]*[=]'));
    assert.ok(adsenseSetup.includes('Do not submit to AdSense or treat a review-period public-page recheck as passing'));
    assert.ok(adsenseSetup.includes('indexable metadata'));
    assert.ok(adsenseSetup.includes('one charset, one viewport, and one HTML title'));
    assert.ok(adsenseSetup.includes('one shared `style.css` stylesheet'));
    assert.ok(adsenseSetup.includes('privacy policy is public, indexable'));
    assert.ok(adsenseSetup.includes('rules page is public, indexable'));
    assert.ok(adsenseSetup.includes('links back to the game and rules page'));
    assert.ok(adsenseSetup.includes('links back to the game and privacy policy'));
    assert.ok(adsenseSetup.includes('account registration or email address'));
    assert.ok(adsenseSetup.includes('contact guidance'));
    assert.ok(adsenseSetup.includes('public-secret redaction guidance'));
    assert.ok(adsenseSetup.includes('last updated date'));
    assert.ok(adsenseSetup.includes('lifecycle notification privacy'));
    assert.ok(adsenseSetup.includes('lifecycle notification exclusions for player names / room codes / reconnect tokens / card inventories / full snapshots'));
    assert.ok(adsenseSetup.includes('error notification exclusions'));
    assert.ok(adsenseSetup.includes('privacy.html` description / OGP / Twitter metadata mention account-free play, error reporting, start/finish lifecycle notifications, AdSense review, and ads'));
    assert.ok(adsenseSetup.includes('stale privacy-page content'));
    assert.ok(adsenseSetup.includes('<PUBLIC_ORIGIN>/privacy.html'));
    assert.ok(adsenseSetup.includes('<PUBLIC_ORIGIN>/rules.html'));
    assert.ok(adsenseSetup.includes('their description / OGP / Twitter metadata matches the current privacy and rule-page wording'));
    assert.ok(adsenseSetup.includes('If shared `style.css` changed during review, confirm both pages remain readable at narrow mobile width'));
    assert.ok(adsenseSetup.includes('does not hardcode staging origins or localhost into preview tags'));
    assert.ok(adsenseSetup.includes('for path in / /privacy.html /rules.html /manifest.json /manifest.webmanifest /icons/icon-192.png /icons/icon-512.png /sw.js; do'));
    assert.ok(adsenseSetup.includes('status=$(curl -fsSI -o /dev/null -w "%{http_code}" "$PUBLIC_ORIGIN$path")'));
    assert.ok(adsenseSetup.includes('if [ "$status" != "200" ]; then'));
    assert.ok(adsenseSetup.includes('<PUBLIC_ORIGIN>/manifest.webmanifest'));
    assert.ok(adsenseSetup.includes('<PUBLIC_ORIGIN>/icons/icon-192.png` and `<PUBLIC_ORIGIN>/icons/icon-512.png'));
    assert.ok(adsenseSetup.includes('OGP/PWA icon PNGs are reachable from the public origin; local dimension checks below verify they match the advertised sizes'));
    assert.ok(adsenseSetup.includes('Local icon dimension check before deploy'));
    assert.ok(adsenseSetup.includes('Local OGP/PWA icon dimension checks passed'));
    assert.ok(adsenseSetup.includes("struct.unpack('>II', data[16:24])"));
    assert.ok(adsenseSetup.includes('card selection'));
    assert.ok(adsenseSetup.includes('description / OGP / Twitter metadata'));
    assert.ok(adsenseSetup.includes('Keep each public-page description / OGP / Twitter description concise'));
    assert.ok(adsenseSetup.includes('Keep public-page titles consistent across HTML title, OGP, and Twitter metadata'));
    assert.ok(adsenseSetup.includes('referenced PNG assets remain 512x512 and 192x192'));
    assert.ok(adsenseSetup.includes('Keep `og:site_name`, `og:type`, and `twitter:card` stable'));
    assert.ok(adsenseSetup.includes('登録不要 / no-registration play'));
    assert.ok(adsenseSetup.includes('The title page is reachable from the public origin'));
    assert.ok(adsenseSetup.includes('account-free play, the win condition, card selection, facility and landmark construction, and save/resume'));
    assert.ok(adsenseSetup.includes('shared previews do not show stale rule-page content'));
    assert.ok(adsenseSetup.includes('remain static explanation pages without page scripts, forms, buttons, `dialog` / `details` / `summary`, extra `src` asset loads, embedded media elements, inline event handlers, app `id`/`data-*` attributes, `data-ui-action`, automatic redirects / meta refresh, ad placeholders, or an AdSense loader'));
    assert.ok(adsenseSetup.includes('<dialog|<details|<summary'));
    assert.ok(adsenseSetup.includes('`og:image` and `twitter:image` both point to `/icons/icon-512.png`'));
    assert.ok(adsenseSetup.includes('Preview image metadata should stay same-origin relative'));
    assert.ok(adsenseSetup.includes('image alt text is present'));
    assert.ok(adsenseSetup.includes('as advertised by metadata and manifests'));
    assert.ok(adsenseSetup.includes('facility and landmark construction'));
    assert.ok(adsenseSetup.includes('save/resume behavior'));
    assert.ok(adsenseSetup.includes('landmarks, and the last updated date'));
    assert.ok(adsenseSetup.includes('property="og:image" content="/icons/icon-512.png"'));
    assert.ok(adsenseSetup.includes('property="og:image:width" content="512"'));
    assert.ok(adsenseSetup.includes('property="og:image:height" content="512"'));
    assert.ok(adsenseSetup.includes('name="twitter:image" content="/icons/icon-512.png"'));
    assert.ok(adsenseSetup.includes('property="og:image:alt"'));
    assert.ok(adsenseSetup.includes('name="twitter:image:alt"'));
    assert.ok(adsenseSetup.includes('curl -fsS "$PUBLIC_ORIGIN/manifest.json" | grep -E "ダイスシティ|start_url|standalone|theme_color|portrait|192x192|512x512|icon-192|icon-512"'));
    assert.ok(adsenseSetup.includes('curl -fsS "$PUBLIC_ORIGIN/manifest.webmanifest" | grep -E "ダイスシティ|start_url|standalone|theme_color|portrait|192x192|512x512|icon-192|icon-512"'));
    assert.ok(adsenseSetup.includes('curl -fsS "$PUBLIC_ORIGIN/api/version" | grep -E "hash"'));
    assert.ok(adsenseSetup.includes('curl -fsS "$PUBLIC_ORIGIN/" | grep -E "index,follow|style.css|登録不要|privacy.html|rules.html|og:description|twitter:description|og:image|twitter:image|og:image:alt|twitter:image:alt"'));
    assert.ok(adsenseSetup.includes('curl -fsS "$PUBLIC_ORIGIN/rules.html" | grep -E "index,follow|style.css|privacy.html|アカウント登録なし|勝利条件|カード選択|サイコロの出目|施設とランドマークの建設|保存と再開|最終更新日: 2026-05-27|og:description|twitter:description|og:image|twitter:image|og:image:alt|twitter:image:alt"'));
    assert.ok(adsenseSetup.includes('curl -fsS "$PUBLIC_ORIGIN/privacy.html" | grep -E "index,follow|style.css|rules.html|アカウント登録'));
    assert.ok(adsenseSetup.includes('開始終了通知|ゲーム開始や終了|プレイヤー名|ルームコード|再接続トークン|カード一覧|保存データ全体|完全なスナップショット'));
    assert.ok(adsenseSetup.includes('実際の広告ユニット|お問い合わせ|秘密情報|最終更新日: 2026-05-27|og:description'));
    assert.ok(adsenseSetup.includes('Negative checks for review-mode URL metadata, external stylesheets, and public-page link hints on all public pages'));
    assert.ok(adsenseSetup.includes('canonical([[:space:]]|'));
    assert.ok(adsenseSetup.includes('(property|name)[[:space:]]*='));
    assert.ok(adsenseSetup.includes('og:url|twitter:url'));
    assert.ok(adsenseSetup.includes('preconnect|dns-prefetch|preload|modulepreload'));
    assert.ok(adsenseSetup.includes('Public page URL metadata, external stylesheet, and public-page link hint checks passed'));
    assert.ok(adsenseSetup.includes('Negative checks for the static explanation pages'));
    assert.ok(adsenseSetup.includes('for page in rules.html privacy.html; do'));
    assert.ok(adsenseSetup.includes('data-ad-client[[:space:]]*='));
    assert.ok(adsenseSetup.includes('data-ad-slot[[:space:]]*='));
    assert.ok(adsenseSetup.includes('[[:space:]]id[[:space:]]*='));
    assert.ok(adsenseSetup.includes('role[[:space:]]*=[[:space:]]*"button"'));
    assert.ok(adsenseSetup.includes('Unexpected active or embedded content found in $page'));
    assert.ok(adsenseSetup.includes('Static explanation page negative checks passed'));
    assert.ok(adsenseSetup.includes('/api/client-error-test'));
    assert.ok(adsenseSetup.includes('NTFY_TOPIC` is not public or guessable'));
    assert.ok(adsenseSetup.includes('Use `docs/OPERATIONS.md` as the source of truth for the full production environment list'));
    assert.ok(adsenseSetup.includes('NODE_ENV=production'));
    assert.ok(adsenseSetup.includes('BUILD_HASH'));
    assert.ok(adsenseSetup.includes('CLIENT_ERROR_ALLOW_NO_ORIGIN'));
    assert.ok(adsenseSetup.includes('ad surfaces remain placeholder-only'));
    assert.ok(adsenseSetup.includes('live ad units (`<ins class="adsbygoogle">`, `data-ad-client`, `data-ad-slot`, ad unit ids) remain absent until real ad units are intentionally configured after review'));
    assert.ok(adsenseSetup.includes('Do not add live ad units'));
    assert.ok(adsenseSetup.includes('<ins class="adsbygoogle">'));
    assert.ok(adsenseSetup.includes('data-ad-client'));
    assert.ok(adsenseSetup.includes('data-ad-slot'));
    assert.ok(adsenseSetup.includes('Allowed placeholder locations are `title-bottom`, `rules-bottom`, and `result-bottom` only'));
    assert.ok(adsenseSetup.includes('does not look like a reward, button, or call to action'));
    assert.ok(adsenseSetup.includes('pagead2.googlesyndication.com'));
    assert.ok(adsenseSetup.includes('index.html'));
    assert.ok(adsenseSetup.includes('Submission fixes during review must stay within `docs/OPERATIONS.md` の `AdSense Review Change Policy`'));
    assert.ok(adsenseSetup.includes('Before clicking submit in AdSense or after review-period public-page changes'));
    assert.ok(adsenseSetup.includes('/icons/icon-192.png` and `/icons/icon-512.png` are reachable from the public origin; the local dimension check confirms'));
    assert.ok(adsenseSetup.includes('Local OGP/PWA icon dimension checks pass for `icons/icon-192.png` and `icons/icon-512.png` before deploy'));
    assert.ok(adsenseSetup.includes('manifest / OGP advertised sizes'));
    assert.ok(adsenseSetup.includes('stale-client handling has been checked by comparing `/api/version` with `window.MACHIKORO_CLIENT_VERSION`'));
    assert.ok(adsenseSetup.includes('applicable Public Preflight Summary items are green'));
    assert.ok(adsenseSetup.includes('run the missing local checks before submission'));
    assert.ok(adsenseSetup.includes('do not use submission cleanup as a reason to change UI flow, ad placement, PWA behavior, URLs, game rules, or broad architecture'));
    assert.ok(adsenseSetup.includes('After review, if real ad units or an SDK adapter are intentionally added'));
    assert.ok(adsenseSetup.includes('after any post-review ad SDK/unit change or intentional public-page metadata/copy change'));
    assert.ok(operations.includes('AdSense Review Change Policy'));
    assert.ok(handoff.includes('AdSense Review Change Policy'));
    assert.ok(handoff.includes('審査中は docs/static 中心に限定'));
    assert.ok(handoff.includes('docs/static 変更でも URL/PWA/広告位置/ルール/広範な UI 挙動を変えない'));
    assert.ok(handoff.includes('unknown通知修正、CI失敗修正、軽微CSSの緊急例外も `docs/OPERATIONS.md` の条件内で扱う'));
    assert.ok(handoff.includes('UI大改修、PWA挙動変更、URL変更、ルール変更、大規模リファクタ、実広告ユニット、SDK adapter、広告位置変更、広告拡張を追加しない'));
    assert.ok(handoff.includes('`index.html` head の AdSense 審査 loader は1つだけ維持'));
    assert.ok(handoff.includes('追加 loader や live ad unit を入れない'));
    assert.ok(handoff.includes('`canonical` / `og:url` / `twitter:url`'));
    assert.ok(handoff.includes('`preconnect` / `dns-prefetch` / `preload` / `modulepreload`'));
    assert.ok(handoff.includes('公開ページの CSS は共有 `style.css` に限定'));
    assert.ok(handoff.includes('外部 CSS host を追加しない'));
    assert.ok(handoff.includes('URL 方針、外部接続方針、または CSS 配信方針の変更'));
    assert.ok(operations.includes('keep changes small and stability-focused'));
    assert.ok(operations.includes('Keep commits small'));
    assert.ok(operations.includes('enable ads after review, or enable PWA production traffic'));
    assert.ok(operations.includes('Before public traffic, AdSense review submission/recheck, ads after review, or wider PWA install testing'));
    assert.ok(operations.includes('For AdSense review submission/recheck, run the public URL, OGP/PWA icon reachability, local OGP/PWA icon dimension, URL metadata / external stylesheet / public-page link hint, and static explanation page negative checks in `docs/ADSENSE_SETUP.md`'));
    assert.ok(operations.includes('Public page URL metadata, external stylesheet, and public-page link hint checks passed'));
    assert.ok(operations.includes('Local OGP/PWA icon dimension checks passed'));
    assert.ok(operations.includes('Static explanation page negative checks passed'));
    assert.ok(operations.includes('docs cleanup'));
    assert.ok(operations.includes('OGP/image metadata wording'));
    assert.ok(operations.includes('how-to text'));
    assert.ok(operations.includes('Unknown notification fixes, CI failure fixes, and minor shared `style.css` changes are emergency exceptions'));
    assert.ok(operations.includes('static-page test hardening'));
    assert.ok(operations.includes('Unknown client-error notifications and CI failures are allowed during review'));
    assert.ok(operations.includes('For AdSense review or any code-free triage window'));
    assert.ok(operations.includes('decide whether submission/recheck should pause'));
    assert.ok(operations.includes('if relying on CI, confirm which commands CI covers'));
    assert.ok(operations.includes('do not hide the notification by only reclassifying or suppressing it'));
    assert.ok(operations.includes('typo fixes'));
    assert.ok(operations.includes('minor shared `style.css` changes'));
    assert.ok(operations.includes('Review-period static page CSS must stay on the shared `style.css`'));
    assert.ok(operations.includes('do not add external CSS hosts'));
    assert.ok(operations.includes('without automatic redirects or meta refresh'));
    assert.ok(operations.includes('Do not change during review: large UI redesigns, PWA behavior changes, URL changes, rule changes, and broad refactors'));
    assert.ok(operations.includes('Unknown notification fixes, CI failure fixes, and minor shared `style.css` changes are the only emergency exceptions'));
    assert.ok(operations.includes('large UI redesigns'));
    assert.ok(operations.includes('ad placement changes'));
    assert.ok(operations.includes('Live ad units'));
    assert.ok(operations.includes('SDK adapters'));
    assert.ok(operations.includes('Live ad units, SDK adapters, ad placement changes, and ad expansion are post-review only'));
    assert.ok(operations.includes('Do not treat incident response or CI cleanup as permission to add them during review'));
    assert.ok(operations.includes('PWA behavior changes'));
    assert.ok(operations.includes('URL changes'));
    assert.ok(operations.includes('rule changes'));
    assert.ok(operations.includes('broad refactors'));
    assert.ok(operations.includes('Public-page invariant additions during review should be tests/docs only'));
    assert.ok(operations.includes('do not change behavior, URLs, PWA update flow, ad placement, or game rules for invariant cleanup alone'));
    assert.ok(operations.includes('Treat `canonical`, `og:url`, and `twitter:url` metadata as URL policy changes during review'));
    assert.ok(operations.includes('Treat public-page link hints such as `preconnect`, `dns-prefetch`, `preload`, and `modulepreload` as external connection policy changes during review'));
    assert.ok(operations.includes('git diff --check'));
    assert.ok(operations.includes('node tests/main.test.js'));
    assert.ok(operations.includes('npm run test:static'));
    assert.ok(operations.includes('title page and rule-page metadata mention 登録不要 / no-registration play'));
    assert.ok(operations.includes('privacy-page metadata mentions error reporting / lifecycle notifications / AdSense review / ad topics'));
    assert.ok(operations.includes('If shared `style.css` changes during review, check `privacy.html` and `rules.html` at narrow mobile width'));
    assert.ok(operations.includes('lifecycle notification privacy'));
    assert.ok(operations.includes('rules.html` explains the win condition'));
    assert.ok(operations.includes('OGP/Twitter rule-page metadata current'));
    assert.ok(operations.includes('lifecycle notification privacy, contact guidance, public-secret redaction guidance, and the last updated date'));
    assert.ok(operations.includes('match the allowed-placement policy in `docs/ADS_PLAN.md`'));
});

runTest('operations docs は保守用contract guardrailを列挙している', () => {
    const operations = fs.readFileSync(path.join(__dirname, '..', 'docs/OPERATIONS.md'), 'utf8');

    assert.ok(operations.includes('Maintenance Contract Guardrails'));
    assert.ok(operations.includes('SOCKET_PAYLOAD_LIMITS'));
    assert.ok(operations.includes('`undoBuild` restore action audit'));
    assert.ok(operations.includes('Every `rejoinRoom` emit path must include `clientVersion`'));
    assert.ok(operations.includes('custom confirm modal contract'));
    assert.ok(operations.includes('Card/landmark detail and build-button HTML must escape'));
    assert.ok(operations.includes('redact reconnect tokens, session ids, shared client-error tokens'));
    assert.ok(operations.includes('Saved stats numbers must normalize to finite non-negative integers'));
    assert.ok(operations.includes('Restore action logs must reject unknown action names'));
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

runTest('docs は hostless restore の暫定quorum契約を記載している', () => {
    const hostless = fs.readFileSync(path.join(__dirname, '..', 'docs/HOSTLESS_RESTORE_DESIGN.md'), 'utf8');
    const adr = fs.readFileSync(path.join(__dirname, '..', 'docs/ADR_RESTORE_TRUST_BOUNDARY.md'), 'utf8');
    const decisions = fs.readFileSync(path.join(__dirname, '..', 'docs/IMPLEMENTATION_DECISIONS.md'), 'utf8');

    assert.ok(hostless.includes('Status: Accepted for staged implementation'));
    assert.ok(hostless.includes('Every candidate received in the collection window must have the same canonical'));
    assert.ok(hostless.includes('emergency server switch back'));
    assert.ok(hostless.includes('onlineRestoreRoomIndex'));
    assert.ok(hostless.includes('restoreAudit'));
    assert.ok(hostless.includes('restored room replacement remains host-only'));
    assert.ok(adr.includes('Option A remains the active implementation'));
    assert.ok(decisions.includes('Provisional quorum fallback accepted on 2026-07-19'));
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
