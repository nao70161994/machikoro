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

    return Object.freeze({
        stateKey,
        compactIssueForTrace,
        compactSnapshotForTrace,
        classifyInteractabilityCause,
        normalizeFreezeKind,
        hasPendingWork,
        classifyFreezeFacts,
        compactElementSnapshotForStorage,
        compactFreezePayloadForStorage,
        freezePayloadStorageJson,
    });

})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiWatchdog;
if (typeof window !== 'undefined') window.UiWatchdog = UiWatchdog;
if (typeof globalThis !== 'undefined') globalThis.UiWatchdog = UiWatchdog;
