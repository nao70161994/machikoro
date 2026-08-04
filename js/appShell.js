const appShellStorage = AppShellStorage.createFacade();

function appShellGameRuntimeSnapshot() {
    return GameRuntimeState.runtime.snapshot();
}

function appShellOnlineRuntimeSnapshot() {
    return OnlineRuntimeState.runtime.snapshot();
}

// ===== クライアントエラー通知 =====
const FREEZE_WATCHDOG_INTERVAL_MS = 1000;
const FREEZE_WATCHDOG_THRESHOLD_MS = 5000;
const FREEZE_WATCHDOG_REPORT_SUPPRESS_MS = 60000;
const FREEZE_SUMMARY_SCHEMA_VERSION = 2;
const FREEZE_KINDS = Object.freeze({
    MODAL_UI_LOCKED: 'modal-ui-locked',
    HUMAN_TURN_UI_LOCKED: 'human-turn-ui-locked',
    PENDING_UI_LOCKED: 'pending-ui-locked',
    STALE_MODAL_UI_LOCKED: 'stale-modal-ui-locked',
    POST_BUILD_UI_BLOCKED: 'post-build-ui-blocked',
    PENDING_WITHOUT_ACTION: 'pending-without-action',
    CPU_TURN_STALLED: 'cpu-turn-stalled',
    ONLINE_ACTION_IN_FLIGHT_STALLED: 'online-action-in-flight-stalled',
});
const freezeWatchdogMonitor = UiWatchdogMonitor.create({
    thresholdMs: FREEZE_WATCHDOG_THRESHOLD_MS,
    reportSuppressMs: FREEZE_WATCHDOG_REPORT_SUPPRESS_MS,
});
const clientEventBindingController = ClientEventRuntime.createBindingController();
const clientEventBindingKeys = ClientEventRuntime.bindingKeys;
const postBuildUiStabilizerBatch = UiWatchdogMonitor.createPendingBatchController();

const truncateClientErrorField = ClientReporting.truncateField;
const appShellDomSnapshot = UiDomSnapshot.createRuntime({
    getDocument: () => typeof document !== 'undefined' ? document : null,
    getComputedStyle: element => typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
        ? window.getComputedStyle(element) : null,
    truncateText: truncateClientErrorField,
});
const appShellRecoveryEffects = UiRecoveryEffects.createRuntime({
    getDocument: () => typeof document !== 'undefined' ? document : null,
});
const appShellRuntimeEffects = AppShellRuntimeEffects.createFromResolver(name => {
    const resolvers = {
        cancelCpuSchedule: () => typeof cancelCpuSchedule === 'function' ? cancelCpuSchedule : null,
        cpuSchedulerStateController: () => typeof cpuSchedulerStateController !== 'undefined' ? cpuSchedulerStateController : null,
        cpuTurnScheduler: () => typeof cpuTurnScheduler !== 'undefined' ? cpuTurnScheduler : null,
        drawCitySkyline: () => typeof drawCitySkyline === 'function' ? drawCitySkyline : null,
        getOnlineActionFlightState: () => typeof getOnlineActionFlightState === 'function' ? getOnlineActionFlightState : null,
        handleOnlineActionTimeout: () => typeof _handleOnlineActionTimeout === 'function' ? _handleOnlineActionTimeout : null,
        loadSettings: () => typeof loadSettings === 'function' ? loadSettings : null,
        onlineActionInFlight: () => typeof onlineActionInFlight !== 'undefined' ? onlineActionInFlight : false,
        onlineActionInFlightAt: () => typeof onlineActionInFlightAt !== 'undefined' ? onlineActionInFlightAt : 0,
        preloadLocalRlModels: () => typeof preloadLocalRlModelsInBackground === 'function' ? preloadLocalRlModelsInBackground : null,
        preloadOnlineRlModels: () => typeof preloadOnlineRlModelsInBackground === 'function' ? preloadOnlineRlModelsInBackground : null,
        render: () => typeof render === 'function' ? render : null,
        renderBuildMenu: () => typeof renderBuildMenu === 'function' ? renderBuildMenu : null,
        renderOnlinePlayerSettings: () => typeof renderOnlinePlayerSettings === 'function' ? renderOnlinePlayerSettings : null,
        resumeGame: () => typeof resumeGame === 'function' ? resumeGame : null,
        scheduleCpu: () => typeof scheduleCPU === 'function' ? scheduleCPU : null,
        updateResumeButton: () => typeof updateResumeButton === 'function' ? updateResumeButton : null,
    };
    return resolvers[name] ? resolvers[name]() : null;
});

