const assert = require('assert');
const vm = require('vm');
const { createStorage, loadScripts, makeElement, runTest } = require('./helpers/test-utils');

function loadUiRuntime() {
    const { localStorage } = createStorage();
    const elements = {
        titleScreen: makeElement(),
        gameScreen: makeElement(),
        pwaUpdateBanner: makeElement(),
        pwaInstallBanner: makeElement(),
        tabContentLocal: makeElement(),
        tabContentOnline: makeElement(),
        tabContentStats: makeElement(),
        tabLocal: makeElement(),
        tabOnline: makeElement(),
        tabStats: makeElement(),
        onlineCreate: makeElement(),
        onlineJoin: makeElement(),
        onlineTabCreate: makeElement(),
        onlineTabJoin: makeElement(),
        status: makeElement(),
        btnRoll: makeElement(),
        btnSkip: makeElement(),
        btnReroll: makeElement(),
        diceChoose: makeElement(),
        buildMenu: makeElement(),
        log: makeElement(),
        logTitle: makeElement(),
        logSummary: makeElement(),
        pendingModal: makeElement(),
        pendingMenu: makeElement(),
        noticeToast: makeElement(),
        noticeToastMessage: makeElement(),
        rulesModal: makeElement(),
        cardSelectModal: makeElement(),
        cardDetailModal: makeElement(),
        confirmModal: makeElement(),
        confirmMessage: makeElement(),
        confirmOkBtn: makeElement(),
        confirmCancelBtn: makeElement(),
        players: makeElement(),
        tutorialBox: makeElement(),
    };
    const context = {
        console,
        localStorage,
        document: {
            activeElement: null,
            body: makeElement(),
            getElementById(id) {
                if (!elements[id]) elements[id] = makeElement();
                return elements[id];
            },
            addEventListener() {},
        },
        enabledLandmarks: new Set(['駅', 'ショッピングモール', '遊園地', '電波塔', '港', '空港']),
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
        SHOP_STOCK: { 麦畑: 6, 牧場: 6, パン屋: 6, カフェ: 6, コンビニ: 6 },
        undoState: null,
        prevCoins: null,
        lastWinnerName: '',
        winStreak: 0,
        winSoundPlayed: false,
        renderStatsCalls: 0,
        recordCalls: 0,
        saveGameCalls: 0,
        clearOnlineSessionStorageCalls: 0,
        crashErr: '',
        updateResumeButton() {},
        startConfetti() {},
        stopConfetti() {},
        showTurnAnnouncer() {},
        showCrashScreen(err) { context.crashErr = String(err && (err.message || err.stack) || err); },
        syncTutorialControls() {},
        renderDiceChoose() {},
        renderPending() {},
        renderTutorial() {},
        updateDiceDisplay() {},
        checkAutoSkip() {},
        playSound() {},
        showCardDetail() {},
        showLandmarkDetail() {},
        escapeHtml(value) { return String(value); },
        renderStats() { context.renderStatsCalls++; },
        recordGameStats() { context.recordCalls++; },
        saveGameState() { context.saveGameCalls++; },
        clearOnlineSessionStorage() { context.clearOnlineSessionStorageCalls++; localStorage.removeItem('onlineSession'); },
        LOG_TYPES: {
            DICE: 'dice',
            GAIN: 'gain',
            LOSE: 'lose',
            BUILD: 'build',
            SPECIAL: 'special',
            SYSTEM: 'system',
            ERROR: 'error',
        },
        GAME_PHASES: {
            ROLL: 'roll',
            BUILD: 'build',
            PENDING: 'pending',
        },
        game: null,
        alertMessages: [],
        alert(message) { context.alertMessages.push(message); },
        setTimeout(fn) { context.lastTimeout = fn; return 1; },
        clearTimeout() {},
    };
    context.global = context;
    context.globalThis = context;
    vm.createContext(context);
    loadScripts(context, ['js/Card.js', 'js/Player.js', 'js/ui.js']);
    return { context, elements };
}

runTest('showNotice は non-blocking toast で通知する', () => {
    const { context, elements } = loadUiRuntime();

    context.showNotice('通知テスト');

    assert.deepStrictEqual(context.alertMessages, []);
    assert.strictEqual(elements.noticeToast.style.display, 'flex');
    assert.strictEqual(elements.noticeToastMessage.textContent, '通知テスト');
    context.hideNotice();
    assert.strictEqual(elements.noticeToast.style.display, 'none');
});

