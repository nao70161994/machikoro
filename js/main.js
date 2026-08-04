const SHOP_STOCK = {};

// live game / CPU / Undo / coin animation state は GameRuntimeState が所有する。
const mainClientStorageFacade = ClientStorage.createFacade();

function safeMainStorageGet(key, fallback = null) {
    return mainClientStorageFacade.get(key, fallback);
}

function safeMainStorageRemove(key) {
    mainClientStorageFacade.remove(key);
}

// 連勝記録
let winStreak = parseInt(safeMainStorageGet('winStreak', '0') || '0');
let lastWinnerName = safeMainStorageGet('lastWinnerName', '') || '';

// オートスキップ
const autoSkipScheduleController = AutoSkipPolicy.createScheduleController();
const delayedHumanActionController = DelayedHumanActionPolicy.createScheduleController();
const localGameStartPendingController = LocalGameStart.createPendingController();

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

function changeCount(delta) {
    selectedCount = Math.min(10, Math.max(2, selectedCount + delta));
    document.getElementById("playerCount").textContent = selectedCount;
    renderPlayerSettings();
    preloadLocalRlModelsInBackground('local-player-count-preload');
    saveSettings();
}

function renderPlayerSettings() {
    playerSettings = Array.from(LocalPlayerSettings.normalizeSettings(playerSettings, selectedCount));
    document.getElementById("playerSettings").innerHTML = LocalPlayerSettings.buildSettingsHtml(
        playerSettings,
        selectedCount
    );
    updateLocalRlModelReadinessUi();
}

function onChangePlayerType(index, value) {
    if (value === "human") {
        playerSettings[index] = {
            type: "human",
            difficulty: "normal",
            name: normalizeLocalPlayerName(playerSettings[index]?.name, index),
        };
    } else {
        playerSettings[index] = {
            type: "cpu",
            difficulty: value,
            name: normalizeLocalPlayerName(playerSettings[index]?.name, index),
        };
    }
    renderPlayerSettings();
    if (value === "rl") preloadLocalRlModelsInBackground('local-rl-selected-preload');
    saveSettings();
}

function onChangePlayerName(index, value) {
    if (!playerSettings[index]) {
        playerSettings[index] = { type: "human", difficulty: "normal", name: defaultLocalPlayerName(index) };
    }
    playerSettings[index].name = value;
    saveSettings();
}

function hasRlCpuSetting(settings, playerCount) {
    return LocalPlayerSettings.hasRlCpu(settings, playerCount);
}

function snapshotLocalPlayerSettings(playerCount = selectedCount) {
    return LocalPlayerSettings.snapshot(playerSettings, playerCount);
}

function hasLocalRlCpuSetting(playerCount = selectedCount, settings = playerSettings) {
    return hasRlCpuSetting(settings, playerCount);
}

function canPreloadRlModels() {
    return typeof RLModelPortfolio !== "undefined" && typeof RLModelPortfolio.preloadEligibleModels === "function";
}

function localRlModelLoadState(playerCount = selectedCount) {
    if (!hasLocalRlCpuSetting(playerCount)) return { status: 'unused', ready: 0, total: 0, errors: [] };
    if (!canPreloadRlModels()) return { status: 'failed', ready: 0, total: 0, errors: ['RL model loader is not available'] };
    if (typeof RLModelPortfolio.eligibleLoadState === "function") return RLModelPortfolio.eligibleLoadState(playerCount);
    return { status: 'idle', ready: 0, total: 1, errors: [] };
}

function localRlModelStatusMessage(state) {
    return LocalPlayerSettings.rlModelStatusMessage(state);
}

function updateLocalRlModelReadinessUi() {
    const state = localRlModelLoadState(selectedCount);
    const btn = typeof document !== 'undefined' && document.getElementById ? document.getElementById('btnStart') : null;
    const status = typeof document !== 'undefined' && document.getElementById ? document.getElementById('localRlModelStatus') : null;
    if (btn) {
        const view = LocalPlayerSettings.startButtonView(state, localGameStartPendingController.isPending());
        btn.disabled = view.disabled;
        btn.textContent = view.textContent;
    }
    if (status) status.textContent = localRlModelStatusMessage(state);
    return state;
}