const appShellObservationRuntime = AppShellObservationRuntime.createRuntime({
    actionUiRegistry: ActionUiRegistry,
    activeBlockingModalIds: snapshot => activeBlockingModalIds(snapshot),
    clientRuntimeSnapshot: ClientRuntimeSnapshot,
    document: typeof document !== 'undefined' ? document : null,
    domSnapshot: appShellDomSnapshot,
    freezeKinds: FREEZE_KINDS,
    getGameRuntimeSnapshot: appShellGameRuntimeSnapshot,
    getOnlineRuntimeSnapshot: appShellOnlineRuntimeSnapshot,
    modalSnapshotFromRuntime: (snapshot, id) => modalSnapshotFromRuntime(snapshot, id),
    nowIso: () => new Date().toISOString(),
    resolveDependency(name) {
        const resolvers = {
            cards: () => typeof CARDS !== 'undefined' ? CARDS : null,
            cardFilter: () => typeof cardFilter !== 'undefined' ? cardFilter : '',
            enabledLandmarks: () => typeof enabledLandmarks !== 'undefined' ? enabledLandmarks : null,
            gameManager: () => typeof GameManager !== 'undefined' ? GameManager : null,
            playerClass: () => typeof Player !== 'undefined' ? Player : null,
            shopStock: () => typeof SHOP_STOCK !== 'undefined' ? SHOP_STOCK : null,
        };
        return resolvers[name] ? resolvers[name]() : null;
    },
    runtimeEffects: appShellRuntimeEffects,
    uiWatchdog: UiWatchdog,
});

const elementHasBlockingAncestor = appShellObservationRuntime.elementHasBlockingAncestor;
const childInteractiveState = appShellObservationRuntime.childInteractiveState;
const hasBuildableCardCandidate = appShellObservationRuntime.hasBuildableCardCandidate;
const hasBuildableLandmarkCandidate = appShellObservationRuntime.hasBuildableLandmarkCandidate;
const expectedChildSpecForAction = appShellObservationRuntime.expectedChildSpecForAction;
const expectedChildSpecForEntry = appShellObservationRuntime.expectedChildSpecForEntry;
const expectedChildActionsForAction = appShellObservationRuntime.expectedChildActionsForAction;
const expectedChildActionsForEntry = appShellObservationRuntime.expectedChildActionsForEntry;
const isInteractiveChildUsable = appShellObservationRuntime.isInteractiveChildUsable;
const childInteractiveStateForSpec = appShellObservationRuntime.childInteractiveStateForSpec;
const childInteractiveStateForActions = appShellObservationRuntime.childInteractiveStateForActions;
const compactActionChildStates = appShellObservationRuntime.compactActionChildStates;
const safeElementSnapshot = appShellObservationRuntime.safeElementSnapshot;
const visibleElement = appShellObservationRuntime.visibleElement;
const visibleModalIds = appShellObservationRuntime.visibleModalIds;
const classListText = appShellObservationRuntime.classListText;
const allowedActionListForSnapshot = appShellObservationRuntime.allowedActionListForSnapshot;
const isElementUsablyEnabled = appShellObservationRuntime.isElementUsablyEnabled;
const uiLockReasonForElement = appShellObservationRuntime.uiLockReasonForElement;
const actionContainerSpecForAction = appShellObservationRuntime.actionContainerSpecForAction;
const expectedActionContainerEntries = appShellObservationRuntime.expectedActionContainerEntries;
const shouldIgnoreInactiveActionContainerIssue = appShellObservationRuntime.shouldIgnoreInactiveActionContainerIssue;
const missingActionContainerRegistryEntries = appShellObservationRuntime.missingActionContainerRegistryEntries;
function primaryActionContainerRegistryForDiagnostics() {
    return appShellObservationRuntime.primaryActionContainerRegistryForDiagnostics();
}
const snapshotStateById = appShellObservationRuntime.snapshotStateById;
const snapshotElementForAction = appShellObservationRuntime.snapshotElementForAction;
const isActionContainerUiUsable = appShellObservationRuntime.isActionContainerUiUsable;
const isActionUiUsable = appShellObservationRuntime.isActionUiUsable;
const collectInteractabilityObservations = appShellObservationRuntime.collectInteractabilityObservations;
const primaryUiIssue = appShellObservationRuntime.primaryUiIssue;
const primaryActionButtonStates = appShellObservationRuntime.primaryActionButtonStates;

