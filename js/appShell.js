const appShellStorage = AppShellStorage.createFacade();

function appShellGameRuntimeSnapshot() {
    return GameRuntimeState.runtime.snapshot();
}

function appShellOnlineRuntimeSnapshot() {
    return OnlineRuntimeState.runtime.snapshot();
}

// ===== クライアントエラー通知 =====
const CLIENT_ERROR_REPORT_ENDPOINT = '/api/client-error';
const CLIENT_ERROR_REPORT_STACK_LIMIT = 2400;
const CLIENT_ERROR_REPORT_MESSAGE_LIMIT = 500;
const CLIENT_ERROR_REPORT_SUPPRESS_MS = 10000;
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
const clientErrorAdmissionController = ClientReporting.createAdmissionController({
    suppressMs: CLIENT_ERROR_REPORT_SUPPRESS_MS,
    now: () => Date.now(),
});
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

function safeClientErrorUrl() {
    return ClientReporting.clientUrl(
        typeof window !== 'undefined' ? window.location : null
    );
}

function safeClientErrorContext() {
    const gameState = appShellGameRuntimeSnapshot();
    const onlineState = appShellOnlineRuntimeSnapshot();
    return ClientReporting.runtimeContext({
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        phase: gameState.game ? gameState.game.phase : '',
        roomId: onlineState.myRoomId || '',
        playerIndex: onlineState.myPlayerIndex,
        appVersion: typeof window !== 'undefined' ? window.MACHIKORO_CLIENT_VERSION : '',
        url: safeClientErrorUrl(),
    });
}

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
function resetAccessibleModalStateForRecovery() {
    try { if (typeof activeModalId !== 'undefined') activeModalId = null; } catch (_) {}
    try { if (typeof lastModalFocus !== 'undefined') lastModalFocus = null; } catch (_) {}
    try { if (typeof modalInertRestore !== 'undefined') modalInertRestore = []; } catch (_) {}
}

function resetFreezeWatchdogState(reason = 'watchdog-reset') {
    freezeWatchdogMonitor.reset();
    safeAppShellStorageRemove('machikoroFreezeSnapshot');
    markClientFlowCheckpoint(reason);
}

function clearShellElementLock(id) {
    return appShellRecoveryEffects.clearShellLock(id);
}

function resetUiLocksForGameReset(reason = 'game-reset') {
    resetAccessibleModalStateForRecovery();
    try {
        const root = typeof window !== 'undefined' ? window : globalThis;
        if (root) root.__machikoroConfirmModalOpen = false;
    } catch (_) {}
    ['confirmModal', 'pendingModal', 'rulesModal', 'cardSelectModal', 'cardDetailModal']
        .forEach(id => appShellRecoveryEffects.hide(id));
    ['titleScreen', 'gameScreen', 'pwaUpdateBanner', 'pwaInstallBanner'].forEach(clearShellElementLock);
    appShellRecoveryEffects.removeBodyModalOpen();
    resetFreezeWatchdogState(reason + '-watchdog');
    markClientFlowCheckpoint(reason, { recovery: 'game-reset-ui-locks' });
}

function modalSnapshotFromRuntime(snapshot, id) {
    if (snapshot && snapshot.ui) {
        if (id === 'confirmModal') return snapshot.ui.confirmModal;
        if (id === 'pendingModal') return snapshot.ui.pendingModal;
    }
    return safeElementSnapshot(id);
}

function explicitModalOpenFromSnapshot(snapshot, id) {
    return UiWatchdog.isExplicitModalOpen(modalSnapshotFromRuntime(snapshot, id));
}

function confirmModalOpenFromSnapshot(snapshot) {
    return explicitModalOpenFromSnapshot(snapshot, 'confirmModal');
}

function isConfirmModalAwaitingUserChoice() {
    try {
        const root = typeof window !== 'undefined' ? window : globalThis;
        return !!(root && root.__machikoroConfirmModalOpen === true);
    } catch (_) {
        return false;
    }
}