function preloadLocalRlModelsForStart(playerCount, settings = playerSettings) {
    if (!hasLocalRlCpuSetting(playerCount, settings)) return null;
    if (!canPreloadRlModels()) return Promise.reject(new Error("RL model loader is not available"));
    return RLModelPortfolio.preloadEligibleModels(playerCount, { attempts: 3 });
}

function preloadLocalRlModelsInBackground(reason = 'local-rl-background-preload') {
    if (!hasLocalRlCpuSetting(selectedCount) || !canPreloadRlModels()) {
        updateLocalRlModelReadinessUi();
        return null;
    }
    updateLocalRlModelReadinessUi();
    const preload = RLModelPortfolio.preloadEligibleModels(selectedCount, { attempts: 3, retryDelayMs: 0 });
    if (preload && typeof preload.then === "function") {
        preload.then(() => updateLocalRlModelReadinessUi()).catch(error => {
            if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn(reason, error);
            updateLocalRlModelReadinessUi();
        });
    }
    updateLocalRlModelReadinessUi();
    return preload;
}

function startGameNow(playerCount = selectedCount, settings = playerSettings) {
    const plan = LocalGameStart.runtimePlan(
        playerCount,
        settings,
        parseInt(document.getElementById("cpuSpeed").value)
    );
    LocalGameStart.execute(plan, {
        setRuntime(value) {
            selectedCount = value.playerCount;
            playerSettings = Array.from(value.playerSettings, setting => Object.assign({}, setting));
            cpuSpeed = value.cpuSpeed;
        },
        saveSettings,
        resetStats: resetStatsRecorded,
        resetOnline() {
            if (typeof resetOnlineState === 'function') resetOnlineState();
        },
        resetUiLocks() {
            if (typeof resetUiLocksForGameReset === 'function') {
                resetUiLocksForGameReset('start-game-reset-ui-locks');
            }
        },
        showGame() {
            document.getElementById("titleScreen").style.display = "none";
            document.getElementById("gameScreen").style.display = "block";
        },
        initializeGame: init,
        notifyLifecycleStart() {
            if (typeof notifyGameLifecycleStart === 'function') notifyGameLifecycleStart();
        },
    });
}

function startGame() {
    if (LocalGameStart.initialDecision({ startPending: localGameStartPendingController.isPending() }) ===
            LocalGameStart.REQUEST_DECISIONS.IGNORE_PENDING) return;
    const startPlayerCount = selectedCount;
    const startPlayerSettings = snapshotLocalPlayerSettings(startPlayerCount);
    const state = updateLocalRlModelReadinessUi();
    if (LocalGameStart.initialDecision({ loadStatus: state.status }) ===
            LocalGameStart.REQUEST_DECISIONS.WAIT_LOADING) {
        showNotice("深層学習AIモデルを読み込んでいます。");
        return;
    }
    const preload = preloadLocalRlModelsForStart(startPlayerCount, startPlayerSettings);
    if (LocalGameStart.preloadDecision(preload) === LocalGameStart.REQUEST_DECISIONS.PRELOAD) {
        localGameStartPendingController.begin();
        updateLocalRlModelReadinessUi();
        showNotice("深層学習AIモデルを読み込んでいます。");
        preload
            .then(() => {
                localGameStartPendingController.finish();
                updateLocalRlModelReadinessUi();
                startGameNow(startPlayerCount, startPlayerSettings);
            })
            .catch(error => {
                localGameStartPendingController.finish();
                console.error(error);
                updateLocalRlModelReadinessUi();
                showNotice("深層学習AIモデルを読み込めませんでした。通信状態を確認してもう一度開始してください。");
            });
        return;
    }
    startGameNow();
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
        selectedCount = 2;
        playerSettings = [];
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
    GameRuntimeState.runtime.setGame(new GameManager(playerCount));
    let selectedLandmarks = getEnabledLandmarkSelection();
    if (selectedLandmarks.size === 0) {
        selectedLandmarks = replaceEnabledLandmarkSelection(Player.landmarkNames());
    }
    const selectedCards = getEnabledCardSelection();
    game.enabledLandmarks = new Set(selectedLandmarks);
    for (const card of CARDS) {
        setShopStockCount(SHOP_STOCK, card, selectedCards.has(card.name) ? getInitialCardStock(card, playerCount) : 0);
    }
    playerSettings = Array.from({ length: playerCount }, (_, index) =>
        normalizeLocalPlayerSetting(playerSettings[index], index, playerCount)
    );

    // ターン順をランダムにシャッフル
    const order = playerSettings.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }

    const shuffledSettings = order.map(originalIndex => playerSettings[originalIndex] || {});
    const opponentDifficulties = cpuOpponentDifficultiesFromSettings(shuffledSettings);

    // プレイヤー名とCPU設定をシャッフル順に再設定
    const shuffledCpuPlayers = [];
    for (let i = 0; i < playerCount; i++) {
        const originalIndex = order[i];
        const setting = shuffledSettings[i];
        game.players[i].name = setting.type === "cpu"
            ? getLocalCpuLabel(setting.difficulty)
            : normalizeLocalPlayerName(setting.name, originalIndex);
        shuffledCpuPlayers.push(
            setting.type === "cpu"
                ? createCpuPlayer(setting.difficulty, { expertPurpose: "live", playerCount, expertOpponentDifficulties: opponentDifficulties })
                : null
        );
    }
    GameRuntimeState.runtime.setCpuPlayers(shuffledCpuPlayers);
    game.addLog(LOG_TYPES.SYSTEM, `👤 ${game.currentPlayer().name}のターン`);
    render();
    scheduleCPU();
}