function collectUiLockSnapshot(reason = 'ui-lock-snapshot') {
    return appShellObservationRuntime.collectUiLockSnapshot(reason);
}

function validateUiInteractability(snapshot = collectUiLockSnapshot()) {
    return appShellObservationRuntime.validateUiInteractability(snapshot);
}

function buildClientRuntimeSnapshot(reason = '') {
    return appShellObservationRuntime.buildClientRuntimeSnapshot(reason);
}

function isHumanTurnSnapshot(snapshot) {
    return UiWatchdog.isHumanTurnSnapshot(snapshot);
}
function expectedPrimaryActions(snapshot) {
    return UiWatchdog.expectedPrimaryActions(snapshot);
}

function hasUsablePrimaryAction(snapshot) {
    const primaryActions = new Set(expectedPrimaryActions(snapshot));
    return expectedActionContainerEntries(snapshot)
        .filter(entry => primaryActions.has(entry.action))
        .some(entry => isActionContainerUiUsable(snapshot, entry));
}

function expectedPendingActions(snapshot) {
    return UiWatchdog.expectedPendingActions(snapshot);
}
function hasUsablePendingAction(snapshot) {
    const pendingActions = new Set(expectedPendingActions(snapshot));
    return expectedActionContainerEntries(snapshot)
        .filter(entry => pendingActions.has(entry.action))
        .some(entry => isActionContainerUiUsable(snapshot, entry));
}

function isOnlineUiBlockedSnapshot(snapshot) {
    return UiWatchdog.isOnlineUiBlockedSnapshot(snapshot);
}
const appShellUiLockRuntime = AppShellUiLockRuntime.createRuntime({
    buildSnapshot: buildClientRuntimeSnapshot,
    checkpoint: markClientFlowCheckpoint,
    clearInteractabilityIssueTargets: issues => clearUiInteractabilityIssueTargets(issues),
    closeConfirmModal() {
        if (typeof closeConfirmModal === 'function') closeConfirmModal(false);
        else if (typeof closeAccessibleModal === 'function') closeAccessibleModal('confirmModal', { restoreFocus: false });
        else appShellRecoveryEffects.hide('confirmModal');
    },
    expectedPendingActions,
    expectedPrimaryActions,
    freezeKinds: FREEZE_KINDS,
    getConfirmAwaitingChoice() {
        try {
            const root = typeof window !== 'undefined' ? window : globalThis;
            return !!(root && root.__machikoroConfirmModalOpen === true);
        } catch (_) {
            return false;
        }
    },
    getElementById: id => typeof document !== 'undefined' && document.getElementById
        ? document.getElementById(id) : null,
    getRoot: () => typeof window !== 'undefined' ? window : globalThis,
    isHumanTurnSnapshot,
    isOnlineUiBlockedSnapshot,
    monitor: freezeWatchdogMonitor,
    postBuildBatch: postBuildUiStabilizerBatch,
    recoveryEffects: appShellRecoveryEffects,
    removeFreezeSnapshot: () => safeAppShellStorageRemove('machikoroFreezeSnapshot'),
    resetAccessibleModalState() {
        try { if (typeof activeModalId !== 'undefined') activeModalId = null; } catch (_) {}
        try { if (typeof lastModalFocus !== 'undefined') lastModalFocus = null; } catch (_) {}
        try { if (typeof modalInertRestore !== 'undefined') modalInertRestore = []; } catch (_) {}
    },
    runtimeEffects: appShellRuntimeEffects,
    setTimeoutFn: typeof setTimeout === 'function' ? setTimeout : null,
    snapshotElement: id => safeElementSnapshot(id),
    syncAllowedActionContainers: (snapshot, issues) => syncAllowedActionContainersForRender(snapshot, issues),
    uiWatchdog: UiWatchdog,
    validateInteractability: validateUiInteractability,
});

