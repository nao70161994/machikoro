const SHOP_STOCK = {};

// live game / CPU / Undo / coin animation state は GameRuntimeState が所有する。
const mainClientStorageFacade = ClientStorage.createFacade();

function safeMainStorageGet(key, fallback = null) {
    return mainClientStorageFacade.get(key, fallback);
}

function safeMainStorageRemove(key) {
    mainClientStorageFacade.remove(key);
}

function gameSetupSnapshot() {
    return GameSetupState.runtime.snapshot();
}

function mainGameRuntimeSnapshot() {
    return GameRuntimeState.runtime.snapshot();
}

function mainOnlineRuntimeSnapshot() {
    return OnlineRuntimeState.runtime.snapshot();
}

// 連勝記録
UiWinner.streakRuntime.replace({
    winStreak: parseInt(safeMainStorageGet('winStreak', '0') || '0'),
    lastWinnerName: safeMainStorageGet('lastWinnerName', '') || '',
});

// オートスキップ
const autoSkipScheduleController = AutoSkipPolicy.createScheduleController();

// 取り消し状態は GameRuntimeState が所有する。
UiTutorialSettings.runtime.replace({
    tutorialEnabled: safeMainStorageGet('tutorialEnabled') !== 'false',
    tutorialLevel: safeMainStorageGet('tutorialLevel', 'beginner') || 'beginner',
});

// CPU進行チェーン制御
const cpuTurnSchedulerRuntime = CpuTurnSchedulerRuntime.createRuntime({
    checkpoint: (event, details) => markMainCheckpoint(event, details),
    console: typeof console !== 'undefined' ? console : null,
    gamePhases: GAME_PHASES,
    getActionFlightState: () => mainOnlineActionFlightState(),
    getCpuSpeed: () => gameSetupSnapshot().cpuSpeed,
    getGameState: mainGameRuntimeSnapshot,
    getOnlineState: mainOnlineRuntimeSnapshot,
    getPhaseHandlers: () => CPU_PHASE_HANDLERS,
    isReconnectBlocked: () => isMainOnlineReconnectInputBlocked(),
    now: () => Date.now(),
    policy: CpuSchedulerState,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    unlockHumanTurn(reason) {
        if (typeof unlockUiForHumanTurn === 'function') unlockUiForHumanTurn(reason);
    },
});
const cpuSchedulerStateController = cpuTurnSchedulerRuntime.controller;

function invalidateCpuScheduleChain() { return cpuTurnSchedulerRuntime.invalidate(); }
function cancelCpuSchedule(reason = 'cpu-schedule-cancel') { return cpuTurnSchedulerRuntime.cancel(reason); }
function markCpuStepScheduled(delay, leaseMs = 1500) { return cpuTurnSchedulerRuntime.markScheduled(delay, leaseMs); }
function refreshCpuStepScheduleLease(leaseMs = 1500) { return cpuTurnSchedulerRuntime.refreshLease(leaseMs); }
function isCpuStepScheduledNow() { return cpuTurnSchedulerRuntime.isStepScheduled(); }

function escapeAttribute(value) {
    return LocalPlayerSettings.escapeAttribute(value);
}

function defaultLocalPlayerName(index) {
    return LocalPlayerSettings.defaultPlayerName(index);
}

function normalizeLocalPlayerName(name, index) {
    return LocalPlayerSettings.normalizePlayerName(name, index);
}

function normalizeLocalPlayerSetting(setting, index, playerCount) {
    return LocalPlayerSettings.normalizePlayerSetting(setting, index, playerCount);
}

function getLocalCpuLabel(difficulty) {
    return LocalPlayerSettings.cpuLabel(difficulty);
}

function getRlCpuSettingNote(playerCount) {
    return LocalPlayerSettings.rlSettingNote(playerCount);
}

function createCpuPlayer(difficulty, options = {}) {
    const resolvedOptions = resolveLiveExpertOptions(difficulty, options);
    const resolvedDifficulty = difficulty;
    if (resolvedDifficulty === 'rl') {
        return RLModelPortfolio.createRandomCpu(resolvedOptions);
    }
    return new CPU(resolvedDifficulty, resolvedOptions);
}

function cpuOpponentDifficultiesFromSettings(settings) {
    return LocalPlayerSettings.opponentDifficulties(settings);
}

function formatCpuSpeedLabel(value) {
    return LocalPlayerSettings.formatCpuSpeedLabel(value);
}

