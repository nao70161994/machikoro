'use strict';

const OnlineRejoinActivationRuntime = (() => {
    const RESTORE_FAILED_STATUS = '❌ 復元データの再生に失敗しました。再接続してください。';
    const RESTORE_FAILED_ABORT = '復元データの再生に失敗しました。再接続して再試行します。';
    const PROVISIONAL_RESTORE_LOG = '⚠️ 参加者データの全一致確認により暫定復元しました';

    function createRuntime(dependencies = {}) {
        const requiredObjects = [
            'logTypes', 'pendingResend', 'reconnectEvents', 'restoreActivation',
            'restoreReplay',
        ];
        for (const name of requiredObjects) {
            if (!dependencies[name]) {
                throw new TypeError(`online rejoin activation dependency is required: ${name}`);
            }
        }
        const requiredEffects = [
            'abortRestore', 'applyReconnectStatus', 'canResendPending', 'clearPending',
            'flushRestoreEvents', 'getGame', 'getPending', 'getRestoreEventHandlers',
            'getRestoreGeneration', 'getSocket', 'initGame', 'isActivationPlanAuthorityEnabled',
            'isPendingResendPlanAuthorityEnabled', 'isReplayPlanAuthorityEnabled',
            'observeReconnect', 'replaceActionSequence',
            'resetPreviousCoins', 'resetReconnectCompletion', 'restoreSnapshot',
            'samePending', 'selectActivationEffect', 'selectPendingResendEffect',
            'selectReplayEffect', 'setActionFlight', 'setOnline', 'setReconnectFlag',
            'setReplaying', 'setStatusText', 'showGame', 'emitAction', 'applyAction',
            'recordDiagnostic',
        ];
        for (const name of requiredEffects) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`online rejoin activation effect is required: ${name}`);
            }
        }

        function replay(input) {
            const legacyPlan = Object.freeze({
                playerNames: input.playerNames,
                playerSettings: input.playerSettings,
                playerOrder: input.playerOrder,
                stateSnapshot: input.stateSnapshot,
                actionLog: input.actionLog,
                provisionalRestore: input.provisionalRestore === true,
            });
            const selection = dependencies.restoreReplay.selectPlan(input, legacyPlan, {
                authorityEnabled: dependencies.isReplayPlanAuthorityEnabled(),
            });
            dependencies.recordDiagnostic('onlineRestoreReplayPlanSelection', selection);
            const effectSelection = dependencies.selectReplayEffect(selection);
            dependencies.recordDiagnostic('onlineRestoreReplayEffectSelection', effectSelection);
            const plan = selection.plan;
            const handlers = {
                setReplaying: dependencies.setReplaying,
                observeReplayStarted: () => {
                    dependencies.observeReconnect(dependencies.reconnectEvents.REPLAY_STARTED);
                },
                applyReplayStatus: () => {
                    dependencies.applyReconnectStatus(dependencies.reconnectEvents.REPLAY_STARTED);
                },
                initGame: dependencies.initGame,
                restoreSnapshot: dependencies.restoreSnapshot,
                applyAction: dependencies.applyAction,
                addProvisionalLog: () => {
                    dependencies.getGame().addLog(
                        dependencies.logTypes.SYSTEM,
                        PROVISIONAL_RESTORE_LOG
                    );
                },
            };
            if (effectSelection.source === 'executor') {
                dependencies.restoreReplay.execute(plan, handlers);
                return;
            }
            handlers.setReplaying(true);
            try {
                handlers.observeReplayStarted();
                handlers.applyReplayStatus();
                handlers.initGame(plan.playerNames, plan.playerSettings, plan.playerOrder);
                if (plan.stateSnapshot && handlers.restoreSnapshot(plan.stateSnapshot) === false) {
                    throw new Error('online snapshot restore rejected');
                }
                for (const entry of plan.actionLog) {
                    if (handlers.applyAction(entry.action, entry.data) === false) {
                        throw new Error('online restore action rejected');
                    }
                }
                if (plan.provisionalRestore) handlers.addProvisionalLog();
            } finally {
                handlers.setReplaying(false);
            }
        }

        function activate(input) {
            const legacyPlan = Object.freeze({ restoredThroughSeq: input.restoredThroughSeq });
            const selection = dependencies.restoreActivation.selectPlan(
                { restoredThroughSeq: input.restoredThroughSeq },
                legacyPlan,
                { authorityEnabled: dependencies.isActivationPlanAuthorityEnabled() }
            );
            dependencies.recordDiagnostic('onlineRestoreActivationPlanSelection', selection);
            const effectSelection = dependencies.selectActivationEffect(selection);
            dependencies.recordDiagnostic('onlineRestoreActivationEffectSelection', effectSelection);
            const plan = selection.plan;
            const handlers = {
                resetReconnectCompleted: dependencies.resetReconnectCompletion,
                activateOnlineGame: () => dependencies.setOnline(true),
                clearReconnectFlag: () => dependencies.setReconnectFlag(false),
                resetPreviousCoins: dependencies.resetPreviousCoins,
                setAppliedSequence: dependencies.replaceActionSequence,
                flushRestoreEvents: value => dependencies.flushRestoreEvents(
                    input.restoreGeneration,
                    value,
                    dependencies.getRestoreEventHandlers()
                ),
                observeRestoreActivated: () => {
                    dependencies.observeReconnect(dependencies.reconnectEvents.RESTORE_ACTIVATED);
                },
                applyActivatedStatus: () => {
                    dependencies.applyReconnectStatus(dependencies.reconnectEvents.RESTORE_ACTIVATED);
                },
            };
            if (effectSelection.source === 'executor') {
                return dependencies.restoreActivation.execute(plan, handlers).result;
            }
            handlers.resetReconnectCompleted();
            handlers.activateOnlineGame();
            handlers.clearReconnectFlag();
            handlers.resetPreviousCoins();
            handlers.setAppliedSequence(plan.restoredThroughSeq);
            if (!handlers.flushRestoreEvents(plan.restoredThroughSeq)) return false;
            handlers.observeRestoreActivated();
            handlers.applyActivatedStatus();
            return true;
        }

        function resendPending(input) {
            const currentPendingMatches = !!input.pendingBeforeRejoin &&
                !input.acceptedPendingReconciliation &&
                dependencies.samePending(dependencies.getPending(), input.pendingBeforeRejoin);
            const socket = dependencies.getSocket();
            const socketConnected = !!socket && socket.connected !== false;
            const eligible = currentPendingMatches && socketConnected;
            const canResend = eligible && dependencies.canResendPending(input.pendingBeforeRejoin);
            const decisions = dependencies.pendingResend.decisions;
            const legacyPlan = Object.freeze({
                decision: !eligible
                    ? decisions.NONE
                    : (canResend ? decisions.RESEND : decisions.CLEAR),
                pending: canResend ? input.pendingBeforeRejoin : null,
            });
            const selection = dependencies.pendingResend.selectPlan({
                pending: input.pendingBeforeRejoin,
                acceptedPending: input.acceptedPendingReconciliation,
                currentPendingMatches,
                socketConnected,
                canResend,
            }, legacyPlan, {
                authorityEnabled: dependencies.isPendingResendPlanAuthorityEnabled(),
            });
            dependencies.recordDiagnostic('onlinePendingResendPlanSelection', selection);
            const effectSelection = dependencies.selectPendingResendEffect(selection);
            dependencies.recordDiagnostic('onlinePendingResendEffectSelection', effectSelection);
            const plan = selection.plan;
            const handlers = {
                clearPendingOutboundAction: dependencies.clearPending,
                setActionFlight: () => dependencies.setActionFlight(true),
                emitAction: pending => dependencies.emitAction(pending, socket),
            };
            if (effectSelection.source === 'executor') {
                dependencies.pendingResend.execute(plan, handlers);
                return;
            }
            if (plan.decision === decisions.CLEAR) {
                handlers.clearPendingOutboundAction();
            } else if (plan.decision === decisions.RESEND) {
                handlers.setActionFlight();
                handlers.emitAction(plan.pending);
            }
        }

        function handle(input = {}, effects = {}) {
            if (input.restoreGeneration !== dependencies.getRestoreGeneration()) return false;
            if (typeof effects.persistRejoinBundle !== 'function') {
                throw new TypeError('online rejoin persistence effect is required');
            }
            effects.persistRejoinBundle();
            dependencies.showGame();
            try {
                replay(input);
            } catch (_) {
                dependencies.setStatusText(RESTORE_FAILED_STATUS);
                dependencies.setReconnectFlag(true);
                dependencies.abortRestore(input.restoreGeneration, RESTORE_FAILED_ABORT);
                return false;
            }
            if (!activate(input)) return false;
            resendPending(input);
            return true;
        }

        return Object.freeze({ activate, handle, replay, resendPending });
    }

    return Object.freeze({
        PROVISIONAL_RESTORE_LOG,
        RESTORE_FAILED_ABORT,
        RESTORE_FAILED_STATUS,
        createRuntime,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineRejoinActivationRuntime;
if (typeof window !== 'undefined') Object.assign(window, { OnlineRejoinActivationRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { OnlineRejoinActivationRuntime });