// CPUアクションをローカル・オンライン両対応で実行
function cpuDo(action, data, fallback) {
    const proposal = typeof CPUActionProposal !== 'undefined'
        ? CPUActionProposal.create(action, data)
        : null;
    if (!proposal) return false;
    if (isOnlineGame) {
        sendAction(proposal.action, proposal.data);
        return;
    }
    const shadow = _prepareLocalGameEngineShadow(proposal.action, proposal.data);
    if (typeof GameEngine !== 'undefined' &&
            typeof GameEngine.applyMutableAction === 'function') {
        GameEngine.applyMutableAction({
            game,
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
    return GameEngineRuntimeAdapter.create({
        createGame: playerCount => new GameManager(playerCount),
        enabledLandmarks: game && game.enabledLandmarks
            ? game.enabledLandmarks
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
    return GameSnapshot.serializeGameState(game, SHOP_STOCK, {
        undoState,
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
    markMainCheckpoint('action-start', { action, isOnlineGame });
    if (isOnlineGame) {
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
    if (!game || !action) return false;
    if (typeof game.allowedActions === 'function') return game.allowedActions().has(action);
    if (typeof GameManager !== 'undefined' && GameManager && typeof GameManager.allowedActionsFor === 'function') {
        return GameManager.allowedActionsFor(game).has(action);
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
    return CPUPendingResolution.choosePendingAction(game, cpu, { clearFallback: false });
}

function chooseCpuTurnAction(stepName, cpu) {
    return CpuTurnStrategy.chooseAction(stepName, {
        game,
        cpu,
        rollDie: rollRandomDie,
        choosePendingAction: chooseCpuPendingAction,
        shopStock: SHOP_STOCK,
    });
}

// フェーズごとの CPU ハンドラテーブル。
// 新フェーズを追加するときはここに1エントリ追加するだけでよい。
function shouldRunCpuPhaseStep(stepName) {
    return CpuSchedulerState.shouldRunPhaseStep(stepName, {
        hasGame: !!game,
        phase: game && game.phase,
        pendingIT: !!(game && game.pendingIT),
        builtThisTurn: !!(game && game.builtThisTurn),
    }, GAME_PHASES);
}

const CPU_PHASE_HANDLERS = [
    {
        name: "roll",
        run(cpu) {
            if (game.phase !== GAME_PHASES.ROLL) return;
            const proposal = chooseCpuTurnAction('roll', cpu);
            cpuDo(proposal.action, proposal.data, () =>
                game.rollDice(proposal.data.forceDice, proposal.data.tunaDice)
            );
        },
    },
    {
        name: "selectDice",
        run(cpu) {
            if (game.phase !== GAME_PHASES.SELECT_DICE) return;
            const proposal = chooseCpuTurnAction('selectDice', cpu);
            cpuDo(proposal.action, proposal.data, () => game.selectDiceCount(
                proposal.data.useTwo, proposal.data.d1, proposal.data.d2, proposal.data.tunaDice
            ));
        },
    },
    {
        name: "rerollConfirm",
        run(cpu) {
            if (game.phase !== GAME_PHASES.REROLL_CONFIRM) return;
            const proposal = chooseCpuTurnAction('rerollConfirm', cpu);
            if (proposal.action === MAIN_ACTIONS.REROLL_DICE) {
                cpuDo(proposal.action, proposal.data, () =>
                    game.rerollDice(proposal.data.forceDice, proposal.data.tunaDice)
                );
            } else {
                cpuDo(proposal.action, proposal.data, () => game.skipReroll());
            }
        },
    },
    {
        name: "harborChoice",
        run(cpu) {
            if (game.phase !== GAME_PHASES.HARBOR_CHOICE) return;
            const proposal = chooseCpuTurnAction('harborChoice', cpu);
            cpuDo(proposal.action, proposal.data, () => game.resolveHarbor(proposal.data.useBonus));
        },
    },
    {
        name: "pending",
        run(cpu) {
            if (game.phase !== GAME_PHASES.PENDING) return;
            const pendingAction = chooseCpuTurnAction('pending', cpu);
            if (pendingAction) {
                markMainCheckpoint('scheduleCPU-pending-resolution', {
                    action: pendingAction.action,
                    pendingIT: !!game.pendingIT,
                    pendingAction: GameManager.nextPendingActionFor(game),
                });
                cpuDo(pendingAction.action, pendingAction.data, () =>
                    CPUPendingResolution.applyPendingAction(game, pendingAction)
                );
            }
        },
    },
    {
        name: "build",
        run(cpu) {
            if (game.phase !== GAME_PHASES.BUILD) return;
            const actionOnlyBuild = typeof cpu.chooseBuildAction === 'function' &&
                typeof cpu.executeBuildAction === 'function';
            const proposal = actionOnlyBuild ? chooseCpuTurnAction('build', cpu) : null;
            const buildResult = actionOnlyBuild
                ? cpu.executeBuildAction(proposal, game, SHOP_STOCK)
                : cpu.build(game, SHOP_STOCK);
            if (buildResult === false) {
                if (isOnlineGame) return false;
                if (!game.builtThisTurn) {
                    markMainCheckpoint('scheduleCPU-build-failed-pass');
                    game.nextTurn();
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
            if (game.phase !== GAME_PHASES.BUILD || game.pendingIT) return;
            const proposal = chooseCpuTurnAction('nextTurn', cpu);
            cpuDo(proposal.action, proposal.data, () => game.nextTurn());
        },
    },
    {
        name: "resolveIT",
        run(cpu) {
            if (!game.pendingIT) return;
            const proposal = chooseCpuTurnAction('resolveIT', cpu);
            cpuDo(proposal.action, proposal.data, () => game.resolveIT(proposal.data.doSave));
        },
    },
];

function isMainOnlineReconnectInputBlocked() {
    if (typeof isOnlineReconnectInputBlocked === 'function') {
        return isOnlineReconnectInputBlocked();
    }
    return typeof isReconnectingOnline !== 'undefined' && isReconnectingOnline;
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
    const online = typeof isOnlineGame !== 'undefined' && isOnlineGame;
    const transportReason = CpuSchedulerState.blockedReason({
        isReplaying: typeof isReplaying !== 'undefined' && isReplaying,
        isOnlineGame: online,
        isRoomHost: typeof isRoomHost !== 'undefined' ? !!isRoomHost : null,
        isReconnecting: online ? isMainOnlineReconnectInputBlocked() : false,
        onlineActionInFlight: online && mainOnlineActionFlightState().inFlight,
        socketConnected: !online || (typeof socket !== 'undefined' && !!socket && socket.connected !== false),
        hasGame: true,
        isCpuTurn: true,
    });
    if (transportReason) return transportReason;
    const currentPlayerIndex = game ? game.currentPlayerIndex : null;
    return CpuSchedulerState.blockedReason({
        hasGame: !!game,
        hasWinner: !!(game && game.checkWinner && game.checkWinner()),
        isCpuTurn: !!(game && Array.isArray(cpuPlayers) && cpuPlayers[currentPlayerIndex]),
    });
}

function currentCpuTurnSchedulerHealth() {
    const blockedReason = cpuScheduleBlockedReason();
    const currentPlayerIndex = game ? game.currentPlayerIndex : null;
    const schedulerState = cpuSchedulerStateController.snapshot();
    return CpuSchedulerState.buildHealth({
        scheduleToken: schedulerState.scheduleToken,
        pendingToken: schedulerState.pendingToken,
        scheduledUntil: schedulerState.scheduledUntil,
        now: Date.now(),
        isCpuTurn: !!(game && Array.isArray(cpuPlayers) && cpuPlayers[currentPlayerIndex]),
        currentPlayerIndex,
        blockedReason,
    });
}

function scheduleCpuTurn(reason = 'scheduleCPU') {
    markMainCheckpoint('scheduleCPU-enter', {
        reason,
        isReplaying: typeof isReplaying !== 'undefined' ? isReplaying : null,
        isOnlineGame: typeof isOnlineGame !== 'undefined' ? isOnlineGame : null,
        isRoomHost: typeof isRoomHost !== 'undefined' ? isRoomHost : null,
    });
    if (isReplaying) { markMainCheckpoint('scheduleCPU-skip-replaying'); return currentCpuTurnSchedulerHealth(); }
    if (isOnlineGame && !isRoomHost) { markMainCheckpoint('scheduleCPU-skip-non-host'); return currentCpuTurnSchedulerHealth(); }
    if (isOnlineGame && (
        isMainOnlineReconnectInputBlocked() ||
        mainOnlineActionFlightState().inFlight ||
        (typeof socket === 'undefined' || !socket || socket.connected === false)
    )) { markMainCheckpoint('scheduleCPU-skip-online-blocked', { onlineActionInFlight: mainOnlineActionFlightState().inFlight }); return currentCpuTurnSchedulerHealth(); }
    if (!game || game.checkWinner()) { markMainCheckpoint('scheduleCPU-skip-no-game-or-winner'); return currentCpuTurnSchedulerHealth(); }
    const ci = game.currentPlayerIndex;
    if (!cpuPlayers[ci]) {
        markMainCheckpoint('scheduleCPU-skip-human-turn', { currentPlayerIndex: ci });
        if (typeof unlockUiForHumanTurn === 'function') unlockUiForHumanTurn('scheduleCPU-human-turn-unlock');
        return currentCpuTurnSchedulerHealth();
    }
    const cpu = cpuPlayers[ci];
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
            queueCPUStep(token, 500, () => { if (!game.checkWinner()) scheduleCPU(); });
            return;
        }
        const step = CPU_PHASE_HANDLERS[stepIndex++];
        if (!shouldRunCpuPhaseStep(step.name)) {
            markMainCheckpoint('scheduleCPU-step-skip-phase', { step: step.name, phase: game && game.phase || '', pendingIT: !!(game && game.pendingIT) });
            runNextStep();
            return;
        }
        queueCPUStep(token, cpuSpeed, () => {
            if (isReplaying) return;
            if (isOnlineGame && !isRoomHost) return;
            if (isOnlineGame && (
                isMainOnlineReconnectInputBlocked() ||
                mainOnlineActionFlightState().inFlight ||
                (typeof socket === 'undefined' || !socket || socket.connected === false)
            )) return;
            if (!game || game.checkWinner()) return;
            if (!cpuPlayers[game.currentPlayerIndex]) return;
            markMainCheckpoint('scheduleCPU-step-run', { step: step.name });
            let stepResult;
            try {
                stepResult = step.run(cpu);
            } catch (error) {
                console.error('[cpu] phase step failed:', step.name, error);
                markMainCheckpoint('scheduleCPU-step-error', { step: step.name, message: error && error.message || String(error) });
                if (isOnlineGame) return;
                if (step.name === 'build' && game.phase === GAME_PHASES.BUILD && !game.builtThisTurn) {
                    game.nextTurn();
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
    if (!game || game.checkWinner()) return false;
    const online = typeof isOnlineGame !== 'undefined' && isOnlineGame;
    return LocalActionPolicy.canRunHumanAction({
        hasGame: true,
        hasWinner: false,
        expectedPlayerIndex,
        currentPlayerIndex: game.currentPlayerIndex,
        isCpuTurn: !!cpuPlayers[game.currentPlayerIndex],
        isOnlineGame: online,
        myPlayerIndex: typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : null,
        isReconnecting: online ? isMainOnlineReconnectInputBlocked() : false,
        onlineActionInFlight: online && mainOnlineActionFlightState().inFlight,
        socketConnected: !online || (typeof socket !== 'undefined' && !!socket && socket.connected !== false),
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
    playSound('dice');
    if (game.currentPlayer().landmarks[LANDMARK_NAMES.STATION]) {
        // 駅あり：アニメーションなしで即座に選択肢を表示
        runLocalOrSendOnline('rollDice', { forceDice: null, tunaDice: null }, () => game.rollDice(null, null));
    } else {
        // 駅なし：アニメーションあり
        if (delayedHumanActionController.isPending()) return;
        const scheduledPlayerIndex = game.currentPlayerIndex;
        updateDiceDisplay(null, true);
        scheduleDelayedHumanAction(MAIN_ACTIONS.ROLL_DICE, scheduledPlayerIndex, () => {
            if (isOnlineGame) {
                runLocalOrSendOnline('rollDice', { forceDice: null, tunaDice: null }, () => game.rollDice(null, null));
                return;
            }
            const forceDice = rollRandomDie();
            const tunaDice = [rollRandomDie(), rollRandomDie()];
            runLocalOrSendOnline('rollDice', { forceDice, tunaDice }, () => game.rollDice(forceDice, tunaDice));
        });
    }
}

function onSelectDiceCount(useTwo) {
    if (!canRunHumanAction(MAIN_ACTIONS.SELECT_DICE)) return;
    if (delayedHumanActionController.isPending()) return;
    playSound('dice');
    const scheduledPlayerIndex = game.currentPlayerIndex;
    updateDiceDisplay(null, true);
    scheduleDelayedHumanAction(MAIN_ACTIONS.SELECT_DICE, scheduledPlayerIndex, () => {
        if (isOnlineGame) {
            runLocalOrSendOnline('selectDice', { useTwo, diceCount: useTwo ? 2 : 1 },
                () => game.selectDiceCount(useTwo, 1, useTwo ? 1 : 0, null));
            return;
        }
        const d1 = rollRandomDie();
        const d2 = useTwo ? rollRandomDie() : 0;
        const tunaDice = [rollRandomDie(), rollRandomDie()];
        runLocalOrSendOnline('selectDice', { useTwo, diceCount: useTwo ? 2 : 1, d1, d2, tunaDice },
            () => game.selectDiceCount(useTwo, d1, d2, tunaDice));
    });
}

function onReroll() {
    if (!canRunHumanAction(MAIN_ACTIONS.REROLL_DICE)) return;
    if (isOnlineGame) {
        runLocalOrSendOnline('rerollDice', {}, () => game.rerollDice(1, null));
        return;
    }
    const forceDice = rollRandomDie();
    const tunaDice = [rollRandomDie(), rollRandomDie()];
    runLocalOrSendOnline('rerollDice', { forceDice, tunaDice }, () => game.rerollDice(forceDice, tunaDice));
}

function onSkipReroll() {
    if (!canRunHumanAction(MAIN_ACTIONS.SKIP_REROLL)) return;
    runLocalOrSendOnline('skipReroll', {}, () => game.skipReroll());
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
    runLocalOrSendOnline('resolveHarbor', { useBonus }, () => game.resolveHarbor(useBonus));
}

function onResolveTV(i) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_TV)) return;
    runLocalOrSendOnline('resolveTV', { targetIndex: i }, () => game.resolveTV(i));
}

function onResolveBusiness(targetIndex) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_BUSINESS)) return;
    const myCard = parseInt(document.getElementById("myCardSelect").value, 10);
    const theirCard = parseInt(document.getElementById(`theirCardSelect_${targetIndex}`).value, 10);
    runLocalOrSendOnline('resolveBusiness', { myCard, targetIndex, theirCard },
        () => game.resolveBusiness(myCard, targetIndex, theirCard));
}

function onResolveCleaning(cardName) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_CLEANING)) return;
    runLocalOrSendOnline('resolveCleaning', { cardName }, () => game.resolveCleaning(cardName));
}

function onResolveMover(targetIndex) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_MOVER)) return;
    const cardIndex = parseInt(document.getElementById("moverCardSelect").value, 10);
    runLocalOrSendOnline('resolveMover', { cardIndex, targetIndex }, () => game.resolveMover(cardIndex, targetIndex));
}

function onResolveRenovation(landmarkName) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_RENOVATION)) return;
    runLocalOrSendOnline('resolveRenovation', { landmarkName }, () => game.resolveRenovation(landmarkName));
}

function onResolveIT(doSave) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_IT)) return;
    runLocalOrSendOnline('resolveIT', { doSave }, () => game.resolveIT(doSave));
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
    const scheduledPlayerIndex = game.currentPlayerIndex;
    showConfirm(`${card.name}を建設しますか？\n💰 ${card.cost}コイン`, () => {
        traceBuildFlow('card-confirmed', { cardName: name, scheduledPlayerIndex });
        if (!canRunHumanAction(MAIN_ACTIONS.BUILD_CARD, scheduledPlayerIndex)) { traceBuildFlow('card-stale-action', { cardName: name, scheduledPlayerIndex }); return; }
        if (getShopStockCount(SHOP_STOCK, card) <= 0) { traceBuildFlow('card-out-of-stock', { cardName: name }); return; }
        saveUndoState();
        cancelAutoSkip();
        if (isOnlineGame) {
            const sent = sendAction('buildCard', { cardName: name });
            traceBuildFlow('card-online-send', { cardName: name, sent });
            return;
        }
        const shadow = _prepareLocalGameEngineShadow('buildCard', { cardName: name });
        const built = game.buildCard(card);
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
    const scheduledPlayerIndex = game.currentPlayerIndex;
    showConfirm(`${getLandmarkEmoji(name)} ${name}を建設しますか？\n💰 ${cost}コイン`, () => {
        traceBuildFlow('landmark-confirmed', { landmarkName: name, scheduledPlayerIndex });
        if (!canRunHumanAction(MAIN_ACTIONS.BUILD_LANDMARK, scheduledPlayerIndex)) { traceBuildFlow('landmark-stale-action', { landmarkName: name, scheduledPlayerIndex }); return; }
        saveUndoState();
        cancelAutoSkip();
        if (isOnlineGame) {
            const sent = sendAction('buildLandmark', { name });
            traceBuildFlow('landmark-online-send', { landmarkName: name, sent });
            return;
        }
        const shadow = _prepareLocalGameEngineShadow('buildLandmark', { name });
        const built = game.buildLandmark(name);
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
    let msg;
    if (game.builtThisTurn) {
        msg = "建設完了・ターン終了しますか？";
    } else if (game.currentPlayer().landmarks[LANDMARK_NAMES.AIRPORT]) {
        msg = "建設せずにターン終了しますか？\n✈️ 空港効果で+10コイン獲得します";
    } else {
        msg = "建設せずにターン終了しますか？";
    }
    const scheduledPlayerIndex = game.currentPlayerIndex;
    showConfirm(msg, () => {
        markMainCheckpoint('skip-confirmed', { scheduledPlayerIndex });
        if (!canRunHumanAction(MAIN_ACTIONS.NEXT_TURN, scheduledPlayerIndex)) { markMainCheckpoint('skip-stale-action', { scheduledPlayerIndex }); return; }
        cancelAutoSkip();
        GameRuntimeState.runtime.setUndoState(null);
        const result = runLocalOrSendOnline('nextTurn', {}, () => game.nextTurn());
        markMainCheckpoint('skip-nextTurn-returned', { result });
    });
}

// サイコロの目を描画
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
    if (!game || game.checkWinner()) return;
    if (game.phase !== GAME_PHASES.BUILD) { cancelAutoSkip(); return; }
    if (cpuPlayers[game.currentPlayerIndex]) return;
    if (isOnlineGame && game.currentPlayerIndex !== myPlayerIndex) return;
    if (game.pendingRenovation > 0) return;
    if (game.builtThisTurn) { cancelAutoSkip(); return; }

    const availability = AutoSkipPolicy.buildAvailability({
        cards: CARDS,
        current: game.currentPlayer(),
        shopStock: SHOP_STOCK,
        getStockCount: getShopStockCount,
        enabledLandmarks: getEnabledLandmarkSelection(),
        yakushoName: LANDMARK_NAMES.YAKUSHO,
        landmarkCost: name => Player.landmarkCost(name),
    });

    if (!availability.canAffordAny) {
        const scheduledPlayerIndex = game.currentPlayerIndex;
        autoSkipScheduleController.begin();
        autoSkipScheduleController.setTimer(setTimeout(() => {
            autoSkipScheduleController.finish();
            if (
                canRunLocalHumanAction(scheduledPlayerIndex) &&
                game.phase === GAME_PHASES.BUILD &&
                !game.builtThisTurn
            ) {
                runLocalOrSendOnline('nextTurn', {}, () => game.nextTurn());
            }
        }, 1500));
    }
}

// 初期表示
initMainView();
bindDelegatedUiHandlers();
bindCpuResumeScheduler();
