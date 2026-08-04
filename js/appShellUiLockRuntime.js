'use strict';

const AppShellUiLockRuntime = (() => {
    const MODAL_IDS = Object.freeze(['confirmModal', 'pendingModal', 'rulesModal', 'cardSelectModal', 'cardDetailModal']);
    const SHELL_LOCK_IDS = Object.freeze(['titleScreen', 'gameScreen', 'pwaUpdateBanner', 'pwaInstallBanner']);
    const POST_BUILD_DELAYS = Object.freeze([0, 250, 1500, 3500]);

    function createRuntime(dependencies = {}) {
        const {
            buildSnapshot,
            checkpoint,
            clearInteractabilityIssueTargets,
            closeConfirmModal,
            expectedPendingActions,
            expectedPrimaryActions,
            freezeKinds,
            getConfirmAwaitingChoice,
            getElementById,
            getRoot,
            isHumanTurnSnapshot,
            isOnlineUiBlockedSnapshot,
            monitor,
            postBuildBatch,
            recoveryEffects,
            removeFreezeSnapshot,
            resetAccessibleModalState,
            runtimeEffects,
            setTimeoutFn,
            snapshotElement,
            syncAllowedActionContainers,
            uiWatchdog,
            validateInteractability,
        } = dependencies;
        const requiredFunctions = {
            buildSnapshot,
            checkpoint,
            clearInteractabilityIssueTargets,
            closeConfirmModal,
            expectedPendingActions,
            expectedPrimaryActions,
            getConfirmAwaitingChoice,
            getElementById,
            getRoot,
            isHumanTurnSnapshot,
            isOnlineUiBlockedSnapshot,
            removeFreezeSnapshot,
            resetAccessibleModalState,
            snapshotElement,
            syncAllowedActionContainers,
            validateInteractability,
        };
        for (const [name, dependency] of Object.entries(requiredFunctions)) {
            if (typeof dependency !== 'function') throw new TypeError(`${name} is required`);
        }
        if (!freezeKinds || !monitor || !postBuildBatch || !recoveryEffects || !runtimeEffects || !uiWatchdog) {
            throw new TypeError('UI lock runtime dependencies are required');
        }

        function resetWatchdogState(reason = 'watchdog-reset') {
            monitor.reset();
            removeFreezeSnapshot();
            checkpoint(reason);
        }

        function clearShellElementLock(id) {
            return recoveryEffects.clearShellLock(id);
        }

        function resetForGame(reason = 'game-reset') {
            resetAccessibleModalState();
            try {
                const root = getRoot();
                if (root) root.__machikoroConfirmModalOpen = false;
            } catch (_) {}
            MODAL_IDS.forEach(id => recoveryEffects.hide(id));
            SHELL_LOCK_IDS.forEach(clearShellElementLock);
            recoveryEffects.removeBodyModalOpen();
            resetWatchdogState(reason + '-watchdog');
            checkpoint(reason, { recovery: 'game-reset-ui-locks' });
        }

        function modalSnapshot(snapshot, id) {
            if (snapshot && snapshot.ui) {
                if (id === 'confirmModal') return snapshot.ui.confirmModal;
                if (id === 'pendingModal') return snapshot.ui.pendingModal;
            }
            return snapshotElement(id);
        }

        function explicitModalOpen(snapshot, id) {
            return uiWatchdog.isExplicitModalOpen(modalSnapshot(snapshot, id));
        }

        function confirmModalOpen(snapshot) {
            return explicitModalOpen(snapshot, 'confirmModal');
        }

        function isConfirmAwaitingUserChoice() {
            return getConfirmAwaitingChoice();
        }

        function isStaleConfirmModal(snapshot) {
            return uiWatchdog.isStaleConfirmModalSnapshot(snapshot, {
                confirmOpen: confirmModalOpen(snapshot),
                awaitingChoice: isConfirmAwaitingUserChoice(),
            });
        }

        function activeBlockingModalIds(snapshot) {
            return Array.isArray(snapshot && snapshot.visibleModals)
                ? snapshot.visibleModals.filter(id => id !== 'pendingModal' && explicitModalOpen(snapshot, id) && (id !== 'confirmModal' || !isStaleConfirmModal(snapshot)))
                : [];
        }

        function hasActiveBlockingModal(snapshot) {
            return activeBlockingModalIds(snapshot).length > 0;
        }

        function isStalePendingModal(snapshot) {
            return uiWatchdog.isStalePendingModalSnapshot(
                snapshot,
                explicitModalOpen(snapshot, 'pendingModal')
            );
        }

        function clearElementModalLock(id) {
            return recoveryEffects.clearModalLock(id);
        }

        function clearGameScreenLock(snapshot, reason = 'game-screen-lock-recovery') {
            if (hasActiveBlockingModal(snapshot)) return false;
            const allowed = Array.isArray(snapshot && snapshot.allowedActions) ? snapshot.allowedActions : [];
            const expected = expectedPrimaryActions(snapshot || {});
            const expectedPending = expectedPendingActions(snapshot || {});
            if (!allowed.includes('nextTurn') && !expected.length && !expectedPending.length) return false;
            let changed = clearElementModalLock('gameScreen');
            if (uiWatchdog.shouldRestoreGameScreenDisplay(snapshot)) {
                changed = recoveryEffects.restoreDisplay('gameScreen') || changed;
            }
            if (changed) checkpoint(reason, { recovery: 'orphan-game-screen-lock' });
            return changed;
        }

        function forceClearModalLocks(snapshot = null) {
            if (hasActiveBlockingModal(snapshot)) return false;
            let changed = false;
            SHELL_LOCK_IDS.forEach(id => {
                changed = clearElementModalLock(id) || changed;
            });
            changed = recoveryEffects.removeBodyModalOpen() || changed;
            return changed;
        }

        function forceClearStaleModalLocks() {
            SHELL_LOCK_IDS.forEach(id => recoveryEffects.forceClearModalLock(id));
            recoveryEffects.removeBodyModalOpen();
        }

        function closeStaleConfirm(snapshot, reason = 'stale-confirm-recovery') {
            if (!isStaleConfirmModal(snapshot)) return false;
            if (!getElementById('confirmModal')) return false;
            try {
                closeConfirmModal();
            } catch (_) {
                recoveryEffects.hide('confirmModal');
            }
            forceClearStaleModalLocks();
            resetAccessibleModalState();
            checkpoint(reason, { modal: 'confirmModal' });
            return true;
        }

        function closeStaleBlockingModals(snapshot, reason = 'ui-unlock') {
            let closed = closeStaleConfirm(snapshot, reason + '-confirm');
            const pendingModal = getElementById('pendingModal');
            if (pendingModal && pendingModal.style && isStalePendingModal(snapshot)) {
                recoveryEffects.hide('pendingModal');
                recoveryEffects.clearPointerEvents('pendingMenu');
                closed = true;
            }
            if (closed) resetAccessibleModalState();
            return closed;
        }

        function clearUiLocks(reason = 'ui-unlock', snapshot = null) {
            closeStaleBlockingModals(snapshot, reason);
            const changed = forceClearModalLocks(snapshot);
            clearGameScreenLock(snapshot, reason + '-game-screen');
            if (changed || !hasActiveBlockingModal(snapshot)) checkpoint(reason);
        }

        function isPostBuildNextTurnSnapshot(snapshot) {
            return uiWatchdog.isPostBuildNextTurnSnapshot(snapshot, hasActiveBlockingModal(snapshot));
        }

        function stabilizePostBuildNextTurnUi(reason = 'post-build-ui-stabilizer') {
            const snapshot = buildSnapshot(reason);
            if (!isPostBuildNextTurnSnapshot(snapshot)) return false;
            const btnSkip = getElementById('btnSkip');
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
            changed = clearGameScreenLock(snapshot, reason + '-game-screen') || changed;
            if (changed) checkpoint(reason, { recovery: 'post-build-next-turn-ui' });
            return changed;
        }

        function schedulePostBuildUiStabilizer(reason = 'post-build-ui-stabilizer') {
            if (postBuildBatch.snapshot().pending) return false;
            const snapshot = buildSnapshot(reason + '-schedule');
            if (!isPostBuildNextTurnSnapshot(snapshot)) return false;
            if (!postBuildBatch.begin(POST_BUILD_DELAYS.length)) return false;
            const run = () => {
                stabilizePostBuildNextTurnUi(reason);
                postBuildBatch.complete();
            };
            try {
                if (typeof setTimeoutFn === 'function') POST_BUILD_DELAYS.forEach(delay => setTimeoutFn(run, delay));
                else while (postBuildBatch.snapshot().pending) run();
            } catch (_) {
                while (postBuildBatch.snapshot().pending) run();
            }
            return true;
        }

        function unlockUiForHumanTurn(reason = 'human-turn-unlock') {
            const snapshot = buildSnapshot(reason);
            if (!isHumanTurnSnapshot(snapshot) || isOnlineUiBlockedSnapshot(snapshot)) return false;
            if (!expectedPrimaryActions(snapshot).length || hasActiveBlockingModal(snapshot)) return false;
            clearUiLocks(reason + '-before-render', snapshot);
            try { runtimeEffects.render(); } catch (_) {}
            const afterRender = buildSnapshot(reason + '-after-render');
            if (!isHumanTurnSnapshot(afterRender) || isOnlineUiBlockedSnapshot(afterRender)) return false;
            if (hasActiveBlockingModal(afterRender)) return false;
            const issues = validateInteractability(afterRender)
                .filter(issue => issue.freezeKind === freezeKinds.HUMAN_TURN_UI_LOCKED);
            let changed = clearGameScreenLock(afterRender, reason + '-game-screen');
            changed = syncAllowedActionContainers(afterRender, issues) || changed;
            changed = clearInteractabilityIssueTargets(issues) || changed;
            clearUiLocks(reason + '-after-render', afterRender);
            if (changed) checkpoint(reason + '-after-render-sync');
            checkpoint(reason);
            return true;
        }

        return Object.freeze({
            resetWatchdogState,
            resetForGame,
            modalSnapshot,
            explicitModalOpen,
            confirmModalOpen,
            isConfirmAwaitingUserChoice,
            isStaleConfirmModal,
            activeBlockingModalIds,
            hasActiveBlockingModal,
            isStalePendingModal,
            clearGameScreenLock,
            forceClearModalLocks,
            closeStaleBlockingModals,
            clearUiLocks,
            isPostBuildNextTurnSnapshot,
            stabilizePostBuildNextTurnUi,
            schedulePostBuildUiStabilizer,
            unlockUiForHumanTurn,
        });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AppShellUiLockRuntime;
if (typeof window !== 'undefined') window.AppShellUiLockRuntime = AppShellUiLockRuntime;
if (typeof globalThis !== 'undefined') globalThis.AppShellUiLockRuntime = AppShellUiLockRuntime;
