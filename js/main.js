const SHOP_STOCK = {};

// live game / CPU / Undo / coin animation state は GameRuntimeState が所有する。
const mainClientStorageFacade = ClientStorage.createFacade();
const cpuTournamentHistoryRepository = CpuTournament.createHistoryRepository({
    storage: mainClientStorageFacade,
});
let currentCpuTournamentView = null;

function safeMainStorageGet(key, fallback = null) {
    return mainClientStorageFacade.get(key, fallback);
}

function safeMainStorageRemove(key) {
    mainClientStorageFacade.remove(key);
}

function safeMainStorageSet(key, value) {
    return mainClientStorageFacade.set(key, value);
}

function diagnosticContext(gameState, onlineState) {
    if (onlineState.isReconnectingOnline) return 'reconnecting';
    if (onlineState.isOnlineGame) return 'online';
    if (onlineState.myRoomId) return 'lobby';
    if (gameState.game) return 'local';
    return 'title';
}

async function readDiagnosticServiceWorkerState() {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
        return Object.freeze({ supported: false, controlled: false, waiting: false });
    }
    let registration = null;
    try {
        if (typeof navigator.serviceWorker.getRegistration === 'function') {
            registration = await navigator.serviceWorker.getRegistration();
        }
    } catch (_) {}
    return Object.freeze({
        supported: true,
        controlled: !!navigator.serviceWorker.controller,
        waiting: !!(registration && registration.waiting),
    });
}

async function readDiagnosticServerVersion() {
    if (typeof fetch !== 'function') return '';
    let controller = null;
    let timer = null;
    try {
        if (typeof AbortController === 'function') {
            controller = new AbortController();
            timer = setTimeout(() => controller.abort(), 2500);
        }
        const response = await fetch('/api/version', Object.assign({ cache: 'no-store' },
            controller ? { signal: controller.signal } : {}));
        if (!response || !response.ok) return '';
        const payload = await response.json();
        return payload && typeof payload.hash === 'string' ? payload.hash : '';
    } catch (_) {
        return '';
    } finally {
        if (timer !== null) clearTimeout(timer);
    }
}

async function collectAppDiagnostics() {
    const gameState = mainGameRuntimeSnapshot();
    const onlineState = mainOnlineRuntimeSnapshot();
    const [serviceWorker, serverVersion] = await Promise.all([
        readDiagnosticServiceWorkerState(),
        readDiagnosticServerVersion(),
    ]);
    const repository = typeof getLocalSaveRepository === 'function'
        ? getLocalSaveRepository() : null;
    const onlineResume = typeof readOnlineSession === 'function' ? readOnlineSession() : null;
    const standalone = typeof window !== 'undefined' &&
        ((typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
            (typeof navigator !== 'undefined' && navigator.standalone === true));
    return AppDiagnostics.buildSnapshot({
        appVersion: typeof window !== 'undefined' ? window.MACHIKORO_CLIENT_VERSION : '',
        serverVersion,
        serviceWorkerSupported: serviceWorker.supported,
        serviceWorkerControlled: serviceWorker.controlled,
        serviceWorkerWaiting: serviceWorker.waiting,
        networkOnline: typeof navigator === 'undefined' || navigator.onLine !== false,
        socketConnected: !!(onlineState.socket && onlineState.socket.connected),
        context: diagnosticContext(gameState, onlineState),
        standalone,
        localSaveExists: !!(repository && repository.exists()),
        localHistoryCount: repository ? repository.readHistory().length : 0,
        onlineResumeExists: !!onlineResume,
        generatedAt: new Date().toISOString(),
    });
}

async function refreshAppDiagnostics() {
    const output = document.getElementById('appDiagnosticsOutput');
    if (!output) return null;
    output.textContent = '診断情報を収集中です...';
    const snapshot = await collectAppDiagnostics();
    output.innerHTML = AppDiagnostics.buildHtml(snapshot);
    return snapshot;
}

async function copyAppDiagnostics() {
    const snapshot = await refreshAppDiagnostics();
    const text = snapshot && AppDiagnostics.formatText(snapshot);
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard ||
            typeof navigator.clipboard.writeText !== 'function') {
        showNotice('この端末では診断情報をコピーできませんでした');
        return false;
    }
    try {
        await navigator.clipboard.writeText(text);
        showNotice('診断情報をコピーしました');
        return true;
    } catch (_) {
        showNotice('この端末では診断情報をコピーできませんでした');
        return false;
    }
}