runTest('modal helpers は dialog 属性と表示状態を管理する', () => {
    const { context, elements } = loadUiRuntime();

    context.showRules();

    assert.strictEqual(elements.rulesModal.style.display, 'flex');
    assert.strictEqual(elements.rulesModal.getAttribute('role'), 'dialog');
    assert.strictEqual(elements.rulesModal.getAttribute('aria-modal'), 'true');
    assert.strictEqual(elements.titleScreen.inert, true);
    assert.strictEqual(elements.gameScreen.inert, true);
    assert.strictEqual(elements.titleScreen.getAttribute('aria-hidden'), 'true');
    assert.strictEqual(elements.titleScreen.style.pointerEvents, 'none');
    assert.strictEqual(elements.gameScreen.style.pointerEvents, 'none');

    context.closeRules();

    assert.strictEqual(elements.rulesModal.style.display, 'none');
    assert.strictEqual(elements.titleScreen.inert, undefined);
    assert.strictEqual(elements.gameScreen.inert, undefined);
    assert.strictEqual(elements.titleScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(elements.titleScreen.style.pointerEvents, '');
    assert.strictEqual(elements.gameScreen.style.pointerEvents, '');
});

runTest('modal helpers は既存の背景 pointer-events を復元する', () => {
    const { context, elements } = loadUiRuntime();
    elements.titleScreen.style.pointerEvents = 'auto';

    context.showRules();
    assert.strictEqual(elements.titleScreen.style.pointerEvents, 'none');

    context.closeRules();
    assert.strictEqual(elements.titleScreen.style.pointerEvents, 'auto');
});

runTest('modal open は背景をaria-hiddenにする前にfocusをmodalへ移す', () => {
    const { context, elements } = loadUiRuntime();
    let hiddenWhileFocusedInTitle = false;
    const opener = makeElement();
    elements.titleScreen.contains = target => target === opener;
    elements.rulesModal.focus = () => { context.document.activeElement = elements.rulesModal; };
    context.document.activeElement = opener;
    const originalSetAttribute = elements.titleScreen.setAttribute.bind(elements.titleScreen);
    elements.titleScreen.setAttribute = (name, value) => {
        if (name === 'aria-hidden' && elements.titleScreen.contains(context.document.activeElement)) {
            hiddenWhileFocusedInTitle = true;
        }
        originalSetAttribute(name, value);
    };

    context.showRules();

    assert.strictEqual(hiddenWhileFocusedInTitle, false);
    assert.strictEqual(context.document.activeElement, elements.rulesModal);
});

runTest('modal keydown handler はTab focus escapeをmodal内へ戻す', () => {
    const { context, elements } = loadUiRuntime();
    let prevented = false;
    let focused = false;
    elements.rulesModal.contains = () => false;
    elements.rulesModal.querySelectorAll = () => [{
        disabled: false,
        getAttribute() { return null; },
        focus() { focused = true; },
    }];

    context.showRules();
    context.handleModalKeydown({
        key: 'Tab',
        preventDefault() { prevented = true; },
    });

    assert.strictEqual(prevented, true);
    assert.strictEqual(focused, true);
});

runTest('modal keydown handler はEscapeで閉じる', () => {
    const { context, elements } = loadUiRuntime();
    let prevented = false;

    context.showRules();
    context.handleModalKeydown({
        key: 'Escape',
        preventDefault() { prevented = true; },
    });

    assert.strictEqual(prevented, true);
    assert.strictEqual(elements.rulesModal.style.display, 'none');
});

runTest('modal close は背景の既存aria-hiddenを復元する', () => {
    const { context, elements } = loadUiRuntime();
    elements.gameScreen.setAttribute('aria-hidden', 'false');

    context.showRules();
    context.handleModalKeydown({ key: 'Escape', preventDefault() {} });

    assert.strictEqual(elements.rulesModal.style.display, 'none');
    assert.strictEqual(elements.titleScreen.inert, undefined);
    assert.strictEqual(elements.gameScreen.getAttribute('aria-hidden'), 'false');
});

runTest('switchTab は stats タブ表示時に renderStats とaria-selectedを更新する', () => {
    const { context, elements } = loadUiRuntime();

    context.switchTab('stats');

    assert.strictEqual(elements.tabContentLocal.style.display, 'none');
    assert.strictEqual(elements.tabContentOnline.style.display, 'none');
    assert.strictEqual(elements.tabContentStats.style.display, 'block');
    assert.strictEqual(context.renderStatsCalls, 1);
    assert.strictEqual(elements.tabLocal.getAttribute('aria-selected'), 'false');
    assert.strictEqual(elements.tabOnline.getAttribute('aria-selected'), 'false');
    assert.strictEqual(elements.tabStats.getAttribute('aria-selected'), 'true');
});

runTest('switchOnlineTab は online tab のaria-selectedを更新する', () => {
    const { context, elements } = loadUiRuntime();

    context.switchOnlineTab('join');

    assert.strictEqual(elements.onlineCreate.style.display, 'none');
    assert.strictEqual(elements.onlineJoin.style.display, 'block');
    assert.strictEqual(elements.onlineTabCreate.getAttribute('aria-selected'), 'false');
    assert.strictEqual(elements.onlineTabJoin.getAttribute('aria-selected'), 'true');
});

runTest('render helper は勝利・通常描画・保存境界へ分かれている', () => {
    const { context } = loadUiRuntime();

    assert.strictEqual(typeof context.renderWinnerState, 'function');
    assert.strictEqual(typeof context.renderActiveGameState, 'function');
    assert.strictEqual(typeof context.persistAfterRender, 'function');
    assert.strictEqual(typeof context.shouldShowPendingForCurrentPlayer, 'function');
    assert.strictEqual(typeof context.updatePendingModalContent, 'function');

    context.persistAfterRender();

    assert.strictEqual(context.saveGameCalls, 1);
});

runTest('renderWinnerState はオンライン復元bundleをまとめて消す', () => {
    const { context, elements } = loadUiRuntime();
    const winner = { name: 'Alice', coins: 20, cards: [], landmarks: {}, itVentureCoins: 0, isDormant() { return false; } };
    const opponent = { name: 'Bob', coins: 3, cards: [], landmarks: {}, itVentureCoins: 0, isDormant() { return false; } };
    context.game = {
        players: [winner, opponent],
        currentPlayerIndex: 0,
        turnCount: 12,
    };
    context.cpuPlayers = [null, null];
    context.localStorage.setItem('savedGame', '{}');
    context.localStorage.setItem('onlineSession', '{}');

    context.renderWinnerState(winner);

    assert.strictEqual(context.localStorage.getItem('savedGame'), null);
    assert.strictEqual(context.localStorage.getItem('onlineSession'), null);
    assert.strictEqual(context.clearOnlineSessionStorageCalls, 1);
    assert.strictEqual(elements.btnRoll.disabled, true);
});

runTest('updatePendingModalContent は再入とDOM欠落を安全に扱う', () => {
    const { context } = loadUiRuntime();
    const modal = makeElement();
    let writeCount = 0;
    let currentHtml = '';
    const el = makeElement();
    Object.defineProperty(el, 'innerHTML', {
        get() { return currentHtml; },
        set(value) {
            writeCount++;
            currentHtml = value;
            context.updatePendingModalContent(el, modal, '<p>recursive</p>');
        },
    });

    assert.strictEqual(context.updatePendingModalContent(null, modal, '<p>x</p>'), false);
    assert.strictEqual(context.updatePendingModalContent(el, null, '<p>x</p>'), false);
    assert.strictEqual(context.updatePendingModalContent(el, modal, '<p>x</p>'), true);
    assert.strictEqual(currentHtml, '<p>x</p>');
    assert.strictEqual(writeCount, 1);
    assert.strictEqual(modal.style.display, 'flex');

    assert.strictEqual(context.updatePendingModalContent(el, modal, ''), true);
    assert.strictEqual(currentHtml, '');
    assert.strictEqual(modal.style.display, 'none');
});

runTest('renderDiceChoose は allowedActionsFor と同期してdice/harbor選択を表示する', () => {
    const { context, elements } = loadUiRuntime();
    context.GAME_PHASES.SELECT_DICE = 'selectDice';
    context.GAME_PHASES.REROLL_CONFIRM = 'rerollConfirm';
    context.GAME_PHASES.HARBOR_CHOICE = 'harborChoice';
    context.GameManager = {
        allowedActionsFor(game) { return new Set(game.allowed || []); },
    };
    context.game = {
        phase: 'selectDice',
        currentPlayerIndex: 0,
        allowed: [],
        lastDiceResult: 10,
    };
    context.cpuPlayers = [null, null];

    context.renderDiceChoose();
    assert.strictEqual(elements.diceChoose.innerHTML, '');

    context.game.allowed = ['selectDice'];
    context.renderDiceChoose();
    assert.ok(elements.diceChoose.innerHTML.includes('data-action="selectDiceCount"'));
    assert.strictEqual(elements.diceChoose.style.display, 'block');

    context.game.phase = 'rerollConfirm';
    context.game.allowed = ['rerollDice', 'skipReroll'];
    elements.diceChoose.style.display = 'none';
    context.renderDiceChoose();
    assert.ok(elements.diceChoose.innerHTML.includes('data-action="rerollDice"'));
    assert.ok(elements.diceChoose.innerHTML.includes('data-action="skipReroll"'));
    assert.strictEqual(elements.diceChoose.style.display, 'block');

    context.game.allowed = [];
    context.renderDiceChoose();
    assert.strictEqual(elements.diceChoose.innerHTML, '');
    assert.strictEqual(elements.diceChoose.style.display, 'none');

    context.game.phase = 'harborChoice';
    context.game.allowed = ['selectDice'];
    context.renderDiceChoose();
    assert.strictEqual(elements.diceChoose.innerHTML, '');

    context.game.allowed = ['resolveHarbor'];
    elements.diceChoose.style.display = 'none';
    context.renderDiceChoose();
    assert.ok(elements.diceChoose.innerHTML.includes('data-action="resolveHarbor"'));
    assert.ok(!elements.diceChoose.innerHTML.includes(' disabled'));
    assert.strictEqual(elements.diceChoose.style.display, 'block');
});

runTest('renderPending は allowedActionsFor の先頭pending actionだけを表示する', () => {
    const { context, elements } = loadUiRuntime();
    const makePlayer = (name, cardNames) => ({
        name,
        coins: 3,
        cards: cardNames.map(cardName => ({ name: cardName, color: 'blue' })),
        getMinorCards() { return this.cards; },
        isDormant() { return false; },
    });
    context.GameManager = {
        nextPendingActionFor() { return { action: 'resolveTV', field: 'pendingTV', count: 1 }; },
        allowedActionsFor(game) { return new Set(game.allowed || []); },
    };
    context.game = {
        phase: 'pending',
        currentPlayerIndex: 0,
        allowed: ['resolveBusiness'],
        pendingTV: 1,
        pendingBusiness: 1,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        players: [makePlayer('Alice', ['麦畑']), makePlayer('Bob', ['牧場'])],
        currentPlayer() { return this.players[this.currentPlayerIndex]; },
    };

    context.renderPending();
    assert.strictEqual(elements.pendingModal.style.display, 'none');
    assert.strictEqual(elements.pendingModal.style.pointerEvents, '');
    assert.strictEqual(elements.pendingMenu.style.pointerEvents, '');
    assert.strictEqual(elements.pendingMenu.innerHTML, '');

    context.game.allowed = ['resolveTV'];
    context.renderPending();
    assert.strictEqual(elements.pendingModal.style.display, 'flex');
    assert.strictEqual(elements.pendingModal.style.pointerEvents, 'auto');
    assert.strictEqual(elements.pendingMenu.style.pointerEvents, 'auto');
    assert.ok(elements.pendingMenu.innerHTML.includes('data-action="resolveTV"'));
    assert.ok(!elements.pendingMenu.innerHTML.includes('data-action="resolveBusiness"'));
});

runTest('renderActiveGameState は skip/end turn を allowedActions と online gate に同期する', () => {
    const { context, elements } = loadUiRuntime();
    const player = {
        name: 'Alice',
        coins: 5,
        cards: [],
        landmarks: { 駅: false },
        countCardIncludingDormant() { return 0; },
        isDormant() { return false; },
    };
    context.GameManager = { allowedActionsFor(game) { return new Set(game.allowed || []); } };
    context.game = {
        phase: 'build',
        currentPlayerIndex: 0,
        turnCount: 1,
        builtThisTurn: false,
        pendingRenovation: 0,
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingIT: false,
        allowed: [],
        lastDice1: 0,
        lastDice2: 0,
        lastDiceResult: 0,
        log: [],
        players: [player],
        currentPlayer() { return this.players[this.currentPlayerIndex]; },
    };
    context.cpuPlayers = [null];

    context.renderActiveGameState(player);
    assert.strictEqual(elements.btnSkip.disabled, true);

    context.game.allowed = ['nextTurn'];
    context.renderActiveGameState(player);
    assert.strictEqual(elements.btnSkip.disabled, false);

    context.isOnlineGame = true;
    context.myPlayerIndex = 0;
    context.onlineActionInFlight = false;
    context.socket = { connected: true };
    context.renderActiveGameState(player);
    assert.strictEqual(elements.btnSkip.disabled, false);

    context.onlineActionInFlight = true;
    context.renderActiveGameState(player);
    assert.strictEqual(elements.btnSkip.disabled, true);

    context.onlineActionInFlight = false;
    context.isReconnectingOnline = true;
    context.renderActiveGameState(player);
    assert.strictEqual(elements.btnSkip.disabled, true);

    context.isReconnectingOnline = false;
    context.socket = { connected: false };
    context.renderActiveGameState(player);
    assert.strictEqual(elements.btnSkip.disabled, true);

    delete context.socket;
    context.renderActiveGameState(player);
    assert.strictEqual(elements.btnSkip.disabled, true);
});

runTest('renderActiveGameState は CPUターンと他人オンラインターンで主要ボタンを無効にする', () => {
    const { context, elements } = loadUiRuntime();
    const player = {
        name: 'Alice',
        coins: 5,
        cards: [],
        landmarks: { 駅: false },
        countCardIncludingDormant() { return 0; },
        isDormant() { return false; },
    };
    context.GameManager = { allowedActionsFor(game) { return new Set(game.allowed || []); } };
    context.game = {
        phase: 'roll',
        currentPlayerIndex: 0,
        turnCount: 1,
        builtThisTurn: false,
        pendingRenovation: 0,
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingIT: false,
        allowed: ['rollDice', 'nextTurn'],
        lastDice1: 0,
        lastDice2: 0,
        lastDiceResult: 0,
        log: [],
        players: [player],
        currentPlayer() { return this.players[this.currentPlayerIndex]; },
    };

    context.cpuPlayers = [{ difficulty: 'normal' }];
    context.renderActiveGameState(player);
    assert.strictEqual(elements.btnRoll.disabled, true);
    assert.strictEqual(elements.btnSkip.disabled, true);

    context.cpuPlayers = [null];
    context.isOnlineGame = true;
    context.myPlayerIndex = 1;
    context.socket = { connected: true };
    context.renderActiveGameState(player);
    assert.strictEqual(elements.btnRoll.disabled, true);
    assert.strictEqual(elements.btnSkip.disabled, true);
});

runTest('renderBuildMenu は buildCard/buildLandmark/undoBuild を allowedActions と online gate に同期する', () => {
    const { context, elements } = loadUiRuntime();
    const player = {
        name: 'Alice',
        coins: 10,
        cards: [],
        landmarks: { 駅: false },
        countCardIncludingDormant() { return 0; },
        isDormant() { return false; },
    };
    context.GameManager = { allowedActionsFor(game) { return new Set(game.allowed || []); } };
    context.game = {
        phase: 'build',
        currentPlayerIndex: 0,
        builtThisTurn: false,
        pendingRenovation: 0,
        allowed: [],
        currentPlayer() { return player; },
    };
    context.cpuPlayers = [null];
    context.enabledLandmarks = new Set(['駅']);

    context.renderBuildMenu();
    assert.ok(/data-action="buildCard"[^>]+disabled/.test(elements.buildMenu.innerHTML));
    assert.ok(/data-action="buildLandmark"[^>]+disabled/.test(elements.buildMenu.innerHTML));

    context.game.allowed = ['buildCard'];
    context.renderBuildMenu();
    assert.ok(/data-action="buildCard"[^>]+data-card-name="麦畑"(?![^>]+disabled)/.test(elements.buildMenu.innerHTML));
    assert.ok(/data-action="buildLandmark"[^>]+disabled/.test(elements.buildMenu.innerHTML));

    context.game.allowed = ['buildCard', 'buildLandmark'];
    context.renderBuildMenu();
    assert.ok(/data-action="buildLandmark"[^>]+data-landmark-name="駅"(?![^>]+disabled)/.test(elements.buildMenu.innerHTML));

    context.isOnlineGame = true;
    context.myPlayerIndex = 0;
    context.socket = { connected: true };
    context.renderBuildMenu();
    assert.ok(/data-action="buildCard"[^>]+data-card-name="麦畑"(?![^>]+disabled)/.test(elements.buildMenu.innerHTML));

    context.onlineActionInFlight = true;
    context.renderBuildMenu();
    assert.ok(/data-action="buildCard"[^>]+data-card-name="麦畑"[^>]+disabled/.test(elements.buildMenu.innerHTML));

    context.onlineActionInFlight = false;
    context.isReconnectingOnline = true;
    context.renderBuildMenu();
    assert.ok(/data-action="buildCard"[^>]+data-card-name="麦畑"[^>]+disabled/.test(elements.buildMenu.innerHTML));

    context.isReconnectingOnline = false;
    context.socket = { connected: false };
    context.renderBuildMenu();
    assert.ok(/data-action="buildCard"[^>]+data-card-name="麦畑"[^>]+disabled/.test(elements.buildMenu.innerHTML));

    context.isOnlineGame = false;
    context.onlineActionInFlight = false;
    context.game.builtThisTurn = true;
    context.game.allowed = ['undoBuild'];
    context.undoState = { cardName: '麦畑' };
    context.renderBuildMenu();
    assert.ok(elements.buildMenu.innerHTML.includes('data-action="undoBuild"'));

    context.game.allowed = [];
    context.renderBuildMenu();
    assert.ok(!elements.buildMenu.innerHTML.includes('data-action="undoBuild"'));
});

runTest('renderPending は online input block 中に resolver を表示しない', () => {
    const { context, elements } = loadUiRuntime();
    const makePlayer = (name, cardNames) => ({
        name,
        coins: 3,
        cards: cardNames.map(cardName => ({ name: cardName, color: 'blue' })),
        getMinorCards() { return this.cards; },
        isDormant() { return false; },
    });
    context.GameManager = {
        nextPendingActionFor() { return { action: 'resolveTV', field: 'pendingTV', count: 1 }; },
        allowedActionsFor(game) { return new Set(game.allowed || []); },
    };
    context.game = {
        phase: 'pending',
        currentPlayerIndex: 0,
        allowed: ['resolveTV'],
        pendingTV: 1,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        players: [makePlayer('Alice', ['麦畑']), makePlayer('Bob', ['牧場'])],
        currentPlayer() { return this.players[this.currentPlayerIndex]; },
    };
    context.cpuPlayers = [null, null];
    context.isOnlineGame = true;
    context.myPlayerIndex = 0;
    context.socket = { connected: true };

    context.renderPending();
    assert.strictEqual(elements.pendingModal.style.display, 'flex');
    assert.ok(elements.pendingMenu.innerHTML.includes('data-action="resolveTV"'));

    context.isReconnectingOnline = true;
    context.renderPending();
    assert.strictEqual(elements.pendingModal.style.display, 'none');
    assert.strictEqual(elements.pendingMenu.innerHTML, '');
});

runTest('UI更新関数は対象DOM欠落時に例外化しない', () => {
    const { context } = loadUiRuntime();
    const originalGetElementById = context.document.getElementById;
    const originalQuerySelector = context.document.querySelector;
    context.document.getElementById = () => null;
    context.document.querySelector = () => null;

    assert.doesNotThrow(() => context.renderDiceChoose());
    assert.doesNotThrow(() => context.renderBuildMenu());
    assert.doesNotThrow(() => context.renderCardSelectModal());
    assert.doesNotThrow(() => context.toggleSet('unknown-set'));
    assert.strictEqual(context.toggleLog(), false);
    assert.strictEqual(context.showCardDetail('麦畑'), false);
    assert.strictEqual(context.showConfirm('確認', () => { throw new Error('missing modal should not accept'); }), false);
    assert.deepStrictEqual(context.alertMessages, ['確認ダイアログを表示できません']);

    context.document.getElementById = originalGetElementById;
    context.document.querySelector = originalQuerySelector;
});

runTest('render は勝利時に recordGameStats を一度だけ呼ぶ', () => {
    const { context, elements } = loadUiRuntime();
    context.game = {
        turnCount: 8,
        currentPlayerIndex: 0,
        phase: 'build',
        log: [],
        players: [
            {
                name: 'Alice',
                coins: 10,
                cards: [],
                landmarks: { 駅: true, ショッピングモール: true, 遊園地: true, 電波塔: true, 港: false, 空港: false },
                isDormant() { return false; },
            },
            {
                name: 'Bob',
                coins: 3,
                cards: [],
                landmarks: { 駅: false, ショッピングモール: false, 遊園地: false, 電波塔: false, 港: false, 空港: false },
                isDormant() { return false; },
            },
        ],
        currentPlayer() { return this.players[this.currentPlayerIndex]; },
        checkWinner() { return this.players[0]; },
    };

    context.render();
    context.render();

    assert.strictEqual(context.crashErr, '');
    assert.strictEqual(context.recordCalls, 1);
    assert.ok(elements.status.innerHTML.includes('Aliceの勝利'));
});

runTest('render は同じ勝利画面の再描画で連勝数を二重加算しない', () => {
    const { context } = loadUiRuntime();
    context.lastWinnerName = 'Alice';
    context.winStreak = 2;
    context.game = {
        turnCount: 8,
        currentPlayerIndex: 0,
        phase: 'build',
        log: [],
        players: [
            {
                name: 'Alice',
                coins: 10,
                cards: [],
                landmarks: { 駅: true, ショッピングモール: true, 遊園地: true, 電波塔: true, 港: false, 空港: false },
                isDormant() { return false; },
            },
            {
                name: 'Bob',
                coins: 3,
                cards: [],
                landmarks: { 駅: false, ショッピングモール: false, 遊園地: false, 電波塔: false, 港: false, 空港: false },
                isDormant() { return false; },
            },
        ],
        currentPlayer() { return this.players[this.currentPlayerIndex]; },
        checkWinner() { return this.players[0]; },
    };

    context.render();
    const first = context.localStorage.getItem('winStreak');
    context.render();
    const second = context.localStorage.getItem('winStreak');

    assert.strictEqual(first, '3');
    assert.strictEqual(second, '3');
});

runTest('renderPending は Business Center chip を data-action で描画する', () => {
    const { context, elements } = loadUiRuntime();
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
        players: [makePlayer('Alice', ['麦畑', 'パン屋']), makePlayer('Bob', ['牧場'])],
        currentPlayer() { return this.players[this.currentPlayerIndex]; },
    };

    context.renderPending();

    assert.strictEqual(elements.pendingModal.style.display, 'flex');
    assert.strictEqual(elements.pendingModal.style.pointerEvents, 'auto');
    assert.strictEqual(elements.pendingMenu.style.pointerEvents, 'auto');
    assert.ok(elements.pendingMenu.innerHTML.includes('data-action="selectBusinessCard"'));
    assert.ok(elements.pendingMenu.innerHTML.includes('data-input-id="myCardSelect"'));
    assert.ok(elements.pendingMenu.innerHTML.includes('data-input-id="theirCardSelect_1"'));
    assert.ok(elements.pendingMenu.innerHTML.includes('aria-pressed="true"'));
    assert.ok(elements.pendingMenu.innerHTML.includes('aria-pressed="false"'));
    assert.ok(!elements.pendingMenu.innerHTML.includes('bcSelectCard('));
});