function isStaleConfirmModalSnapshot(snapshot) {
    return UiWatchdog.isStaleConfirmModalSnapshot(snapshot, {
        confirmOpen: confirmModalOpenFromSnapshot(snapshot),
        awaitingChoice: isConfirmModalAwaitingUserChoice(),
    });
}

function activeBlockingModalIds(snapshot) {
    return Array.isArray(snapshot && snapshot.visibleModals)
        ? snapshot.visibleModals.filter(id => id !== 'pendingModal' && explicitModalOpenFromSnapshot(snapshot, id) && (id !== 'confirmModal' || !isStaleConfirmModalSnapshot(snapshot)))
        : [];
}

function hasActiveBlockingModal(snapshot) {
    return activeBlockingModalIds(snapshot).length > 0;
}

function isStalePendingModalSnapshot(snapshot) {
    return UiWatchdog.isStalePendingModalSnapshot(
        snapshot,
        explicitModalOpenFromSnapshot(snapshot, 'pendingModal')
    );
}

function clearElementModalLock(id) {
    return appShellRecoveryEffects.clearModalLock(id);
}

function isActiveGameScreenRecoverySnapshot(snapshot) {
    return UiWatchdog.isActiveGameScreenRecoverySnapshot(snapshot);
}

function shouldRestoreGameScreenDisplay(snapshot) {
    return UiWatchdog.shouldRestoreGameScreenDisplay(snapshot);
}

function clearGameScreenLockIfNoActiveModal(snapshot, reason = 'game-screen-lock-recovery') {
    if (hasActiveBlockingModal(snapshot)) return false;
    const allowed = Array.isArray(snapshot && snapshot.allowedActions) ? snapshot.allowedActions : [];
    const expected = expectedPrimaryActions(snapshot || {});
    const expectedPending = expectedPendingActions(snapshot || {});
    if (!allowed.includes('nextTurn') && !expected.length && !expectedPending.length) return false;
    let changed = clearElementModalLock('gameScreen');
    if (shouldRestoreGameScreenDisplay(snapshot)) {
        changed = appShellRecoveryEffects.restoreDisplay('gameScreen') || changed;
    }
    if (changed) markClientFlowCheckpoint(reason, { recovery: 'orphan-game-screen-lock' });
    return changed;
}

function forceClearModalLocksForRecovery(snapshot = null) {
    if (hasActiveBlockingModal(snapshot)) return false;
    let changed = false;
    ['titleScreen', 'gameScreen', 'pwaUpdateBanner', 'pwaInstallBanner'].forEach(id => {
        changed = clearElementModalLock(id) || changed;
    });
    changed = appShellRecoveryEffects.removeBodyModalOpen() || changed;
    return changed;
}

function forceClearStaleModalLocksForRecovery() {
    ['titleScreen', 'gameScreen', 'pwaUpdateBanner', 'pwaInstallBanner']
        .forEach(id => appShellRecoveryEffects.forceClearModalLock(id));
    appShellRecoveryEffects.removeBodyModalOpen();
}

function closeStaleConfirmModal(snapshot, reason = 'stale-confirm-recovery') {
    if (!isStaleConfirmModalSnapshot(snapshot)) return false;
    const confirmModal = typeof document !== 'undefined' && document.getElementById ? document.getElementById('confirmModal') : null;
    if (!confirmModal) return false;
    try {
        if (typeof closeConfirmModal === 'function') closeConfirmModal(false);
        else if (typeof closeAccessibleModal === 'function') closeAccessibleModal('confirmModal', { restoreFocus: false });
        else appShellRecoveryEffects.hide('confirmModal');
    } catch (_) {
        appShellRecoveryEffects.hide('confirmModal');
    }
    forceClearStaleModalLocksForRecovery();
    resetAccessibleModalStateForRecovery();
    markClientFlowCheckpoint(reason, { modal: 'confirmModal' });
    return true;
}

