// ===== クライアントエラー通知 =====
const CLIENT_ERROR_REPORT_ENDPOINT = '/api/client-error';
const CLIENT_ERROR_REPORT_STACK_LIMIT = 2400;
const CLIENT_ERROR_REPORT_MESSAGE_LIMIT = 500;
const CLIENT_ERROR_REPORT_SUPPRESS_MS = 10000;
const FREEZE_WATCHDOG_INTERVAL_MS = 1000;
const FREEZE_WATCHDOG_THRESHOLD_MS = 5000;
let _clientErrorReportingBound = false;
let _consoleErrorHooked = false;
let _lastClientErrorReport = { key: '', time: 0 };
let _onlineStatusHandlersBound = false;
let _pwaInstallHandlersBound = false;
let _mainViewResizeBound = false;
let _freezeWatchdogBound = false;
let _freezeWatchdogLastKey = '';
let _freezeWatchdogLastChangedAt = 0;
let _freezeWatchdogLastReportKey = '';
let _freezeWatchdogLastReportAt = 0;
let _postBuildUiStabilizerPending = false;

function truncateClientErrorField(value, limit) {
    const text = String(value || '');
    return text.length > limit ? text.slice(0, limit) + '...' : text;
}

function errorLikeMessage(value) {
    if (value instanceof Error) return value.message;
    if (value && typeof value.message === 'string') return value.message;
    return String(value || '不明なエラー');
}

function errorLikeStack(value) {
    if (value instanceof Error) return value.stack || value.message;
    if (value && typeof value.stack === 'string') return value.stack;
    return '';
}

function isErrorLike(value) {
    return value instanceof Error || !!(value && (typeof value.message === 'string' || typeof value.stack === 'string'));
}

