'use strict';

const AppShellObservationRuntime = (() => {
    function createRuntime(dependencies = {}) {
        const {
            actionUiRegistry,
            activeBlockingModalIds,
            clientRuntimeSnapshot,
            document,
            domSnapshot,
            freezeKinds,
            getGameRuntimeSnapshot,
            getOnlineRuntimeSnapshot,
            modalSnapshotFromRuntime,
            nowIso,
            resolveDependency,
            runtimeEffects,
            uiWatchdog,
        } = dependencies;
        const requiredFunctions = { activeBlockingModalIds, getGameRuntimeSnapshot, getOnlineRuntimeSnapshot, modalSnapshotFromRuntime, nowIso, resolveDependency };
        for (const [name, dependency] of Object.entries(requiredFunctions)) {
            if (typeof dependency !== 'function') throw new TypeError(`${name} is required`);
        }
        if (!actionUiRegistry || !clientRuntimeSnapshot || !domSnapshot || !freezeKinds || !runtimeEffects || !uiWatchdog) {
            throw new TypeError('observation runtime dependencies are required');
        }

        function elementHasBlockingAncestor(id, el) {
            return domSnapshot.hasBlockingAncestor(id, el);
        }

        function childInteractiveState(el) {
            return domSnapshot.interactiveState(el);
        }

        function hasBuildableCardCandidate() {
            try {
                const currentGame = getGameRuntimeSnapshot().game;
                if (!currentGame || currentGame.builtThisTurn) return false;
                const current = currentGame.currentPlayer && currentGame.currentPlayer();
                const cards = resolveDependency('cards');
                const cardFilter = resolveDependency('cardFilter');
                const shopStock = resolveDependency('shopStock');
                if (!current || !Array.isArray(cards)) return false;
                return cards.some(card => {
                    if (!card) return false;
                    if (cardFilter && card.color !== cardFilter) return false;
                    const stock = shopStock ? shopStock[card.name] : 0;
                    if (stock <= 0 || current.coins < card.cost) return false;
                    return !(card.color === 'purple' && typeof current.countCardIncludingDormant === 'function' && current.countCardIncludingDormant(card.name) > 0);
                });
            } catch (_) {
                return true;
            }
        }

        function hasBuildableLandmarkCandidate() {
            try {
                const currentGame = getGameRuntimeSnapshot().game;
                if (!currentGame || currentGame.builtThisTurn) return false;
                const current = currentGame.currentPlayer && currentGame.currentPlayer();
                const enabledLandmarks = resolveDependency('enabledLandmarks');
                const playerClass = resolveDependency('playerClass');
                if (!current || !current.landmarks) return false;
                return Object.entries(current.landmarks).some(([name, built]) => {
                    if (built) return false;
                    if (enabledLandmarks && typeof enabledLandmarks.has === 'function' && !enabledLandmarks.has(name)) return false;
                    if (!playerClass || typeof playerClass.landmarkCost !== 'function') return false;
                    return current.coins >= playerClass.landmarkCost(name);
                });
            } catch (_) {
                return true;
            }
        }

        function expectedChildSpecForAction(action) {
            return actionUiRegistry.childSelectors[action] || null;
        }

        function expectedChildSpecForEntry(snapshot, entry) {
            const action = entry && entry.action || '';
            let hasUndoState = false;
            if (action === 'undoBuild') {
                try {
                    hasUndoState = !!getGameRuntimeSnapshot().undoState;
                } catch (_) {}
            }
            const required = uiWatchdog.shouldRequireActionChildren(action, {
                builtThisTurn: !!(snapshot && snapshot.builtThisTurn),
                hasBuildableCardCandidate: action === 'buildCard' && hasBuildableCardCandidate(),
                hasBuildableLandmarkCandidate: action === 'buildLandmark' && hasBuildableLandmarkCandidate(),
                hasUndoState,
            });
            return required ? expectedChildSpecForAction(action) : null;
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
            return domSnapshot.isInteractiveElementUsable(child);
        }

        function childInteractiveStateForSpec(el, spec) {
            return domSnapshot.interactiveStateForSpec(el, spec);
        }

        function childInteractiveStateForActions(el, actions) {
            return domSnapshot.interactiveStateForActions(el, actions);
        }

        function compactActionChildStates(snapshot) {
            return expectedActionContainerEntries(snapshot || {}).map(entry => {
                const spec = entry && entry.spec;
                const childSpec = expectedChildSpecForEntry(snapshot, entry);
                const parent = spec && spec.targetId && document && document.getElementById ? document.getElementById(spec.targetId) : null;
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
            return domSnapshot.snapshotById(id);
        }

        function visibleElement(id) {
            return domSnapshot.isVisibleById(id);
        }

        function visibleModalIds() {
            return ['confirmModal', 'pendingModal', 'rulesModal', 'cardSelectModal', 'cardDetailModal']
                .filter(id => visibleElement(id));
        }

        function classListText(el) {
            return uiWatchdog.classListText(el);
        }

        function allowedActionListForSnapshot() {
            const currentGame = getGameRuntimeSnapshot().game;
            if (!currentGame) return [];
            try {
                if (typeof currentGame.allowedActions === 'function') return Array.from(currentGame.allowedActions());
                const gameManager = resolveDependency('gameManager');
                if (gameManager && typeof gameManager.allowedActionsFor === 'function') return Array.from(gameManager.allowedActionsFor(currentGame));
            } catch (_) {}
            return [];
        }

        function isElementUsablyEnabled(snapshot) {
            return uiWatchdog.isElementUsablyEnabled(snapshot);
        }

        function collectUiLockSnapshot(reason = 'ui-lock-snapshot') {
            return buildClientRuntimeSnapshot(reason);
        }

        function uiLockReasonForElement(state) {
            return uiWatchdog.lockReasonForElement(state);
        }

        function actionContainerSpecForAction(snapshot, action) {
            return actionUiRegistry.containerSpecForAction(snapshot, action);
        }

        function expectedActionContainerEntries(snapshot) {
            const allowed = Array.isArray(snapshot && snapshot.allowedActions) ? snapshot.allowedActions : [];
            return allowed
                .map(action => ({ action, spec: actionContainerSpecForAction(snapshot, action) }))
                .filter(entry => !!entry.spec);
        }

        function shouldIgnoreInactiveActionContainerIssue(snapshot, entry, reason) {
            const childSpec = expectedChildSpecForEntry(snapshot, entry);
            return uiWatchdog.shouldIgnoreInactiveActionContainerIssue(entry && entry.spec, !!childSpec, reason);
        }

        function missingActionContainerRegistryEntries(snapshot) {
            return actionUiRegistry.missingContainerEntries(snapshot);
        }

        function primaryActionContainerRegistryForDiagnostics() {
            return actionUiRegistry.snapshot();
        }

        function snapshotStateById(snapshot, id, targetSource = '') {
            return uiWatchdog.snapshotStateById(snapshot, id, targetSource);
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
                const el = document && document.getElementById ? document.getElementById(spec.targetId) : null;
                actionChildState = childInteractiveStateForSpec(el, expectedChildSpec);
            }
            return uiWatchdog.isActionContainerStateUsable(spec, state, {
                hasExpectedChildSpec: !!expectedChildSpec,
                actionChildState,
                modalState: spec.modalId ? snapshotStateById(snapshot, spec.modalId) : null,
            });
        }

        function isActionUiUsable(snapshot, action) {
            const spec = actionContainerSpecForAction(snapshot, action);
            return isActionContainerUiUsable(snapshot, { action, spec });
        }

        function collectInteractabilityObservations(snapshot) {
            const expectedContainers = expectedActionContainerEntries(snapshot).map(entry => {
                const usable = isActionContainerUiUsable(snapshot, entry);
                if (usable) return { action: entry.action, spec: entry.spec, usable: true };
                const state = snapshotStateById(snapshot, entry.spec.targetId, entry.spec.targetSource);
                const expectedChildSpec = expectedChildSpecForEntry(snapshot, entry);
                let reason = uiLockReasonForElement(state);
                if (reason === 'not-clickable' && expectedChildSpec) reason = 'action-child-not-clickable';
                if (entry.spec.modalId) {
                    const modal = snapshotStateById(snapshot, entry.spec.modalId);
                    if (modal && !isElementUsablyEnabled(modal)) reason = uiLockReasonForElement(modal);
                }
                return {
                    action: entry.action,
                    spec: entry.spec,
                    state,
                    usable: false,
                    reason,
                    ignore: shouldIgnoreInactiveActionContainerIssue(snapshot, entry, reason),
                };
            });
            return {
                expectedContainers,
                missingRegistryEntries: missingActionContainerRegistryEntries(snapshot),
                activeModals: activeBlockingModalIds(snapshot).map(id => ({
                    id,
                    state: modalSnapshotFromRuntime(snapshot, id) || snapshot && snapshot.ui && snapshot.ui[id],
                })),
            };
        }

        function validateUiInteractability(snapshot = collectUiLockSnapshot()) {
            if (!snapshot || !snapshot.phase) return [];
            return uiWatchdog.buildInteractabilityIssues(
                snapshot,
                collectInteractabilityObservations(snapshot),
                freezeKinds
            );
        }

        function primaryUiIssue(snapshot) {
            return validateUiInteractability(snapshot).find(issue => issue.freezeKind === freezeKinds.HUMAN_TURN_UI_LOCKED);
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

        function appShellOnlineActionFlightState() {
            try {
                return runtimeEffects.onlineActionFlightState();
            } catch (_) {
                return { inFlight: false, startedAt: 0 };
            }
        }

        function buildClientRuntimeSnapshot(reason = '') {
            const gameState = getGameRuntimeSnapshot();
            const onlineState = getOnlineRuntimeSnapshot();
            const currentGame = gameState.game;
            const hasGame = !!currentGame;
            const currentPlayerIndex = hasGame ? currentGame.currentPlayerIndex : null;
            let isCpuTurn = false;
            try { isCpuTurn = !!(hasGame && Array.isArray(gameState.cpuPlayers) && gameState.cpuPlayers[currentPlayerIndex]); } catch (_) {}
            let cpuStepScheduled = false;
            let cpuSchedulerHealth = null;
            try {
                if (isCpuTurn) {
                    cpuSchedulerHealth = runtimeEffects.schedulerSnapshot();
                    cpuStepScheduled = !!(cpuSchedulerHealth && cpuSchedulerHealth.stepScheduled);
                }
            } catch (_) {}
            let hasWinner = false;
            try { hasWinner = !!(hasGame && typeof currentGame.checkWinner === 'function' && currentGame.checkWinner()); } catch (_) {}
            return clientRuntimeSnapshot.build({
                reason,
                timestamp: nowIso(),
                game: {
                    phase: hasGame ? currentGame.phase : '',
                    hasWinner,
                    builtThisTurn: !!(hasGame && currentGame.builtThisTurn),
                    turnCount: hasGame ? currentGame.turnCount : null,
                    currentPlayerIndex,
                    pendingFields: hasGame ? {
                        pendingTV: currentGame.pendingTV || 0,
                        pendingBusiness: currentGame.pendingBusiness || 0,
                        pendingCleaning: currentGame.pendingCleaning || 0,
                        pendingMover: currentGame.pendingMover || 0,
                        pendingRenovation: currentGame.pendingRenovation || 0,
                        pendingIT: !!currentGame.pendingIT,
                    } : null,
                },
                cpu: {
                    isCpuTurn,
                    stepScheduled: cpuStepScheduled,
                    schedulerHealth: cpuSchedulerHealth,
                },
                online: {
                    isOnlineGame: !!onlineState.isOnlineGame,
                    isRoomHost: !!onlineState.isRoomHost,
                    myPlayerIndex: onlineState.myPlayerIndex,
                    actionInFlight: appShellOnlineActionFlightState().inFlight,
                    actionInFlightAt: appShellOnlineActionFlightState().startedAt,
                    isReconnecting: !!onlineState.isReconnectingOnline,
                    socketConnected: onlineState.socket ? onlineState.socket.connected !== false : null,
                },
                allowedActions: allowedActionListForSnapshot(),
                dom: {
                    activeElement: document && document.activeElement ? {
                        id: document.activeElement.id || '',
                        tagName: document.activeElement.tagName || '',
                        className: document.activeElement.className || '',
                    } : null,
                    bodyClassName: document && document.body ? classListText(document.body) : '',
                    visibleModals: visibleModalIds(),
                    overlays: {
                        noticeToast: safeElementSnapshot('noticeToast'),
                        pwaUpdateBanner: safeElementSnapshot('pwaUpdateBanner'),
                        pwaInstallBanner: safeElementSnapshot('pwaInstallBanner'),
                        turnAnnouncer: safeElementSnapshot('turnAnnouncer'),
                        crashScreen: safeElementSnapshot('crashScreen'),
                    },
                    actionButtons: primaryActionButtonStates(),
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
                },
            });
        }

        return Object.freeze({
            elementHasBlockingAncestor,
            childInteractiveState,
            hasBuildableCardCandidate,
            hasBuildableLandmarkCandidate,
            expectedChildSpecForAction,
            expectedChildSpecForEntry,
            expectedChildActionsForAction,
            expectedChildActionsForEntry,
            isInteractiveChildUsable,
            childInteractiveStateForSpec,
            childInteractiveStateForActions,
            compactActionChildStates,
            safeElementSnapshot,
            visibleElement,
            visibleModalIds,
            classListText,
            allowedActionListForSnapshot,
            isElementUsablyEnabled,
            collectUiLockSnapshot,
            uiLockReasonForElement,
            actionContainerSpecForAction,
            expectedActionContainerEntries,
            shouldIgnoreInactiveActionContainerIssue,
            missingActionContainerRegistryEntries,
            primaryActionContainerRegistryForDiagnostics,
            snapshotStateById,
            snapshotElementForAction,
            isActionContainerUiUsable,
            isActionUiUsable,
            collectInteractabilityObservations,
            validateUiInteractability,
            primaryUiIssue,
            primaryActionButtonStates,
            buildClientRuntimeSnapshot,
        });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AppShellObservationRuntime;
if (typeof window !== 'undefined') window.AppShellObservationRuntime = AppShellObservationRuntime;
if (typeof globalThis !== 'undefined') globalThis.AppShellObservationRuntime = AppShellObservationRuntime;