const localGameStartRuntime = LocalGameStartRuntime.createRuntime({
    console: typeof console !== 'undefined' ? console : null,
    document,
    getPortfolio: () => typeof RLModelPortfolio !== 'undefined' ? RLModelPortfolio : null,
    initializeGame: playerCount => init(playerCount),
    notifyLifecycleStart() {
        if (typeof notifyGameLifecycleStart === 'function') notifyGameLifecycleStart();
    },
    playerSettings: LocalPlayerSettings,
    resetOnline() {
        if (typeof resetOnlineState === 'function') resetOnlineState();
    },
    resetStats: () => resetStatsRecorded(),
    resetUiLocks() {
        if (typeof resetUiLocksForGameReset === 'function') {
            resetUiLocksForGameReset('start-game-reset-ui-locks');
        }
    },
    saveSettings: () => saveSettings(),
    setupRuntime: GameSetupState.runtime,
    showNotice: message => showNotice(message),
    startPolicy: LocalGameStart,
});
function changeCount(delta) {
    return localGameStartRuntime.changeCount(delta);
}

function renderPlayerSettings() {
    return localGameStartRuntime.renderPlayerSettings();
}

function onChangePlayerType(index, value) {
    return localGameStartRuntime.changePlayerType(index, value);
}

function onChangePlayerName(index, value) {
    return localGameStartRuntime.changePlayerName(index, value);
}

function hasRlCpuSetting(settings, playerCount) {
    return localGameStartRuntime.hasRlCpuSetting(settings, playerCount);
}

function snapshotLocalPlayerSettings(playerCount = gameSetupSnapshot().selectedCount) {
    return localGameStartRuntime.snapshotPlayerSettings(playerCount);
}

function hasLocalRlCpuSetting(
    playerCount = gameSetupSnapshot().selectedCount,
    settings = gameSetupSnapshot().playerSettings
) {
    return localGameStartRuntime.hasLocalRlCpuSetting(playerCount, settings);
}

function canPreloadRlModels() {
    return localGameStartRuntime.canPreloadRlModels();
}

function localRlModelLoadState(playerCount = gameSetupSnapshot().selectedCount) {
    return localGameStartRuntime.modelLoadState(playerCount);
}

function localRlModelStatusMessage(state) {
    return localGameStartRuntime.modelStatusMessage(state);
}

function updateLocalRlModelReadinessUi() {
    return localGameStartRuntime.updateReadinessUi();
}

function preloadLocalRlModelsForStart(playerCount, settings = gameSetupSnapshot().playerSettings) {
    return localGameStartRuntime.preloadForStart(playerCount, settings);
}

function preloadLocalRlModelsInBackground(reason = 'local-rl-background-preload') {
    return localGameStartRuntime.preloadInBackground(reason);
}

function startGameNow(
    playerCount = gameSetupSnapshot().selectedCount,
    settings = gameSetupSnapshot().playerSettings
) {
    return localGameStartRuntime.startNow(playerCount, settings);
}

function startGame() {
    return localGameStartRuntime.start();
}

const localGameRestartRuntime = LocalGameRestartRuntime.createRuntime({
    cancelAutoSkip: () => cancelAutoSkip(),
    cancelCpuSchedule: reason => cancelCpuSchedule(reason),
    cancelDelayedHumanAction: () => cancelDelayedHumanAction(),
    checkpoint: event => markMainCheckpoint(event),
    document,
    drawSkyline: () => drawCitySkyline(),
    gameRuntime: GameRuntimeState.runtime,
    getClearOnlineSessionStorage: () => typeof clearOnlineSessionStorage === 'function'
        ? clearOnlineSessionStorage
        : null,
    refreshPwaUpdateState() {
        if (typeof refreshPwaUpdateState === 'function') refreshPwaUpdateState();
    },
    removeStorage: key => safeMainStorageRemove(key),
    renderPlayerSettings: () => renderPlayerSettings(),
    resetFullLog: () => resetFullLog(),
    resetLifecycle(reason) {
        if (typeof resetGameLifecycleForRestart === 'function') resetGameLifecycleForRestart(reason);
    },
    resetOnline() {
        if (typeof resetOnlineState === 'function') resetOnlineState();
        else {
            try { OnlineRuntimeState.runtime.setOnline(false); } catch (_) {}
        }
    },
    resetUiLocks(reason) {
        if (typeof resetUiLocksForGameReset === 'function') resetUiLocksForGameReset(reason);
    },
    setWinSoundPlayed(value) { winSoundPlayed = value; },
    setupRuntime: GameSetupState.runtime,
    showConfirm: (message, callback) => showConfirm(message, callback),
    stopConfetti: () => stopConfetti(),
    updateResumeButton: () => updateResumeButton(),
});

function restartGame() {
    return localGameRestartRuntime.restart();
}

