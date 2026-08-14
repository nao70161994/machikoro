const assert = require('assert');
const vm = require('vm');
const { createStorage, loadScripts, makeElement, runTest } = require('./helpers/test-utils');
const { loadGameRuntime } = require('./helpers/runtime-loaders');

function loadUiRuntime(options = {}) {
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
        diceResultAnnouncer: makeElement(),
        buildMenu: makeElement(),
        log: makeElement(),
        logTitle: makeElement(),
        logSummary: makeElement(),
        logToggleIcon: makeElement(),
        logHeader: makeElement(),
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
        tutorialEnabled: makeElement(),
        tutorialLevel: makeElement(),
        btnTutorialToggle: makeElement(),
        btnTutorialLevel: makeElement(),
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
            querySelector(selector) {
                return selector === '.log-header' ? elements.logHeader : null;
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
        announcerTimer: null,
        timeoutDelays: [],
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
        markOnlineGameFinishedCalls: 0,
        refreshPwaUpdateStateCalls: 0,
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
        markOnlineGameFinished() { context.markOnlineGameFinishedCalls++; },
        refreshPwaUpdateState() { context.refreshPwaUpdateStateCalls++; },
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
        setTimeout(fn, delay) { context.lastTimeout = fn; context.timeoutDelays.push(delay); return 1; },
        clearTimeout() {},
    };
    Object.assign(context, options.globals || {});
    context.global = context;
    context.globalThis = context;
    vm.createContext(context);
    loadScripts(context, ['js/Card.js', 'js/Player.js', 'js/gameSelectionState.js', 'js/gameSetupState.js', 'js/gameRuntimeState.js', 'js/onlineRuntimeState.js', 'js/clientStorage.js', 'js/uiNotice.js', 'js/uiLogDisplay.js', 'js/uiCardOrder.js', 'js/uiPlayerDisplay.js', 'js/uiInputPolicy.js', 'js/uiBuildMenu.js', 'js/uiPendingMenu.js', 'js/uiPendingEffects.js', 'js/uiCardDetail.js', 'js/uiCardSelect.js', 'js/uiCardSelectEffects.js', 'js/uiTutorialSettings.js', 'js/uiTutorial.js', 'js/uiDiceChoice.js', 'js/uiDiceDisplay.js', 'js/uiTurnAnnouncer.js', 'js/uiModalPolicy.js', 'js/uiModalOpen.js', 'js/uiModalClose.js', 'js/uiModalDomEffects.js', 'js/uiModalRuntime.js', 'js/uiWinner.js', 'js/uiWinnerEffects.js', 'js/uiGameStatusView.js', 'js/uiGameStatusEffects.js', 'js/uiTabView.js', 'js/uiTabEffects.js', 'js/uiRuntimeSnapshot.js', 'js/uiRenderRuntime.js', 'js/uiScreenFocus.js', 'js/ui.js']);
    context.OnlineRuntimeState.runtime.restoreIdentity({
        isRoomHost: false,
        playerName: '',
        roomId: null,
        originalPlayerIndex: -1,
        playerIndex: 0,
        reconnectToken: '',
    });
    return { context, elements };
}

runTest('ui storage境界は既存keyと値形式を共通facade経由で保持する', () => {
    const { context } = loadUiRuntime();

    context.setTutorialEnabled(true);
    context.onChangeTutorialLevel('advanced');
    const trace = context.recordFlowTrace('ui-storage-contract', { ok: true });

    assert.strictEqual(context.localStorage.getItem('tutorialEnabled'), 'true');
    assert.strictEqual(context.localStorage.getItem('tutorialLevel'), 'advanced');
    assert.deepStrictEqual(
        JSON.parse(context.localStorage.getItem('machikoroLastFlowTrace')),
        JSON.parse(JSON.stringify(trace))
    );
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/ui.js'), 'utf8');
    assert.strictEqual(source.includes('localStorage'), false);
});

runTest('ui card select handler bindingはcontrollerだけが所有する', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/ui.js'), 'utf8');
    assert.strictEqual(source.includes('cardSelectModalHandlersBound'), false);
    assert.ok(source.includes('UiCardSelect.createBindingController()'));
    assert.ok(source.includes('cardSelectModalBindingController.claim()'));
});

runTest('ui pending modal更新stateはeffect controllerだけが所有する', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/ui.js'), 'utf8');
    assert.strictEqual(source.includes('isUpdatingPendingModalContent'), false);
    assert.ok(source.includes('UiPendingEffects.createUpdateController()'));
    assert.ok(source.includes('pendingModalUpdateController.run('));
    assert.ok(source.includes('UiPendingEffects.createFocusController()'));
});

runTest('pending modalは表示遷移時だけ最初の操作へfocusし終了時にgameへ戻す', () => {
    const { context, elements } = loadUiRuntime();
    const firstAction = makeElement();
    let firstFocusCount = 0;
    firstAction.focus = () => {
        firstFocusCount++;
        context.document.activeElement = firstAction;
    };
    elements.pendingMenu.querySelector = selector =>
        selector === 'button:not([disabled]), select:not([disabled])' ? firstAction : null;
    elements.pendingMenu.contains = target => target === firstAction;
    elements.pendingModal.contains = target => target === firstAction;
    elements.status.focus = () => {
        elements.status.focused = true;
        context.document.activeElement = elements.status;
    };
    context.game = {
        currentPlayerIndex: 0,
        players: [{ name: 'Alice' }, { name: 'Bob' }],
    };
    context.cpuPlayers = [null, null];

    context.updatePendingModalContent(
        elements.pendingMenu,
        elements.pendingModal,
        '<button data-action="resolveTV">Bob</button>'
    );
    assert.strictEqual(firstFocusCount, 1);
    assert.strictEqual(context.document.activeElement, firstAction);

    context.updatePendingModalContent(
        elements.pendingMenu,
        elements.pendingModal,
        '<button data-action="resolveTV">Bob（3）</button>'
    );
    assert.strictEqual(firstFocusCount, 1);

    context.updatePendingModalContent(elements.pendingMenu, elements.pendingModal, '');
    assert.strictEqual(elements.status.focused, true);
    assert.strictEqual(context.document.activeElement, elements.status);
});

runTest('pending modalはCPU・online replay・相手手番でfocusを奪わない', () => {
    const scenarios = [
        { cpuPlayers: [{ difficulty: 'strong' }, null] },
        { isReplaying: true },
        { isOnlineGame: true, myPlayerIndex: 1 },
    ];
    scenarios.forEach(scenario => {
        const { context, elements } = loadUiRuntime();
        const firstAction = makeElement();
        let focusCount = 0;
        firstAction.focus = () => { focusCount++; };
        elements.pendingMenu.querySelector = () => firstAction;
        context.game = {
            currentPlayerIndex: 0,
            players: [{ name: 'Alice' }, { name: 'Bob' }],
        };
        context.cpuPlayers = scenario.cpuPlayers || [null, null];
        if (scenario.isReplaying) {
            context.OnlineRuntimeState.runtime.setReplaying(true);
        }
        if (scenario.isOnlineGame) {
            context.OnlineRuntimeState.runtime.setOnline(true);
            context.OnlineRuntimeState.runtime.setPlayerIndexes({
                originalPlayerIndex: scenario.myPlayerIndex,
                playerIndex: scenario.myPlayerIndex,
            });
        }
        context.updatePendingModalContent(
            elements.pendingMenu,
            elements.pendingModal,
            '<button data-action="resolveTV">Bob</button>'
        );
        assert.strictEqual(focusCount, 0);
    });
});

runTest('ui transient stateはeager controllerだけが所有する', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/ui.js'), 'utf8');
    assert.ok(!source.includes('let activeGameTurnStateController'));
    assert.ok(!source.includes('let turnAnnouncerTimerController'));
    assert.ok(!source.includes('let buildMenuFilterController'));
    assert.ok(!source.includes('getActiveGameTurnStateController'));
    assert.ok(!source.includes('getBuildMenuFilterController'));
    assert.ok(source.includes('UiGameStatusEffects.createTurnStateController()'));
    assert.ok(source.includes('UiTurnAnnouncer.createTimerController()'));
    assert.ok(source.includes('UiBuildMenu.createFilterController()'));
});

runTest('card selection replacementは中立runtimeだけが所有する', () => {
    const fs = require('fs');
    const path = require('path');
    const readSource = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const uiSource = readSource('js/ui.js');
    const stateSource = readSource('js/gameSelectionState.js');

    assert.ok(stateSource.includes('const runtime = createController({'));
    assert.ok(stateSource.includes('function replaceEnabledCardSelection(values)'));
    assert.ok(stateSource.includes('function replaceEnabledLandmarkSelection(values)'));
    for (const file of ['js/ui.js', 'js/main.js', 'js/online.js', 'js/storage.js']) {
        const source = readSource(file);
        assert.strictEqual(/^let enabledCards\b/m.test(source), false, file);
        assert.strictEqual(/^let enabledLandmarks\b/m.test(source), false, file);
    }
    assert.ok(uiSource.includes('syncCardSelectStateFromRuntime'));
});

