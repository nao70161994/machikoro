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
        if (facts.onlineActionInFlight) return freezeKinds.ONLINE_ACTION_IN_FLIGHT_STALLED;
        return '';
    }

    return Object.freeze({ stateKey, hasPendingWork, classifyFreezeFacts });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiWatchdog;
if (typeof window !== 'undefined') window.UiWatchdog = UiWatchdog;
if (typeof globalThis !== 'undefined') globalThis.UiWatchdog = UiWatchdog;