const localGameInitializer = LocalGameInitializer.createRuntime({
    cancelAutoSkip: () => cancelAutoSkip(),
    cancelCpuSchedule: reason => cancelCpuSchedule(reason),
    cancelDelayedHumanAction: () => cancelDelayedHumanAction(),
    cards: CARDS,
    cpuLabel: difficulty => getLocalCpuLabel(difficulty),
    createCpu: (difficulty, options) => createCpuPlayer(difficulty, options),
    createGame: playerCount => new GameManager(playerCount),
    gameRuntime: GameRuntimeState.runtime,
    getEnabledCards: () => getEnabledCardSelection(),
    getEnabledLandmarks: () => getEnabledLandmarkSelection(),
    initialCardStock: (card, playerCount) => getInitialCardStock(card, playerCount),
    landmarkNames: () => Player.landmarkNames(),
    logTypes: LOG_TYPES,
    normalizePlayerName: (name, index) => normalizeLocalPlayerName(name, index),
    normalizePlayerSetting: (setting, index, playerCount) =>
        normalizeLocalPlayerSetting(setting, index, playerCount),
    opponentDifficulties: settings => cpuOpponentDifficultiesFromSettings(settings),
    random: () => Math.random(),
    render: () => render(),
    replaceEnabledLandmarks: values => replaceEnabledLandmarkSelection(values),
    resetFullLog: () => resetFullLog(),
    scheduleCpu: () => scheduleCPU(),
    setShopStockCount,
    setWinSoundPlayed(value) { winSoundPlayed = value; },
    setupRuntime: GameSetupState.runtime,
    shopStock: SHOP_STOCK,
    stopConfetti: () => stopConfetti(),
});

function init(playerCount) {
    return localGameInitializer.initialize(playerCount);
}

function markMainCheckpoint(event, details = {}) {
    try {
        if (typeof markClientFlowCheckpoint === 'function') markClientFlowCheckpoint(event, details);
    } catch (_) {
        // Diagnostics must never interrupt the CPU scheduler or a player action.
    }
}

function isLocalGameEngineShadowEnabled() {
    return typeof window !== 'undefined' &&
        window.MACHIKORO_LOCAL_GAME_ENGINE_SHADOW_ENABLED === true;
}

function isLocalGameEngineAuthorityEnabled() {
    return typeof window !== 'undefined' &&
        window.MACHIKORO_LOCAL_GAME_ENGINE_AUTHORITY_ENABLED === true;
}

const localGameEngineRuntime = LocalGameEngineRuntime.createRuntime({
    actionProposal: CPUActionProposal,
    adapterOptions() {
        const currentGame = mainGameRuntimeSnapshot().game;
        return {
            createGame: playerCount => new GameManager(playerCount),
            enabledLandmarks: currentGame && currentGame.enabledLandmarks
                ? currentGame.enabledLandmarks
                : Player.landmarkNames(),
            landmarkNames: Player.landmarkNames,
            createCardByName,
            assignShopStockSnapshot,
            decrementShopStock,
            pendingActionsFor: GameManager.serializedPendingActionsFor,
            logLimit: Number.MAX_SAFE_INTEGER,
        };
    },
    assignShopStock: (target, snapshot) => assignShopStockSnapshot(target, snapshot),
    checkpoint: markMainCheckpoint,
    clientShadow: GameEngineClientShadow,
    determinism: GameEngineDeterminism,
    getEngine: () => typeof GameEngine !== 'undefined' ? GameEngine : null,
    gameRuntime: GameRuntimeState.runtime,
    getGameState: mainGameRuntimeSnapshot,
    getOnlineState: mainOnlineRuntimeSnapshot,
    isAuthorityEnabled: isLocalGameEngineAuthorityEnabled,
    isShadowEnabled: isLocalGameEngineShadowEnabled,
    pendingActionsFor: GameManager.serializedPendingActionsFor,
    render: () => render(),
    runtimeAdapter: GameEngineRuntimeAdapter,
    scheduleCpu: () => scheduleCPU(),
    sendAction: (action, data) => sendAction(action, data),
    shopStock: SHOP_STOCK,
    snapshot: GameSnapshot,
    stationName: LANDMARK_NAMES.STATION,
});
const _localGameEngineShadowOutcomeController = localGameEngineRuntime.outcomeController;

function cpuDo(action, data, fallback) {
    return localGameEngineRuntime.runCpu(action, data, fallback);
}
function _createLocalGameEngineRuntimeAdapter() { return localGameEngineRuntime.createAdapter(); }
function _buildLocalGameEngineSnapshot() { return localGameEngineRuntime.buildSnapshot(); }
function _prepareLocalGameEngineShadow(action, data) { return localGameEngineRuntime.prepare(action, data); }
function _adoptLocalGameEngineShadowSnapshot(snapshot) { return localGameEngineRuntime.adopt(snapshot); }
function _finishLocalGameEngineShadow(prepared) { return localGameEngineRuntime.finish(prepared); }
function runLocalOrSendOnline(action, data, fallback) {
    return localGameEngineRuntime.runHuman(action, data, fallback);
}

