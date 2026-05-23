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
    return {
        display: el.style ? el.style.display || '' : '',
        computedDisplay,
        visibility: el.style ? el.style.visibility || '' : '',
        computedVisibility,
        pointerEvents: el.style ? el.style.pointerEvents || '' : '',
        computedPointerEvents,
        disabled: !!el.disabled,
        hidden: !!el.hidden,
        inert: !!el.inert,
        ariaHidden: typeof el.getAttribute === 'function' ? el.getAttribute('aria-hidden') : null,
        className: el.className || '',
        htmlLength: typeof el.innerHTML === 'string' ? el.innerHTML.length : 0,
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
    if (snapshot.disabled || snapshot.hidden || snapshot.inert) return false;
    if (snapshot.display === 'none' || snapshot.computedDisplay === 'none') return false;
    if (snapshot.visibility === 'hidden' || snapshot.computedVisibility === 'hidden') return false;
    if (snapshot.pointerEvents === 'none' || snapshot.computedPointerEvents === 'none') return false;
    return true;
}

function primaryActionButtonStates() {
    const buttons = {
        btnRoll: safeElementSnapshot('btnRoll'),
        btnSkip: safeElementSnapshot('btnSkip'),
        btnReroll: safeElementSnapshot('btnReroll'),
    };
    const enabled = Object.entries(buttons)
        .filter(([, snapshot]) => isElementUsablyEnabled(snapshot))
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
        },
    };
}

function isHumanTurnSnapshot(snapshot) {
    if (!snapshot || !snapshot.phase || snapshot.isCpuTurn) return false;
    return !snapshot.isOnlineGame || snapshot.currentPlayerIndex === snapshot.myPlayerIndex;
}

function expectedPrimaryActions(snapshot) {
    const allowed = Array.isArray(snapshot.allowedActions) ? snapshot.allowedActions : [];
    return allowed.filter(action => ['rollDice', 'nextTurn'].includes(action));
}

function hasUsablePrimaryAction(snapshot) {
    const enabled = snapshot && snapshot.actionButtons && Array.isArray(snapshot.actionButtons.enabled)
        ? snapshot.actionButtons.enabled
        : [];
    return enabled.length > 0;
}

function closeStaleBlockingModals() {
    ['confirmModal', 'cardSelectModal', 'cardDetailModal', 'rulesModal'].forEach(id => {
        const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null;
        if (el && el.style) el.style.display = 'none';
    });
    const pendingModal = typeof document !== 'undefined' && document.getElementById ? document.getElementById('pendingModal') : null;
    const pendingMenu = typeof document !== 'undefined' && document.getElementById ? document.getElementById('pendingMenu') : null;
    if (pendingModal && pendingModal.style && pendingMenu && !pendingMenu.innerHTML) pendingModal.style.display = 'none';
}

function clearUiLocks(reason = 'ui-unlock') {
    ['titleScreen', 'gameScreen', 'pwaUpdateBanner', 'pwaInstallBanner'].forEach(id => {
        const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null;
        if (!el) return;
        el.inert = false;
        if (typeof el.removeAttribute === 'function') el.removeAttribute('aria-hidden');
        if (el.style && el.style.pointerEvents === 'none') el.style.pointerEvents = '';
    });
    if (typeof document !== 'undefined' && document.body && document.body.classList) document.body.classList.remove('modal-open');
    closeStaleBlockingModals();
    markClientFlowCheckpoint(reason);
}

function unlockUiForHumanTurn(reason = 'human-turn-unlock') {
    const snapshot = buildClientRuntimeSnapshot(reason);
    if (!isHumanTurnSnapshot(snapshot)) return false;
    if (!expectedPrimaryActions(snapshot).length && !hasPendingWork(snapshot)) return false;
    clearUiLocks(reason);
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

// ===== クラッシュ回復 =====
let _crashShown = false;

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
    const focusTarget = resumeBtn && resumeBtn.style.display !== 'none'
        ? resumeBtn
        : el.querySelector && el.querySelector('[data-ui-action="reloadPage"]');
    if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
    else if (typeof el.focus === 'function') el.focus();
}

function crashResume() {
    _crashShown = false;
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
    const confirmOpen = !!(ui.confirmModal && ui.confirmModal.display && ui.confirmModal.display !== 'none');
    const pendingOpenWithoutContent = snapshot.phase === 'pending' && isMyTurn && !snapshot.isCpuTurn && !hasPendingWork(snapshot) && !(ui.pendingMenu && ui.pendingMenu.htmlLength > 0);
    const expectedActions = expectedPrimaryActions(snapshot);
    const noUsablePrimaryAction = isMyTurn && !snapshot.isCpuTurn && expectedActions.length > 0 && !hasUsablePrimaryAction(snapshot);
    if (snapshot.phase === 'build' && snapshot.builtThisTurn && isMyTurn && !snapshot.isCpuTurn && (skipDisabled || gameInert || confirmOpen || noUsablePrimaryAction)) {
        return 'post-build-ui-blocked';
    }
    if (noUsablePrimaryAction) return 'human-turn-ui-locked';
    if (pendingOpenWithoutContent) return 'pending-without-action';
    if (snapshot.isCpuTurn && !snapshot.onlineActionInFlight) return 'cpu-turn-stalled';
    if (snapshot.onlineActionInFlight) return 'online-action-in-flight-stalled';
    return '';
}

function recoverPostBuildUiFreeze(snapshot) {
    if (!snapshot || snapshot.phase !== 'build' || !snapshot.builtThisTurn) return false;
    try {
        if (typeof render === 'function') render();
    } catch (_) {}
    const gameScreen = typeof document !== 'undefined' && document.getElementById ? document.getElementById('gameScreen') : null;
    if (gameScreen) gameScreen.inert = false;
    const confirmModal = typeof document !== 'undefined' && document.getElementById ? document.getElementById('confirmModal') : null;
    if (confirmModal && confirmModal.style) confirmModal.style.display = 'none';
    const btnSkip = typeof document !== 'undefined' && document.getElementById ? document.getElementById('btnSkip') : null;
    if (btnSkip) {
        btnSkip.disabled = false;
        btnSkip.textContent = '建設完了・ターン終了';
    }
    markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: 'post-build-ui-blocked' });
    return true;
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
    const reportKey = freezeKind + '|' + key;
    if (_freezeWatchdogLastReportKey === reportKey && now - _freezeWatchdogLastReportAt < 60000) return;
    _freezeWatchdogLastReportKey = reportKey;
    _freezeWatchdogLastReportAt = now;
    const payload = { freezeKind, stagnantMs: now - _freezeWatchdogLastChangedAt, snapshot };
    markClientFlowCheckpoint('freeze-watchdog-report', payload);
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('machikoroFreezeSnapshot', JSON.stringify(payload).slice(0, 7000));
        }
    } catch (_) {}
    if (typeof reportClientError === 'function') {
        reportClientError({
            source: 'freeze-watchdog',
            phase: snapshot.phase,
            message: freezeKind + ' after ' + payload.stagnantMs + 'ms',
            stack: 'FREEZE_SNAPSHOT ' + JSON.stringify(payload).slice(0, 1800),
        });
    }
    if (freezeKind === 'post-build-ui-blocked') recoverPostBuildUiFreeze(snapshot);
    else if (freezeKind === 'human-turn-ui-locked') unlockUiForHumanTurn('freeze-watchdog-human-turn-unlock');
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