runTest('renderPending は pending queue の先頭panelだけを描画する', () => {
    const { context, elements } = loadUiRuntime();
    const makePlayer = (name, cardNames) => ({
        name,
        coins: 3,
        cards: cardNames.map(cardName => ({ name: cardName, color: 'blue' })),
        getMinorCards() { return this.cards; },
        isDormant() { return false; },
    });
    context.GameManager = {
        nextPendingActionFor() { return { action: 'resolveBusiness', field: 'pendingBusiness', count: 1 }; },
    };
    context.game = {
        phase: 'pending',
        currentPlayerIndex: 0,
        pendingTV: 1,
        pendingBusiness: 1,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        allowedActions() { return new Set(['resolveBusiness']); },
        players: [makePlayer('Alice', ['麦畑']), makePlayer('Bob', ['牧場'])],
        currentPlayer() { return this.players[this.currentPlayerIndex]; },
    };

    context.renderPending();

    assert.ok(elements.pendingMenu.innerHTML.includes('data-action="resolveBusiness"'));
    assert.ok(!elements.pendingMenu.innerHTML.includes('data-action="resolveTV"'));
});

runTest('buildPendingMenuHtml は pending 種別ごとのHTML生成と先頭pending gateを共有する', () => {
    const { context } = loadUiRuntime();
    const makePlayer = (name, cardNames) => ({
        name,
        coins: 3,
        cards: cardNames.map(cardName => ({ name: cardName, color: 'blue' })),
        landmarks: { 駅: true, 役所: true, 空港: false },
        itVentureCoins: 2,
        getMinorCards() { return this.cards; },
        isDormant() { return false; },
    });
    context.game = {
        phase: 'pending',
        currentPlayerIndex: 0,
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 1,
        pendingMover: 1,
        pendingRenovation: 1,
        pendingIT: true,
        players: [makePlayer('Alice', ['麦畑', 'パン屋']), makePlayer('Bob', ['牧場'])],
        currentPlayer() { return this.players[this.currentPlayerIndex]; },
    };

    const allHtml = context.buildPendingMenuHtml(context.game, new Set(['resolveCleaning', 'resolveMover', 'resolveRenovation', 'resolveIT']), null);
    assert.ok(allHtml.includes('data-action="resolveCleaning"'));
    assert.ok(allHtml.includes('data-action="resolveMover"'));
    assert.ok(allHtml.includes('data-action="resolveRenovation"'));
    assert.ok(allHtml.includes('data-action="resolveIT"'));

    const moverOnlyHtml = context.buildPendingMenuHtml(
        context.game,
        new Set(['resolveCleaning', 'resolveMover', 'resolveRenovation', 'resolveIT']),
        { action: 'resolveMover', field: 'pendingMover', count: 1 }
    );
    assert.ok(moverOnlyHtml.includes('data-action="resolveMover"'));
    assert.ok(!moverOnlyHtml.includes('data-action="resolveCleaning"'));
    assert.ok(!moverOnlyHtml.includes('data-action="resolveRenovation"'));
    assert.ok(!moverOnlyHtml.includes('data-action="resolveIT"'));
});