function resetUiLocksForGameReset(reason = 'game-reset') {
    return appShellUiLockRuntime.resetForGame(reason);
}

function modalSnapshotFromRuntime(snapshot, id) {
    return appShellUiLockRuntime.modalSnapshot(snapshot, id);
}

function confirmModalOpenFromSnapshot(snapshot) {
    return appShellUiLockRuntime.confirmModalOpen(snapshot);
}

function isConfirmModalAwaitingUserChoice() {
    return appShellUiLockRuntime.isConfirmAwaitingUserChoice();
}

function isStaleConfirmModalSnapshot(snapshot) {
    return appShellUiLockRuntime.isStaleConfirmModal(snapshot);
}

function activeBlockingModalIds(snapshot) {
    return appShellUiLockRuntime.activeBlockingModalIds(snapshot);
}

function hasActiveBlockingModal(snapshot) {
    return appShellUiLockRuntime.hasActiveBlockingModal(snapshot);
}

function isStalePendingModalSnapshot(snapshot) {
    return appShellUiLockRuntime.isStalePendingModal(snapshot);
}

function clearGameScreenLockIfNoActiveModal(snapshot, reason = 'game-screen-lock-recovery') {
    return appShellUiLockRuntime.clearGameScreenLock(snapshot, reason);
}

function closeStaleBlockingModals(snapshot, reason = 'ui-unlock') {
    return appShellUiLockRuntime.closeStaleBlockingModals(snapshot, reason);
}

function clearUiLocks(reason = 'ui-unlock', snapshot = null) {
    return appShellUiLockRuntime.clearUiLocks(reason, snapshot);
}

function schedulePostBuildUiStabilizer(reason = 'post-build-ui-stabilizer') {
    return appShellUiLockRuntime.schedulePostBuildUiStabilizer(reason);
}

function unlockUiForHumanTurn(reason = 'human-turn-unlock') {
    return appShellUiLockRuntime.unlockUiForHumanTurn(reason);
}

function safeAppShellStorageGet(key, fallback = null) {
    return appShellStorage.get(key, fallback);
}

function safeAppShellStorageSet(key, value) {
    return appShellStorage.set(key, value);
}

function safeAppShellStorageRemove(key) {
    appShellStorage.remove(key);
}

function markClientFlowCheckpoint(event, details = {}) {
    return ClientCheckpoint.record({
        event,
        details,
        buildSnapshot: () => buildClientRuntimeSnapshot(event),
        timestamp: () => new Date().toISOString(),
        getRoot: () => typeof window !== 'undefined' ? window : globalThis,
        persist(value) {
            appShellStorage.access(storage => {
                storage.setItem('machikoroLastClientCheckpoint', value);
            });
        },
    });
}


