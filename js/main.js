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
const delayedHumanActionController = DelayedHumanActionPolicy.createScheduleController();

// 取り消し状態は GameRuntimeState が所有する。
UiTutorialSettings.runtime.replace({
    tutorialEnabled: safeMainStorageGet('tutorialEnabled') !== 'false',
    tutorialLevel: safeMainStorageGet('tutorialLevel', 'beginner') || 'beginner',
});

// CPU進行チェーン制御
const cpuSchedulerStateController = CpuSchedulerState.createController();

function invalidateCpuScheduleChain() {
    return cpuSchedulerStateController.invalidate().scheduleToken;
}

function cancelCpuSchedule(reason = 'cpu-schedule-cancel') {
    const state = cpuSchedulerStateController.cancel();
    try {
        if (typeof markMainCheckpoint === 'function') {
            markMainCheckpoint(reason, { cpuScheduleToken: state.scheduleToken });
        }
    } catch (_) {}
    return state.scheduleToken;
}

function markCpuStepScheduled(delay, leaseMs = 1500) {
    return cpuSchedulerStateController.markScheduled(Date.now(), delay, leaseMs).scheduledUntil;
}

function refreshCpuStepScheduleLease(leaseMs = 1500) {
    return cpuSchedulerStateController.refreshLease(Date.now(), leaseMs).scheduledUntil;
}

function isCpuStepScheduledNow() {
    return cpuSchedulerStateController.isStepScheduled();
}

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

function restartGame() {
    showConfirm("最初からやり直しますか？\n現在のゲームは終了します", () => {
        markMainCheckpoint('restart-game-confirmed-start');
        safeMainStorageRemove('savedGame');
        if (typeof clearOnlineSessionStorage === 'function') clearOnlineSessionStorage();
        else {
            ['onlineSession', 'onlineGameStart', 'onlineActionLog', 'onlineStateSnapshot', 'onlinePendingAction'].forEach(safeMainStorageRemove);
        }
        cancelCpuSchedule('restart-game-cancel-cpu');
        cancelDelayedHumanAction();
        cancelAutoSkip();
        stopConfetti();
        if (typeof resetOnlineState === 'function') resetOnlineState();
        else {
            try {
                OnlineRuntimeState.runtime.setOnline(false);
            } catch (_) {}
        }
        if (typeof resetUiLocksForGameReset === 'function') resetUiLocksForGameReset('restart-game-reset-ui-locks');
        if (typeof resetGameLifecycleForRestart === 'function') resetGameLifecycleForRestart('restart-game-lifecycle-reset');
        GameRuntimeState.runtime.setGame(null);
        GameRuntimeState.runtime.setPreviousCoins(null);
        winSoundPlayed = false;
        GameRuntimeState.runtime.setUndoState(null);
        resetFullLog();
        document.getElementById("gameScreen").style.display = "none";
        document.getElementById("titleScreen").style.display = "block";
        GameSetupState.runtime.replace({ selectedCount: 2, playerSettings: [] });
        GameRuntimeState.runtime.setCpuPlayers([]);
        document.getElementById("playerCount").textContent = 2;
        renderPlayerSettings();
        updateResumeButton();
        drawCitySkyline();
        if (typeof refreshPwaUpdateState === 'function') refreshPwaUpdateState();
        markMainCheckpoint('restart-game-confirmed-complete');
    });
}