runTest('renderPending はテレビ局選択中に盤面確認ヒントを表示する', () => {
    const { context, elements } = loadUiRuntime();
    context.game = {
        currentPlayerIndex: 0,
        phase: 'pending',
        pendingTV: 1,
        pendingIT: false,
        pendingRenovation: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        allowedActions() { return new Set(['resolveTV']); },
        players: [
            { name: 'Alice', coins: 3 },
            { name: 'Bob', coins: 8 },
        ],
    };

    context.renderPending();

    assert.strictEqual(elements.pendingModal.style.display, 'flex');
    assert.ok(elements.pendingMenu.innerHTML.includes('盤面確認中もこのパネルは開いたままです'));
    assert.ok(elements.pendingMenu.innerHTML.includes('Bob'));
    assert.ok(elements.pendingMenu.innerHTML.includes('data-action="resolveTV"'));
    assert.ok(elements.pendingMenu.innerHTML.includes('data-target-index="1"'));
    assert.ok(!elements.pendingMenu.innerHTML.includes('onResolveTV('));
});

runTest('renderPlayers は所持カードを色順と出目順で表示する', () => {
    const { context, elements } = loadUiRuntime();
    const cards = [
        context.createCardByName('高級フレンチ'),
        context.createCardByName('麦畑'),
        context.createCardByName('パン屋'),
        context.createCardByName('森林'),
        context.createCardByName('カフェ'),
    ];
    const player = {
        name: 'Alice',
        coins: 3,
        cards,
        dormantCards: [],
        itVentureCoins: 0,
        landmarks: { 駅: false, ショッピングモール: false, 遊園地: false, 電波塔: false, 港: false, 空港: false },
        isDormant(card) { return this.dormantCards.includes(card); },
    };
    context.game = {
        currentPlayerIndex: 0,
        players: [player],
    };
    context.cpuPlayers = [null];

    context.renderPlayers();

    const html = elements.players.innerHTML;
    assert.ok(html.indexOf('麦畑×1') < html.indexOf('森林×1'));
    assert.ok(html.indexOf('森林×1') < html.indexOf('パン屋×1'));
    assert.ok(html.indexOf('パン屋×1') < html.indexOf('カフェ×1'));
    assert.ok(html.indexOf('カフェ×1') < html.indexOf('高級フレンチ×1'));
});