const appShellClientReportingRuntime = AppShellClientReportingRuntime.createRuntime({
    buildSnapshot: buildClientRuntimeSnapshot,
    checkpoint: markClientFlowCheckpoint,
    endpoint: '/api/client-error',
    getFetch: () => typeof fetch === 'function' ? fetch : null,
    getGameSnapshot: appShellGameRuntimeSnapshot,
    getLocation: () => typeof window !== 'undefined' ? window.location : null,
    getOnlineSnapshot: appShellOnlineRuntimeSnapshot,
    getUserAgent: () => typeof navigator !== 'undefined' ? navigator.userAgent : '',
    getVersion: () => typeof window !== 'undefined' ? window.MACHIKORO_CLIENT_VERSION : '',
    messageLimit: 500,
    now: () => Date.now(),
    reporting: ClientReporting,
    schemaVersion: FREEZE_SUMMARY_SCHEMA_VERSION,
    stackLimit: 2400,
    suppressMs: 10000,
    transport: ClientReportingTransport,
});

function buildClientErrorReport(input) {
    return appShellClientReportingRuntime.buildReport(input);
}

function reportClientError(input) {
    return appShellClientReportingRuntime.report(input);
}

// ===== ゲームライフサイクル通知 =====
const GAME_LIFECYCLE_ENDPOINT = '/api/game-lifecycle';
const GAME_LIFECYCLE_START_SUPPRESS_MS = 60 * 1000;
const gameLifecycleRuntime = LifecycleRuntime.create({
    policy: LifecycleNotify,
    storageAccess: appShellStorage.access,
    gameSnapshot: appShellGameRuntimeSnapshot,
    onlineSnapshot: appShellOnlineRuntimeSnapshot,
    setupSnapshot: () => GameSetupState.runtime.snapshot(),
    getAppVersion: () => typeof window !== 'undefined' ? window.MACHIKORO_CLIENT_VERSION : '',
    getFetch: () => typeof fetch === 'function' ? fetch : null,
    sendTransport: input => LifecycleTransport.send(input),
    checkpoint: markClientFlowCheckpoint,
    endpoint: GAME_LIFECYCLE_ENDPOINT,
    startSuppressMs: GAME_LIFECYCLE_START_SUPPRESS_MS,
});

function setGameLifecycleNotificationEnabled(enabled) {
    return gameLifecycleRuntime.setNotificationEnabled(enabled);
}

function gameLifecycleNotifyState() {
    return gameLifecycleRuntime.notificationState();
}

function sendGameLifecycleNotification(event, extra = {}) {
    return gameLifecycleRuntime.send(event, extra);
}

function notifyGameLifecycleStart() {
    return gameLifecycleRuntime.notifyStart();
}

function notifyGameLifecycleFinish(winner) {
    return gameLifecycleRuntime.notifyFinish(winner);
}

function resetGameLifecycleForRestart(reason = 'game-restart') {
    gameLifecycleRuntime.reset(reason);
}

if (typeof window !== 'undefined') {
    window.__machikoroSetLifecycleNotificationsEnabled = setGameLifecycleNotificationEnabled;
    window.__machikoroLifecycleNotifyState = gameLifecycleNotifyState;
    window.__machikoroSendLifecycleNotification = sendGameLifecycleNotification;
}

// ===== クラッシュ回復 =====
const appShellCrashRuntime = AppShellCrashRuntime.createRuntime({
    addKeydownListener: handler => {
        if (typeof document.addEventListener === 'function') document.addEventListener('keydown', handler, true);
    },
    cancelCpu: appShellRuntimeEffects.cancelCpu,
    controller: CrashScreen.createController(),
    effects: CrashScreenEffects,
    getActiveElement: () => document.activeElement,
    getElementById: id => document.getElementById(id),
    policy: CrashScreen,
    readSavedGame: () => safeAppShellStorageGet('savedGame'),
    removeKeydownListener: handler => {
        if (typeof document.removeEventListener === 'function') document.removeEventListener('keydown', handler, true);
    },
    resumeGame: appShellRuntimeEffects.resumeGame,
});

function showCrashScreen(err) {
    return appShellCrashRuntime.show(err);
}

