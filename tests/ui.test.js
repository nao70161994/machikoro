const assert = require('assert');
const vm = require('vm');
const { createStorage, loadScripts, makeElement, runTest } = require('./helpers/test-utils');

function loadUiRuntime() {
    const { localStorage } = createStorage();
    const elements = {
        tabContentLocal: makeElement(),
        tabContentOnline: makeElement(),
        tabContentStats: makeElement(),
        tabLocal: makeElement(),
        tabOnline: makeElement(),
        tabStats: makeElement(),
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
        players: makeElement(),
        tutorialBox: makeElement(),
    };
    const context = {
        console,
        localStorage,
        document: {
            getElementById(id) {
                if (!elements[id]) elements[id] = makeElement();
                return elements[id];
            },
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
        lastWinnerName: '',
        winStreak: 0,
        winSoundPlayed: false,
        renderStatsCalls: 0,
        recordCalls: 0,
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
        playSound() {},
        showCardDetail() {},
        showLandmarkDetail() {},
        escapeHtml(value) { return String(value); },
        renderStats() { context.renderStatsCalls++; },
        recordGameStats() { context.recordCalls++; },
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
    };
    context.global = context;
    vm.createContext(context);
    loadScripts(context, ['js/Card.js', 'js/Player.js', 'js/ui.js']);
    return { context, elements };
}

runTest('showNotice は alert fallback で通知する', () => {
    const { context } = loadUiRuntime();

    context.showNotice('通知テスト');

    assert.deepStrictEqual(context.alertMessages, ['通知テスト']);
});

runTest('switchTab は stats タブ表示時に renderStats を呼ぶ', () => {
    const { context, elements } = loadUiRuntime();

    context.switchTab('stats');

    assert.strictEqual(elements.tabContentLocal.style.display, 'none');
    assert.strictEqual(elements.tabContentOnline.style.display, 'none');
    assert.strictEqual(elements.tabContentStats.style.display, 'block');
    assert.strictEqual(context.renderStatsCalls, 1);
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
        players: [
            { name: 'Alice', coins: 3 },
            { name: 'Bob', coins: 8 },
        ],
    };

    context.renderPending();

    assert.strictEqual(elements.pendingModal.style.display, 'flex');
    assert.ok(elements.pendingMenu.innerHTML.includes('盤面確認中もこのパネルは開いたままです'));
    assert.ok(elements.pendingMenu.innerHTML.includes('Bob'));
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

runTest('renderBuildCardButton は施設カードの建設ボタンHTMLを生成する', () => {
    const { context } = loadUiRuntime();
    const card = context.createCardByName('麦畑');

    const html = context.renderBuildCardButton(card, 6, true);

    assert.ok(html.includes('card-color-blue'));
    assert.ok(html.includes("onBuildCard('麦畑')"));
    assert.ok(html.includes('残り6枚'));
    assert.ok(html.includes('can-afford'));
});

runTest('renderLandmarkBuildButton は建設済みランドマーク表示を生成する', () => {
    const { context } = loadUiRuntime();

    const html = context.renderLandmarkBuildButton('駅', true, 4, false);

    assert.ok(html.includes('card-color-landmark'));
    assert.ok(html.includes("onBuildLandmark('駅')"));
    assert.ok(html.includes('✅済'));
    assert.ok(html.includes('disabled'));
});

runTest('renderCardSelectModal はカード選択を表示順でソートする', () => {
    const { context, elements } = loadUiRuntime();

    context.renderCardSelectModal();

    const basic = elements.cardListBasic.innerHTML;
    assert.ok(basic.indexOf('麦畑') < basic.indexOf('牧場'));
    assert.ok(basic.indexOf('牧場') < basic.indexOf('森林'));
    assert.ok(basic.indexOf('リンゴ園') < basic.indexOf('パン屋'));
    assert.ok(basic.indexOf('ファミレス') < basic.indexOf('スタジアム'));
});

if (process.exitCode) {
    throw new Error('uiテストで失敗が発生しました');
}
