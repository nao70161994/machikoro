const appShellStorage = AppShellStorage.createFacade();

// appShell.js is evaluated before main.js/online.js. All late classic-script
// dependencies live in this one registry instead of being rediscovered by each
// runtime adapter.
const appShellComposition = AppShellComposition.create({
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
    cards: () => typeof CARDS !== 'undefined' ? CARDS : null,
    cardFilter: () => typeof cardFilter !== 'undefined' ? cardFilter : '',
    enabledLandmarks: () => typeof enabledLandmarks !== 'undefined' ? enabledLandmarks : null,
    gameManager: () => typeof GameManager !== 'undefined' ? GameManager : null,
    playerClass: () => typeof Player !== 'undefined' ? Player : null,
    shopStock: () => typeof SHOP_STOCK !== 'undefined' ? SHOP_STOCK : null,
    onlineRetryPolicy: () => typeof OnlineRetryPolicy !== 'undefined' ? OnlineRetryPolicy : null,
    document: () => typeof document !== 'undefined' ? document : null,
    navigator: () => typeof navigator !== 'undefined' ? navigator : null,
    root: () => typeof window !== 'undefined' ? window : globalThis,
    console: () => typeof console !== 'undefined' ? console : null,
    fetch: () => typeof fetch === 'function' ? fetch : null,
    setInterval: () => typeof setInterval === 'function' ? setInterval : null,
    setTimeout: () => typeof setTimeout === 'function' ? setTimeout : null,
});

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
    getDocument: () => appShellComposition.resolve('document'),
    getComputedStyle: element => {
        const root = appShellComposition.resolve('root');
        return root && typeof root.getComputedStyle === 'function' ? root.getComputedStyle(element) : null;
    },
    truncateText: truncateClientErrorField,
});
const appShellRecoveryEffects = UiRecoveryEffects.createRuntime({
    getDocument: () => appShellComposition.resolve('document'),
});
const appShellRuntimeEffects = AppShellRuntimeEffects.createFromResolver(
    name => appShellComposition.resolve(name)
);

const appShellObservationRuntime = AppShellObservationRuntime.createRuntime({
    actionUiRegistry: ActionUiRegistry,
    activeBlockingModalIds: snapshot => activeBlockingModalIds(snapshot),
    clientRuntimeSnapshot: ClientRuntimeSnapshot,
    document: appShellComposition.resolve('document'),
    domSnapshot: appShellDomSnapshot,
    freezeKinds: FREEZE_KINDS,
    getGameRuntimeSnapshot: appShellGameRuntimeSnapshot,
    getOnlineRuntimeSnapshot: appShellOnlineRuntimeSnapshot,
    modalSnapshotFromRuntime: (snapshot, id) => modalSnapshotFromRuntime(snapshot, id),
    nowIso: () => new Date().toISOString(),
    resolveDependency: name => appShellComposition.resolve(name),
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
            const root = appShellComposition.resolve('root');
            return !!(root && root.__machikoroConfirmModalOpen === true);
        } catch (_) {
            return false;
        }
    },
    getElementById: id => {
        const documentRef = appShellComposition.resolve('document');
        return documentRef && documentRef.getElementById ? documentRef.getElementById(id) : null;
    },
    getRoot: () => appShellComposition.resolve('root'),
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
    setTimeoutFn: appShellComposition.resolveFunction('setTimeout'),
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
    const checkpoint = ClientCheckpoint.record({
        event,
        details,
        buildSnapshot: () => buildClientRuntimeSnapshot(event),
        timestamp: () => new Date().toISOString(),
        getRoot: () => appShellComposition.resolve('root'),
        persist(value) {
            appShellStorage.access(storage => {
                storage.setItem('machikoroLastClientCheckpoint', value);
            });
        },
    });
    const cpuStepJournalKey = 'machikoroActiveCpuStep';
    const mutation = ClientCheckpoint.cpuStepJournalMutation(
        checkpoint,
        safeAppShellStorageGet(cpuStepJournalKey, '')
    );
    if (mutation.kind === 'write') safeAppShellStorageSet(cpuStepJournalKey, mutation.value);
    if (mutation.kind === 'remove') safeAppShellStorageRemove(cpuStepJournalKey);
    return checkpoint;
}

const clientErrorOutbox = ClientReportingTransport.createOutbox({
    read: () => safeAppShellStorageGet('machikoroClientErrorOutbox', '[]'),
    write: value => safeAppShellStorageSet('machikoroClientErrorOutbox', value),
    now: () => Date.now(),
    maxEntries: 8,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
});