function crashResume() {
    return appShellCrashRuntime.resume();
}

// ===== オフライン検知 =====
function updateOnlineTabState() {
    const view = UiTabView.buildOnlineAvailabilityView(navigator.onLine);
    UiTabEffects.applyOnlineAvailabilityView({
        tabButton: document.getElementById('tabOnline'),
        notice: document.getElementById('offlineNotice'),
        createButton: document.getElementById('onlineCreateSubmitButton'),
        joinButton: document.getElementById('onlineJoinSubmitButton'),
    }, view);
}

// ===== PWAインストールバナー =====
const _pwaInstallController = PwaShell.createInstallController({
    document,
    window,
    readStorage: safeAppShellStorageGet,
    writeStorage: safeAppShellStorageSet,
});

function setPwaBannerVisible(id, visible) {
    return _pwaInstallController.setBannerVisible(id, visible);
}

function updatePwaBannerBodyState() {
    return _pwaInstallController.updateBannerBodyState();
}

function maybeShowPwaInstallBanner() {
    return _pwaInstallController.maybeShowInstallBanner();
}

function pwaInstallPrompt() {
    return _pwaInstallController.promptInstall();
}

function pwaInstallDismiss() {
    return _pwaInstallController.dismissInstall();
}

const appShellEventBindings = ClientEventRuntime.createShellBindings({
    bindingController: clientEventBindingController,
    checkFreezeWatchdog,
    consoleErrorInput: ClientReporting.consoleErrorInput,
    freezeWatchdogIntervalMs: FREEZE_WATCHDOG_INTERVAL_MS,
    getConsole: () => typeof console !== 'undefined' ? console : null,
    pwaInstallController: _pwaInstallController,
    reportClientError,
    resizeHandler: appShellRuntimeEffects.drawCitySkyline,
    setIntervalFn: typeof setInterval === 'function' ? setInterval : null,
    showCrashScreen,
    unhandledRejectionInput: ClientReporting.unhandledRejectionInput,
    updateOnlineStatus: updateOnlineTabState,
    windowErrorInput: ClientReporting.windowErrorInput,
    windowTarget: window,
});

function handleWindowErrorEvent(event) {
    return appShellEventBindings.handleWindowErrorEvent(event);
}

function handleWindowUnhandledRejection(event) {
    return appShellEventBindings.handleWindowUnhandledRejection(event);
}

function bindConsoleErrorReporting() {
    return appShellEventBindings.bindConsoleErrorReporting();
}

function bindCrashHandlers() {
    return appShellEventBindings.bindCrashReporting();
}

function bindOnlineStatusHandlers() {
    return appShellEventBindings.bindOnlineStatus();
}

function bindPwaInstallHandlers() {
    return appShellEventBindings.bindPwaInstallHandlers();
}

const appShellWatchdogRuntime = UiWatchdogRuntime.createRuntime({
    buildSnapshot: buildClientRuntimeSnapshot,
    checkpoint: markClientFlowCheckpoint,
    compactActionChildStates,
    confirmModalOpen: confirmModalOpenFromSnapshot,
    freezeKinds: FREEZE_KINDS,
    getConfirmAwaitingChoice: isConfirmModalAwaitingUserChoice,
    getOnlineRetryPolicy: () => typeof OnlineRetryPolicy !== 'undefined' ? OnlineRetryPolicy : null,
    getRoot: () => typeof window !== 'undefined' ? window : globalThis,
    hasActiveBlockingModal,
    hasUsablePendingAction,
    hasUsablePrimaryAction,
    monitor: freezeWatchdogMonitor,
    monitorActions: UiWatchdogMonitor.ACTIONS,
    now: () => Date.now(),
    recover: snapshot => recoverUiInteractability(snapshot),
    report(input) {
        if (typeof reportClientError === 'function') reportClientError(input);
    },
    reporting: UiWatchdogReporting,
    schemaVersion: FREEZE_SUMMARY_SCHEMA_VERSION,
    staleConfirmModalOpen: isStaleConfirmModalSnapshot,
    stalePendingModalOpen: isStalePendingModalSnapshot,
    store(key, value) {
        appShellStorage.access(storage => storage.setItem(key, value));
    },
    uiWatchdog: UiWatchdog,
    validateInteractability: validateUiInteractability,
});