runTest('renderPlayers は playerSettings が短くても fallback で描画する', () => {
    const { context, elements } = loadUiRuntime();
    const cards = [context.createCardByName('麦畑')];
    const makePlayer = (name, isCPU = false) => ({
        name,
        isCPU,
        coins: 3,
        cards,
        dormantCards: [],
        itVentureCoins: 0,
        landmarks: { 駅: false, ショッピングモール: false, 遊園地: false, 電波塔: false, 港: false, 空港: false },
        isDormant(card) { return this.dormantCards.includes(card); },
    });
    context.game = {
        currentPlayerIndex: 0,
        players: [makePlayer('Alice'), makePlayer('CPU欠落', true)],
    };
    context.cpuPlayers = [null];
    context.playerSettings = [{ type: 'human', name: 'Alice' }];

    context.renderPlayers();

    const html = elements.players.innerHTML;
    assert.ok(html.includes('👤'));
    assert.ok(html.includes('🤖普'));
    assert.ok(html.includes('CPU欠落'));
    const trace = context.__machikoroFlowTrace.find(entry => entry.event === 'render-player-setting-fallback');
    assert.ok(trace);
    assert.strictEqual(trace.details.playerIndex, 1);
    assert.strictEqual(trace.details.fallbackType, 'cpu');
    assert.strictEqual(trace.details.fallbackDifficulty, 'normal');
});

