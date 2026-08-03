const appShellStorage = AppShellStorage.createFacade();

// ===== クライアントエラー通知 =====
const CLIENT_ERROR_REPORT_ENDPOINT = '/api/client-error';
const CLIENT_ERROR_REPORT_STACK_LIMIT = 2400;
const CLIENT_ERROR_REPORT_MESSAGE_LIMIT = 500;
const CLIENT_ERROR_REPORT_SUPPRESS_MS = 10000;
const FREEZE_WATCHDOG_INTERVAL_MS = 1000;
const FREEZE_WATCHDOG_THRESHOLD_MS = 5000;
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
let _clientErrorReportingBound = false;
let _consoleErrorHooked = false;
let _lastClientErrorReport = { key: '', time: 0 };
let _onlineStatusHandlersBound = false;
let _mainViewResizeBound = false;
let _freezeWatchdogBound = false;
let _freezeWatchdogLastKey = '';
let _freezeWatchdogLastChangedAt = 0;
let _freezeWatchdogLastReportKey = '';
let _freezeWatchdogLastReportAt = 0;
let _postBuildUiStabilizerPending = false;

const truncateClientErrorField = ClientReporting.truncateField;

function safeClientErrorUrl() {
    return ClientReporting.clientUrl(
        typeof window !== 'undefined' ? window.location : null
    );
}

function safeClientErrorContext() {
    return ClientReporting.runtimeContext({
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        phase: typeof game !== 'undefined' && game ? game.phase : '',
        roomId: typeof myRoomId !== 'undefined' ? myRoomId : '',
        playerIndex: typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : null,
        appVersion: typeof window !== 'undefined' ? window.MACHIKORO_CLIENT_VERSION : '',
        url: safeClientErrorUrl(),
    });
}

function elementHasBlockingAncestor(id, el) {
    try {
        if (el && typeof el.closest === 'function' && el.closest('[inert], [aria-hidden="true"]')) return true;
    } catch (_) {}
    if (['btnRoll', 'btnSkip', 'btnReroll', 'diceChoose', 'buildMenu'].includes(id)) {
        const gameScreen = typeof document !== 'undefined' && document.getElementById ? document.getElementById('gameScreen') : null;
        if (gameScreen && (gameScreen.inert || (typeof gameScreen.getAttribute === 'function' && gameScreen.getAttribute('aria-hidden') === 'true'))) return true;
        if (gameScreen && gameScreen.style && gameScreen.style.display === 'none') return true;
    }
    return false;
}

function childInteractiveState(el) {
    if (!el || typeof el.querySelectorAll !== 'function') return { total: 0, usable: 0 };
    let children = [];
    try {
        children = Array.from(el.querySelectorAll('button, [role="button"], [data-action], [data-ui-action], input, select, textarea, a[href]') || []);
    } catch (_) {
        return { total: 0, usable: 0 };
    }
    let usable = 0;
    children.forEach(child => {
        if (!child || child.disabled || child.hidden || child.inert) return;
        const style = child.style || {};
        let computedDisplay = '';
        let computedVisibility = '';
        let computedPointerEvents = '';
        try {
            if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
                const computed = window.getComputedStyle(child);
                computedDisplay = computed && computed.display || '';
                computedVisibility = computed && computed.visibility || '';
                computedPointerEvents = computed && computed.pointerEvents || '';
            }
        } catch (_) {}
        if (style.display === 'none' || computedDisplay === 'none') return;
        if (style.visibility === 'hidden' || computedVisibility === 'hidden') return;
        if (style.pointerEvents === 'none' || computedPointerEvents === 'none') return;
        try {
            if (typeof child.closest === 'function' && child.closest('[inert], [aria-hidden="true"]')) return;
        } catch (_) {}
        usable++;
    });
    return { total: children.length, usable };
}

function hasBuildableCardCandidate() {
    try {
        if (typeof game === 'undefined' || !game || game.builtThisTurn) return false;
        const current = game.currentPlayer && game.currentPlayer();
        if (!current || typeof CARDS === 'undefined' || !Array.isArray(CARDS)) return false;
        return CARDS.some(card => {
            if (!card) return false;
            if (typeof cardFilter !== 'undefined' && cardFilter && card.color !== cardFilter) return false;
            const stock = typeof SHOP_STOCK !== 'undefined' && SHOP_STOCK ? SHOP_STOCK[card.name] : 0;
            if (stock <= 0 || current.coins < card.cost) return false;
            return !(card.color === 'purple' && typeof current.countCardIncludingDormant === 'function' && current.countCardIncludingDormant(card.name) > 0);
        });
    } catch (_) {
        return true;
    }
}

function hasBuildableLandmarkCandidate() {
    try {
        if (typeof game === 'undefined' || !game || game.builtThisTurn) return false;
        const current = game.currentPlayer && game.currentPlayer();
        if (!current || !current.landmarks) return false;
        return Object.entries(current.landmarks).some(([name, built]) => {
            if (built) return false;
            if (typeof enabledLandmarks !== 'undefined' && enabledLandmarks && typeof enabledLandmarks.has === 'function' && !enabledLandmarks.has(name)) return false;
            if (typeof Player === 'undefined' || !Player || typeof Player.landmarkCost !== 'function') return false;
            return current.coins >= Player.landmarkCost(name);
        });
    } catch (_) {
        return true;
    }
}

function expectedChildSpecForAction(action) {
    return ActionUiRegistry.childSelectors[action] || null;
}

function expectedChildSpecForEntry(snapshot, entry) {
    const action = entry && entry.action || '';
    if ((action === 'buildCard' || action === 'buildLandmark') && snapshot && snapshot.builtThisTurn) return null;
    if (action === 'buildCard' && !hasBuildableCardCandidate()) return null;
    if (action === 'buildLandmark' && !hasBuildableLandmarkCandidate()) return null;
    if (action === 'undoBuild') {
        try {
            if (typeof undoState === 'undefined' || !undoState || !(snapshot && snapshot.builtThisTurn)) return null;
        } catch (_) {
            return null;
        }
    }
    return expectedChildSpecForAction(action);
}

function expectedChildActionsForAction(action) {
    const spec = expectedChildSpecForAction(action);
    return spec ? Array.from(spec.actions) : [];
}

function expectedChildActionsForEntry(snapshot, entry) {
    const spec = expectedChildSpecForEntry(snapshot, entry);
    return spec ? Array.from(spec.actions) : [];
}

function isInteractiveChildUsable(child) {
    if (!child || child.disabled || child.hidden || child.inert) return false;
    const style = child.style || {};
    let computedDisplay = '';
    let computedVisibility = '';
    let computedPointerEvents = '';
    try {
        if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            const computed = window.getComputedStyle(child);
            computedDisplay = computed && computed.display || '';
            computedVisibility = computed && computed.visibility || '';
            computedPointerEvents = computed && computed.pointerEvents || '';
        }
    } catch (_) {}
    if (style.display === 'none' || computedDisplay === 'none') return false;
    if (style.visibility === 'hidden' || computedVisibility === 'hidden') return false;
    if (style.pointerEvents === 'none' || computedPointerEvents === 'none') return false;
    try {
        if (typeof child.closest === 'function' && child.closest('[inert], [aria-hidden="true"]')) return false;
    } catch (_) {}
    return true;
}

function childInteractiveStateForSpec(el, spec) {
    if (!el || !spec || typeof el.querySelectorAll !== 'function') return { total: 0, usable: 0 };
    let children = [];
    try {
        children = Array.from(el.querySelectorAll(spec.selector) || []);
    } catch (_) {
        children = [];
    }
    if (children.length <= 0 && typeof el.innerHTML === 'string' && el.innerHTML) {
        let total = 0;
        let usableFromHtml = 0;
        (spec.actions || []).forEach(action => {
            const escaped = String(action).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp("<[^>]+data-action=[\"']" + escaped + "[\"'][^>]*>", 'g');
            const matches = el.innerHTML.match(re) || [];
            total += matches.length;
            usableFromHtml += matches.filter(tag => !/\sdisabled(?:\s|=|>|$)/i.test(tag)).length;
        });
        return { total, usable: usableFromHtml };
    }
    let usable = 0;
    children.forEach(child => {
        if (isInteractiveChildUsable(child)) usable++;
    });
    return { total: children.length, usable };
}

function childInteractiveStateForActions(el, actions) {
    const expected = new Set(actions || []);
    if (!expected.size) return { total: 0, usable: 0 };
    return childInteractiveStateForSpec(el, {
        actions: Array.from(expected),
        selector: Array.from(expected).map(action => '[data-action="' + String(action) + '"]').join(', '),
    });
}