function init(playerCount) {
    cancelCpuSchedule('init-cancel-cpu');
    cancelDelayedHumanAction();
    GameRuntimeState.runtime.setPreviousCoins(null);
    stopConfetti();
    winSoundPlayed = false;
    cancelAutoSkip();
    GameRuntimeState.runtime.setUndoState(null);
    resetFullLog();
    const initializedGameState = GameRuntimeState.runtime.setGame(new GameManager(playerCount));
    const currentGame = initializedGameState.game;
    let selectedLandmarks = getEnabledLandmarkSelection();
    if (selectedLandmarks.size === 0) {
        selectedLandmarks = replaceEnabledLandmarkSelection(Player.landmarkNames());
    }
    const selectedCards = getEnabledCardSelection();
    currentGame.enabledLandmarks = new Set(selectedLandmarks);
    for (const card of CARDS) {
        setShopStockCount(SHOP_STOCK, card, selectedCards.has(card.name) ? getInitialCardStock(card, playerCount) : 0);
    }
    const setup = gameSetupSnapshot();
    const normalizedSetup = GameSetupState.runtime.setPlayerSettings(
        Array.from({ length: playerCount }, (_, index) =>
            normalizeLocalPlayerSetting(setup.playerSettings[index], index, playerCount)
        )
    );
    const normalizedSettings = normalizedSetup.playerSettings;

    // ターン順をランダムにシャッフル
    const order = normalizedSettings.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }

    const shuffledSettings = order.map(originalIndex => normalizedSettings[originalIndex] || {});
    const opponentDifficulties = cpuOpponentDifficultiesFromSettings(shuffledSettings);

    // プレイヤー名とCPU設定をシャッフル順に再設定
    const shuffledCpuPlayers = [];
    for (let i = 0; i < playerCount; i++) {
        const originalIndex = order[i];
        const setting = shuffledSettings[i];
        currentGame.players[i].name = setting.type === "cpu"
            ? getLocalCpuLabel(setting.difficulty)
            : normalizeLocalPlayerName(setting.name, originalIndex);
        shuffledCpuPlayers.push(
            setting.type === "cpu"
                ? createCpuPlayer(setting.difficulty, { expertPurpose: "live", playerCount, expertOpponentDifficulties: opponentDifficulties })
                : null
        );
    }
    GameRuntimeState.runtime.setCpuPlayers(shuffledCpuPlayers);
    currentGame.addLog(LOG_TYPES.SYSTEM, `👤 ${currentGame.currentPlayer().name}のターン`);
    render();
    scheduleCPU();
}

// CPUアクションをローカル・オンライン両対応で実行
function cpuDo(action, data, fallback) {
    const currentGame = mainGameRuntimeSnapshot().game;
    const proposal = typeof CPUActionProposal !== 'undefined'
        ? CPUActionProposal.create(action, data)
        : null;
    if (!proposal) return false;
    if (mainOnlineRuntimeSnapshot().isOnlineGame) {
        sendAction(proposal.action, proposal.data);
        return;
    }
    const shadow = _prepareLocalGameEngineShadow(proposal.action, proposal.data);
    if (typeof GameEngine !== 'undefined' &&
            typeof GameEngine.applyMutableAction === 'function') {
        GameEngine.applyMutableAction({
            game: currentGame,
            action: proposal.action,
            data: proposal.data,
        });
    } else {
        fallback();
    }
    _finishLocalGameEngineShadow(shadow);
    render();
    scheduleCPU();
}

function markMainCheckpoint(event, details = {}) {
    try {
        if (typeof markClientFlowCheckpoint === 'function') markClientFlowCheckpoint(event, details);
    } catch (_) {
        // Diagnostics must never interrupt the CPU scheduler or a player action.
    }
}

const _localGameEngineShadowOutcomeController = GameEngineClientShadow.createOutcomeController();

function isLocalGameEngineShadowEnabled() {
    return typeof window !== 'undefined' &&
        window.MACHIKORO_LOCAL_GAME_ENGINE_SHADOW_ENABLED === true;
}

function isLocalGameEngineAuthorityEnabled() {
    return typeof window !== 'undefined' &&
        window.MACHIKORO_LOCAL_GAME_ENGINE_AUTHORITY_ENABLED === true;
}

function _createLocalGameEngineRuntimeAdapter() {
    const currentGame = mainGameRuntimeSnapshot().game;
    return GameEngineRuntimeAdapter.create({
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
    });
}

function _buildLocalGameEngineSnapshot() {
    const gameState = mainGameRuntimeSnapshot();
    return GameSnapshot.serializeGameState(gameState.game, SHOP_STOCK, {
        undoState: gameState.undoState,
        actionSeq: 0,
        logLimit: Number.MAX_SAFE_INTEGER,
        pendingActionsFor: GameManager.serializedPendingActionsFor,
    });
}

function _prepareLocalGameEngineShadow(action, data) {
    if (!isLocalGameEngineShadowEnabled() ||
            typeof GameEngineClientShadow === 'undefined' ||
            typeof GameEngineRuntimeAdapter === 'undefined' ||
            typeof GameEngineDeterminism === 'undefined') return null;
    const snapshot = _buildLocalGameEngineSnapshot();
    if (!GameEngineDeterminism.isResolved({
        action,
        data,
        snapshot,
        stationName: LANDMARK_NAMES.STATION,
    })) return null;
    return GameEngineClientShadow.prepare({
        enabled: true,
        action,
        data,
        snapshot,
        transition(sourceSnapshot, shadowAction, shadowData) {
            const adapter = _createLocalGameEngineRuntimeAdapter();
            return GameEngine.transitionSnapshot({
                snapshot: sourceSnapshot,
                action: shadowAction,
                data: shadowData,
                hydrate: adapter.hydrate,
                serialize: adapter.serialize,
            });
        },
    });
}

