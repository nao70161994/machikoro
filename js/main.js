let game;
const SHOP_STOCK = {};
let selectedCount = 2;
let playerSettings = [];
let cpuPlayers = [];
let cpuSpeed = 1500;

// コインアニメーション用
let prevCoins = null;
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
let autoSkipPending = false;
let autoSkipTimeout = null;
let delayedHumanActionPending = false;
let delayedHumanActionTimeout = null;
let delayedHumanActionToken = 0;
let delayedHumanActionState = null;
let localGameStartPending = false;

// 取り消し
let undoState = null;
let tutorialEnabled = safeMainStorageGet('tutorialEnabled') !== 'false';
let tutorialLevel = safeMainStorageGet('tutorialLevel', 'beginner') || 'beginner';

// CPU進行チェーン制御
let cpuScheduleToken = 0;
let cpuStepScheduledUntil = 0;
let cpuPendingStepToken = null;

function cancelCpuSchedule(reason = 'cpu-schedule-cancel') {
    cpuScheduleToken++;
    cpuStepScheduledUntil = 0;
    cpuPendingStepToken = null;
    try {
        if (typeof markMainCheckpoint === 'function') markMainCheckpoint(reason, { cpuScheduleToken });
    } catch (_) {}
    return cpuScheduleToken;
}

function markCpuStepScheduled(delay, leaseMs = 1500) {
    const wait = Number.isFinite(Number(delay)) ? Math.max(0, Number(delay)) : 0;
    cpuStepScheduledUntil = Date.now() + wait + leaseMs;
    return cpuStepScheduledUntil;
}

function refreshCpuStepScheduleLease(leaseMs = 1500) {
    cpuStepScheduledUntil = Date.now() + leaseMs;
    return cpuStepScheduledUntil;
}

function isCpuStepScheduledNow() {
    return cpuPendingStepToken !== null && cpuPendingStepToken === cpuScheduleToken;
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
    const resolvedOptions = Object.assign({}, options);
    const resolvedDifficulty = difficulty;
    const applyLiveExpertDefaults = () => {
        if (!resolvedOptions.expertPreset) {
            resolvedOptions.expertPreset = "v2simple";
        }
        if (resolvedOptions.expertPreset === "v2simple") {
            if (!resolvedOptions.expertDiceMode) resolvedOptions.expertDiceMode = "strongCrowdThreshold";
            if (!resolvedOptions.expertRerollMode) resolvedOptions.expertRerollMode = "simple";
            if (!resolvedOptions.expertBuildMode) resolvedOptions.expertBuildMode = "ev";
            if (!resolvedOptions.expertInvestMode) resolvedOptions.expertInvestMode = "always";
            if (!resolvedOptions.expertTvMode) resolvedOptions.expertTvMode = "simple";
            if (!resolvedOptions.expertBusinessMode) resolvedOptions.expertBusinessMode = "simple";
            if (!resolvedOptions.expertCleaningMode) resolvedOptions.expertCleaningMode = "simple";
            if (!resolvedOptions.expertHarborMode) resolvedOptions.expertHarborMode = "simple";
            if (!resolvedOptions.expertMoverMode) resolvedOptions.expertMoverMode = "simple";
            if (!resolvedOptions.expertRenovationMode) resolvedOptions.expertRenovationMode = "simple";
            if (!resolvedOptions.expertComboMode) resolvedOptions.expertComboMode = "core";
            if (!Number.isFinite(resolvedOptions.expertBuildTempoWeight)) resolvedOptions.expertBuildTempoWeight = 0.03;
            if (!resolvedOptions.expertAirportSkipMode) resolvedOptions.expertAirportSkipMode = "whenNoLandmark";
        }
    };
    const isLiveExpert = resolvedDifficulty === 'expert' && resolvedOptions.expertPurpose === "live";
    if (isLiveExpert && !resolvedOptions.expertPreset) {
        applyLiveExpertDefaults();
    }
    if (isLiveExpert && resolvedOptions.expertPreset === "v2simple") {
        applyLiveExpertDefaults();
    }
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
        const view = LocalPlayerSettings.startButtonView(state, localGameStartPending);
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
    selectedCount = playerCount;
    playerSettings = snapshotLocalPlayerSettings(playerCount).map((_, index) => Object.assign({}, settings[index] || {}));
    cpuSpeed = parseInt(document.getElementById("cpuSpeed").value);
    saveSettings();
    resetStatsRecorded();
    if (typeof resetOnlineState === 'function') resetOnlineState();
    if (typeof resetUiLocksForGameReset === 'function') resetUiLocksForGameReset('start-game-reset-ui-locks');
    document.getElementById("titleScreen").style.display = "none";
    document.getElementById("gameScreen").style.display = "block";
    init(playerCount);
    if (typeof notifyGameLifecycleStart === 'function') notifyGameLifecycleStart();
}