function compactActionChildStates(snapshot) {
    return expectedActionContainerEntries(snapshot || {}).map(entry => {
        const spec = entry && entry.spec;
        const childSpec = expectedChildSpecForEntry(snapshot, entry);
        const parent = spec && spec.targetId && typeof document !== 'undefined' && document.getElementById ? document.getElementById(spec.targetId) : null;
        const state = childSpec ? childInteractiveStateForSpec(parent, childSpec) : { total: 0, usable: 0 };
        return {
            action: entry && entry.action || '',
            target: spec && spec.targetId || '',
            childTotal: state.total || 0,
            childUsable: state.usable || 0,
        };
    }).filter(item => item.childTotal > 0 || item.action === 'undoBuild' || item.childUsable <= 0);
}

function safeElementSnapshot(id) {
    const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null;
    if (!el) return null;
    let computedPointerEvents = '';
    let computedDisplay = '';
    let computedVisibility = '';
    try {
        if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            const style = window.getComputedStyle(el);
            computedPointerEvents = style && style.pointerEvents || '';
            computedDisplay = style && style.display || '';
            computedVisibility = style && style.visibility || '';
        }
    } catch (_) {}
    const ancestorBlocked = elementHasBlockingAncestor(id, el);
    const childState = childInteractiveState(el);
    return {
        id,
        display: el.style ? el.style.display || '' : '',
        computedDisplay,
        visibility: el.style ? el.style.visibility || '' : '',
        computedVisibility,
        pointerEvents: el.style ? el.style.pointerEvents || '' : '',
        computedPointerEvents,
        disabled: !!el.disabled,
        hidden: !!el.hidden,
        inert: !!el.inert,
        ancestorBlocked,
        ariaHidden: typeof el.getAttribute === 'function' ? el.getAttribute('aria-hidden') : null,
        className: el.className || '',
        htmlLength: typeof el.innerHTML === 'string' ? el.innerHTML.length : 0,
        totalInteractiveChildren: childState.total,
        usableInteractiveChildren: childState.usable,
        text: typeof el.textContent === 'string' ? truncateClientErrorField(el.textContent, 120) : '',
    };
}

function visibleElement(id) {
    const snapshot = safeElementSnapshot(id);
    if (!snapshot) return false;
    return snapshot.display !== 'none' && snapshot.computedDisplay !== 'none' && snapshot.visibility !== 'hidden' && snapshot.computedVisibility !== 'hidden' && !snapshot.hidden;
}

function visibleModalIds() {
    return ['confirmModal', 'pendingModal', 'rulesModal', 'cardSelectModal', 'cardDetailModal']
        .filter(id => visibleElement(id));
}

function classListText(el) {
    return UiWatchdog.classListText(el);
}

function allowedActionListForSnapshot() {
    if (typeof game === 'undefined' || !game) return [];
    try {
        if (typeof game.allowedActions === 'function') return Array.from(game.allowedActions());
        if (typeof GameManager !== 'undefined' && GameManager && typeof GameManager.allowedActionsFor === 'function') return Array.from(GameManager.allowedActionsFor(game));
    } catch (_) {}
    return [];
}

function isElementUsablyEnabled(snapshot) {
    return UiWatchdog.isElementUsablyEnabled(snapshot);
}

function collectUiLockSnapshot(reason = 'ui-lock-snapshot') {
    return buildClientRuntimeSnapshot(reason);
}

function uiLockReasonForElement(state) {
    return UiWatchdog.lockReasonForElement(state);
}

function actionContainerSpecForAction(snapshot, action) {
    return ActionUiRegistry.containerSpecForAction(snapshot, action);
}

function expectedActionContainerEntries(snapshot) {
    const allowed = Array.isArray(snapshot && snapshot.allowedActions) ? snapshot.allowedActions : [];
    return allowed
        .map(action => ({ action, spec: actionContainerSpecForAction(snapshot, action) }))
        .filter(entry => !!entry.spec);
}

function shouldIgnoreInactiveActionContainerIssue(snapshot, entry, reason) {
    const childSpec = expectedChildSpecForEntry(snapshot, entry);
    return UiWatchdog.shouldIgnoreInactiveActionContainerIssue(entry && entry.spec, !!childSpec, reason);
}

function missingActionContainerRegistryEntries(snapshot) {
    return ActionUiRegistry.missingContainerEntries(snapshot);
}

function primaryActionContainerRegistryForDiagnostics() {
    return ActionUiRegistry.snapshot();
}

function snapshotStateById(snapshot, id, targetSource = '') {
    return UiWatchdog.snapshotStateById(snapshot, id, targetSource);
}

function snapshotElementForAction(snapshot, action) {
    const spec = actionContainerSpecForAction(snapshot, action);
    return spec ? snapshotStateById(snapshot, spec.targetId, spec.targetSource) : null;
}

function isActionContainerUiUsable(snapshot, entry) {
    const spec = entry && entry.spec;
    if (!spec) return false;
    const state = snapshotStateById(snapshot, spec.targetId, spec.targetSource);
    const expectedChildSpec = expectedChildSpecForEntry(snapshot, entry);
    let actionChildState = null;
    if (spec.requiresContent && expectedChildSpec) {
        const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(spec.targetId) : null;
        actionChildState = childInteractiveStateForSpec(el, expectedChildSpec);
    }
    return UiWatchdog.isActionContainerStateUsable(spec, state, {
        hasExpectedChildSpec: !!expectedChildSpec,
        actionChildState,
        modalState: spec.modalId ? snapshotStateById(snapshot, spec.modalId) : null,
    });
}

function isActionUiUsable(snapshot, action) {
    const spec = actionContainerSpecForAction(snapshot, action);
    return isActionContainerUiUsable(snapshot, { action, spec });
}

function validateUiInteractability(snapshot = collectUiLockSnapshot()) {
    const issues = [];
    if (!snapshot || !snapshot.phase) return issues;
    const ui = snapshot.ui || {};
    const expectedContainers = expectedActionContainerEntries(snapshot);
    const expectedPending = expectedPendingActions(snapshot);
    const isMyTurn = isHumanTurnSnapshot(snapshot) && !isOnlineUiBlockedSnapshot(snapshot);
    const activeModals = activeBlockingModalIds(snapshot);

    if (activeModals.length > 1) {
        issues.push({
            kind: 'nested-blocking-modal-policy-violation',
            reason: 'nested-blocking-modal',
            target: activeModals.join(','),
            freezeKind: FREEZE_KINDS.MODAL_UI_LOCKED,
        });
    }

    for (const id of activeModals) {
        if (id === 'pendingModal') continue;
        const modal = modalSnapshotFromRuntime(snapshot, id) || ui[id];
        if (!modal) continue;
        if (modal.inert) issues.push({ kind: 'visible-modal-inert', reason: 'parent-inert', target: id, freezeKind: FREEZE_KINDS.MODAL_UI_LOCKED });
        if (modal.pointerEvents === 'none' || modal.computedPointerEvents === 'none') issues.push({ kind: 'visible-modal-pointer-events-none', reason: 'pointer-events-none', target: id, freezeKind: FREEZE_KINDS.MODAL_UI_LOCKED });
    }

    if (!isMyTurn) return issues;
    if (activeModals.length && !expectedPending.length) return issues;

    for (const entry of missingActionContainerRegistryEntries(snapshot)) {
        issues.push({
            kind: 'allowed-action-missing-container-registry',
            action: entry.action,
            target: '',
            actionTarget: entry.action,
            phase: entry.phase,
            reason: 'missing-registry',
            freezeKind: FREEZE_KINDS.HUMAN_TURN_UI_LOCKED,
        });
    }

    for (const entry of expectedContainers) {
        if (isActionContainerUiUsable(snapshot, entry)) continue;
        const state = snapshotStateById(snapshot, entry.spec.targetId, entry.spec.targetSource);
        let reason = uiLockReasonForElement(state);
        const expectedChildSpec = expectedChildSpecForEntry(snapshot, entry);
        if (reason === 'not-clickable' && expectedChildSpec) reason = 'action-child-not-clickable';
        if (entry.spec.modalId) {
            const modal = snapshotStateById(snapshot, entry.spec.modalId);
            if (modal && !isElementUsablyEnabled(modal)) reason = uiLockReasonForElement(modal);
        }
        if (shouldIgnoreInactiveActionContainerIssue(snapshot, entry, reason)) continue;
        issues.push({
            kind: 'allowed-action-container-not-clickable',
            action: entry.action,
            target: state && state.id || entry.spec.targetId,
            actionTarget: entry.action,
            phase: entry.spec.phase || snapshot.phase,
            reason,
            freezeKind: FREEZE_KINDS.HUMAN_TURN_UI_LOCKED,
        });
    }

    if (!activeModals.length && ui.gameScreen && (ui.gameScreen.inert || ui.gameScreen.display === 'none' || ui.gameScreen.computedDisplay === 'none') && expectedContainers.length) {
        issues.push({ kind: 'orphan-game-screen-lock', target: 'gameScreen', reason: ui.gameScreen.inert ? 'parent-inert' : 'parent-display-none', freezeKind: FREEZE_KINDS.HUMAN_TURN_UI_LOCKED });
    }
    if (!activeModals.length && snapshot.bodyClassName && /modal-open/.test(snapshot.bodyClassName) && expectedContainers.length) {
        issues.push({ kind: 'stale-modal-body-lock', target: 'body', reason: 'stale-modal', freezeKind: FREEZE_KINDS.HUMAN_TURN_UI_LOCKED });
    }
    return issues;
}