runTest('ui modal runtime stateはpolicy controllerだけが所有する', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/ui.js'), 'utf8');
    assert.strictEqual(source.includes('let activeModalId'), false);
    assert.strictEqual(source.includes('let lastModalFocus'), false);
    assert.strictEqual(source.includes('let modalInertRestore'), false);
    assert.ok(source.includes('UiModalPolicy.createRuntimeController()'));
});

runTest('ui storage境界はstorage取得拒否を外へ伝播しない', () => {
    const { context } = loadUiRuntime();
    Object.defineProperty(context, 'localStorage', {
        configurable: true,
        get() { throw new Error('storage blocked'); },
    });

    assert.doesNotThrow(() => context.setTutorialEnabled(false));
    assert.doesNotThrow(() => context.onChangeTutorialLevel('beginner'));
    assert.doesNotThrow(() => context.recordFlowTrace('blocked-storage'));
});

runTest('tutorial control wrapperはpure viewをcheckbox・button・levelへ反映する', () => {
    const { context, elements } = loadUiRuntime();

    context.onToggleTutorial(true);
    context.onChangeTutorialLevel('advanced');
    assert.strictEqual(elements.tutorialEnabled.checked, true);
    assert.strictEqual(elements.tutorialLevel.value, 'advanced');
    assert.strictEqual(elements.btnTutorialToggle.textContent, '💡 ガイド ON');
    assert.strictEqual(elements.btnTutorialLevel.textContent, '🧠 上級者');
    assert.strictEqual(elements.btnTutorialToggle.classList.contains('active'), true);
    assert.strictEqual(elements.btnTutorialLevel.classList.contains('active'), true);
    assert.strictEqual(elements.btnTutorialToggle.getAttribute('aria-pressed'), 'true');
    assert.strictEqual(elements.btnTutorialLevel.getAttribute('aria-label'), 'チュートリアルの詳しさ、現在 上級者向け');

    context.onToggleTutorial(false);
    assert.strictEqual(elements.tutorialEnabled.checked, false);
    assert.strictEqual(elements.tutorialLevel.value, 'advanced');
    assert.strictEqual(elements.btnTutorialToggle.textContent, '💡 ガイド OFF');
    assert.strictEqual(elements.btnTutorialLevel.textContent, '🧠 上級者');
    assert.strictEqual(elements.btnTutorialToggle.classList.contains('active'), false);
    assert.strictEqual(elements.btnTutorialLevel.classList.contains('active'), false);
    assert.strictEqual(elements.btnTutorialToggle.getAttribute('aria-pressed'), 'false');
    assert.strictEqual(elements.btnTutorialLevel.getAttribute('aria-label'), 'チュートリアルの詳しさ、現在 上級者向け');

    context.onChangeTutorialLevel('invalid');
    assert.strictEqual(elements.tutorialLevel.value, 'beginner');
    assert.strictEqual(elements.btnTutorialLevel.getAttribute('aria-label'), 'チュートリアルの詳しさ、現在 初心者向け');
});

runTest('turn announcer wrapperはpure viewと既存timer/DOM順を維持する', () => {
    const { context, elements } = loadUiRuntime();

    context.showTurnAnnouncer('CPU 1', true, 1);

    assert.strictEqual(elements.turnAnnouncer.style.display, 'flex');
    assert.strictEqual(elements.turnAnnouncerText.textContent, '🤖 CPU 1 のターン');
    assert.strictEqual(
        elements.turnStatusAnnouncer.textContent,
        'プレイヤー2、CPU、CPU 1 のターン'
    );
    assert.strictEqual(elements.turnAnnouncer.classList.contains('hiding'), false);
    assert.deepStrictEqual(context.timeoutDelays, [1300]);

    context.lastTimeout();
    assert.strictEqual(elements.turnAnnouncer.classList.contains('hiding'), true);
    assert.deepStrictEqual(context.timeoutDelays, [1300, 400]);

    context.lastTimeout();
    assert.strictEqual(elements.turnAnnouncer.style.display, 'none');
    assert.strictEqual(elements.turnAnnouncer.classList.contains('hiding'), false);
    assert.strictEqual(
        elements.turnStatusAnnouncer.textContent,
        'プレイヤー2、CPU、CPU 1 のターン'
    );
    assert.strictEqual(context.announcerTimer, null);
});

runTest('showNotice は non-blocking toast で通知する', () => {
    const { context, elements } = loadUiRuntime();

    context.showNotice('通知テスト');

    assert.deepStrictEqual(context.alertMessages, []);
    assert.strictEqual(elements.noticeToast.style.display, 'flex');
    assert.strictEqual(elements.noticeToastMessage.textContent, '通知テスト');
    assert.strictEqual(elements.noticeToast.getAttribute('aria-live'), 'polite');
    context.hideNotice();
    assert.strictEqual(elements.noticeToast.style.display, 'none');
});

runTest('notice toastは閉鎖時に内部focusだけを現在画面へ戻す', () => {
    const manual = loadUiRuntime();
    manual.context.showNotice('手動で閉じる通知');
    manual.context.document.activeElement = makeElement({
        parentElement: manual.elements.noticeToast,
    });
    manual.context.hideNotice();
    assert.strictEqual(manual.elements.status.focused, true);

    const automatic = loadUiRuntime();
    automatic.context.showNotice('自動で閉じる通知');
    automatic.context.document.activeElement = makeElement({
        parentElement: automatic.elements.noticeToast,
    });
    automatic.context.lastTimeout();
    assert.strictEqual(automatic.elements.status.focused, true);

    const outside = loadUiRuntime();
    const externalControl = makeElement();
    outside.context.document.activeElement = externalControl;
    outside.context.showNotice('他所にfocusがある通知');
    outside.context.hideNotice();
    assert.strictEqual(outside.elements.status.focused, undefined);
    assert.strictEqual(outside.context.document.activeElement, externalControl);
});