function safeClientErrorUrl() {
    if (typeof window === 'undefined' || !window.location) return '';
    const origin = window.location.origin || '';
    const pathname = window.location.pathname || '';
    if (origin || pathname) return origin + pathname;
    const href = window.location.href || '';
    return href.split(/[?#]/)[0];
}

function safeClientErrorContext() {
    return {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent || '' : '',
        phase: typeof game !== 'undefined' && game ? game.phase || '' : '',
        roomId: typeof myRoomId !== 'undefined' && myRoomId ? myRoomId : '',
        playerIndex: typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : null,
        appVersion: typeof window !== 'undefined' && window.MACHIKORO_CLIENT_VERSION ? window.MACHIKORO_CLIENT_VERSION : '',
        url: safeClientErrorUrl(),
    };
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

const PRIMARY_ACTION_CHILD_SELECTOR_REGISTRY = Object.freeze({
    selectDice: Object.freeze({ actions: Object.freeze(['selectDiceCount']), selector: 'button[data-action="selectDiceCount"], [role="button"][data-action="selectDiceCount"], [data-action="selectDiceCount"]' }),
    rerollDice: Object.freeze({ actions: Object.freeze(['rerollDice']), selector: 'button[data-action="rerollDice"], [role="button"][data-action="rerollDice"], [data-action="rerollDice"]' }),
    skipReroll: Object.freeze({ actions: Object.freeze(['skipReroll']), selector: 'button[data-action="skipReroll"], [role="button"][data-action="skipReroll"], [data-action="skipReroll"]' }),
    resolveHarbor: Object.freeze({ actions: Object.freeze(['resolveHarbor']), selector: 'button[data-action="resolveHarbor"], [role="button"][data-action="resolveHarbor"], [data-action="resolveHarbor"]' }),
    resolveTV: Object.freeze({ actions: Object.freeze(['resolveTV']), selector: 'button[data-action="resolveTV"], [role="button"][data-action="resolveTV"], [data-action="resolveTV"]' }),
    resolveBusiness: Object.freeze({ actions: Object.freeze(['resolveBusiness']), selector: 'button[data-action="resolveBusiness"], [role="button"][data-action="resolveBusiness"], [data-action="resolveBusiness"]' }),
    resolveCleaning: Object.freeze({ actions: Object.freeze(['resolveCleaning']), selector: 'button[data-action="resolveCleaning"], [role="button"][data-action="resolveCleaning"], [data-action="resolveCleaning"]' }),
    resolveMover: Object.freeze({ actions: Object.freeze(['resolveMover']), selector: 'button[data-action="resolveMover"], [role="button"][data-action="resolveMover"], [data-action="resolveMover"]' }),
    resolveRenovation: Object.freeze({ actions: Object.freeze(['resolveRenovation']), selector: 'button[data-action="resolveRenovation"], [role="button"][data-action="resolveRenovation"], [data-action="resolveRenovation"]' }),
    resolveIT: Object.freeze({ actions: Object.freeze(['resolveIT']), selector: 'button[data-action="resolveIT"], [role="button"][data-action="resolveIT"], [data-action="resolveIT"]' }),
    buildCard: Object.freeze({ actions: Object.freeze(['buildCard']), selector: 'button[data-action="buildCard"], [role="button"][data-action="buildCard"], [data-action="buildCard"]' }),
    buildLandmark: Object.freeze({ actions: Object.freeze(['buildLandmark']), selector: 'button[data-action="buildLandmark"], [role="button"][data-action="buildLandmark"], [data-action="buildLandmark"]' }),
    undoBuild: Object.freeze({ actions: Object.freeze(['undoBuild']), selector: 'button[data-action="undoBuild"], [role="button"][data-action="undoBuild"], [data-action="undoBuild"]' }),
});

function hasBuildableCardCandidate() {
    try {
        if (typeof game === 'undefined' || !game || game.builtThisTurn) return false;
        const current = game.currentPlayer && game.currentPlayer();
        if (!current || typeof CARDS === 'undefined' || !Array.isArray(CARDS)) return false;
        return CARDS.some(card => {
            if (!card) return false;
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
    return PRIMARY_ACTION_CHILD_SELECTOR_REGISTRY[action] || null;
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
    if (!el) return '';
    if (typeof el.className === 'string') return el.className;
    if (el.classList && typeof el.classList.value === 'string') return el.classList.value;
    return '';
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
    if (!snapshot) return false;
    if (snapshot.disabled || snapshot.hidden || snapshot.inert || snapshot.ancestorBlocked) return false;
    if (snapshot.display === 'none' || snapshot.computedDisplay === 'none') return false;
    if (snapshot.visibility === 'hidden' || snapshot.computedVisibility === 'hidden') return false;
    if (snapshot.pointerEvents === 'none' || snapshot.computedPointerEvents === 'none') return false;
    return true;
}

function collectUiLockSnapshot(reason = 'ui-lock-snapshot') {
    return buildClientRuntimeSnapshot(reason);
}

function uiLockReasonForElement(state) {
    if (!state) return 'missing-handler';
    if (state.ancestorBlocked) return 'ancestor-blocked';
    if (state.display === 'none' || state.computedDisplay === 'none') return 'parent-display-none';
    if (state.inert) return 'parent-inert';
    if (state.pointerEvents === 'none' || state.computedPointerEvents === 'none') return 'pointer-events-none';
    if (state.hidden || state.visibility === 'hidden' || state.computedVisibility === 'hidden') return 'hidden-mismatch';
    if (state.disabled) return 'disabled-mismatch';
    if (state.totalInteractiveChildren > 0 && state.usableInteractiveChildren <= 0) return 'child-not-clickable';
    return 'not-clickable';
}

const PRIMARY_ACTION_CONTAINER_REGISTRY = Object.freeze([
    Object.freeze({ phase: 'roll', actions: Object.freeze(['rollDice']), targetId: 'btnRoll', targetSource: 'actionButtons', requiresContent: false }),
    Object.freeze({ phase: 'selectDice', actions: Object.freeze(['selectDice']), targetId: 'diceChoose', targetSource: 'actionButtons', requiresContent: true }),
    Object.freeze({ phase: 'rerollConfirm', actions: Object.freeze(['rerollDice', 'skipReroll']), targetId: 'diceChoose', targetSource: 'actionButtons', requiresContent: true }),
    Object.freeze({ phase: 'harborChoice', actions: Object.freeze(['resolveHarbor']), targetId: 'diceChoose', targetSource: 'actionButtons', requiresContent: true }),
    Object.freeze({ phase: 'pending', actions: Object.freeze(['resolveTV', 'resolveBusiness', 'resolveCleaning', 'resolveMover', 'resolveRenovation', 'resolveIT']), targetId: 'pendingMenu', modalId: 'pendingModal', requiresContent: true, allowPendingItOutsidePhase: true }),
    Object.freeze({ phase: 'build', actions: Object.freeze(['buildCard', 'buildLandmark', 'undoBuild']), targetId: 'buildMenu', requiresContent: true }),
    Object.freeze({ phase: 'build', actions: Object.freeze(['nextTurn']), targetId: 'btnSkip', targetSource: 'actionButtons', requiresContent: false }),
]);

function actionContainerSpecForAction(snapshot, action) {
    const phase = String(snapshot && snapshot.phase || '');
    const exact = PRIMARY_ACTION_CONTAINER_REGISTRY.find(spec =>
        (!spec.phase || spec.phase === phase) && spec.actions.includes(action)
    );
    if (exact) return exact;
    const pendingFields = snapshot && snapshot.pendingFields || {};
    return PRIMARY_ACTION_CONTAINER_REGISTRY.find(spec =>
        spec.allowPendingItOutsidePhase && action === 'resolveIT' && !!pendingFields.pendingIT && spec.actions.includes(action)
    ) || null;
}

function expectedActionContainerEntries(snapshot) {
    const allowed = Array.isArray(snapshot && snapshot.allowedActions) ? snapshot.allowedActions : [];
    return allowed
        .map(action => ({ action, spec: actionContainerSpecForAction(snapshot, action) }))
        .filter(entry => !!entry.spec);
}

function shouldIgnoreInactiveActionContainerIssue(snapshot, entry, reason) {
    if (!entry || !entry.spec || !entry.spec.requiresContent) return false;
    if (expectedChildSpecForEntry(snapshot, entry)) return false;
    return reason === 'not-clickable' || reason === 'action-child-not-clickable' || reason === 'child-not-clickable';
}

function missingActionContainerRegistryEntries(snapshot) {
    const allowed = Array.isArray(snapshot && snapshot.allowedActions) ? snapshot.allowedActions : [];
    return allowed
        .filter(action => !actionContainerSpecForAction(snapshot, action))
        .map(action => ({ action, phase: String(snapshot && snapshot.phase || '') }));
}

function primaryActionContainerRegistryForDiagnostics() {
    return PRIMARY_ACTION_CONTAINER_REGISTRY.map(spec => ({
        phase: spec.phase || '',
        actions: Array.from(spec.actions || []),
        targetId: spec.targetId || '',
        modalId: spec.modalId || '',
        targetSource: spec.targetSource || '',
        requiresContent: !!spec.requiresContent,
        allowPendingItOutsidePhase: !!spec.allowPendingItOutsidePhase,
    }));
}

function snapshotStateById(snapshot, id, targetSource = '') {
    const ui = snapshot && snapshot.ui || {};
    const buttons = snapshot && snapshot.actionButtons && snapshot.actionButtons.buttons || {};
    if (targetSource === 'actionButtons') return buttons[id] || ui[id];
    return ui[id] || buttons[id];
}

function snapshotElementForAction(snapshot, action) {
    const spec = actionContainerSpecForAction(snapshot, action);
    return spec ? snapshotStateById(snapshot, spec.targetId, spec.targetSource) : null;
}

function isActionContainerUiUsable(snapshot, entry) {
    const spec = entry && entry.spec;
    if (!spec) return false;
    const state = snapshotStateById(snapshot, spec.targetId, spec.targetSource);
    if (!state) return false;
    if (spec.requiresContent && state.htmlLength <= 0) return false;
    const expectedChildSpec = expectedChildSpecForEntry(snapshot, entry);
    if (spec.requiresContent && expectedChildSpec) {
        const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(spec.targetId) : null;
        const actionChildState = childInteractiveStateForSpec(el, expectedChildSpec);
        if (actionChildState.total <= 0 || actionChildState.usable <= 0) return false;
    }
    if (spec.requiresContent && state.totalInteractiveChildren > 0 && state.usableInteractiveChildren <= 0) return false;
    if (!isElementUsablyEnabled(state)) return false;
    if (spec.modalId) {
        const modal = snapshotStateById(snapshot, spec.modalId);
        if (modal && !isElementUsablyEnabled(modal)) return false;
    }
    return true;
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
            freezeKind: 'modal-ui-locked',
        });
    }

    for (const id of activeModals) {
        if (id === 'pendingModal') continue;
        const modal = modalSnapshotFromRuntime(snapshot, id) || ui[id];
        if (!modal) continue;
        if (modal.inert) issues.push({ kind: 'visible-modal-inert', reason: 'parent-inert', target: id, freezeKind: 'modal-ui-locked' });
        if (modal.pointerEvents === 'none' || modal.computedPointerEvents === 'none') issues.push({ kind: 'visible-modal-pointer-events-none', reason: 'pointer-events-none', target: id, freezeKind: 'modal-ui-locked' });
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
            freezeKind: 'human-turn-ui-locked',
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
            freezeKind: 'human-turn-ui-locked',
        });
    }

    if (!activeModals.length && ui.gameScreen && (ui.gameScreen.inert || ui.gameScreen.display === 'none' || ui.gameScreen.computedDisplay === 'none') && expectedContainers.length) {
        issues.push({ kind: 'orphan-game-screen-lock', target: 'gameScreen', reason: ui.gameScreen.inert ? 'parent-inert' : 'parent-display-none', freezeKind: 'human-turn-ui-locked' });
    }
    if (!activeModals.length && snapshot.bodyClassName && /modal-open/.test(snapshot.bodyClassName) && expectedContainers.length) {
        issues.push({ kind: 'stale-modal-body-lock', target: 'body', reason: 'stale-modal', freezeKind: 'human-turn-ui-locked' });
    }
    return issues;
}

function primaryUiIssue(snapshot) {
    return validateUiInteractability(snapshot).find(issue => issue.freezeKind === 'human-turn-ui-locked');
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
    return {
        reason,
        timestamp: new Date().toISOString(),
        phase: hasGame ? game.phase : '',
        builtThisTurn: !!(hasGame && game.builtThisTurn),
        turnCount: hasGame ? game.turnCount : null,
        currentPlayerIndex,
        isCpuTurn,
        isOnlineGame: typeof isOnlineGame !== 'undefined' ? !!isOnlineGame : null,
        isRoomHost: typeof isRoomHost !== 'undefined' ? !!isRoomHost : null,
        myPlayerIndex: typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : null,
        onlineActionInFlight: typeof onlineActionInFlight !== 'undefined' ? !!onlineActionInFlight : null,
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
    if (!snapshot || !snapshot.phase || snapshot.isCpuTurn) return false;
    return !snapshot.isOnlineGame || snapshot.currentPlayerIndex === snapshot.myPlayerIndex;
}

function expectedPrimaryActions(snapshot) {
    return expectedActionContainerEntries(snapshot)
        .filter(entry => ['rollDice', 'nextTurn', 'selectDice', 'rerollDice', 'skipReroll', 'resolveHarbor'].includes(entry.action))
        .map(entry => entry.action);
}

function hasUsablePrimaryAction(snapshot) {
    const primaryActions = new Set(expectedPrimaryActions(snapshot));
    return expectedActionContainerEntries(snapshot)
        .filter(entry => primaryActions.has(entry.action))
        .some(entry => isActionContainerUiUsable(snapshot, entry));
}

function expectedPendingActions(snapshot) {
    const allowed = Array.isArray(snapshot && snapshot.allowedActions) ? snapshot.allowedActions : [];
    const pendingActions = new Set(['resolveTV', 'resolveBusiness', 'resolveCleaning', 'resolveMover', 'resolveRenovation', 'resolveIT']);
    return allowed.filter(action => pendingActions.has(action));
}

function hasUsablePendingAction(snapshot) {
    const pendingActions = new Set(expectedPendingActions(snapshot));
    return expectedActionContainerEntries(snapshot)
        .filter(entry => pendingActions.has(entry.action))
        .some(entry => isActionContainerUiUsable(snapshot, entry));
}

function isOnlineUiBlockedSnapshot(snapshot) {
    if (!snapshot || !snapshot.isOnlineGame) return false;
    if (snapshot.onlineActionInFlight || snapshot.isReconnectingOnline) return true;
    return snapshot.socketConnected === false;
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
    try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem('machikoroFreezeSnapshot');
    } catch (_) {}
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
    const state = modalSnapshotFromRuntime(snapshot, id);
    if (!state || state.hidden) return false;
    if (state.display === 'none' || state.computedDisplay === 'none') return false;
    if (state.visibility === 'hidden' || state.computedVisibility === 'hidden') return false;
    return !!(state.display || state.computedDisplay);
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
    if (!snapshot || !confirmModalOpenFromSnapshot(snapshot)) return false;
    if (isConfirmModalAwaitingUserChoice()) return false;
    const allowed = Array.isArray(snapshot.allowedActions) ? snapshot.allowedActions : [];
    if (snapshot.phase === 'build' && !!snapshot.builtThisTurn && allowed.includes('nextTurn')) return true;
    return snapshot.phase === 'roll' && allowed.includes('rollDice');
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
    if (!snapshot || !explicitModalOpenFromSnapshot(snapshot, 'pendingModal')) return false;
    const expectedPending = expectedPendingActions(snapshot);
    const pendingMenu = snapshot.ui && snapshot.ui.pendingMenu;
    return expectedPending.length === 0 || !pendingMenu || pendingMenu.htmlLength <= 0;
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
    if (!snapshot || !snapshot.phase) return false;
    const activePhases = ['roll', 'selectDice', 'rerollConfirm', 'harborChoice', 'pending', 'build'];
    if (!activePhases.includes(String(snapshot.phase))) return false;
    const allowed = Array.isArray(snapshot.allowedActions) ? snapshot.allowedActions : [];
    if (!allowed.length) return false;
    if (!Number.isInteger(snapshot.currentPlayerIndex) || snapshot.currentPlayerIndex < 0) return false;
    return !!(snapshot.builtThisTurn || snapshot.turnCount !== null || allowed.length);
}

function shouldRestoreGameScreenDisplay(snapshot) {
    if (!isActiveGameScreenRecoverySnapshot(snapshot)) return false;
    const allowed = Array.isArray(snapshot.allowedActions) ? snapshot.allowedActions : [];
    if (snapshot.phase === 'build' && allowed.includes('nextTurn')) return true;
    return expectedPrimaryActions(snapshot).length > 0 || expectedPendingActions(snapshot).length > 0;
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
}

function clearUiLocks(reason = 'ui-unlock', snapshot = null) {
    closeStaleBlockingModals(snapshot, reason);
    const changed = forceClearModalLocksForRecovery(snapshot);
    clearGameScreenLockIfNoActiveModal(snapshot, reason + '-game-screen');
    if (changed || !hasActiveBlockingModal(snapshot)) markClientFlowCheckpoint(reason);
}

function isPostBuildNextTurnSnapshot(snapshot) {
    if (!snapshot || snapshot.phase !== 'build' || !snapshot.builtThisTurn) return false;
    if (!isHumanTurnSnapshot(snapshot) || isOnlineUiBlockedSnapshot(snapshot)) return false;
    if (hasActiveBlockingModal(snapshot)) return false;
    const allowed = Array.isArray(snapshot.allowedActions) ? snapshot.allowedActions : [];
    const pending = snapshot.pendingFields || {};
    return allowed.includes('nextTurn') && !pending.pendingRenovation;
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
    clearUiLocks(reason, snapshot);
    try { if (typeof render === 'function') render(); } catch (_) {}
    return true;
}

function markClientFlowCheckpoint(event, details = {}) {
    const checkpoint = { event, details, snapshot: buildClientRuntimeSnapshot(event), timestamp: new Date().toISOString() };
    try {
        const root = typeof window !== 'undefined' ? window : globalThis;
        if (root) {
            const list = Array.isArray(root.__machikoroClientCheckpoints) ? root.__machikoroClientCheckpoints : [];
            list.push(checkpoint);
            while (list.length > 80) list.shift();
            root.__machikoroClientCheckpoints = list;
        }
    } catch (_) {}
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('machikoroLastClientCheckpoint', JSON.stringify(checkpoint).slice(0, 5000));
        }
    } catch (_) {}
    return checkpoint;
}