function primaryUiIssue(snapshot) {
    return validateUiInteractability(snapshot).find(issue => issue.freezeKind === FREEZE_KINDS.HUMAN_TURN_UI_LOCKED);
}

function primaryActionButtonStates() {
    const buttons = {
        btnRoll: safeElementSnapshot('btnRoll'),
        btnSkip: safeElementSnapshot('btnSkip'),
        btnReroll: safeElementSnapshot('btnReroll'),
        diceChoose: safeElementSnapshot('diceChoose'),
    };
    const enabled = Object.entries(buttons)
        .filter(([id, snapshot]) => {
            if (!isElementUsablyEnabled(snapshot)) return false;
            if (id === 'diceChoose') return !!snapshot.htmlLength;
            return true;
        })
        .map(([id]) => id);
    return { buttons, enabled };
}

function buildClientRuntimeSnapshot(reason = '') {
    const hasGame = typeof game !== 'undefined' && !!game;
    const currentPlayerIndex = hasGame ? game.currentPlayerIndex : null;
    let isCpuTurn = false;
    try { isCpuTurn = !!(hasGame && Array.isArray(cpuPlayers) && cpuPlayers[currentPlayerIndex]); } catch (_) {}
    let cpuStepScheduled = false;
    let cpuSchedulerHealth = null;
    try {
        if (isCpuTurn && typeof cpuTurnScheduler !== 'undefined' && cpuTurnScheduler && typeof cpuTurnScheduler.getHealth === 'function') {
            const health = cpuTurnScheduler.getHealth();
            cpuStepScheduled = !!health.stepScheduled;
            cpuSchedulerHealth = {
                blockedReason: health.blockedReason || '',
                token: Number.isInteger(health.token) ? health.token : null,
                scheduledUntil: Number.isFinite(health.scheduledUntil) ? health.scheduledUntil : 0,
                stepScheduled: !!health.stepScheduled,
            };
        } else {
            const scheduledUntil = typeof cpuStepScheduledUntil !== 'undefined' ? cpuStepScheduledUntil : 0;
            cpuStepScheduled = !!(isCpuTurn && typeof isCpuStepScheduledNow === 'function' &&
                isCpuStepScheduledNow() && Date.now() < scheduledUntil);
            cpuSchedulerHealth = isCpuTurn ? {
                blockedReason: '',
                token: typeof cpuScheduleToken !== 'undefined' && Number.isInteger(cpuScheduleToken) ? cpuScheduleToken : null,
                scheduledUntil: Number.isFinite(scheduledUntil) ? scheduledUntil : 0,
                stepScheduled: cpuStepScheduled,
            } : null;
        }
    } catch (_) {}
    let hasWinner = false;
    try { hasWinner = !!(hasGame && typeof game.checkWinner === 'function' && game.checkWinner()); } catch (_) {}
    return {
        reason,
        timestamp: new Date().toISOString(),
        phase: hasGame ? game.phase : '',
        hasWinner,
        builtThisTurn: !!(hasGame && game.builtThisTurn),
        turnCount: hasGame ? game.turnCount : null,
        currentPlayerIndex,
        isCpuTurn,
        cpuStepScheduled,
        cpuSchedulerHealth,
        isOnlineGame: typeof isOnlineGame !== 'undefined' ? !!isOnlineGame : null,
        isRoomHost: typeof isRoomHost !== 'undefined' ? !!isRoomHost : null,
        myPlayerIndex: typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : null,
        onlineActionInFlight: typeof onlineActionInFlight !== 'undefined' ? !!onlineActionInFlight : null,
        onlineActionInFlightAt: typeof onlineActionInFlightAt !== 'undefined' ? onlineActionInFlightAt : null,
        isReconnectingOnline: typeof isReconnectingOnline !== 'undefined' ? !!isReconnectingOnline : null,
        socketConnected: typeof socket !== 'undefined' && socket ? socket.connected !== false : null,
        allowedActions: allowedActionListForSnapshot(),
        activeElement: typeof document !== 'undefined' && document.activeElement ? {
            id: document.activeElement.id || '',
            tagName: document.activeElement.tagName || '',
            className: document.activeElement.className || '',
        } : null,
        bodyClassName: typeof document !== 'undefined' && document.body ? classListText(document.body) : '',
        visibleModals: visibleModalIds(),
        overlays: {
            noticeToast: safeElementSnapshot('noticeToast'),
            pwaUpdateBanner: safeElementSnapshot('pwaUpdateBanner'),
            pwaInstallBanner: safeElementSnapshot('pwaInstallBanner'),
            turnAnnouncer: safeElementSnapshot('turnAnnouncer'),
            crashScreen: safeElementSnapshot('crashScreen'),
        },
        actionButtons: primaryActionButtonStates(),
        pendingFields: hasGame ? {
            pendingTV: game.pendingTV || 0,
            pendingBusiness: game.pendingBusiness || 0,
            pendingCleaning: game.pendingCleaning || 0,
            pendingMover: game.pendingMover || 0,
            pendingRenovation: game.pendingRenovation || 0,
            pendingIT: !!game.pendingIT,
        } : null,
        ui: {
            gameScreen: safeElementSnapshot('gameScreen'),
            pendingModal: safeElementSnapshot('pendingModal'),
            pendingMenu: safeElementSnapshot('pendingMenu'),
            buildMenu: safeElementSnapshot('buildMenu'),
            btnSkip: safeElementSnapshot('btnSkip'),
            confirmModal: safeElementSnapshot('confirmModal'),
            btnRoll: safeElementSnapshot('btnRoll'),
            btnReroll: safeElementSnapshot('btnReroll'),
            diceChoose: safeElementSnapshot('diceChoose'),
            cardDetailModal: safeElementSnapshot('cardDetailModal'),
            cardSelectModal: safeElementSnapshot('cardSelectModal'),
            rulesModal: safeElementSnapshot('rulesModal'),
        },
    };
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
    _freezeWatchdogLastKey = '';
    _freezeWatchdogLastChangedAt = 0;
    _freezeWatchdogLastReportKey = '';
    _freezeWatchdogLastReportAt = 0;
    safeAppShellStorageRemove('machikoroFreezeSnapshot');
    markClientFlowCheckpoint(reason);
}

function clearShellElementLock(id) {
    const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null;
    if (!el) return false;
    let changed = clearElementModalLock(id);
    if (el.hidden) {
        el.hidden = false;
        changed = true;
    }
    return changed;
}