runTest('renderPlayers は human の playerSettings 欠落時も落ちない', () => {
    const { context, elements } = loadUiRuntime();
    const player = {
        name: 'Human欠落',
        coins: 4,
        cards: [context.createCardByName('パン屋')],
        dormantCards: [],
        itVentureCoins: 0,
        landmarks: { 駅: false, ショッピングモール: false, 遊園地: false, 電波塔: false, 港: false, 空港: false },
        isDormant(card) { return this.dormantCards.includes(card); },
    };
    context.game = {
        currentPlayerIndex: 0,
        players: [player],
    };
    context.cpuPlayers = [];
    context.playerSettings = [];

    context.renderPlayers();

    assert.ok(elements.players.innerHTML.includes('👤'));
    assert.ok(elements.players.innerHTML.includes('Human欠落'));
    const trace = context.__machikoroFlowTrace.find(entry => entry.event === 'render-player-setting-fallback');
    assert.ok(trace);
    assert.strictEqual(trace.details.fallbackType, 'human');
    assert.strictEqual(trace.details.fallbackDifficulty, 'human');
});

runTest('renderBuildCardButton は施設カードの建設ボタンHTMLを生成する', () => {
    const { context } = loadUiRuntime();
    const card = context.createCardByName('麦畑');

    const html = context.renderBuildCardButton(card, 6, true);

    assert.ok(html.includes('card-color-blue'));
    assert.ok(html.includes('data-action="buildCard"'));
    assert.ok(html.includes('aria-label="麦畑の詳細を開く"'));
    assert.ok(html.includes('data-card-name="麦畑"'));
    assert.ok(!html.includes('onBuildCard('));
    assert.ok(html.includes('残り6枚'));
    assert.ok(html.includes('can-afford'));
});

