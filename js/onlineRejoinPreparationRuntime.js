'use strict';

const OnlineRejoinPreparationRuntime = (() => {
    const LOCAL_OFFER_STATUS = '♻️ より新しいローカル復元データをサーバーへ送信しています...';
    const UI_RESET_REASON = 'online-rejoin-reset-ui-locks';

    function createRuntime(dependencies = {}) {
        const requiredObjects = [
            'payload', 'reconnectEvents', 'rejoinPersistence', 'restoreQueueState',
            'restoreRank', 'storageKeys',
        ];
        for (const name of requiredObjects) {
            if (!dependencies[name]) {
                throw new TypeError(`online rejoin preparation dependency is required: ${name}`);
            }
        }
        const requiredEffects = [
            'applyHostPayload', 'applyReconnectStatus', 'calculateRank', 'clearHostlessState',
            'clearPending', 'clearQuarantine', 'clearRetry', 'getDefaultLandmarks',
            'getOriginalPlayerIndex', 'incrementRestoreGeneration', 'invalidateCpuSchedule',
            'isActionLogPlanAuthorityEnabled', 'isPendingPlanAuthorityEnabled',
            'isPersistencePlanAuthorityEnabled', 'isQueueCarryRequired',
            'isRestoreOfferPlanAuthorityEnabled', 'normalizeActionLog', 'observeReconnect',
            'pendingBelongsToSession', 'pendingMatchesAccepted', 'readActionLog',
            'readLocalBundle', 'readPending', 'readRestoreQueue', 'recordDiagnostic',
            'recordQueueDiagnostic', 'removeRestoreItem', 'replaceEnabledCards',
            'replaceEnabledLandmarks', 'replaceRestoreQueue', 'resetUiLocks',
            'saveSession', 'selectPersistenceEffect', 'selectQueueTransition',
            'sendLocalBundle', 'serverActionSeq', 'setActionFlight', 'setCpuSpeed',
            'setHostState', 'setPlayerIndexes', 'setReconnectFlag', 'setStatusText',
            'sameActionEntry', 'startRestore', 'supportsResetUiLocks',
            'writeRestoreJson',
        ];
        for (const name of requiredEffects) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`online rejoin preparation effect is required: ${name}`);
            }
        }
        if (!Number.isInteger(dependencies.restoreSchemaVersion)) {
            throw new TypeError('online rejoin preparation restore schema version is required');
        }

        function beginRestore() {
            const shouldCarry = dependencies.isQueueCarryRequired();
            const carriedEvents = shouldCarry ? dependencies.readRestoreQueue().slice() : [];
            const restoreGeneration = dependencies.incrementRestoreGeneration();
            dependencies.startRestore();
            dependencies.observeReconnect(dependencies.reconnectEvents.RESTORE_STARTED);
            dependencies.applyReconnectStatus(dependencies.reconnectEvents.RESTORE_STARTED);
            dependencies.clearQuarantine();
            const legacyTransition = Object.freeze({
                overflow: false,
                queue: carriedEvents.map(event => ({
                    type: event.type,
                    payload: event.payload,
                    generation: restoreGeneration,
                })),
            });
            const pureTransition = dependencies.restoreQueueState.planCarry(
                dependencies.readRestoreQueue(),
                shouldCarry,
                restoreGeneration
            );
            const selection = dependencies.selectQueueTransition(
                pureTransition,
                legacyTransition
            );
            dependencies.recordQueueDiagnostic(selection);
            dependencies.replaceRestoreQueue(selection.transition.queue);
            dependencies.clearRetry();
            dependencies.clearHostlessState();
            return restoreGeneration;
        }

        function selectLocalOffer(input) {
            const localBundle = dependencies.readLocalBundle();
            const originalPlayerIndex = dependencies.getOriginalPlayerIndex();
            const ownsLocalHostBundle = !!localBundle &&
                localBundle.gameStartPayload.hostPlayerIndex === originalPlayerIndex;
            const localRank = ownsLocalHostBundle
                ? dependencies.calculateRank(
                    localBundle.gameStartPayload,
                    localBundle.stateSnapshot,
                    localBundle.actionLog
                )
                : null;
            const serverRank = ownsLocalHostBundle
                ? dependencies.calculateRank(
                    input.gameStartPayload,
                    input.stateSnapshot,
                    input.replayActionLog
                )
                : null;
            const canOffer = ownsLocalHostBundle &&
                (input.hostPlayerIndex === originalPlayerIndex ||
                    localRank.hostEpoch > serverRank.hostEpoch);
            const shouldOffer = canOffer && dependencies.restoreRank.isNewer(localRank, serverRank);
            const reasons = dependencies.restoreRank.localHostRestoreOfferReasons;
            const legacyPlan = Object.freeze({
                offer: shouldOffer,
                bundle: shouldOffer ? localBundle : null,
                reason: !ownsLocalHostBundle
                    ? reasons.NOT_ORIGINAL_HOST_BUNDLE
                    : (!canOffer
                        ? reasons.SERVER_HOST_AUTHORITY
                        : (shouldOffer ? reasons.OFFER_NEWER_BUNDLE : reasons.NOT_NEWER)),
            });
            const selection = dependencies.restoreRank.selectLocalHostRestoreOfferPlan(
                localBundle,
                originalPlayerIndex,
                input.hostPlayerIndex,
                localRank,
                serverRank,
                legacyPlan,
                { authorityEnabled: dependencies.isRestoreOfferPlanAuthorityEnabled() }
            );
            dependencies.recordDiagnostic('localHostRestoreOfferPlanSelection', selection);
            return selection;
        }

        function reconcilePending(input) {
            let pending = dependencies.readPending();
            if (pending && !dependencies.pendingBelongsToSession(pending)) {
                dependencies.clearPending();
                pending = null;
            }
            const matchedReplay = pending && input.replayActionLog.some(
                entry => dependencies.sameActionEntry(entry, pending)
            );
            const compactedIntoSnapshot = pending &&
                typeof pending.clientActionId !== 'string' &&
                Number.isInteger(pending.seq) &&
                Number.isInteger(input.stateSnapshot?.actionSeq) &&
                input.stateSnapshot.actionSeq >= pending.seq;
            const acceptedById = pending && Array.isArray(input.acceptedClientActions) &&
                input.acceptedClientActions.some(
                    ref => dependencies.pendingMatchesAccepted(ref, pending)
                );
            const accepted = !pending || matchedReplay || compactedIntoSnapshot || acceptedById;
            const reasons = dependencies.payload.pendingReconciliationReasons;
            const legacyPlan = Object.freeze({
                accepted,
                reason: !pending
                    ? reasons.NO_PENDING
                    : (matchedReplay
                        ? reasons.REPLAY_LOG
                        : (compactedIntoSnapshot
                            ? reasons.SNAPSHOT_COMPACTED
                            : (acceptedById
                                ? reasons.ACCEPTED_CLIENT_ACTION
                                : reasons.UNACCEPTED))),
            });
            const selection = dependencies.payload.selectPendingReconciliationPlan(
                pending,
                input.replayActionLog,
                input.stateSnapshot,
                input.acceptedClientActions,
                legacyPlan,
                { authorityEnabled: dependencies.isPendingPlanAuthorityEnabled() }
            );
            dependencies.recordDiagnostic('pendingReconciliationPlanSelection', selection);
            return Object.freeze({ pending, selection });
        }

        function selectPersistencePlan(input) {
            const defaultLandmarks = input.enabledLandmarks && input.enabledLandmarks.length > 0
                ? null
                : dependencies.getDefaultLandmarks();
            const resolvedLandmarks = input.enabledLandmarks && input.enabledLandmarks.length > 0
                ? input.enabledLandmarks
                : defaultLandmarks;
            const resetUiLocksAvailable = dependencies.supportsResetUiLocks();
            const legacyPlan = Object.freeze({
                clearPendingOutboundAction: input.acceptedPending,
                cpuSpeed: input.cpuSpeed || 1500,
                updateEnabledCards: !!input.enabledCards,
                enabledCards: input.enabledCards,
                enabledLandmarks: resolvedLandmarks,
                playerIndex: input.playerIndex,
                hostPlayerIndex: input.hostPlayerIndex,
                resetUiLocks: resetUiLocksAvailable,
            });
            const selection = dependencies.rejoinPersistence.selectPlan({
                acceptedPending: input.acceptedPending,
                cpuSpeed: input.cpuSpeed,
                enabledCards: input.enabledCards,
                enabledLandmarks: input.enabledLandmarks,
                defaultLandmarks,
                playerIndex: input.playerIndex,
                hostPlayerIndex: input.hostPlayerIndex,
                resetUiLocksAvailable,
            }, legacyPlan, {
                authorityEnabled: dependencies.isPersistencePlanAuthorityEnabled(),
            });
            dependencies.recordDiagnostic('onlineRejoinPersistencePlanSelection', selection);
            return selection;
        }

        function prepare(input = {}) {
            const restoreGeneration = beginRestore();
            const gameStartPayload = input.gameStartPayload;
            const replayActionLog = dependencies.normalizeActionLog(input.actionLog);
            const restoredThroughSeq = dependencies.serverActionSeq(
                gameStartPayload,
                input.stateSnapshot,
                replayActionLog
            );
            const offerSelection = selectLocalOffer({
                gameStartPayload,
                hostPlayerIndex: input.hostPlayerIndex,
                replayActionLog,
                stateSnapshot: input.stateSnapshot,
            });
            if (offerSelection.plan.offer) {
                dependencies.setReconnectFlag(true);
                dependencies.setStatusText(LOCAL_OFFER_STATUS);
                dependencies.sendLocalBundle(offerSelection.plan.bundle);
                return Object.freeze({ ready: false, reason: 'local-bundle-offered' });
            }
            gameStartPayload.schemaVersion = dependencies.restoreSchemaVersion;
            dependencies.applyHostPayload(
                gameStartPayload,
                input.hostPlayerIndex,
                input.hostEpoch
            );
            gameStartPayload.actionSeq = dependencies.serverActionSeq(
                gameStartPayload,
                input.stateSnapshot,
                replayActionLog
            );
            const pendingResult = reconcilePending({
                acceptedClientActions: input.acceptedClientActions,
                replayActionLog,
                stateSnapshot: input.stateSnapshot,
            });
            const persistenceSelection = selectPersistencePlan({
                acceptedPending: pendingResult.selection.plan.accepted,
                cpuSpeed: gameStartPayload.cpuSpeed,
                enabledCards: gameStartPayload.enabledCards,
                enabledLandmarks: gameStartPayload.enabledLandmarks,
                hostPlayerIndex: input.hostPlayerIndex,
                playerIndex: input.playerIndex,
            });
            return Object.freeze({
                acceptedPendingReconciliation: pendingResult.selection.plan.accepted,
                actionLog: replayActionLog,
                gameStartPayload,
                pendingBeforeRejoin: pendingResult.pending,
                persistenceSelection,
                playerNames: gameStartPayload.playerNames,
                playerOrder: gameStartPayload.playerOrder,
                playerSettings: gameStartPayload.playerSettings,
                provisionalRestore: input.provisionalRestore,
                ready: true,
                restoreAudit: input.restoreAudit,
                restoreGeneration,
                restoredThroughSeq,
                stateSnapshot: input.stateSnapshot,
            });
        }

        function persistRestoreBundle(prepared) {
            try {
                dependencies.writeRestoreJson(
                    dependencies.storageKeys.gameStart,
                    prepared.gameStartPayload
                );
                if (prepared.stateSnapshot) {
                    dependencies.writeRestoreJson(
                        dependencies.storageKeys.stateSnapshot,
                        prepared.stateSnapshot
                    );
                } else {
                    dependencies.removeRestoreItem(dependencies.storageKeys.stateSnapshot);
                }
                if (prepared.restoreAudit) {
                    dependencies.writeRestoreJson(
                        dependencies.storageKeys.restoreAudit,
                        prepared.restoreAudit
                    );
                } else {
                    dependencies.removeRestoreItem(dependencies.storageKeys.restoreAudit);
                }
                const storedActionLog = dependencies.readActionLog();
                const keepStoredUnsignedLog = prepared.stateSnapshot &&
                    !prepared.restoreAudit &&
                    Array.isArray(storedActionLog) &&
                    storedActionLog.length > prepared.actionLog.length;
                const reasons = dependencies.payload.rejoinActionLogReasons;
                const legacyPlan = Object.freeze({
                    actionLog: keepStoredUnsignedLog
                        ? storedActionLog
                        : prepared.actionLog,
                    reason: keepStoredUnsignedLog
                        ? reasons.STORED_UNSIGNED_FULL_LOG
                        : reasons.SERVER_REPLAY_LOG,
                });
                const selection = dependencies.payload.selectRejoinActionLogPersistencePlan(
                    prepared.stateSnapshot,
                    prepared.restoreAudit,
                    storedActionLog,
                    prepared.actionLog,
                    legacyPlan,
                    { authorityEnabled: dependencies.isActionLogPlanAuthorityEnabled() }
                );
                dependencies.recordDiagnostic('rejoinActionLogPlanSelection', selection);
                dependencies.writeRestoreJson(
                    dependencies.storageKeys.actionLog,
                    selection.plan.actionLog
                );
            } catch (_) {
                // Existing rejoin persistence is best effort.
            }
        }

        function persistLegacy(prepared) {
            const plan = prepared.persistenceSelection.plan;
            dependencies.setActionFlight(false);
            if (plan.clearPendingOutboundAction) dependencies.clearPending();
            dependencies.clearRetry();
            dependencies.setCpuSpeed(plan.cpuSpeed);
            if (plan.updateEnabledCards) dependencies.replaceEnabledCards(plan.enabledCards);
            dependencies.replaceEnabledLandmarks(plan.enabledLandmarks);
            dependencies.setPlayerIndexes(plan.playerIndex);
            dependencies.setHostState(plan.hostPlayerIndex);
            persistRestoreBundle(prepared);
            dependencies.saveSession();
            dependencies.invalidateCpuSchedule();
            if (plan.resetUiLocks) dependencies.resetUiLocks(UI_RESET_REASON);
        }

        function persist(prepared) {
            const selection = prepared && prepared.persistenceSelection;
            if (!prepared || prepared.ready !== true || !selection) {
                throw new TypeError('prepared online rejoin context is required');
            }
            const effectSelection = dependencies.selectPersistenceEffect(selection);
            dependencies.recordDiagnostic(
                'onlineRejoinPersistenceEffectSelection',
                effectSelection
            );
            if (effectSelection.source !== 'executor') {
                persistLegacy(prepared);
                return;
            }
            dependencies.rejoinPersistence.execute(selection.plan, {
                clearActionFlight: () => dependencies.setActionFlight(false),
                clearPendingOutboundAction: dependencies.clearPending,
                clearRetry: dependencies.clearRetry,
                setCpuSpeed: dependencies.setCpuSpeed,
                setEnabledCards: dependencies.replaceEnabledCards,
                setEnabledLandmarks: dependencies.replaceEnabledLandmarks,
                setPlayerIndices: dependencies.setPlayerIndexes,
                setHostState: dependencies.setHostState,
                persistRestoreBundle: () => persistRestoreBundle(prepared),
                saveSession: dependencies.saveSession,
                invalidateCpuSchedule: dependencies.invalidateCpuSchedule,
                resetUiLocks: () => dependencies.resetUiLocks(UI_RESET_REASON),
            });
        }

        return Object.freeze({
            beginRestore,
            persist,
            persistRestoreBundle,
            prepare,
            reconcilePending,
            selectLocalOffer,
            selectPersistencePlan,
        });
    }

    return Object.freeze({ LOCAL_OFFER_STATUS, UI_RESET_REASON, createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineRejoinPreparationRuntime;
if (typeof window !== 'undefined') Object.assign(window, { OnlineRejoinPreparationRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { OnlineRejoinPreparationRuntime });