function resetUiLocksForGameReset(reason = 'game-reset') {
    resetAccessibleModalStateForRecovery();
    try {
        const root = typeof window !== 'undefined' ? window : globalThis;
        if (root) root.__machikoroConfirmModalOpen = false;
    } catch (_) {}
    ['confirmModal', 'pendingModal', 'rulesModal', 'cardSelectModal', 'cardDetailModal'].forEach(id => {
        const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null;
        if (el && el.style) el.style.display = 'none';
    });
    ['titleScreen', 'gameScreen', 'pwaUpdateBanner', 'pwaInstallBanner'].forEach(clearShellElementLock);
    if (typeof document !== 'undefined' && document.body && document.body.classList) {
        document.body.classList.remove('modal-open');
    }
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
    const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null;
    if (!el) return false;
    let changed = false;
    if (el.inert) {
        el.inert = false;
        changed = true;
    }
    if (typeof el.getAttribute === 'function' && el.getAttribute('aria-hidden') !== null) {
        el.removeAttribute('aria-hidden');
        changed = true;
    }
    if (el.style && el.style.pointerEvents === 'none') {
        el.style.pointerEvents = '';
        changed = true;
    }
    return changed;
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
    const gameScreen = typeof document !== 'undefined' && document.getElementById ? document.getElementById('gameScreen') : null;
    if (gameScreen && gameScreen.style && gameScreen.style.display === 'none' && shouldRestoreGameScreenDisplay(snapshot)) {
        gameScreen.style.display = 'block';
        changed = true;
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
    if (typeof document !== 'undefined' && document.body && document.body.classList && document.body.classList.contains('modal-open')) {
        document.body.classList.remove('modal-open');
        changed = true;
    }
    return changed;
}

function forceClearStaleModalLocksForRecovery() {
    ['titleScreen', 'gameScreen', 'pwaUpdateBanner', 'pwaInstallBanner'].forEach(id => {
        const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null;
        if (!el) return;
        el.inert = false;
        if (typeof el.removeAttribute === 'function') el.removeAttribute('aria-hidden');
        if (el.style && el.style.pointerEvents === 'none') el.style.pointerEvents = '';
    });
    if (typeof document !== 'undefined' && document.body && document.body.classList) document.body.classList.remove('modal-open');
}

function closeStaleConfirmModal(snapshot, reason = 'stale-confirm-recovery') {
    if (!isStaleConfirmModalSnapshot(snapshot)) return false;
    const confirmModal = typeof document !== 'undefined' && document.getElementById ? document.getElementById('confirmModal') : null;
    if (!confirmModal) return false;
    try {
        if (typeof closeConfirmModal === 'function') closeConfirmModal(false);
        else if (typeof closeAccessibleModal === 'function') closeAccessibleModal('confirmModal', { restoreFocus: false });
        else if (confirmModal.style) confirmModal.style.display = 'none';
    } catch (_) {
        if (confirmModal.style) confirmModal.style.display = 'none';
    }
    forceClearStaleModalLocksForRecovery();
    resetAccessibleModalStateForRecovery();
    markClientFlowCheckpoint(reason, { modal: 'confirmModal' });
    return true;
}

function closeStaleBlockingModals(snapshot, reason = 'ui-unlock') {
    let closed = closeStaleConfirmModal(snapshot, reason + '-confirm');
    const pendingModal = typeof document !== 'undefined' && document.getElementById ? document.getElementById('pendingModal') : null;
    const pendingMenu = typeof document !== 'undefined' && document.getElementById ? document.getElementById('pendingMenu') : null;
    if (pendingModal && pendingModal.style && isStalePendingModalSnapshot(snapshot)) {
        pendingModal.style.display = 'none';
        if (pendingMenu && pendingMenu.style) pendingMenu.style.pointerEvents = '';
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
    if (_postBuildUiStabilizerPending) return false;
    const snapshot = buildClientRuntimeSnapshot(reason + '-schedule');
    if (!isPostBuildNextTurnSnapshot(snapshot)) return false;
    _postBuildUiStabilizerPending = true;
    const delays = [0, 250, 1500, 3500];
    let remaining = delays.length;
    const run = () => {
        stabilizePostBuildNextTurnUi(reason);
        remaining--;
        if (remaining <= 0) _postBuildUiStabilizerPending = false;
    };
    try {
        if (typeof setTimeout === 'function') delays.forEach(delay => setTimeout(run, delay));
        else while (remaining > 0) run();
    } catch (_) {
        while (remaining > 0) run();
    }
    return true;
}

function unlockUiForHumanTurn(reason = 'human-turn-unlock') {
    const snapshot = buildClientRuntimeSnapshot(reason);
    if (!isHumanTurnSnapshot(snapshot) || isOnlineUiBlockedSnapshot(snapshot)) return false;
    if (!expectedPrimaryActions(snapshot).length) return false;
    if (hasActiveBlockingModal(snapshot)) return false;
    clearUiLocks(reason + '-before-render', snapshot);
    try { if (typeof render === 'function') render(); } catch (_) {}
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
            const now = Date.now();
            const key = clientErrorReportKey(report);
            if (_lastClientErrorReport.key === key && now - _lastClientErrorReport.time < CLIENT_ERROR_REPORT_SUPPRESS_MS) {
                markClientFlowCheckpoint('client-error-suppressed', { source: report.source, message: report.message });
                return false;
            }
            _lastClientErrorReport = { key, time: now };
            return true;
        },
        checkpoint: markClientFlowCheckpoint,
    });
}

// ===== ゲームライフサイクル通知 =====
const GAME_LIFECYCLE_ENDPOINT = '/api/game-lifecycle';
const GAME_LIFECYCLE_NOTIFY_KEY = 'machikoroLifecycleNotifyEnabled';
const GAME_LIFECYCLE_LEGACY_NOTIFY_KEY = 'machikoroLifecycleNotificationsEnabled';
const GAME_LIFECYCLE_START_SENT_KEY = 'machikoroLifecycleStartSent';
const GAME_LIFECYCLE_START_SUPPRESS_MS = 60 * 1000;
let _gameLifecycleState = LifecycleNotify.lifecycleState();

function readGameLifecycleNotifyValue() {
    return appShellStorage.access(storage => {
        const value = storage.getItem(GAME_LIFECYCLE_NOTIFY_KEY);
        if (value !== null) return value;
        return storage.getItem(GAME_LIFECYCLE_LEGACY_NOTIFY_KEY);
    }, null);
}

function isLifecycleNotifyFalse(value) {
    return LifecycleNotify.isDisabledValue(value);
}

function isGameLifecycleNotificationEnabled() {
    return !isLifecycleNotifyFalse(readGameLifecycleNotifyValue());
}

function setGameLifecycleNotificationEnabled(enabled) {
    appShellStorage.access(storage => {
        if (enabled) {
            storage.setItem(GAME_LIFECYCLE_NOTIFY_KEY, 'true');
            storage.removeItem(GAME_LIFECYCLE_LEGACY_NOTIFY_KEY);
        } else {
            storage.setItem(GAME_LIFECYCLE_NOTIFY_KEY, 'false');
            storage.removeItem(GAME_LIFECYCLE_LEGACY_NOTIFY_KEY);
        }
    });
    return isGameLifecycleNotificationEnabled();
}

function gameLifecycleNotifyState() {
    return LifecycleNotify.notificationState(
        GAME_LIFECYCLE_NOTIFY_KEY,
        GAME_LIFECYCLE_LEGACY_NOTIFY_KEY,
        readGameLifecycleNotifyValue()
    );
}

function createGameLifecycleSessionId() {
    return LifecycleNotify.createSessionId(Date.now(), Math.random());
}

function gameLifecycleCpuCount() {
    try {
        return LifecycleNotify.cpuCount(
            typeof cpuPlayers !== 'undefined' ? cpuPlayers : null
        );
    } catch (_) {
        return 0;
    }
}

function gameLifecyclePlayerCount() {
    try {
        if (typeof game !== 'undefined' && game && Array.isArray(game.players)) {
            return LifecycleNotify.playerCount(game.players, 0);
        }
    } catch (_) {}
    try {
        return LifecycleNotify.playerCount(null, selectedCount);
    } catch (_) {
        return 0;
    }
}

function gameLifecycleMode() {
    try {
        return LifecycleNotify.gameMode(
            typeof isOnlineGame !== 'undefined' && isOnlineGame
        );
    } catch (_) {
        return 'local';
    }
}

function gameLifecycleAppVersion() {
    return LifecycleNotify.appVersion(
        typeof window !== 'undefined' ? window.MACHIKORO_CLIENT_VERSION : ''
    );
}

function gameLifecycleStartSignature() {
    return LifecycleNotify.startSignature(
        gameLifecycleMode(),
        gameLifecyclePlayerCount(),
        gameLifecycleCpuCount()
    );
}

function recentlySentGameLifecycleStart(signature, now = Date.now()) {
    return LifecycleNotify.isRecentStart(
        safeAppShellStorageGet(GAME_LIFECYCLE_START_SENT_KEY),
        signature,
        now,
        GAME_LIFECYCLE_START_SUPPRESS_MS
    );
}

function rememberGameLifecycleStart(signature, now = Date.now()) {
    appShellStorage.access(storage => {
        storage.setItem(
            GAME_LIFECYCLE_START_SENT_KEY,
            LifecycleNotify.serializeStartMarker(signature, now)
        );
    });
}

function cpuDifficultyForWinner(winner) {
    try {
        return LifecycleNotify.winnerCpuDifficulty(
            typeof game !== 'undefined' && game ? game.players : null,
            typeof cpuPlayers !== 'undefined' ? cpuPlayers : null,
            winner
        );
    } catch (_) {
        return '';
    }
}

