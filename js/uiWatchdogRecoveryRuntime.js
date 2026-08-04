'use strict';

const UiWatchdogRecoveryRuntime = (() => {
    function createRuntime(dependencies = {}) {
        const {
            appShellAsyncRecovery,
            appShellGameRuntimeSnapshot,
            appShellRecoveryEffects,
            appShellRuntimeEffects,
            buildClientRuntimeSnapshot,
            classifyLikelyFreeze,
            classifyUiInteractabilityCause,
            clearGameScreenLockIfNoActiveModal,
            clearUiLocks,
            closeStaleBlockingModals,
            compactIssueForTrace,
            compactSnapshotForUiTrace,
            expectedActionContainerEntries,
            expectedChildSpecForEntry,
            expectedPendingActions,
            freezeKinds,
            hasActiveBlockingModal,
            isActionContainerUiUsable,
            isHumanTurnSnapshot,
            isOnlineUiBlockedSnapshot,
            markClientFlowCheckpoint,
            recentClientCheckpointsForTrace,
            uiWatchdog,
            validateUiInteractability,
        } = dependencies;
        const requiredFunctions = {
            appShellGameRuntimeSnapshot,
            buildClientRuntimeSnapshot,
            classifyLikelyFreeze,
            classifyUiInteractabilityCause,
            clearGameScreenLockIfNoActiveModal,
            clearUiLocks,
            closeStaleBlockingModals,
            compactIssueForTrace,
            compactSnapshotForUiTrace,
            expectedActionContainerEntries,
            expectedChildSpecForEntry,
            expectedPendingActions,
            hasActiveBlockingModal,
            isActionContainerUiUsable,
            isHumanTurnSnapshot,
            isOnlineUiBlockedSnapshot,
            markClientFlowCheckpoint,
            recentClientCheckpointsForTrace,
            validateUiInteractability,
        };
        for (const [name, dependency] of Object.entries(requiredFunctions)) {
            if (typeof dependency !== 'function') throw new TypeError(`${name} is required`);
        }
        if (!appShellAsyncRecovery || !appShellRecoveryEffects || !appShellRuntimeEffects || !freezeKinds || !uiWatchdog) {
            throw new TypeError('recovery runtime dependencies are required');
        }

        function syncAllowedActionContainersForRender(snapshot, issues = null) {
            const activeBlockingModal = hasActiveBlockingModal(snapshot);
            if (!uiWatchdog.canRecoverActionContainers(snapshot, activeBlockingModal)) return false;
            const entries = expectedActionContainerEntries(snapshot).map(entry => ({
                action: entry.action,
                spec: entry.spec,
                usable: isActionContainerUiUsable(snapshot, entry),
            }));
            const plan = uiWatchdog.actionContainerRecoveryPlan(snapshot, {
                activeBlockingModal,
                issues,
                entries,
            });
            let changed = false;
            for (const entry of plan) {
                changed = clearActionContainerForRecovery(entry.spec) || changed;
                changed = clearExpectedActionChildrenForRecovery(snapshot, entry) || changed;
                if (entry.action === 'undoBuild') changed = ensurePostBuildUndoButtonForRecovery(snapshot) || changed;
            }
            return changed;
        }

        function syncUiInteractabilityAfterRender(reason = 'render-sync') {
            const before = buildClientRuntimeSnapshot(reason);
            const planInput = {
                activeBlockingModal: hasActiveBlockingModal(before),
                humanFreezeKind: freezeKinds.HUMAN_TURN_UI_LOCKED,
            };
            const eligibility = uiWatchdog.renderInteractabilitySyncPlan(before, planInput);
            if (!eligibility.eligible) return false;
            const plan = uiWatchdog.renderInteractabilitySyncPlan(before, {
                ...planInput,
                issues: validateUiInteractability(before),
            });
            if (!plan.shouldSync) return false;
            const issues = plan.issues;
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
                appShellRuntimeEffects.render();
            } catch (_) {}
            try {
                appShellRuntimeEffects.renderBuildMenu();
            } catch (_) {}
            let afterRender = buildClientRuntimeSnapshot('freeze-watchdog-post-build-after-render');
            let issues = validateUiInteractability(afterRender).filter(issue => issue.freezeKind === freezeKinds.HUMAN_TURN_UI_LOCKED);
            recoverAllowedActionContainers(afterRender, issues);
            ensurePostBuildUndoButtonForRecovery(afterRender);
            clearUiLocks('freeze-watchdog-post-build-after-render-unlock', afterRender);
            try {
                appShellRuntimeEffects.renderBuildMenu();
            } catch (_) {}
            afterRender = buildClientRuntimeSnapshot('freeze-watchdog-post-build-second-render');
            issues = validateUiInteractability(afterRender).filter(issue => issue.freezeKind === freezeKinds.HUMAN_TURN_UI_LOCKED);
            recoverAllowedActionContainers(afterRender, issues);
            ensurePostBuildUndoButtonForRecovery(afterRender);
            const afterRecovery = buildClientRuntimeSnapshot('freeze-watchdog-post-build-after-recovery');
            const recovered = classifyLikelyFreeze(afterRecovery) !== freezeKinds.POST_BUILD_UI_BLOCKED;
            if (recovered) markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: freezeKinds.POST_BUILD_UI_BLOCKED });
            return recovered;
        }

        function ensurePostBuildUndoButtonForRecovery(snapshot) {
            const allowed = Array.isArray(snapshot && snapshot.allowedActions) ? snapshot.allowedActions : [];
            if (!snapshot || snapshot.phase !== 'build' || !snapshot.builtThisTurn || !allowed.includes('undoBuild')) return false;
            try {
                if (!appShellGameRuntimeSnapshot().undoState) return false;
            } catch (_) {
                return false;
            }
            const ensured = appShellRecoveryEffects.ensureHtmlChildren(
                'buildMenu',
                '[data-action="undoBuild"]',
                '<button class="undo-btn" data-action="undoBuild">↩ 建設を取り消す</button>',
                /data-action=["']undoBuild["']/
            );
            let changed = ensured.changed;
            ensured.elements.forEach(child => {
                changed = appShellRecoveryEffects.releaseInteractionLock(child, { enable: true }) || changed;
            });
            if (changed) markClientFlowCheckpoint('post-build-undo-button-recovered', { action: 'undoBuild' });
            return changed;
        }

        function clearActionContainerForRecovery(spec) {
            if (!spec || !spec.targetId) return false;
            let changed = false;
            [spec.modalId, spec.targetId].filter(Boolean).forEach(id => {
                changed = appShellRecoveryEffects.releaseInteractionLockById(id, {
                    enable: id === spec.targetId,
                    displayValue: id === 'diceChoose' ? 'block' : '',
                    pointerEventsValue: id === 'pendingMenu' ? 'auto' : '',
                }) || changed;
            });
            return changed;
        }

        function clearExpectedActionChildrenForRecovery(snapshot, entry) {
            const spec = entry && entry.spec;
            const childSpec = expectedChildSpecForEntry(snapshot, entry);
            if (!spec || !childSpec || !spec.targetId) return false;
            let changed = false;
            appShellRecoveryEffects.queryAll(spec.targetId, childSpec.selector).forEach(child => {
                changed = appShellRecoveryEffects.releaseInteractionLock(child, { enable: true }) || changed;
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
                appShellRuntimeEffects.render();
            } catch (_) {}
            markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: freezeKinds.PENDING_UI_LOCKED, issues });
            return changed;
        }

        function clearUiInteractabilityIssueTargets(issues) {
            let changed = false;
            (issues || []).forEach(issue => {
                if (!issue || !issue.target || issue.target === 'body') return;
                changed = appShellRecoveryEffects.releaseInteractionLockById(issue.target, {
                    enable: issue.reason === 'disabled-mismatch',
                    forceDisplay: issue.target !== 'gameScreen' && issue.reason === 'parent-display-none',
                    restoreDisplay: issue.target !== 'gameScreen',
                }) || changed;
            });
            return changed;
        }

        function recoverHumanUiLock(snapshot) {
            if (!snapshot || !isHumanTurnSnapshot(snapshot) || isOnlineUiBlockedSnapshot(snapshot)) return false;
            if (hasActiveBlockingModal(snapshot) && !expectedPendingActions(snapshot).length) return false;
            const issues = validateUiInteractability(snapshot).filter(issue => issue.freezeKind === freezeKinds.HUMAN_TURN_UI_LOCKED);
            const changed = recoverAllowedActionContainers(snapshot, issues) || clearUiInteractabilityIssueTargets(issues);
            clearUiLocks('freeze-watchdog-human-turn-unlock', snapshot);
            try {
                appShellRuntimeEffects.render();
            } catch (_) {}
            markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: freezeKinds.HUMAN_TURN_UI_LOCKED, issues });
            return changed || issues.length > 0;
        }

        function recoverModalUiLock(snapshot) {
            const issues = validateUiInteractability(snapshot).filter(issue => issue.freezeKind === freezeKinds.MODAL_UI_LOCKED);
            if (!issues.length) return false;
            let changed = false;
            issues.forEach(issue => {
                changed = appShellRecoveryEffects.releaseInteractionLockById(issue.target, {
                    reveal: false,
                    clearAriaHidden: false,
                    restoreDisplay: false,
                    pointerEventsValue: 'auto',
                }) || changed;
            });
            if (changed) markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: freezeKinds.MODAL_UI_LOCKED, issues });
            return changed;
        }

        function recoverStaleModalUiLock(snapshot) {
            const closed = closeStaleBlockingModals(snapshot, 'freeze-watchdog-stale-modal');
            if (!closed) return false;
            clearUiLocks('freeze-watchdog-stale-modal-unlock', snapshot);
            try {
                appShellRuntimeEffects.render();
            } catch (_) {}
            markClientFlowCheckpoint('freeze-watchdog-recovered', { freezeKind: freezeKinds.STALE_MODAL_UI_LOCKED });
            return true;
        }

        function recoverCpuTurnStall(snapshot) {
            return appShellAsyncRecovery.recoverCpuTurnStall(snapshot);
        }

        function recoverOnlineActionInFlightStall(snapshot) {
            return appShellAsyncRecovery.recoverOnlineActionInFlightStall(snapshot);
        }

        function freezeRecoveryHandlers() {
            return {
                [freezeKinds.POST_BUILD_UI_BLOCKED]: recoverPostBuildUiFreeze,
                [freezeKinds.HUMAN_TURN_UI_LOCKED]: recoverHumanUiLock,
                [freezeKinds.PENDING_UI_LOCKED]: recoverPendingUiLock,
                [freezeKinds.STALE_MODAL_UI_LOCKED]: recoverStaleModalUiLock,
                [freezeKinds.CPU_TURN_STALLED]: recoverCpuTurnStall,
                [freezeKinds.ONLINE_ACTION_IN_FLIGHT_STALLED]: recoverOnlineActionInFlightStall,
                [freezeKinds.MODAL_UI_LOCKED]: recoverModalUiLock,
            };
        }

        function recoverFreezeKind(freezeKind, snapshot) {
            const handler = uiWatchdog.selectRecoveryHandler(
                freezeKind,
                freezeRecoveryHandlers(),
                freezeKinds
            );
            return handler ? handler(snapshot) : false;
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

        return Object.freeze({
            syncAllowedActionContainersForRender,
            syncUiInteractabilityAfterRender,
            recoverPostBuildUiFreeze,
            ensurePostBuildUndoButtonForRecovery,
            clearActionContainerForRecovery,
            clearExpectedActionChildrenForRecovery,
            recoverAllowedActionContainers,
            recoverPendingUiLock,
            clearUiInteractabilityIssueTargets,
            recoverHumanUiLock,
            recoverModalUiLock,
            recoverStaleModalUiLock,
            recoverCpuTurnStall,
            recoverOnlineActionInFlightStall,
            freezeRecoveryHandlers,
            recoverFreezeKind,
            recoverUiInteractability,
        });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiWatchdogRecoveryRuntime;
if (typeof window !== 'undefined') window.UiWatchdogRecoveryRuntime = UiWatchdogRecoveryRuntime;
if (typeof globalThis !== 'undefined') globalThis.UiWatchdogRecoveryRuntime = UiWatchdogRecoveryRuntime;