function _adoptLocalGameEngineShadowSnapshot(snapshot) {
    const adapter = _createLocalGameEngineRuntimeAdapter();
    const runtime = adapter.hydrate(snapshot);
    const rebuilt = adapter.serialize(runtime);
    if (!GameEngineClientShadow.equalSnapshots(rebuilt, snapshot)) return false;
    GameRuntimeState.runtime.setGame(runtime.game);
    assignShopStockSnapshot(SHOP_STOCK, runtime.shopStock);
    GameRuntimeState.runtime.setUndoState(runtime.undoState);
    return true;
}

function _finishLocalGameEngineShadow(prepared) {
    if (!prepared) return null;
    const outcome = GameEngineClientShadow.finish({
        prepared,
        liveSnapshot: _buildLocalGameEngineSnapshot(),
        authorityEnabled: isLocalGameEngineAuthorityEnabled(),
        adoptSnapshot: _adoptLocalGameEngineShadowSnapshot,
    });
    _localGameEngineShadowOutcomeController.set(outcome);
    return outcome;
}

function runLocalOrSendOnline(action, data, fallback) {
    const onlineState = mainOnlineRuntimeSnapshot();
    markMainCheckpoint('action-start', { action, isOnlineGame: onlineState.isOnlineGame });
    if (onlineState.isOnlineGame) {
        const sent = sendAction(action, data);
        markMainCheckpoint('action-online-send', { action, sent });
        return sent;
    }
    const shadow = _prepareLocalGameEngineShadow(action, data);
    const result = fallback();
    markMainCheckpoint('action-local-applied', { action, result });
    _finishLocalGameEngineShadow(shadow);
    if (result === false) return false;
    render();
    markMainCheckpoint('action-rendered', { action });
    scheduleCPU();
    markMainCheckpoint('action-scheduleCPU-returned', { action });
    return true;
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

function queueCPUStep(token, delay, fn) {
    markCpuStepScheduled(delay);
    cpuSchedulerStateController.setPendingToken(token);
    setTimeout(() => {
        if (!cpuSchedulerStateController.isCurrent(token)) return;
        cpuSchedulerStateController.clearPendingToken();
        refreshCpuStepScheduleLease();
        fn();
    }, delay);
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
function shouldRunCpuPhaseStep(stepName) {
    const currentGame = mainGameRuntimeSnapshot().game;
    return CpuSchedulerState.shouldRunPhaseStep(stepName, {
        hasGame: !!currentGame,
        phase: currentGame && currentGame.phase,
        pendingIT: !!(currentGame && currentGame.pendingIT),
        builtThisTurn: !!(currentGame && currentGame.builtThisTurn),
    }, GAME_PHASES);
}

const CPU_PHASE_HANDLERS = [
    {
        name: "roll",
        run(cpu) {
            const currentGame = mainGameRuntimeSnapshot().game;
            if (currentGame.phase !== GAME_PHASES.ROLL) return;
            const proposal = chooseCpuTurnAction('roll', cpu);
            cpuDo(proposal.action, proposal.data, () =>
                currentGame.rollDice(proposal.data.forceDice, proposal.data.tunaDice)
            );
        },
    },
    {
        name: "selectDice",
        run(cpu) {
            const currentGame = mainGameRuntimeSnapshot().game;
            if (currentGame.phase !== GAME_PHASES.SELECT_DICE) return;
            const proposal = chooseCpuTurnAction('selectDice', cpu);
            cpuDo(proposal.action, proposal.data, () => currentGame.selectDiceCount(
                proposal.data.useTwo, proposal.data.d1, proposal.data.d2, proposal.data.tunaDice
            ));
        },
    },
    {
        name: "rerollConfirm",
        run(cpu) {
            const currentGame = mainGameRuntimeSnapshot().game;
            if (currentGame.phase !== GAME_PHASES.REROLL_CONFIRM) return;
            const proposal = chooseCpuTurnAction('rerollConfirm', cpu);
            if (proposal.action === MAIN_ACTIONS.REROLL_DICE) {
                cpuDo(proposal.action, proposal.data, () =>
                    currentGame.rerollDice(proposal.data.forceDice, proposal.data.tunaDice)
                );
            } else {
                cpuDo(proposal.action, proposal.data, () => currentGame.skipReroll());
            }
        },
    },
    {
        name: "harborChoice",
        run(cpu) {
            const currentGame = mainGameRuntimeSnapshot().game;
            if (currentGame.phase !== GAME_PHASES.HARBOR_CHOICE) return;
            const proposal = chooseCpuTurnAction('harborChoice', cpu);
            cpuDo(proposal.action, proposal.data, () => currentGame.resolveHarbor(proposal.data.useBonus));
        },
    },
    {
        name: "pending",
        run(cpu) {
            const currentGame = mainGameRuntimeSnapshot().game;
            if (currentGame.phase !== GAME_PHASES.PENDING) return;
            const pendingAction = chooseCpuTurnAction('pending', cpu);
            if (pendingAction) {
                markMainCheckpoint('scheduleCPU-pending-resolution', {
                    action: pendingAction.action,
                    pendingIT: !!currentGame.pendingIT,
                    pendingAction: GameManager.nextPendingActionFor(currentGame),
                });
                cpuDo(pendingAction.action, pendingAction.data, () =>
                    CPUPendingResolution.applyPendingAction(currentGame, pendingAction)
                );
            }
        },
    },
    {
        name: "build",
        run(cpu) {
            const currentGame = mainGameRuntimeSnapshot().game;
            if (currentGame.phase !== GAME_PHASES.BUILD) return;
            const actionOnlyBuild = typeof cpu.chooseBuildAction === 'function' &&
                typeof cpu.executeBuildAction === 'function';
            const proposal = actionOnlyBuild ? chooseCpuTurnAction('build', cpu) : null;
            const buildResult = actionOnlyBuild
                ? cpu.executeBuildAction(proposal, currentGame, SHOP_STOCK)
                : cpu.build(currentGame, SHOP_STOCK);
            if (buildResult === false) {
                if (mainOnlineRuntimeSnapshot().isOnlineGame) return false;
                if (!currentGame.builtThisTurn) {
                    markMainCheckpoint('scheduleCPU-build-failed-pass');
                    currentGame.nextTurn();
                }
                return true;
            }
            render();
            return true;
        },
    },
    {
        name: "nextTurn",
        run(cpu) {
            const currentGame = mainGameRuntimeSnapshot().game;
            if (currentGame.phase !== GAME_PHASES.BUILD || currentGame.pendingIT) return;
            const proposal = chooseCpuTurnAction('nextTurn', cpu);
            cpuDo(proposal.action, proposal.data, () => currentGame.nextTurn());
        },
    },
    {
        name: "resolveIT",
        run(cpu) {
            const currentGame = mainGameRuntimeSnapshot().game;
            if (!currentGame.pendingIT) return;
            const proposal = chooseCpuTurnAction('resolveIT', cpu);
            cpuDo(proposal.action, proposal.data, () => currentGame.resolveIT(proposal.data.doSave));
        },
    },
];

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

function cpuScheduleBlockedReason() {
    const onlineState = mainOnlineRuntimeSnapshot();
    const online = onlineState.isOnlineGame;
    const transportReason = CpuSchedulerState.blockedReason({
        isReplaying: onlineState.isReplaying,
        isOnlineGame: online,
        isRoomHost: onlineState.isRoomHost,
        isReconnecting: online ? isMainOnlineReconnectInputBlocked() : false,
        onlineActionInFlight: online && mainOnlineActionFlightState().inFlight,
        socketConnected: !online || (!!onlineState.socket && onlineState.socket.connected !== false),
        hasGame: true,
        isCpuTurn: true,
    });
    if (transportReason) return transportReason;
    const gameState = mainGameRuntimeSnapshot();
    const currentGame = gameState.game;
    const currentPlayerIndex = currentGame ? currentGame.currentPlayerIndex : null;
    return CpuSchedulerState.blockedReason({
        hasGame: !!currentGame,
        hasWinner: !!(currentGame && currentGame.checkWinner && currentGame.checkWinner()),
        isCpuTurn: !!(currentGame && Array.isArray(gameState.cpuPlayers) && gameState.cpuPlayers[currentPlayerIndex]),
    });
}

function currentCpuTurnSchedulerHealth() {
    const blockedReason = cpuScheduleBlockedReason();
    const gameState = mainGameRuntimeSnapshot();
    const currentGame = gameState.game;
    const currentPlayerIndex = currentGame ? currentGame.currentPlayerIndex : null;
    const schedulerState = cpuSchedulerStateController.snapshot();
    return CpuSchedulerState.buildHealth({
        scheduleToken: schedulerState.scheduleToken,
        pendingToken: schedulerState.pendingToken,
        scheduledUntil: schedulerState.scheduledUntil,
        now: Date.now(),
        isCpuTurn: !!(currentGame && Array.isArray(gameState.cpuPlayers) && gameState.cpuPlayers[currentPlayerIndex]),
        currentPlayerIndex,
        blockedReason,
    });
}

function scheduleCpuTurn(reason = 'scheduleCPU') {
    const onlineState = mainOnlineRuntimeSnapshot();
    const gameState = mainGameRuntimeSnapshot();
    const currentGame = gameState.game;
    markMainCheckpoint('scheduleCPU-enter', {
        reason,
        isReplaying: onlineState.isReplaying,
        isOnlineGame: onlineState.isOnlineGame,
        isRoomHost: onlineState.isRoomHost,
    });
    if (onlineState.isReplaying) { markMainCheckpoint('scheduleCPU-skip-replaying'); return currentCpuTurnSchedulerHealth(); }
    if (onlineState.isOnlineGame && !onlineState.isRoomHost) { markMainCheckpoint('scheduleCPU-skip-non-host'); return currentCpuTurnSchedulerHealth(); }
    if (onlineState.isOnlineGame && (
        isMainOnlineReconnectInputBlocked() ||
        mainOnlineActionFlightState().inFlight ||
        (!onlineState.socket || onlineState.socket.connected === false)
    )) { markMainCheckpoint('scheduleCPU-skip-online-blocked', { onlineActionInFlight: mainOnlineActionFlightState().inFlight }); return currentCpuTurnSchedulerHealth(); }
    if (!currentGame || currentGame.checkWinner()) { markMainCheckpoint('scheduleCPU-skip-no-game-or-winner'); return currentCpuTurnSchedulerHealth(); }
    const ci = currentGame.currentPlayerIndex;
    if (!gameState.cpuPlayers[ci]) {
        markMainCheckpoint('scheduleCPU-skip-human-turn', { currentPlayerIndex: ci });
        if (typeof unlockUiForHumanTurn === 'function') unlockUiForHumanTurn('scheduleCPU-human-turn-unlock');
        return currentCpuTurnSchedulerHealth();
    }
    const cpu = gameState.cpuPlayers[ci];
    const token = invalidateCpuScheduleChain();
    let stepIndex = 0;

    function runNextStep() {
        const currentToken = cpuSchedulerStateController.snapshot().scheduleToken;
        markMainCheckpoint('scheduleCPU-step-enter', { token, stepIndex, currentToken });
        if (!cpuSchedulerStateController.isCurrent(token)) {
            markMainCheckpoint('scheduleCPU-step-stale', { token, currentToken });
            return;
        }
        if (stepIndex >= CPU_PHASE_HANDLERS.length) {
            queueCPUStep(token, 500, () => {
                const latestGame = mainGameRuntimeSnapshot().game;
                if (latestGame && !latestGame.checkWinner()) scheduleCPU();
            });
            return;
        }
        const step = CPU_PHASE_HANDLERS[stepIndex++];
        if (!shouldRunCpuPhaseStep(step.name)) {
            const latestGame = mainGameRuntimeSnapshot().game;
            markMainCheckpoint('scheduleCPU-step-skip-phase', {
                step: step.name,
                phase: latestGame && latestGame.phase || '',
                pendingIT: !!(latestGame && latestGame.pendingIT),
            });
            runNextStep();
            return;
        }
        queueCPUStep(token, gameSetupSnapshot().cpuSpeed, () => {
            const stepOnlineState = mainOnlineRuntimeSnapshot();
            if (stepOnlineState.isReplaying) return;
            if (stepOnlineState.isOnlineGame && !stepOnlineState.isRoomHost) return;
            if (stepOnlineState.isOnlineGame && (
                isMainOnlineReconnectInputBlocked() ||
                mainOnlineActionFlightState().inFlight ||
                (!stepOnlineState.socket || stepOnlineState.socket.connected === false)
            )) return;
            const stepGameState = mainGameRuntimeSnapshot();
            const stepGame = stepGameState.game;
            if (!stepGame || stepGame.checkWinner()) return;
            if (!stepGameState.cpuPlayers[stepGame.currentPlayerIndex]) return;
            markMainCheckpoint('scheduleCPU-step-run', { step: step.name });
            let stepResult;
            try {
                stepResult = step.run(cpu);
            } catch (error) {
                console.error('[cpu] phase step failed:', step.name, error);
                markMainCheckpoint('scheduleCPU-step-error', { step: step.name, message: error && error.message || String(error) });
                if (mainOnlineRuntimeSnapshot().isOnlineGame) return;
                if (step.name === 'build' && stepGame.phase === GAME_PHASES.BUILD && !stepGame.builtThisTurn) {
                    stepGame.nextTurn();
                }
                runNextStep();
                return;
            }
            markMainCheckpoint('scheduleCPU-step-result', { step: step.name, stepResult });
            if (stepResult === false) return;
            runNextStep();
        });
    }

    runNextStep();
    return currentCpuTurnSchedulerHealth();
}

const cpuTurnScheduler = Object.freeze({
    schedule(reason = 'cpu-turn-scheduler-schedule') {
        return scheduleCpuTurn(reason);
    },
    cancel(reason = 'cpu-turn-scheduler-cancel') {
        cancelCpuSchedule(reason);
        return currentCpuTurnSchedulerHealth();
    },
    getHealth() {
        return currentCpuTurnSchedulerHealth();
    },
});

function scheduleCPU() {
    return cpuTurnScheduler.schedule('scheduleCPU');
}

const pageActivationLifecycleController = PageActivationPolicy.createLifecycleController();

function resumeCpuTurnAfterPageActivation(reason) {
    if (typeof document !== 'undefined' && document.hidden) return;
    const health = currentCpuTurnSchedulerHealth();
    if (!health.isCpuTurn || health.blockedReason) return;
    if (health.stepScheduled && Date.now() < health.scheduledUntil) return;
    cancelCpuSchedule(reason + '-expire-stale');
    scheduleCpuTurn(reason);
}

function runDelayedHumanAction(scheduledToken) {
    const state = delayedHumanActionController.take(scheduledToken);
    if (!state) return;
    if (!canRunHumanAction(state.action, state.playerIndex)) return;
    state.run();
}

function scheduleDelayedHumanAction(action, playerIndex, run, delay = 600) {
    const state = delayedHumanActionController.schedule({
        action,
        playerIndex,
        deadline: Date.now() + delay,
        run,
    });
    delayedHumanActionController.setTimer(
        setTimeout(() => runDelayedHumanAction(state.token), delay)
    );
}

function resumeDelayedHumanActionAfterPageActivation() {
    const pageHidden = typeof document !== 'undefined' && !!document.hidden;
    const state = delayedHumanActionController.getState();
    const hasCandidate = !pageHidden && delayedHumanActionController.isPending() && !!state;
    const canRun = hasCandidate && canRunHumanAction(state.action, state.playerIndex);
    const decision = DelayedHumanActionPolicy.resumeDecision({
        pageHidden,
        pending: delayedHumanActionController.isPending(),
        hasState: !!state,
        canRun,
        now: canRun ? Date.now() : 0,
        deadline: state ? state.deadline : 0,
    });
    if (decision === 'idle') return;
    if (decision === 'cancel') {
        cancelDelayedHumanAction();
        return;
    }
    if (decision === 'run') {
        runDelayedHumanAction(state.token);
        return;
    }
    const timer = delayedHumanActionController.getTimer();
    if (timer !== null) clearTimeout(timer);
    const renewedState = delayedHumanActionController.renew();
    delayedHumanActionController.setTimer(setTimeout(
        () => runDelayedHumanAction(renewedState.token),
        Math.max(0, renewedState.deadline - Date.now())
    ));
}

function cpuPageActivationOutcome(before, after, pageHidden) {
    return PageActivationPolicy.cpuOutcome(before, after, pageHidden);
}

function pageHiddenDurationMs(now) {
    return pageActivationLifecycleController.hiddenDurationMs(now);
}

function resumeTurnAfterPageActivation(reason) {
    const activationAt = Date.now();
    const pageHidden = typeof document !== 'undefined' && !!document.hidden;
    const activation = pageActivationLifecycleController.beginActivation(pageHidden, activationAt);
    const hiddenForMs = activation.hiddenForMs;
    const cpuBefore = currentCpuTurnSchedulerHealth();

    if (typeof RLModelPortfolio !== 'undefined' &&
            typeof RLModelPortfolio.resumePendingLoadsAfterPageActivation === 'function') {
        RLModelPortfolio.resumePendingLoadsAfterPageActivation();
    }
    resumeDelayedHumanActionAfterPageActivation();
    if (typeof resumeOnlineReconnectAfterPageActivation === 'function') {
        resumeOnlineReconnectAfterPageActivation();
    }
    resumeCpuTurnAfterPageActivation(reason);
    const cpuAfter = currentCpuTurnSchedulerHealth();
    markMainCheckpoint(pageHidden ? 'page-activation-hidden' : 'page-activation-resume', {
        reason,
        hiddenForMs,
        cpuOutcome: cpuPageActivationOutcome(cpuBefore, cpuAfter, pageHidden),
        cpuBefore,
        cpuAfter,
    });
    pageActivationLifecycleController.finishActivation(pageHidden);
}

function bindCpuResumeScheduler() {
    if (!pageActivationLifecycleController.claimBinding()) return;
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => resumeTurnAfterPageActivation('visibility-resume'));
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('pageshow', () => resumeTurnAfterPageActivation('pageshow-resume'));
    }
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
    const timer = delayedHumanActionController.cancel();
    if (timer !== null) clearTimeout(timer);
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
        if (delayedHumanActionController.isPending()) return;
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
    if (delayedHumanActionController.isPending()) return;
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

const uiEventBindingController = UiEventDelegation.createBindingController();

function actionButtonFromEvent(event) {
    return UiEventDelegation.elementFromEvent(event, 'data-action');
}

function uiActionElementFromEvent(event, attributeName) {
    return UiEventDelegation.elementFromEvent(event, attributeName);
}

function reloadCurrentPage() {
    if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
        window.location.reload();
    } else if (typeof location !== 'undefined' && typeof location.reload === 'function') {
        location.reload();
    }
}