function classifyLikelyFreeze(snapshot) {
    return appShellWatchdogRuntime.classify(snapshot);
}

const appShellAsyncRecovery = UiWatchdogAsyncRecovery.createRuntime({
    buildSnapshot: buildClientRuntimeSnapshot,
    checkpoint: markClientFlowCheckpoint,
    compactSnapshot: appShellWatchdogRuntime.compactSnapshot,
    runtimeEffects: appShellRuntimeEffects,
});
const appShellRecoveryRuntime = UiWatchdogRecoveryRuntime.createRuntime({
    appShellAsyncRecovery,
    appShellGameRuntimeSnapshot,
    appShellRecoveryEffects,
    appShellRuntimeEffects,
    buildClientRuntimeSnapshot,
    classifyLikelyFreeze,
    classifyUiInteractabilityCause: appShellWatchdogRuntime.classifyInteractabilityCause,
    clearGameScreenLockIfNoActiveModal,
    clearUiLocks,
    closeStaleBlockingModals,
    compactIssueForTrace: appShellWatchdogRuntime.compactIssue,
    compactSnapshotForUiTrace: appShellWatchdogRuntime.compactSnapshot,
    expectedActionContainerEntries,
    expectedChildSpecForEntry,
    expectedPendingActions,
    freezeKinds: FREEZE_KINDS,
    hasActiveBlockingModal,
    isActionContainerUiUsable,
    isHumanTurnSnapshot,
    isOnlineUiBlockedSnapshot,
    markClientFlowCheckpoint,
    recentClientCheckpointsForTrace: appShellWatchdogRuntime.recentCheckpoints,
    uiWatchdog: UiWatchdog,
    validateUiInteractability,
});

const syncAllowedActionContainersForRender = appShellRecoveryRuntime.syncAllowedActionContainersForRender;
const clearUiInteractabilityIssueTargets = appShellRecoveryRuntime.clearUiInteractabilityIssueTargets;

function syncUiInteractabilityAfterRender(reason = 'render-sync') {
    return appShellRecoveryRuntime.syncUiInteractabilityAfterRender(reason);
}

function recoverUiInteractability(snapshot) {
    return appShellRecoveryRuntime.recoverUiInteractability(snapshot);
}

function recoverFreezeKind(freezeKind, snapshot) {
    return appShellRecoveryRuntime.recoverFreezeKind(freezeKind, snapshot);
}

function checkFreezeWatchdog() {
    return appShellWatchdogRuntime.check();
}

function startFreezeWatchdog() {
    return appShellEventBindings.startFreezeWatchdog();
}

function sendDebugClientErrorReport(message = 'manual client error test') {
    return appShellClientReportingRuntime.sendDebugReport(message);
}

if (typeof window !== 'undefined') {
    window.__machikoroSendTestErrorReport = sendDebugClientErrorReport;
}

// Register before main.js evaluates so startup failures can still reach the crash UI.
if (typeof window !== 'undefined') bindCrashHandlers();

function initMainView() {
    appShellRuntimeEffects.loadSettings();
    appShellRuntimeEffects.preloadLocalRlModels('init-main-local-rl-preload');
    appShellRuntimeEffects.renderOnlinePlayerSettings();
    appShellRuntimeEffects.preloadOnlineRlModels('init-main-online-rl-preload');
    appShellRuntimeEffects.updateResumeButton();
    appShellRuntimeEffects.drawCitySkyline();
    appShellEventBindings.bindMainViewResize();
    bindCrashHandlers();
    bindOnlineStatusHandlers();
    bindPwaInstallHandlers();
    startFreezeWatchdog();
}