function buildClientErrorReport(input) {
    const source = input?.source || 'unknown';
    const error = input?.error;
    const message = input?.message || errorLikeMessage(error);
    return Object.assign(safeClientErrorContext(), {
        source,
        message: truncateClientErrorField(message, CLIENT_ERROR_REPORT_MESSAGE_LIMIT),
        stack: truncateClientErrorField(input?.stack || errorLikeStack(error), CLIENT_ERROR_REPORT_STACK_LIMIT),
        filename: truncateClientErrorField(input?.filename || '', 300),
        line: Number.isFinite(input?.line) ? input.line : null,
        column: Number.isFinite(input?.column) ? input.column : null,
        timestamp: new Date().toISOString(),
    });
}

function clientErrorReportKey(report) {
    return [report.source, report.message, report.filename, report.line, report.column, report.phase, report.roomId].join('|');
}

function reportClientError(input) {
    if (typeof fetch !== 'function') {
        markClientFlowCheckpoint('client-error-fetch-unavailable', { source: input?.source || 'unknown' });
        return false;
    }
    const report = buildClientErrorReport(input || {});
    const now = Date.now();
    const key = clientErrorReportKey(report);
    if (_lastClientErrorReport.key === key && now - _lastClientErrorReport.time < CLIENT_ERROR_REPORT_SUPPRESS_MS) {
        markClientFlowCheckpoint('client-error-suppressed', { source: report.source, message: report.message });
        return false;
    }
    _lastClientErrorReport = { key, time: now };
    try {
        markClientFlowCheckpoint('client-error-fetch-start', { source: report.source, message: report.message });
        const request = fetch(CLIENT_ERROR_REPORT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(report),
            keepalive: true,
        });
        if (request && typeof request.then === 'function') {
            request.then(response => {
                markClientFlowCheckpoint('client-error-fetch-complete', { source: report.source, ok: response && response.ok !== false, status: response && response.status });
            }).catch(error => {
                markClientFlowCheckpoint('client-error-fetch-failed', { source: report.source, message: error && error.message || String(error) });
            });
        }
        return true;
    } catch (error) {
        markClientFlowCheckpoint('client-error-fetch-threw', { source: report.source, message: error && error.message || String(error) });
        return false;
    }
}