function staticUiCommandEffects() {
    return {
        showRules: (...args) => showRules(...args),
        showCardSelect: (...args) => showCardSelect(...args),
        reconnectOnline: (...args) => reconnectOnline(...args),
        deleteOnlineSession: (...args) => deleteOnlineSession(...args),
        switchTab: (...args) => switchTab(...args),
        changeCount: (...args) => changeCount(...args),
        startGame: (...args) => startGame(...args),
        resumeGame: (...args) => resumeGame(...args),
        deleteSavedGame: (...args) => deleteSavedGame(...args),
        switchOnlineTab: (...args) => switchOnlineTab(...args),
        changeOnlineCount: (...args) => changeOnlineCount(...args),
        showCreateRoom: (...args) => showCreateRoom(...args),
        joinRoom: (...args) => joinRoom(...args),
        toggleTutorial: (...args) => toggleTutorial(...args),
        cycleTutorialLevel: (...args) => cycleTutorialLevel(...args),
        onRoll: (...args) => onRoll(...args),
        onReroll: (...args) => onReroll(...args),
        onSkip: (...args) => onSkip(...args),
        toggleLog: (...args) => toggleLog(...args),
        restartGame: (...args) => restartGame(...args),
        closeRules: (...args) => closeRules(...args),
        closeCardDetail: (...args) => closeCardDetail(...args),
        hideNotice: (...args) => hideNotice(...args),
        reloadPage: (...args) => reloadCurrentPage(...args),
        crashResume: (...args) => crashResume(...args),
        pwaApplyUpdate() {
            if (typeof pwaApplyUpdate === 'function') pwaApplyUpdate();
            else reloadCurrentPage();
        },
        hidePwaUpdateBanner() {
            if (typeof shouldKeepPwaUpdateBannerVisible === 'function' && shouldKeepPwaUpdateBannerVisible()) return;
            const banner = document.getElementById('pwaUpdateBanner');
            if (banner) banner.style.display = 'none';
            if (typeof maybeShowPwaInstallBanner === 'function') maybeShowPwaInstallBanner();
            else {
                const installBanner = document.getElementById('pwaInstallBanner');
                const stillVisible = installBanner && installBanner.style.display === 'block';
                if (!stillVisible && document.body && document.body.classList) document.body.classList.remove('pwa-banner-open');
            }
        },
        pwaInstallPrompt: (...args) => pwaInstallPrompt(...args),
        pwaInstallDismiss: (...args) => pwaInstallDismiss(...args),
    };
}

