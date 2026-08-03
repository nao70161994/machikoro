'use strict';

const UiWatchdog = (() => {
    function stateKey(snapshot) {
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
        return !!(pending.pendingTV || pending.pendingBusiness || pending.pendingCleaning ||
            pending.pendingMover || pending.pendingRenovation || pending.pendingIT);
    }

    function buildFreezeFacts(snapshot, observations = {}) {
        const ui = snapshot && snapshot.ui || {};
        const isMyTurn = !!snapshot && (!snapshot.isOnlineGame || snapshot.currentPlayerIndex === snapshot.myPlayerIndex);
        const expectedActions = expectedPrimaryActions(snapshot);
        const expectedPending = expectedPendingActions(snapshot);
        const onlineBlocked = isOnlineUiBlockedSnapshot(snapshot);
        const interactabilityIssues = Array.isArray(observations.interactabilityIssues)
            ? observations.interactabilityIssues : [];
        return {
            phase: snapshot && snapshot.phase || '',
            builtThisTurn: !!(snapshot && snapshot.builtThisTurn),
            isMyTurn,
            isCpuTurn: !!(snapshot && snapshot.isCpuTurn),
            onlineBlocked,
            confirmOpen: observations.confirmOpen === true,
            staleConfirmOpen: observations.staleConfirmOpen === true,
            activeBlockingModalOpen: observations.activeBlockingModalOpen === true,
            hasExpectedPendingActions: expectedPending.length > 0,
            stalePendingOpen: observations.stalePendingOpen === true,
            skipDisabled: !!(ui.btnSkip && ui.btnSkip.disabled),
            gameInert: !!(ui.gameScreen && ui.gameScreen.inert),
            gameScreenHidden: !!(ui.gameScreen && (ui.gameScreen.display === 'none' || ui.gameScreen.computedDisplay === 'none')),
            noUsablePrimaryAction: isMyTurn && !(snapshot && snapshot.isCpuTurn) && !onlineBlocked &&
                expectedActions.length > 0 && observations.hasUsablePrimaryAction !== true,
            noUsablePendingAction: isMyTurn && !(snapshot && snapshot.isCpuTurn) && !onlineBlocked &&
                expectedPending.length > 0 && observations.hasUsablePendingAction !== true,
            pendingOpenWithoutContent: !!snapshot && snapshot.phase === 'pending' && isMyTurn &&
                !snapshot.isCpuTurn && !hasPendingWork(snapshot) && !(ui.pendingMenu && ui.pendingMenu.htmlLength > 0),
            onlineActionInFlight: !!(snapshot && snapshot.onlineActionInFlight),
            cpuStepScheduled: !!(snapshot && snapshot.cpuStepScheduled),
            onlineActionTimedOut: observations.onlineActionTimedOut === true,
            modalIssue: interactabilityIssues.find(issue => issue && issue.freezeKind === observations.modalFreezeKind) || null,
            pendingIssue: interactabilityIssues.find(issue => issue && issue.freezeKind === observations.pendingFreezeKind) || null,
            humanIssue: interactabilityIssues.find(issue => issue && issue.freezeKind === observations.humanFreezeKind) || null,
        };
    }

    function classifyFreezeFacts(facts, freezeKinds) {
        if (facts.modalIssue) return facts.modalIssue.freezeKind + ':' + facts.modalIssue.reason;
        if (facts.stalePendingOpen && facts.isMyTurn && !facts.isCpuTurn && !facts.onlineBlocked) {
            return freezeKinds.STALE_MODAL_UI_LOCKED;
        }
        if ((facts.confirmOpen && !facts.staleConfirmOpen) ||
            (facts.activeBlockingModalOpen && !facts.hasExpectedPendingActions)) return '';
        if (!facts.activeBlockingModalOpen && !facts.onlineBlocked && facts.phase === 'build' &&
            facts.builtThisTurn && facts.isMyTurn && !facts.isCpuTurn &&
            (facts.skipDisabled || facts.gameInert || facts.gameScreenHidden ||
                facts.staleConfirmOpen || facts.noUsablePrimaryAction || facts.humanIssue)) {
            return freezeKinds.POST_BUILD_UI_BLOCKED;
        }
        if (facts.pendingIssue || facts.noUsablePendingAction) return freezeKinds.PENDING_UI_LOCKED;
        if ((!facts.activeBlockingModalOpen && facts.noUsablePrimaryAction) || facts.humanIssue) {
            return freezeKinds.HUMAN_TURN_UI_LOCKED;
        }
        if (facts.pendingOpenWithoutContent) return freezeKinds.PENDING_WITHOUT_ACTION;
        if (facts.isCpuTurn && !facts.onlineActionInFlight && !facts.cpuStepScheduled) {
            return freezeKinds.CPU_TURN_STALLED;
        }
        if (facts.onlineActionInFlight && facts.onlineActionTimedOut) {
            return freezeKinds.ONLINE_ACTION_IN_FLIGHT_STALLED;
        }
        return '';
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

    function compactFreezePayloadForStorage(payload, compactIssue) {
        const snapshot = payload && payload.snapshot || {};
        const ui = snapshot.ui || {};
        const buttons = snapshot.actionButtons && snapshot.actionButtons.buttons || {};
        const compactIssueForStorage = typeof compactIssue === 'function' ? compactIssue : issue => issue;
        return {
            freezeKind: payload && payload.freezeKind,
            stagnantMs: payload && payload.stagnantMs,
            interactabilityIssues: Array.isArray(payload && payload.interactabilityIssues) ? payload.interactabilityIssues.map(compactIssueForStorage) : [],
            recovery: payload && payload.recovery ? {
                attempted: !!payload.recovery.attempted,
                success: !!payload.recovery.success,
            } : null,
            snapshot: {
                reason: snapshot.reason || '',
                timestamp: snapshot.timestamp || '',
                phase: snapshot.phase || '',
                builtThisTurn: !!snapshot.builtThisTurn,
                turnCount: snapshot.turnCount,
                currentPlayerIndex: snapshot.currentPlayerIndex,
                isCpuTurn: !!snapshot.isCpuTurn,
                cpuStepScheduled: !!snapshot.cpuStepScheduled,
                cpuSchedulerHealth: snapshot.cpuSchedulerHealth || null,
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

    function freezePayloadStorageJson(payload, compactIssue, limit = 7000) {
        const full = JSON.stringify(payload);
        if (full.length <= limit) return full;
        const compact = JSON.stringify(compactFreezePayloadForStorage(payload, compactIssue));
        if (compact.length <= limit) return compact;
        return JSON.stringify({
            freezeKind: payload && payload.freezeKind,
            stagnantMs: payload && payload.stagnantMs,
            recovery: payload && payload.recovery ? {
                attempted: !!payload.recovery.attempted,
                success: !!payload.recovery.success,
            } : null,
            snapshot: {
                phase: payload && payload.snapshot && payload.snapshot.phase || '',
                cpuSchedulerHealth: payload && payload.snapshot && payload.snapshot.cpuSchedulerHealth || null,
                allowedActions: payload && payload.snapshot && payload.snapshot.allowedActions || [],
                visibleModals: payload && payload.snapshot && payload.snapshot.visibleModals || [],
            },
        });
    }

    function buildFreezeReportStack(payload, options = {}) {
        const snapshot = payload && payload.snapshot || {};
        const ui = snapshot.ui || {};
        const recoveryStatus = payload && payload.recovery
            ? (payload.recovery.success ? 'recovery=success' : 'recovery=failed')
            : 'recovery=none';
        return 'FREEZE_SUMMARY ' + JSON.stringify({
            schemaVersion: options.schemaVersion || 1,
            freezeKind: payload && payload.freezeKind,
            recoveryStatus,
            stagnantMs: payload && payload.stagnantMs,
            phase: snapshot.phase,
            currentPlayerIndex: snapshot.currentPlayerIndex,
            myPlayerIndex: snapshot.myPlayerIndex,
            isOnlineGame: snapshot.isOnlineGame,
            cpuStepScheduled: snapshot.cpuStepScheduled,
            cpuSchedulerHealth: snapshot.cpuSchedulerHealth || null,
            onlineActionInFlight: snapshot.onlineActionInFlight,
            isReconnectingOnline: snapshot.isReconnectingOnline,
            socketConnected: snapshot.socketConnected,
            allowedActions: snapshot.allowedActions,
            visibleModals: snapshot.visibleModals,
            gameScreen: ui.gameScreen ? {
                display: ui.gameScreen.display,
                hidden: !!ui.gameScreen.hidden,
                inert: !!ui.gameScreen.inert,
                ariaHidden: ui.gameScreen.ariaHidden,
                pointerEvents: ui.gameScreen.pointerEvents || ui.gameScreen.computedPointerEvents || '',
            } : null,
            confirmModal: ui.confirmModal ? {
                display: ui.confirmModal.display,
                hidden: !!ui.confirmModal.hidden,
                inert: !!ui.confirmModal.inert,
                ariaHidden: ui.confirmModal.ariaHidden,
                ancestorBlocked: !!ui.confirmModal.ancestorBlocked,
                pointerEvents: ui.confirmModal.pointerEvents || ui.confirmModal.computedPointerEvents || '',
                awaitingChoice: options.confirmAwaitingChoice === true,
            } : null,
            bodyClassName: snapshot.bodyClassName || '',
            expectedPrimaryActions: Array.isArray(options.expectedPrimaryActions)
                ? options.expectedPrimaryActions : [],
            interactabilityIssues: Array.isArray(options.interactabilityIssues)
                ? options.interactabilityIssues : [],
            pendingMenu: ui.pendingMenu ? {
                display: ui.pendingMenu.display,
                hidden: !!ui.pendingMenu.hidden,
                inert: !!ui.pendingMenu.inert,
                ancestorBlocked: !!ui.pendingMenu.ancestorBlocked,
                pointerEvents: ui.pendingMenu.pointerEvents || ui.pendingMenu.computedPointerEvents || '',
                htmlLength: ui.pendingMenu.htmlLength,
            } : null,
            pendingModal: ui.pendingModal ? {
                display: ui.pendingModal.display,
                hidden: !!ui.pendingModal.hidden,
                inert: !!ui.pendingModal.inert,
                pointerEvents: ui.pendingModal.pointerEvents || ui.pendingModal.computedPointerEvents || '',
            } : null,
            actionChildren: Array.isArray(options.actionChildren) ? options.actionChildren : [],
            recovery: payload && payload.recovery ? {
                attempted: !!payload.recovery.attempted,
                success: !!payload.recovery.success,
            } : null,
        });
    }

    function compactRecentCheckpoints(entries, limit = 8) {
        const list = Array.isArray(entries) ? entries : [];
        return list.slice(Math.max(0, list.length - limit)).map(entry => ({
            event: entry && entry.event || '',
            timestamp: entry && entry.timestamp || '',
            details: entry && entry.details || {},
            phase: entry && entry.snapshot && entry.snapshot.phase || '',
            allowedActions: entry && entry.snapshot && Array.isArray(entry.snapshot.allowedActions)
                ? entry.snapshot.allowedActions : [],
        }));
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

    function issueDedupeSignature(snapshot, issues) {
        const actionable = Array.isArray(issues)
            ? issues.filter(issue => issue && issue.freezeKind)
            : [];
        if (!actionable.length) return stateKey(snapshot);
        return actionable
            .map(issue => [
                issue.freezeKind,
                issue.kind,
                issue.phase || '',
                issue.action || '',
                issue.target || '',
                issue.reason || '',
            ].join(':'))
            .sort()
            .join('|');
    }

    function compactSnapshotForTrace(snapshot) {
        const ui = snapshot && snapshot.ui || {};
        return {
            phase: snapshot && snapshot.phase || '',
            builtThisTurn: !!(snapshot && snapshot.builtThisTurn),
            currentPlayerIndex: snapshot && snapshot.currentPlayerIndex,
            myPlayerIndex: snapshot && snapshot.myPlayerIndex,
            isCpuTurn: !!(snapshot && snapshot.isCpuTurn),
            cpuStepScheduled: !!(snapshot && snapshot.cpuStepScheduled),
            cpuSchedulerHealth: snapshot && snapshot.cpuSchedulerHealth || null,
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

    function classifyInteractabilityCause(issue, snapshot) {
        if (!issue) return 'unknown';
        if (issue.reason === 'stale-modal' || issue.target === 'body') return 'modal-close-lock-leftover';
        if (issue.target === 'gameScreen' && (issue.reason === 'parent-inert' || issue.reason === 'parent-display-none')) return 'screen-lock-leftover';
        if (issue.reason === 'pointer-events-none') return 'inline-style-leftover';
        if (issue.reason === 'parent-display-none' || issue.reason === 'hidden-mismatch') return 'render-container-hidden';
        if (issue.reason === 'child-not-clickable' || issue.reason === 'disabled-mismatch') return 'allowed-actions-render-state-mismatch';
        if (snapshot && snapshot.phase === 'build' && issue.action === 'nextTurn') return 'build-after-action-display-sync';
        return 'allowed-actions-render-state-mismatch';
    }

    function normalizeFreezeKind(freezeKind) {
        return String(freezeKind || '').split(':')[0];
    }

    function classListText(element) {
        if (!element) return '';
        if (typeof element.className === 'string') return element.className;
        if (element.classList && typeof element.classList.value === 'string') return element.classList.value;
        return '';
    }

    function isElementUsablyEnabled(snapshot) {
        if (!snapshot) return false;
        if (snapshot.disabled || snapshot.hidden || snapshot.inert || snapshot.ancestorBlocked) return false;
        if (snapshot.display === 'none' || snapshot.computedDisplay === 'none') return false;
        if (snapshot.visibility === 'hidden' || snapshot.computedVisibility === 'hidden') return false;
        if (snapshot.pointerEvents === 'none' || snapshot.computedPointerEvents === 'none') return false;
        return true;
    }

    function lockReasonForElement(state) {
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

    function snapshotStateById(snapshot, id, targetSource = '') {
        const ui = snapshot && snapshot.ui || {};
        const buttons = snapshot && snapshot.actionButtons && snapshot.actionButtons.buttons || {};
        if (targetSource === 'actionButtons') return buttons[id] || ui[id];
        return ui[id] || buttons[id];
    }

    function isActionContainerStateUsable(spec, state, options = {}) {
        if (!spec || !state) return false;
        if (spec.requiresContent && state.htmlLength <= 0) return false;
        if (spec.requiresContent && options.hasExpectedChildSpec) {
            const childState = options.actionChildState || {};
            if (childState.total <= 0 || childState.usable <= 0) return false;
        }
        if (spec.requiresContent && state.totalInteractiveChildren > 0 && state.usableInteractiveChildren <= 0) return false;
        if (!isElementUsablyEnabled(state)) return false;
        if (spec.modalId && options.modalState && !isElementUsablyEnabled(options.modalState)) return false;
        return true;
    }

    function shouldIgnoreInactiveActionContainerIssue(spec, hasExpectedChildSpec, reason) {
        if (!spec || !spec.requiresContent || hasExpectedChildSpec) return false;
        return reason === 'not-clickable' || reason === 'action-child-not-clickable' || reason === 'child-not-clickable';
    }

    function isHumanTurnSnapshot(snapshot) {
        if (!snapshot || !snapshot.phase || snapshot.isCpuTurn) return false;
        return !snapshot.isOnlineGame || snapshot.currentPlayerIndex === snapshot.myPlayerIndex;
    }

    function expectedPendingActions(snapshot) {
        const allowed = Array.isArray(snapshot && snapshot.allowedActions) ? snapshot.allowedActions : [];
        const pendingActions = new Set(['resolveTV', 'resolveBusiness', 'resolveCleaning', 'resolveMover', 'resolveRenovation', 'resolveIT']);
        return allowed.filter(action => pendingActions.has(action));
    }

    function expectedPrimaryActions(snapshot) {
        const allowed = Array.isArray(snapshot && snapshot.allowedActions) ? snapshot.allowedActions : [];
        const primaryActions = new Set(['rollDice', 'nextTurn', 'selectDice', 'rerollDice', 'skipReroll', 'resolveHarbor']);
        return allowed.filter(action => primaryActions.has(action));
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

    function isPostBuildNextTurnSnapshot(snapshot, activeBlockingModal = false) {
        if (!snapshot || snapshot.phase !== 'build' || !snapshot.builtThisTurn) return false;
        if (!isHumanTurnSnapshot(snapshot) || isOnlineUiBlockedSnapshot(snapshot)) return false;
        if (activeBlockingModal) return false;
        const allowed = Array.isArray(snapshot.allowedActions) ? snapshot.allowedActions : [];
        const pending = snapshot.pendingFields || {};
        return allowed.includes('nextTurn') && !pending.pendingRenovation;
    }

    function isExplicitModalOpen(state) {
        if (!state || state.hidden) return false;
        if (state.display === 'none' || state.computedDisplay === 'none') return false;
        if (state.visibility === 'hidden' || state.computedVisibility === 'hidden') return false;
        return !!(state.display || state.computedDisplay);
    }

    function isStaleConfirmModalSnapshot(snapshot, options = {}) {
        if (!snapshot || options.confirmOpen !== true || options.awaitingChoice === true) return false;
        const allowed = Array.isArray(snapshot.allowedActions) ? snapshot.allowedActions : [];
        if (snapshot.phase === 'build' && !!snapshot.builtThisTurn && allowed.includes('nextTurn')) return true;
        return snapshot.phase === 'roll' && allowed.includes('rollDice');
    }

    function isStalePendingModalSnapshot(snapshot, pendingOpen = false) {
        if (!snapshot || !pendingOpen) return false;
        const pendingMenu = snapshot.ui && snapshot.ui.pendingMenu;
        return expectedPendingActions(snapshot).length === 0 || !pendingMenu || pendingMenu.htmlLength <= 0;
    }

    function isOnlineUiBlockedSnapshot(snapshot) {
        if (!snapshot || !snapshot.isOnlineGame) return false;
        if (snapshot.onlineActionInFlight || snapshot.isReconnectingOnline) return true;
        return snapshot.socketConnected === false;
    }

    return Object.freeze({
        stateKey,
        compactIssueForTrace,
        issueDedupeSignature,
        compactSnapshotForTrace,
        classifyInteractabilityCause,
        normalizeFreezeKind,
        classListText,
        isElementUsablyEnabled,
        lockReasonForElement,
        snapshotStateById,
        isActionContainerStateUsable,
        shouldIgnoreInactiveActionContainerIssue,
        isHumanTurnSnapshot,
        expectedPendingActions,
        expectedPrimaryActions,
        isActiveGameScreenRecoverySnapshot,
        shouldRestoreGameScreenDisplay,
        isPostBuildNextTurnSnapshot,
        isExplicitModalOpen,
        isStaleConfirmModalSnapshot,
        isStalePendingModalSnapshot,
        isOnlineUiBlockedSnapshot,
        hasPendingWork,
        buildFreezeFacts,
        classifyFreezeFacts,
        compactElementSnapshotForStorage,
        compactFreezePayloadForStorage,
        freezePayloadStorageJson,
        buildFreezeReportStack,
        compactRecentCheckpoints,
    });

})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiWatchdog;
if (typeof window !== 'undefined') window.UiWatchdog = UiWatchdog;
if (typeof globalThis !== 'undefined') globalThis.UiWatchdog = UiWatchdog;