function buildGameLifecyclePayload(event, extra = {}) {
    _gameLifecycleState = LifecycleNotify.ensureSessionState(
        _gameLifecycleState,
        _gameLifecycleState.sessionId || createGameLifecycleSessionId()
    );
    return LifecycleNotify.buildPayload({
        event,
        mode: gameLifecycleMode(),
        playerCount: gameLifecyclePlayerCount(),
        cpuCount: gameLifecycleCpuCount(),
        sessionId: _gameLifecycleState.sessionId,
        appVersion: gameLifecycleAppVersion(),
        turn: extra.turn,
        winnerKind: extra.winnerKind,
        winnerCpuDifficulty: extra.winnerCpuDifficulty,
    });
}

function sendGameLifecycleNotification(event, extra = {}) {
    return LifecycleTransport.send({
        enabled: isGameLifecycleNotificationEnabled(),
        fetchImpl: typeof fetch === 'function' ? fetch : null,
        endpoint: GAME_LIFECYCLE_ENDPOINT,
        event,
        buildPayload: () => buildGameLifecyclePayload(event, extra),
        checkpoint: markClientFlowCheckpoint,
    });
}

function notifyGameLifecycleStart() {
    if (_gameLifecycleState.startSent) return false;
    const signature = gameLifecycleStartSignature();
    const now = Date.now();
    const recentlySent = recentlySentGameLifecycleStart(signature, now);
    const transition = LifecycleNotify.startTransition(
        _gameLifecycleState,
        recentlySent,
        recentlySent ? _gameLifecycleState.sessionId : createGameLifecycleSessionId()
    );
    _gameLifecycleState = transition.state;
    if (transition.status === 'suppressed') {
        markClientFlowCheckpoint('game-lifecycle-start-suppressed', { signature });
        return false;
    }
    if (!transition.shouldSend) return false;
    if (transition.shouldRememberStart) rememberGameLifecycleStart(signature, now);
    return sendGameLifecycleNotification('play-start');
}

function notifyGameLifecycleFinish(winner) {
    const transition = LifecycleNotify.finishTransition(_gameLifecycleState);
    _gameLifecycleState = transition.state;
    if (!transition.shouldSend) return false;
    const cpuDifficulty = cpuDifficultyForWinner(winner);
    return sendGameLifecycleNotification(
        'play-finish',
        LifecycleNotify.finishPayloadExtras(
            typeof game !== 'undefined' && game ? game.turnCount : 0,
            cpuDifficulty
        )
    );
}

function resetGameLifecycleForRestart(reason = 'game-restart') {
    _gameLifecycleState = LifecycleNotify.resetLifecycleState();
    safeAppShellStorageRemove(GAME_LIFECYCLE_START_SENT_KEY);
    markClientFlowCheckpoint(reason, { lifecycle: 'reset' });
}

if (typeof window !== 'undefined') {
    window.__machikoroSetLifecycleNotificationsEnabled = setGameLifecycleNotificationEnabled;
    window.__machikoroLifecycleNotifyState = gameLifecycleNotifyState;
    window.__machikoroSendLifecycleNotification = sendGameLifecycleNotification;
}

// ===== クラッシュ回復 =====
let _crashShown = false;