function handleStaticUiClick(event) {
    const element = uiActionElementFromEvent(event, 'data-ui-action');
    if (!element || element.disabled) return;
    const command = UiEventDelegation.commandFromElement(element, 'static');
    if (!command) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    UiEventDelegation.executeCommand(command, staticUiCommandEffects());
}

function handleStaticUiInput(event) {
    const element = uiActionElementFromEvent(event, 'data-ui-input');
    const command = UiEventDelegation.commandFromElement(element, 'input');
    if (!command) return;
    UiEventDelegation.executeCommand(command, {
        cpuSpeed(value) {
            const label = document.getElementById('speedLabel');
            if (label) label.textContent = formatCpuSpeedLabel(value);
        },
        onlineCpuSpeed(value) {
            const label = document.getElementById('onlineSpeedLabel');
            if (label) label.textContent = formatCpuSpeedLabel(value);
        },
        localPlayerName: (...args) => onChangePlayerName(...args),
    });
}

function handleStaticUiChange(event) {
    const element = uiActionElementFromEvent(event, 'data-ui-change');
    const command = UiEventDelegation.commandFromElement(element, 'change');
    if (!command) return;
    UiEventDelegation.executeCommand(command, {
        toggleTutorialEnabled: (...args) => onToggleTutorial(...args),
        tutorialLevel: (...args) => onChangeTutorialLevel(...args),
        localPlayerType: (...args) => onChangePlayerType(...args),
        onlinePlayerType: (...args) => onChangeOnlinePlayerType(...args),
    });
}