const MAIN_ACTIONS = (typeof GAME_ACTIONS !== 'undefined') ? GAME_ACTIONS : Object.freeze({
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
});

function canRunAction(action) {
    const currentGame = mainGameRuntimeSnapshot().game;
    if (!currentGame || !action) return false;
    if (typeof currentGame.allowedActions === 'function') return currentGame.allowedActions().has(action);
    if (typeof GameManager !== 'undefined' && GameManager && typeof GameManager.allowedActionsFor === 'function') {
        return GameManager.allowedActionsFor(currentGame).has(action);
    }
    return true;
}

function chooseCpuPendingAction(cpu) {
    return CPUPendingResolution.choosePendingAction(
        mainGameRuntimeSnapshot().game,
        cpu,
        { clearFallback: false }
    );
}

function chooseCpuTurnAction(stepName, cpu) {
    return CpuTurnStrategy.chooseAction(stepName, {
        game: mainGameRuntimeSnapshot().game,
        cpu,
        rollDie: rollRandomDie,
        choosePendingAction: chooseCpuPendingAction,
        shopStock: SHOP_STOCK,
    });
}

// フェーズごとの CPU ハンドラテーブル。
// 新フェーズを追加するときはここに1エントリ追加するだけでよい。
const CPU_PHASE_HANDLERS = CpuPhaseHandlers.create({
    actions: MAIN_ACTIONS,
    checkpoint: (event, details) => markMainCheckpoint(event, details),
    chooseAction: (stepName, cpu) => chooseCpuTurnAction(stepName, cpu),
    executeAction: (action, data, fallback) => cpuDo(action, data, fallback),
    gamePhases: GAME_PHASES,
    getGameState: mainGameRuntimeSnapshot,
    getOnlineState: mainOnlineRuntimeSnapshot,
    nextPendingAction: game => CPUPendingResolution.pendingActionDescriptors(game)[0] || null,
    pendingResolution: CPUPendingResolution,
    render: () => render(),
    shopStock: SHOP_STOCK,
});

function isMainOnlineReconnectInputBlocked() {
    if (typeof isOnlineReconnectInputBlocked === 'function') {
        return isOnlineReconnectInputBlocked();
    }
    return mainOnlineRuntimeSnapshot().isReconnectingOnline;
}

function mainOnlineActionFlightState() {
    try {
        if (typeof getOnlineActionFlightState === 'function') return getOnlineActionFlightState();
    } catch (_) {}
    return {
        inFlight: typeof onlineActionInFlight !== 'undefined' && !!onlineActionInFlight,
        startedAt: typeof onlineActionInFlightAt !== 'undefined' ? onlineActionInFlightAt : 0,
    };
}

function cpuScheduleBlockedReason() { return cpuTurnSchedulerRuntime.blockedReason(); }
function currentCpuTurnSchedulerHealth() { return cpuTurnSchedulerRuntime.health(); }
function scheduleCpuTurn(reason = 'scheduleCPU') { return cpuTurnSchedulerRuntime.schedule(reason); }
const cpuTurnScheduler = cpuTurnSchedulerRuntime.facade;
function scheduleCPU() { return cpuTurnScheduler.schedule('scheduleCPU'); }

const pageActivationRuntime = PageActivationRuntime.createRuntime({
    canRunHumanAction: (action, playerIndex) => canRunHumanAction(action, playerIndex),
    cancelCpuSchedule: reason => cancelCpuSchedule(reason),
    checkpoint: (event, details) => markMainCheckpoint(event, details),
    clearTimeout: timer => clearTimeout(timer),
    currentCpuHealth: () => currentCpuTurnSchedulerHealth(),
    delayedPolicy: DelayedHumanActionPolicy,
    getDocument: () => typeof document !== 'undefined' ? document : null,
    getWindow: () => typeof window !== 'undefined' ? window : null,
    now: () => Date.now(),
    pagePolicy: PageActivationPolicy,
    resumeOnline() {
        if (typeof resumeOnlineReconnectAfterPageActivation === 'function') {
            resumeOnlineReconnectAfterPageActivation();
        }
    },
    resumeRlLoads() {
        if (typeof RLModelPortfolio !== 'undefined' &&
                typeof RLModelPortfolio.resumePendingLoadsAfterPageActivation === 'function') {
            RLModelPortfolio.resumePendingLoadsAfterPageActivation();
        }
    },
    scheduleCpuTurn: reason => scheduleCpuTurn(reason),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
});