runTest('renderLandmarkBuildButton は建設済みランドマーク表示を生成する', () => {
    const { context } = loadUiRuntime();

    const html = context.renderLandmarkBuildButton('駅', true, 4, false);

    assert.ok(html.includes('card-color-landmark'));
    assert.ok(html.includes('data-action="buildLandmark"'));
    assert.ok(html.includes('aria-label="駅の詳細を開く"'));
    assert.ok(html.includes('data-landmark-name="駅"'));
    assert.ok(!html.includes('onBuildLandmark('));
    assert.ok(html.includes('✅済'));
    assert.ok(html.includes('disabled'));
});

runTest('card select modal handler はカードとランドマークを data-action で切り替える', () => {
    const { context, elements } = loadUiRuntime();

    context.renderCardSelectModal();
    assert.ok(elements.cardListBasic.innerHTML.includes('data-action="toggleCard"'));
    assert.ok(elements.cardListBasic.innerHTML.includes('aria-pressed="true"'));
    assert.ok(elements.landmarkList.innerHTML.includes('data-action="toggleLandmark"'));
    assert.ok(elements.landmarkList.innerHTML.includes('aria-pressed="true"'));
    assert.ok(!elements.cardListBasic.innerHTML.includes('toggleCard('));
    assert.ok(!elements.landmarkList.innerHTML.includes('toggleLandmark('));

    context.handleCardSelectModalClick({
        preventDefault() {},
        target: {
            disabled: false,
            dataset: { action: 'toggleCard', cardName: '牧場' },
            closest() { return this; },
        },
    });
    assert.ok(elements.cardListBasic.innerHTML.includes('data-card-name="牧場"'));
    assert.ok(elements.cardListBasic.innerHTML.includes('card-toggle-btn off'));
    assert.ok(/data-card-name="牧場"[^>]+aria-pressed="false"/.test(elements.cardListBasic.innerHTML));

    context.handleCardSelectModalClick({
        preventDefault() {},
        target: {
            disabled: false,
            dataset: { action: 'toggleLandmark', landmarkName: '港' },
            closest() { return this; },
        },
    });
    assert.ok(elements.landmarkList.innerHTML.includes('data-landmark-name="港"'));
    assert.ok(elements.landmarkList.innerHTML.includes('card-toggle-btn off'));
    assert.ok(/data-landmark-name="港"[^>]+aria-pressed="false"/.test(elements.landmarkList.innerHTML));
});

runTest('renderCardSelectModal はカード選択を表示順でソートする', () => {
    const { context, elements } = loadUiRuntime();

    context.renderCardSelectModal();

    const basic = elements.cardListBasic.innerHTML;
    assert.ok(basic.indexOf('麦畑') < basic.indexOf('牧場'));
    assert.ok(basic.indexOf('牧場') < basic.indexOf('森林'));
    assert.ok(basic.indexOf('リンゴ園') < basic.indexOf('パン屋'));
    assert.ok(basic.indexOf('ファミレス') < basic.indexOf('スタジアム'));
    assert.ok(basic.includes('data-action="toggleCard"'));
    assert.ok(!basic.includes('onclick="toggleCard'));
});

if (process.exitCode) {
    throw new Error('uiテストで失敗が発生しました');
}