function handleStaticUiKeydown(event) {
    if (!UiEventDelegation.isKeyboardActivationKey(event)) return;
    const element = uiActionElementFromEvent(event, 'data-ui-action');
    if (!UiEventDelegation.isEnabledRoleButton(element)) return;
    handleStaticUiClick(event);
}

function bindStaticUiHandlers() {
    if (uiEventBindingController.isBound(UiEventDelegation.BINDINGS.STATIC)) return;
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    document.addEventListener('click', handleStaticUiClick);
    document.addEventListener('input', handleStaticUiInput);
    document.addEventListener('change', handleStaticUiChange);
    document.addEventListener('keydown', handleStaticUiKeydown);
    uiEventBindingController.markBound(UiEventDelegation.BINDINGS.STATIC);
}

function handleDiceChoiceClick(event) {
    const button = actionButtonFromEvent(event);
    if (!button || button.disabled) return;
    const command = UiEventDelegation.commandFromElement(button, 'dice');
    if (!command) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    UiEventDelegation.executeCommand(command, {
        selectDiceCount: onSelectDiceCount,
        rerollDice: (...args) => onReroll(...args),
        skipReroll: onSkipReroll,
        resolveHarbor: onResolveHarbor,
    });
}

function handlePendingActionClick(event) {
    const button = actionButtonFromEvent(event);
    if (!button || button.disabled) return;
    const command = UiEventDelegation.commandFromElement(button, 'pending');
    if (!command) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    UiEventDelegation.executeCommand(command, {
        selectBusinessCard: inputId => bcSelectCard(button, inputId),
        resolveTV: onResolveTV,
        resolveBusiness: onResolveBusiness,
        resolveCleaning: onResolveCleaning,
        resolveMover: onResolveMover,
        resolveRenovation: onResolveRenovation,
        resolveIT: onResolveIT,
    });
}