function startGame() {
    if (localGameStartPending) return;
    const startPlayerCount = selectedCount;
    const startPlayerSettings = snapshotLocalPlayerSettings(startPlayerCount);
    const state = updateLocalRlModelReadinessUi();
    if (state.status === 'loading') {
        showNotice("深層学習AIモデルを読み込んでいます。");
        return;
    }
    const preload = preloadLocalRlModelsForStart(startPlayerCount, startPlayerSettings);
    if (preload && typeof preload.then === "function") {
        localGameStartPending = true;
        updateLocalRlModelReadinessUi();
        showNotice("深層学習AIモデルを読み込んでいます。");
        preload
            .then(() => {
                localGameStartPending = false;
                updateLocalRlModelReadinessUi();
                startGameNow(startPlayerCount, startPlayerSettings);
            })
            .catch(error => {
                localGameStartPending = false;
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
            try { isOnlineGame = false; } catch (_) {}
        }
        if (typeof resetUiLocksForGameReset === 'function') resetUiLocksForGameReset('restart-game-reset-ui-locks');
        if (typeof resetGameLifecycleForRestart === 'function') resetGameLifecycleForRestart('restart-game-lifecycle-reset');
        game = null;
        prevCoins = null;
        winSoundPlayed = false;
        undoState = null;
        resetFullLog();
        document.getElementById("gameScreen").style.display = "none";
        document.getElementById("titleScreen").style.display = "block";
        selectedCount = 2;
        playerSettings = [];
        cpuPlayers = [];
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
    prevCoins = null;
    stopConfetti();
    winSoundPlayed = false;
    cancelAutoSkip();
    undoState = null;
    resetFullLog();
    game = new GameManager(playerCount);
    if (enabledLandmarks.size === 0) enabledLandmarks = new Set(Player.landmarkNames());
    game.enabledLandmarks = new Set(enabledLandmarks);
    for (const card of CARDS) {
        setShopStockCount(SHOP_STOCK, card, enabledCards.has(card.name) ? getInitialCardStock(card, playerCount) : 0);
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
    cpuPlayers = shuffledCpuPlayers;
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

function runLocalOrSendOnline(action, data, fallback) {
    markMainCheckpoint('action-start', { action, isOnlineGame });
    if (isOnlineGame) {
        const sent = sendAction(action, data);
        markMainCheckpoint('action-online-send', { action, sent });
        return sent;
    }
    const result = fallback();
    markMainCheckpoint('action-local-applied', { action, result });
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
    cpuPendingStepToken = token;
    setTimeout(() => {
        if (token !== cpuScheduleToken) return;
        cpuPendingStepToken = null;
        refreshCpuStepScheduleLease();
        fn();
    }, delay);
}

function chooseCpuPendingAction(cpu) {
    return CPUPendingResolution.choosePendingAction(game, cpu, { clearFallback: false });
}

// フェーズごとの CPU ハンドラテーブル。
// 新フェーズを追加するときはここに1エントリ追加するだけでよい。
function shouldRunCpuPhaseStep(stepName) {
    if (!game) return false;
    if (stepName === "roll") return game.phase === GAME_PHASES.ROLL;
    if (stepName === "selectDice") return game.phase === GAME_PHASES.SELECT_DICE;
    if (stepName === "rerollConfirm") return game.phase === GAME_PHASES.REROLL_CONFIRM;
    if (stepName === "harborChoice") return game.phase === GAME_PHASES.HARBOR_CHOICE;
    if (stepName === "pending") return game.phase === GAME_PHASES.PENDING;
    if (stepName === "build") return game.phase === GAME_PHASES.BUILD && !game.pendingIT && !game.builtThisTurn;
    if (stepName === "nextTurn") return game.phase === GAME_PHASES.BUILD && !game.pendingIT;
    if (stepName === "resolveIT") return !!game.pendingIT;
    return true;
}

const CPU_PHASE_HANDLERS = [
    {
        name: "roll",
        run(cpu) {
            if (game.phase !== GAME_PHASES.ROLL) return;
            const forceDice = rollRandomDie();
            const tunaDice = [rollRandomDie(), rollRandomDie()];
            cpuDo('rollDice', { forceDice, tunaDice }, () => game.rollDice(forceDice, tunaDice));
        },
    },
    {
        name: "selectDice",
        run(cpu) {
            if (game.phase !== GAME_PHASES.SELECT_DICE) return;
            const useTwo = cpu.chooseDiceCount(game);
            const d1 = rollRandomDie();
            const d2 = rollRandomDie();
            const tunaDice = [rollRandomDie(), rollRandomDie()];
            cpuDo('selectDice', { useTwo, diceCount: useTwo ? 2 : 1, d1, d2, tunaDice }, () => game.selectDiceCount(useTwo, d1, d2, tunaDice));
        },
    },
    {
        name: "rerollConfirm",
        run(cpu) {
            if (game.phase !== GAME_PHASES.REROLL_CONFIRM) return;
            if (cpu.chooseReroll(game)) {
                const forceDice = rollRandomDie();
                const tunaDice = [rollRandomDie(), rollRandomDie()];
                cpuDo('rerollDice', { forceDice, tunaDice }, () => game.rerollDice(forceDice, tunaDice));
            } else {
                cpuDo('skipReroll', {}, () => game.skipReroll());
            }
        },
    },
    {
        name: "harborChoice",
        run(cpu) {
            if (game.phase !== GAME_PHASES.HARBOR_CHOICE) return;
            const useBonus = cpu.chooseHarbor(game);
            cpuDo('resolveHarbor', { useBonus }, () => game.resolveHarbor(useBonus));
        },
    },
    {
        name: "pending",
        run(cpu) {
            if (game.phase !== GAME_PHASES.PENDING) return;
            const pendingAction = chooseCpuPendingAction(cpu);
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
            const buildResult = cpu.build(game, SHOP_STOCK);
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
            cpuDo('nextTurn', {}, () => game.nextTurn());
        },
    },
    {
        name: "resolveIT",
        run(cpu) {
            if (!game.pendingIT) return;
            const doSave = cpu.chooseITInvest(game);
            cpuDo('resolveIT', { doSave }, () => game.resolveIT(doSave));
        },
    },
];

function isMainOnlineReconnectInputBlocked() {
    if (typeof isOnlineReconnectInputBlocked === 'function') {
        return isOnlineReconnectInputBlocked();
    }
    return typeof isReconnectingOnline !== 'undefined' && isReconnectingOnline;
}

function cpuScheduleBlockedReason() {
    if (typeof isReplaying !== 'undefined' && isReplaying) return 'replaying';
    if (typeof isOnlineGame !== 'undefined' && isOnlineGame && typeof isRoomHost !== 'undefined' && !isRoomHost) return 'non-host';
    if (typeof isOnlineGame !== 'undefined' && isOnlineGame) {
        if (isMainOnlineReconnectInputBlocked()) return 'reconnecting';
        if (typeof onlineActionInFlight !== 'undefined' && onlineActionInFlight) return 'online-in-flight';
        if (typeof socket === 'undefined' || !socket || socket.connected === false) return 'socket-disconnected';
    }
    if (!game) return 'no-game';
    if (game.checkWinner && game.checkWinner()) return 'winner';
    if (!Array.isArray(cpuPlayers) || !cpuPlayers[game.currentPlayerIndex]) return 'human-turn';
    return '';
}

function currentCpuTurnSchedulerHealth() {
    const blockedReason = cpuScheduleBlockedReason();
    const currentPlayerIndex = game ? game.currentPlayerIndex : null;
    return {
        token: cpuScheduleToken,
        scheduledUntil: cpuStepScheduledUntil,
        stepScheduled: !blockedReason && isCpuStepScheduledNow() && Date.now() < cpuStepScheduledUntil,
        isCpuTurn: !!(game && Array.isArray(cpuPlayers) && cpuPlayers[currentPlayerIndex]),
        currentPlayerIndex,
        blockedReason,
    };
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
        (typeof onlineActionInFlight !== 'undefined' && onlineActionInFlight) ||
        (typeof socket === 'undefined' || !socket || socket.connected === false)
    )) { markMainCheckpoint('scheduleCPU-skip-online-blocked', { onlineActionInFlight: typeof onlineActionInFlight !== 'undefined' ? onlineActionInFlight : null }); return currentCpuTurnSchedulerHealth(); }
    if (!game || game.checkWinner()) { markMainCheckpoint('scheduleCPU-skip-no-game-or-winner'); return currentCpuTurnSchedulerHealth(); }
    const ci = game.currentPlayerIndex;
    if (!cpuPlayers[ci]) {
        markMainCheckpoint('scheduleCPU-skip-human-turn', { currentPlayerIndex: ci });
        if (typeof unlockUiForHumanTurn === 'function') unlockUiForHumanTurn('scheduleCPU-human-turn-unlock');
        return currentCpuTurnSchedulerHealth();
    }
    const cpu = cpuPlayers[ci];
    const token = ++cpuScheduleToken;
    let stepIndex = 0;

    function runNextStep() {
        markMainCheckpoint('scheduleCPU-step-enter', { token, stepIndex, currentToken: cpuScheduleToken });
        if (token !== cpuScheduleToken) { markMainCheckpoint('scheduleCPU-step-stale', { token, currentToken: cpuScheduleToken }); return; }
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
                (typeof onlineActionInFlight !== 'undefined' && onlineActionInFlight) ||
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

let cpuResumeSchedulerBound = false;
let pageHiddenAt = 0;

function resumeCpuTurnAfterPageActivation(reason) {
    if (typeof document !== 'undefined' && document.hidden) return;
    const health = currentCpuTurnSchedulerHealth();
    if (!health.isCpuTurn || health.blockedReason) return;
    if (health.stepScheduled && Date.now() < health.scheduledUntil) return;
    cancelCpuSchedule(reason + '-expire-stale');
    scheduleCpuTurn(reason);
}

function runDelayedHumanAction(scheduledToken) {
    const state = delayedHumanActionState;
    if (!state || scheduledToken !== delayedHumanActionToken || scheduledToken !== state.token) return;
    delayedHumanActionPending = false;
    delayedHumanActionTimeout = null;
    delayedHumanActionState = null;
    if (!canRunHumanAction(state.action, state.playerIndex)) return;
    state.run();
}

function scheduleDelayedHumanAction(action, playerIndex, run, delay = 600) {
    delayedHumanActionPending = true;
    const token = ++delayedHumanActionToken;
    delayedHumanActionState = {
        token,
        action,
        playerIndex,
        deadline: Date.now() + delay,
        run,
    };
    delayedHumanActionTimeout = setTimeout(() => runDelayedHumanAction(token), delay);
}

function resumeDelayedHumanActionAfterPageActivation() {
    if (typeof document !== 'undefined' && document.hidden) return;
    const state = delayedHumanActionState;
    if (!delayedHumanActionPending || !state) return;
    if (!canRunHumanAction(state.action, state.playerIndex)) {
        cancelDelayedHumanAction();
        return;
    }
    if (Date.now() >= state.deadline) {
        runDelayedHumanAction(state.token);
        return;
    }
    if (delayedHumanActionTimeout !== null) clearTimeout(delayedHumanActionTimeout);
    const token = ++delayedHumanActionToken;
    state.token = token;
    delayedHumanActionTimeout = setTimeout(
        () => runDelayedHumanAction(token),
        Math.max(0, state.deadline - Date.now())
    );
}

function cpuPageActivationOutcome(before, after, pageHidden) {
    if (pageHidden) return 'page-hidden';
    if (!before || !before.isCpuTurn) return 'not-cpu-turn';
    if (before.blockedReason) return 'blocked:' + before.blockedReason;
    if (before.stepScheduled) return 'already-scheduled';
    if (after && after.stepScheduled) return 'rescheduled';
    return 'not-rescheduled';
}

function pageHiddenDurationMs(now) {
    if (!Number.isFinite(pageHiddenAt) || pageHiddenAt <= 0) return null;
    return Math.max(0, now - pageHiddenAt);
}

function resumeTurnAfterPageActivation(reason) {
    const activationAt = Date.now();
    const pageHidden = typeof document !== 'undefined' && !!document.hidden;
    if (pageHidden && !pageHiddenAt) pageHiddenAt = activationAt;
    const hiddenForMs = pageHiddenDurationMs(activationAt);
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
    if (!pageHidden) pageHiddenAt = 0;
}

function bindCpuResumeScheduler() {
    if (cpuResumeSchedulerBound) return;
    cpuResumeSchedulerBound = true;
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => resumeTurnAfterPageActivation('visibility-resume'));
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('pageshow', () => resumeTurnAfterPageActivation('pageshow-resume'));
    }
}

function canRunLocalHumanAction(expectedPlayerIndex = null) {
    if (!game || game.checkWinner()) return false;
    if (expectedPlayerIndex !== null && game.currentPlayerIndex !== expectedPlayerIndex) return false;
    if (cpuPlayers[game.currentPlayerIndex]) return false;
    if (isOnlineGame && game.currentPlayerIndex !== myPlayerIndex) return false;
    if (isOnlineGame && (
        isMainOnlineReconnectInputBlocked() ||
        (typeof onlineActionInFlight !== 'undefined' && onlineActionInFlight) ||
        (typeof socket === 'undefined' || !socket || socket.connected === false)
    )) return false;
    return true;
}

function canRunHumanAction(action, expectedPlayerIndex = null) {
    return canRunLocalHumanAction(expectedPlayerIndex) && canRunAction(action);
}

function cancelDelayedHumanAction() {
    delayedHumanActionToken++;
    delayedHumanActionPending = false;
    delayedHumanActionState = null;
    if (delayedHumanActionTimeout !== null) {
        clearTimeout(delayedHumanActionTimeout);
        delayedHumanActionTimeout = null;
    }
}

function onRoll() {
    if (!canRunHumanAction(MAIN_ACTIONS.ROLL_DICE)) return;
    playSound('dice');
    if (game.currentPlayer().landmarks[LANDMARK_NAMES.STATION]) {
        // 駅あり：アニメーションなしで即座に選択肢を表示
        runLocalOrSendOnline('rollDice', { forceDice: null, tunaDice: null }, () => game.rollDice(null, null));
    } else {
        // 駅なし：アニメーションあり
        if (delayedHumanActionPending) return;
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
    if (delayedHumanActionPending) return;
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

let delegatedUiHandlersBound = false;
let staticUiHandlersBound = false;

function actionButtonFromEvent(event) {
    const target = event && event.target;
    if (!target) return null;
    if (typeof target.closest === 'function') return target.closest('[data-action]');
    return target.dataset && target.dataset.action ? target : null;
}

function uiActionElementFromEvent(event, attributeName) {
    const target = event && event.target;
    if (!target) return null;
    const selector = '[' + attributeName + ']';
    if (typeof target.closest === 'function') return target.closest(selector);
    return target.dataset && target.dataset[attributeName.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())] ? target : null;
}

function reloadCurrentPage() {
    if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
        window.location.reload();
    } else if (typeof location !== 'undefined' && typeof location.reload === 'function') {
        location.reload();
    }
}

function handleStaticUiClick(event) {
    const element = uiActionElementFromEvent(event, 'data-ui-action');
    if (!element || element.disabled) return;
    const action = element.dataset.uiAction;
    if (!action) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (action === 'showRules') showRules();
    else if (action === 'showCardSelect') showCardSelect();
    else if (action === 'reconnectOnline') reconnectOnline();
    else if (action === 'deleteOnlineSession') deleteOnlineSession();
    else if (action === 'switchTab') switchTab(element.dataset.tab);
    else if (action === 'changeCount') changeCount(parseInt(element.dataset.delta, 10));
    else if (action === 'startGame') startGame();
    else if (action === 'resumeGame') resumeGame();
    else if (action === 'deleteSavedGame') deleteSavedGame();
    else if (action === 'switchOnlineTab') switchOnlineTab(element.dataset.onlineTab);
    else if (action === 'changeOnlineCount') changeOnlineCount(parseInt(element.dataset.delta, 10));
    else if (action === 'showCreateRoom') showCreateRoom();
    else if (action === 'joinRoom') joinRoom();
    else if (action === 'toggleTutorial') toggleTutorial();
    else if (action === 'cycleTutorialLevel') cycleTutorialLevel();
    else if (action === 'onRoll') onRoll();
    else if (action === 'onReroll') onReroll();
    else if (action === 'onSkip') onSkip();
    else if (action === 'toggleLog') toggleLog();
    else if (action === 'restartGame') restartGame();
    else if (action === 'closeRules') closeRules();
    else if (action === 'closeCardDetail') closeCardDetail();
    else if (action === 'hideNotice') hideNotice();
    else if (action === 'reloadPage') reloadCurrentPage();
    else if (action === 'crashResume') crashResume();
    else if (action === 'pwaApplyUpdate') {
        if (typeof pwaApplyUpdate === 'function') pwaApplyUpdate();
        else reloadCurrentPage();
    }
    else if (action === 'hidePwaUpdateBanner') {
        if (typeof shouldKeepPwaUpdateBannerVisible === 'function' && shouldKeepPwaUpdateBannerVisible()) return;
        const banner = document.getElementById('pwaUpdateBanner');
        if (banner) banner.style.display = 'none';
        if (typeof maybeShowPwaInstallBanner === 'function') maybeShowPwaInstallBanner();
        else {
            const installBanner = document.getElementById('pwaInstallBanner');
            const stillVisible = installBanner && installBanner.style.display === 'block';
            if (!stillVisible && document.body && document.body.classList) document.body.classList.remove('pwa-banner-open');
        }
    }
    else if (action === 'pwaInstallPrompt') pwaInstallPrompt();
    else if (action === 'pwaInstallDismiss') pwaInstallDismiss();
}

function handleStaticUiInput(event) {
    const element = uiActionElementFromEvent(event, 'data-ui-input');
    if (!element) return;
    if (element.dataset.uiInput === 'cpuSpeed') {
        const label = document.getElementById('speedLabel');
        if (label) label.textContent = formatCpuSpeedLabel(element.value);
    } else if (element.dataset.uiInput === 'onlineCpuSpeed') {
        const label = document.getElementById('onlineSpeedLabel');
        if (label) label.textContent = formatCpuSpeedLabel(element.value);
    } else if (element.dataset.uiInput === 'localPlayerName') {
        onChangePlayerName(parseInt(element.dataset.playerIndex, 10), element.value);
    }
}

function handleStaticUiChange(event) {
    const element = uiActionElementFromEvent(event, 'data-ui-change');
    if (!element) return;
    if (element.dataset.uiChange === 'toggleTutorialEnabled') onToggleTutorial(element.checked);
    else if (element.dataset.uiChange === 'tutorialLevel') onChangeTutorialLevel(element.value);
    else if (element.dataset.uiChange === 'localPlayerType') onChangePlayerType(parseInt(element.dataset.playerIndex, 10), element.value);
    else if (element.dataset.uiChange === 'onlinePlayerType') onChangeOnlinePlayerType(parseInt(element.dataset.playerIndex, 10), element.value);
}

function handleStaticUiKeydown(event) {
    if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
    const element = uiActionElementFromEvent(event, 'data-ui-action');
    if (!element || element.disabled || element.getAttribute('role') !== 'button') return;
    handleStaticUiClick(event);
}

function bindStaticUiHandlers() {
    if (staticUiHandlersBound) return;
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    document.addEventListener('click', handleStaticUiClick);
    document.addEventListener('input', handleStaticUiInput);
    document.addEventListener('change', handleStaticUiChange);
    document.addEventListener('keydown', handleStaticUiKeydown);
    staticUiHandlersBound = true;
}

function handleDiceChoiceClick(event) {
    const button = actionButtonFromEvent(event);
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (!action) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (action === 'selectDiceCount') onSelectDiceCount(button.dataset.useTwo === 'true');
    else if (action === 'rerollDice') onReroll();
    else if (action === 'skipReroll') onSkipReroll();
    else if (action === 'resolveHarbor') onResolveHarbor(button.dataset.useBonus === 'true');
}

function handlePendingActionClick(event) {
    const button = actionButtonFromEvent(event);
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (!action) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (action === 'selectBusinessCard') { bcSelectCard(button, button.dataset.inputId); return; }
    if (action === 'resolveTV') onResolveTV(parseInt(button.dataset.targetIndex, 10));
    if (action === 'resolveBusiness') onResolveBusiness(parseInt(button.dataset.targetIndex, 10));
    if (action === 'resolveCleaning') onResolveCleaning(button.dataset.cardName);
    if (action === 'resolveMover') onResolveMover(parseInt(button.dataset.targetIndex, 10));
    if (action === 'resolveRenovation') onResolveRenovation(button.dataset.landmarkName);
    if (action === 'resolveIT') onResolveIT(button.dataset.doSave === 'true');
}

function handleBuildMenuClick(event) {
    const button = actionButtonFromEvent(event);
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (!action) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (action === 'buildCard') onBuildCard(button.dataset.cardName);
    if (action === 'buildLandmark') onBuildLandmark(button.dataset.landmarkName);
    if (action === 'showCardDetail') showCardDetail(button.dataset.cardName);
    if (action === 'showLandmarkDetail') showCardDetail(button.dataset.landmarkName, true);
    if (action === 'setCardFilter') setCardFilter(button.dataset.cardFilter || '');
    if (action === 'undoBuild') doUndo();
}

function handlePlayerPanelClick(event) {
    const button = actionButtonFromEvent(event);
    if (!button || button.disabled) return;
    if (button.dataset.action !== 'showCardDetail') return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    showCardDetail(button.dataset.cardName);
}

function bindDelegatedUiHandlers() {
    if (delegatedUiHandlersBound) return;
    const diceChoose = document.getElementById('diceChoose');
    const pendingMenu = document.getElementById('pendingMenu');
    const buildMenu = document.getElementById('buildMenu');
    const players = document.getElementById('players');
    if (diceChoose && typeof diceChoose.addEventListener === 'function') diceChoose.addEventListener('click', handleDiceChoiceClick);
    if (pendingMenu && typeof pendingMenu.addEventListener === 'function') pendingMenu.addEventListener('click', handlePendingActionClick);
    if (buildMenu && typeof buildMenu.addEventListener === 'function') buildMenu.addEventListener('click', handleBuildMenuClick);
    if (players && typeof players.addEventListener === 'function') players.addEventListener('click', handlePlayerPanelClick);
    bindStaticUiHandlers();
    delegatedUiHandlersBound = true;
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
        if (game.buildCard(card)) {
            traceBuildFlow('card-applied', { cardName: name });
            decrementShopStock(SHOP_STOCK, card);
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
        if (game.buildLandmark(name)) {
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
        undoState = null;
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
    const canvas = document.getElementById("cityCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = window.innerWidth > 480 ? 480 : window.innerWidth;
    const H = 220;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = "100%";
    canvas.style.height = H + "px";

    ctx.clearRect(0, 0, W, H);

    // 夕焼けグラデーション空
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0,   "#0a0a2a");
    skyGrad.addColorStop(0.3, "#1a1040");
    skyGrad.addColorStop(0.6, "#3a1020");
    skyGrad.addColorStop(0.8, "#6a2010");
    skyGrad.addColorStop(1,   "#2a0a00");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // 月
    const moonX = W * 0.8;
    const moonY = H * 0.2;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 35);
    moonGlow.addColorStop(0,   "rgba(255,240,180,0.3)");
    moonGlow.addColorStop(1,   "rgba(255,240,180,0)");
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(moonX, moonY, 12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,240,200,0.9)";
    ctx.fill();

    // 星
    for (let i = 0; i < 40; i++) {
        const sx = Math.random() * W;
        const sy = Math.random() * H * 0.6;
        const sr = Math.random() * 1.2;
        const alpha = 0.3 + Math.random() * 0.7;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
    }

    // 雲（薄く）
    for (let i = 0; i < 3; i++) {
        const cx = Math.random() * W;
        const cy = H * 0.1 + Math.random() * H * 0.3;
        const cw = 40 + Math.random() * 60;
        const cloudGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw);
        cloudGrad.addColorStop(0,   "rgba(100,60,80,0.15)");
        cloudGrad.addColorStop(1,   "rgba(100,60,80,0)");
        ctx.fillStyle = cloudGrad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, cw, cw * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ビル（遠景・薄い）
    const farBuildings = [
        {x:0, w:30, h:80}, {x:25, w:20, h:100}, {x:40, w:35, h:70},
        {x:70, w:25, h:90}, {x:90, w:40, h:110}, {x:125, w:20, h:75},
        {x:140, w:30, h:95}, {x:165, w:45, h:120}, {x:205, w:25, h:80},
        {x:225, w:35, h:105}, {x:255, w:20, h:70}, {x:270, w:40, h:115},
        {x:305, w:30, h:85}, {x:330, w:25, h:100}, {x:350, w:45, h:130},
        {x:390, w:20, h:75}, {x:405, w:35, h:95}, {x:435, w:30, h:110},
        {x:460, w:25, h:80},
    ];

    farBuildings.forEach(b => {
        const bx = (b.x / 500) * W;
        const bw = (b.w / 500) * W;
        ctx.fillStyle = "rgba(20,10,30,0.6)";
        ctx.fillRect(bx, H - b.h, bw, b.h);
        // 窓
        const cols = Math.floor(bw / 6);
        const rows = Math.floor(b.h / 10);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (Math.random() > 0.4) {
                    const lit = Math.random();
                    if (lit > 0.5) {
                        ctx.fillStyle = lit > 0.8
                            ? `rgba(255,220,100,${0.2 + Math.random() * 0.3})`
                            : `rgba(150,200,255,${0.15 + Math.random() * 0.2})`;
                        ctx.fillRect(bx + c * 6 + 1, H - b.h + r * 10 + 2, 3, 5);
                    }
                }
            }
        }
    });

    // ビル（近景・濃い）
    const nearBuildings = [
        {x:0,   w:50,  h:150},
        {x:45,  w:65,  h:180},
        {x:105, w:40,  h:130},
        {x:140, w:60,  h:170},
        {x:195, w:35,  h:120},
        {x:225, w:70,  h:160},
        {x:290, w:45,  h:140},
        {x:330, w:60,  h:190},
        {x:385, w:40,  h:125},
        {x:420, w:55,  h:165},
        {x:470, w:35,  h:135},
    ];

    nearBuildings.forEach(b => {
        const bx = (b.x / 510) * W;
        const bw = (b.w / 510) * W;

        // ビル本体グラデーション
        const bGrad = ctx.createLinearGradient(bx, H - b.h, bx + bw, H);
        bGrad.addColorStop(0, "#0d0820");
        bGrad.addColorStop(1, "#180d30");
        ctx.fillStyle = bGrad;
        ctx.fillRect(bx, H - b.h, bw, b.h);

        // 輪郭
        ctx.strokeStyle = "rgba(80,50,120,0.4)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(bx, H - b.h, bw, b.h);

        // アンテナ
        if (Math.random() > 0.6) {
            ctx.strokeStyle = "rgba(150,100,200,0.5)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx + bw / 2, H - b.h);
            ctx.lineTo(bx + bw / 2, H - b.h - 15);
            ctx.stroke();
            // アンテナ先端の赤ランプ
            ctx.beginPath();
            ctx.arc(bx + bw / 2, H - b.h - 15, 2, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,50,50,0.8)";
            ctx.fill();
        }

        // 窓
        const cols = Math.floor(bw / 8);
        const rows = Math.floor(b.h / 12);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (Math.random() > 0.3) {
                    const lit = Math.random();
                    if (lit > 0.25) {
                        const alpha = 0.4 + Math.random() * 0.5;
                        ctx.fillStyle = lit > 0.7
                            ? `rgba(255,230,100,${alpha})`
                            : `rgba(100,180,255,${alpha * 0.7})`;
                        ctx.fillRect(bx + c * 8 + 2, H - b.h + r * 12 + 3, 4, 6);
                    }
                }
            }
        }
    });

    // 地面・道路
    const groundGrad = ctx.createLinearGradient(0, H - 15, 0, H);
    groundGrad.addColorStop(0, "#1a0a30");
    groundGrad.addColorStop(1, "#0a0518");
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, H - 15, W, 15);

    // 道路の反射
    ctx.fillStyle = "rgba(255,150,50,0.1)";
    ctx.fillRect(0, H - 5, W, 5);

    // 水面反射効果
    nearBuildings.forEach(b => {
        const bx = (b.x / 510) * W;
        const bw = (b.w / 510) * W;
        const reflGrad = ctx.createLinearGradient(0, H - 15, 0, H - 5);
        reflGrad.addColorStop(0, "rgba(255,200,50,0.05)");
        reflGrad.addColorStop(1, "rgba(255,200,50,0)");
        ctx.fillStyle = reflGrad;
        ctx.fillRect(bx, H - 15, bw, 10);
    });
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
    if (autoSkipTimeout) { clearTimeout(autoSkipTimeout); autoSkipTimeout = null; }
    autoSkipPending = false;
}

function checkAutoSkip() {
    if (autoSkipPending) return;
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
        enabledLandmarks,
        yakushoName: LANDMARK_NAMES.YAKUSHO,
        landmarkCost: name => Player.landmarkCost(name),
    });

    if (!availability.canAffordAny) {
        const scheduledPlayerIndex = game.currentPlayerIndex;
        autoSkipPending = true;
        autoSkipTimeout = setTimeout(() => {
            autoSkipPending = false;
            autoSkipTimeout = null;
            if (
                canRunLocalHumanAction(scheduledPlayerIndex) &&
                game.phase === GAME_PHASES.BUILD &&
                !game.builtThisTurn
            ) {
                runLocalOrSendOnline('nextTurn', {}, () => game.nextTurn());
            }
        }, 1500);
    }
}

// 初期表示
initMainView();
bindDelegatedUiHandlers();
bindCpuResumeScheduler();