function resumeCpuTurnAfterPageActivation(reason) {
    return pageActivationRuntime.resumeCpu(reason);
}

function runDelayedHumanAction(scheduledToken) {
    return pageActivationRuntime.runDelayed(scheduledToken);
}

function scheduleDelayedHumanAction(action, playerIndex, run, delay = 600) {
    return pageActivationRuntime.scheduleDelayed(action, playerIndex, run, delay);
}

function resumeDelayedHumanActionAfterPageActivation() {
    return pageActivationRuntime.resumeDelayed();
}

function cpuPageActivationOutcome(before, after, pageHidden) {
    return PageActivationPolicy.cpuOutcome(before, after, pageHidden);
}

function pageHiddenDurationMs(now) {
    return pageActivationRuntime.pageHiddenDurationMs(now);
}

function resumeTurnAfterPageActivation(reason) {
    return pageActivationRuntime.resume(reason);
}

function bindCpuResumeScheduler() {
    return pageActivationRuntime.bind();
}

function canRunLocalHumanAction(expectedPlayerIndex = null) {
    const gameState = mainGameRuntimeSnapshot();
    const currentGame = gameState.game;
    if (!currentGame || currentGame.checkWinner()) return false;
    const onlineState = mainOnlineRuntimeSnapshot();
    const online = onlineState.isOnlineGame;
    return LocalActionPolicy.canRunHumanAction({
        hasGame: true,
        hasWinner: false,
        expectedPlayerIndex,
        currentPlayerIndex: currentGame.currentPlayerIndex,
        isCpuTurn: !!gameState.cpuPlayers[currentGame.currentPlayerIndex],
        isOnlineGame: online,
        myPlayerIndex: onlineState.myPlayerIndex,
        isReconnecting: online ? isMainOnlineReconnectInputBlocked() : false,
        onlineActionInFlight: online && mainOnlineActionFlightState().inFlight,
        socketConnected: !online || (!!onlineState.socket && onlineState.socket.connected !== false),
    });
}

function canRunHumanAction(action, expectedPlayerIndex = null) {
    return canRunLocalHumanAction(expectedPlayerIndex) && canRunAction(action);
}

function cancelDelayedHumanAction() {
    return pageActivationRuntime.cancelDelayed();
}

function onRoll() {
    if (!canRunHumanAction(MAIN_ACTIONS.ROLL_DICE)) return;
    const currentGame = mainGameRuntimeSnapshot().game;
    playSound('dice');
    if (currentGame.currentPlayer().landmarks[LANDMARK_NAMES.STATION]) {
        // 駅あり：アニメーションなしで即座に選択肢を表示
        runLocalOrSendOnline('rollDice', { forceDice: null, tunaDice: null }, () => currentGame.rollDice(null, null));
    } else {
        // 駅なし：アニメーションあり
        if (pageActivationRuntime.isDelayedPending()) return;
        const scheduledPlayerIndex = currentGame.currentPlayerIndex;
        updateDiceDisplay(null, true);
        scheduleDelayedHumanAction(MAIN_ACTIONS.ROLL_DICE, scheduledPlayerIndex, () => {
            const delayedGame = mainGameRuntimeSnapshot().game;
            if (mainOnlineRuntimeSnapshot().isOnlineGame) {
                runLocalOrSendOnline('rollDice', { forceDice: null, tunaDice: null }, () => delayedGame.rollDice(null, null));
                return;
            }
            const forceDice = rollRandomDie();
            const tunaDice = [rollRandomDie(), rollRandomDie()];
            runLocalOrSendOnline('rollDice', { forceDice, tunaDice }, () => delayedGame.rollDice(forceDice, tunaDice));
        });
    }
}

function onSelectDiceCount(useTwo) {
    if (!canRunHumanAction(MAIN_ACTIONS.SELECT_DICE)) return;
    if (pageActivationRuntime.isDelayedPending()) return;
    const currentGame = mainGameRuntimeSnapshot().game;
    playSound('dice');
    const scheduledPlayerIndex = currentGame.currentPlayerIndex;
    updateDiceDisplay(null, true);
    scheduleDelayedHumanAction(MAIN_ACTIONS.SELECT_DICE, scheduledPlayerIndex, () => {
        const delayedGame = mainGameRuntimeSnapshot().game;
        if (mainOnlineRuntimeSnapshot().isOnlineGame) {
            runLocalOrSendOnline('selectDice', { useTwo, diceCount: useTwo ? 2 : 1 },
                () => delayedGame.selectDiceCount(useTwo, 1, useTwo ? 1 : 0, null));
            return;
        }
        const d1 = rollRandomDie();
        const d2 = useTwo ? rollRandomDie() : 0;
        const tunaDice = [rollRandomDie(), rollRandomDie()];
        runLocalOrSendOnline('selectDice', { useTwo, diceCount: useTwo ? 2 : 1, d1, d2, tunaDice },
            () => delayedGame.selectDiceCount(useTwo, d1, d2, tunaDice));
    });
}