function loadSetupPresetRecords() {
    return GameSetupPresets.parse(safeMainStorageGet(GameSetupPresets.STORAGE_KEY, '[]'));
}

function renderSetupPresetList() {
    const target = document.getElementById('setupPresetList');
    if (target) target.innerHTML = GameSetupPresets.buildListHtml(loadSetupPresetRecords());
}

function saveSetupPreset() {
    const input = document.getElementById('setupPresetName');
    const name = input && input.value ? input.value.trim() : '';
    if (!name) {
        showNotice('プリセット名を入力してください');
        if (input && typeof input.focus === 'function') input.focus();
        return false;
    }
    const setup = GameSetupState.runtime.snapshot();
    const selection = GameSelectionState.runtime.snapshot();
    const records = GameSetupPresets.upsert(loadSetupPresetRecords(), {
        name,
        selectedCount: setup.selectedCount,
        playerSettings: setup.playerSettings,
        cpuSpeed: Number(document.getElementById('cpuSpeed')?.value || setup.cpuSpeed),
        enabledCards: selection.enabledCards,
        enabledLandmarks: selection.enabledLandmarks,
        marketRule: selection.marketRule,
    });
    if (!safeMainStorageSet(GameSetupPresets.STORAGE_KEY, JSON.stringify(records))) {
        showNotice('プリセットを保存できませんでした');
        return false;
    }
    if (input) input.value = '';
    renderSetupPresetList();
    showNotice(`「${name.slice(0, 24)}」を保存しました`);
    return true;
}

function applySetupPreset(presetId) {
    const preset = loadSetupPresetRecords().find(item => item.id === presetId);
    if (!preset) return false;
    GameSetupState.runtime.replace({
        selectedCount: preset.selectedCount,
        playerSettings: preset.playerSettings,
        cpuSpeed: preset.cpuSpeed,
    });
    replaceEnabledCardSelection(preset.enabledCards);
    replaceEnabledLandmarkSelection(preset.enabledLandmarks);
    replaceMarketRuleSelection(preset.marketRule);
    if (typeof syncCardSelectStateFromRuntime === 'function') syncCardSelectStateFromRuntime();
    UiPlayerCount.applyView(
        document.getElementById('playerCount'),
        UiPlayerCount.buildView(preset.selectedCount)
    );
    const speed = document.getElementById('cpuSpeed');
    if (speed) {
        speed.value = String(preset.cpuSpeed);
        UiRangeControl.applyValueView(
            speed,
            document.getElementById('speedLabel'),
            UiRangeControl.buildValueView(preset.cpuSpeed, formatCpuSpeedLabel)
        );
    }
    renderPlayerSettings();
    saveSettings();
    showNotice(`「${preset.name}」を適用しました`);
    return true;
}

function deleteSetupPreset(presetId) {
    const records = loadSetupPresetRecords();
    const preset = records.find(item => item.id === presetId);
    if (!preset) return false;
    return showConfirm(`プリセット「${preset.name}」を削除しますか？`, () => {
        safeMainStorageSet(GameSetupPresets.STORAGE_KEY,
            JSON.stringify(GameSetupPresets.remove(records, presetId)));
        renderSetupPresetList();
    });
}

function setAppBackupStatus(message) {
    const status = document.getElementById('appBackupStatus');
    if (status) status.textContent = message || '';
}

function validateImportedBackup(envelope) {
    if (!envelope || !envelope.data) return false;
    try {
        if (envelope.data.savedGame && !isValidSavedGameState(JSON.parse(envelope.data.savedGame))) return false;
        if (envelope.data.savedGameV1) {
            const decoded = GameSnapshot.readLocalSaveState(JSON.parse(envelope.data.savedGameV1));
            if (!decoded.ok || !isValidSavedGameState(decoded.state)) return false;
        }
        if (envelope.data.savedGameHistoryV1) {
            const history = JSON.parse(envelope.data.savedGameHistoryV1);
            if (!Array.isArray(history) || history.some(entry => !entry ||
                    !isValidSavedGameState(entry.state))) return false;
        }
    } catch (_) { return false; }
    return true;
}

function exportAppBackup() {
    const envelope = AppBackup.buildEnvelope({
        data: AppBackup.collect(key => safeMainStorageGet(key, null)),
        createdAt: new Date().toISOString(),
        clientVersion: typeof window !== 'undefined' ? window.MACHIKORO_CLIENT_VERSION : '',
    });
    const date = new Date().toISOString().slice(0, 10);
    const downloaded = downloadCpuTournamentFile(
        `machikoro-backup-${date}.json`,
        JSON.stringify(envelope, null, 2),
        'application/json'
    );
    setAppBackupStatus(downloaded ? 'バックアップを書き出しました。' : '書き出しに失敗しました。');
    return downloaded;
}

