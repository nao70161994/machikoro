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
        crashScreen: makeElement(),
        crashMessage: makeElement(),
        crashResumeBtn: makeElement(),
        tabOnline: makeElement(),
        offlineNotice: makeElement(),
        pwaInstallBanner: makeElement(),
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
    const eventHandlers = {};
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
        console,
        Math,
        counters,
        elements,
        eventHandlers,
        localStorageData,
        timeouts,
        alerts,
        sentActions,
        document: {
            getElementById(id) {
                if (!elements[id]) elements[id] = makeElement();
                return elements[id];
            },
            querySelector(selector) {
                return null;
            },
            querySelectorAll() { return []; },
            createElement() { return makeElement(); },
            addEventListener(name, handler) { eventHandlers[`document:${name}`] = handler; },
        },
        window: {
            innerWidth: 360,
            addEventListener(name, handler) { eventHandlers[name] = handler; },
            matchMedia() { return { matches: !!options.standalone }; },
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
            if (group) group.querySelectorAll('.bc-chip').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            context.document.getElementById(inputId).value = btn.dataset.idx;
        },
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
            localStorageData,
            sentActions,
            alerts,
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

runTest('main createCpuPlayer は live v2simple 明示時も v2 既定modeを補う', () => {
    const rt = loadMainRuntime();
    const cpu = rt.createCpuPlayer('expert', {
        expertPurpose: "live",
        expertPreset: "v2simple",
    });

    assert.strictEqual(cpu.options.expertDiceMode, "strongCrowdThreshold");
    assert.strictEqual(cpu.options.expertRerollMode, "simple");
    assert.strictEqual(cpu.options.expertBuildMode, "ev");
    assert.strictEqual(cpu.options.expertBusinessMode, "harmfulGift");
    assert.strictEqual(cpu.options.expertComboMode, "core");
    assert.strictEqual(cpu.options.expertBuildTempoWeight, 0.05);
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
    assert.strictEqual(cpu.options.expertBusinessMode, "harmfulGift");
    assert.strictEqual(cpu.options.expertComboMode, "core");
    assert.strictEqual(cpu.options.expertBuildTempoWeight, 0.05);
    assert.strictEqual(cpu.options.expertAirportSkipMode, "whenNoLandmark");
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

runTest('main scheduleCPU は build failure なら nextTurn へ進めない', () => {
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
    assert.strictEqual(game.currentPlayerIndex, 0);
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
    const sibling = { classList: { remove(value) { removed.push(value); } } };
    const button = {
        disabled: false,
        dataset: { action: 'selectBusinessCard', idx: '2', inputId: 'myCardSelect' },
        classList: { add(value) { added.push(value); } },
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

    rt.pwaInstallPrompt();
    assert.strictEqual(prompted, true);
    assert.strictEqual(rt.__test.elements.pwaInstallBanner.style.display, 'none');
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

runTest('PWA と TWA の更新検知に必要な安全弁がある', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/build-apk.yml'), 'utf8');

    assert.ok(html.includes('refreshingByServiceWorker'));
    assert.ok(html.includes('let hadServiceWorkerController = !!navigator.serviceWorker.controller;'));
    assert.ok(html.includes('hadServiceWorkerController = true;'));
    assert.ok(html.includes('id="pwaUpdateBanner" class="pwa-banner"'));
    assert.ok(html.includes('id="pwaInstallBanner" class="pwa-banner"'));
    assert.ok(html.includes('id="noticeToast" class="notice-toast" role="status" aria-live="polite"'));
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
    assert.ok(html.includes('data-ui-action="showRules"'));
    assert.ok(html.includes('data-ui-action="switchTab" data-tab="online"'));
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
    assert.ok(css.includes('z-index: var(--z-modal);'));
    assert.ok(css.includes(':focus-visible'));
    assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
    assert.ok(css.includes('.notice-toast'));
    assert.ok(sw.includes("event.data?.type === 'SKIP_WAITING'"));
    assert.ok(sw.includes("const CACHE_NAME = 'machikoro-v4';"));
    const indexScripts = [...html.matchAll(/<script src=\"(js\/[^\"]+)\"/g)].map(match => `/${match[1]}`);
    const cachedAssets = [...sw.matchAll(/'([^']+)'/g)].map(match => match[1]);
    for (const script of indexScripts) {
        assert.ok(cachedAssets.includes(script), `${script} is missing from service worker cache`);
    }
    assert.ok(workflow.includes('test -s app-release-signed.apk'));
    assert.ok(workflow.includes('if-no-files-found: error'));
});

runTest('広告 placeholder は許可された画面だけに配置される', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const docs = fs.readFileSync(path.join(__dirname, '..', 'docs/ADS_PLAN.md'), 'utf8');
    const { AD_SLOT_CONFIGS, renderAdSlot } = require('../js/adSlots.js');

    assert.deepStrictEqual(Object.keys(AD_SLOT_CONFIGS).sort(), ['result-bottom', 'rules-bottom', 'title-bottom']);
    assert.ok(html.includes('id="adSlotTitleBottom" class="ad-slot-host" data-ad-slot-host="title-bottom"'));
    assert.ok(html.includes('id="adSlotRulesBottom" class="ad-slot-host" data-ad-slot-host="rules-bottom"'));
    assert.ok(html.includes('<script src="js/adSlots.js"></script>'));
    assert.ok(sw.includes("'/js/adSlots.js'"));
    assert.ok(css.includes('.ad-slot'));
    assert.ok(css.includes('pointer-events: none;'));

    const titleSlot = renderAdSlot('title-bottom');
    const rulesSlot = renderAdSlot('rules-bottom');
    const resultSlot = renderAdSlot('result-bottom');
    assert.ok(titleSlot.includes('data-ad-location="title-bottom"'));
    assert.ok(rulesSlot.includes('data-ad-location="rules-bottom"'));
    assert.ok(resultSlot.includes('data-ad-location="result-bottom"'));
    assert.strictEqual(renderAdSlot('game-action'), '');
    assert.ok(docs.includes('AdSense / AdMob'));
    assert.ok(docs.includes('ゲーム中の主要操作'));
});

runTest('docs は live v2simple の実装済み既定値を記載している', () => {
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    const claude = fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8');
    const diagnostics = fs.readFileSync(path.join(__dirname, '..', 'docs/expert-v2-diagnostics.md'), 'utf8');

    for (const doc of [readme, claude, diagnostics]) {
        assert.ok(doc.includes('dice=strongCrowdThreshold'));
        assert.ok(doc.includes('business=harmfulGift'));
        assert.ok(doc.includes('airportSkip=whenNoLandmark'));
    }
    assert.ok(!claude.includes('business=simple` を維持'));
});

if (process.exitCode) {
    throw new Error('mainテストで失敗が発生しました');
}
