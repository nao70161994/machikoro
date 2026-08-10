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
            MACHIKORO_CLIENT_VERSION: options.clientVersion || 'integration-build',
            MACHIKORO_ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED: options.onlineReconnectEventAuthorityEnabled === true,
            MACHIKORO_ONLINE_RECONNECT_EFFECT_AUTHORITY_ENABLED: options.onlineReconnectEffectAuthorityEnabled === true,
            MACHIKORO_ONLINE_RECONNECT_STATUS_EFFECT_AUTHORITY_ENABLED: options.onlineReconnectStatusEffectAuthorityEnabled === true,
            MACHIKORO_ONLINE_RECONNECT_TIMER_AUTHORITY_ENABLED: options.onlineReconnectTimerAuthorityEnabled === true,
            MACHIKORO_ONLINE_RECONNECT_CALLBACK_AUTHORITY_ENABLED: options.onlineReconnectCallbackAuthorityEnabled === true,
            MACHIKORO_ONLINE_RECONNECT_QUEUE_PLAN_AUTHORITY_ENABLED: options.onlineReconnectQueuePlanAuthorityEnabled === true,
            MACHIKORO_ONLINE_RECONNECT_QUEUE_EFFECT_AUTHORITY_ENABLED: options.onlineReconnectQueueEffectAuthorityEnabled === true,
            MACHIKORO_ONLINE_RESTORE_ABORT_PLAN_AUTHORITY_ENABLED: options.onlineRestoreAbortPlanAuthorityEnabled === true,
            MACHIKORO_ONLINE_RESTORE_ABORT_EFFECT_AUTHORITY_ENABLED: options.onlineRestoreAbortEffectAuthorityEnabled === true,
            MACHIKORO_ONLINE_ACTION_TIMEOUT_PLAN_AUTHORITY_ENABLED: options.onlineActionTimeoutPlanAuthorityEnabled === true,
            MACHIKORO_ONLINE_ACTION_TIMEOUT_EFFECT_AUTHORITY_ENABLED: options.onlineActionTimeoutEffectAuthorityEnabled === true,
            MACHIKORO_ONLINE_GAME_ACTION_DECODE_EFFECT_AUTHORITY_ENABLED: options.onlineGameActionDecodeEffectAuthorityEnabled === true,
            MACHIKORO_ONLINE_ACTION_ACCEPTED_DECODE_EFFECT_AUTHORITY_ENABLED: options.onlineActionAcceptedDecodeEffectAuthorityEnabled === true,
            MACHIKORO_ONLINE_GAME_ACTION_APPLY_EFFECT_AUTHORITY_ENABLED: options.onlineGameActionApplyEffectAuthorityEnabled === true,
            MACHIKORO_ONLINE_ACTION_ACCEPTED_APPLY_EFFECT_AUTHORITY_ENABLED: options.onlineActionAcceptedApplyEffectAuthorityEnabled === true,
            MACHIKORO_ONLINE_GAME_ACTION_GAP_EFFECT_AUTHORITY_ENABLED: options.onlineGameActionGapEffectAuthorityEnabled === true,
            MACHIKORO_ONLINE_ACTION_ACCEPTED_GAP_EFFECT_AUTHORITY_ENABLED: options.onlineActionAcceptedGapEffectAuthorityEnabled === true,
            MACHIKORO_ONLINE_GAME_ACTION_NO_GAME_EFFECT_AUTHORITY_ENABLED: options.onlineGameActionNoGameEffectAuthorityEnabled === true,
            MACHIKORO_ONLINE_ACTION_ACCEPTED_NO_GAME_EFFECT_AUTHORITY_ENABLED: options.onlineActionAcceptedNoGameEffectAuthorityEnabled === true,
            MACHIKORO_ONLINE_GAME_ACTION_COMMIT_EFFECT_AUTHORITY_ENABLED: options.onlineGameActionCommitEffectAuthorityEnabled === true,
            MACHIKORO_ONLINE_ACTION_ACCEPTED_COMMIT_EFFECT_AUTHORITY_ENABLED: options.onlineActionAcceptedCommitEffectAuthorityEnabled === true,
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
    if (options.withoutIo) delete context.io;
    context.global = context;
    vm.createContext(context);
    const files = [
        'js/Card.js',
        'js/Player.js',
        'js/gameSelectionState.js',
        'js/gameSetupState.js',
        'js/gameRuntimeState.js',
        'js/onlineRuntimeState.js',
        'js/onlineSetupState.js',
        'js/actionContract.js',
        'js/gameSchemaNegotiation.js',
        'js/gameSnapshot.js',
        'js/gameEngineRuntimeAdapter.js',
        'js/localSaveRepository.js',
        'js/localSaveRuntime.js',
        'js/gameSchemaCodec.js',
        'js/gameSchemaWire.js',
        'js/recreateRoomPayload.js',
        'js/gameSchemaRecreateWire.js',
        'js/gameEngine.js',
        'js/gameEngineDeterminism.js',
        'js/gameEngineAuthority.js',
        'js/gameEngineClientShadow.js',
        'js/localGameEngineRuntime.js',
        'js/pendingActionQueue.js',
        'js/gameTurnPolicy.js',
        'js/gameDicePolicy.js',
        'js/gameCardActivationPolicy.js',
        'js/gameBuildPolicy.js',
        'js/gameCoinTransaction.js',
        'js/gamePendingTransition.js',
        'js/gamePendingResolutionPolicy.js',
        'js/GameManager.js',
        'js/cpuTuning.js',
        'js/cpuProfile.js',
        'js/cpuSelection.js',
        'js/cpuDiagnostics.js',
        'js/cpuEvaluationCache.js',
        'js/cpuEvaluation.js',
        'js/cpuLegalMoves.js',
        'js/cpuBusinessMoves.js',
        'js/cpuBusinessDecisionRuntime.js',
        'js/cpuActionProposal.js',
        'js/cpuBuildExecution.js',
        'js/cpuBuildProposalCollector.js',
        'js/cpuBuildStrategy.js',
        'js/cpuBuildScoring.js',
        'js/cpuChoiceScoring.js',
        'js/cpuCardEvaluationRuntime.js',
        'js/cpuStateEvaluationRuntime.js',
        'js/cpuBuildPolicyRuntime.js',
        'js/cpuSimulation.js',
        'js/cpuLookaheadRuntime.js',
        'js/cpuPendingResolution.js',
        'js/cpuPendingDecision.js',
        'js/cpuRollDecision.js',
        'js/CPU.js',
        'js/clientStorage.js',
        'js/appShellStorage.js',
        'js/clientCheckpoint.js',
        'js/clientReporting.js',
        'js/clientReportingTransport.js',
        'js/retryTimer.js',
        'js/appShellClientReportingRuntime.js',
        'js/lifecycleNotify.js',
        'js/lifecycleRuntime.js',
        'js/lifecycleTransport.js',
        'js/clientEventRuntime.js',
        'js/uiWatchdog.js',
        'js/uiDomSnapshot.js',
        'js/uiRecoveryEffects.js',
        'js/uiWatchdogAsyncRecovery.js',
        'js/uiWatchdogRecoveryRuntime.js',
        'js/appShellUiLockRuntime.js',
        'js/appShellComposition.js',
        'js/appShellRuntimeEffects.js',
        'js/appShellObservationRuntime.js',
        'js/uiWatchdogMonitor.js',
        'js/uiWatchdogReporting.js',
        'js/uiWatchdogRuntime.js',
        'js/clientRuntimeSnapshot.js',
        'js/crashScreen.js',
        'js/crashScreenEffects.js',
        'js/appShellCrashRuntime.js',
        'js/pwaShell.js',
        'js/appShellStartupRuntime.js',
        'js/actionUiRegistry.js',
        'js/uiTabView.js',
        'js/uiTabEffects.js',
        'js/appShell.js',
        'js/localPlayerSettings.js',
        'js/localGameStart.js',
        'js/localGameStartRuntime.js',
        'js/localGameInitializer.js',
        'js/localGameRestartRuntime.js',
        'js/autoSkipPolicy.js',
        'js/mainAutoSkipRuntime.js',
        'js/pageActivationPolicy.js',
        'js/delayedHumanActionPolicy.js',
        'js/pageActivationRuntime.js',
        'js/cpuSchedulerState.js',
        'js/cpuTurnSchedulerRuntime.js',
        'js/cpuTurnStrategy.js',
        'js/cpuPhaseHandlers.js',
        'js/localActionPolicy.js',
        'js/mainHumanActionRuntime.js',
        'js/uiEventDelegation.js',
        'js/mainUiEventRuntime.js',
        'js/citySkyline.js',
        'js/savedGameValidation.js',
        'js/storageSettings.js',
        'js/localResumePolicy.js',
        'js/localResumePreloadState.js',
        'js/localResumeView.js',
        'js/localResumeEffects.js',
        'js/storedOnlineReconnect.js',
        'js/storage.js',
        'js/uiStatsView.js',
        'js/stats.js',
        'js/uiNotice.js',
        'js/uiLogDisplay.js',
        'js/uiCardOrder.js',
        'js/uiPlayerDisplay.js',
        'js/uiInputPolicy.js',
        'js/uiBuildMenu.js',
        'js/uiPendingMenu.js',
        'js/uiPendingEffects.js',
        'js/uiCardDetail.js',
        'js/uiCardSelect.js',
        'js/uiCardSelectEffects.js',
        'js/uiTutorialSettings.js',
        'js/uiTutorial.js',
        'js/uiDiceChoice.js',
        'js/uiDiceDisplay.js',
        'js/uiTurnAnnouncer.js',
        'js/uiModalPolicy.js',
        'js/uiModalOpen.js',
        'js/uiModalClose.js',
        'js/uiModalDomEffects.js',
        'js/uiModalRuntime.js',
        'js/uiWinner.js',
        'js/uiWinnerEffects.js',
        'js/uiGameStatusView.js',
        'js/uiGameStatusEffects.js',
        'js/uiRuntimeSnapshot.js',
        'js/uiRenderRuntime.js',
        'js/ui.js',
    ];
    if (options.includeOnline) {
        files.push('js/onlineStorage.js');
        files.push('js/onlinePayload.js');
        files.push('js/onlineRestoreQueueState.js');
        files.push('js/onlineRestoreLifecycleState.js');
        files.push('js/onlineRestoreQueue.js');
        files.push('js/onlineReconnectCleanup.js');
        files.push('js/onlineReconnectRequest.js');
        files.push('js/onlineRestoreAbort.js');
        files.push('js/onlineActionTimeout.js');
        files.push('js/onlineDecodeFailure.js');
        files.push('js/onlineActionApplyFailure.js');
        files.push('js/onlineActionGap.js');
        files.push('js/onlineActionNoGame.js');
        files.push('js/onlineActionCommit.js');
        files.push('js/onlineSocketConnect.js');
        files.push('js/onlineSocketRegistry.js');
        files.push('js/onlineInboundActionRuntime.js');
        files.push('js/onlineGameEngineRuntime.js');
        files.push('js/onlineLobbyRequestRuntime.js');
        files.push('js/onlineGameInitializer.js');
        files.push('js/onlineLobbyStartRuntime.js');
        files.push('js/onlineSocketDisconnect.js');
        files.push('js/onlineHostChanged.js');
        files.push('js/onlineRejoinPersistence.js');
        files.push('js/onlineRejoinPreparationRuntime.js');
        files.push('js/onlinePendingOutboundState.js');
        files.push('js/onlinePendingResend.js');
        files.push('js/onlineRestoreReplay.js');
        files.push('js/onlineRestoreActivation.js');
        files.push('js/onlineRejoinActivationRuntime.js');
        files.push('js/onlineRejoinRuntime.js');
        files.push('js/onlinePlayerSettings.js');
        files.push('js/onlineLobbyRequestState.js');
        files.push('js/onlineHostlessRestoreState.js');
        files.push('js/onlineRestoreRank.js');
        files.push('js/onlineActionSequence.js');
        files.push('js/onlineActionLog.js');
        files.push('js/onlineSessionLifecycle.js');
        files.push('js/onlineReconnectState.js');
        files.push('js/onlineRuntimeFlags.js');
        files.push('js/onlineDiagnosticState.js');
        files.push('js/onlineRetryPolicy.js');
        files.push('js/onlineReconnectRuntime.js');
        files.push('js/onlineSchemaTransport.js');
        files.push('js/onlineClientEffects.js');
        files.push('js/onlineDomEffects.js');
        files.push('js/onlineSocketEffects.js');
        files.push('js/onlineComposition.js');
        files.push('js/online.js');
    }
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
        hideAllModals() {
            ['confirmModal', 'pendingModal', 'rulesModal', 'cardSelectModal', 'cardDetailModal'].forEach(id => {
                const el = elements[id];
                if (el && el.style) el.style.display = 'none';
                if (el) el.hidden = false;
            });
            if (context.window) context.window.__machikoroConfirmModalOpen = false;
        },
        startLocalGame(settings = [
            { type: 'human', difficulty: 'normal' },
            { type: 'human', difficulty: 'normal' },
        ]) {
            context.enabledCards = new Set(context.CARDS.map(card => card.name));
            context.enabledLandmarks = new Set(context.Player.landmarkNames());
            context.__tmpPlayerSettings = settings;
            vm.runInContext('playerSettings = __tmpPlayerSettings', context);
            delete context.__tmpPlayerSettings;
            context.startGame();
            return vm.runInContext('game', context);
        },
        startBuildPhase(options = {}) {
            const game = vm.runInContext('game', context);
            if (!game) return null;
            game.phase = context.GAME_PHASES.BUILD;
            game.builtThisTurn = !!options.builtThisTurn;
            if (Number.isFinite(options.coins)) game.currentPlayer().coins = options.coins;
            return game;
        },
        tickFreezeWatchdog(ms = 6000) {
            intervals.slice().forEach(fn => fn());
            dateState.now += ms;
            intervals.slice().forEach(fn => fn());
        },
        getClientErrorReports(source = '') {
            return fetchCalls
                .filter(call => !source || call.url === source || (call.options && String(call.options.body || '').includes(source)))
                .map(call => {
                    try { return JSON.parse(call.options.body); } catch (_) { return null; }
                })
                .filter(Boolean);
        },
        getFreezeSnapshot() {
            const raw = storage.machikoroFreezeSnapshot;
            if (!raw) return null;
            try { return JSON.parse(raw); } catch (_) { return null; }
        },
        flushTimeouts: () => { while (timeouts.length) timeouts.shift()(); },
        runIntervals: (count = 1) => { for (let i = 0; i < count; i++) intervals.slice().forEach(fn => fn()); },
        advanceTime: ms => { dateState.now += ms; },
        setPlayerSettings(value) { context.__tmpPlayerSettings = value; vm.runInContext('playerSettings = __tmpPlayerSettings', context); delete context.__tmpPlayerSettings; },
        getGame() { return vm.runInContext('game', context); },
        getLocalGameEngineSnapshot() { return vm.runInContext('_buildLocalGameEngineSnapshot()', context); },
        getLocalGameEngineShadowOutcome() { return vm.runInContext('_localGameEngineShadowOutcomeController.get()', context); },
        runLocalEngineAction(action, data) {
            context.__tmpLocalEngineAction = action;
            context.__tmpLocalEngineData = data;
            const localActionSource = [
                'runLocalOrSendOnline(__tmpLocalEngineAction, __tmpLocalEngineData, () =>',
                '    GameEngine.applyMutableAction({',
                '        game,',
                '        shopStock: SHOP_STOCK,',
                '        action: __tmpLocalEngineAction,',
                '        data: __tmpLocalEngineData,',
                '        createCardByName,',
                '        decrementShopStock,',
                '        restoreUndoState: restoreUndoSnapshot,',
                '    })',
                ')',
            ].join('\n');
            const result = vm.runInContext(localActionSource, context);
            delete context.__tmpLocalEngineAction;
            delete context.__tmpLocalEngineData;
            return result;
        },
        runLocalCpuEngineAction(action, data) {
            context.__tmpLocalCpuAction = action;
            context.__tmpLocalCpuData = data;
            const result = vm.runInContext(
                'cpuDo(__tmpLocalCpuAction, __tmpLocalCpuData, () => false)',
                context
            );
            delete context.__tmpLocalCpuAction;
            delete context.__tmpLocalCpuData;
            return result;
        },
        runLocalCpuBuildAction(action, data) {
            context.__tmpLocalCpuBuildAction = action;
            context.__tmpLocalCpuBuildData = data;
            const result = vm.runInContext([
                '(function () {',
                '    const cpu = cpuPlayers[game.currentPlayerIndex];',
                '    if (!cpu) return false;',
                '    const original = cpu.chooseBuildAction;',
                '    cpu.chooseBuildAction = () => CPUActionProposal.create(',
                '        __tmpLocalCpuBuildAction, __tmpLocalCpuBuildData',
                '    );',
                '    try { return cpu.build(game, SHOP_STOCK); }',
                '    finally { cpu.chooseBuildAction = original; }',
                '})()',
            ].join('\n'), context);
            delete context.__tmpLocalCpuBuildAction;
            delete context.__tmpLocalCpuBuildData;
            return result;
        },
        setGame(value) { context.__tmpGame = value; vm.runInContext('game = __tmpGame', context); delete context.__tmpGame; },
        getCpuPlayers() { return vm.runInContext('cpuPlayers', context); },
        setCpuPlayers(value) { context.__tmpCpuPlayers = value; vm.runInContext('cpuPlayers = __tmpCpuPlayers', context); delete context.__tmpCpuPlayers; },
        cancelCpuSchedule(reason = 'test-cancel-cpu') { return vm.runInContext(`typeof cpuTurnScheduler !== 'undefined' ? cpuTurnScheduler.cancel(${JSON.stringify(reason)}) : null`, context); },
        scheduleCpuTurn(reason = 'test-schedule-cpu') { return vm.runInContext(`typeof cpuTurnScheduler !== 'undefined' ? cpuTurnScheduler.schedule(${JSON.stringify(reason)}) : null`, context); },
        expireCpuScheduleLease() { return vm.runInContext('cpuSchedulerStateController.expireLease(Date.now() - 1)', context); },
        getCpuSchedulerHealth() { return vm.runInContext(`typeof cpuTurnScheduler !== 'undefined' ? cpuTurnScheduler.getHealth() : null`, context); },
        setUndoState(value) { context.__tmpUndoState = value; vm.runInContext('undoState = __tmpUndoState', context); delete context.__tmpUndoState; },
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
            return vm.runInContext('({ socket, isOnlineGame, isReconnectingOnline, reconnectState: getOnlineReconnectState(), reconnectStateSnapshot: getOnlineReconnectStateSnapshot(), isRoomHost, myRoomId, myOriginalPlayerIndex, myPlayerIndex, myPlayerName, reconnectToken })', context);
        },
    };
    return context;
}

module.exports = {
    loadIntegrationRuntime,
};