function focusableCrashScreenElements(el) {
    if (!el || typeof el.querySelectorAll !== 'function') return [];
    return Array.from(el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(node => !node.disabled && node.offsetParent !== null);
}

function trapCrashScreenFocus(event) {
    if (!_crashShown || event.key !== 'Tab') return;
    const el = document.getElementById('crashScreen');
    const focusables = focusableCrashScreenElements(el);
    const plan = CrashScreen.focusTrapPlan({
        shown: _crashShown,
        key: event.key,
        shiftKey: event.shiftKey,
        focusableCount: focusables.length,
        activeIndex: focusables.indexOf(document.activeElement),
    });
    if (!plan.preventDefault) return;
    event.preventDefault();
    if (plan.focusTarget === 'screen') {
        if (el && typeof el.focus === 'function') el.focus();
        return;
    }
    const focusTarget = plan.focusTarget === 'last'
        ? focusables[focusables.length - 1]
        : focusables[0];
    if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
}

function showCrashScreen(err) {
    if (_crashShown) return;
    _crashShown = true;
    if (typeof cpuTurnScheduler !== 'undefined' && cpuTurnScheduler && typeof cpuTurnScheduler.cancel === 'function') cpuTurnScheduler.cancel('game-lifecycle-reset-cpu');
    else if (typeof cancelCpuSchedule === 'function') cancelCpuSchedule('game-lifecycle-reset-cpu');
    else cpuScheduleToken++; // CPUループを停止
    const el = document.getElementById('crashScreen');
    if (!el) return;
    const view = CrashScreen.buildView(err, safeAppShellStorageGet('savedGame'));
    document.getElementById('crashMessage').textContent = view.message;
    const resumeBtn = document.getElementById('crashResumeBtn');
    if (resumeBtn) resumeBtn.style.display = view.resumeDisplay;
    el.style.display = 'flex';
    el.setAttribute('aria-modal', 'true');
    if (typeof el.hasAttribute !== 'function' || !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    if (typeof document.addEventListener === 'function') document.addEventListener('keydown', trapCrashScreenFocus, true);
    const focusTarget = view.initialFocus === 'resume' && resumeBtn
        ? resumeBtn
        : el.querySelector && el.querySelector('[data-ui-action="reloadPage"]');
    if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
    else if (typeof el.focus === 'function') el.focus();
}

function crashResume() {
    _crashShown = false;
    if (typeof document.removeEventListener === 'function') document.removeEventListener('keydown', trapCrashScreenFocus, true);
    document.getElementById('crashScreen').style.display = 'none';
    resumeGame();
}

// ===== オフライン検知 =====
function updateOnlineTabState() {
    const view = UiTabView.buildOnlineAvailabilityView(navigator.onLine);
    const tabBtn = document.getElementById('tabOnline');
    const notice = document.getElementById('offlineNotice');
    const createBtn = document.getElementById('onlineCreateSubmitButton');
    const joinBtn = document.getElementById('onlineJoinSubmitButton');
    if (tabBtn) tabBtn.style.opacity = view.tabOpacity;
    if (notice) notice.style.display = view.noticeDisplay;
    if (createBtn) createBtn.disabled = view.actionDisabled;
    if (joinBtn) joinBtn.disabled = view.actionDisabled;
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

function handleWindowErrorEvent(e) {
    reportClientError(ClientReporting.windowErrorInput(e));
    showCrashScreen(e?.error || e?.message);
}

function handleWindowUnhandledRejection(e) {
    reportClientError(ClientReporting.unhandledRejectionInput(e));
    showCrashScreen(e?.reason);
}

function bindConsoleErrorReporting() {
    if (_consoleErrorHooked || typeof console === 'undefined' || typeof console.error !== 'function') return;
    const originalConsoleError = console.error.bind(console);
    console.error = (...args) => {
        originalConsoleError(...args);
        reportClientError(ClientReporting.consoleErrorInput(args));
    };
    _consoleErrorHooked = true;
}

function bindCrashHandlers() {
    if (_clientErrorReportingBound) return;
    window.onerror = (message, filename, lineno, colno, error) => {
        handleWindowErrorEvent({ message, filename, lineno, colno, error });
        return false;
    };
    window.onunhandledrejection = handleWindowUnhandledRejection;
    window.addEventListener('error', handleWindowErrorEvent);
    window.addEventListener('unhandledrejection', handleWindowUnhandledRejection);
    bindConsoleErrorReporting();
    _clientErrorReportingBound = true;
}

function bindOnlineStatusHandlers() {
    if (_onlineStatusHandlersBound) {
        updateOnlineTabState();
        return;
    }
    window.addEventListener('online', updateOnlineTabState);
    window.addEventListener('offline', updateOnlineTabState);
    _onlineStatusHandlersBound = true;
    updateOnlineTabState();
}

function bindPwaInstallHandlers() {
    return _pwaInstallController.bindInstallHandlers();
}

function freezeWatchdogStateKey(snapshot) {
    return UiWatchdog.stateKey(snapshot);
}

function isOnlineActionTimedOutForWatchdog(snapshot, now = Date.now()) {
    if (!snapshot || !snapshot.onlineActionInFlight) return false;
    if (typeof OnlineRetryPolicy === 'undefined' ||
            !OnlineRetryPolicy ||
            typeof OnlineRetryPolicy.isActionAckTimedOut !== 'function') return false;
    return OnlineRetryPolicy.isActionAckTimedOut(snapshot.onlineActionInFlightAt, now);
}

function hasPendingWork(snapshot) {
    return UiWatchdog.hasPendingWork(snapshot);
}

function classifyLikelyFreeze(snapshot) {
    if (!snapshot || !snapshot.phase || snapshot.hasWinner) return '';
    const ui = snapshot.ui || {};
    const isMyTurn = !snapshot.isOnlineGame || snapshot.currentPlayerIndex === snapshot.myPlayerIndex;
    const skipDisabled = !!(ui.btnSkip && ui.btnSkip.disabled);
    const gameInert = !!(ui.gameScreen && ui.gameScreen.inert);
    const gameScreenHidden = !!(ui.gameScreen && (ui.gameScreen.display === 'none' || ui.gameScreen.computedDisplay === 'none'));
    const confirmOpen = confirmModalOpenFromSnapshot(snapshot);
    const staleConfirmOpen = isStaleConfirmModalSnapshot(snapshot);
    const activeBlockingModalOpen = hasActiveBlockingModal(snapshot);
    const onlineBlocked = isOnlineUiBlockedSnapshot(snapshot);
    const pendingOpenWithoutContent = snapshot.phase === 'pending' && isMyTurn && !snapshot.isCpuTurn && !hasPendingWork(snapshot) && !(ui.pendingMenu && ui.pendingMenu.htmlLength > 0);
    const stalePendingOpen = isStalePendingModalSnapshot(snapshot);
    const expectedActions = expectedPrimaryActions(snapshot);
    const expectedPending = expectedPendingActions(snapshot);
    const noUsablePrimaryAction = isMyTurn && !snapshot.isCpuTurn && !onlineBlocked && expectedActions.length > 0 && !hasUsablePrimaryAction(snapshot);
    const noUsablePendingAction = isMyTurn && !snapshot.isCpuTurn && !onlineBlocked && expectedPending.length > 0 && !hasUsablePendingAction(snapshot);
    const interactabilityIssues = validateUiInteractability(snapshot);
    const modalIssue = interactabilityIssues.find(issue => issue.freezeKind === FREEZE_KINDS.MODAL_UI_LOCKED);
    const pendingIssue = interactabilityIssues.find(issue => issue.freezeKind === FREEZE_KINDS.PENDING_UI_LOCKED);
    const humanIssue = interactabilityIssues.find(issue => issue.freezeKind === FREEZE_KINDS.HUMAN_TURN_UI_LOCKED);
    return UiWatchdog.classifyFreezeFacts({
        phase: snapshot.phase,
        builtThisTurn: snapshot.builtThisTurn,
        isMyTurn,
        isCpuTurn: snapshot.isCpuTurn,
        onlineBlocked,
        confirmOpen,
        staleConfirmOpen,
        activeBlockingModalOpen,
        hasExpectedPendingActions: expectedPending.length > 0,
        stalePendingOpen,
        skipDisabled,
        gameInert,
        gameScreenHidden,
        noUsablePrimaryAction,
        noUsablePendingAction,
        pendingOpenWithoutContent,
        onlineActionInFlight: snapshot.onlineActionInFlight,
        cpuStepScheduled: snapshot.cpuStepScheduled,
        onlineActionTimedOut: isOnlineActionTimedOutForWatchdog(snapshot),
        modalIssue,
        pendingIssue,
        humanIssue,
    }, FREEZE_KINDS);
}

function compactIssueForTrace(issue) {
    return UiWatchdog.compactIssueForTrace(issue);
}

function compactSnapshotForUiTrace(snapshot) {
    return UiWatchdog.compactSnapshotForTrace(snapshot);
}

function recentClientCheckpointsForTrace(limit = 8) {
    try {
        const root = typeof window !== 'undefined' ? window : globalThis;
        return UiWatchdog.compactRecentCheckpoints(root && root.__machikoroClientCheckpoints, limit);
    } catch (_) {
        return [];
    }
}

function classifyUiInteractabilityCause(issue, snapshot) {
    return UiWatchdog.classifyInteractabilityCause(issue, snapshot);
}

function syncAllowedActionContainersForRender(snapshot, issues = null) {
    if (!snapshot || !isHumanTurnSnapshot(snapshot) || isOnlineUiBlockedSnapshot(snapshot)) return false;
    if (hasActiveBlockingModal(snapshot) && !expectedPendingActions(snapshot).length) return false;
    const issueActions = new Set((issues || [])
        .filter(issue => issue && issue.kind === 'allowed-action-container-not-clickable' && issue.action)
        .map(issue => issue.action));
    let changed = false;
    for (const entry of expectedActionContainerEntries(snapshot)) {
        if (issueActions.size && !issueActions.has(entry.action)) continue;
        if (isActionContainerUiUsable(snapshot, entry)) continue;
        changed = clearActionContainerForRecovery(entry.spec) || changed;
        changed = clearExpectedActionChildrenForRecovery(snapshot, entry) || changed;
        if (entry.action === 'undoBuild') changed = ensurePostBuildUndoButtonForRecovery(snapshot) || changed;
    }
    return changed;
}

function syncUiInteractabilityAfterRender(reason = 'render-sync') {
    const before = buildClientRuntimeSnapshot(reason);
    if (!isHumanTurnSnapshot(before) || isOnlineUiBlockedSnapshot(before)) return false;
    if (hasActiveBlockingModal(before) && !expectedPendingActions(before).length) return false;
    const issues = validateUiInteractability(before).filter(issue => issue.freezeKind === FREEZE_KINDS.HUMAN_TURN_UI_LOCKED);
    if (!issues.length) return false;
    let changed = clearGameScreenLockIfNoActiveModal(before, reason + '-game-screen');
    changed = syncAllowedActionContainersForRender(before, issues) || changed;
    changed = clearUiInteractabilityIssueTargets(issues) || changed;
    const after = buildClientRuntimeSnapshot(reason + '-after');
    markClientFlowCheckpoint('ui-render-interactability-sync', {
        reason,
        changed,
        rootCauses: issues.map(issue => classifyUiInteractabilityCause(issue, before)),
        issues: issues.map(compactIssueForTrace),
        before: compactSnapshotForUiTrace(before),
        after: compactSnapshotForUiTrace(after),
    });
    return changed;
}

function recoverPostBuildUiFreeze(snapshot) {
    if (!snapshot || snapshot.phase !== 'build' || !snapshot.builtThisTurn) return false;
    if (!isHumanTurnSnapshot(snapshot) || isOnlineUiBlockedSnapshot(snapshot)) return false;
    clearUiLocks('freeze-watchdog-post-build-unlock', snapshot);
    try {
        if (typeof render === 'function') render();
    } catch (_) {}
    try {
        if (typeof renderBuildMenu === 'function') renderBuildMenu();
    } catch (_) {}
    let afterRender = buildClientRuntimeSnapshot('freeze-watchdog-post-build-after-render');
    let issues = validateUiInteractability(afterRender).filter(issue => issue.freezeKind === FREEZE_KINDS.HUMAN_TURN_UI_LOCKED);
    recoverAllowedActionContainers(afterRender, issues);
    ensurePostBuildUndoButtonForRecovery(afterRender);
    clearUiLocks('freeze-watchdog-post-build-after-render-unlock', afterRender);
    try {
        if (typeof renderBuildMenu === 'function') renderBuildMenu();
    } catch (_) {}
    afterRender = buildClientRuntimeSnapshot('freeze-watchdog-post-build-second-render');
    issues = validateUiInteractability(afterRender).filter(issue => issue.freezeKind === FREEZE_KINDS.HUMAN_TURN_UI_LOCKED);
    recoverAllowedActionContainers(afterRender, issues);
    ensurePostBuildUndoButtonForRecovery(afterRender);
    const afterRecovery = buildClientRuntimeSnapshot('freeze-watchdog-post-build-after-recovery');
    const recovered = classifyLikelyFreeze(afterRecovery) !== FREEZE_KINDS.POST_BUILD_UI_BLOCKED;
    if (recovered) markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: FREEZE_KINDS.POST_BUILD_UI_BLOCKED });
    return recovered;
}

function ensurePostBuildUndoButtonForRecovery(snapshot) {
    const allowed = Array.isArray(snapshot && snapshot.allowedActions) ? snapshot.allowedActions : [];
    if (!snapshot || snapshot.phase !== 'build' || !snapshot.builtThisTurn || !allowed.includes('undoBuild')) return false;
    try {
        if (typeof undoState === 'undefined' || !undoState) return false;
    } catch (_) {
        return false;
    }
    const buildMenu = typeof document !== 'undefined' && document.getElementById ? document.getElementById('buildMenu') : null;
    if (!buildMenu) return false;
    let children = [];
    try {
        if (typeof buildMenu.querySelectorAll === 'function') children = Array.from(buildMenu.querySelectorAll('[data-action="undoBuild"]') || []);
    } catch (_) {
        children = [];
    }
    let changed = false;
    if (!children.length && typeof buildMenu.innerHTML === 'string' && !/data-action=["']undoBuild["']/.test(buildMenu.innerHTML)) {
        const undoHtml = '<button class="undo-btn" data-action="undoBuild">↩ 建設を取り消す</button>';
        if (typeof buildMenu.insertAdjacentHTML === 'function') buildMenu.insertAdjacentHTML('afterbegin', undoHtml);
        else buildMenu.innerHTML = undoHtml + buildMenu.innerHTML;
        changed = true;
        try {
            if (typeof buildMenu.querySelectorAll === 'function') children = Array.from(buildMenu.querySelectorAll('[data-action="undoBuild"]') || []);
        } catch (_) {
            children = [];
        }
    }
    children.forEach(child => {
        if (!child) return;
        if (child.disabled) { child.disabled = false; changed = true; }
        if (child.hidden) { child.hidden = false; changed = true; }
        if (child.inert) { child.inert = false; changed = true; }
        if (typeof child.removeAttribute === 'function' && child.getAttribute && child.getAttribute('aria-hidden') !== null) {
            child.removeAttribute('aria-hidden');
            changed = true;
        }
        if (child.style && child.style.display === 'none') { child.style.display = ''; changed = true; }
        if (child.style && child.style.pointerEvents === 'none') { child.style.pointerEvents = ''; changed = true; }
    });
    if (changed) markClientFlowCheckpoint('post-build-undo-button-recovered', { action: 'undoBuild' });
    return changed;
}

function clearActionContainerForRecovery(spec) {
    if (!spec || !spec.targetId) return false;
    let changed = false;
    [spec.modalId, spec.targetId].filter(Boolean).forEach(id => {
        const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null;
        if (!el) return;
        if (el.hidden) { el.hidden = false; changed = true; }
        if (id === spec.targetId && el.disabled) { el.disabled = false; changed = true; }
        if (el.inert) { el.inert = false; changed = true; }
        if (typeof el.removeAttribute === 'function' && el.getAttribute && el.getAttribute('aria-hidden') !== null) {
            el.removeAttribute('aria-hidden');
            changed = true;
        }
        if (el.style && el.style.display === 'none') {
            el.style.display = id === 'diceChoose' ? 'block' : '';
            changed = true;
        }
        if (el.style && el.style.pointerEvents === 'none') {
            el.style.pointerEvents = id === 'pendingMenu' ? 'auto' : '';
            changed = true;
        }
    });
    return changed;
}

function clearExpectedActionChildrenForRecovery(snapshot, entry) {
    const spec = entry && entry.spec;
    const childSpec = expectedChildSpecForEntry(snapshot, entry);
    if (!spec || !childSpec || !spec.targetId) return false;
    const parent = typeof document !== 'undefined' && document.getElementById ? document.getElementById(spec.targetId) : null;
    if (!parent || typeof parent.querySelectorAll !== 'function') return false;
    let children = [];
    try {
        children = Array.from(parent.querySelectorAll(childSpec.selector) || []);
    } catch (_) {
        children = [];
    }
    let changed = false;
    children.forEach(child => {
        if (!child) return;
        if (child.disabled) { child.disabled = false; changed = true; }
        if (child.hidden) { child.hidden = false; changed = true; }
        if (child.inert) { child.inert = false; changed = true; }
        if (typeof child.removeAttribute === 'function' && child.getAttribute && child.getAttribute('aria-hidden') !== null) {
            child.removeAttribute('aria-hidden');
            changed = true;
        }
        if (child.style && child.style.display === 'none') { child.style.display = ''; changed = true; }
        if (child.style && child.style.pointerEvents === 'none') { child.style.pointerEvents = ''; changed = true; }
    });
    return changed;
}

function recoverAllowedActionContainers(snapshot, issues = null) {
    if (!snapshot || !isHumanTurnSnapshot(snapshot) || isOnlineUiBlockedSnapshot(snapshot)) return false;
    if (hasActiveBlockingModal(snapshot) && !expectedPendingActions(snapshot).length) return false;
    const issueActions = new Set((issues || [])
        .filter(issue => issue && issue.kind === 'allowed-action-container-not-clickable' && issue.action)
        .map(issue => issue.action));
    let changed = false;
    for (const entry of expectedActionContainerEntries(snapshot)) {
        if (issueActions.size && !issueActions.has(entry.action)) continue;
        if (isActionContainerUiUsable(snapshot, entry)) continue;
        changed = clearActionContainerForRecovery(entry.spec) || changed;
        changed = clearExpectedActionChildrenForRecovery(snapshot, entry) || changed;
        if (entry.action === 'undoBuild') changed = ensurePostBuildUndoButtonForRecovery(snapshot) || changed;
    }
    return changed || issueActions.size > 0;
}

function recoverPendingUiLock(snapshot) {
    if (!snapshot || !isHumanTurnSnapshot(snapshot) || isOnlineUiBlockedSnapshot(snapshot)) return false;
    const issues = validateUiInteractability(snapshot).filter(issue => issue.action && issue.action.startsWith('resolve'));
    const changed = recoverAllowedActionContainers(snapshot, issues);
    try {
        if (typeof render === 'function') render();
    } catch (_) {}
    markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: FREEZE_KINDS.PENDING_UI_LOCKED, issues });
    return changed;
}