function onReroll() {
    if (!canRunHumanAction(MAIN_ACTIONS.REROLL_DICE)) return;
    const currentGame = mainGameRuntimeSnapshot().game;
    if (mainOnlineRuntimeSnapshot().isOnlineGame) {
        runLocalOrSendOnline('rerollDice', {}, () => currentGame.rerollDice(1, null));
        return;
    }
    const forceDice = rollRandomDie();
    const tunaDice = [rollRandomDie(), rollRandomDie()];
    runLocalOrSendOnline('rerollDice', { forceDice, tunaDice }, () => currentGame.rerollDice(forceDice, tunaDice));
}

function onSkipReroll() {
    if (!canRunHumanAction(MAIN_ACTIONS.SKIP_REROLL)) return;
    const currentGame = mainGameRuntimeSnapshot().game;
    runLocalOrSendOnline('skipReroll', {}, () => currentGame.skipReroll());
}

function resolveMainUiEffect(name) {
    const aliases = {
        toggleTutorialEnabled: 'onToggleTutorial',
        tutorialLevel: 'onChangeTutorialLevel',
        localPlayerType: 'onChangePlayerType',
        onlinePlayerType: 'onChangeOnlinePlayerType',
        selectDiceCount: 'onSelectDiceCount',
        rerollDice: 'onReroll',
        skipReroll: 'onSkipReroll',
        resolveHarbor: 'onResolveHarbor',
        resolveTV: 'onResolveTV',
        resolveBusiness: 'onResolveBusiness',
        resolveCleaning: 'onResolveCleaning',
        resolveMover: 'onResolveMover',
        resolveRenovation: 'onResolveRenovation',
        resolveIT: 'onResolveIT',
        buildCard: 'onBuildCard',
        buildLandmark: 'onBuildLandmark',
        undoBuild: 'doUndo',
    };
    const root = typeof globalThis !== 'undefined' ? globalThis : window;
    if (name === 'selectBusinessCard') {
        return (button, inputId) => root.bcSelectCard(button, inputId);
    }
    const effect = root[aliases[name] || name];
    return typeof effect === 'function' ? effect : (name === 'location' ? root.location : null);
}

const mainUiEventRuntime = MainUiEventRuntime.createRuntime({
    delegation: UiEventDelegation,
    document,
    formatCpuSpeedLabel,
    getWindow: () => typeof window !== 'undefined' ? window : null,
    resolveEffect: resolveMainUiEffect,
});

function handleStaticUiClick(event) { return mainUiEventRuntime.handleStaticClick(event); }
function handleStaticUiInput(event) { return mainUiEventRuntime.handleStaticInput(event); }
function handleStaticUiChange(event) { return mainUiEventRuntime.handleStaticChange(event); }
function handleStaticUiKeydown(event) { return mainUiEventRuntime.handleStaticKeydown(event); }
function bindStaticUiHandlers() { return mainUiEventRuntime.bindStatic(); }
function handleDiceChoiceClick(event) { return mainUiEventRuntime.handleDiceClick(event); }
function handlePendingActionClick(event) { return mainUiEventRuntime.handlePendingClick(event); }
function handleBuildMenuClick(event) { return mainUiEventRuntime.handleBuildClick(event); }
function handlePlayerPanelClick(event) { return mainUiEventRuntime.handlePlayerClick(event); }
function bindDelegatedUiHandlers() { return mainUiEventRuntime.bindDelegated(); }

function onResolveHarbor(useBonus) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_HARBOR)) return;
    runLocalOrSendOnline('resolveHarbor', { useBonus }, () => mainGameRuntimeSnapshot().game.resolveHarbor(useBonus));
}

function onResolveTV(i) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_TV)) return;
    runLocalOrSendOnline('resolveTV', { targetIndex: i }, () => mainGameRuntimeSnapshot().game.resolveTV(i));
}

function onResolveBusiness(targetIndex) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_BUSINESS)) return;
    const myCard = parseInt(document.getElementById("myCardSelect").value, 10);
    const theirCard = parseInt(document.getElementById(`theirCardSelect_${targetIndex}`).value, 10);
    runLocalOrSendOnline('resolveBusiness', { myCard, targetIndex, theirCard },
        () => mainGameRuntimeSnapshot().game.resolveBusiness(myCard, targetIndex, theirCard));
}