// ===== ゲームライフサイクル通知 =====
const GAME_LIFECYCLE_ENDPOINT = '/api/game-lifecycle';
const GAME_LIFECYCLE_NOTIFY_KEY = 'machikoroLifecycleNotifyEnabled';
const GAME_LIFECYCLE_LEGACY_NOTIFY_KEY = 'machikoroLifecycleNotificationsEnabled';
const GAME_LIFECYCLE_START_SENT_KEY = 'machikoroLifecycleStartSent';
const GAME_LIFECYCLE_START_SUPPRESS_MS = 60 * 1000;
let _gameLifecycleSessionId = '';
let _gameLifecycleStartSent = false;
let _gameLifecycleFinishSent = false;

function readGameLifecycleNotifyValue() {
    try {
        if (typeof localStorage === 'undefined') return null;
        const value = localStorage.getItem(GAME_LIFECYCLE_NOTIFY_KEY);
        if (value !== null) return value;
        return localStorage.getItem(GAME_LIFECYCLE_LEGACY_NOTIFY_KEY);
    } catch (_) {
        return null;
    }
}

function isLifecycleNotifyFalse(value) {
    return ['0', 'false', 'no', 'off', 'disabled'].includes(String(value || '').toLowerCase());
}

function isGameLifecycleNotificationEnabled() {
    return !isLifecycleNotifyFalse(readGameLifecycleNotifyValue());
}

function setGameLifecycleNotificationEnabled(enabled) {
    try {
        if (typeof localStorage !== 'undefined') {
            if (enabled) {
                localStorage.setItem(GAME_LIFECYCLE_NOTIFY_KEY, 'true');
                localStorage.removeItem(GAME_LIFECYCLE_LEGACY_NOTIFY_KEY);
            } else {
                localStorage.setItem(GAME_LIFECYCLE_NOTIFY_KEY, 'false');
                localStorage.removeItem(GAME_LIFECYCLE_LEGACY_NOTIFY_KEY);
            }
        }
    } catch (_) {}
    return isGameLifecycleNotificationEnabled();
}

function gameLifecycleNotifyState() {
    const value = readGameLifecycleNotifyValue();
    return {
        key: GAME_LIFECYCLE_NOTIFY_KEY,
        legacyKey: GAME_LIFECYCLE_LEGACY_NOTIFY_KEY,
        value,
        enabled: !isLifecycleNotifyFalse(value),
        defaultEnabled: value === null,
    };
}

function createGameLifecycleSessionId() {
    const random = Math.random().toString(36).slice(2, 10);
    return Date.now().toString(36) + '-' + random;
}

function gameLifecycleCpuCount() {
    try {
        return Array.isArray(cpuPlayers) ? cpuPlayers.filter(Boolean).length : 0;
    } catch (_) {
        return 0;
    }
}

function gameLifecyclePlayerCount() {
    try {
        if (typeof game !== 'undefined' && game && Array.isArray(game.players)) return game.players.length;
    } catch (_) {}
    try {
        return Number(selectedCount) || 0;
    } catch (_) {
        return 0;
    }
}

function gameLifecycleMode() {
    try {
        return typeof isOnlineGame !== 'undefined' && isOnlineGame ? 'online' : 'local';
    } catch (_) {
        return 'local';
    }
}

function gameLifecycleAppVersion() {
    return typeof window !== 'undefined' && window.MACHIKORO_CLIENT_VERSION ? window.MACHIKORO_CLIENT_VERSION : '';
}

function gameLifecycleStartSignature() {
    return [gameLifecycleMode(), gameLifecyclePlayerCount(), gameLifecycleCpuCount()].join('|');
}

function recentlySentGameLifecycleStart(signature, now = Date.now()) {
    try {
        if (typeof localStorage === 'undefined') return false;
        const raw = localStorage.getItem(GAME_LIFECYCLE_START_SENT_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed && parsed.signature === signature && now - Number(parsed.timestamp || 0) < GAME_LIFECYCLE_START_SUPPRESS_MS;
    } catch (_) {
        return false;
    }
}

function rememberGameLifecycleStart(signature, now = Date.now()) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(GAME_LIFECYCLE_START_SENT_KEY, JSON.stringify({ signature, timestamp: now }).slice(0, 300));
        }
    } catch (_) {}
}

function cpuDifficultyForWinner(winner) {
    try {
        if (typeof game === 'undefined' || !game || !Array.isArray(game.players) || !Array.isArray(cpuPlayers)) return '';
        const index = game.players.indexOf(winner);
        const cpu = index >= 0 ? cpuPlayers[index] : null;
        return cpu && cpu.difficulty ? String(cpu.difficulty) : '';
    } catch (_) {
        return '';
    }
}