runTest('showNotice は重複する視覚通知だけをlive regionから除外できる', () => {
    const { context, elements } = loadUiRuntime();

    context.showNotice('視覚だけの通知', { announce: false });

    assert.strictEqual(elements.noticeToast.style.display, 'flex');
    assert.strictEqual(elements.noticeToastMessage.textContent, '視覚だけの通知');
    assert.strictEqual(elements.noticeToast.getAttribute('aria-live'), 'off');
    context.lastTimeout();
    assert.strictEqual(elements.noticeToast.style.display, 'none');
    assert.strictEqual(elements.noticeToast.getAttribute('aria-live'), 'polite');
    context.showNotice('次の通知');
    assert.strictEqual(elements.noticeToast.getAttribute('aria-live'), 'polite');
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
    assert.strictEqual(elements.titleScreen.inert, false);
    assert.strictEqual(elements.gameScreen.inert, false);
    assert.strictEqual(elements.titleScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(elements.titleScreen.style.pointerEvents, '');
    assert.strictEqual(elements.gameScreen.style.pointerEvents, '');
});

runTest('modal open effect authorityは明示flag時も既存DOMとfocus順を維持する', () => {
    const { context, elements } = loadUiRuntime({
        globals: { MACHIKORO_UI_MODAL_OPEN_EFFECT_AUTHORITY_ENABLED: '1' },
    });
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

    assert.strictEqual(context.uiModalOpenPlanSelection('rulesModal').source, 'pure-plan');
    assert.strictEqual(context.showRules(), true);
    assert.strictEqual(elements.rulesModal.style.display, 'flex');
    assert.strictEqual(elements.rulesModal.getAttribute('role'), 'dialog');
    assert.strictEqual(elements.rulesModal.getAttribute('aria-modal'), 'true');
    assert.strictEqual(context.document.body.classList.contains('modal-open'), true);
    assert.strictEqual(context.document.activeElement, elements.rulesModal);
    assert.strictEqual(hiddenWhileFocusedInTitle, false);
    assert.strictEqual(elements.titleScreen.inert, true);
    assert.strictEqual(elements.titleScreen.getAttribute('aria-hidden'), 'true');
    assert.strictEqual(elements.titleScreen.style.pointerEvents, 'none');

    context.closeRules();
    assert.strictEqual(elements.titleScreen.inert, false);
    assert.strictEqual(elements.titleScreen.getAttribute('aria-hidden'), null);
});

runTest('modal close effect authorityは明示flag時もunlock後にfocusを復元する', () => {
    const calls = [];
    const { context, elements } = loadUiRuntime({
        globals: { MACHIKORO_UI_MODAL_CLOSE_EFFECT_AUTHORITY_ENABLED: '1' },
    });
    context.renderPending = () => { calls.push('renderPending'); };
    const opener = makeElement();
    opener.focus = () => {
        calls.push('restoreFocus');
        assert.strictEqual(elements.titleScreen.getAttribute('aria-hidden'), null);
        context.document.activeElement = opener;
    };
    context.document.activeElement = opener;
    assert.strictEqual(context.showRules(), true);
    assert.strictEqual(context.uiModalClosePlanSelection(
        'rulesModal', {}, [], null
    ).source, 'pure-plan');

    context.closeRules();

    assert.deepStrictEqual(calls, ['renderPending', 'restoreFocus']);
    assert.strictEqual(context.document.activeElement, opener);
    assert.strictEqual(elements.rulesModal.style.display, 'none');
    assert.strictEqual(elements.titleScreen.inert, false);
    assert.strictEqual(elements.titleScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(context.document.body.classList.contains('modal-open'), false);
});

runTest('modal effect authority flagsはproduction HTMLへ注入しない', () => {
    const index = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
    assert.strictEqual(index.includes('MACHIKORO_UI_MODAL_OPEN_EFFECT_AUTHORITY_ENABLED'), false);
    assert.strictEqual(index.includes('MACHIKORO_UI_MODAL_CLOSE_EFFECT_AUTHORITY_ENABLED'), false);
});

runTest('rules/cardSelect close はvisible modalなしのorphan lockを解除する', () => {
    const { context, elements } = loadUiRuntime();

    elements.rulesModal.style.display = 'flex';
    elements.gameScreen.inert = true;
    elements.gameScreen.setAttribute('aria-hidden', 'true');
    elements.gameScreen.style.pointerEvents = 'none';
    context.document.body.classList.add('modal-open');

    context.closeRules();

    assert.strictEqual(elements.rulesModal.style.display, 'none');
    assert.strictEqual(elements.gameScreen.inert, false);
    assert.strictEqual(elements.gameScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(elements.gameScreen.style.pointerEvents, '');
    assert.strictEqual(context.document.body.classList.contains('modal-open'), false);

    elements.cardSelectModal.style.display = 'flex';
    elements.gameScreen.inert = true;
    elements.gameScreen.setAttribute('aria-hidden', 'true');
    elements.gameScreen.style.pointerEvents = 'none';
    context.document.body.classList.add('modal-open');

    context.closeCardSelect();

    assert.strictEqual(elements.cardSelectModal.style.display, 'none');
    assert.strictEqual(elements.gameScreen.inert, false);
    assert.strictEqual(elements.gameScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(elements.gameScreen.style.pointerEvents, '');
    assert.strictEqual(context.document.body.classList.contains('modal-open'), false);
});

runTest('modal helpers はnative inertを明示的にfalseへ戻す', () => {
    const { context, elements } = loadUiRuntime();
    delete elements.gameScreen.inert;
    delete elements.titleScreen.inert;

    context.showRules();
    assert.strictEqual(elements.gameScreen.inert, true);

    context.closeRules();
    assert.strictEqual(elements.gameScreen.inert, false);
    assert.strictEqual(elements.titleScreen.inert, false);
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

runTest('showConfirm はOKでcallbackを一度だけ呼びmodal lockを解除する', () => {
    const { context, elements } = loadUiRuntime();
    let okCount = 0;

    elements.confirmModal.style.opacity = '0';
    elements.confirmModal.style.visibility = 'hidden';
    elements.confirmModal.style.pointerEvents = 'none';
    assert.strictEqual(context.showConfirm('本当に実行しますか', () => { okCount++; }), true);
    assert.strictEqual(elements.confirmModal.style.display, 'flex');
    assert.strictEqual(elements.confirmModal.style.opacity, '1');
    assert.strictEqual(elements.confirmModal.style.visibility, 'visible');
    assert.strictEqual(elements.confirmModal.style.pointerEvents, 'auto');
    assert.strictEqual(elements.confirmMessage.textContent, '本当に実行しますか');
    assert.strictEqual(context.__machikoroConfirmModalOpen, true);

    elements.confirmOkBtn.onclick();

    assert.strictEqual(okCount, 1);
    assert.strictEqual(elements.confirmModal.style.display, 'none');
    assert.strictEqual(context.__machikoroConfirmModalOpen, false);
    assert.strictEqual(elements.titleScreen.inert, false);
    assert.strictEqual(elements.gameScreen.inert, false);
});

runTest('showConfirm はOK後の再描画でopenerが消えた時だけ画面へfocusを補完する', () => {
    const { context, elements } = loadUiRuntime();
    const opener = makeElement();
    elements.gameScreen.style.display = 'block';
    elements.titleScreen.style.display = 'none';
    elements.status.focus = () => {
        elements.status.focused = true;
        context.document.activeElement = elements.status;
    };
    opener.focus = () => { context.document.activeElement = opener; };
    context.document.activeElement = opener;

    context.showConfirm('再描画確認', () => { opener.isConnected = false; });
    elements.confirmOkBtn.onclick();

    assert.strictEqual(context.document.activeElement, elements.status);
    assert.strictEqual(elements.status.focused, true);
});

runTest('showConfirm はOK callbackが移した有効focusを上書きしない', () => {
    const { context, elements } = loadUiRuntime();
    const callbackTarget = makeElement();
    callbackTarget.focus = () => { context.document.activeElement = callbackTarget; };
    elements.gameScreen.style.display = 'block';
    elements.titleScreen.style.display = 'none';

    context.showConfirm('focus確認', () => { callbackTarget.focus(); });
    elements.confirmOkBtn.onclick();

    assert.strictEqual(context.document.activeElement, callbackTarget);
    assert.strictEqual(elements.status.focused, undefined);
});

runTest('showConfirm はCancelとEscapeで任意のcancel callbackを一度だけ呼ぶ', () => {
    const { context, elements } = loadUiRuntime();
    let okCount = 0;
    let cancelCount = 0;

    context.showConfirm('キャンセル確認', () => { okCount++; }, () => { cancelCount++; });
    elements.confirmCancelBtn.onclick();
    assert.strictEqual(okCount, 0);
    assert.strictEqual(cancelCount, 1);
    assert.strictEqual(elements.confirmModal.style.display, 'none');
    assert.strictEqual(context.__machikoroConfirmModalOpen, false);
    elements.confirmCancelBtn.onclick();
    assert.strictEqual(cancelCount, 1);

    context.showConfirm('Esc確認', () => { okCount++; }, () => { cancelCount++; });
    context.handleModalKeydown({ key: 'Escape', preventDefault() {} });
    assert.strictEqual(okCount, 0);
    assert.strictEqual(cancelCount, 2);
    assert.strictEqual(elements.confirmModal.style.display, 'none');
    assert.strictEqual(context.__machikoroConfirmModalOpen, false);
    assert.strictEqual(elements.titleScreen.inert, false);
    assert.strictEqual(elements.gameScreen.inert, false);
});


runTest('blocking modal はdeny-by-defaultで二重openを拒否する', () => {
    const { context, elements } = loadUiRuntime();
    let okCount = 0;
    let oldHandlerCalled = 0;
    elements.confirmOkBtn.onclick = () => { oldHandlerCalled++; };

    assert.strictEqual(context.showRules(), true);
    assert.strictEqual(context.showConfirm('二重確認', () => { okCount++; }), false);

    assert.strictEqual(elements.rulesModal.style.display, 'flex');
    assert.notStrictEqual(elements.confirmModal.style.display, 'flex');
    assert.strictEqual(context.__machikoroConfirmModalOpen, undefined);
    assert.strictEqual(okCount, 0);
    assert.strictEqual(context.__machikoroModalPolicyViolations.length, 1);
    assert.strictEqual(context.__machikoroModalPolicyViolations[0].type, 'nested-blocking-modal-denied');
    elements.confirmOkBtn.onclick();
    assert.strictEqual(oldHandlerCalled, 1);
});

runTest('不可視のblocking modalは新しいmodal表示を妨げない', () => {
    const { context, elements } = loadUiRuntime();

    elements.rulesModal.style.display = 'flex';
    elements.rulesModal.style.visibility = 'hidden';
    assert.strictEqual(context.showConfirm('確認', () => {}), true);

    assert.strictEqual(elements.confirmModal.style.display, 'flex');
    assert.strictEqual(context.__machikoroModalPolicyViolations, undefined);
});

runTest('card detail/select modal はactive blocking modal中に開かない', () => {
    const { context, elements } = loadUiRuntime();

    assert.strictEqual(context.showRules(), true);
    assert.strictEqual(context.showCardDetail('麦畑'), false);
    assert.strictEqual(context.showCardSelect(), false);

    assert.strictEqual(elements.rulesModal.style.display, 'flex');
    assert.notStrictEqual(elements.cardDetailModal.style.display, 'flex');
    assert.notStrictEqual(elements.cardSelectModal.style.display, 'flex');
    assert.strictEqual(context.__machikoroModalPolicyViolations.length, 2);
});

runTest('pending modal はblocking modal中に表示されず既存内容も閉じる', () => {
    const { context, elements } = loadUiRuntime();

    assert.strictEqual(context.updatePendingModalContent(elements.pendingMenu, elements.pendingModal, '<button data-action="resolveBusiness">Old</button>'), true);
    assert.strictEqual(elements.pendingModal.style.display, 'flex');
    assert.strictEqual(context.showRules(), true);
    assert.strictEqual(context.updatePendingModalContent(elements.pendingMenu, elements.pendingModal, '<button data-action="resolveTV">A</button>'), true);

    assert.strictEqual(elements.rulesModal.style.display, 'flex');
    assert.strictEqual(elements.pendingModal.style.display, 'none');
    assert.strictEqual(elements.pendingModal.style.pointerEvents, '');
    assert.strictEqual(elements.pendingMenu.style.pointerEvents, '');
    assert.strictEqual(elements.pendingMenu.innerHTML, '');
    assert.strictEqual(context.__machikoroModalPolicyViolations[0].type, 'pending-modal-open-denied');
});

runTest('blocking modalを閉じると残っているpending actionを再表示する', () => {
    const { context, elements } = loadUiRuntime();
    const makePlayer = name => ({ name, coins: 3, cards: [], getMinorCards() { return []; }, isDormant() { return false; } });
    context.GameManager = {
        nextPendingActionFor() { return { action: 'resolveTV', field: 'pendingTV', count: 1 }; },
        allowedActionsFor() { return new Set(['resolveTV']); },
    };
    context.game = {
        phase: 'pending',
        currentPlayerIndex: 0,
        pendingTV: 1,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        players: [makePlayer('Alice'), makePlayer('Bob')],
        currentPlayer() { return this.players[this.currentPlayerIndex]; },
    };

    assert.strictEqual(context.showRules(), true);
    context.renderPending();
    assert.strictEqual(elements.pendingModal.style.display, 'none');

    context.closeRules();

    assert.strictEqual(elements.rulesModal.style.display, 'none');
    assert.strictEqual(elements.pendingModal.style.display, 'flex');
    assert.ok(elements.pendingMenu.innerHTML.includes('data-action="resolveTV"'));
});

runTest('non-blocking notice はblocking modal中も表示できる', () => {
    const { context, elements } = loadUiRuntime();

    assert.strictEqual(context.showRules(), true);
    context.showNotice('補助通知');

    assert.strictEqual(elements.rulesModal.style.display, 'flex');
    assert.strictEqual(elements.noticeToast.style.display, 'flex');
    assert.strictEqual(elements.noticeToastMessage.textContent, '補助通知');
});

runTest('modal close は背景の既存aria-hiddenを復元する', () => {
    const { context, elements } = loadUiRuntime();
    elements.gameScreen.setAttribute('aria-hidden', 'false');

    context.showRules();
    context.handleModalKeydown({ key: 'Escape', preventDefault() {} });

    assert.strictEqual(elements.rulesModal.style.display, 'none');
    assert.strictEqual(elements.titleScreen.inert, false);
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

runTest('renderWinnerState はローカル終了時に既存オンライン復元bundleを消す', () => {
    const { context, elements } = loadUiRuntime();
    assert.strictEqual(context.fullLog, undefined);
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
    assert.strictEqual(context.markOnlineGameFinishedCalls, 1);
    assert.strictEqual(context.refreshPwaUpdateStateCalls, 1);
    assert.strictEqual(elements.btnRoll.disabled, true);
    assert.strictEqual(
        elements.turnStatusAnnouncer.textContent,
        'ゲーム終了。Aliceの勝利。人間プレイヤー、12ターン。'
    );

    elements.turnStatusAnnouncer.textContent = 'already-announced';
    context.renderWinnerState(winner);
    assert.strictEqual(elements.turnStatusAnnouncer.textContent, 'already-announced');
});

runTest('renderWinnerState はオンライン再戦投票中のsessionとsocketを保持する', () => {
    const { context, elements } = loadUiRuntime();
    const socket = { connected: true };
    context.OnlineRuntimeState.runtime.setOnline(true);
    context.OnlineRuntimeState.runtime.setSocket(socket);
    context.localStorage.setItem('onlineSession', '{"roomId":"ABC123"}');
    const winner = { name: 'Alice', coins: 20, cards: [], landmarks: {}, itVentureCoins: 0, isDormant() { return false; } };
    context.game = {
        players: [winner, { name: 'Bob', coins: 3, cards: [], landmarks: {}, itVentureCoins: 0, isDormant() { return false; } }],
        currentPlayerIndex: 0,
        turnCount: 12,
    };

    context.renderWinnerState(winner);

    assert.strictEqual(context.localStorage.getItem('onlineSession'), '{"roomId":"ABC123"}');
    assert.strictEqual(context.clearOnlineSessionStorageCalls, 0);
    assert.strictEqual(context.markOnlineGameFinishedCalls, 0);
    assert.ok(elements.status.innerHTML.includes('data-ui-action="requestOnlineRematch"'));
    context.renderWinnerState(winner);
    assert.ok(elements.status.innerHTML.includes('data-ui-action="requestOnlineRematch"'));
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
    const firstChoice = makeElement();
    let focusCount = 0;
    firstChoice.focus = () => { focusCount++; };
    elements.diceChoose.querySelector = () => firstChoice;
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
    assert.strictEqual(focusCount, 1);

    context.renderDiceChoose();
    assert.strictEqual(focusCount, 1);

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
    assert.strictEqual(focusCount, 3);
});

runTest('renderDiceChoose はCPU・online replay・相手手番でfocusを奪わない', () => {
    const scenarios = [
        { cpuPlayers: [{}, null] },
        { isReplaying: true },
        { isOnlineGame: true, myPlayerIndex: 1 },
    ];
    scenarios.forEach(scenario => {
        const { context, elements } = loadUiRuntime();
        context.GAME_PHASES.SELECT_DICE = 'selectDice';
        context.GameManager = {
            allowedActionsFor() { return new Set(['selectDice']); },
        };
        context.game = {
            phase: 'selectDice',
            currentPlayerIndex: 0,
            players: [{ name: 'Alice' }, { name: 'Bob' }],
            lastDiceResult: 0,
        };
        context.cpuPlayers = scenario.cpuPlayers || [null, null];
        if (scenario.isReplaying) context.OnlineRuntimeState.runtime.setReplaying(true);
        if (scenario.isOnlineGame) {
            context.OnlineRuntimeState.runtime.setOnline(true);
            context.OnlineRuntimeState.runtime.setPlayerIndexes({
                originalPlayerIndex: scenario.myPlayerIndex,
                playerIndex: scenario.myPlayerIndex,
            });
        }
        let focusCount = 0;
        elements.diceChoose.querySelector = () => ({ focus() { focusCount++; } });
        context.renderDiceChoose();
        assert.strictEqual(focusCount, 0);
    });
});

runTest('renderDiceChoose は駅・電波塔・港のactiveな選択完了後だけprimaryへfocusを戻す', () => {
    const scenarios = [
        { phase: 'selectDice', action: 'selectDice', target: 'btnRoll' },
        { phase: 'rerollConfirm', action: 'rerollDice', target: 'btnSkip' },
        { phase: 'harborChoice', action: 'resolveHarbor', target: 'btnSkip' },
    ];
    scenarios.forEach(scenario => {
        const { context, elements } = loadUiRuntime();
        const choice = makeElement();
        choice.focus = () => { context.document.activeElement = choice; };
        elements.diceChoose.querySelector = () => choice;
        elements.diceChoose.contains = target => target === choice;
        elements.btnRoll.disabled = scenario.target !== 'btnRoll';
        elements.btnReroll.style.display = 'none';
        elements.btnSkip.disabled = scenario.target !== 'btnSkip';
        elements[scenario.target].focus = () => {
            context.document.activeElement = elements[scenario.target];
        };
        Object.assign(context.GAME_PHASES, {
            SELECT_DICE: 'selectDice',
            REROLL_CONFIRM: 'rerollConfirm',
            HARBOR_CHOICE: 'harborChoice',
        });
        context.GameManager = {
            allowedActionsFor(game) { return new Set(game.allowed || []); },
        };
        context.game = {
            phase: scenario.phase,
            currentPlayerIndex: 0,
            allowed: [scenario.action],
            lastDiceResult: 10,
        };
        context.cpuPlayers = [null, null];

        context.renderDiceChoose();
        assert.strictEqual(context.document.activeElement, choice, scenario.phase);
        context.game.phase = 'build';
        context.game.allowed = ['nextTurn'];
        context.renderDiceChoose();
        assert.strictEqual(
            context.document.activeElement,
            elements[scenario.target],
            scenario.phase
        );
    });

    const { context, elements } = loadUiRuntime();
    const choice = makeElement();
    elements.diceChoose.querySelector = () => choice;
    elements.diceChoose.contains = target => target === choice;
    context.GAME_PHASES.SELECT_DICE = 'selectDice';
    context.GameManager = { allowedActionsFor: game => new Set(game.allowed || []) };
    context.game = {
        phase: 'selectDice',
        currentPlayerIndex: 0,
        allowed: ['selectDice'],
        lastDiceResult: 7,
    };
    context.cpuPlayers = [null, null];
    context.renderDiceChoose();
    const outside = makeElement();
    context.document.activeElement = outside;
    context.game.phase = 'build';
    context.game.allowed = ['nextTurn'];
    context.renderDiceChoose();
    assert.strictEqual(context.document.activeElement, outside);
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
    elements.pendingModal.style.opacity = '0';
    elements.pendingModal.style.visibility = 'hidden';
    elements.pendingModal.style.pointerEvents = 'none';
    elements.pendingMenu.style.opacity = '0';
    elements.pendingMenu.style.visibility = 'hidden';
    elements.pendingMenu.style.pointerEvents = 'none';
    context.renderPending();
    assert.strictEqual(elements.pendingModal.style.display, 'flex');
    assert.strictEqual(elements.pendingModal.style.opacity, '1');
    assert.strictEqual(elements.pendingModal.style.visibility, 'visible');
    assert.strictEqual(elements.pendingModal.style.pointerEvents, 'auto');
    assert.strictEqual(elements.pendingMenu.style.opacity, '1');
    assert.strictEqual(elements.pendingMenu.style.visibility, 'visible');
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

    context.cpuPlayers = [];
    context.renderActiveGameState(player);
    assert.strictEqual(elements.btnSkip.disabled, false);
    context.cpuPlayers = undefined;
    context.renderActiveGameState(player);
    assert.strictEqual(elements.btnSkip.disabled, false);
    context.cpuPlayers = [null];

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

runTest('renderActiveGameState は通常手番と同一player追加ターンを席番号付きで一度だけ通知する', () => {
    const { context, elements } = loadUiRuntime();
    const makePlayer = name => ({
        name,
        coins: 5,
        cards: [],
        landmarks: { 駅: false },
        countCardIncludingDormant() { return 0; },
        isDormant() { return false; },
    });
    const players = [makePlayer('Alice'), makePlayer('Bob')];
    context.GameManager = { allowedActionsFor() { return new Set(); } };
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
        lastDice1: 0,
        lastDice2: 0,
        lastDiceResult: 0,
        log: [],
        players,
        currentPlayer() { return this.players[this.currentPlayerIndex]; },
    };
    context.cpuPlayers = [null, null];
    const turnStatus = context.document.getElementById('turnStatusAnnouncer');

    context.renderActiveGameState(players[0]);
    assert.strictEqual(turnStatus.textContent, '');

    context.game.phase = 'build';
    context.renderActiveGameState(players[0]);
    context.game.phase = 'roll';
    context.renderActiveGameState(players[0]);
    assert.strictEqual(
        turnStatus.textContent,
        'プレイヤー1、人間、Alice のターン'
    );

    turnStatus.textContent = 'same-turn-marker';
    context.renderActiveGameState(players[0]);
    assert.strictEqual(turnStatus.textContent, 'same-turn-marker');

    context.game.phase = 'build';
    context.renderActiveGameState(players[0]);
    context.game.phase = 'roll';
    context.game.currentPlayerIndex = 1;
    context.game.turnCount = 2;
    context.renderActiveGameState(players[1]);
    assert.strictEqual(
        turnStatus.textContent,
        'プレイヤー2、人間、Bob のターン'
    );

    turnStatus.textContent = 'replay-marker';
    context.game.phase = 'build';
    context.renderActiveGameState(players[1]);
    context.isReplaying = true;
    context.game.phase = 'roll';
    context.game.currentPlayerIndex = 0;
    context.game.turnCount = 3;
    context.renderActiveGameState(players[0]);
    assert.strictEqual(turnStatus.textContent, 'replay-marker');
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
    assert.ok(!/data-action="undoBuild"[^>]+disabled/.test(elements.buildMenu.innerHTML));

    context.isOnlineGame = true;
    context.socket = { connected: false };
    context.renderBuildMenu();
    assert.ok(elements.buildMenu.innerHTML.includes('data-action="undoBuild"'));
    assert.ok(/data-action="undoBuild"[^>]+disabled/.test(elements.buildMenu.innerHTML));
    context.isOnlineGame = false;

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

runTest('toggleLog wrapperはpure viewでicon・ARIA・classを同期する', () => {
    const { context, elements } = loadUiRuntime();

    assert.strictEqual(context.toggleLog(), true);
    assert.strictEqual(elements.log.classList.contains('collapsed'), true);
    assert.strictEqual(elements.logSummary.classList.contains('collapsed'), true);
    assert.strictEqual(elements.logToggleIcon.textContent, '▶');
    assert.strictEqual(elements.logHeader.classList.contains('collapsed'), true);
    assert.strictEqual(elements.logHeader.getAttribute('aria-expanded'), 'false');

    assert.strictEqual(context.toggleLog(), true);
    assert.strictEqual(elements.log.classList.contains('collapsed'), false);
    assert.strictEqual(elements.logSummary.classList.contains('collapsed'), false);
    assert.strictEqual(elements.logToggleIcon.textContent, '▼');
    assert.strictEqual(elements.logHeader.classList.contains('collapsed'), false);
    assert.strictEqual(elements.logHeader.getAttribute('aria-expanded'), 'true');
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

runTest('Business Center helper は相手ごとのchipと交換buttonを組み立てる', () => {
    const { context } = loadUiRuntime();
    const player = {
        name: 'Bob',
        cards: [{ name: '牧場' }, { name: 'パン屋' }],
        getMinorCards() { return this.cards; },
        isDormant(card) { return card.name === 'パン屋'; },
    };

    const html = context.buildBusinessTargetExchangeHtml(player, 2);

    assert.ok(html.includes('id="theirCardSelect_2" value="0"'));
    assert.ok(html.includes('data-input-id="theirCardSelect_2"'));
    assert.ok(html.includes('data-action="selectBusinessCard"'));
    assert.ok(html.includes('data-action="resolveBusiness"'));
    assert.ok(html.includes('data-target-index="2"'));
    assert.ok(html.includes('パン屋 💤'));
    assert.ok(!html.includes('bcSelectCard('));
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

runTest('pendingMenuRendererSpecs は GameManager の pending action spec と同期する', () => {
    const { context } = loadUiRuntime();
    const gameRuntime = loadGameRuntime();
    const expected = gameRuntime.PENDING_ACTION_SPECS
        .map(spec => ({ field: spec.field, action: spec.action }))
        .concat([{
            field: gameRuntime.PENDING_IT_QUEUE_POLICY.field,
            action: gameRuntime.PENDING_IT_QUEUE_POLICY.action,
        }]);

    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(context.pendingMenuRendererSpecs())),
        JSON.parse(JSON.stringify(expected))
    );
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
    assert.ok(allHtml.indexOf('data-action="resolveCleaning"') < allHtml.indexOf('data-action="resolveMover"'));
    assert.ok(allHtml.indexOf('data-action="resolveMover"') < allHtml.indexOf('data-action="resolveRenovation"'));
    assert.ok(allHtml.indexOf('data-action="resolveRenovation"') < allHtml.indexOf('data-action="resolveIT"'));

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

runTest('UiCardDetail helper はカード詳細HTMLのescape契約をpureに固定する', () => {
    const helper = require('../js/uiCardDetail');
    const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const card = { name: '<name>', color: 'bad-color', category: '<cat>', cost: 1, diceNums: [1] };
    const content = helper.buildCardDetailContent({
        card,
        escapeHtml: escape,
        getEffectText: () => '<effect>',
        safeCardColorName: color => ['blue', 'green', 'red', 'purple'].includes(color) ? color : 'blue',
    });

    assert.strictEqual(content.title, '<name>');
    assert.ok(content.html.includes('blue-badge'));
    assert.ok(content.html.includes('&lt;cat&gt;'));
    assert.ok(content.html.includes('&lt;effect&gt;'));
    assert.ok(!content.html.includes('<effect>'));

    const landmark = helper.buildLandmarkDetailContent({
        name: '駅',
        emoji: 'E',
        cost: 4,
        effectText: '<landmark-effect>',
        escapeHtml: escape,
    });
    assert.strictEqual(landmark.title, 'E 駅');
    assert.ok(landmark.html.includes('&lt;landmark-effect&gt;'));
    assert.ok(!landmark.html.includes('<landmark-effect>'));
});

runTest('buildCardDetailContent は施設カード詳細HTMLを生成する', () => {
    const { context } = loadUiRuntime();
    const card = context.createCardByName('麦畑');

    const content = context.buildCardDetailContent(card);

    assert.strictEqual(content.title, '麦畑');
    assert.ok(content.html.includes('コスト'));
    assert.ok(content.html.includes('🎲 [1]'));
    assert.ok(content.html.includes('color-badge blue-badge'));
    assert.ok(content.html.includes('card-detail-effect'));
});

runTest('buildLandmarkDetailContent はランドマーク詳細HTMLを生成する', () => {
    const { context } = loadUiRuntime();

    const content = context.buildLandmarkDetailContent('駅');

    assert.ok(content.title.includes('駅'));
    assert.ok(content.html.includes('ランドマーク'));
    assert.ok(content.html.includes('💰 4'));
    assert.ok(content.html.includes('サイコロ'));
});

runTest('UiBuildMenu card filter transitionはstate更新と再描画要求をpureに分離する', () => {
    const helper = require('../js/uiBuildMenu');
    assert.deepStrictEqual({ ...helper.cardFilterTransition('', 'green') }, {
        cardFilter: 'green',
        changed: true,
        shouldRender: true,
    });
    assert.deepStrictEqual({ ...helper.cardFilterTransition('green', 'green') }, {
        cardFilter: 'green',
        changed: false,
        shouldRender: true,
    });
    assert.deepStrictEqual({ ...helper.cardFilterTransition('green', 'future-filter') }, {
        cardFilter: 'future-filter',
        changed: true,
        shouldRender: true,
    });
});

runTest('UiBuildMenu filter controllerは選択・再選択・resetを単独所有する', () => {
    const helper = require('../js/uiBuildMenu');
    const controller = helper.createFilterController();
    assert.deepStrictEqual(controller.snapshot(), { cardFilter: '' });
    assert.deepStrictEqual(controller.set('green'), {
        cardFilter: 'green', changed: true, shouldRender: true,
    });
    assert.strictEqual(controller.get(), 'green');
    assert.deepStrictEqual(controller.set('green'), {
        cardFilter: 'green', changed: false, shouldRender: true,
    });
    controller.set('future-filter');
    controller.clear();
    assert.strictEqual(controller.get(), '');
    assert.ok(Object.isFrozen(controller.snapshot()));
});

runTest('UiBuildMenu filter viewはactiveとaria-pressedを同じstateから生成する', () => {
    const helper = require('../js/uiBuildMenu');
    assert.deepStrictEqual({ ...helper.cardFilterButtonView('red', 'red') }, {
        active: true,
        ariaPressed: 'true',
        className: 'card-filter-btn active',
    });
    assert.deepStrictEqual({ ...helper.cardFilterButtonView('red', 'blue') }, {
        active: false,
        ariaPressed: 'false',
        className: 'card-filter-btn',
    });

    const html = helper.buildCardFilterBarHtml('red');
    assert.strictEqual((html.match(/aria-pressed="true"/g) || []).length, 1);
    assert.ok(/class="card-filter-btn active"[^>]+data-card-filter="red"[^>]+aria-pressed="true"/.test(html));
    assert.ok(/data-card-filter="blue"[^>]+aria-pressed="false"/.test(html));
    assert.ok(/data-card-filter="affordable"[^>]+aria-pressed="false"/.test(html));
    assert.ok(html.includes('建設可'));
});

runTest('UiBuildMenu filter focusは同一identityと操作可能な再描画後targetだけを許可する', () => {
    const helper = require('../js/uiBuildMenu');
    assert.deepStrictEqual(helper.cardFilterFocusPlan('red', {
        action: 'setCardFilter', cardFilter: 'red',
    }), { restore: true, cardFilter: 'red' });
    assert.strictEqual(helper.cardFilterFocusPlan('red', {
        action: 'setCardFilter', cardFilter: 'blue',
    }).restore, false);
    assert.strictEqual(helper.cardFilterFocusPlan('future-filter', {
        action: 'setCardFilter', cardFilter: 'future-filter',
    }).restore, false);
    assert.deepStrictEqual(helper.cardFilterFocusPlan('affordable', {
        action: 'setCardFilter', cardFilter: 'affordable',
    }), { restore: true, cardFilter: 'affordable' });
    assert.strictEqual(helper.canRestoreCardFilterFocus({ connected: true }), true);
    for (const unavailable of [
        { connected: false },
        { hidden: true },
        { disabled: true },
        { ancestorHidden: true },
    ]) {
        assert.strictEqual(helper.canRestoreCardFilterFocus(unavailable), false);
    }
});

runTest('UiBuildMenu build focus controllerは建設identityをUndo後の復元先へ引き継ぐ', () => {
    const helper = require('../js/uiBuildMenu');
    const controller = helper.createActionFocusController();
    const buildPlan = controller.plan({ action: 'buildCard', cardName: '麦畑' }, true);
    assert.deepStrictEqual(buildPlan, {
        restore: true,
        identity: { action: 'buildCard', name: '麦畑' },
        fallback: true,
    });
    assert.deepStrictEqual(controller.plan({ action: 'undoBuild' }, true), {
        restore: true,
        identity: { action: 'buildCard', name: '麦畑' },
        fallback: true,
    });
    assert.strictEqual(controller.plan({ action: 'buildLandmark', landmarkName: '駅' }, false).restore, false);
    assert.deepStrictEqual(controller.snapshot().previousBuildIdentity, {
        action: 'buildCard', name: '麦畑',
    });
    assert.strictEqual(controller.plan({ action: 'showCardDetail', cardName: '麦畑' }, true).restore, false);
    controller.reset();
    assert.deepStrictEqual(controller.plan({ action: 'undoBuild' }, true), {
        restore: true, identity: null, fallback: true,
    });
});

runTest('UiBuildMenu build focus effectはidentityを優先し欠落時だけfallbackする', () => {
    const helper = require('../js/uiBuildMenu');
    const calls = [];
    const plan = helper.buildActionFocusPlan(
        helper.buildActionIdentity({ action: 'buildLandmark', landmarkName: '駅' }),
        null,
        true
    );
    assert.strictEqual(helper.applyBuildActionFocusPlan(plan, {
        findIdentity(identity) { calls.push(['find', identity.name]); return { id: '駅' }; },
        focusIdentity(target) { calls.push(['focus', target.id]); return true; },
        focusFallback() { calls.push(['fallback']); return true; },
    }), true);
    assert.deepStrictEqual(calls, [['find', '駅'], ['focus', '駅']]);

    assert.strictEqual(helper.applyBuildActionFocusPlan(plan, {
        findIdentity: () => null,
        focusIdentity: () => false,
        focusFallback: () => true,
    }), true);
});

runTest('renderBuildMenuは建設後はskip、Undo後は復元されたcardへfocusを移す', () => {
    const { context, elements } = loadUiRuntime();
    const player = {
        coins: 10,
        landmarks: { '駅': false },
        countCardIncludingDormant() { return 0; },
    };
    context.GameManager = { allowedActionsFor: game => new Set(game.allowed) };
    context.game = {
        phase: 'build', currentPlayerIndex: 0, builtThisTurn: false, pendingRenovation: 0,
        allowed: ['buildCard'], currentPlayer() { return player; },
    };
    context.cpuPlayers = [null];
    const oldCard = makeElement({
        dataset: { action: 'buildCard', cardName: '麦畑' },
        parentElement: elements.buildMenu,
    });
    const restoredCard = makeElement({
        dataset: { action: 'buildCard', cardName: '麦畑' },
        parentElement: elements.buildMenu,
    });
    const undo = makeElement({
        dataset: { action: 'undoBuild' },
        parentElement: elements.buildMenu,
    });
    elements.buildMenu.querySelectorAll = selector => selector.includes('buildCard')
        ? [restoredCard]
        : [];
    elements.btnSkip.focus = () => { elements.btnSkip.focused = true; };

    context.document.activeElement = oldCard;
    context.game.builtThisTurn = true;
    context.game.allowed = ['undoBuild', 'nextTurn'];
    context.undoState = { state: 'before-build' };
    restoredCard.disabled = true;
    context.renderBuildMenu();
    assert.strictEqual(elements.btnSkip.focused, true);

    context.document.activeElement = undo;
    context.game.builtThisTurn = false;
    context.game.allowed = ['buildCard'];
    context.undoState = null;
    restoredCard.disabled = false;
    context.renderBuildMenu();
    assert.strictEqual(restoredCard.focused, true);
});

runTest('renderBuildMenuはCPU・online replay・別領域のfocusを奪わない', () => {
    for (const mode of ['cpu', 'replay', 'outside']) {
        const { context, elements } = loadUiRuntime();
        const player = {
            coins: 10, landmarks: { '駅': false },
            countCardIncludingDormant() { return 0; },
        };
        context.GameManager = { allowedActionsFor: () => new Set(['buildCard']) };
        context.game = {
            phase: 'build', currentPlayerIndex: 0, builtThisTurn: false, pendingRenovation: 0,
            currentPlayer() { return player; },
        };
        context.cpuPlayers = mode === 'cpu' ? [{}] : [null];
        context.isReplaying = mode === 'replay';
        const source = makeElement({
            dataset: { action: 'buildCard', cardName: '麦畑' },
            parentElement: mode === 'outside' ? null : elements.buildMenu,
        });
        const target = makeElement({
            dataset: { action: 'buildCard', cardName: '麦畑' },
            parentElement: elements.buildMenu,
        });
        elements.buildMenu.querySelectorAll = () => [target];
        context.document.activeElement = source;

        context.renderBuildMenu();

        assert.strictEqual(target.focused, undefined, mode);
        assert.strictEqual(elements.btnSkip.focused, undefined, mode);
    }
});

runTest('renderBuildMenuはonline ACK後のbuildとUndoで同じfocus identityを使う', () => {
    const { context, elements } = loadUiRuntime();
    const player = {
        coins: 10,
        landmarks: { '駅': false },
        countCardIncludingDormant() { return 0; },
    };
    context.GameManager = { allowedActionsFor: game => new Set(game.allowed) };
    context.game = {
        phase: 'build', currentPlayerIndex: 0, builtThisTurn: false, pendingRenovation: 0,
        allowed: ['buildLandmark'], currentPlayer() { return player; },
    };
    context.cpuPlayers = [null];
    context.isOnlineGame = true;
    context.myPlayerIndex = 0;
    context.socket = { connected: true };
    context.onlineActionInFlight = false;
    context.isReconnectingOnline = false;
    context.isReplaying = false;
    const oldLandmark = makeElement({
        dataset: { action: 'buildLandmark', landmarkName: '駅' },
        parentElement: elements.buildMenu,
    });
    const restoredLandmark = makeElement({
        dataset: { action: 'buildLandmark', landmarkName: '駅' },
        parentElement: elements.buildMenu,
        disabled: true,
    });
    const undo = makeElement({
        dataset: { action: 'undoBuild' },
        parentElement: elements.buildMenu,
    });
    elements.buildMenu.querySelectorAll = selector => selector.includes('buildLandmark')
        ? [restoredLandmark]
        : [];

    context.document.activeElement = oldLandmark;
    context.game.builtThisTurn = true;
    context.game.allowed = ['undoBuild', 'nextTurn'];
    context.undoState = { state: 'online-before-build' };
    context.renderBuildMenu();
    assert.strictEqual(elements.btnSkip.focused, true);

    context.document.activeElement = undo;
    context.game.builtThisTurn = false;
    context.game.allowed = ['buildLandmark'];
    context.undoState = null;
    restoredLandmark.disabled = false;
    context.renderBuildMenu();
    assert.strictEqual(restoredLandmark.focused, true);
});

runTest('setCardFilterはinnerHTML再描画後の同一filterにだけfocusを復元する', () => {
    const { context, elements } = loadUiRuntime();
    const player = {
        coins: 10,
        landmarks: { '駅': false },
        countCardIncludingDormant() { return 0; },
    };
    context.GameManager = { allowedActionsFor: () => new Set(['buildCard']) };
    context.game = {
        phase: 'build', currentPlayerIndex: 0, builtThisTurn: false, pendingRenovation: 0,
        currentPlayer() { return player; },
    };
    context.cpuPlayers = [null];
    const oldRed = makeElement({ dataset: { action: 'setCardFilter', cardFilter: 'red' } });
    const newRed = makeElement({
        dataset: { action: 'setCardFilter', cardFilter: 'red' },
        parentElement: elements.buildMenu,
        isConnected: true,
    });
    elements.buildMenu.querySelectorAll = () => [newRed];

    context.setCardFilter('red', oldRed);

    assert.strictEqual(newRed.focused, true);
    assert.ok(/data-card-filter="red"[^>]+aria-pressed="true"/.test(elements.buildMenu.innerHTML));

    newRed.focused = false;
    elements.buildMenu.style.display = 'none';
    context.setCardFilter('red', oldRed);
    assert.strictEqual(newRed.focused, false);
});

runTest('UiBuildMenu action state はphase・pending・turn・allowedActionsをpureに判定する', () => {
    const helper = require('../js/uiBuildMenu');
    const base = {
        phase: 'build',
        buildPhase: 'build',
        pendingRenovation: 0,
        builtThisTurn: false,
        isHumanTurn: true,
        allowedActions: new Set(['buildCard', 'buildLandmark']),
    };

    assert.deepStrictEqual({ ...helper.buildActionState(base) }, {
        buildGateOpen: true,
        canBuildCardAction: true,
        canBuildLandmarkAction: true,
    });
    assert.deepStrictEqual({ ...helper.buildActionState({ ...base, allowedActions: ['buildCard'] }) }, {
        buildGateOpen: true,
        canBuildCardAction: true,
        canBuildLandmarkAction: false,
    });
    for (const blocked of [
        { phase: 'roll' },
        { pendingRenovation: 1 },
        { builtThisTurn: true },
        { isHumanTurn: false },
    ]) {
        const state = helper.buildActionState({ ...base, ...blocked });
        assert.strictEqual(state.canBuildCardAction, false);
        assert.strictEqual(state.canBuildLandmarkAction, false);
    }
});

runTest('UiBuildMenu 建設shortcutはCPU・online相手・replay・pending中に表示しない', () => {
    const helper = require('../js/uiBuildMenu');
    const base = {
        phase: 'build',
        buildPhase: 'build',
        hasPending: false,
        builtThisTurn: false,
        isHumanTurn: true,
        isReplaying: false,
        inputBlocked: false,
        allowedActions: new Set(['buildCard', 'buildLandmark', 'nextTurn']),
    };
    assert.deepStrictEqual({ ...helper.buildShortcutView(base) }, {
        visible: true,
        display: 'block',
        disabled: false,
        ariaHidden: 'false',
    });
    for (const [label, blocked] of [
        ['別phase', { phase: 'roll' }],
        ['pending', { hasPending: true }],
        ['建設済み', { builtThisTurn: true }],
        ['CPU手番', { isHumanTurn: false }],
        ['online相手手番', { isHumanTurn: false }],
        ['replay', { isReplaying: true }],
        ['online入力block', { inputBlocked: true }],
        ['建設actionなし', { allowedActions: new Set(['nextTurn']) }],
    ]) {
        assert.strictEqual(helper.buildShortcutView({ ...base, ...blocked }).visible, false, label);
    }
});

runTest('UiBuildMenu 建設shortcut effectは表示同期と既存menuへのfocus/scrollを行う', () => {
    const helper = require('../js/uiBuildMenu');
    const button = {
        style: {},
        setAttribute(name, value) { this[name] = value; },
    };
    assert.strictEqual(helper.applyBuildShortcutView(button, helper.buildShortcutView({})), true);
    assert.strictEqual(button.style.display, 'none');
    assert.strictEqual(button.disabled, true);
    assert.strictEqual(button['aria-hidden'], 'true');

    const calls = [];
    const target = {
        focus(options) { calls.push(['focus', options]); },
        scrollIntoView(options) { calls.push(['scrollIntoView', options]); },
    };
    assert.strictEqual(helper.focusAndScrollToBuildMenu(target), true);
    assert.deepStrictEqual(calls, [
        ['focus', { preventScroll: true }],
        ['scrollIntoView', { block: 'start' }],
    ]);
    assert.strictEqual(helper.focusAndScrollToBuildMenu({ focus() {} }), false);
});

runTest('UiBuildMenu undo stateは表示条件とhuman入力gateをpureに分離する', () => {
    const helper = require('../js/uiBuildMenu');
    const visible = helper.undoBuildActionState({
        hasUndoState: true,
        hasGame: true,
        builtThisTurn: true,
        allowedActions: new Set(['undoBuild']),
        isHumanTurn: false,
    });
    assert.deepStrictEqual({ ...visible }, { visible: true, enabled: false });
    assert.ok(helper.buildUndoBuildButtonHtml(visible).includes(' disabled'));
    const enabled = helper.undoBuildActionState({
        hasUndoState: true,
        hasGame: true,
        builtThisTurn: true,
        allowedActions: ['undoBuild'],
        isHumanTurn: true,
    });
    assert.deepStrictEqual({ ...enabled }, { visible: true, enabled: true });
    assert.ok(!helper.buildUndoBuildButtonHtml(enabled).includes(' disabled'));
    for (const blocked of [
        { hasUndoState: false },
        { hasGame: false },
        { builtThisTurn: false },
        { allowedActions: [] },
    ]) {
        const state = helper.undoBuildActionState({
            hasUndoState: true,
            hasGame: true,
            builtThisTurn: true,
            allowedActions: ['undoBuild'],
            isHumanTurn: true,
            ...blocked,
        });
        assert.strictEqual(state.visible, false);
        assert.strictEqual(helper.buildUndoBuildButtonHtml(state), '');
    }
});

runTest('UiBuildMenu helper は建設メニューのescapeとgateをpureに固定する', () => {
    const helper = require('../js/uiBuildMenu');
    const card = {
        name: '<card>',
        color: 'green" onclick=alert(1)',
        category: '<cat>',
        diceNums: [1, 2],
        cost: 3,
    };
    const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const cardHtml = helper.renderBuildCardButton({
        card,
        stock: 2,
        canBuildThis: true,
        escapeHtml: escape,
        getEffectText: () => '<effect>',
    });

    assert.ok(cardHtml.includes('card-color-blue'));
    assert.ok(cardHtml.includes('&lt;card&gt;'));
    assert.ok(cardHtml.includes('&lt;cat&gt;'));
    assert.ok(cardHtml.includes('&lt;effect&gt;'));
    assert.ok(!cardHtml.includes('<effect>'));
    assert.ok(cardHtml.includes('<div class="card-meta-row">'));
    assert.ok(cardHtml.indexOf('</button><div class="card-meta-row">') >= 0);
    assert.ok(cardHtml.includes('ℹ 詳細'));
    assert.ok(cardHtml.includes('<span class="card-stock">残り2枚</span>'));

    const visible = helper.buildVisibleCardButtonsHtml({
        cards: [card],
        cardFilter: '',
        enabledCards: new Set([card.name]),
        shopStock: { [card.name]: 2 },
        current: { coins: 1, countCardIncludingDormant: () => 0 },
        canBuildCardAction: true,
        compareCardsForDisplay: () => 0,
        getShopStockCount: stock => stock[card.name],
        renderBuildCardButton: (_card, stock, canBuildThis) => String(stock) + ':' + String(canBuildThis),
    });
    assert.strictEqual(visible, '2:false');
});

runTest('UiBuildMenu 建設可filterは既存の合法性・在庫・所持金・紫重複判定を共有する', () => {
    const helper = require('../js/uiBuildMenu');
    const cards = [
        { name: '安価', color: 'blue', cost: 1 },
        { name: '高価', color: 'green', cost: 5 },
        { name: '紫重複', color: 'purple', cost: 1 },
        { name: '在庫切れ', color: 'red', cost: 1 },
    ];
    const current = {
        coins: 2,
        countCardIncludingDormant: name => name === '紫重複' ? 1 : 0,
    };
    const render = (card, stock, canBuildThis) => `${card.name}:${stock}:${canBuildThis};`;
    const base = {
        cards,
        cardFilter: 'affordable',
        enabledCards: new Set(cards.map(card => card.name)),
        shopStock: { 安価: 2, 高価: 2, 紫重複: 2, 在庫切れ: 0 },
        current,
        compareCardsForDisplay: () => 0,
        getShopStockCount: (stock, card) => stock[card.name],
        renderBuildCardButton: render,
    };

    assert.strictEqual(helper.buildVisibleCardButtonsHtml({
        ...base, canBuildCardAction: true,
    }), '安価:2:true;');
    assert.strictEqual(helper.buildVisibleCardButtonsHtml({
        ...base, canBuildCardAction: false,
    }), '');
    assert.strictEqual(helper.buildCardEmptyStateHtml('affordable'),
        '<p class="build-filter-empty">現在建設できる施設はありません</p>');
});

runTest('buildBuildMenuHtml はカード/ランドマーク領域をhelperで組み立てる', () => {
    const { context } = loadUiRuntime();
    context.game = { builtThisTurn: false };
    const current = {
        coins: 10,
        landmarks: { '駅': false, 'ショッピングモール': false },
        countCardIncludingDormant() { return 0; },
    };

    const html = context.buildBuildMenuHtml(current, true, true);
    assert.ok(html.includes('class="build-section build-card-section"'));

    assert.ok(html.includes('建設する施設を選んでください'));
    assert.ok(html.includes('施設カード'));
    assert.ok(html.includes('ランドマーク'));
    assert.ok(html.includes('data-action="setCardFilter"'));
    assert.ok(html.includes('data-action="showCardDetail"'));
    assert.ok(html.includes('data-action="showLandmarkDetail"'));
});

runTest('buildBuildMenuHtml は在庫欠落カードを建設候補に表示しない', () => {
    const { context } = loadUiRuntime();
    context.SHOP_STOCK = {};
    context.game = { builtThisTurn: false };
    const current = {
        coins: 10,
        landmarks: { '駅': false },
        countCardIncludingDormant() { return 0; },
    };

    const html = context.buildBuildMenuHtml(current, true, true);

    assert.ok(!html.includes('残りundefined枚'));
    assert.ok(!html.includes('data-action="buildCard"'));
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

runTest('カード詳細と建設ボタンは説明文と分類をescapeする', () => {
    const { context } = loadUiRuntime();
    const card = {
        name: '<img src=x onerror=alert(1)>',
        color: 'green" onclick="alert(1)',
        category: '<script>alert(1)</script>',
        cost: 1,
        diceNums: [1],
        income: '<b>9</b>',
        effect: 'unknown-effect',
    };

    const buttonHtml = context.renderBuildCardButton(card, 1, true);
    const detail = context.buildCardDetailContent(card);

    assert.ok(buttonHtml.includes('card-color-blue'));
    assert.ok(!buttonHtml.includes('onclick="alert(1)'));
    assert.ok(buttonHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(buttonHtml.includes('+&lt;b&gt;9&lt;/b&gt;コイン'));
    assert.ok(!buttonHtml.includes('<script>alert(1)</script>'));
    assert.ok(!buttonHtml.includes('+<b>9</b>コイン'));
    assert.ok(detail.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(detail.html.includes('+&lt;b&gt;9&lt;/b&gt;コイン'));
    assert.ok(!detail.html.includes('<script>alert(1)</script>'));
    assert.ok(!detail.html.includes('+<b>9</b>コイン'));
});

runTest('ランドマーク詳細と建設ボタンは説明文をescapeする', () => {
    const { context } = loadUiRuntime();
    const originalEffect = vm.runInContext("Player._LANDMARK_DEFS.find(def => def.name === '駅').effect", context);
    vm.runInContext("Player._LANDMARK_DEFS.find(def => def.name === '駅').effect = '<img src=x onerror=alert(1)>サイコロ'", context);
    try {
        const buttonHtml = context.renderLandmarkBuildButton('駅', false, 4, true);
        const detail = context.buildLandmarkDetailContent('駅');

        assert.ok(buttonHtml.includes('&lt;img src=x onerror=alert(1)&gt;サイコロ'));
        assert.ok(detail.html.includes('&lt;img src=x onerror=alert(1)&gt;サイコロ'));
        assert.ok(!buttonHtml.includes('<img src=x onerror=alert(1)>'));
        assert.ok(!detail.html.includes('<img src=x onerror=alert(1)>'));
    } finally {
        vm.runInContext("Player._LANDMARK_DEFS.find(def => def.name === '駅').effect = " + JSON.stringify(originalEffect), context);
    }
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

runTest('card select toggle HTML helpers は data-action と aria-pressed を生成する', () => {
    const { context } = loadUiRuntime();

    const cardOn = context.buildCardSelectToggleButtonHtml('麦畑', true);
    assert.ok(cardOn.includes('class="card-toggle-btn on"'));
    assert.ok(cardOn.includes('data-action="toggleCard"'));
    assert.ok(cardOn.includes('data-card-name="麦畑"'));
    assert.ok(cardOn.includes('id="cardToggle_麦畑"'));
    assert.ok(cardOn.includes('aria-pressed="true"'));

    const landmarkOff = context.buildLandmarkSelectToggleButtonHtml('港', false);
    assert.ok(landmarkOff.includes('class="card-toggle-btn off"'));
    assert.ok(landmarkOff.includes('data-action="toggleLandmark"'));
    assert.ok(landmarkOff.includes('data-landmark-name="港"'));
    assert.ok(landmarkOff.includes('aria-pressed="false"'));
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