function selectAppBackupFile() {
    const input = document.getElementById('appBackupFile');
    if (!input || typeof input.click !== 'function') return false;
    input.click();
    return true;
}

async function importAppBackup(file) {
    const input = document.getElementById('appBackupFile');
    if (!file || typeof file.text !== 'function') return false;
    let envelope = null;
    try { envelope = AppBackup.parseEnvelope(await file.text()); } catch (_) {}
    if (!envelope || !validateImportedBackup(envelope)) {
        setAppBackupStatus('このバックアップは壊れているか、対応していません。');
        if (input) input.value = '';
        return false;
    }
    showConfirm('現在のローカル保存・設定・統計をバックアップ内容で置き換えますか？', () => {
        const before = Object.fromEntries(AppBackup.ALLOWED_KEYS.map(key =>
            [key, safeMainStorageGet(key, null)]));
        for (const key of AppBackup.ALLOWED_KEYS) safeMainStorageRemove(key);
        const applied = AppBackup.apply(envelope, (key, value) => safeMainStorageSet(key, value));
        if (!applied) {
            for (const [key, value] of Object.entries(before)) {
                if (typeof value === 'string') safeMainStorageSet(key, value);
                else safeMainStorageRemove(key);
            }
            setAppBackupStatus('容量不足などにより復元できませんでした。');
            return;
        }
        setAppBackupStatus('復元しました。画面を再読み込みします。');
        setTimeout(() => {
            if (typeof window !== 'undefined' && window.location &&
                    typeof window.location.reload === 'function') window.location.reload();
        }, 100);
    }, () => { if (input) input.value = ''; });
    return true;
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
    getPendingAction: game => {
        const pending = CPUPendingResolution.pendingActionDescriptors(game)[0];
        return pending && pending.action || '';
    },
    getPhaseHandlers: () => CPU_PHASE_HANDLERS,
    isReconnectBlocked: () => isMainOnlineReconnectInputBlocked(),
    now: () => Date.now(),
    policy: CpuSchedulerState,
    recoverBuildError({ game: failedGame }) {
        if (!failedGame || mainGameRuntimeSnapshot().game !== failedGame ||
                failedGame.phase !== GAME_PHASES.BUILD || failedGame.builtThisTurn) return false;
        return cpuDo(MAIN_ACTIONS.NEXT_TURN, {}, () => failedGame.nextTurn()) === true;
    },
    reportSlowStep(details) {
        if (typeof reportClientError !== 'function') return false;
        return reportClientError({
            source: 'cpu-step-slow',
            message: [
                'slow CPU step',
                details.step || '-',
                details.difficulty || '-',
                details.phase || '-',
                details.pendingAction || '-',
            ].join(' '),
            stack: 'CPU_STEP_SLOW ' + JSON.stringify(details),
        });
    },
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    slowStepThresholdMs: 1000,
    unlockHumanTurn(reason) {
        if (typeof unlockUiForHumanTurn === 'function') unlockUiForHumanTurn(reason);
    },
});
const cpuSchedulerStateController = cpuTurnSchedulerRuntime.controller;
const gameActivityStatusController = UiGameStatusView.createActivityStatusController();
const watchdogActivityStatusController = UiGameStatusView.createWatchdogActivityController();
let connectionObservationFloor = 0;
let latestCpuActionExplanation = Object.freeze({ playerIndex: -1, turnCount: -1, text: '' });

function invalidateCpuScheduleChain() { return cpuTurnSchedulerRuntime.invalidate(); }
function cancelCpuSchedule(reason = 'cpu-schedule-cancel') { return cpuTurnSchedulerRuntime.cancel(reason); }
function markCpuStepScheduled(delay, leaseMs = 1500) { return cpuTurnSchedulerRuntime.markScheduled(delay, leaseMs); }
function refreshCpuStepScheduleLease(leaseMs = 1500) { return cpuTurnSchedulerRuntime.refreshLease(leaseMs); }
function isCpuStepScheduledNow() { return cpuTurnSchedulerRuntime.isStepScheduled(); }