function buildGameLifecyclePayload(event, extra = {}) {
    if (!_gameLifecycleSessionId) _gameLifecycleSessionId = createGameLifecycleSessionId();
    const payload = {
        event,
        mode: gameLifecycleMode(),
        playerCount: gameLifecyclePlayerCount(),
        cpuCount: gameLifecycleCpuCount(),
        sessionId: _gameLifecycleSessionId,
        appVersion: gameLifecycleAppVersion(),
    };
    if (extra.turn !== undefined) payload.turn = extra.turn;
    if (extra.winnerKind) payload.winnerKind = extra.winnerKind;
    if (extra.winnerCpuDifficulty) payload.winnerCpuDifficulty = extra.winnerCpuDifficulty;
    return payload;
}

function sendGameLifecycleNotification(event, extra = {}) {
    if (!isGameLifecycleNotificationEnabled()) {
        markClientFlowCheckpoint('game-lifecycle-disabled', { event });
        return false;
    }
    if (typeof fetch !== 'function') {
        markClientFlowCheckpoint('game-lifecycle-fetch-unavailable', { event });
        return false;
    }
    const payload = buildGameLifecyclePayload(event, extra);
    try {
        markClientFlowCheckpoint('game-lifecycle-fetch-start', { event, mode: payload.mode, playerCount: payload.playerCount, cpuCount: payload.cpuCount });
        const request = fetch(GAME_LIFECYCLE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
        });
        if (request && typeof request.then === 'function') {
            request.then(response => {
                markClientFlowCheckpoint('game-lifecycle-fetch-complete', { event, ok: response && response.ok !== false, status: response && response.status });
            }).catch(error => {
                markClientFlowCheckpoint('game-lifecycle-fetch-failed', { event, message: error && error.message || String(error) });
            });
        }
        return true;
    } catch (error) {
        markClientFlowCheckpoint('game-lifecycle-fetch-threw', { event, message: error && error.message || String(error) });
        return false;
    }
}

function notifyGameLifecycleStart() {
    if (_gameLifecycleStartSent) return false;
    const signature = gameLifecycleStartSignature();
    const now = Date.now();
    if (recentlySentGameLifecycleStart(signature, now)) {
        markClientFlowCheckpoint('game-lifecycle-start-suppressed', { signature });
        _gameLifecycleStartSent = true;
        return false;
    }
    _gameLifecycleSessionId = createGameLifecycleSessionId();
    _gameLifecycleStartSent = true;
    _gameLifecycleFinishSent = false;
    rememberGameLifecycleStart(signature, now);
    return sendGameLifecycleNotification('play-start');
}

function notifyGameLifecycleFinish(winner) {
    if (_gameLifecycleFinishSent) return false;
    _gameLifecycleFinishSent = true;
    const cpuDifficulty = cpuDifficultyForWinner(winner);
    return sendGameLifecycleNotification('play-finish', {
        turn: typeof game !== 'undefined' && game ? game.turnCount : 0,
        winnerKind: cpuDifficulty ? 'cpu' : 'human',
        winnerCpuDifficulty: cpuDifficulty,
    });
}

function resetGameLifecycleForRestart(reason = 'game-restart') {
    _gameLifecycleSessionId = '';
    _gameLifecycleStartSent = false;
    _gameLifecycleFinishSent = false;
    try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(GAME_LIFECYCLE_START_SENT_KEY);
    } catch (_) {}
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
    if (focusables.length === 0) {
        event.preventDefault();
        if (el && typeof el.focus === 'function') el.focus();
        return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function showCrashScreen(err) {
    if (_crashShown) return;
    _crashShown = true;
    cpuScheduleToken++; // CPUループを停止
    const el = document.getElementById('crashScreen');
    if (!el) return;
    const msg = (err instanceof Error ? err.stack || err.message : String(err || '不明なエラー')).slice(0, 300);
    document.getElementById('crashMessage').textContent = msg;
    const resumeBtn = document.getElementById('crashResumeBtn');
    if (resumeBtn) resumeBtn.style.display = localStorage.getItem('savedGame') ? 'block' : 'none';
    el.style.display = 'flex';
    el.setAttribute('aria-modal', 'true');
    if (typeof el.hasAttribute !== 'function' || !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    if (typeof document.addEventListener === 'function') document.addEventListener('keydown', trapCrashScreenFocus, true);
    const focusTarget = resumeBtn && resumeBtn.style.display !== 'none'
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
    const offline = !navigator.onLine;
    const tabBtn = document.getElementById('tabOnline');
    const notice = document.getElementById('offlineNotice');
    const createBtn = document.getElementById('onlineCreateSubmitButton');
    const joinBtn = document.getElementById('onlineJoinSubmitButton');
    if (tabBtn) tabBtn.style.opacity = offline ? '0.4' : '';
    if (notice) notice.style.display = offline ? 'block' : 'none';
    if (createBtn) createBtn.disabled = offline;
    if (joinBtn) joinBtn.disabled = offline;
}

// ===== PWAインストールバナー =====
let _pwaInstallEvent = null;

function setPwaBannerVisible(id, visible) {
    const banner = document.getElementById(id);
    if (!banner) return;
    if (id === 'pwaInstallBanner' && visible) {
        const updateBanner = document.getElementById('pwaUpdateBanner');
        if (updateBanner && updateBanner.style.display === 'block') {
            updatePwaBannerBodyState();
            return;
        }
    }
    banner.style.display = visible ? 'block' : 'none';
    updatePwaBannerBodyState();
}

function updatePwaBannerBodyState() {
    if (typeof document === 'undefined' || !document.body || !document.body.classList) return;
    const installBanner = document.getElementById('pwaInstallBanner');
    const updateBanner = document.getElementById('pwaUpdateBanner');
    const visible = (installBanner && installBanner.style.display === 'block') ||
        (updateBanner && updateBanner.style.display === 'block');
    document.body.classList.toggle('pwa-banner-open', !!visible);
}

function maybeShowPwaInstallBanner() {
    if (!_pwaInstallEvent) {
        updatePwaBannerBodyState();
        return;
    }
    if (localStorage.getItem('pwaInstallDismissed')) {
        updatePwaBannerBodyState();
        return;
    }
    setPwaBannerVisible('pwaInstallBanner', true);
}

function pwaInstallPrompt() {
    if (!_pwaInstallEvent) return;
    _pwaInstallEvent.prompt();
    _pwaInstallEvent.userChoice.then(() => {
        setPwaBannerVisible('pwaInstallBanner', false);
        _pwaInstallEvent = null;
    });
}

function pwaInstallDismiss() {
    setPwaBannerVisible('pwaInstallBanner', false);
    localStorage.setItem('pwaInstallDismissed', '1');
    _pwaInstallEvent = null;
}

function handleWindowErrorEvent(e) {
    reportClientError({
        source: 'window.onerror',
        message: e?.message,
        error: e?.error,
        filename: e?.filename,
        line: e?.lineno,
        column: e?.colno,
    });
    showCrashScreen(e?.error || e?.message);
}

function handleWindowUnhandledRejection(e) {
    reportClientError({
        source: 'window.onunhandledrejection',
        error: e?.reason,
        message: errorLikeMessage(e?.reason),
    });
    showCrashScreen(e?.reason);
}

function bindConsoleErrorReporting() {
    if (_consoleErrorHooked || typeof console === 'undefined' || typeof console.error !== 'function') return;
    const originalConsoleError = console.error.bind(console);
    console.error = (...args) => {
        originalConsoleError(...args);
        const first = args[0];
        reportClientError({
            source: 'console.error',
            error: isErrorLike(first) ? first : null,
            message: isErrorLike(first) ? errorLikeMessage(first) : args.map(value => String(value)).join(' '),
        });
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
    if (_pwaInstallHandlersBound) return;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
        _pwaInstallHandlersBound = true;
        return;
    }
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        if (localStorage.getItem('pwaInstallDismissed')) {
            return;
        }
        _pwaInstallEvent = e;
        maybeShowPwaInstallBanner();
    });
    _pwaInstallHandlersBound = true;
}

