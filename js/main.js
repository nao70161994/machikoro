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
    const resolvedOptions = resolveLiveCpuOptions(difficulty, options);
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
        window.MACHIKORO_LOCAL_GAME_ENGINE_SHADOW_ENABLED !== false;
}

function isLocalGameEngineAuthorityEnabled() {
    return typeof window !== 'undefined' &&
        window.MACHIKORO_LOCAL_GAME_ENGINE_AUTHORITY_ENABLED !== false;
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
function runLocalOrSendOnline(action, data, fallback, options) {
    return localGameEngineRuntime.runHuman(action, data, fallback, options);
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
    return mainHumanActionRuntime.canRunAction(action);
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

const mainHumanActionRuntime = MainHumanActionRuntime.createRuntime({
    actions: MAIN_ACTIONS,
    allowedActionsFor: currentGame => GameManager.allowedActionsFor(currentGame),
    cancelAutoSkip: () => cancelAutoSkip(),
    cards: CARDS,
    checkpoint: (event, details) => markMainCheckpoint(event, details),
    clearUndoState: () => GameRuntimeState.runtime.setUndoState(null),
    document,
    decrementStock: (stock, card) => decrementShopStock(stock, card),
    getActionFlightState: () => mainOnlineActionFlightState(),
    getGameState: mainGameRuntimeSnapshot,
    getLandmarkEmoji: name => getLandmarkEmoji(name),
    getOnlineState: mainOnlineRuntimeSnapshot,
    getStockCount: (stock, card) => getShopStockCount(stock, card),
    isReconnectBlocked: () => isMainOnlineReconnectInputBlocked(),
    landmarkNames: LANDMARK_NAMES,
    localActionPolicy: LocalActionPolicy,
    pageActivationRuntime,
    playSound: name => playSound(name),
    player: Player,
    render: () => render(),
    rollDie: () => rollRandomDie(),
    runAction: (action, data, fallback, options) => runLocalOrSendOnline(action, data, fallback, options),
    saveUndoState: () => saveUndoState(),
    scheduleCpu: () => scheduleCPU(),
    sendAction: (action, data) => sendAction(action, data),
    shopStock: SHOP_STOCK,
    showConfirm: (message, callback) => showConfirm(message, callback),
    traceBuild(stage, details) {
        if (typeof recordFlowTrace === 'function') {
            recordFlowTrace('build-' + stage, details);
        } else if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('[machikoro-build-flow]', stage, details);
        }
    },
    unlockHumanTurn(reason) {
        if (typeof unlockUiForHumanTurn === 'function') unlockUiForHumanTurn(reason);
    },
    updateDiceDisplay: (nums, rolling) => updateDiceDisplay(nums, rolling),
});

function canRunLocalHumanAction(expectedPlayerIndex = null) {
    return mainHumanActionRuntime.canRunLocalHumanAction(expectedPlayerIndex);
}

function canRunHumanAction(action, expectedPlayerIndex = null) {
    return mainHumanActionRuntime.canRunHumanAction(action, expectedPlayerIndex);
}

function cancelDelayedHumanAction() {
    return pageActivationRuntime.cancelDelayed();
}

function onRoll() { return mainHumanActionRuntime.onRoll(); }
function onSelectDiceCount(useTwo) { return mainHumanActionRuntime.onSelectDiceCount(useTwo); }
function onReroll() { return mainHumanActionRuntime.onReroll(); }
function onSkipReroll() { return mainHumanActionRuntime.onSkipReroll(); }

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
        skipBusiness: 'onSkipBusiness',
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

function onResolveHarbor(useBonus) { return mainHumanActionRuntime.onResolveHarbor(useBonus); }
function onResolveTV(index) { return mainHumanActionRuntime.onResolveTV(index); }
function onResolveBusiness(targetIndex) { return mainHumanActionRuntime.onResolveBusiness(targetIndex); }
function onSkipBusiness() { return mainHumanActionRuntime.onSkipBusiness(); }
function onResolveCleaning(cardName) { return mainHumanActionRuntime.onResolveCleaning(cardName); }
function onResolveMover(targetIndex) { return mainHumanActionRuntime.onResolveMover(targetIndex); }
function onResolveRenovation(name) { return mainHumanActionRuntime.onResolveRenovation(name); }
function onResolveIT(doSave) { return mainHumanActionRuntime.onResolveIT(doSave); }
function traceBuildFlow(stage, details = {}) { return mainHumanActionRuntime.traceBuildFlow(stage, details); }
function onBuildCard(name) { return mainHumanActionRuntime.onBuildCard(name); }
function onBuildLandmark(name) { return mainHumanActionRuntime.onBuildLandmark(name); }
function onSkip() { return mainHumanActionRuntime.onSkip(); }
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
const mainAutoSkipRuntime = MainAutoSkipRuntime.createRuntime({
    canRunLocalHumanAction: playerIndex => canRunLocalHumanAction(playerIndex),
    cards: CARDS,
    clearTimeout: timer => clearTimeout(timer),
    gamePhases: GAME_PHASES,
    getEnabledLandmarks: () => getEnabledLandmarkSelection(),
    getGameState: mainGameRuntimeSnapshot,
    getOnlineState: mainOnlineRuntimeSnapshot,
    getStockCount: (stock, card) => getShopStockCount(stock, card),
    landmarkNames: LANDMARK_NAMES,
    player: Player,
    policy: AutoSkipPolicy,
    runAction: (action, data, fallback) => runLocalOrSendOnline(action, data, fallback),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    shopStock: SHOP_STOCK,
});
const autoSkipScheduleController = mainAutoSkipRuntime.controller;

function cancelAutoSkip() { return mainAutoSkipRuntime.cancel(); }
function checkAutoSkip() { return mainAutoSkipRuntime.check(); }
// 初期表示
initMainView();
bindDelegatedUiHandlers();
bindCpuResumeScheduler();