function onResolveCleaning(cardName) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_CLEANING)) return;
    runLocalOrSendOnline('resolveCleaning', { cardName }, () => mainGameRuntimeSnapshot().game.resolveCleaning(cardName));
}

function onResolveMover(targetIndex) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_MOVER)) return;
    const cardIndex = parseInt(document.getElementById("moverCardSelect").value, 10);
    runLocalOrSendOnline('resolveMover', { cardIndex, targetIndex }, () => mainGameRuntimeSnapshot().game.resolveMover(cardIndex, targetIndex));
}

function onResolveRenovation(landmarkName) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_RENOVATION)) return;
    runLocalOrSendOnline('resolveRenovation', { landmarkName }, () => mainGameRuntimeSnapshot().game.resolveRenovation(landmarkName));
}

function onResolveIT(doSave) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_IT)) return;
    runLocalOrSendOnline('resolveIT', { doSave }, () => mainGameRuntimeSnapshot().game.resolveIT(doSave));
}

function traceBuildFlow(stage, details = {}) {
    if (typeof recordFlowTrace === 'function') {
        recordFlowTrace('build-' + stage, details);
    } else if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[machikoro-build-flow]', stage, details);
    }
}

function onBuildCard(name) {
    if (!canRunHumanAction(MAIN_ACTIONS.BUILD_CARD)) return;
    traceBuildFlow('card-request', { cardName: name });
    const card = CARDS.find(c => c.name === name);
    if (!card) return;
    const scheduledPlayerIndex = mainGameRuntimeSnapshot().game.currentPlayerIndex;
    showConfirm(`${card.name}を建設しますか？\n💰 ${card.cost}コイン`, () => {
        traceBuildFlow('card-confirmed', { cardName: name, scheduledPlayerIndex });
        if (!canRunHumanAction(MAIN_ACTIONS.BUILD_CARD, scheduledPlayerIndex)) { traceBuildFlow('card-stale-action', { cardName: name, scheduledPlayerIndex }); return; }
        if (getShopStockCount(SHOP_STOCK, card) <= 0) { traceBuildFlow('card-out-of-stock', { cardName: name }); return; }
        saveUndoState();
        cancelAutoSkip();
        if (mainOnlineRuntimeSnapshot().isOnlineGame) {
            const sent = sendAction('buildCard', { cardName: name });
            traceBuildFlow('card-online-send', { cardName: name, sent });
            return;
        }
        const shadow = _prepareLocalGameEngineShadow('buildCard', { cardName: name });
        const built = mainGameRuntimeSnapshot().game.buildCard(card);
        if (built) decrementShopStock(SHOP_STOCK, card);
        _finishLocalGameEngineShadow(shadow);
        if (built) {
            traceBuildFlow('card-applied', { cardName: name });
            playSound('build');
            render();
            traceBuildFlow('card-rendered', { cardName: name });
            if (typeof unlockUiForHumanTurn === 'function') unlockUiForHumanTurn('build-card-human-turn-unlock');
            scheduleCPU();
        }
    });
}

function onBuildLandmark(name) {
    if (!canRunHumanAction(MAIN_ACTIONS.BUILD_LANDMARK)) return;
    traceBuildFlow('landmark-request', { landmarkName: name });
    const cost = Player.landmarkCost(name);
    const scheduledPlayerIndex = mainGameRuntimeSnapshot().game.currentPlayerIndex;
    showConfirm(`${getLandmarkEmoji(name)} ${name}を建設しますか？\n💰 ${cost}コイン`, () => {
        traceBuildFlow('landmark-confirmed', { landmarkName: name, scheduledPlayerIndex });
        if (!canRunHumanAction(MAIN_ACTIONS.BUILD_LANDMARK, scheduledPlayerIndex)) { traceBuildFlow('landmark-stale-action', { landmarkName: name, scheduledPlayerIndex }); return; }
        saveUndoState();
        cancelAutoSkip();
        if (mainOnlineRuntimeSnapshot().isOnlineGame) {
            const sent = sendAction('buildLandmark', { name });
            traceBuildFlow('landmark-online-send', { landmarkName: name, sent });
            return;
        }
        const shadow = _prepareLocalGameEngineShadow('buildLandmark', { name });
        const built = mainGameRuntimeSnapshot().game.buildLandmark(name);
        _finishLocalGameEngineShadow(shadow);
        if (built) {
            traceBuildFlow('landmark-applied', { landmarkName: name });
            playSound('build');
            render();
            traceBuildFlow('landmark-rendered', { landmarkName: name });
            if (typeof unlockUiForHumanTurn === 'function') unlockUiForHumanTurn('build-landmark-human-turn-unlock');
            scheduleCPU();
        }
    });
}