function freezeWatchdogStateKey(snapshot) {
    const pending = snapshot.pendingFields || {};
    return [
        snapshot.phase || '',
        snapshot.turnCount ?? '',
        snapshot.currentPlayerIndex ?? '',
        snapshot.builtThisTurn ? 'built' : 'open',
        pending.pendingTV || 0,
        pending.pendingBusiness || 0,
        pending.pendingCleaning || 0,
        pending.pendingMover || 0,
        pending.pendingRenovation || 0,
        pending.pendingIT ? 1 : 0,
        snapshot.onlineActionInFlight ? 1 : 0,
    ].join('|');
}

function hasPendingWork(snapshot) {
    const pending = snapshot.pendingFields || {};
    return !!(pending.pendingTV || pending.pendingBusiness || pending.pendingCleaning || pending.pendingMover || pending.pendingRenovation || pending.pendingIT);
}

function classifyLikelyFreeze(snapshot) {
    if (!snapshot || !snapshot.phase) return '';
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
    const modalIssue = interactabilityIssues.find(issue => issue.freezeKind === 'modal-ui-locked');
    const pendingIssue = interactabilityIssues.find(issue => issue.freezeKind === 'pending-ui-locked');
    const humanIssue = interactabilityIssues.find(issue => issue.freezeKind === 'human-turn-ui-locked');
    if (modalIssue) return modalIssue.freezeKind + ':' + modalIssue.reason;
    if (stalePendingOpen && isMyTurn && !snapshot.isCpuTurn && !onlineBlocked) return 'stale-modal-ui-locked';
    if ((confirmOpen && !staleConfirmOpen) || (activeBlockingModalOpen && !expectedPending.length)) return '';
    if (!activeBlockingModalOpen && !onlineBlocked && snapshot.phase === 'build' && snapshot.builtThisTurn && isMyTurn && !snapshot.isCpuTurn && (skipDisabled || gameInert || gameScreenHidden || staleConfirmOpen || noUsablePrimaryAction || humanIssue)) {
        return 'post-build-ui-blocked';
    }
    if (pendingIssue || noUsablePendingAction) return 'pending-ui-locked';
    if ((!activeBlockingModalOpen && noUsablePrimaryAction) || humanIssue) return 'human-turn-ui-locked';
    if (pendingOpenWithoutContent) return 'pending-without-action';
    if (snapshot.isCpuTurn && !snapshot.onlineActionInFlight) return 'cpu-turn-stalled';
    if (snapshot.onlineActionInFlight) return 'online-action-in-flight-stalled';
    return '';
}

function compactIssueForTrace(issue) {
    if (!issue) return null;
    return {
        kind: issue.kind || '',
        action: issue.action || '',
        actionTarget: issue.actionTarget || '',
        target: issue.target || '',
        phase: issue.phase || '',
        reason: issue.reason || '',
        freezeKind: issue.freezeKind || '',
    };
}

function compactSnapshotForUiTrace(snapshot) {
    const ui = snapshot && snapshot.ui || {};
    return {
        phase: snapshot && snapshot.phase || '',
        builtThisTurn: !!(snapshot && snapshot.builtThisTurn),
        currentPlayerIndex: snapshot && snapshot.currentPlayerIndex,
        myPlayerIndex: snapshot && snapshot.myPlayerIndex,
        isCpuTurn: !!(snapshot && snapshot.isCpuTurn),
        isOnlineGame: snapshot && snapshot.isOnlineGame,
        onlineActionInFlight: snapshot && snapshot.onlineActionInFlight,
        allowedActions: Array.isArray(snapshot && snapshot.allowedActions) ? snapshot.allowedActions : [],
        visibleModals: Array.isArray(snapshot && snapshot.visibleModals) ? snapshot.visibleModals : [],
        bodyClassName: snapshot && snapshot.bodyClassName || '',
        gameScreen: compactElementSnapshotForStorage(ui.gameScreen),
        buildMenu: compactElementSnapshotForStorage(ui.buildMenu),
        btnSkip: compactElementSnapshotForStorage(ui.btnSkip),
        btnRoll: compactElementSnapshotForStorage(ui.btnRoll),
        diceChoose: compactElementSnapshotForStorage(ui.diceChoose),
        pendingModal: compactElementSnapshotForStorage(ui.pendingModal),
        pendingMenu: compactElementSnapshotForStorage(ui.pendingMenu),
        confirmModal: compactElementSnapshotForStorage(ui.confirmModal),
    };
}

function recentClientCheckpointsForTrace(limit = 8) {
    try {
        const root = typeof window !== 'undefined' ? window : globalThis;
        const list = root && Array.isArray(root.__machikoroClientCheckpoints) ? root.__machikoroClientCheckpoints : [];
        return list.slice(Math.max(0, list.length - limit)).map(entry => ({
            event: entry && entry.event || '',
            timestamp: entry && entry.timestamp || '',
            details: entry && entry.details || {},
            phase: entry && entry.snapshot && entry.snapshot.phase || '',
            allowedActions: entry && entry.snapshot && Array.isArray(entry.snapshot.allowedActions) ? entry.snapshot.allowedActions : [],
        }));
    } catch (_) {
        return [];
    }
}