function handleBuildMenuClick(event) {
    const button = actionButtonFromEvent(event);
    if (!button || button.disabled) return;
    const command = UiEventDelegation.commandFromElement(button, 'build');
    if (!command) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    UiEventDelegation.executeCommand(command, {
        buildCard: onBuildCard,
        buildLandmark: onBuildLandmark,
        showCardDetail: (...args) => showCardDetail(...args),
        showLandmarkDetail: (...args) => showCardDetail(...args),
        setCardFilter: (...args) => setCardFilter(...args),
        undoBuild: (...args) => doUndo(...args),
    });
}

function handlePlayerPanelClick(event) {
    const button = actionButtonFromEvent(event);
    if (!button || button.disabled) return;
    const command = UiEventDelegation.commandFromElement(button, 'player');
    if (!command || command.name !== 'showCardDetail') return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    UiEventDelegation.executeCommand(command, {
        showCardDetail: (...args) => showCardDetail(...args),
    });
}

function bindDelegatedUiHandlers() {
    if (uiEventBindingController.isBound(UiEventDelegation.BINDINGS.DELEGATED)) return;
    const diceChoose = document.getElementById('diceChoose');
    const pendingMenu = document.getElementById('pendingMenu');
    const buildMenu = document.getElementById('buildMenu');
    const players = document.getElementById('players');
    if (diceChoose && typeof diceChoose.addEventListener === 'function') diceChoose.addEventListener('click', handleDiceChoiceClick);
    if (pendingMenu && typeof pendingMenu.addEventListener === 'function') pendingMenu.addEventListener('click', handlePendingActionClick);
    if (buildMenu && typeof buildMenu.addEventListener === 'function') buildMenu.addEventListener('click', handleBuildMenuClick);
    if (players && typeof players.addEventListener === 'function') players.addEventListener('click', handlePlayerPanelClick);
    bindStaticUiHandlers();
    uiEventBindingController.markBound(UiEventDelegation.BINDINGS.DELEGATED);
}

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