function clearUiInteractabilityIssueTargets(issues) {
    let changed = false;
    (issues || []).forEach(issue => {
        if (!issue || !issue.target || issue.target === 'body') return;
        const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(issue.target) : null;
        if (!el) return;
        if (el.hidden) { el.hidden = false; changed = true; }
        if (issue.reason === 'disabled-mismatch' && el.disabled) { el.disabled = false; changed = true; }
        if (el.inert) { el.inert = false; changed = true; }
        if (typeof el.removeAttribute === 'function' && el.getAttribute && el.getAttribute('aria-hidden') !== null) {
            el.removeAttribute('aria-hidden');
            changed = true;
        }
        if (issue.target !== 'gameScreen' && el.style && (issue.reason === 'parent-display-none' || el.style.display === 'none')) {
            el.style.display = '';
            changed = true;
        }
        if (el.style && el.style.pointerEvents === 'none') {
            el.style.pointerEvents = '';
            changed = true;
        }
    });
    return changed;
}

function recoverHumanUiLock(snapshot) {
    if (!snapshot || !isHumanTurnSnapshot(snapshot) || isOnlineUiBlockedSnapshot(snapshot)) return false;
    if (hasActiveBlockingModal(snapshot) && !expectedPendingActions(snapshot).length) return false;
    const issues = validateUiInteractability(snapshot).filter(issue => issue.freezeKind === FREEZE_KINDS.HUMAN_TURN_UI_LOCKED);
    const changed = recoverAllowedActionContainers(snapshot, issues) || clearUiInteractabilityIssueTargets(issues);
    clearUiLocks('freeze-watchdog-human-turn-unlock', snapshot);
    try {
        if (typeof render === 'function') render();
    } catch (_) {}
    markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: FREEZE_KINDS.HUMAN_TURN_UI_LOCKED, issues });
    return changed || issues.length > 0;
}

function recoverModalUiLock(snapshot) {
    const issues = validateUiInteractability(snapshot).filter(issue => issue.freezeKind === FREEZE_KINDS.MODAL_UI_LOCKED);
    if (!issues.length) return false;
    let changed = false;
    issues.forEach(issue => {
        const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(issue.target) : null;
        if (!el) return;
        if (el.inert) { el.inert = false; changed = true; }
        if (el.style && el.style.pointerEvents === 'none') { el.style.pointerEvents = 'auto'; changed = true; }
    });
    if (changed) markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: FREEZE_KINDS.MODAL_UI_LOCKED, issues });
    return changed;
}

function recoverStaleModalUiLock(snapshot) {
    const closed = closeStaleBlockingModals(snapshot, 'freeze-watchdog-stale-modal');
    if (!closed) return false;
    clearUiLocks('freeze-watchdog-stale-modal-unlock', snapshot);
    try {
        if (typeof render === 'function') render();
    } catch (_) {}
    markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: FREEZE_KINDS.STALE_MODAL_UI_LOCKED });
    return true;
}