function classifyUiInteractabilityCause(issue, snapshot) {
    if (!issue) return 'unknown';
    if (issue.reason === 'stale-modal' || issue.target === 'body') return 'modal-close-lock-leftover';
    if (issue.target === 'gameScreen' && (issue.reason === 'parent-inert' || issue.reason === 'parent-display-none')) return 'screen-lock-leftover';
    if (issue.reason === 'pointer-events-none') return 'inline-style-leftover';
    if (issue.reason === 'parent-display-none' || issue.reason === 'hidden-mismatch') return 'render-container-hidden';
    if (issue.reason === 'child-not-clickable' || issue.reason === 'disabled-mismatch') return 'allowed-actions-render-state-mismatch';
    if (snapshot && snapshot.phase === 'build' && issue.action === 'nextTurn') return 'build-after-action-display-sync';
    return 'allowed-actions-render-state-mismatch';
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
    }
    return changed;
}

function syncUiInteractabilityAfterRender(reason = 'render-sync') {
    const before = buildClientRuntimeSnapshot(reason);
    if (!isHumanTurnSnapshot(before) || isOnlineUiBlockedSnapshot(before)) return false;
    if (hasActiveBlockingModal(before) && !expectedPendingActions(before).length) return false;
    const issues = validateUiInteractability(before).filter(issue => issue.freezeKind === 'human-turn-ui-locked');
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
    const issues = validateUiInteractability(snapshot).filter(issue => issue.freezeKind === 'human-turn-ui-locked');
    clearUiLocks('freeze-watchdog-post-build-unlock', snapshot);
    recoverAllowedActionContainers(snapshot, issues);
    try {
        if (typeof render === 'function') render();
    } catch (_) {}
    markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: 'post-build-ui-blocked' });
    return true;
}

function clearActionContainerForRecovery(spec) {
    if (!spec || !spec.targetId) return false;
    let changed = false;
    [spec.modalId, spec.targetId].filter(Boolean).forEach(id => {
        const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null;
        if (!el) return;
        if (el.hidden) { el.hidden = false; changed = true; }
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
            el.style.pointerEvents = id === 'pendingModal' || id === 'pendingMenu' ? 'auto' : '';
            changed = true;
        }
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
    markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: 'pending-ui-locked', issues });
    return changed;
}

function clearUiInteractabilityIssueTargets(issues) {
    let changed = false;
    (issues || []).forEach(issue => {
        if (!issue || !issue.target || issue.target === 'body') return;
        const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(issue.target) : null;
        if (!el) return;
        if (el.hidden) { el.hidden = false; changed = true; }
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
    const issues = validateUiInteractability(snapshot).filter(issue => issue.freezeKind === 'human-turn-ui-locked');
    const changed = recoverAllowedActionContainers(snapshot, issues) || clearUiInteractabilityIssueTargets(issues);
    clearUiLocks('freeze-watchdog-human-turn-unlock', snapshot);
    try {
        if (typeof render === 'function') render();
    } catch (_) {}
    markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: 'human-turn-ui-locked', issues });
    return changed || issues.length > 0;
}

function recoverModalUiLock(snapshot) {
    const issues = validateUiInteractability(snapshot).filter(issue => issue.freezeKind === 'modal-ui-locked');
    if (!issues.length) return false;
    let changed = false;
    issues.forEach(issue => {
        const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(issue.target) : null;
        if (!el) return;
        if (el.inert) { el.inert = false; changed = true; }
        if (el.style && el.style.pointerEvents === 'none') { el.style.pointerEvents = 'auto'; changed = true; }
    });
    if (changed) markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: 'modal-ui-locked', issues });
    return changed;
}

function recoverStaleModalUiLock(snapshot) {
    const closed = closeStaleBlockingModals(snapshot, 'freeze-watchdog-stale-modal');
    if (!closed) return false;
    clearUiLocks('freeze-watchdog-stale-modal-unlock', snapshot);
    try {
        if (typeof render === 'function') render();
    } catch (_) {}
    markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: 'stale-modal-ui-locked' });
    return true;
}

function recoverUiInteractability(snapshot) {
    const before = snapshot || buildClientRuntimeSnapshot('ui-recovery-before');
    const freezeKind = classifyLikelyFreeze(before);
    if (!freezeKind) return false;
    const issues = validateUiInteractability(before).filter(issue => issue && issue.freezeKind);
    let recovered = false;
    if (freezeKind === 'post-build-ui-blocked') recovered = recoverPostBuildUiFreeze(before);
    else if (freezeKind === 'human-turn-ui-locked') recovered = recoverHumanUiLock(before);
    else if (freezeKind === 'pending-ui-locked') recovered = recoverPendingUiLock(before);
    else if (freezeKind === 'stale-modal-ui-locked') recovered = recoverStaleModalUiLock(before);
    else if (freezeKind.startsWith('modal-ui-locked')) recovered = recoverModalUiLock(before);
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
    const issues = validateUiInteractability(snapshot).filter(issue => issue && issue.freezeKind);
    if (!issues.length) return freezeWatchdogStateKey(snapshot);
    return issues
        .map(issue => [issue.freezeKind, issue.kind, issue.phase || '', issue.action || '', issue.target || '', issue.reason || ''].join(':'))
        .sort()
        .join('|');
}

function compactElementSnapshotForStorage(state) {
    if (!state) return null;
    return {
        id: state.id || '',
        display: state.display || '',
        computedDisplay: state.computedDisplay || '',
        visibility: state.visibility || '',
        computedVisibility: state.computedVisibility || '',
        pointerEvents: state.pointerEvents || '',
        computedPointerEvents: state.computedPointerEvents || '',
        disabled: !!state.disabled,
        hidden: !!state.hidden,
        inert: !!state.inert,
        ancestorBlocked: !!state.ancestorBlocked,
        ariaHidden: state.ariaHidden || null,
        htmlLength: state.htmlLength || 0,
        totalInteractiveChildren: state.totalInteractiveChildren || 0,
        usableInteractiveChildren: state.usableInteractiveChildren || 0,
    };
}