function updateGameActivityStatus(now = Date.now()) {
    const documentRef = typeof document !== 'undefined' ? document : null;
    const container = documentRef && documentRef.getElementById
        ? documentRef.getElementById('gameActivityStatus')
        : null;
    if (!container) return null;
    if (documentRef.hidden) {
        gameActivityStatusController.reset();
        watchdogActivityStatusController.reset();
        const hiddenActivity = Object.freeze({
            visible: false,
            kind: 'ready',
            label: '',
            announceLabel: '',
            detail: '',
            elapsedText: '',
        });
        UiGameStatusEffects.applyActivityStatus(hiddenActivity, { container });
        UiGameStatusEffects.applyConnectionQuality(hiddenActivity, documentRef.getElementById('gameConnectionQuality'));
        return hiddenActivity;
    }
    const gameState = mainGameRuntimeSnapshot();
    const onlineState = mainOnlineRuntimeSnapshot();
    const currentGame = gameState.game;
    const actionFlight = mainOnlineActionFlightState();
    const navigatorRef = typeof navigator !== 'undefined' ? navigator : null;
    const connectionFacts = {
        isOnlineGame: onlineState.isOnlineGame,
        isReconnecting: onlineState.isReconnectingOnline,
        isReplaying: onlineState.isReplaying,
        socketConnected: !onlineState.isOnlineGame || !!onlineState.socket && onlineState.socket.connected !== false,
        actionInFlight: actionFlight.inFlight,
        actionStartedAt: actionFlight.startedAt,
        hasPendingOutboundAction: actionFlight.hasPendingOutboundAction === true,
        minimumObservedAt: connectionObservationFloor,
        browserOnline: !navigatorRef || navigatorRef.onLine !== false,
    };
    const connectionView = UiGameStatusView.buildConnectionQualityView(connectionFacts, now);
    UiGameStatusEffects.applyConnectionQuality(
        connectionView,
        documentRef.getElementById('gameConnectionQuality')
    );
    const view = UiGameStatusView.buildActivityStatusView({
        hasGame: !!currentGame,
        hasWinner: !!(currentGame && currentGame.checkWinner && currentGame.checkWinner()),
        phase: currentGame && currentGame.phase || '',
        phases: GAME_PHASES,
        pendingPhase: GAME_PHASES.PENDING,
        currentPlayerIndex: currentGame ? currentGame.currentPlayerIndex : -1,
        currentName: currentGame && currentGame.currentPlayer ? currentGame.currentPlayer().name : '',
        isCpuTurn: !!(currentGame && gameState.cpuPlayers[currentGame.currentPlayerIndex]),
        cpuHealth: currentCpuTurnSchedulerHealth(),
        cpuActionExplanation: currentGame &&
            latestCpuActionExplanation.playerIndex === currentGame.currentPlayerIndex &&
            latestCpuActionExplanation.turnCount === currentGame.turnCount
            ? latestCpuActionExplanation.text
            : '',
        isOnlineGame: onlineState.isOnlineGame,
        myPlayerIndex: onlineState.myPlayerIndex,
        ...connectionFacts,
    });
    const baseActivity = gameActivityStatusController.transition(view, now);
    const activity = watchdogActivityStatusController.project(baseActivity, now);
    UiGameStatusEffects.applyActivityStatus(activity, {
        container,
        label: documentRef.getElementById('gameActivityStatusLabel'),
        elapsed: documentRef.getElementById('gameActivityStatusElapsed'),
        detail: documentRef.getElementById('gameActivityStatusDetail'),
    });
    const connectivityPanel = documentRef.getElementById('gameConnectivityPanel');
    const onlineGameStatus = documentRef.getElementById('onlineGameStatus');
    if (connectivityPanel && connectivityPanel.style) {
        const hasOnlineMessage = !!(onlineGameStatus && onlineGameStatus.textContent &&
            (!onlineGameStatus.style || onlineGameStatus.style.display !== 'none'));
        connectivityPanel.style.display = activity.visible || connectionView.visible || hasOnlineMessage
            ? 'grid'
            : 'none';
    }
    return activity;
}