function closeStaleBlockingModals(snapshot, reason = 'ui-unlock') {
    let closed = closeStaleConfirmModal(snapshot, reason + '-confirm');
    const pendingModal = typeof document !== 'undefined' && document.getElementById ? document.getElementById('pendingModal') : null;
    if (pendingModal && pendingModal.style && isStalePendingModalSnapshot(snapshot)) {
        appShellRecoveryEffects.hide('pendingModal');
        appShellRecoveryEffects.clearPointerEvents('pendingMenu');
        closed = true;
    }
    if (closed) resetAccessibleModalStateForRecovery();
    return closed;
}

function clearUiLocks(reason = 'ui-unlock', snapshot = null) {
    closeStaleBlockingModals(snapshot, reason);
    const changed = forceClearModalLocksForRecovery(snapshot);
    clearGameScreenLockIfNoActiveModal(snapshot, reason + '-game-screen');
    if (changed || !hasActiveBlockingModal(snapshot)) markClientFlowCheckpoint(reason);
}

function isPostBuildNextTurnSnapshot(snapshot) {
    return UiWatchdog.isPostBuildNextTurnSnapshot(snapshot, hasActiveBlockingModal(snapshot));
}

function stabilizePostBuildNextTurnUi(reason = 'post-build-ui-stabilizer') {
    const snapshot = buildClientRuntimeSnapshot(reason);
    if (!isPostBuildNextTurnSnapshot(snapshot)) return false;
    const btnSkip = typeof document !== 'undefined' && document.getElementById ? document.getElementById('btnSkip') : null;
    if (!btnSkip) return false;
    let changed = false;
    if (btnSkip.disabled) {
        btnSkip.disabled = false;
        changed = true;
    }
    if (btnSkip.textContent !== '建設完了・ターン終了') {
        btnSkip.textContent = '建設完了・ターン終了';
        changed = true;
    }
    changed = clearGameScreenLockIfNoActiveModal(snapshot, reason + '-game-screen') || changed;
    if (changed) markClientFlowCheckpoint(reason, { recovery: 'post-build-next-turn-ui' });
    return changed;
}

function schedulePostBuildUiStabilizer(reason = 'post-build-ui-stabilizer') {
    if (postBuildUiStabilizerBatch.snapshot().pending) return false;
    const snapshot = buildClientRuntimeSnapshot(reason + '-schedule');
    if (!isPostBuildNextTurnSnapshot(snapshot)) return false;
    const delays = [0, 250, 1500, 3500];
    if (!postBuildUiStabilizerBatch.begin(delays.length)) return false;
    const run = () => {
        stabilizePostBuildNextTurnUi(reason);
        postBuildUiStabilizerBatch.complete();
    };
    try {
        if (typeof setTimeout === 'function') delays.forEach(delay => setTimeout(run, delay));
        else while (postBuildUiStabilizerBatch.snapshot().pending) run();
    } catch (_) {
        while (postBuildUiStabilizerBatch.snapshot().pending) run();
    }
    return true;
}