const appShellClientReportingRuntime = AppShellClientReportingRuntime.createRuntime({
    buildSnapshot: buildClientRuntimeSnapshot,
    checkpoint: markClientFlowCheckpoint,
    endpoint: '/api/client-error',
    getFetch: () => appShellComposition.resolveFunction('fetch'),
    getGameSnapshot: appShellGameRuntimeSnapshot,
    getLocation: () => {
        const root = appShellComposition.resolve('root');
        return root ? root.location : null;
    },
    getOnlineSnapshot: appShellOnlineRuntimeSnapshot,
    getUserAgent: () => {
        const navigatorRef = appShellComposition.resolve('navigator');
        return navigatorRef ? navigatorRef.userAgent : '';
    },
    getVersion: () => {
        const root = appShellComposition.resolve('root');
        return root ? root.MACHIKORO_CLIENT_VERSION : '';
    },
    messageLimit: 500,
    now: () => Date.now(),
    outbox: clientErrorOutbox,
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

function flushClientErrorReports() {
    return appShellClientReportingRuntime.flush();
}

// ===== ゲームライフサイクル通知 =====
const GAME_LIFECYCLE_ENDPOINT = '/api/game-lifecycle';
const GAME_LIFECYCLE_START_SUPPRESS_MS = 60 * 1000;
let gameLifecycleRetryTimer = null;

function scheduleGameLifecycleRetry(delayMs) {
    if (gameLifecycleRetryTimer !== null) return false;
    const setTimeoutFn = appShellComposition.resolveFunction('setTimeout');
    if (typeof setTimeoutFn !== 'function') return false;
    gameLifecycleRetryTimer = setTimeoutFn(() => {
        gameLifecycleRetryTimer = null;
        flushGameLifecycleNotifications();
    }, Math.max(0, Number(delayMs) || 0));
    return true;
}

const gameLifecycleOutbox = LifecycleTransport.createOutbox({
    read: () => safeAppShellStorageGet('machikoroLifecycleOutbox', '[]'),
    write: value => safeAppShellStorageSet('machikoroLifecycleOutbox', value),
    now: () => Date.now(),
    maxEntries: 8,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
});
const gameLifecycleRuntime = LifecycleRuntime.create({
    policy: LifecycleNotify,
    storageAccess: appShellStorage.access,
    gameSnapshot: appShellGameRuntimeSnapshot,
    onlineSnapshot: appShellOnlineRuntimeSnapshot,
    setupSnapshot: () => GameSetupState.runtime.snapshot(),
    getAppVersion: () => {
        const root = appShellComposition.resolve('root');
        return root ? root.MACHIKORO_CLIENT_VERSION : '';
    },
    getFetch: () => appShellComposition.resolveFunction('fetch'),
    sendTransport: input => LifecycleTransport.send({
        ...input,
        outbox: gameLifecycleOutbox,
        scheduleRetry: scheduleGameLifecycleRetry,
    }),
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

function flushGameLifecycleNotifications() {
    return LifecycleTransport.flush({
        fetchImpl: appShellComposition.resolveFunction('fetch'),
        endpoint: GAME_LIFECYCLE_ENDPOINT,
        checkpoint: markClientFlowCheckpoint,
        outbox: gameLifecycleOutbox,
        scheduleRetry: scheduleGameLifecycleRetry,
        maxDeliveries: 1,
    });
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

const appShellRoot = appShellComposition.resolve('root');
if (appShellRoot) {
    appShellRoot.__machikoroSetLifecycleNotificationsEnabled = setGameLifecycleNotificationEnabled;
    appShellRoot.__machikoroLifecycleNotifyState = gameLifecycleNotifyState;
    appShellRoot.__machikoroSendLifecycleNotification = sendGameLifecycleNotification;
}

// ===== クラッシュ回復 =====
const appShellCrashRuntime = AppShellCrashRuntime.createRuntime({
    addKeydownListener: handler => {
        const documentRef = appShellComposition.resolve('document');
        if (documentRef && typeof documentRef.addEventListener === 'function') {
            documentRef.addEventListener('keydown', handler, true);
        }
    },
    cancelCpu: appShellRuntimeEffects.cancelCpu,
    controller: CrashScreen.createController(),
    effects: CrashScreenEffects,
    getActiveElement: () => appShellComposition.resolve('document').activeElement,
    getElementById: id => appShellComposition.resolve('document').getElementById(id),
    policy: CrashScreen,
    readSavedGame: () => safeAppShellStorageGet('savedGame'),
    removeKeydownListener: handler => {
        const documentRef = appShellComposition.resolve('document');
        if (documentRef && typeof documentRef.removeEventListener === 'function') {
            documentRef.removeEventListener('keydown', handler, true);
        }
    },
    resumeGame: appShellRuntimeEffects.resumeGame,
});

function showCrashScreen(err) {
    return appShellCrashRuntime.show(err);
}

function crashResume() {
    return appShellCrashRuntime.resume();
}

// ===== オフライン検知 / PWAインストールバナー =====
const _pwaInstallController = PwaShell.createInstallController({
    document: appShellComposition.resolve('document'),
    window: appShellComposition.resolve('root'),
    readStorage: safeAppShellStorageGet,
    writeStorage: safeAppShellStorageSet,
});

function updateOnlineTabState() {
    const result = appShellStartupRuntime.updateOnlineStatus();
    const navigatorRef = appShellComposition.resolve('navigator');
    if (!navigatorRef || navigatorRef.onLine !== false) {
        flushClientErrorReports();
        flushGameLifecycleNotifications();
    }
    return result;
}

function setPwaBannerVisible(id, visible) {
    return appShellStartupRuntime.setPwaBannerVisible(id, visible);
}

function updatePwaBannerBodyState() {
    return appShellStartupRuntime.updatePwaBannerBodyState();
}

function maybeShowPwaInstallBanner() {
    return appShellStartupRuntime.maybeShowPwaInstallBanner();
}

function pwaInstallPrompt() {
    return appShellStartupRuntime.pwaInstallPrompt();
}

function pwaInstallDismiss() {
    return appShellStartupRuntime.pwaInstallDismiss();
}

const appShellEventBindings = ClientEventRuntime.createShellBindings({
    bindingController: clientEventBindingController,
    checkFreezeWatchdog,
    consoleErrorInput: ClientReporting.consoleErrorInput,
    freezeWatchdogIntervalMs: FREEZE_WATCHDOG_INTERVAL_MS,
    getConsole: () => appShellComposition.resolve('console'),
    pwaInstallController: _pwaInstallController,
    reportClientError,
    resizeHandler: appShellRuntimeEffects.drawCitySkyline,
    setIntervalFn: appShellComposition.resolveFunction('setInterval'),
    showCrashScreen,
    unhandledRejectionInput: ClientReporting.unhandledRejectionInput,
    updateOnlineStatus: updateOnlineTabState,
    windowErrorInput: ClientReporting.windowErrorInput,
    windowTarget: appShellComposition.resolve('root'),
});
const appShellStartupRuntime = AppShellStartupRuntime.createRuntime({
    eventBindings: appShellEventBindings,
    getOnlineElements: () => {
        const documentRef = appShellComposition.resolve('document');
        return {
            tabButton: documentRef.getElementById('tabOnline'),
            notice: documentRef.getElementById('offlineNotice'),
            createButton: documentRef.getElementById('onlineCreateSubmitButton'),
            joinButton: documentRef.getElementById('onlineJoinSubmitButton'),
        };
    },
    getOnlineState: () => {
        const navigatorRef = appShellComposition.resolve('navigator');
        return navigatorRef ? navigatorRef.onLine : false;
    },
    pwaController: _pwaInstallController,
    runtimeEffects: appShellRuntimeEffects,
    tabEffects: UiTabEffects,
    tabView: UiTabView,
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
    getOnlineRetryPolicy: () => appShellComposition.resolve('onlineRetryPolicy'),
    getRoot: () => appShellComposition.resolve('root'),
    hasActiveBlockingModal,
    hasUsablePendingAction,
    hasUsablePrimaryAction,
    monitor: freezeWatchdogMonitor,
    monitorActions: UiWatchdogMonitor.ACTIONS,
    now: () => Date.now(),
    recover: snapshot => recoverUiInteractability(snapshot),
    report: input => reportClientError(input),
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

function reportAbandonedCpuStep() {
    const key = 'machikoroActiveCpuStep';
    const incident = ClientCheckpoint.abandonedCpuStepIncident(
        safeAppShellStorageGet(key, ''),
        Date.now()
    );
    if (incident.kind === 'discard') {
        safeAppShellStorageRemove(key);
        return false;
    }
    if (incident.kind !== 'report') return false;
    const accepted = reportClientError({
        source: 'cpu-step-abandoned',
        message: 'strong CPU step did not complete before restart',
        stack: 'CPU_STEP_INCIDENT ' + JSON.stringify(incident.summary),
    });
    if (accepted) safeAppShellStorageRemove(key);
    return accepted;
}

if (appShellRoot) {
    appShellRoot.__machikoroSendTestErrorReport = sendDebugClientErrorReport;
}

// Register before main.js evaluates so startup failures can still reach the crash UI.
if (appShellRoot) {
    bindCrashHandlers();
    flushClientErrorReports();
    flushGameLifecycleNotifications();
    reportAbandonedCpuStep();
}

function initMainView() {
    return appShellStartupRuntime.initMainView();
}