function compactFreezePayloadForStorage(payload) {
    const snapshot = payload && payload.snapshot || {};
    const ui = snapshot.ui || {};
    const buttons = snapshot.actionButtons && snapshot.actionButtons.buttons || {};
    return {
        freezeKind: payload && payload.freezeKind,
        stagnantMs: payload && payload.stagnantMs,
        interactabilityIssues: Array.isArray(payload && payload.interactabilityIssues) ? payload.interactabilityIssues.map(compactIssueForTrace) : [],
        snapshot: {
            reason: snapshot.reason || '',
            timestamp: snapshot.timestamp || '',
            phase: snapshot.phase || '',
            builtThisTurn: !!snapshot.builtThisTurn,
            turnCount: snapshot.turnCount,
            currentPlayerIndex: snapshot.currentPlayerIndex,
            isCpuTurn: !!snapshot.isCpuTurn,
            isOnlineGame: snapshot.isOnlineGame,
            isRoomHost: snapshot.isRoomHost,
            myPlayerIndex: snapshot.myPlayerIndex,
            onlineActionInFlight: snapshot.onlineActionInFlight,
            isReconnectingOnline: snapshot.isReconnectingOnline,
            socketConnected: snapshot.socketConnected,
            allowedActions: Array.isArray(snapshot.allowedActions) ? snapshot.allowedActions : [],
            visibleModals: Array.isArray(snapshot.visibleModals) ? snapshot.visibleModals : [],
            bodyClassName: snapshot.bodyClassName || '',
            pendingFields: snapshot.pendingFields || null,
            ui: {
                gameScreen: compactElementSnapshotForStorage(ui.gameScreen),
                pendingModal: compactElementSnapshotForStorage(ui.pendingModal),
                pendingMenu: compactElementSnapshotForStorage(ui.pendingMenu),
                buildMenu: compactElementSnapshotForStorage(ui.buildMenu),
                btnSkip: compactElementSnapshotForStorage(ui.btnSkip),
                confirmModal: compactElementSnapshotForStorage(ui.confirmModal),
                btnRoll: compactElementSnapshotForStorage(ui.btnRoll),
                btnReroll: compactElementSnapshotForStorage(ui.btnReroll),
                diceChoose: compactElementSnapshotForStorage(ui.diceChoose),
                cardDetailModal: compactElementSnapshotForStorage(ui.cardDetailModal),
                cardSelectModal: compactElementSnapshotForStorage(ui.cardSelectModal),
                rulesModal: compactElementSnapshotForStorage(ui.rulesModal),
            },
            actionButtons: {
                enabled: snapshot.actionButtons && Array.isArray(snapshot.actionButtons.enabled) ? snapshot.actionButtons.enabled : [],
                buttons: Object.fromEntries(Object.entries(buttons).map(([id, state]) => [id, compactElementSnapshotForStorage(state)])),
            },
        },
    };
}

function freezePayloadStorageJson(payload) {
    const full = JSON.stringify(payload);
    if (full.length <= 7000) return full;
    const compact = JSON.stringify(compactFreezePayloadForStorage(payload));
    if (compact.length <= 7000) return compact;
    return JSON.stringify({
        freezeKind: payload && payload.freezeKind,
        stagnantMs: payload && payload.stagnantMs,
        snapshot: {
            phase: payload && payload.snapshot && payload.snapshot.phase || '',
            allowedActions: payload && payload.snapshot && payload.snapshot.allowedActions || [],
            visibleModals: payload && payload.snapshot && payload.snapshot.visibleModals || [],
        },
    });
}

function buildFreezeReportStack(payload) {
    const snapshot = payload && payload.snapshot || {};
    const ui = snapshot.ui || {};
    const buttonSummary = snapshot.actionButtons && snapshot.actionButtons.buttons
        ? Object.fromEntries(Object.entries(snapshot.actionButtons.buttons).map(([id, state]) => [id, state ? { disabled: !!state.disabled, hidden: !!state.hidden, inert: !!state.inert, ancestorBlocked: !!state.ancestorBlocked, pointerEvents: state.pointerEvents || state.computedPointerEvents || '' } : null]))
        : {};
    return 'FREEZE_SUMMARY ' + JSON.stringify({
        freezeKind: payload && payload.freezeKind,
        stagnantMs: payload && payload.stagnantMs,
        phase: snapshot.phase,
        currentPlayerIndex: snapshot.currentPlayerIndex,
        myPlayerIndex: snapshot.myPlayerIndex,
        isOnlineGame: snapshot.isOnlineGame,
        onlineActionInFlight: snapshot.onlineActionInFlight,
        isReconnectingOnline: snapshot.isReconnectingOnline,
        socketConnected: snapshot.socketConnected,
        allowedActions: snapshot.allowedActions,
        visibleModals: snapshot.visibleModals,
        gameScreen: ui.gameScreen ? { display: ui.gameScreen.display, hidden: !!ui.gameScreen.hidden, inert: !!ui.gameScreen.inert, ariaHidden: ui.gameScreen.ariaHidden, pointerEvents: ui.gameScreen.pointerEvents || ui.gameScreen.computedPointerEvents || '' } : null,
        confirmModal: ui.confirmModal ? { display: ui.confirmModal.display, hidden: !!ui.confirmModal.hidden, inert: !!ui.confirmModal.inert, ariaHidden: ui.confirmModal.ariaHidden, ancestorBlocked: !!ui.confirmModal.ancestorBlocked, pointerEvents: ui.confirmModal.pointerEvents || ui.confirmModal.computedPointerEvents || '', awaitingChoice: isConfirmModalAwaitingUserChoice() } : null,
        bodyClassName: snapshot.bodyClassName || '',
        expectedPrimaryActions: expectedPrimaryActions(snapshot),
        interactabilityIssues: Array.isArray(payload && payload.interactabilityIssues) ? payload.interactabilityIssues.map(compactIssueForTrace) : validateUiInteractability(snapshot),
        pendingMenu: ui.pendingMenu ? { display: ui.pendingMenu.display, hidden: !!ui.pendingMenu.hidden, inert: !!ui.pendingMenu.inert, ancestorBlocked: !!ui.pendingMenu.ancestorBlocked, pointerEvents: ui.pendingMenu.pointerEvents || ui.pendingMenu.computedPointerEvents || '', htmlLength: ui.pendingMenu.htmlLength } : null,
        pendingModal: ui.pendingModal ? { display: ui.pendingModal.display, hidden: !!ui.pendingModal.hidden, inert: !!ui.pendingModal.inert, pointerEvents: ui.pendingModal.pointerEvents || ui.pendingModal.computedPointerEvents || '' } : null,
        actionButtons: buttonSummary,
        recovery: payload && payload.recovery ? {
            attempted: !!payload.recovery.attempted,
            success: !!payload.recovery.success,
        } : null,
    });
}

function checkFreezeWatchdog() {
    const now = Date.now();
    const snapshot = buildClientRuntimeSnapshot('freeze-watchdog');
    markClientFlowCheckpoint('freeze-watchdog-tick', { phase: snapshot.phase, turnCount: snapshot.turnCount });
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
    if (freezeKind === 'post-build-ui-blocked') {
        const recovered = recoverUiInteractability(snapshot);
        const after = buildClientRuntimeSnapshot('freeze-watchdog-post-build-after-recovery');
        if (recovered && classifyLikelyFreeze(after) !== freezeKind) {
            _freezeWatchdogLastKey = freezeWatchdogStateKey(after);
            _freezeWatchdogLastChangedAt = now;
            markClientFlowCheckpoint('freeze-watchdog-recovered-without-report', {
                freezeKind,
                before: compactSnapshotForUiTrace(snapshot),
                after: compactSnapshotForUiTrace(after),
            });
            return;
        }
    }
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
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('machikoroFreezeSnapshot', freezePayloadStorageJson(payload));
        }
    } catch (_) {}
    const recovered = recoverUiInteractability(snapshot);
    payload.recovery = { attempted: true, success: !!recovered };
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

function initMainView() {
    loadSettings();
    renderOnlinePlayerSettings();
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