function unlockUiForHumanTurn(reason = 'human-turn-unlock') {
    const snapshot = buildClientRuntimeSnapshot(reason);
    if (!isHumanTurnSnapshot(snapshot) || isOnlineUiBlockedSnapshot(snapshot)) return false;
    if (!expectedPrimaryActions(snapshot).length) return false;
    if (hasActiveBlockingModal(snapshot)) return false;
    clearUiLocks(reason + '-before-render', snapshot);
    try { appShellRuntimeEffects.render(); } catch (_) {}
    const afterRender = buildClientRuntimeSnapshot(reason + '-after-render');
    if (!isHumanTurnSnapshot(afterRender) || isOnlineUiBlockedSnapshot(afterRender)) return false;
    if (hasActiveBlockingModal(afterRender)) return false;
    const issues = validateUiInteractability(afterRender).filter(issue => issue.freezeKind === FREEZE_KINDS.HUMAN_TURN_UI_LOCKED);
    let changed = clearGameScreenLockIfNoActiveModal(afterRender, reason + '-game-screen');
    changed = syncAllowedActionContainersForRender(afterRender, issues) || changed;
    changed = clearUiInteractabilityIssueTargets(issues) || changed;
    clearUiLocks(reason + '-after-render', afterRender);
    if (changed) markClientFlowCheckpoint(reason + '-after-render-sync');
    markClientFlowCheckpoint(reason);
    return true;
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


function compactFreezeSummaryStackForReport(stack, limit = CLIENT_ERROR_REPORT_STACK_LIMIT) {
    return ClientReporting.compactFreezeSummaryStack(stack, {
        limit,
        schemaVersion: FREEZE_SUMMARY_SCHEMA_VERSION,
    });
}

function clientErrorStackForReport(input) {
    return ClientReporting.stackForReport(input, {
        limit: CLIENT_ERROR_REPORT_STACK_LIMIT,
        schemaVersion: FREEZE_SUMMARY_SCHEMA_VERSION,
    });
}

function buildClientErrorReport(input) {
    return ClientReporting.buildReport(input, safeClientErrorContext(), {
        messageLimit: CLIENT_ERROR_REPORT_MESSAGE_LIMIT,
        stack: clientErrorStackForReport(input || {}),
    });
}

function clientErrorReportKey(report) {
    return ClientReporting.reportKey(report);
}

function reportClientError(input) {
    return ClientReportingTransport.send({
        fetchImpl: typeof fetch === 'function' ? fetch : null,
        endpoint: CLIENT_ERROR_REPORT_ENDPOINT,
        source: input?.source || 'unknown',
        buildReport: () => buildClientErrorReport(input || {}),
        shouldSend(report) {
            const admission = clientErrorAdmissionController.admit(
                clientErrorReportKey(report)
            );
            if (!admission.shouldSend) {
                markClientFlowCheckpoint('client-error-suppressed', { source: report.source, message: report.message });
                return false;
            }
            return true;
        },
        checkpoint: markClientFlowCheckpoint,
    });
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
const crashScreenController = CrashScreen.createController();

function trapCrashScreenFocus(event) {
    const crashState = crashScreenController.snapshot();
    if (!crashState.shown || event.key !== 'Tab') return;
    const el = document.getElementById('crashScreen');
    const focusables = CrashScreenEffects.focusableElements(el);
    const plan = CrashScreen.focusTrapPlan({
        shown: crashState.shown,
        key: event.key,
        shiftKey: event.shiftKey,
        focusableCount: focusables.length,
        activeIndex: focusables.indexOf(document.activeElement),
    });
    CrashScreenEffects.applyFocusTrap(plan, event, el, focusables);
}

function showCrashScreen(err) {
    const transition = crashScreenController.show();
    if (!transition.changed) return;
    appShellRuntimeEffects.cancelCpu('game-lifecycle-reset-cpu');
    const el = document.getElementById('crashScreen');
    if (!el) return;
    const view = CrashScreen.buildView(err, safeAppShellStorageGet('savedGame'));
    const elements = {
        screen: el,
        message: document.getElementById('crashMessage'),
        resumeButton: document.getElementById('crashResumeBtn'),
        reloadButton: el.querySelector && el.querySelector('[data-ui-action="reloadPage"]'),
    };
    CrashScreenEffects.applyView(elements, view);
    if (typeof document.addEventListener === 'function') {
        document.addEventListener('keydown', trapCrashScreenFocus, true);
    }
    CrashScreenEffects.focusInitial(elements, view.initialFocus);
}

function crashResume() {
    crashScreenController.hide();
    if (typeof document.removeEventListener === 'function') document.removeEventListener('keydown', trapCrashScreenFocus, true);
    CrashScreenEffects.hide(document.getElementById('crashScreen'));
    appShellRuntimeEffects.resumeGame();
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
    markClientFlowCheckpoint('debug-client-error-report-start', { message });
    return reportClientError({
        source: 'debug-client-test',
        message,
        stack: 'Manual client-side debug report; no real error occurred. ' + JSON.stringify(buildClientRuntimeSnapshot('debug-client-test')).slice(0, 1600),
    });
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