function recoverCpuTurnStall(snapshot) {
    if (!snapshot || !snapshot.isCpuTurn || snapshot.onlineActionInFlight || snapshot.isReconnectingOnline) return false;
    if (snapshot.isOnlineGame && !snapshot.isRoomHost) return false;
    try {
        if (typeof cpuTurnScheduler !== 'undefined' && cpuTurnScheduler && typeof cpuTurnScheduler.schedule === 'function') {
            const health = cpuTurnScheduler.schedule('watchdog-cpu-turn-stall');
            const recovered = !!(health && health.stepScheduled);
            const after = buildClientRuntimeSnapshot('cpu-turn-stall-recovery-after');
            markClientFlowCheckpoint('freeze-watchdog-cpu-reschedule', {
                recovered,
                schedulerHealth: health || null,
                before: compactSnapshotForUiTrace(snapshot),
                after: compactSnapshotForUiTrace(after),
            });
            return recovered;
        }
        if (typeof scheduleCPU !== 'function') return false;
        scheduleCPU();
    } catch (_) {
        return false;
    }
    const after = buildClientRuntimeSnapshot('cpu-turn-stall-recovery-after');
    const recovered = !!after.cpuStepScheduled;
    markClientFlowCheckpoint('freeze-watchdog-cpu-reschedule', {
        recovered,
        before: compactSnapshotForUiTrace(snapshot),
        after: compactSnapshotForUiTrace(after),
    });
    return recovered;
}

function recoverOnlineActionInFlightStall(snapshot) {
    if (!snapshot || !snapshot.onlineActionInFlight) return false;
    if (typeof _handleOnlineActionTimeout !== 'function') return false;
    try {
        const recovered = _handleOnlineActionTimeout();
        markClientFlowCheckpoint('freeze-watchdog-online-action-resync', {
            recovered: !!recovered,
            onlineActionInFlightAt: snapshot.onlineActionInFlightAt || null,
            before: compactSnapshotForUiTrace(snapshot),
            after: compactSnapshotForUiTrace(buildClientRuntimeSnapshot('online-action-stall-recovery-after')),
        });
        return !!recovered;
    } catch (_) {
        return false;
    }
}

function normalizedFreezeKindForRecovery(freezeKind) {
    return UiWatchdog.normalizeFreezeKind(freezeKind);
}

function freezeRecoveryHandlers() {
    return {
        [FREEZE_KINDS.POST_BUILD_UI_BLOCKED]: recoverPostBuildUiFreeze,
        [FREEZE_KINDS.HUMAN_TURN_UI_LOCKED]: recoverHumanUiLock,
        [FREEZE_KINDS.PENDING_UI_LOCKED]: recoverPendingUiLock,
        [FREEZE_KINDS.STALE_MODAL_UI_LOCKED]: recoverStaleModalUiLock,
        [FREEZE_KINDS.CPU_TURN_STALLED]: recoverCpuTurnStall,
        [FREEZE_KINDS.ONLINE_ACTION_IN_FLIGHT_STALLED]: recoverOnlineActionInFlightStall,
        [FREEZE_KINDS.MODAL_UI_LOCKED]: recoverModalUiLock,
    };
}

function recoverFreezeKind(freezeKind, snapshot) {
    const kind = normalizedFreezeKindForRecovery(freezeKind);
    const handler = freezeRecoveryHandlers()[kind];
    return typeof handler === 'function' ? handler(snapshot) : false;
}

function recoverUiInteractability(snapshot) {
    const before = snapshot || buildClientRuntimeSnapshot('ui-recovery-before');
    const freezeKind = classifyLikelyFreeze(before);
    if (!freezeKind) return false;
    const issues = validateUiInteractability(before).filter(issue => issue && issue.freezeKind);
    const recovered = recoverFreezeKind(freezeKind, before);
    if (recovered) {
        const after = buildClientRuntimeSnapshot('ui-recovery-after');
        markClientFlowCheckpoint('ui-interactability-recovery-fired', {
            freezeKind,
            rootCauses: issues.map(issue => classifyUiInteractabilityCause(issue, before)),
            issues: issues.map(compactIssueForTrace),
            before: compactSnapshotForUiTrace(before),
            after: compactSnapshotForUiTrace(after),
            recentCheckpoints: recentClientCheckpointsForTrace(),
        });
    }
    return recovered;
}

function freezeIssueDedupeSignature(snapshot) {
    return UiWatchdog.issueDedupeSignature(snapshot, validateUiInteractability(snapshot));
}

function compactElementSnapshotForStorage(state) {
    return UiWatchdog.compactElementSnapshotForStorage(state);
}

function compactFreezePayloadForStorage(payload) {
    return UiWatchdog.compactFreezePayloadForStorage(payload, compactIssueForTrace);
}

function freezePayloadStorageJson(payload) {
    return UiWatchdog.freezePayloadStorageJson(payload, compactIssueForTrace);
}

function buildFreezeReportStack(payload) {
    const snapshot = payload && payload.snapshot || {};
    const issues = Array.isArray(payload && payload.interactabilityIssues)
        ? payload.interactabilityIssues.map(compactIssueForTrace)
        : validateUiInteractability(snapshot);
    return UiWatchdog.buildFreezeReportStack(payload, {
        schemaVersion: FREEZE_SUMMARY_SCHEMA_VERSION,
        confirmAwaitingChoice: isConfirmModalAwaitingUserChoice(),
        expectedPrimaryActions: expectedPrimaryActions(snapshot),
        interactabilityIssues: issues,
        actionChildren: compactActionChildStates(snapshot),
    });
}

function checkFreezeWatchdog() {
    const now = Date.now();
    const snapshot = buildClientRuntimeSnapshot('freeze-watchdog');
    const key = freezeWatchdogStateKey(snapshot);
    if (key !== _freezeWatchdogLastKey) {
        _freezeWatchdogLastKey = key;
        _freezeWatchdogLastChangedAt = now;
        return;
    }
    if (!_freezeWatchdogLastChangedAt) _freezeWatchdogLastChangedAt = now;
    if (now - _freezeWatchdogLastChangedAt < FREEZE_WATCHDOG_THRESHOLD_MS) return;
    const freezeKind = classifyLikelyFreeze(snapshot);
    if (!freezeKind) return;
    const reportKey = freezeKind + '|' + freezeIssueDedupeSignature(snapshot);
    if (_freezeWatchdogLastReportKey === reportKey && now - _freezeWatchdogLastReportAt < 60000) {
        recoverUiInteractability(snapshot);
        return;
    }
    _freezeWatchdogLastReportKey = reportKey;
    _freezeWatchdogLastReportAt = now;
    const payload = {
        freezeKind,
        stagnantMs: now - _freezeWatchdogLastChangedAt,
        snapshot,
        interactabilityIssues: validateUiInteractability(snapshot).filter(issue => issue && issue.freezeKind),
    };
    markClientFlowCheckpoint('freeze-watchdog-report', payload);
    const recovered = recoverUiInteractability(snapshot);
    payload.recovery = { attempted: true, success: !!recovered };
    appShellStorage.access(storage => {
        storage.setItem('machikoroFreezeSnapshot', freezePayloadStorageJson(payload));
    });
    if (typeof reportClientError === 'function') {
        reportClientError({
            source: 'freeze-watchdog',
            phase: snapshot.phase,
            message: freezeKind + ' after ' + payload.stagnantMs + 'ms',
            stack: buildFreezeReportStack(payload),
        });
    }
}

function startFreezeWatchdog() {
    if (_freezeWatchdogBound || typeof setInterval !== 'function') return;
    _freezeWatchdogBound = true;
    setInterval(checkFreezeWatchdog, FREEZE_WATCHDOG_INTERVAL_MS);
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
    loadSettings();
    if (typeof preloadLocalRlModelsInBackground === 'function') preloadLocalRlModelsInBackground('init-main-local-rl-preload');
    renderOnlinePlayerSettings();
    if (typeof preloadOnlineRlModelsInBackground === 'function') preloadOnlineRlModelsInBackground('init-main-online-rl-preload');
    updateResumeButton();
    drawCitySkyline();
    if (!_mainViewResizeBound) {
        window.addEventListener("resize", drawCitySkyline);
        _mainViewResizeBound = true;
    }
    bindCrashHandlers();
    bindOnlineStatusHandlers();
    bindPwaInstallHandlers();
    startFreezeWatchdog();
}