function onSkip() {
    markMainCheckpoint('skip-request');
    if (!canRunHumanAction(MAIN_ACTIONS.NEXT_TURN)) { markMainCheckpoint('skip-rejected-gate'); return; }
    const currentGame = mainGameRuntimeSnapshot().game;
    let msg;
    if (currentGame.builtThisTurn) {
        msg = "建設完了・ターン終了しますか？";
    } else if (currentGame.currentPlayer().landmarks[LANDMARK_NAMES.AIRPORT]) {
        msg = "建設せずにターン終了しますか？\n✈️ 空港効果で+10コイン獲得します";
    } else {
        msg = "建設せずにターン終了しますか？";
    }
    const scheduledPlayerIndex = currentGame.currentPlayerIndex;
    showConfirm(msg, () => {
        markMainCheckpoint('skip-confirmed', { scheduledPlayerIndex });
        if (!canRunHumanAction(MAIN_ACTIONS.NEXT_TURN, scheduledPlayerIndex)) { markMainCheckpoint('skip-stale-action', { scheduledPlayerIndex }); return; }
        cancelAutoSkip();
        GameRuntimeState.runtime.setUndoState(null);
        const result = runLocalOrSendOnline(
            'nextTurn',
            {},
            () => mainGameRuntimeSnapshot().game.nextTurn()
        );
        markMainCheckpoint('skip-nextTurn-returned', { result });
    });
}
function renderDiceFace(num) {
    return UiDiceDisplay.buildFaceHtml(num);
}

function updateDiceDisplay(nums, rolling = false) {
    const el = document.getElementById("diceResult");
    const view = UiDiceDisplay.buildView(nums, rolling);
    el.innerHTML = view.html;
    if (view.opacity !== null) el.style.opacity = view.opacity;
}

function drawCitySkyline() {
    const canvas = document.getElementById('cityCanvas');
    if (!canvas) return;
    CitySkyline.draw(canvas, window.innerWidth, Math.random);
}

// ===== コイン獲得アニメーション =====
function showCoinAnimation(playerIndex, diff) {
    const view = UiPlayerDisplay.buildCoinAnimationView(diff);
    if (view.playSound) playSound('coin');
    const boxes = document.querySelectorAll('.player-box');
    if (!boxes[playerIndex]) return;
    const box = boxes[playerIndex];
    box.style.position = 'relative';
    const el = document.createElement('div');
    el.className = view.className;
    el.textContent = view.text;
    box.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

// ===== オートスキップ =====
function cancelAutoSkip() {
    const timer = autoSkipScheduleController.getTimer();
    if (timer) clearTimeout(timer);
    autoSkipScheduleController.finish();
}

function checkAutoSkip() {
    if (autoSkipScheduleController.isPending()) return;
    const gameState = mainGameRuntimeSnapshot();
    const currentGame = gameState.game;
    if (!currentGame || currentGame.checkWinner()) return;
    if (currentGame.phase !== GAME_PHASES.BUILD) { cancelAutoSkip(); return; }
    if (gameState.cpuPlayers[currentGame.currentPlayerIndex]) return;
    const onlineState = mainOnlineRuntimeSnapshot();
    if (onlineState.isOnlineGame && currentGame.currentPlayerIndex !== onlineState.myPlayerIndex) return;
    if (currentGame.pendingRenovation > 0) return;
    if (currentGame.builtThisTurn) { cancelAutoSkip(); return; }

    const availability = AutoSkipPolicy.buildAvailability({
        cards: CARDS,
        current: currentGame.currentPlayer(),
        shopStock: SHOP_STOCK,
        getStockCount: getShopStockCount,
        enabledLandmarks: getEnabledLandmarkSelection(),
        yakushoName: LANDMARK_NAMES.YAKUSHO,
        landmarkCost: name => Player.landmarkCost(name),
    });

    if (!availability.canAffordAny) {
        const scheduledPlayerIndex = currentGame.currentPlayerIndex;
        autoSkipScheduleController.begin();
        autoSkipScheduleController.setTimer(setTimeout(() => {
            autoSkipScheduleController.finish();
            const delayedGame = mainGameRuntimeSnapshot().game;
            if (
                canRunLocalHumanAction(scheduledPlayerIndex) &&
                delayedGame.phase === GAME_PHASES.BUILD &&
                !delayedGame.builtThisTurn
            ) {
                runLocalOrSendOnline('nextTurn', {}, () => delayedGame.nextTurn());
            }
        }, 1500));
    }
}
// 初期表示
initMainView();
bindDelegatedUiHandlers();
bindCpuResumeScheduler();