function updateGameActivityWatchdogStatus(status, now = Date.now()) {
    watchdogActivityStatusController.observe(status, now);
    return updateGameActivityStatus(now);
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
    focusGame: () => UiScreenFocus.focusGame(document),
    getPortfolio: () => typeof RLModelPortfolio !== 'undefined' ? RLModelPortfolio : null,
    initializeGame: playerCount => init(playerCount),
    notifyLifecycleStart() {
        if (typeof notifyGameLifecycleStart === 'function') notifyGameLifecycleStart();
    },
    playerCount: UiPlayerCount,
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

function reviewGameSetup() {
    const setup = gameSetupSnapshot();
    const cards = getEnabledCardSelection();
    const landmarks = getEnabledLandmarkSelection();
    const marketRule = GameSelectionState.runtime.snapshot().marketRule === 'ten-type'
        ? '公式オプション（異なる10種類）'
        : '通常市場（全種類）';
    const players = setup.playerSettings.slice(0, setup.selectedCount).map((setting, index) => {
        const name = String(setting && setting.name || '').trim() || `プレイヤー${index + 1}`;
        if (!setting || setting.type !== 'cpu') return `${index + 1}. ${name}（人間）`;
        return `${index + 1}. ${name}（${getLocalCpuLabel(setting.difficulty || 'normal')}）`;
    });
    const speed = document.getElementById('cpuSpeed')?.value;
    const message = [
        'この設定でゲームを開始しますか？',
        '',
        `人数: ${setup.selectedCount}人`,
        ...players,
        `CPU速度: ${formatCpuSpeedLabel(speed || 1500)}`,
        `施設: ${cards.size}種 / ランドマーク: ${landmarks.size}種`,
        `市場: ${marketRule}`,
    ].join('\n');
    return showConfirm(message, () => startGame());
}

const localGameRestartRuntime = LocalGameRestartRuntime.createRuntime({
    cancelAutoSkip: () => cancelAutoSkip(),
    cancelCpuSchedule: reason => cancelCpuSchedule(reason),
    cancelDelayedHumanAction: () => cancelDelayedHumanAction(),
    checkpoint: event => markMainCheckpoint(event),
    document,
    drawSkyline: () => drawCitySkyline(),
    focusTitle: () => UiScreenFocus.focusTitle(document),
    gameRuntime: GameRuntimeState.runtime,
    playerCount: UiPlayerCount,
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

function rematchLocalGame() {
    if (mainOnlineRuntimeSnapshot().isOnlineGame || UiWinner.gameOriginRuntime.wasOnline() ||
            !mainGameRuntimeSnapshot().game) return false;
    const setup = gameSetupSnapshot();
    return showConfirm('同じ人数・プレイヤー設定でもう一度対戦しますか？', () => {
        if (typeof resetGameLifecycleForRestart === 'function') {
            resetGameLifecycleForRestart('local-rematch-lifecycle-reset');
        }
        startGameNow(setup.selectedCount, setup.playerSettings);
    });
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
    getMarketRule: () => GameSelectionState.runtime.snapshot().marketRule,
    initialCardStock: (card, playerCount) => getInitialCardStock(card, playerCount),
    landmarkNames: () => Player.landmarkNames(),
    logTypes: LOG_TYPES,
    marketSupply: MarketSupply,
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
            decrementShopStock: (stock, card, game) => decrementMarketShopStock(game || currentGame, stock, card),
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
    const currentGame = mainGameRuntimeSnapshot().game;
    const proposal = CpuTurnStrategy.chooseAction(stepName, {
        game: currentGame,
        cpu,
        rollDie: rollRandomDie,
        choosePendingAction: chooseCpuPendingAction,
        shopStock: SHOP_STOCK,
    });
    latestCpuActionExplanation = Object.freeze({
        playerIndex: currentGame ? currentGame.currentPlayerIndex : -1,
        turnCount: currentGame && Number.isInteger(currentGame.turnCount) ? currentGame.turnCount : -1,
        text: CPUActionProposal.explanation(proposal),
    });
    return proposal;
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
    nextPendingAction: game => {
        const pending = CPUPendingResolution.pendingActionDescriptors(game)[0];
        return pending && pending.action || null;
    },
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
    resetActivityStatus: activationAt => {
        connectionObservationFloor = Number.isFinite(activationAt) ? Math.max(0, activationAt) : 0;
        gameActivityStatusController.resumeAt(activationAt);
        watchdogActivityStatusController.reset();
        updateGameActivityStatus(activationAt);
    },
    resetWatchdog: () => resetFreezeWatchdogAfterPageActivation(),
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
    decrementStock: (stock, card) => decrementMarketShopStock(mainGameRuntimeSnapshot().game, stock, card),
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

function cpuTournamentElements() {
    return {
        startButton: document.getElementById('cpuTournamentStart'),
        cancelButton: document.getElementById('cpuTournamentCancel'),
        gamesSelect: document.getElementById('cpuTournamentGames'),
        playerCountSelect: document.getElementById('cpuTournamentPlayerCount'),
        status: document.getElementById('cpuTournamentStatus'),
        results: document.getElementById('cpuTournamentResults'),
        history: document.getElementById('cpuTournamentHistory'),
        replay: document.getElementById('cpuTournamentReplay'),
    };
}

function renderCpuTournamentHistory() {
    const element = document.getElementById('cpuTournamentHistory');
    if (element) element.innerHTML = UiCpuTournament.buildHistoryHtml(cpuTournamentHistoryRepository.load());
}

const cpuTournamentController = CpuTournament.createController({
    onUpdate(state) {
        if (state.summary) currentCpuTournamentView = state.summary;
        if (state.status === 'complete' && state.summary) {
            const saved = cpuTournamentHistoryRepository.add(state.summary);
            if (saved) currentCpuTournamentView = saved;
            renderCpuTournamentHistory();
        }
        UiCpuTournament.applyState(cpuTournamentElements(), state);
    },
});

function startCpuTournament() {
    const elements = cpuTournamentElements();
    return cpuTournamentController.start({
        games: elements.gamesSelect && elements.gamesSelect.value,
        playerCount: elements.playerCountSelect && elements.playerCountSelect.value,
        seed: Date.now() % 0xffffffff || 1,
    });
}

function cancelCpuTournament() {
    return cpuTournamentController.cancel();
}

function cpuTournamentRecord(index) {
    if (index === 'current') return currentCpuTournamentView;
    const parsed = Number.parseInt(index, 10);
    return Number.isInteger(parsed) ? cpuTournamentHistoryRepository.load()[parsed] || null : null;
}

function showCpuTournamentHistory(index) {
    const record = cpuTournamentRecord(index);
    const results = document.getElementById('cpuTournamentResults');
    if (!record || !results) return false;
    currentCpuTournamentView = record;
    results.innerHTML = UiCpuTournament.buildRankingsHtml(record);
    return true;
}

function replayCpuTournamentGame(historyIndex, gameIndex) {
    const record = cpuTournamentRecord(historyIndex);
    const gameRecord = record && record.games && record.games[Number.parseInt(gameIndex, 10)];
    const target = document.getElementById('cpuTournamentReplay');
    if (!gameRecord || !target) return false;
    const result = CpuTournament.runGame({
        difficulties: gameRecord.difficulties,
        seed: gameRecord.seed,
        maxSteps: 5000,
        captureTrace: true,
    });
    target.innerHTML = UiCpuTournament.buildReplayHtml(result);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
}

function downloadCpuTournamentFile(filename, content, type) {
    if (typeof Blob !== 'function' || typeof URL === 'undefined' ||
            typeof URL.createObjectURL !== 'function') return false;
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return true;
}

function exportCpuTournamentJson() {
    return downloadCpuTournamentFile('cpu-tournament-history.json',
        CpuTournament.exportJson(cpuTournamentHistoryRepository.load()), 'application/json');
}

function exportCpuTournamentCsv() {
    return downloadCpuTournamentFile('cpu-tournament-history.csv',
        CpuTournament.exportCsv(cpuTournamentHistoryRepository.load()), 'text/csv;charset=utf-8');
}

function clearCpuTournamentHistory() {
    showConfirm('CPU大会の履歴をすべて削除しますか？', () => {
        cpuTournamentHistoryRepository.clear();
        renderCpuTournamentHistory();
    });
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
    ensureCurrentScreenFocus: () => UiScreenFocus.ensureCurrentScreenFocus(document),
    formatCpuSpeedLabel,
    getWindow: () => typeof window !== 'undefined' ? window : null,
    rangeControl: UiRangeControl,
    resolveEffect: resolveMainUiEffect,
    tabView: UiTabView,
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
renderSetupPresetList();
renderCpuTournamentHistory();
bindDelegatedUiHandlers();
bindCpuResumeScheduler();

function applyRoomJoinLinkFromLocation() {
    if (typeof RoomQrCode === 'undefined' || typeof window === 'undefined') return false;
    const roomId = RoomQrCode.parseJoinRoomId(window.location);
    const input = document.getElementById('roomIdInput');
    if (!roomId || !input) return false;
    input.value = roomId;
    if (typeof switchTab === 'function') switchTab('online');
    if (typeof switchOnlineTab === 'function') switchOnlineTab('join');
    const status = document.getElementById('onlineStatus');
    if (status) status.textContent = `参加リンクからルーム ${roomId} を入力しました。名前を確認して参加してください。`;
    return true;
}

applyRoomJoinLinkFromLocation();
