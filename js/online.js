// オンライン対戦（タイトル画面設定）
const onlineSetupStateController = OnlineSetupState.createController();
const onlineLobbyRequestController = OnlineLobbyRequestState.createController();
if (typeof window !== 'undefined' && typeof Object.defineProperties === 'function') {
    Object.defineProperties(window, {
        onlineCreateRoomPending: {
            configurable: true,
            get: () => onlineLobbyRequestController.snapshot().createPending,
        },
        onlineJoinRoomPending: {
            configurable: true,
            get: () => onlineLobbyRequestController.snapshot().joinPending,
        },
    });
}
const ONLINE_LOBBY_REQUEST_TIMEOUT_MS = 15000;
const onlineSocketUnavailableReportController = OnlineSocketRegistry.createUnavailableReportController();
const ONLINE_SNAPSHOT_LOG_LIMIT = 30;
const onlineClientEffectResolvers = Object.freeze({
    invalidateCpuSchedule: () => typeof invalidateCpuScheduleChain === 'function' ? invalidateCpuScheduleChain : null,
    notifyLifecycleStart: () => typeof notifyGameLifecycleStart === 'function' ? notifyGameLifecycleStart : null,
    render: () => typeof render === 'function' ? render : null,
    resetUiLocks: () => typeof resetUiLocksForGameReset === 'function' ? resetUiLocksForGameReset : null,
    scheduleCpu: () => typeof scheduleCPU === 'function' ? scheduleCPU : null,
    showNotice: () => typeof showNotice === 'function' ? showNotice : null,
    updateResumeButton: () => typeof updateResumeButton === 'function' ? updateResumeButton : null,
});
const onlineClientEffects = OnlineClientEffects.createFromResolver(name => {
    const resolveEffect = onlineClientEffectResolvers[name];
    return typeof resolveEffect === 'function' ? resolveEffect() : null;
});
const onlineDomEffects = OnlineDomEffects.createRuntime({
    getDocument: () => typeof document !== 'undefined' ? document : null,
});
const onlineSocketEffects = OnlineSocketEffects.createRuntime({
    getSocket: () => onlineSessionSnapshot().socket,
    hostlessEvents: OnlinePayload.hostlessRestoreEvents,
});

function onlineGameRuntimeSnapshot() {
    return GameRuntimeState.runtime.snapshot();
}

function onlineSessionSnapshot() {
    return OnlineRuntimeState.runtime.snapshot();
}

function createOnlineCpuPlayer(difficulty, options = {}) {
    if (typeof createCpuPlayer === "function") {
        return createCpuPlayer(difficulty, options);
    }
    return new CPU(difficulty, options);
}

function onlineCpuOpponentDifficultiesFromSettings(settings) {
    return OnlinePlayerSettings.opponentDifficulties(settings);
}

function freezeOnlinePlayerSettings(settings, playerCount) {
    const selectRlModel = typeof RLModelPortfolio !== "undefined"
        ? count => RLModelPortfolio.selectRandomModel(count)
        : null;
    return OnlinePlayerSettings.freezeForCreate(settings, playerCount, selectRlModel);
}

function getClientVersion() {
    return (typeof window !== "undefined" && window.MACHIKORO_CLIENT_VERSION) || "unknown";
}

function onlineRuntimeFlagRoot() {
    return typeof window !== 'undefined' ? window : null;
}

let onlineSchemaTransport = null;

function getOnlineSchemaTransport() {
    if (onlineSchemaTransport) return onlineSchemaTransport;
    onlineSchemaTransport = OnlineSchemaTransport.create({
        runtimeFlags: typeof OnlineRuntimeFlags !== 'undefined' ? OnlineRuntimeFlags : null,
        negotiation: typeof GameSchemaNegotiation !== 'undefined' ? GameSchemaNegotiation : null,
        actionWire: typeof GameSchemaWire !== 'undefined' ? GameSchemaWire : null,
        recreateWire: typeof GameSchemaRecreateWire !== 'undefined' ? GameSchemaRecreateWire : null,
        getFlagRoot: () => typeof window !== 'undefined' ? window : null,
        getSelection: () => onlineSchemaSelectionController.get(),
    });
    return onlineSchemaTransport;
}

function isGameSchemaNegotiationTransportEnabled() {
    return getOnlineSchemaTransport().isNegotiationEnabled();
}

function isGameSchemaWireTransportEnabled() {
    return getOnlineSchemaTransport().isActionWireEnabled();
}

function isGameSchemaSnapshotWireTransportEnabled() {
    return getOnlineSchemaTransport().isSnapshotWireEnabled();
}

function isGameSchemaRecreateWireTransportEnabled() {
    return getOnlineSchemaTransport().isRecreateWireEnabled();
}

function getGameSchemaCapabilitiesForTransport() {
    return getOnlineSchemaTransport().capabilities();
}

function acceptsNegotiatedGameSchema(selection) {
    return getOnlineSchemaTransport().acceptsSelection(selection);
}

function encodeOnlineGameSchemaAction(payload) {
    return getOnlineSchemaTransport().encodeAction(payload);
}

function decodeOnlineGameSchemaAction(payload) {
    return getOnlineSchemaTransport().decodeAction(payload);
}

function decodeOnlineGameSchemaSnapshotPayload(payload) {
    return getOnlineSchemaTransport().decodeSnapshot(payload);
}

function encodeOnlineRecreateRoomPayload(payload) {
    return getOnlineSchemaTransport().encodeRecreate(payload);
}

function buildOnlineRejoinPayload(session) {
    return OnlinePayload.buildRejoin(session, getClientVersion(), getGameSchemaCapabilitiesForTransport());
}

function changeOnlineCount(delta) {
    const state = onlineSetupStateController.changeCount(delta);
    onlineDomEffects.setText(OnlineDomEffects.ids.playerCount, state.selectedCount);
    renderOnlinePlayerSettings();
    preloadOnlineRlModelsInBackground('online-player-count-preload');
}

function getOnlineRlCpuSettingNote(playerCount) {
    return OnlinePlayerSettings.rlSettingNote(playerCount);
}

function renderOnlinePlayerSettings() {
    let state = onlineSetupStateController.snapshot();
    state = onlineSetupStateController.replaceSettings(OnlinePlayerSettings.normalizeSettings(
        state.playerSettings,
        state.selectedCount
    ));
    onlineDomEffects.setHtml(
        OnlineDomEffects.ids.playerSettings,
        OnlinePlayerSettings.buildSettingsHtml(state.playerSettings, state.selectedCount)
    );
    updateOnlineRlModelReadinessUi();
}

function onChangeOnlinePlayerType(index, value) {
    onlineSetupStateController.updateSetting(index, value === "human"
        ? { type: "human", difficulty: "normal" }
        : { type: "cpu", difficulty: value });
    updateOnlineRlModelReadinessUi();
    if (value === "rl") preloadOnlineRlModelsInBackground('online-rl-selected-preload');
}

// オンライン対戦（セッション状態）は OnlineRuntimeState が所有する。

function setOnlineReconnectLegacyFlag(value) {
    return OnlineRuntimeState.runtime.setReconnecting(value).isReconnectingOnline;
}
const onlineSchemaSelectionController = OnlineSchemaTransport.createSelectionController();
const _hostlessRestoreState = OnlineHostlessRestoreState.createController();
const _onlineRestoreEventQueueStore = OnlineRestoreQueueState.createStore([]);
const _onlineRestoreQueueDiagnosticKeys = typeof OnlineRestoreQueueState !== 'undefined' &&
    OnlineRestoreQueueState.diagnosticKeys
    ? OnlineRestoreQueueState.diagnosticKeys
    : Object.freeze({
        STORE_READ: 'store-read',
        STORE_WRITE: 'store-write',
        STATE: 'state',
        EFFECT: 'effect',
        PLAN: 'plan',
    });
const _initialOnlineRestoreQueueDiagnosticSelection = () => Object.freeze({
    source: 'none',
    matched: true,
    fallbackReason: '',
});
const _onlineRestoreQueueDiagnostics = typeof OnlineRestoreQueueState !== 'undefined' &&
    typeof OnlineRestoreQueueState.createDiagnosticController === 'function'
    ? OnlineRestoreQueueState.createDiagnosticController({
        [_onlineRestoreQueueDiagnosticKeys.STORE_READ]: _initialOnlineRestoreQueueDiagnosticSelection(),
        [_onlineRestoreQueueDiagnosticKeys.STORE_WRITE]: _initialOnlineRestoreQueueDiagnosticSelection(),
        [_onlineRestoreQueueDiagnosticKeys.STATE]: _initialOnlineRestoreQueueDiagnosticSelection(),
        [_onlineRestoreQueueDiagnosticKeys.EFFECT]: null,
        [_onlineRestoreQueueDiagnosticKeys.PLAN]: _initialOnlineRestoreQueueDiagnosticSelection(),
    })
    : (() => {
        const state = Object.create(null);
        return Object.freeze({
            read: key => Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null,
            write(key, value) { state[key] = value; return value; },
        });
    })();
const _onlineDiagnosticController = OnlineDiagnosticState.createController({
    onlineGameEngineShadowOutcome: Object.freeze({
        report: null,
        authority: Object.freeze({ authority: 'mutable', reason: 'disabled' }),
    }),
    onlineReconnectCleanupEffectSelection: Object.freeze({
        source: 'none',
        ready: false,
        fallbackReason: '',
    }),
    onlineReconnectRequestPlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        matched: true,
        fallbackReason: '',
    }),
    onlineReconnectRequestEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    onlineRestoreAbortPlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        matched: true,
        fallbackReason: '',
    }),
    onlineRestoreAbortEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    onlineActionTimeoutPlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        matched: true,
        fallbackReason: '',
    }),
    onlineActionTimeoutEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    incomingGameActionPlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        matched: true,
        fallbackReason: '',
    }),
    acceptedGameActionPlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        matched: true,
        fallbackReason: '',
    }),
    incomingGameActionDecodeEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    acceptedGameActionDecodeEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    incomingGameActionApplyEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    acceptedGameActionApplyEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    incomingGameActionGapEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    acceptedGameActionGapEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    incomingGameActionNoGameEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    acceptedGameActionNoGameEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    incomingGameActionCommitEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    acceptedGameActionCommitEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    onlineSocketConnectPlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        fallbackReason: '',
    }),
    onlineSocketConnectEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    onlineSocketDisconnectPlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        fallbackReason: '',
    }),
    onlineSocketDisconnectEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    onlineHostChangedPlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        fallbackReason: '',
    }),
    onlineHostChangedEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    pendingReconciliationPlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        matched: true,
        fallbackReason: '',
    }),
    rejoinActionLogPlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        matched: true,
        fallbackReason: '',
    }),
    localHostRestoreOfferPlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        matched: true,
        fallbackReason: '',
    }),
    onlineRejoinPersistencePlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        fallbackReason: '',
    }),
    onlineRejoinPersistenceEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    onlinePendingResendPlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        fallbackReason: '',
    }),
    onlinePendingResendEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    onlineRestoreReplayPlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        fallbackReason: '',
    }),
    onlineRestoreReplayEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),
    onlineRestoreActivationPlanSelection: Object.freeze({
        plan: null,
        source: 'none',
        fallbackReason: '',
    }),
    onlineRestoreActivationEffectSelection: Object.freeze({
        source: 'none',
        fallbackReason: '',
    }),});
const _onlineDiagnosticSelections = _onlineDiagnosticController.projection;
const _onlineActionSequenceController = OnlineActionSequence.createController();
const _onlineRestoreLifecycleController = OnlineRestoreLifecycleState.createController();

function _incrementOnlineRestoreGeneration() {
    return _onlineRestoreLifecycleController.incrementGeneration().generation;
}

function _startOnlineRestore() {
    _onlineRestoreLifecycleController.startRestore();
}

function _finishOnlineRestore() {
    _onlineRestoreLifecycleController.finishRestore();
}

function _quarantineOnlineRestore() {
    _onlineRestoreLifecycleController.quarantine();
}

function _clearOnlineRestoreQuarantine() {
    _onlineRestoreLifecycleController.clearQuarantine();
}

function _startOnlineRestoreFlush() {
    _onlineRestoreLifecycleController.startFlush();
}

function _finishOnlineRestoreFlush() {
    _onlineRestoreLifecycleController.finishFlush();
}

const _pendingOutboundState = OnlinePendingOutboundState.createController({
    normalizeRoomId: roomId => _normalizeOnlineRoomId(roomId),
});
const APP_ERROR_EVENT = 'appError';
const ONLINE_ACTION_LOG_LIMIT = 200;
const ONLINE_ACTION_ACK_TIMEOUT_MS = OnlineRetryPolicy.defaults.actionAckTimeoutMs;
const ONLINE_REJOIN_RETRY_DELAY_MS = OnlineRetryPolicy.defaults.rejoinDelayMs;
const ONLINE_RESTORE_EVENT_QUEUE_LIMIT = 256;
const ONLINE_RESTORE_SCHEMA_VERSION = 2;
const ONLINE_SESSION_STORAGE_KEY = 'onlineSession';
const ONLINE_STORAGE_KEYS = Object.freeze({
    gameStart: 'onlineGameStart',
    actionLog: 'onlineActionLog',
    stateSnapshot: 'onlineStateSnapshot',
    restoreAudit: 'onlineRestoreAudit',
    pendingAction: 'onlinePendingAction',
});
const ONLINE_RESTORE_ROOM_INDEX_KEY = 'onlineRestoreRoomIndex';
const ONLINE_RESTORE_ROOM_INDEX_SCHEMA_VERSION = 1;

const ONLINE_ROOM_STORAGE_KEY_SEPARATOR = ':room:';
const _onlineReconnectController = OnlineReconnectState.createController();
const _onlineRejoinAttemptController = OnlineRetryPolicy.createRejoinAttemptController();
const _onlineRejoinTimerController = OnlineRetryPolicy.createRejoinTimerController({
    setTimer: typeof setTimeout === 'function' ? setTimeout : null,
    clearTimer: typeof clearTimeout === 'function' ? clearTimeout : null,
    now: () => Date.now(),
});
const _onlineActionFlightController = OnlineRetryPolicy.createActionFlightController({
    setTimer: typeof setTimeout === 'function' ? setTimeout : null,
    clearTimer: typeof clearTimeout === 'function' ? clearTimeout : null,
    now: () => Date.now(),
});
const _onlineReconnectCompletionController = OnlineReconnectState.createCompletionController();

function getOnlineActionFlightState() {
    return _onlineActionFlightController.snapshot();
}

function _setOnlineRejoinAttemptCount(value) {
    return _onlineRejoinAttemptController.setAttemptCount(value);
}

function _markOnlineRejoinAttemptExhausted() {
    return _onlineRejoinAttemptController.markExhausted();
}

function _resetOnlineRejoinAttempt() {
    return _onlineRejoinAttemptController.reset();
}

function _onlineReconnectObservationFlags() {
    const session = onlineSessionSnapshot();
    const connected = !!session.socket && session.socket.connected !== false;
    return {
        failed: _onlineRejoinAttemptController.isExhausted(),
        completed: _onlineReconnectCompletionController.isCompleted(),
        replaying: session.isReplaying,
        restoring: _onlineRestoreLifecycleController.isInProgress(),
        rejoining: session.isReconnectingOnline && connected,
        connecting: session.isReconnectingOnline && !connected,
        active: session.isOnlineGame,
    };
}

function _observeOnlineReconnectEvent(event) {
    const observation = _onlineReconnectController.observe(event, _onlineReconnectObservationFlags());
    _applyOnlineReconnectEffectAuthority(onlineSessionSnapshot().isReconnectingOnline);
    return observation;
}

const {
    isOnlineReconnectEventAuthorityEnabled,
    isOnlineReconnectEffectAuthorityEnabled,
    isOnlineReconnectStatusEffectAuthorityEnabled,
    isOnlineReconnectTimerAuthorityEnabled,
    isOnlineReconnectCallbackAuthorityEnabled,
    isOnlineReconnectQueuePlanAuthorityEnabled,
    isOnlineReconnectQueueEffectAuthorityEnabled,
    isOnlineRestoreQueueStateAuthorityEnabled,
    isOnlineRestoreQueueStoreReadAuthorityEnabled,
    isOnlineRestoreQueueStoreWriteAuthorityEnabled,
    isOnlineReconnectCleanupAuthorityEnabled,
    isOnlineReconnectCleanupEffectAuthorityEnabled,
    isOnlineReconnectRequestPlanAuthorityEnabled,
    isOnlineReconnectRequestEffectAuthorityEnabled,
    isOnlineRestoreAbortPlanAuthorityEnabled,
    isOnlineRestoreAbortEffectAuthorityEnabled,
    isOnlineActionTimeoutPlanAuthorityEnabled,
    isOnlineActionTimeoutEffectAuthorityEnabled,
    isIncomingGameActionPlanAuthorityEnabled,
    isAcceptedGameActionPlanAuthorityEnabled,
    isIncomingGameActionDecodeEffectAuthorityEnabled,
    isAcceptedGameActionDecodeEffectAuthorityEnabled,
    isIncomingGameActionApplyEffectAuthorityEnabled,
    isAcceptedGameActionApplyEffectAuthorityEnabled,
    isIncomingGameActionGapEffectAuthorityEnabled,
    isAcceptedGameActionGapEffectAuthorityEnabled,
    isIncomingGameActionNoGameEffectAuthorityEnabled,
    isAcceptedGameActionNoGameEffectAuthorityEnabled,
    isIncomingGameActionCommitEffectAuthorityEnabled,
    isAcceptedGameActionCommitEffectAuthorityEnabled,
    isOnlineSocketConnectPlanAuthorityEnabled,
    isOnlineSocketConnectEffectAuthorityEnabled,
    isOnlineSocketDisconnectPlanAuthorityEnabled,
    isOnlineSocketDisconnectEffectAuthorityEnabled,
    isOnlineHostChangedPlanAuthorityEnabled,
    isOnlineHostChangedEffectAuthorityEnabled,
    isPendingReconciliationPlanAuthorityEnabled,
    isRejoinActionLogPlanAuthorityEnabled,
    isLocalHostRestoreOfferPlanAuthorityEnabled,
    isOnlineRejoinPersistencePlanAuthorityEnabled,
    isOnlineRejoinPersistenceEffectAuthorityEnabled,
    isOnlinePendingResendPlanAuthorityEnabled,
    isOnlinePendingResendEffectAuthorityEnabled,
    isOnlineRestoreReplayPlanAuthorityEnabled,
    isOnlineRestoreReplayEffectAuthorityEnabled,
    isOnlineRestoreActivationPlanAuthorityEnabled,
    isOnlineRestoreActivationEffectAuthorityEnabled,
    isOnlineGameEngineShadowEnabled,
    isOnlineGameEngineAuthorityEnabled,
} = OnlineRuntimeFlags.createNamedReaders(onlineRuntimeFlagRoot, [
    'isOnlineReconnectEventAuthorityEnabled',
    'isOnlineReconnectEffectAuthorityEnabled',
    'isOnlineReconnectStatusEffectAuthorityEnabled',
    'isOnlineReconnectTimerAuthorityEnabled',
    'isOnlineReconnectCallbackAuthorityEnabled',
    'isOnlineReconnectQueuePlanAuthorityEnabled',
    'isOnlineReconnectQueueEffectAuthorityEnabled',
    'isOnlineRestoreQueueStateAuthorityEnabled',
    'isOnlineRestoreQueueStoreReadAuthorityEnabled',
    'isOnlineRestoreQueueStoreWriteAuthorityEnabled',
    'isOnlineReconnectCleanupAuthorityEnabled',
    'isOnlineReconnectCleanupEffectAuthorityEnabled',
    'isOnlineReconnectRequestPlanAuthorityEnabled',
    'isOnlineReconnectRequestEffectAuthorityEnabled',
    'isOnlineRestoreAbortPlanAuthorityEnabled',
    'isOnlineRestoreAbortEffectAuthorityEnabled',
    'isOnlineActionTimeoutPlanAuthorityEnabled',
    'isOnlineActionTimeoutEffectAuthorityEnabled',
    'isIncomingGameActionPlanAuthorityEnabled',
    'isAcceptedGameActionPlanAuthorityEnabled',
    'isIncomingGameActionDecodeEffectAuthorityEnabled',
    'isAcceptedGameActionDecodeEffectAuthorityEnabled',
    'isIncomingGameActionApplyEffectAuthorityEnabled',
    'isAcceptedGameActionApplyEffectAuthorityEnabled',
    'isIncomingGameActionGapEffectAuthorityEnabled',
    'isAcceptedGameActionGapEffectAuthorityEnabled',
    'isIncomingGameActionNoGameEffectAuthorityEnabled',
    'isAcceptedGameActionNoGameEffectAuthorityEnabled',
    'isIncomingGameActionCommitEffectAuthorityEnabled',
    'isAcceptedGameActionCommitEffectAuthorityEnabled',
    'isOnlineSocketConnectPlanAuthorityEnabled',
    'isOnlineSocketConnectEffectAuthorityEnabled',
    'isOnlineSocketDisconnectPlanAuthorityEnabled',
    'isOnlineSocketDisconnectEffectAuthorityEnabled',
    'isOnlineHostChangedPlanAuthorityEnabled',
    'isOnlineHostChangedEffectAuthorityEnabled',
    'isPendingReconciliationPlanAuthorityEnabled',
    'isRejoinActionLogPlanAuthorityEnabled',
    'isLocalHostRestoreOfferPlanAuthorityEnabled',
    'isOnlineRejoinPersistencePlanAuthorityEnabled',
    'isOnlineRejoinPersistenceEffectAuthorityEnabled',
    'isOnlinePendingResendPlanAuthorityEnabled',
    'isOnlinePendingResendEffectAuthorityEnabled',
    'isOnlineRestoreReplayPlanAuthorityEnabled',
    'isOnlineRestoreReplayEffectAuthorityEnabled',
    'isOnlineRestoreActivationPlanAuthorityEnabled',
    'isOnlineRestoreActivationEffectAuthorityEnabled',
    'isOnlineGameEngineShadowEnabled',
    'isOnlineGameEngineAuthorityEnabled',
]);

function getOnlineGameEngineShadowOutcome() {
    return _onlineDiagnosticSelections.onlineGameEngineShadowOutcome;
}

function getOnlineRestoreQueuePlanSelection() {
    return _onlineRestoreQueueDiagnostics.read(_onlineRestoreQueueDiagnosticKeys.PLAN);
}

function getOnlineRestoreQueueEffectSelection() {
    return _onlineRestoreQueueDiagnostics.read(_onlineRestoreQueueDiagnosticKeys.EFFECT);
}

function getOnlineRestoreQueueStateSelection() {
    return _onlineRestoreQueueDiagnostics.read(_onlineRestoreQueueDiagnosticKeys.STATE);
}

function getOnlineRestoreQueueStoreSelection() {
    return _onlineRestoreQueueDiagnostics.read(_onlineRestoreQueueDiagnosticKeys.STORE_READ);
}

function getOnlineRestoreQueueStoreWriteSelection() {
    return _onlineRestoreQueueDiagnostics.read(_onlineRestoreQueueDiagnosticKeys.STORE_WRITE);
}

function getOnlineReconnectCleanupEffectSelection() {
    return _onlineDiagnosticSelections.onlineReconnectCleanupEffectSelection;
}

function getOnlineReconnectRequestPlanSelection() {
    return _onlineDiagnosticSelections.onlineReconnectRequestPlanSelection;
}

function getOnlineReconnectRequestEffectSelection() {
    return _onlineDiagnosticSelections.onlineReconnectRequestEffectSelection;
}

function getOnlineRestoreAbortPlanSelection() {
    return _onlineDiagnosticSelections.onlineRestoreAbortPlanSelection;
}

function getOnlineRestoreAbortEffectSelection() {
    return _onlineDiagnosticSelections.onlineRestoreAbortEffectSelection;
}

function getOnlineActionTimeoutPlanSelection() {
    return _onlineDiagnosticSelections.onlineActionTimeoutPlanSelection;
}

function getOnlineActionTimeoutEffectSelection() {
    return _onlineDiagnosticSelections.onlineActionTimeoutEffectSelection;
}

function getIncomingGameActionPlanSelection() {
    return _onlineDiagnosticSelections.incomingGameActionPlanSelection;
}

function getAcceptedGameActionPlanSelection() {
    return _onlineDiagnosticSelections.acceptedGameActionPlanSelection;
}

function getIncomingGameActionDecodeEffectSelection() {
    return _onlineDiagnosticSelections.incomingGameActionDecodeEffectSelection;
}

function getAcceptedGameActionDecodeEffectSelection() {
    return _onlineDiagnosticSelections.acceptedGameActionDecodeEffectSelection;
}

function getIncomingGameActionApplyEffectSelection() {
    return _onlineDiagnosticSelections.incomingGameActionApplyEffectSelection;
}

function getAcceptedGameActionApplyEffectSelection() {
    return _onlineDiagnosticSelections.acceptedGameActionApplyEffectSelection;
}

function getIncomingGameActionGapEffectSelection() {
    return _onlineDiagnosticSelections.incomingGameActionGapEffectSelection;
}

function getAcceptedGameActionGapEffectSelection() {
    return _onlineDiagnosticSelections.acceptedGameActionGapEffectSelection;
}

function getIncomingGameActionNoGameEffectSelection() {
    return _onlineDiagnosticSelections.incomingGameActionNoGameEffectSelection;
}

function getAcceptedGameActionNoGameEffectSelection() {
    return _onlineDiagnosticSelections.acceptedGameActionNoGameEffectSelection;
}

function getIncomingGameActionCommitEffectSelection() {
    return _onlineDiagnosticSelections.incomingGameActionCommitEffectSelection;
}

function getAcceptedGameActionCommitEffectSelection() {
    return _onlineDiagnosticSelections.acceptedGameActionCommitEffectSelection;
}

function getOnlineSocketConnectPlanSelection() {
    return _onlineDiagnosticSelections.onlineSocketConnectPlanSelection;
}

function getOnlineSocketConnectEffectSelection() {
    return _onlineDiagnosticSelections.onlineSocketConnectEffectSelection;
}

function getOnlineSocketDisconnectPlanSelection() {
    return _onlineDiagnosticSelections.onlineSocketDisconnectPlanSelection;
}

function getOnlineSocketDisconnectEffectSelection() {
    return _onlineDiagnosticSelections.onlineSocketDisconnectEffectSelection;
}

function getOnlineHostChangedPlanSelection() {
    return _onlineDiagnosticSelections.onlineHostChangedPlanSelection;
}

function getOnlineHostChangedEffectSelection() {
    return _onlineDiagnosticSelections.onlineHostChangedEffectSelection;
}

function getPendingReconciliationPlanSelection() {
    return _onlineDiagnosticSelections.pendingReconciliationPlanSelection;
}

function getRejoinActionLogPlanSelection() {
    return _onlineDiagnosticSelections.rejoinActionLogPlanSelection;
}

function getLocalHostRestoreOfferPlanSelection() {
    return _onlineDiagnosticSelections.localHostRestoreOfferPlanSelection;
}

function getOnlineRejoinPersistencePlanSelection() {
    return _onlineDiagnosticSelections.onlineRejoinPersistencePlanSelection;
}

function getOnlineRejoinPersistenceEffectSelection() {
    return _onlineDiagnosticSelections.onlineRejoinPersistenceEffectSelection;
}

function getOnlinePendingResendPlanSelection() {
    return _onlineDiagnosticSelections.onlinePendingResendPlanSelection;
}

function getOnlinePendingResendEffectSelection() {
    return _onlineDiagnosticSelections.onlinePendingResendEffectSelection;
}

function getOnlineRestoreReplayPlanSelection() {
    return _onlineDiagnosticSelections.onlineRestoreReplayPlanSelection;
}

function getOnlineRestoreReplayEffectSelection() {
    return _onlineDiagnosticSelections.onlineRestoreReplayEffectSelection;
}

function getOnlineRestoreActivationPlanSelection() {
    return _onlineDiagnosticSelections.onlineRestoreActivationPlanSelection;
}

function getOnlineRestoreActivationEffectSelection() {
    return _onlineDiagnosticSelections.onlineRestoreActivationEffectSelection;
}

function _onlineReconnectEffectSelection(legacyValue = onlineSessionSnapshot().isReconnectingOnline) {
    return OnlineReconnectState.selectEffectAuthority(
        _onlineReconnectController.snapshot(),
        legacyValue === true,
        { effectAuthorityEnabled: isOnlineReconnectEffectAuthorityEnabled() }
    );
}

function _applyOnlineReconnectEffectAuthority(legacyValue = onlineSessionSnapshot().isReconnectingOnline) {
    const selection = _onlineReconnectEffectSelection(legacyValue);
    if (selection.reconnecting !== onlineSessionSnapshot().isReconnectingOnline) {
        setOnlineReconnectLegacyFlag(selection.reconnecting);
    }
    return selection;
}

function _applyOnlineReconnectStatusEffectAuthority(event, legacyMessage) {
    const selection = OnlineReconnectState.selectStatusEffectAuthority(
        _onlineReconnectController.snapshot(),
        event,
        legacyMessage,
        { statusEffectAuthorityEnabled: isOnlineReconnectStatusEffectAuthorityEnabled() }
    );
    onlineDomEffects.setStatusText(selection.message);
    return selection;
}

function _applyOnlineReconnectLifecycleStatusEffectAuthority(event) {
    if (!isOnlineReconnectStatusEffectAuthorityEnabled()) return null;
    const legacyMessage = onlineDomEffects.statusText();
    return _applyOnlineReconnectStatusEffectAuthority(event, legacyMessage);
}

function _onlineReconnectTimerAuthoritySelection() {
    const effectSelection = _onlineReconnectEffectSelection(onlineSessionSnapshot().isReconnectingOnline);
    const enabled = isOnlineReconnectTimerAuthorityEnabled();
    const active = enabled && effectSelection.source === 'event';
    return Object.freeze({
        source: active ? 'event' : (enabled ? 'legacy-fallback' : 'legacy'),
        ready: effectSelection.ready,
        fallbackReason: effectSelection.fallbackReason,
        pending: _onlineRejoinTimerController.hasPending(),
        deadline: _onlineRejoinTimerController.getDeadline(),
    });
}

function _onlineReconnectCallbackAuthoritySelection() {
    const timerSelection = _onlineReconnectTimerAuthoritySelection();
    const enabled = isOnlineReconnectCallbackAuthorityEnabled();
    const active = enabled && timerSelection.source === 'event';
    return Object.freeze({
        source: active ? 'event' : (enabled ? 'legacy-fallback' : 'legacy'),
        ready: timerSelection.ready,
        fallbackReason: timerSelection.fallbackReason,
    });
}

function _onlineReconnectCleanupAuthoritySelection(legacyValue = onlineSessionSnapshot().isReconnectingOnline) {
    return OnlineReconnectState.selectCleanupAuthority(
        _onlineReconnectController.snapshot(),
        legacyValue === true,
        { cleanupAuthorityEnabled: isOnlineReconnectCleanupAuthorityEnabled() }
    );
}

function _onlineReconnectCleanupEffectAuthoritySelection(cleanupSelection) {
    const enabled = isOnlineReconnectCleanupEffectAuthorityEnabled();
    const active = enabled && cleanupSelection && cleanupSelection.source === 'event';
    return Object.freeze({
        source: active ? 'event' : (enabled ? 'legacy-fallback' : 'legacy'),
        ready: !!(cleanupSelection && cleanupSelection.ready),
        fallbackReason: cleanupSelection && cleanupSelection.fallbackReason || '',
    });
}

function _onlineReconnectAuthoritySelection() {
    return OnlineReconnectState.selectAuthorityState(
        _onlineReconnectController.snapshot(),
        { eventAuthorityEnabled: isOnlineReconnectEventAuthorityEnabled() }
    );
}

function getOnlineReconnectState() {
    _onlineReconnectController.reconcile(
        _onlineReconnectObservationFlags(),
        { event: 'runtime-observation' }
    );
    return _onlineReconnectAuthoritySelection().state;
}

function getOnlineReconnectStateSnapshot() {
    getOnlineReconnectState();
    const snapshot = _onlineReconnectController.snapshot();
    return Object.freeze({
        ...snapshot,
        authority: _onlineReconnectAuthoritySelection(),
        effectAuthority: _onlineReconnectEffectSelection(onlineSessionSnapshot().isReconnectingOnline),
        timerAuthority: _onlineReconnectTimerAuthoritySelection(),
        rejoinAttempt: _onlineRejoinAttemptController.snapshot(),
        callbackAuthority: _onlineReconnectCallbackAuthoritySelection(),
        cleanupAuthority: _onlineReconnectCleanupAuthoritySelection(onlineSessionSnapshot().isReconnectingOnline),
        cleanupEffectAuthority: getOnlineReconnectCleanupEffectSelection(),
        requestPlanAuthority: getOnlineReconnectRequestPlanSelection(),
        requestEffectAuthority: getOnlineReconnectRequestEffectSelection(),
        restoreAbortPlanAuthority: getOnlineRestoreAbortPlanSelection(),
        restoreAbortEffectAuthority: getOnlineRestoreAbortEffectSelection(),
        actionTimeoutPlanAuthority: getOnlineActionTimeoutPlanSelection(),
        actionTimeoutEffectAuthority: getOnlineActionTimeoutEffectSelection(),
        incomingGameActionPlanAuthority: getIncomingGameActionPlanSelection(),
        acceptedGameActionPlanAuthority: getAcceptedGameActionPlanSelection(),
        incomingGameActionDecodeEffectAuthority: getIncomingGameActionDecodeEffectSelection(),
        acceptedGameActionDecodeEffectAuthority: getAcceptedGameActionDecodeEffectSelection(),
        incomingGameActionApplyEffectAuthority: getIncomingGameActionApplyEffectSelection(),
        acceptedGameActionApplyEffectAuthority: getAcceptedGameActionApplyEffectSelection(),
        incomingGameActionGapEffectAuthority: getIncomingGameActionGapEffectSelection(),
        acceptedGameActionGapEffectAuthority: getAcceptedGameActionGapEffectSelection(),
        incomingGameActionNoGameEffectAuthority: getIncomingGameActionNoGameEffectSelection(),
        acceptedGameActionNoGameEffectAuthority: getAcceptedGameActionNoGameEffectSelection(),
        incomingGameActionCommitEffectAuthority: getIncomingGameActionCommitEffectSelection(),
        acceptedGameActionCommitEffectAuthority: getAcceptedGameActionCommitEffectSelection(),
        socketConnectPlanAuthority: getOnlineSocketConnectPlanSelection(),
        socketConnectEffectAuthority: getOnlineSocketConnectEffectSelection(),
        socketDisconnectPlanAuthority: getOnlineSocketDisconnectPlanSelection(),
        socketDisconnectEffectAuthority: getOnlineSocketDisconnectEffectSelection(),
        hostChangedPlanAuthority: getOnlineHostChangedPlanSelection(),
        hostChangedEffectAuthority: getOnlineHostChangedEffectSelection(),
        rejoinPersistencePlanAuthority: getOnlineRejoinPersistencePlanSelection(),
        rejoinPersistenceEffectAuthority: getOnlineRejoinPersistenceEffectSelection(),
        pendingResendPlanAuthority: getOnlinePendingResendPlanSelection(),
        pendingResendEffectAuthority: getOnlinePendingResendEffectSelection(),
        restoreReplayPlanAuthority: getOnlineRestoreReplayPlanSelection(),
        restoreReplayEffectAuthority: getOnlineRestoreReplayEffectSelection(),
        restoreActivationPlanAuthority: getOnlineRestoreActivationPlanSelection(),
        restoreActivationEffectAuthority: getOnlineRestoreActivationEffectSelection(),
    });
}

function isOnlineReconnectInputBlocked() {
    if (!isOnlineReconnectEventAuthorityEnabled()) return onlineSessionSnapshot().isReconnectingOnline;
    getOnlineReconnectState();
    const selection = _onlineReconnectAuthoritySelection();
    if (selection.source !== 'event') return onlineSessionSnapshot().isReconnectingOnline;
    return OnlineReconnectState.blocksInput(selection.state);
}

const onlineClientStorageFacade = ClientStorage.createFacade();
const onlineUnavailableClientStorage = Object.freeze({
    getItem() { return null; },
    setItem() {},
    removeItem() {},
    key() { return null; },
    length: 0,
});

function getOnlineClientStorage() {
    return onlineClientStorageFacade.storage() || onlineUnavailableClientStorage;
}

const onlineStorage = createOnlineStorageFacade({
    storage: getOnlineClientStorage(),
    getCurrentRoomId: () => onlineSessionSnapshot().myRoomId,
    sessionKey: ONLINE_SESSION_STORAGE_KEY,
    storageKeys: ONLINE_STORAGE_KEYS,
    roomIndexKey: ONLINE_RESTORE_ROOM_INDEX_KEY,
    roomIndexSchemaVersion: ONLINE_RESTORE_ROOM_INDEX_SCHEMA_VERSION,
    roomKeySeparator: ONLINE_ROOM_STORAGE_KEY_SEPARATOR,
});

function _normalizeOnlineRoomId(roomId) {
    return onlineStorage.normalizeRoomId(roomId);
}

function _isKnownOnlineGameAction(action) {
    if (typeof action !== 'string') return false;
    if (typeof GAME_ACTION_REGISTRY === 'undefined') return true;
    return !!GAME_ACTION_REGISTRY[action];
}

function _onlineRoomStorageKey(key, roomId = onlineSessionSnapshot().myRoomId) {
    return onlineStorage.roomStorageKey(key, roomId);
}

function _onlineRoomStorageKeys(key, roomId = onlineSessionSnapshot().myRoomId) {
    return onlineStorage.roomStorageKeys(key, roomId);
}

function _writeOnlineRoomStorageJson(key, value, roomId = onlineSessionSnapshot().myRoomId) {
    return onlineStorage.writeRoomStorageJson(key, value, roomId);
}

function _removeOnlineRoomStorageItem(key, roomId = onlineSessionSnapshot().myRoomId) {
    return onlineStorage.removeRoomStorageItem(key, roomId);
}

function _writeOnlineRestoreStorageJson(key, value, roomId = onlineSessionSnapshot().myRoomId) {
    return onlineStorage.writeRestoreStorageJson(key, value, roomId);
}

function _removeOnlineRestoreStorageItem(key, roomId = onlineSessionSnapshot().myRoomId) {
    return onlineStorage.removeRestoreStorageItem(key, roomId);
}

function _writeOnlineSessionStorageJson(value, roomId = onlineSessionSnapshot().myRoomId) {
    return onlineStorage.writeSessionStorageJson(value, roomId);
}

function _removeOnlineSessionStorageItem(roomId = onlineSessionSnapshot().myRoomId) {
    return onlineStorage.removeSessionStorageItem(roomId);
}

function _readOnlineStorageJson(key, fallback = null) {
    return onlineStorage.readStorageJson(key, fallback);
}

function _readOnlineRoomStorageJson(key, fallback = null, roomId = onlineSessionSnapshot().myRoomId) {
    return onlineStorage.readRoomStorageJson(key, fallback, roomId);
}

function _writeOnlineStorageJson(key, value) {
    return onlineStorage.writeStorageJson(key, value);
}

function _removeOnlineStorageItem(key) {
    return onlineStorage.removeStorageItem(key);
}

function _normalizeOnlineRestoreRoomIndexEntry(entry) {
    return onlineStorage.normalizeRestoreRoomIndexEntry(entry);
}

function _readOnlineRestoreRoomIndex() {
    return onlineStorage.readRestoreRoomIndex();
}

function _writeOnlineRestoreRoomIndex(entries) {
    return onlineStorage.writeRestoreRoomIndex(entries);
}

function _readOnlineScopedStorageJson(key, roomId, fallback = null) {
    return onlineStorage.readScopedStorageJson(key, roomId, fallback);
}

function _buildOnlineRestoreRoomIndexEntry(roomId, now = Date.now()) {
    return onlineStorage.buildRestoreRoomIndexEntry(roomId, now);
}

function _refreshOnlineRestoreRoomIndex(roomId = onlineSessionSnapshot().myRoomId, now = Date.now()) {
    return onlineStorage.refreshRestoreRoomIndex(roomId, now);
}

function _removeOnlineRestoreRoomIndexEntry(roomId = onlineSessionSnapshot().myRoomId) {
    return onlineStorage.removeRestoreRoomIndexEntry(roomId);
}

function _pruneOnlineRestoreRoomIndex() {
    return onlineStorage.pruneRestoreRoomIndex();
}

function _clearOnlineRestoreBundle() {
    const roomIdBeforeClear = onlineSessionSnapshot().myRoomId;
    _removeOnlineRestoreStorageItem(ONLINE_STORAGE_KEYS.gameStart);
    _removeOnlineRestoreStorageItem(ONLINE_STORAGE_KEYS.actionLog);
    _removeOnlineRestoreStorageItem(ONLINE_STORAGE_KEYS.stateSnapshot);
    _removeOnlineRestoreStorageItem(ONLINE_STORAGE_KEYS.restoreAudit);
    _clearPendingOutboundAction();
    _removeOnlineRestoreRoomIndexEntry(roomIdBeforeClear);
}

function _readOnlineStateSnapshot() {
    return _readOnlineRoomStorageJson(ONLINE_STORAGE_KEYS.stateSnapshot, null);
}

function _readOnlineRestoreAudit() {
    return _readOnlineRoomStorageJson(ONLINE_STORAGE_KEYS.restoreAudit, null);
}

function _isOnlineReconnectTimerAuthorityActive() {
    if (!isOnlineReconnectTimerAuthorityEnabled()) return false;
    getOnlineReconnectState();
    return _onlineReconnectTimerAuthoritySelection().source === 'event';
}

function _isOnlineReconnectCallbackAuthorityActive() {
    if (!isOnlineReconnectCallbackAuthorityEnabled()) return false;
    getOnlineReconnectState();
    return _onlineReconnectCallbackAuthoritySelection().source === 'event';
}

function _hasOnlineRejoinTimer() {
    return _onlineRejoinTimerController.hasPending();
}

function _onlineRejoinTimerDeadline() {
    return _onlineRejoinTimerController.getDeadline();
}

function _clearOnlineRejoinTimer() {
    _onlineRejoinTimerController.clear();
}

function _clearRejoinRetry() {
    _resetOnlineRejoinAttempt();
    _clearOnlineRejoinTimer();
}

function _finishRejoinRetryTimeout() {
    if (_hostlessRestoreState.isPending()) return true;
    if (_requestHostlessRestore()) {
        onlineDomEffects.setStatusText('⏳ 元のホストを60秒待機後、参加者データの一致確認を開始します...');
        return true;
    }
    _clearOnlineRejoinTimer();
    _markOnlineRejoinAttemptExhausted();
    const retryExhaustedMessage = '❌ 再接続がタイムアウトしました。再接続をやり直すか、タイトルへ戻ってください。';
    // Canonical state is unknown. Keep all game input and host CPU blocked.
    setOnlineReconnectLegacyFlag(true);
    _observeOnlineReconnectEvent(OnlineReconnectState.events.RETRY_EXHAUSTED);
    _applyOnlineReconnectStatusEffectAuthority(
        OnlineReconnectState.events.RETRY_EXHAUSTED,
        retryExhaustedMessage
    );
    onlineClientEffects.invalidateCpuSchedule();
    try { onlineClientEffects.render(); } catch (_) {}
    return false;
}

function _handleOnlineRejoinResponseTimeout() {
    let shouldExhaust = false;
    if (_isOnlineReconnectCallbackAuthorityActive()) {
        const decision = OnlineRetryPolicy.rejoinTimeoutDecision(
            onlineSessionSnapshot().isReconnectingOnline,
            _onlineRejoinAttemptController.getAttemptCount()
        );
        if (decision === OnlineRetryPolicy.timeoutDecisions.IGNORE) return;
        shouldExhaust = decision === OnlineRetryPolicy.timeoutDecisions.EXHAUST;
    } else {
        if (!onlineSessionSnapshot().isReconnectingOnline) return;
        shouldExhaust = OnlineRetryPolicy.isRejoinExhausted(_onlineRejoinAttemptController.getAttemptCount());
    }
    if (shouldExhaust) {
        _finishRejoinRetryTimeout();
        return;
    }
    const session = typeof readOnlineSession === 'function' ? readOnlineSession() : null;
    _emitOnlineRejoinRequest(session);
}

function _armOnlineRejoinResponseTimeout() {
    if (_hasOnlineRejoinTimer() || _onlineRejoinAttemptController.isExhausted() || typeof setTimeout !== 'function') return true;
    return _onlineRejoinTimerController.arm(
        _handleOnlineRejoinResponseTimeout,
        ONLINE_REJOIN_RETRY_DELAY_MS
    ).armed;
}

function _clearOnlineActionTimeout() {
    _onlineActionFlightController.clear();
}

function _setOnlineActionInFlight(value) {
    _onlineActionFlightController.set(
        value,
        _handleOnlineActionTimeout,
        ONLINE_ACTION_ACK_TIMEOUT_MS
    );
}

function _legacyOnlineRejoinRequestPlan(session) {
    const decisions = OnlineRetryPolicy.requestDecisions;
    const currentSocket = onlineSessionSnapshot().socket;
    let decision = decisions.REJECT;
    if (currentSocket && session.roomId && !(session.playerIndex < 0) && session.playerName && session.reconnectToken) {
        if (currentSocket.connected === false) decision = decisions.WAIT_FOR_SOCKET;
        else if (OnlineRetryPolicy.isRejoinExhausted(_onlineRejoinAttemptController.getAttemptCount())) decision = decisions.EXHAUST;
        else decision = decisions.EMIT;
    }
    return Object.freeze({
        decision,
        result: decision !== decisions.REJECT,
        nextAttemptCount: decision === decisions.EMIT
            ? _onlineRejoinAttemptController.getAttemptCount() + 1
            : _onlineRejoinAttemptController.getAttemptCount(),
    });
}

function _onlineReconnectRequestPlanSelection(session) {
    const currentSocket = onlineSessionSnapshot().socket;
    const legacyPlan = _legacyOnlineRejoinRequestPlan(session);
    const requested = isOnlineReconnectRequestPlanAuthorityEnabled();
    const stateSelection = OnlineReconnectState.selectAuthorityState(
        _onlineReconnectController.snapshot(),
        { eventAuthorityEnabled: requested }
    );
    const stateReady = stateSelection.source === 'event';
    const selected = OnlineRetryPolicy.selectRejoinRequestPlan({
        hasSocket: !!currentSocket,
        roomId: session.roomId,
        playerIndex: session.playerIndex,
        playerName: session.playerName,
        reconnectToken: session.reconnectToken,
        socketConnected: currentSocket && currentSocket.connected,
        attemptCount: _onlineRejoinAttemptController.getAttemptCount(),
    }, legacyPlan, {
        authorityEnabled: requested && stateReady,
    });
    if (!requested || stateReady) return selected;
    return Object.freeze({
        ...selected,
        source: 'legacy-fallback',
        fallbackReason: stateSelection.fallbackReason || 'state-authority-unavailable',
    });
}

function _onlineReconnectRequestEffectAuthoritySelection(planSelection) {
    const enabled = isOnlineReconnectRequestEffectAuthorityEnabled();
    const active = enabled && planSelection && planSelection.source === 'pure';
    return Object.freeze({
        source: active ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: planSelection && planSelection.fallbackReason || '',
    });
}

function _emitOnlineRejoinSocket(session) {
    onlineSocketEffects.rejoinRoom(buildOnlineRejoinPayload(session));
}

function _runOnlineReconnectRequestEffectsLegacy(plan, session) {
    _clearOnlineRejoinTimer();
    _setOnlineRejoinAttemptCount(plan.nextAttemptCount);
    _emitOnlineRejoinSocket(session);
    _armOnlineRejoinResponseTimeout();
}

function _runOnlineReconnectRequestEffects(planSelection, session) {
    const effectSelection = _onlineReconnectRequestEffectAuthoritySelection(planSelection);
    _onlineDiagnosticSelections.onlineReconnectRequestEffectSelection = effectSelection;
    if (effectSelection.source !== 'executor') {
        _runOnlineReconnectRequestEffectsLegacy(planSelection.plan, session);
        return effectSelection;
    }
    OnlineReconnectRequest.execute(planSelection.plan, {
        clearTimer: () => _clearOnlineRejoinTimer(),
        setAttemptCount: value => { _setOnlineRejoinAttemptCount(value); },
        emitRejoin: () => _emitOnlineRejoinSocket(session),
        armTimer: () => _armOnlineRejoinResponseTimeout(),
    });
    return effectSelection;
}

function _emitOnlineRejoinRequest(sessionOverride = null) {
    const currentSession = onlineSessionSnapshot();
    const session = sessionOverride || {
        roomId: currentSession.myRoomId,
        playerIndex: currentSession.myOriginalPlayerIndex,
        playerName: currentSession.myPlayerName,
        reconnectToken: currentSession.reconnectToken,
    };
    let planSelection = _onlineReconnectRequestPlanSelection(session);
    if (planSelection.plan.decision === OnlineRetryPolicy.requestDecisions.REJECT) {
        _onlineDiagnosticSelections.onlineReconnectRequestPlanSelection = planSelection;
        return false;
    }
    setOnlineReconnectLegacyFlag(true);
    _observeOnlineReconnectEvent(OnlineReconnectState.events.RECONNECT_REQUESTED);
    planSelection = _onlineReconnectRequestPlanSelection(session);
    _onlineDiagnosticSelections.onlineReconnectRequestPlanSelection = planSelection;
    if (planSelection.plan.decision === OnlineRetryPolicy.requestDecisions.WAIT_FOR_SOCKET) return true;
    if (planSelection.plan.decision === OnlineRetryPolicy.requestDecisions.EXHAUST) {
        return _finishRejoinRetryTimeout();
    }
    _runOnlineReconnectRequestEffects(planSelection, session);
    return true;
}

function resumeOnlineReconnectAfterPageActivation() {
    const session = onlineSessionSnapshot();
    if (!session.isReconnectingOnline || _onlineRejoinAttemptController.isExhausted()) return false;
    if (!session.socket || session.socket.connected === false) return false;
    if (_hasOnlineRejoinTimer() && _onlineRejoinTimerDeadline() > Date.now()) return false;
    _clearOnlineRejoinTimer();
    return _emitOnlineRejoinRequest();
}

function _legacyOnlineActionTimeoutPlan() {
    const decisions = OnlineRetryPolicy.actionTimeoutDecisions;
    const online = onlineSessionSnapshot().isOnlineGame;
    return Object.freeze({
        decision: !_onlineActionFlightController.isInFlight()
            ? decisions.IGNORE
            : (online ? decisions.REJOIN : decisions.CLEAR_ONLY),
    });
}

function _onlineActionTimeoutPlanSelection() {
    const online = onlineSessionSnapshot().isOnlineGame;
    const legacyPlan = _legacyOnlineActionTimeoutPlan();
    const requested = isOnlineActionTimeoutPlanAuthorityEnabled();
    const stateSelection = OnlineReconnectState.selectAuthorityState(
        _onlineReconnectController.snapshot(),
        { eventAuthorityEnabled: requested }
    );
    const stateReady = stateSelection.source === 'event';
    const selected = OnlineRetryPolicy.selectActionTimeoutPlan(
        _onlineActionFlightController.isInFlight(),
        online,
        legacyPlan,
        { authorityEnabled: requested && stateReady }
    );
    if (!requested || stateReady) return selected;
    return Object.freeze({
        ...selected,
        source: 'legacy-fallback',
        fallbackReason: stateSelection.fallbackReason || 'state-authority-unavailable',
    });
}

function _onlineActionTimeoutEffectAuthoritySelection(planSelection) {
    const enabled = isOnlineActionTimeoutEffectAuthorityEnabled();
    const purePlanReady = planSelection.source === 'pure-plan';
    const helperAvailable = typeof OnlineActionTimeout !== 'undefined' &&
        typeof OnlineActionTimeout.execute === 'function';
    const useExecutor = enabled && purePlanReady && helperAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!purePlanReady ? 'action-timeout-plan-not-authoritative' : 'executor-unavailable'),
    });
}

function _runOnlineActionTimeoutEffectsLegacy(plan) {
    const decisions = OnlineRetryPolicy.actionTimeoutDecisions;
    _setOnlineActionInFlight(false);
    if (plan.decision === decisions.CLEAR_ONLY) return false;
    setOnlineReconnectLegacyFlag(true);
    onlineClientEffects.invalidateCpuSchedule();
    onlineDomEffects.setStatusText('⚠️ サーバー応答がタイムアウトしました。状態を再同期しています...');
    return _emitOnlineRejoinRequest();
}

function _runOnlineActionTimeoutEffects(planSelection) {
    const effectSelection = _onlineActionTimeoutEffectAuthoritySelection(planSelection);
    _onlineDiagnosticSelections.onlineActionTimeoutEffectSelection = effectSelection;
    if (effectSelection.source !== 'executor') {
        return _runOnlineActionTimeoutEffectsLegacy(planSelection.plan);
    }
    return OnlineActionTimeout.execute(planSelection.plan, {
        clearActionFlight: () => _setOnlineActionInFlight(false),
        markReconnecting: () => setOnlineReconnectLegacyFlag(true),
        invalidateCpuSchedule: () => { onlineClientEffects.invalidateCpuSchedule(); },
        updateStatus: message => { onlineDomEffects.setStatusText(message); },
        requestRejoin: () => _emitOnlineRejoinRequest(),
    }).result;
}

function _handleOnlineActionTimeout() {
    const planSelection = _onlineActionTimeoutPlanSelection();
    _onlineDiagnosticSelections.onlineActionTimeoutPlanSelection = planSelection;
    if (planSelection.plan.decision === OnlineRetryPolicy.actionTimeoutDecisions.IGNORE) return false;
    return _runOnlineActionTimeoutEffects(planSelection);
}

function _onlineDecodeFailureEffectAuthoritySelection(enabled) {
    const stateSelection = OnlineReconnectState.selectAuthorityState(
        _onlineReconnectController.snapshot(),
        { eventAuthorityEnabled: enabled }
    );
    const stateReady = stateSelection.source === 'event';
    const helperAvailable = typeof OnlineDecodeFailure !== 'undefined' &&
        typeof OnlineDecodeFailure.execute === 'function';
    const useExecutor = enabled && stateReady && helperAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!stateReady
                ? (stateSelection.fallbackReason || 'state-authority-unavailable')
                : 'executor-unavailable'),
    });
}

function _runOnlineDecodeFailureEffectsLegacy(plan) {
    if (plan.clearActionFlight) _setOnlineActionInFlight(false);
    setOnlineReconnectLegacyFlag(true);
    if (!_emitOnlineRejoinRequest()) _scheduleRejoinRetry();
    return false;
}

function _runOnlineDecodeFailureEffects(plan, enabled, recordSelection) {
    const selection = _onlineDecodeFailureEffectAuthoritySelection(enabled);
    recordSelection(selection);
    if (selection.source !== 'executor') {
        return _runOnlineDecodeFailureEffectsLegacy(plan);
    }
    return OnlineDecodeFailure.execute(plan, {
        clearActionFlight: () => _setOnlineActionInFlight(false),
        markReconnecting: () => setOnlineReconnectLegacyFlag(true),
        requestRejoin: () => _emitOnlineRejoinRequest(),
        scheduleRetry: () => _scheduleRejoinRetry(),
    }).result;
}

function _onlineActionApplyFailureEffectAuthoritySelection(planSelection, enabled) {
    const decisions = OnlinePayload.incomingGameActionDecisions;
    const pureApplyPlan = planSelection && planSelection.source === 'pure-plan' &&
        planSelection.plan && planSelection.plan.decision === decisions.APPLY;
    const helperAvailable = typeof OnlineActionApplyFailure !== 'undefined' &&
        typeof OnlineActionApplyFailure.execute === 'function';
    const useExecutor = enabled && pureApplyPlan && helperAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!pureApplyPlan ? 'game-action-plan-not-authoritative' : 'executor-unavailable'),
    });
}

function _runOnlineActionApplyFailureEffectsLegacy(error) {
    console.error(error);
    setOnlineReconnectLegacyFlag(true);
    onlineClientEffects.invalidateCpuSchedule();
    if (!_onlineRestoreLifecycleController.isFlushing() && !_emitOnlineRejoinRequest()) _scheduleRejoinRetry();
    return false;
}

function _runOnlineActionApplyFailureEffects(error, planSelection, enabled, recordSelection) {
    const selection = _onlineActionApplyFailureEffectAuthoritySelection(planSelection, enabled);
    recordSelection(selection);
    if (selection.source !== 'executor') {
        return _runOnlineActionApplyFailureEffectsLegacy(error);
    }
    return OnlineActionApplyFailure.execute(
        { requestRejoin: !_onlineRestoreLifecycleController.isFlushing() },
        {
            reportError: () => console.error(error),
            markReconnecting: () => setOnlineReconnectLegacyFlag(true),
            invalidateCpuSchedule: () => { onlineClientEffects.invalidateCpuSchedule(); },
            requestRejoin: () => _emitOnlineRejoinRequest(),
            scheduleRetry: () => _scheduleRejoinRetry(),
        }
    ).result;
}

function _onlineActionGapEffectAuthoritySelection(planSelection, enabled) {
    const decisions = OnlinePayload.incomingGameActionDecisions;
    const pureGapPlan = planSelection && planSelection.source === 'pure-plan' &&
        planSelection.plan && planSelection.plan.decision === decisions.GAP;
    const helperAvailable = typeof OnlineActionGap !== 'undefined' &&
        typeof OnlineActionGap.execute === 'function';
    const useExecutor = enabled && pureGapPlan && helperAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!pureGapPlan ? 'game-action-gap-plan-not-authoritative' : 'executor-unavailable'),
    });
}

function _runOnlineActionGapEffectsLegacy(statusMessage) {
    setOnlineReconnectLegacyFlag(true);
    onlineClientEffects.invalidateCpuSchedule();
    if (statusMessage !== null) onlineDomEffects.setStatusText(statusMessage);
    if (!_emitOnlineRejoinRequest()) _scheduleRejoinRetry();
    return !_onlineRestoreLifecycleController.isFlushing();
}

function _runOnlineActionGapEffects(statusMessage, planSelection, enabled, recordSelection) {
    const selection = _onlineActionGapEffectAuthoritySelection(planSelection, enabled);
    recordSelection(selection);
    if (selection.source !== 'executor') {
        return _runOnlineActionGapEffectsLegacy(statusMessage);
    }
    return OnlineActionGap.execute(
        {
            result: !_onlineRestoreLifecycleController.isFlushing(),
            statusMessage,
        },
        {
            markReconnecting: () => setOnlineReconnectLegacyFlag(true),
            invalidateCpuSchedule: () => { onlineClientEffects.invalidateCpuSchedule(); },
            updateStatus: message => { onlineDomEffects.setStatusText(message); },
            requestRejoin: () => _emitOnlineRejoinRequest(),
            scheduleRetry: () => _scheduleRejoinRetry(),
        }
    ).result;
}

function _onlineActionNoGameEffectAuthoritySelection(planSelection, enabled) {
    const decisions = OnlinePayload.incomingGameActionDecisions;
    const pureNoGamePlan = planSelection && planSelection.source === 'pure-plan' &&
        planSelection.plan && planSelection.plan.decision === decisions.NO_GAME;
    const helperAvailable = typeof OnlineActionNoGame !== 'undefined' &&
        typeof OnlineActionNoGame.execute === 'function';
    const useExecutor = enabled && pureNoGamePlan && helperAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!pureNoGamePlan ? 'game-action-no-game-plan-not-authoritative' : 'executor-unavailable'),
    });
}

function _runOnlineActionNoGameEffectsLegacy(statusMessage, requestRejoin) {
    setOnlineReconnectLegacyFlag(true);
    onlineDomEffects.setStatusText(statusMessage);
    if (requestRejoin) _emitOnlineRejoinRequest();
    return !_onlineRestoreLifecycleController.isFlushing();
}

function _runOnlineActionNoGameEffects(statusMessage, requestRejoin, planSelection, enabled, recordSelection) {
    const selection = _onlineActionNoGameEffectAuthoritySelection(planSelection, enabled);
    recordSelection(selection);
    if (selection.source !== 'executor') {
        return _runOnlineActionNoGameEffectsLegacy(statusMessage, requestRejoin);
    }
    return OnlineActionNoGame.execute(
        {
            requestRejoin,
            result: !_onlineRestoreLifecycleController.isFlushing(),
            statusMessage,
        },
        {
            markReconnecting: () => setOnlineReconnectLegacyFlag(true),
            updateStatus: message => { onlineDomEffects.setStatusText(message); },
            requestRejoin: () => _emitOnlineRejoinRequest(),
        }
    ).result;
}

function _onlineActionCommitEffectAuthoritySelection(planSelection, enabled) {
    const decisions = OnlinePayload.incomingGameActionDecisions;
    const pureApplyPlan = planSelection && planSelection.source === 'pure-plan' &&
        planSelection.plan && planSelection.plan.decision === decisions.APPLY;
    const helperAvailable = typeof OnlineActionCommit !== 'undefined' &&
        typeof OnlineActionCommit.execute === 'function';
    const useExecutor = enabled && pureApplyPlan && helperAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!pureApplyPlan ? 'game-action-commit-plan-not-authoritative' : 'executor-unavailable'),
    });
}

function _runOnlineActionCommitEffectsLegacy(action, data, seq, logOptions, clearPending) {
    _setLastAppliedOnlineActionSeq(seq);
    _saveActionLog(action, data, logOptions);
    if (clearPending) _clearPendingOutboundAction();
    if (!_onlineRestoreLifecycleController.isFlushing()) {
        onlineClientEffects.render();
        onlineClientEffects.scheduleCpu();
    }
    return true;
}

function _runOnlineActionCommitEffects(
    action, data, seq, logOptions, alreadyApplied, clearPending, planSelection, enabled, recordSelection
) {
    const selection = _onlineActionCommitEffectAuthoritySelection(planSelection, enabled);
    recordSelection(selection);
    if (selection.source !== 'executor') {
        return _runOnlineActionCommitEffectsLegacy(action, data, seq, logOptions, clearPending);
    }
    return OnlineActionCommit.execute(
        {
            alreadyApplied,
            clearPending,
            render: !_onlineRestoreLifecycleController.isFlushing(),
        },
        {
            setSequence: () => _setLastAppliedOnlineActionSeq(seq),
            saveActionLog: () => _saveActionLog(action, data, logOptions),
            clearPending: () => _clearPendingOutboundAction(),
            render: () => onlineClientEffects.render(),
            scheduleCpu: () => onlineClientEffects.scheduleCpu(),
        }
    ).result;
}

function _legacyOnlineSocketConnectPlan() {
    const session = onlineSessionSnapshot();
    return Object.freeze({
        clearWaitingStatus: onlineDomEffects.isStatusWaiting(),
        requestRejoin: !!((session.isOnlineGame || session.isReconnectingOnline || _onlineRestoreLifecycleController.isInProgress()) &&
            session.myRoomId && session.myOriginalPlayerIndex >= 0 && session.myPlayerName && session.reconnectToken),
    });
}

function _onlineSocketConnectPlanSelection() {
    const session = onlineSessionSnapshot();
    const legacyPlan = _legacyOnlineSocketConnectPlan();
    const requested = isOnlineSocketConnectPlanAuthorityEnabled();
    const stateSelection = OnlineReconnectState.selectAuthorityState(
        _onlineReconnectController.snapshot(),
        { eventAuthorityEnabled: requested }
    );
    const stateReady = stateSelection.source === 'event' &&
        stateSelection.state === OnlineReconnectState.states.CONNECTING;
    const selected = OnlineSocketConnect.selectPlan({
        waitingStatus: onlineDomEffects.isStatusWaiting(),
        onlineActive: session.isOnlineGame,
        reconnecting: session.isReconnectingOnline,
        restoreInProgress: _onlineRestoreLifecycleController.isInProgress(),
        hasRoomId: !!session.myRoomId,
        originalPlayerIndex: session.myOriginalPlayerIndex,
        hasPlayerName: !!session.myPlayerName,
        hasReconnectToken: !!session.reconnectToken,
    }, legacyPlan, {
        authorityEnabled: requested && stateReady,
    });
    if (!requested || stateReady) return selected;
    return Object.freeze({
        ...selected,
        source: 'legacy-fallback',
        fallbackReason: stateSelection.source !== 'event'
            ? (stateSelection.fallbackReason || 'state-authority-unavailable')
            : 'socket-connect-state-not-connecting',
    });
}

function _onlineSocketConnectEffectAuthoritySelection(planSelection) {
    const enabled = isOnlineSocketConnectEffectAuthorityEnabled();
    const helperAvailable = typeof OnlineSocketConnect !== 'undefined' &&
        typeof OnlineSocketConnect.execute === 'function';
    const authoritativePlan = planSelection && planSelection.source === 'pure-plan';
    const useExecutor = enabled && authoritativePlan && helperAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!authoritativePlan ? 'socket-connect-plan-not-authoritative' : 'executor-unavailable'),
    });
}

function _runOnlineSocketConnectEffectsLegacy(plan) {
    if (plan.clearWaitingStatus) onlineDomEffects.setStatusText('');
    if (plan.requestRejoin) {
        setOnlineReconnectLegacyFlag(true);
        _emitOnlineRejoinRequest();
    }
    return true;
}

function _runOnlineSocketConnectEffects() {
    const planSelection = _onlineSocketConnectPlanSelection();
    _onlineDiagnosticSelections.onlineSocketConnectPlanSelection = planSelection;
    const effectSelection = _onlineSocketConnectEffectAuthoritySelection(planSelection);
    _onlineDiagnosticSelections.onlineSocketConnectEffectSelection = effectSelection;
    if (effectSelection.source !== 'executor') {
        return _runOnlineSocketConnectEffectsLegacy(planSelection.plan);
    }
    return OnlineSocketConnect.execute(planSelection.plan, {
        clearWaitingStatus: () => { onlineDomEffects.setStatusText(''); },
        markReconnecting: () => setOnlineReconnectLegacyFlag(true),
        requestRejoin: () => _emitOnlineRejoinRequest(),
    }).result;
}

function _legacyOnlineSocketDisconnectPlan() {
    return Object.freeze({
        active: onlineSessionSnapshot().isOnlineGame || _onlineRestoreLifecycleController.isInProgress(),
        abortRestore: _onlineRestoreLifecycleController.isInProgress(),
    });
}

function _onlineSocketDisconnectPlanSelection() {
    const online = onlineSessionSnapshot().isOnlineGame;
    _onlineReconnectController.reconcile(
        _onlineReconnectObservationFlags(),
        { event: 'socket-disconnect-plan' }
    );
    const legacyPlan = _legacyOnlineSocketDisconnectPlan();
    const requested = isOnlineSocketDisconnectPlanAuthorityEnabled();
    const stateSelection = OnlineReconnectState.selectAuthorityState(
        _onlineReconnectController.snapshot(),
        { eventAuthorityEnabled: requested }
    );
    const stateReady = stateSelection.source === 'event';
    const selected = OnlineSocketDisconnect.selectPlan({
        onlineActive: online,
        restoreInProgress: _onlineRestoreLifecycleController.isInProgress(),
    }, legacyPlan, {
        authorityEnabled: requested && stateReady,
    });
    if (!requested || stateReady) return selected;
    return Object.freeze({
        ...selected,
        source: 'legacy-fallback',
        fallbackReason: stateSelection.fallbackReason || 'state-authority-unavailable',
    });
}

function _onlineSocketDisconnectEffectAuthoritySelection(planSelection) {
    const enabled = isOnlineSocketDisconnectEffectAuthorityEnabled();
    const helperAvailable = typeof OnlineSocketDisconnect !== 'undefined' &&
        typeof OnlineSocketDisconnect.execute === 'function';
    const authoritativePlan = planSelection && planSelection.source === 'pure-plan';
    const useExecutor = enabled && authoritativePlan && helperAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!authoritativePlan ? 'socket-disconnect-plan-not-authoritative' : 'executor-unavailable'),
    });
}

function _runOnlineSocketDisconnectEffectsLegacy(plan) {
    finishOnlineLobbyRequest();
    if (!plan.active) return false;
    if (plan.abortRestore) {
        _incrementOnlineRestoreGeneration();
        _finishOnlineRestore();
        _quarantineOnlineRestore();
        _clearOnlineRestoreEventQueue();
    }
    setOnlineReconnectLegacyFlag(true);
    _setOnlineActionInFlight(false);
    onlineClientEffects.invalidateCpuSchedule();
    _observeOnlineReconnectEvent(OnlineReconnectState.events.SOCKET_DISCONNECTED);
    _applyOnlineReconnectStatusEffectAuthority(
        OnlineReconnectState.events.SOCKET_DISCONNECTED,
        '⏳ 接続が切れました。再接続しています...'
    );
    return true;
}

function _runOnlineSocketDisconnectEffects() {
    const planSelection = _onlineSocketDisconnectPlanSelection();
    _onlineDiagnosticSelections.onlineSocketDisconnectPlanSelection = planSelection;
    const effectSelection = _onlineSocketDisconnectEffectAuthoritySelection(planSelection);
    _onlineDiagnosticSelections.onlineSocketDisconnectEffectSelection = effectSelection;
    if (effectSelection.source !== 'executor') {
        return _runOnlineSocketDisconnectEffectsLegacy(planSelection.plan);
    }
    return OnlineSocketDisconnect.execute(planSelection.plan, {
        finishLobby: () => finishOnlineLobbyRequest(),
        invalidateRestoreGeneration: () => { _incrementOnlineRestoreGeneration(); },
        finishRestore: () => { _finishOnlineRestore(); },
        quarantineRestore: () => { _quarantineOnlineRestore(); },
        clearRestoreQueue: () => { _clearOnlineRestoreEventQueue(); },
        markReconnecting: () => setOnlineReconnectLegacyFlag(true),
        clearActionFlight: () => _setOnlineActionInFlight(false),
        invalidateCpuSchedule: () => { onlineClientEffects.invalidateCpuSchedule(); },
        observeDisconnect: () => _observeOnlineReconnectEvent(
            OnlineReconnectState.events.SOCKET_DISCONNECTED
        ),
        updateStatus: () => _applyOnlineReconnectStatusEffectAuthority(
            OnlineReconnectState.events.SOCKET_DISCONNECTED,
            '⏳ 接続が切れました。再接続しています...'
        ),
    }).result;
}

function _legacyOnlineHostChangedPlan(newHostPlayerIndex) {
    return Object.freeze({
        isHost: Number.isInteger(newHostPlayerIndex) &&
            newHostPlayerIndex === onlineSessionSnapshot().myOriginalPlayerIndex,
    });
}

function _onlineHostChangedPlanSelection(newHostPlayerIndex) {
    const originalPlayerIndex = onlineSessionSnapshot().myOriginalPlayerIndex;
    const legacyPlan = _legacyOnlineHostChangedPlan(newHostPlayerIndex);
    return OnlineHostChanged.selectPlan({
        newHostPlayerIndex,
        myOriginalPlayerIndex: originalPlayerIndex,
    }, legacyPlan, {
        authorityEnabled: isOnlineHostChangedPlanAuthorityEnabled(),
    });
}

function _onlineHostChangedEffectAuthoritySelection(planSelection) {
    const enabled = isOnlineHostChangedEffectAuthorityEnabled();
    const helperAvailable = typeof OnlineHostChanged !== 'undefined' &&
        typeof OnlineHostChanged.execute === 'function';
    const authoritativePlan = planSelection && planSelection.source === 'pure-plan';
    const useExecutor = enabled && authoritativePlan && helperAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!authoritativePlan ? 'host-changed-plan-not-authoritative' : 'executor-unavailable'),
    });
}

function _runOnlineHostChangedEffectsLegacy(newHostPlayerIndex, hostEpoch) {
    if (_setOnlineHostState(newHostPlayerIndex)) {
        const currentGame = onlineGameRuntimeSnapshot().game;
        currentGame && currentGame.addLog(LOG_TYPES.SYSTEM, `👑 あなたがホストになりました`);
        onlineClientEffects.render();
        onlineClientEffects.scheduleCpu();
    } else {
        onlineClientEffects.invalidateCpuSchedule();
    }
    _persistOnlineHostState(newHostPlayerIndex, hostEpoch);
    return true;
}

function _runOnlineHostChangedEffects(newHostPlayerIndex, hostEpoch) {
    const planSelection = _onlineHostChangedPlanSelection(newHostPlayerIndex);
    _onlineDiagnosticSelections.onlineHostChangedPlanSelection = planSelection;
    const effectSelection = _onlineHostChangedEffectAuthoritySelection(planSelection);
    _onlineDiagnosticSelections.onlineHostChangedEffectSelection = effectSelection;
    if (effectSelection.source !== 'executor') {
        return _runOnlineHostChangedEffectsLegacy(newHostPlayerIndex, hostEpoch);
    }
    return OnlineHostChanged.execute(planSelection.plan, {
        setHostState: isHost => { OnlineRuntimeState.runtime.setHost(isHost); },
        addHostLog: () => {
            const currentGame = onlineGameRuntimeSnapshot().game;
            currentGame && currentGame.addLog(LOG_TYPES.SYSTEM, `👑 あなたがホストになりました`);
        },
        render: () => onlineClientEffects.render(),
        scheduleCpu: () => onlineClientEffects.scheduleCpu(),
        invalidateCpuSchedule: () => { onlineClientEffects.invalidateCpuSchedule(); },
        persistHostState: () => _persistOnlineHostState(newHostPlayerIndex, hostEpoch),
    }).result;
}

function _onlineRejoinPersistenceEffectAuthoritySelection(planSelection) {
    const enabled = isOnlineRejoinPersistenceEffectAuthorityEnabled();
    const helperAvailable = typeof OnlineRejoinPersistence !== 'undefined' &&
        typeof OnlineRejoinPersistence.execute === 'function';
    const authoritativePlan = planSelection && planSelection.source === 'pure-plan';
    const useExecutor = enabled && authoritativePlan && helperAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!authoritativePlan
                ? 'rejoin-persistence-plan-not-authoritative'
                : 'executor-unavailable'),
    });
}

function _onlinePendingResendEffectAuthoritySelection(planSelection) {
    const enabled = isOnlinePendingResendEffectAuthorityEnabled();
    const helperAvailable = typeof OnlinePendingResend !== 'undefined' &&
        typeof OnlinePendingResend.execute === 'function';
    const authoritativePlan = planSelection && planSelection.source === 'pure-plan';
    const useExecutor = enabled && authoritativePlan && helperAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!authoritativePlan
                ? 'pending-resend-plan-not-authoritative'
                : 'executor-unavailable'),
    });
}

function _onlineRestoreReplayEffectAuthoritySelection(planSelection) {
    const enabled = isOnlineRestoreReplayEffectAuthorityEnabled();
    const helperAvailable = typeof OnlineRestoreReplay !== 'undefined' &&
        typeof OnlineRestoreReplay.execute === 'function';
    const authoritativePlan = planSelection && planSelection.source === 'pure-plan';
    const useExecutor = enabled && authoritativePlan && helperAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!authoritativePlan
                ? 'restore-replay-plan-not-authoritative'
                : 'executor-unavailable'),
    });
}

function _onlineRestoreActivationEffectAuthoritySelection(planSelection) {
    const enabled = isOnlineRestoreActivationEffectAuthorityEnabled();
    const helperAvailable = typeof OnlineRestoreActivation !== 'undefined' &&
        typeof OnlineRestoreActivation.execute === 'function';
    const authoritativePlan = planSelection && planSelection.source === 'pure-plan';
    const useExecutor = enabled && authoritativePlan && helperAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!authoritativePlan
                ? 'restore-activation-plan-not-authoritative'
                : 'executor-unavailable'),
    });
}

function markOnlineGameFinished() {
    const plan = OnlineSessionLifecycle.completedPlan();
    OnlineSessionLifecycle.execute(plan, {
        markCompleted() { _onlineReconnectCompletionController.markCompleted(); },
        leaveOnlineGame() { OnlineRuntimeState.runtime.setOnline(false); },
        clearReconnectFlag() { setOnlineReconnectLegacyFlag(false); },
        clearActionInFlight() { _setOnlineActionInFlight(false); },
        clearRejoinRetry() { _clearRejoinRetry(); },
        observeCompleted() {
            _observeOnlineReconnectEvent(OnlineReconnectState.events.GAME_COMPLETED);
        },
    });
}

function resetOnlineState() {
    const session = onlineSessionSnapshot();
    const plan = OnlineSessionLifecycle.resetPlan(session.myRoomId);
    OnlineSessionLifecycle.execute(plan, {
        markNotCompleted() { _onlineReconnectCompletionController.reset(); },
        resetEngineShadow() {
            _onlineDiagnosticSelections.onlineGameEngineShadowOutcome = Object.freeze({
                report: null,
                authority: Object.freeze({ authority: 'mutable', reason: 'disabled' }),
            });
        },
        finishLobbyRequest() { finishOnlineLobbyRequest(); },
        incrementCpuScheduleToken() { onlineClientEffects.invalidateCpuSchedule(); },
        disconnectSocket() {
            if (session.socket) {
                session.socket.disconnect();
                OnlineRuntimeState.runtime.setSocket(null);
            }
        },
        leaveOnlineGame() { OnlineRuntimeState.runtime.setOnline(false); },
        clearHost() { OnlineRuntimeState.runtime.setHost(false); },
        clearPlayerIndexes() { OnlineRuntimeState.runtime.clearPlayerIndexes(); },
        clearRoom() { OnlineRuntimeState.runtime.clearRoom(); },
        clearReconnectToken() { OnlineRuntimeState.runtime.clearReconnectToken(); },
        clearSchemaSelection() { onlineSchemaSelectionController.clear(); },
        clearReplayFlag() { OnlineRuntimeState.runtime.setReplaying(false); },
        clearReconnectFlag() { setOnlineReconnectLegacyFlag(false); },
        clearActionInFlight() { _setOnlineActionInFlight(false); },
        clearPendingOutboundAction(currentPlan) {
            _clearPendingOutboundAction(currentPlan.roomIdBeforeReset);
        },
        clearRejoinRetry() { _clearRejoinRetry(); },
        clearHostlessPending() { _hostlessRestoreState.clear(); },
        incrementRestoreGeneration() { _incrementOnlineRestoreGeneration(); },
        clearRestoreInProgress() { _finishOnlineRestore(); },
        clearRestoreQueue() { _clearOnlineRestoreEventQueue(); },
        resetLastAppliedSequence() { _onlineActionSequenceController.reset(); },
        clearRestoreFlushFlag() { _finishOnlineRestoreFlush(); },
        clearRestoreQuarantine() { _clearOnlineRestoreQuarantine(); },
        clearPendingMemory() { _pendingOutboundState.clear(); },
        observeReset() {
            _observeOnlineReconnectEvent(OnlineReconnectState.events.RESET);
        },
    });
}

function _saveActionLog(action, data, options = {}) {
    try {
        const gameState = onlineGameRuntimeSnapshot();
        const log = _readOnlineActionLog();
        const hasExplicitSeq = Number.isInteger(options.seq);
        const seq = hasExplicitSeq ? options.seq : _nextOnlineActionSeq(log);
        const plan = OnlineActionLog.planAppend({
            log,
            action,
            data,
            seq,
            hasExplicitSeq,
            actionLogLimit: ONLINE_ACTION_LOG_LIMIT,
            hasGame: !!gameState.game,
            options,
        });
        OnlineActionLog.executeAppend(plan, {
            patchGameStart(actionSeq) {
                _writeOnlineGameStartPatch({ actionSeq });
            },
            buildCompactionSnapshot() {
                return buildOnlineSnapshot();
            },
            writeStateSnapshot(snapshot) {
                _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.stateSnapshot, snapshot);
            },
            removeRestoreAudit() {
                _removeOnlineRestoreStorageItem(ONLINE_STORAGE_KEYS.restoreAudit);
            },
            writeRestoreAudit(restoreAudit) {
                _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.restoreAudit, restoreAudit);
            },
            writeActionLog(nextLog) {
                _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.actionLog, nextLog);
            },
        });
    } catch(e) {}
}

function _normalizeOnlineActionLog(value) {
    return OnlinePayload.normalizeActionLog(value);
}

function _readOnlineActionLog() {
    return _normalizeOnlineActionLog(_readOnlineRoomStorageJson(ONLINE_STORAGE_KEYS.actionLog, []));
}

function _savePendingOutboundAction(action, data) {
    const session = onlineSessionSnapshot();
    const seq = _nextOnlineActionSeq();
    const clientActionId = _createOnlineClientActionId();
    const entry = OnlinePayload.buildPendingOutboundAction(
        action,
        data,
        session.myOriginalPlayerIndex,
        session.myRoomId,
        seq,
        clientActionId
    );
    const memoryKey = _normalizeOnlineRoomId(entry.roomId) || '';
    _pendingOutboundState.store(entry, memoryKey);
    try {
        _writeOnlineStorageJson(ONLINE_STORAGE_KEYS.pendingAction, entry);
        _writeOnlineRoomStorageJson(ONLINE_STORAGE_KEYS.pendingAction, entry, entry.roomId);
    } catch (e) {}
    return entry;
}

function _createOnlineClientActionId() {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function _readOnlineGameStartPayload() {
    return _readOnlineRoomStorageJson(ONLINE_STORAGE_KEYS.gameStart, null);
}

function _writeOnlineGameStartPatch(patch) {
    try {
        const payload = _readOnlineGameStartPayload();
        if (!payload) return;
        Object.assign(payload, patch);
        _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.gameStart, payload);
    } catch (e) {}
}

function _currentOnlineActionSeq(log = null) {
    return _onlineActionSequenceController.current(
        _readOnlineGameStartPayload(),
        _readOnlineStateSnapshot(),
        log || _readOnlineActionLog()
    );
}

function _lastAppliedOnlineActionSeq(log = null) {
    return _onlineActionSequenceController.refreshLastApplied(
        _readOnlineStateSnapshot(),
        log || _readOnlineActionLog()
    );
}

function _setLastAppliedOnlineActionSeq(seq) {
    _onlineActionSequenceController.adopt(seq);
}

function _serverOnlineActionSeq(gameStartPayload, stateSnapshot, actionLog) {
    return OnlineRestoreRank.serverActionSeq(gameStartPayload, stateSnapshot, actionLog);
}

function _isOnlineRestoreRankAction(entry) {
    const actionRegistry = typeof GAME_ACTION_REGISTRY !== 'undefined'
        ? GAME_ACTION_REGISTRY
        : null;
    return OnlineRestoreRank.isRankAction(entry, actionRegistry);
}

function _onlineRestoreReplaySeq(stateSnapshot, actionLog) {
    const actionRegistry = typeof GAME_ACTION_REGISTRY !== 'undefined'
        ? GAME_ACTION_REGISTRY
        : null;
    return OnlineRestoreRank.replaySeq(stateSnapshot, actionLog, actionRegistry);
}

function _onlineRestoreRank(gameStartPayload, stateSnapshot, actionLog) {
    const actionRegistry = typeof GAME_ACTION_REGISTRY !== 'undefined'
        ? GAME_ACTION_REGISTRY
        : null;
    return OnlineRestoreRank.build(gameStartPayload, stateSnapshot, actionLog, actionRegistry);
}

function _isOnlineRestoreRankNewer(localRank, serverRank) {
    return OnlineRestoreRank.isNewer(localRank, serverRank);
}

function _nextOnlineActionSeq(log = null) {
    const seq = OnlineActionSequence.next(_currentOnlineActionSeq(log));
    _writeOnlineGameStartPatch({ actionSeq: seq });
    return seq;
}

function _normalizePendingOutboundAction(entry) {
    return OnlinePayload.normalizePendingOutboundAction(entry, {
        isKnownAction: _isKnownOnlineGameAction,
        normalizeRoomId: _normalizeOnlineRoomId,
    });
}

function _readPendingOutboundAction() {
    const currentRoomKey = _normalizeOnlineRoomId(onlineSessionSnapshot().myRoomId) || '';
    const memoryEntry = _pendingOutboundState.read(currentRoomKey);
    if (memoryEntry) return memoryEntry;
    const stored = _normalizePendingOutboundAction(_readOnlineRoomStorageJson(ONLINE_STORAGE_KEYS.pendingAction, null));
    if (stored) {
        const storedRoomKey = _normalizeOnlineRoomId(stored.roomId) || currentRoomKey;
        _pendingOutboundState.store(stored, storedRoomKey);
        return stored;
    }
    return null;
}

function _readPendingOutboundActionForCurrentSession(options = {}) {
    const entry = _readPendingOutboundAction();
    const gateOptions = options.requireRoomId
        ? Object.assign({}, options, { requireExplicitRoomId: true })
        : options;
    return _pendingOutboundActionBelongsToCurrentSession(entry, gateOptions) ? entry : null;
}

function _clearPendingOutboundAction(roomId = onlineSessionSnapshot().myRoomId) {
    const memoryKey = _normalizeOnlineRoomId(roomId) || '';
    _pendingOutboundState.remove(memoryKey);
    try {
        _removeOnlineStorageItem(ONLINE_STORAGE_KEYS.pendingAction);
        _removeOnlineRoomStorageItem(ONLINE_STORAGE_KEYS.pendingAction, roomId);
    } catch (e) {}
}

function _pendingOutboundActionBelongsToCurrentSession(entry, options = {}) {
    return OnlinePayload.pendingBelongsToSession(entry, onlineSessionSnapshot().myRoomId, Object.assign({
        normalizeRoomId: _normalizeOnlineRoomId,
    }, options));
}

function _clearPendingOutboundActionForCurrentSession(options = {}) {
    const entry = _readPendingOutboundAction();
    if (_pendingOutboundActionBelongsToCurrentSession(entry, options)) {
        _clearPendingOutboundAction();
    }
}

function _sameOnlineActionEntry(a, b) {
    return OnlinePayload.sameActionEntry(a, b);
}

function _acceptedClientActionMatchesPending(ref, pending) {
    return OnlinePayload.acceptedClientActionMatchesPending(ref, pending);
}

function _shouldClearPendingForAcceptedAction(accepted, pending) {
    return OnlinePayload.shouldClearPendingForAcceptedAction(accepted, pending);
}

function _selectOnlineRestoreQueueStateTransition(pureTransition, legacyTransition) {
    const requested = isOnlineRestoreQueueStateAuthorityEnabled();
    const helperAvailable = typeof OnlineRestoreQueueState !== 'undefined' &&
        typeof OnlineRestoreQueueState.selectTransition === 'function';
    if (!helperAvailable) {
        return Object.freeze({
            transition: legacyTransition,
            source: requested ? 'legacy-fallback' : 'legacy',
            matched: false,
            fallbackReason: requested ? 'restore-queue-state-helper-unavailable' : '',
        });
    }
    return OnlineRestoreQueueState.selectTransition(
        pureTransition,
        legacyTransition,
        { authorityEnabled: requested }
    );
}

function _readOnlineRestoreEventQueue() {
    const requested = isOnlineRestoreQueueStoreReadAuthorityEnabled();
    const queue = _onlineRestoreEventQueueStore.read();
    const selection = OnlineRestoreQueueState.selectRead(
        queue,
        queue,
        { authorityEnabled: requested }
    );
    _onlineRestoreQueueDiagnostics.write(_onlineRestoreQueueDiagnosticKeys.STORE_READ, Object.freeze({
        source: selection.source,
        matched: selection.matched,
        fallbackReason: selection.fallbackReason,
    }));
    return selection.queue;
}

function _recordOnlineRestoreQueueStoreWriteSelection(selection) {
    _onlineRestoreQueueDiagnostics.write(_onlineRestoreQueueDiagnosticKeys.STORE_WRITE, Object.freeze({
        source: selection.source,
        matched: selection.matched,
        fallbackReason: selection.fallbackReason,
    }));
    return selection;
}

function _selectOnlineRestoreQueueStoreWrite(storeQueue, legacyQueue) {
    return _recordOnlineRestoreQueueStoreWriteSelection(
        OnlineRestoreQueueState.selectWrite(storeQueue, legacyQueue, {
            authorityEnabled: isOnlineRestoreQueueStoreWriteAuthorityEnabled(),
        })
    );
}

function _replaceOnlineRestoreEventQueue(queue) {
    const storeQueue = _onlineRestoreEventQueueStore.replace(queue);
    _selectOnlineRestoreQueueStoreWrite(storeQueue, storeQueue);
    return _readOnlineRestoreEventQueue();
}

function _appendOnlineRestoreEventQueue(event) {
    const storeQueue = _onlineRestoreEventQueueStore.append(event);
    _selectOnlineRestoreQueueStoreWrite(storeQueue, storeQueue);
    return _readOnlineRestoreEventQueue();
}

function _clearOnlineRestoreEventQueue() {
    const legacyTransition = Object.freeze({ overflow: false, queue: [] });
    const pureTransition = typeof OnlineRestoreQueueState !== 'undefined' &&
        typeof OnlineRestoreQueueState.planClear === 'function'
        ? OnlineRestoreQueueState.planClear()
        : null;
    const selection = _selectOnlineRestoreQueueStateTransition(pureTransition, legacyTransition);
    _onlineRestoreQueueDiagnostics.write(_onlineRestoreQueueDiagnosticKeys.STATE, Object.freeze({
        source: selection.source,
        matched: selection.matched,
        fallbackReason: selection.fallbackReason,
    }));
    _replaceOnlineRestoreEventQueue(
        selection.source === 'pure-transition' ? selection.transition.queue : []
    );
    return selection;
}

function _queueOnlineEventDuringRestore(type, payload) {
    if (!_onlineRestoreLifecycleController.isInProgress() && !_onlineRestoreLifecycleController.isQuarantined()) return false;
    const event = { type, payload, generation: _onlineRestoreLifecycleController.getGeneration() };
    const queue = _readOnlineRestoreEventQueue();
    const overflow = queue.length >= ONLINE_RESTORE_EVENT_QUEUE_LIMIT;
    const legacyTransition = Object.freeze({
        overflow,
        queue: overflow ? queue : queue.concat([event]),
    });
    const pureTransition = typeof OnlineRestoreQueueState !== 'undefined' &&
        typeof OnlineRestoreQueueState.planEnqueue === 'function'
        ? OnlineRestoreQueueState.planEnqueue(
            queue,
            event,
            ONLINE_RESTORE_EVENT_QUEUE_LIMIT
        )
        : null;
    const selection = _selectOnlineRestoreQueueStateTransition(pureTransition, legacyTransition);
    _onlineRestoreQueueDiagnostics.write(_onlineRestoreQueueDiagnosticKeys.STATE, Object.freeze({
        source: selection.source,
        matched: selection.matched,
        fallbackReason: selection.fallbackReason,
    }));
    if (selection.transition.overflow) {
        _abortOnlineRestore(_onlineRestoreLifecycleController.getGeneration(), '復元中の操作が多すぎるため、状態を再同期しています...', []);
        return true;
    }
    if (selection.source === 'pure-transition') {
        _replaceOnlineRestoreEventQueue(selection.transition.queue);
    } else {
        _appendOnlineRestoreEventQueue(event);
    }
    return true;
}


function _legacyOnlineRestoreAbortPlan(generation, statusMessage, queuedEvents = null) {
    return Object.freeze({
        abort: generation === _onlineRestoreLifecycleController.getGeneration(),
        statusMessage,
        queuedEvents: Array.isArray(queuedEvents) ? queuedEvents : [],
    });
}

function _onlineRestoreAbortPlanSelection(generation, statusMessage, queuedEvents = null) {
    const legacyPlan = _legacyOnlineRestoreAbortPlan(generation, statusMessage, queuedEvents);
    const requested = isOnlineRestoreAbortPlanAuthorityEnabled();
    const stateSelection = OnlineReconnectState.selectAuthorityState(
        _onlineReconnectController.snapshot(),
        { eventAuthorityEnabled: requested }
    );
    const stateReady = stateSelection.source === 'event';
    const selected = OnlinePayload.selectRestoreAbortPlan(
        generation,
        _onlineRestoreLifecycleController.getGeneration(),
        statusMessage,
        queuedEvents,
        legacyPlan,
        { abortPlanAuthorityEnabled: requested && stateReady }
    );
    if (!requested || stateReady) return selected;
    return Object.freeze({
        ...selected,
        source: 'legacy-fallback',
        fallbackReason: stateSelection.fallbackReason || 'state-authority-unavailable',
    });
}

function _onlineRestoreAbortEffectAuthoritySelection(planSelection) {
    const enabled = isOnlineRestoreAbortEffectAuthorityEnabled();
    const purePlanReady = planSelection.source === 'pure-plan';
    const helperAvailable = typeof OnlineRestoreAbort !== 'undefined' &&
        typeof OnlineRestoreAbort.execute === 'function';
    const useExecutor = enabled && purePlanReady && helperAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!purePlanReady ? 'abort-plan-not-authoritative' : 'executor-unavailable'),
    });
}

function _runOnlineRestoreAbortEffectsLegacy(plan) {
    _finishOnlineRestore();
    _quarantineOnlineRestore();
    _replaceOnlineRestoreEventQueue(plan.queuedEvents);
    setOnlineReconnectLegacyFlag(true);
    if (plan.statusMessage) onlineDomEffects.setStatusText(plan.statusMessage);
    if (!_emitOnlineRejoinRequest()) _scheduleRejoinRetry();
}

function _runOnlineRestoreAbortEffects(planSelection) {
    const effectSelection = _onlineRestoreAbortEffectAuthoritySelection(planSelection);
    _onlineDiagnosticSelections.onlineRestoreAbortEffectSelection = effectSelection;
    if (effectSelection.source !== 'executor') {
        _runOnlineRestoreAbortEffectsLegacy(planSelection.plan);
        return effectSelection;
    }
    OnlineRestoreAbort.execute(planSelection.plan, {
        finishRestore: () => { _finishOnlineRestore(); },
        quarantineRestore: () => { _quarantineOnlineRestore(); },
        replaceQueue: queue => { _replaceOnlineRestoreEventQueue(queue); },
        markReconnecting: () => setOnlineReconnectLegacyFlag(true),
        updateStatus: message => {
            if (message) onlineDomEffects.setStatusText(message);
        },
        requestRejoin: () => _emitOnlineRejoinRequest(),
        scheduleRetry: () => _scheduleRejoinRetry(),
    });
    return effectSelection;
}

function _abortOnlineRestore(generation, statusMessage, queuedEvents = null) {
    const planSelection = _onlineRestoreAbortPlanSelection(generation, statusMessage, queuedEvents);
    _onlineDiagnosticSelections.onlineRestoreAbortPlanSelection = planSelection;
    if (!planSelection.plan.abort) return;
    _runOnlineRestoreAbortEffects(planSelection);
}

function _legacyOnlineRestoreEventFlushPlan(queue, generation, restoredThroughSeq) {
    const events = Array.isArray(queue) ? queue : [];
    const plan = [];
    for (let index = 0; index < events.length; index++) {
        const event = events[index];
        if (!event || event.generation !== generation) continue;
        if (Number.isInteger(event.payload?.seq) && event.payload.seq <= restoredThroughSeq) continue;
        plan.push(Object.freeze({ event, index }));
    }
    return Object.freeze(plan);
}

function _onlineRestoreEventFlushPlanSelection(queue, generation, restoredThroughSeq) {
    const legacyPlan = _legacyOnlineRestoreEventFlushPlan(queue, generation, restoredThroughSeq);
    return OnlinePayload.selectRestoreEventFlushPlan(
        queue,
        generation,
        restoredThroughSeq,
        legacyPlan,
        { queuePlanAuthorityEnabled: isOnlineReconnectQueuePlanAuthorityEnabled() }
    );
}

function _legacyExecuteOnlineRestoreQueuePlan(plan, handlers) {
    for (const entry of plan) {
        const event = entry.event;
        const handler = handlers[event.type];
        if (typeof handler === 'function' && handler(event.payload) === false) {
            return Object.freeze({ ok: false, failedIndex: entry.index });
        }
    }
    return Object.freeze({ ok: true, failedIndex: -1 });
}

function _executeOnlineRestoreQueuePlan(flushSelection, handlers) {
    const authorityEnabled = isOnlineReconnectQueueEffectAuthorityEnabled();
    const purePlanReady = flushSelection.source === 'pure-plan';
    const helperAvailable = typeof OnlineRestoreQueue !== 'undefined' &&
        typeof OnlineRestoreQueue.executePlan === 'function';
    const usePureExecutor = authorityEnabled && purePlanReady && helperAvailable;
    _onlineRestoreQueueDiagnostics.write(_onlineRestoreQueueDiagnosticKeys.EFFECT, Object.freeze({
        source: usePureExecutor ? 'pure-executor' : (authorityEnabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: usePureExecutor || !authorityEnabled
            ? ''
            : (!purePlanReady ? 'queue-plan-not-authoritative' : 'executor-unavailable'),
    }));
    return usePureExecutor
        ? OnlineRestoreQueue.executePlan(flushSelection.plan, handlers)
        : _legacyExecuteOnlineRestoreQueuePlan(flushSelection.plan, handlers);
}

function _flushOnlineRestoreEvents(generation, restoredThroughSeq, handlers) {
    if (generation !== _onlineRestoreLifecycleController.getGeneration()) return false;
    const legacyDrainTransition = Object.freeze({
        overflow: false,
        queue: [],
        drainedQueue: _readOnlineRestoreEventQueue(),
    });
    const pureDrainTransition = typeof OnlineRestoreQueueState !== 'undefined' &&
        typeof OnlineRestoreQueueState.planDrain === 'function'
        ? OnlineRestoreQueueState.planDrain(_readOnlineRestoreEventQueue())
        : null;
    const drainSelection = _selectOnlineRestoreQueueStateTransition(
        pureDrainTransition,
        legacyDrainTransition
    );
    _onlineRestoreQueueDiagnostics.write(_onlineRestoreQueueDiagnosticKeys.STATE, Object.freeze({
        source: drainSelection.source,
        matched: drainSelection.matched,
        fallbackReason: drainSelection.fallbackReason,
    }));
    const queuedEvents = drainSelection.transition.drainedQueue;
    _replaceOnlineRestoreEventQueue(
        drainSelection.source === 'pure-transition' ? drainSelection.transition.queue : []
    );
    _finishOnlineRestore();
    _startOnlineRestoreFlush();
    try {
        const flushSelection = _onlineRestoreEventFlushPlanSelection(
            queuedEvents,
            generation,
            restoredThroughSeq
        );
        _onlineRestoreQueueDiagnostics.write(_onlineRestoreQueueDiagnosticKeys.PLAN, Object.freeze({
            source: flushSelection.source,
            matched: flushSelection.matched,
            fallbackReason: flushSelection.fallbackReason,
        }));
        const execution = _executeOnlineRestoreQueuePlan(flushSelection, handlers);
        if (!execution.ok) {
            const legacyFailureTransition = Object.freeze({
                overflow: false,
                queue: queuedEvents.slice(execution.failedIndex),
            });
            const pureFailureTransition = typeof OnlineRestoreQueueState !== 'undefined' &&
                typeof OnlineRestoreQueueState.planFailureRemainder === 'function'
                ? OnlineRestoreQueueState.planFailureRemainder(queuedEvents, execution.failedIndex)
                : null;
            const failureSelection = _selectOnlineRestoreQueueStateTransition(
                pureFailureTransition,
                legacyFailureTransition
            );
            _onlineRestoreQueueDiagnostics.write(_onlineRestoreQueueDiagnosticKeys.STATE, Object.freeze({
                source: failureSelection.source,
                matched: failureSelection.matched,
                fallbackReason: failureSelection.fallbackReason,
            }));
            _abortOnlineRestore(
                generation,
                '操作の適用に失敗したため、状態を再同期しています...',
                failureSelection.transition.queue
            );
            return false;
        }
    } finally {
        _finishOnlineRestoreFlush();
    }
    onlineClientEffects.render();
    onlineClientEffects.scheduleCpu();
    _clearOnlineRestoreQuarantine();
    return true;
}

function _appendPendingForRestore(actionLog, pending) {
    return OnlinePayload.appendPendingForRestore(actionLog, pending, {
        currentRoomId: onlineSessionSnapshot().myRoomId,
        normalizeRoomId: _normalizeOnlineRoomId,
    });
}

function _canResendPendingOutboundAction(pending) {
    const gameState = onlineGameRuntimeSnapshot();
    const session = onlineSessionSnapshot();
    return OnlinePayload.canResendPendingOutboundAction(pending, {
        currentRoomId: session.myRoomId,
        normalizeRoomId: _normalizeOnlineRoomId,
        game: gameState.game,
        originalPlayerIndex: session.myOriginalPlayerIndex,
        playerIndex: session.myPlayerIndex,
        cpuPlayers: gameState.cpuPlayers,
        isRoomHost: session.isRoomHost,
    });
}

function buildOnlineSnapshot() {
    const gameState = onlineGameRuntimeSnapshot();
    if (!gameState.game) return null;
    return GameSnapshot.serializeGameState(gameState.game, SHOP_STOCK, {
        undoState: gameState.undoState,
        actionSeq: _currentOnlineActionSeq(),
        logLimit: ONLINE_SNAPSHOT_LOG_LIMIT,
        pendingActionsFor: (typeof GameManager !== 'undefined' &&
                typeof GameManager.serializedPendingActionsFor === 'function')
            ? GameManager.serializedPendingActionsFor
            : () => [],
    });
}

function buildOnlineUndoSnapshot() {
    const currentGame = onlineGameRuntimeSnapshot().game;
    if (!currentGame) return null;
    return GameSnapshot.serializeUndoState(currentGame, SHOP_STOCK, ONLINE_SNAPSHOT_LOG_LIMIT);
}

function saveOnlineSession() {
    const session = onlineSessionSnapshot();
    if (!session.myRoomId || session.myOriginalPlayerIndex < 0 || !session.myPlayerName || !session.reconnectToken) return;
    try {
        _writeOnlineSessionStorageJson({
            roomId: session.myRoomId,
            playerIndex: session.myOriginalPlayerIndex,
            playerName: session.myPlayerName,
            reconnectToken: session.reconnectToken,
            isRoomHost: session.isRoomHost,
        });
        onlineClientEffects.updateResumeButton();
    } catch (e) {}
}

function _applyOnlineHostPayload(gameStartPayload, hostPlayerIndex, hostEpoch) {
    if (!gameStartPayload || typeof gameStartPayload !== 'object') return gameStartPayload;
    if (Number.isInteger(hostPlayerIndex)) {
        gameStartPayload.hostPlayerIndex = hostPlayerIndex;
    }
    if (Number.isInteger(hostEpoch)) {
        gameStartPayload.hostEpoch = hostEpoch;
    } else if (!Number.isInteger(gameStartPayload.hostEpoch)) {
        gameStartPayload.hostEpoch = 0;
    }
    return gameStartPayload;
}

function _setOnlineHostState(hostPlayerIndex) {
    return OnlineRuntimeState.runtime.setHost(
        Number.isInteger(hostPlayerIndex) && hostPlayerIndex === onlineSessionSnapshot().myOriginalPlayerIndex
    ).isRoomHost;
}

function _persistOnlineHostState(hostPlayerIndex, hostEpoch) {
    const runtimeSession = onlineSessionSnapshot();
    const session = _readOnlineStorageJson(ONLINE_SESSION_STORAGE_KEY, null);
    if (session && typeof session === 'object') {
        session.isRoomHost = runtimeSession.isRoomHost;
        session.reconnectToken = runtimeSession.reconnectToken || session.reconnectToken || '';
        _writeOnlineSessionStorageJson(session, session.roomId || runtimeSession.myRoomId);
    }
    try {
        const gameStartPayload = _readOnlineGameStartPayload();
        if (gameStartPayload) {
            if (Number.isInteger(hostPlayerIndex)) {
                gameStartPayload.hostPlayerIndex = hostPlayerIndex;
            }
            gameStartPayload.hostEpoch = Number.isInteger(hostEpoch)
                ? hostEpoch
                : (Number.isInteger(gameStartPayload.hostEpoch) ? gameStartPayload.hostEpoch + 1 : 1);
            _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.gameStart, gameStartPayload);
        }
    } catch (_) {}
}

const onlineInboundActionRuntime = OnlineInboundActionRuntime.createRuntime({
    applyReplayedAction: (action, data) => applyReplayedAction(action, data),
    clearPending: () => _clearPendingOutboundAction(),
    decodeAction: payload => decodeOnlineGameSchemaAction(payload),
    flags: {
        incoming: {
            plan: isIncomingGameActionPlanAuthorityEnabled,
            decode: isIncomingGameActionDecodeEffectAuthorityEnabled,
            apply: isIncomingGameActionApplyEffectAuthorityEnabled,
            gap: isIncomingGameActionGapEffectAuthorityEnabled,
            noGame: isIncomingGameActionNoGameEffectAuthorityEnabled,
            commit: isIncomingGameActionCommitEffectAuthorityEnabled,
        },
        accepted: {
            plan: isAcceptedGameActionPlanAuthorityEnabled,
            decode: isAcceptedGameActionDecodeEffectAuthorityEnabled,
            apply: isAcceptedGameActionApplyEffectAuthorityEnabled,
            gap: isAcceptedGameActionGapEffectAuthorityEnabled,
            noGame: isAcceptedGameActionNoGameEffectAuthorityEnabled,
            commit: isAcceptedGameActionCommitEffectAuthorityEnabled,
        },
    },
    getGameState: onlineGameRuntimeSnapshot,
    getReconnectSnapshot: () => _onlineReconnectController.snapshot(),
    lastAppliedSeq: () => _lastAppliedOnlineActionSeq(),
    payload: OnlinePayload,
    queueDuringRestore: (type, payload) => _queueOnlineEventDuringRestore(type, payload),
    readPending: () => _readPendingOutboundActionForCurrentSession(),
    reconnectState: OnlineReconnectState,
    recordSelection(key, selection) {
        _onlineDiagnosticSelections[key] = selection;
    },
    runApplyFailure: (error, plan, enabled, record) =>
        _runOnlineActionApplyFailureEffects(error, plan, enabled, record),
    runCommit: (...args) => _runOnlineActionCommitEffects(...args),
    runDecodeFailure: (plan, enabled, record) =>
        _runOnlineDecodeFailureEffects(plan, enabled, record),
    runGap: (message, plan, enabled, record) =>
        _runOnlineActionGapEffects(message, plan, enabled, record),
    runNoGame: (message, requestRejoin, plan, enabled, record) =>
        _runOnlineActionNoGameEffects(message, requestRejoin, plan, enabled, record),
    setActionFlight: value => _setOnlineActionInFlight(value),
    shouldClearPending: (accepted, pending) =>
        _shouldClearPendingForAcceptedAction(accepted, pending),
});

// オンライン対戦（Socket.IO）
function initSocket() {
    if (onlineSessionSnapshot().socket) return true;
    if (typeof io !== 'function') {
        const message = 'オンライン機能を読み込めませんでした。サーバーURLから開き直してください。';
        onlineClientEffects.showNotice(message);
        onlineDomEffects.setStatusText(`❌ ${message}`);
        if (onlineSocketUnavailableReportController.claim()) {
            if (typeof markClientFlowCheckpoint === 'function') {
                markClientFlowCheckpoint('socket-io-unavailable', {
                    href: typeof location !== 'undefined' && location.href ? location.href : '',
                    origin: typeof location !== 'undefined' && location.origin ? location.origin : '',
                    hasServiceWorkerController: !!(typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller),
                });
            }
            if (typeof reportClientError === 'function') {
                reportClientError({
                    source: 'socket-io-unavailable',
                    message: 'Socket.IO client script is unavailable',
                    stack: 'href=' + ((typeof location !== 'undefined' && location.href) || '') + '\norigin=' + ((typeof location !== 'undefined' && location.origin) || ''),
                });
            }
        }
        return false;
    }
    const connectedSession = OnlineRuntimeState.runtime.setSocket(io());
    const currentSocket = connectedSession.socket;
    const hostlessEvents = OnlinePayload.hostlessRestoreEvents;
    const socketEvents = OnlineSocketRegistry.createBinder(currentSocket, {
        hostlessCollect: hostlessEvents.COLLECT,
        hostlessConfirmation: hostlessEvents.CONFIRMATION,
        hostlessStatus: hostlessEvents.STATUS,
        hostlessApproved: hostlessEvents.APPROVED,
        appError: APP_ERROR_EVENT,
    });

    const handleGameAction = onlineInboundActionRuntime.handleGameAction;
    const handleActionAccepted = onlineInboundActionRuntime.handleActionAccepted;

    const handleHostChanged = ({ newHostPlayerIndex, hostEpoch }) => {
        if (_queueOnlineEventDuringRestore('hostChanged', { newHostPlayerIndex, hostEpoch })) return;
        return _runOnlineHostChangedEffects(newHostPlayerIndex, hostEpoch);
    };
    const onlineLobbyStartRuntime = OnlineLobbyStartRuntime.createRuntime({
        abortRestore: (generation, message) => _abortOnlineRestore(generation, message),
        acceptRoom: value => OnlineRuntimeState.runtime.acceptRoom(value),
        acceptSchema: selection => acceptsNegotiatedGameSchema(selection),
        applyHostPayload: (payload, hostPlayerIndex, hostEpoch) =>
            _applyOnlineHostPayload(payload, hostPlayerIndex, hostEpoch),
        clearHostlessState: () => _hostlessRestoreState.clear(),
        clearPending: () => _clearPendingOutboundAction(),
        clearRejoinRetry: () => _clearRejoinRetry(),
        clearRestoreEventQueue: () => _clearOnlineRestoreEventQueue(),
        clearRestoreQuarantine: () => _clearOnlineRestoreQuarantine(),
        console,
        defaultLandmarks: () => Player.landmarkNames(),
        finishLobbyRequest: kind => finishOnlineLobbyRequest(kind),
        flushRestoreEvents: (generation, sequence, handlers) =>
            _flushOnlineRestoreEvents(generation, sequence, handlers),
        getGame: () => onlineGameRuntimeSnapshot().game,
        getRestoreEventHandlers: () => ({
            gameAction: handleGameAction,
            actionAccepted: handleActionAccepted,
            hostChanged: handleHostChanged,
        }),
        getRestoreGeneration: () => _onlineRestoreLifecycleController.getGeneration(),
        getSession: onlineSessionSnapshot,
        incrementRestoreGeneration: () => _incrementOnlineRestoreGeneration(),
        initGame: (names, settings, order) => initOnlineGame(names, settings, order),
        logTypes: LOG_TYPES,
        notifyLifecycleStart: () => onlineClientEffects.notifyLifecycleStart(),
        observeReconnect: event => _observeOnlineReconnectEvent(event),
        preloadModels: (playerCount, settings) =>
            preloadOnlineRlModelsForSettings(playerCount, settings),
        reconnectEvents: OnlineReconnectState.events,
        removeRestoreItem: key => _removeOnlineRestoreStorageItem(key),
        replaceActionSequence: sequence => _onlineActionSequenceController.replace(sequence),
        replaceEnabledCards: values => replaceEnabledCardSelection(values),
        replaceEnabledLandmarks: values => replaceEnabledLandmarkSelection(values),
        resetReconnectCompletion: () => _onlineReconnectCompletionController.reset(),
        resetUiLocks: reason => onlineClientEffects.resetUiLocks(reason),
        restoreKeys: ONLINE_STORAGE_KEYS,
        restoreSchemaVersion: ONLINE_RESTORE_SCHEMA_VERSION,
        saveSession: () => saveOnlineSession(),
        setActionFlight: value => _setOnlineActionInFlight(value),
        setCpuSpeed: value => GameSetupState.runtime.setCpuSpeed(value),
        setHostState: hostPlayerIndex => _setOnlineHostState(hostPlayerIndex),
        setOnline: value => OnlineRuntimeState.runtime.setOnline(value),
        setSchema: selection => onlineSchemaSelectionController.set(selection),
        setStatusHtml: html => onlineDomEffects.setStatusHtml(html),
        setStatusText: message => onlineDomEffects.setStatusText(message),
        showGame: () => onlineDomEffects.showGame(),
        startRestore: () => _startOnlineRestore(),
        writeRestoreJson: (key, value) => _writeOnlineRestoreStorageJson(key, value),
    });

    socketEvents.on(
        OnlineSocketRegistry.keys.ROOM_CREATED,
        payload => onlineLobbyStartRuntime.handleRoomCreated(payload)
    );
    socketEvents.on(
        OnlineSocketRegistry.keys.ROOM_JOINED,
        payload => onlineLobbyStartRuntime.handleRoomJoined(payload)
    );
    socketEvents.on(
        OnlineSocketRegistry.keys.PLAYER_LIST,
        players => onlineLobbyStartRuntime.handlePlayerList(players)
    );

    socketEvents.on(OnlineSocketRegistry.keys.GAME_START, payload => {
        return onlineLobbyStartRuntime.handle(payload);
    });

    socketEvents.on(OnlineSocketRegistry.keys.GAME_ACTION, handleGameAction);
    socketEvents.on(OnlineSocketRegistry.keys.ACTION_ACCEPTED, handleActionAccepted);

    socketEvents.on(OnlineSocketRegistry.keys.REJOIN_DATA, rejoinPayload => {
        const decodedSnapshotPayload = decodeOnlineGameSchemaSnapshotPayload(rejoinPayload);
        if (!decodedSnapshotPayload.ok) {
            onlineDomEffects.setStatusText(
                '復元データのSnapshot schema versionに対応していません。再接続してください。'
            );
            return;
        }
        const {
            gameStartPayload, stateSnapshot, actionLog, acceptedClientActions,
            playerIndex, hostPlayerIndex, hostEpoch, restoreAudit, provisionalRestore,
        } = decodedSnapshotPayload.value;
        if (!gameStartPayload || !acceptsNegotiatedGameSchema(gameStartPayload.gameSchema)) {
            onlineDomEffects.setStatusText('復元データのschema versionに対応していません。アプリを更新してください。');
            return;
        }
        onlineSchemaSelectionController.set(gameStartPayload.gameSchema);
        const shouldCarryRestoreEvents = _onlineRestoreLifecycleController.isInProgress() || _onlineRestoreLifecycleController.isQuarantined();
        const carriedEvents = shouldCarryRestoreEvents ? _readOnlineRestoreEventQueue().slice() : [];
        const restoreGeneration = _incrementOnlineRestoreGeneration();
        _startOnlineRestore();
        _observeOnlineReconnectEvent(OnlineReconnectState.events.RESTORE_STARTED);
        _applyOnlineReconnectLifecycleStatusEffectAuthority(
            OnlineReconnectState.events.RESTORE_STARTED
        );
        _clearOnlineRestoreQuarantine();
        const legacyCarryTransition = Object.freeze({
            overflow: false,
            queue: carriedEvents.map(event => ({
                type: event.type,
                payload: event.payload,
                generation: restoreGeneration,
            })),
        });
        const pureCarryTransition = typeof OnlineRestoreQueueState !== 'undefined' &&
            typeof OnlineRestoreQueueState.planCarry === 'function'
            ? OnlineRestoreQueueState.planCarry(
                _readOnlineRestoreEventQueue(),
                shouldCarryRestoreEvents,
                restoreGeneration
            )
            : null;
        const carrySelection = _selectOnlineRestoreQueueStateTransition(
            pureCarryTransition,
            legacyCarryTransition
        );
        _onlineRestoreQueueDiagnostics.write(_onlineRestoreQueueDiagnosticKeys.STATE, Object.freeze({
            source: carrySelection.source,
            matched: carrySelection.matched,
            fallbackReason: carrySelection.fallbackReason,
        }));
        _replaceOnlineRestoreEventQueue(carrySelection.transition.queue);
        _clearRejoinRetry();
        _hostlessRestoreState.clear();
        const { playerNames, playerSettings: ps, cpuSpeed: cs, playerOrder, enabledCards: ec, enabledLandmarks: el } = gameStartPayload;
        const replayActionLog = _normalizeOnlineActionLog(actionLog);
        const restoredThroughSeq = _serverOnlineActionSeq(gameStartPayload, stateSnapshot, replayActionLog);
        const localBundle = _readLocalRestoreBundle();
        const ownsLocalHostBundle = !!localBundle &&
            localBundle.gameStartPayload.hostPlayerIndex === onlineSessionSnapshot().myOriginalPlayerIndex;
        const localRank = ownsLocalHostBundle
            ? _onlineRestoreRank(
                localBundle.gameStartPayload,
                localBundle.stateSnapshot,
                localBundle.actionLog
            )
            : null;
        const localOfferServerRank = ownsLocalHostBundle
            ? _onlineRestoreRank(gameStartPayload, stateSnapshot, replayActionLog)
            : null;
        const canOfferLocalHostBundle = ownsLocalHostBundle &&
            (hostPlayerIndex === onlineSessionSnapshot().myOriginalPlayerIndex ||
                localRank.hostEpoch > localOfferServerRank.hostEpoch);
        const shouldOfferLocalHostBundle = canOfferLocalHostBundle &&
            _isOnlineRestoreRankNewer(localRank, localOfferServerRank);
        const localHostOfferReasons = OnlineRestoreRank.localHostRestoreOfferReasons;
        const legacyLocalHostOfferPlan = Object.freeze({
            offer: shouldOfferLocalHostBundle,
            bundle: shouldOfferLocalHostBundle ? localBundle : null,
            reason: !ownsLocalHostBundle
                ? localHostOfferReasons.NOT_ORIGINAL_HOST_BUNDLE
                : (!canOfferLocalHostBundle
                    ? localHostOfferReasons.SERVER_HOST_AUTHORITY
                    : (shouldOfferLocalHostBundle
                        ? localHostOfferReasons.OFFER_NEWER_BUNDLE
                        : localHostOfferReasons.NOT_NEWER)),
        });
        _onlineDiagnosticSelections.localHostRestoreOfferPlanSelection =
            OnlineRestoreRank.selectLocalHostRestoreOfferPlan(
                localBundle,
                onlineSessionSnapshot().myOriginalPlayerIndex,
                hostPlayerIndex,
                localRank,
                localOfferServerRank,
                legacyLocalHostOfferPlan,
                { authorityEnabled: isLocalHostRestoreOfferPlanAuthorityEnabled() }
            );
        if (_onlineDiagnosticSelections.localHostRestoreOfferPlanSelection.plan.offer) {
            setOnlineReconnectLegacyFlag(true);
            onlineDomEffects.setStatusText('♻️ より新しいローカル復元データをサーバーへ送信しています...');
            _sendRecreateRoomFromBundle(
                _onlineDiagnosticSelections.localHostRestoreOfferPlanSelection.plan.bundle
            );
            return;
        }
        gameStartPayload.schemaVersion = ONLINE_RESTORE_SCHEMA_VERSION;
        _applyOnlineHostPayload(gameStartPayload, hostPlayerIndex, hostEpoch);
        gameStartPayload.actionSeq = _serverOnlineActionSeq(gameStartPayload, stateSnapshot, replayActionLog);
        let pendingBeforeRejoin = _readPendingOutboundAction();
        if (pendingBeforeRejoin && !_pendingOutboundActionBelongsToCurrentSession(pendingBeforeRejoin, { requireRoomId: true })) {
            _clearPendingOutboundAction();
            pendingBeforeRejoin = null;
        }
        const serverRank = _onlineRestoreRank(gameStartPayload, stateSnapshot, replayActionLog);
        const pendingMatchedReplayLog = pendingBeforeRejoin &&
            replayActionLog.some(entry => _sameOnlineActionEntry(entry, pendingBeforeRejoin));
        const pendingCompactedIntoSnapshot = pendingBeforeRejoin &&
            typeof pendingBeforeRejoin.clientActionId !== 'string' &&
            Number.isInteger(pendingBeforeRejoin.seq) &&
            Number.isInteger(stateSnapshot?.actionSeq) &&
            stateSnapshot.actionSeq >= pendingBeforeRejoin.seq;
        const pendingAcceptedById = pendingBeforeRejoin && Array.isArray(acceptedClientActions) &&
            acceptedClientActions.some(ref => _acceptedClientActionMatchesPending(ref, pendingBeforeRejoin));
        const pendingAccepted = !pendingBeforeRejoin ||
            pendingMatchedReplayLog ||
            pendingCompactedIntoSnapshot ||
            pendingAcceptedById;
        const pendingReconciliationReasons = OnlinePayload.pendingReconciliationReasons;
        const legacyPendingReconciliationPlan = Object.freeze({
            accepted: pendingAccepted,
            reason: !pendingBeforeRejoin
                ? pendingReconciliationReasons.NO_PENDING
                : (pendingMatchedReplayLog
                    ? pendingReconciliationReasons.REPLAY_LOG
                    : (pendingCompactedIntoSnapshot
                        ? pendingReconciliationReasons.SNAPSHOT_COMPACTED
                        : (pendingAcceptedById
                            ? pendingReconciliationReasons.ACCEPTED_CLIENT_ACTION
                            : pendingReconciliationReasons.UNACCEPTED))),
        });
        _onlineDiagnosticSelections.pendingReconciliationPlanSelection = OnlinePayload.selectPendingReconciliationPlan(
            pendingBeforeRejoin,
            replayActionLog,
            stateSnapshot,
            acceptedClientActions,
            legacyPendingReconciliationPlan,
            { authorityEnabled: isPendingReconciliationPlanAuthorityEnabled() }
        );
        const acceptedPendingReconciliation =
            _onlineDiagnosticSelections.pendingReconciliationPlanSelection.plan.accepted;
        const defaultLandmarks = (el && el.length > 0) ? null : Player.landmarkNames();
        const resolvedEnabledLandmarks = (el && el.length > 0) ? el : defaultLandmarks;
        const resetUiLocksAvailable = onlineClientEffects.supportsResetUiLocks();
        const legacyRejoinPersistencePlan = Object.freeze({
            clearPendingOutboundAction: acceptedPendingReconciliation,
            cpuSpeed: cs || 1500,
            updateEnabledCards: !!ec,
            enabledCards: ec,
            enabledLandmarks: resolvedEnabledLandmarks,
            playerIndex,
            hostPlayerIndex,
            resetUiLocks: resetUiLocksAvailable,
        });
        _onlineDiagnosticSelections.onlineRejoinPersistencePlanSelection = OnlineRejoinPersistence.selectPlan({
            acceptedPending: acceptedPendingReconciliation,
            cpuSpeed: cs,
            enabledCards: ec,
            enabledLandmarks: el,
            defaultLandmarks,
            playerIndex,
            hostPlayerIndex,
            resetUiLocksAvailable,
        }, legacyRejoinPersistencePlan, {
            authorityEnabled: isOnlineRejoinPersistencePlanAuthorityEnabled(),
        });

        const persistRestoreBundle = () => {
            try {
                _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.gameStart, gameStartPayload);
                if (stateSnapshot) {
                    _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.stateSnapshot, stateSnapshot);
                } else {
                    _removeOnlineRestoreStorageItem(ONLINE_STORAGE_KEYS.stateSnapshot);
                }
                if (restoreAudit) {
                    _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.restoreAudit, restoreAudit);
                } else {
                    _removeOnlineRestoreStorageItem(ONLINE_STORAGE_KEYS.restoreAudit);
                }
                const storedActionLog = _readOnlineActionLog();
                const shouldKeepUnsignedFullLog = stateSnapshot &&
                    !restoreAudit &&
                    Array.isArray(storedActionLog) &&
                    storedActionLog.length > replayActionLog.length;
                const rejoinActionLogReasons = OnlinePayload.rejoinActionLogReasons;
                const legacyRejoinActionLogPlan = Object.freeze({
                    actionLog: shouldKeepUnsignedFullLog ? storedActionLog : replayActionLog,
                    reason: shouldKeepUnsignedFullLog
                        ? rejoinActionLogReasons.STORED_UNSIGNED_FULL_LOG
                        : rejoinActionLogReasons.SERVER_REPLAY_LOG,
                });
                _onlineDiagnosticSelections.rejoinActionLogPlanSelection =
                    OnlinePayload.selectRejoinActionLogPersistencePlan(
                        stateSnapshot,
                        restoreAudit,
                        storedActionLog,
                        replayActionLog,
                        legacyRejoinActionLogPlan,
                        { authorityEnabled: isRejoinActionLogPlanAuthorityEnabled() }
                    );
                _writeOnlineRestoreStorageJson(
                    ONLINE_STORAGE_KEYS.actionLog,
                    _onlineDiagnosticSelections.rejoinActionLogPlanSelection.plan.actionLog
                );
            } catch(e) {}
        };

        const persistRejoinBundleLegacy = plan => {
            _setOnlineActionInFlight(false);
            if (plan.clearPendingOutboundAction) _clearPendingOutboundAction();
            _clearRejoinRetry();
            GameSetupState.runtime.setCpuSpeed(plan.cpuSpeed);
            if (plan.updateEnabledCards) replaceEnabledCardSelection(plan.enabledCards);
            replaceEnabledLandmarkSelection(plan.enabledLandmarks);
            OnlineRuntimeState.runtime.setPlayerIndexes(plan.playerIndex);
            _setOnlineHostState(plan.hostPlayerIndex);
            persistRestoreBundle();
            saveOnlineSession();
            onlineClientEffects.invalidateCpuSchedule();
            if (plan.resetUiLocks) {
                onlineClientEffects.resetUiLocks('online-rejoin-reset-ui-locks');
            }
        };

        const persistRejoinBundle = () => {
            const planSelection = _onlineDiagnosticSelections.onlineRejoinPersistencePlanSelection;
            const effectSelection =
                _onlineRejoinPersistenceEffectAuthoritySelection(planSelection);
            _onlineDiagnosticSelections.onlineRejoinPersistenceEffectSelection = effectSelection;
            if (effectSelection.source !== 'executor') {
                persistRejoinBundleLegacy(planSelection.plan);
                return;
            }
            OnlineRejoinPersistence.execute(planSelection.plan, {
                clearActionFlight: () => _setOnlineActionInFlight(false),
                clearPendingOutboundAction: () => _clearPendingOutboundAction(),
                clearRetry: () => _clearRejoinRetry(),
                setCpuSpeed: value => { GameSetupState.runtime.setCpuSpeed(value); },
                setEnabledCards: values => { replaceEnabledCardSelection(values); },
                setEnabledLandmarks: values => { replaceEnabledLandmarkSelection(values); },
                setPlayerIndices: value => {
                    OnlineRuntimeState.runtime.setPlayerIndexes(value);
                },
                setHostState: value => _setOnlineHostState(value),
                persistRestoreBundle,
                saveSession: () => saveOnlineSession(),
                invalidateCpuSchedule: () => { onlineClientEffects.invalidateCpuSchedule(); },
                resetUiLocks: () => {
                    onlineClientEffects.resetUiLocks('online-rejoin-reset-ui-locks');
                },
            });
        };

        const restoreOnlineGame = () => {
            if (restoreGeneration !== _onlineRestoreLifecycleController.getGeneration()) return;
            persistRejoinBundle();
            onlineDomEffects.showGame();

            const legacyRestoreReplayPlan = Object.freeze({
                playerNames,
                playerSettings: ps,
                playerOrder,
                stateSnapshot,
                actionLog: replayActionLog,
                provisionalRestore: provisionalRestore === true,
            });
            _onlineDiagnosticSelections.onlineRestoreReplayPlanSelection = OnlineRestoreReplay.selectPlan({
                playerNames,
                playerSettings: ps,
                playerOrder,
                stateSnapshot,
                actionLog: replayActionLog,
                provisionalRestore,
            }, legacyRestoreReplayPlan, {
                authorityEnabled: isOnlineRestoreReplayPlanAuthorityEnabled(),
            });
            _onlineDiagnosticSelections.onlineRestoreReplayEffectSelection =
                _onlineRestoreReplayEffectAuthoritySelection(
                    _onlineDiagnosticSelections.onlineRestoreReplayPlanSelection
                );
            const restoreReplayUsesExecutor =
                _onlineDiagnosticSelections.onlineRestoreReplayEffectSelection.source === 'executor';
            const restoreReplayPlan = _onlineDiagnosticSelections.onlineRestoreReplayPlanSelection.plan;
            let restoredOk = false;
            try {
                // 既存ゲームをリプレイで再構築（render/scheduleCPUを抑制）
                if (restoreReplayUsesExecutor) {
                    OnlineRestoreReplay.execute(restoreReplayPlan, {
                        setReplaying: value => { OnlineRuntimeState.runtime.setReplaying(value); },
                        observeReplayStarted: () => {
                            _observeOnlineReconnectEvent(
                                OnlineReconnectState.events.REPLAY_STARTED
                            );
                        },
                        applyReplayStatus: () => {
                            _applyOnlineReconnectLifecycleStatusEffectAuthority(
                                OnlineReconnectState.events.REPLAY_STARTED
                            );
                        },
                        initGame: (names, settings, order) => {
                            initOnlineGame(names, settings, order);
                        },
                        restoreSnapshot: snapshot => restoreOnlineSnapshot(snapshot),
                        applyAction: (action, data) => applyReplayedAction(action, data),
                        addProvisionalLog: () => {
                            onlineGameRuntimeSnapshot().game.addLog(
                                LOG_TYPES.SYSTEM,
                                '⚠️ 参加者データの全一致確認により暫定復元しました'
                            );
                        },
                    });
                } else {
                    OnlineRuntimeState.runtime.setReplaying(true);
                    _observeOnlineReconnectEvent(OnlineReconnectState.events.REPLAY_STARTED);
                    _applyOnlineReconnectLifecycleStatusEffectAuthority(
                        OnlineReconnectState.events.REPLAY_STARTED
                    );
                    initOnlineGame(
                        restoreReplayPlan.playerNames,
                        restoreReplayPlan.playerSettings,
                        restoreReplayPlan.playerOrder
                    );
                    if (restoreReplayPlan.stateSnapshot) {
                        restoreOnlineSnapshot(restoreReplayPlan.stateSnapshot);
                    }
                    for (const { action, data } of restoreReplayPlan.actionLog) {
                        applyReplayedAction(action, data);
                    }
                    if (restoreReplayPlan.provisionalRestore) {
                        onlineGameRuntimeSnapshot().game.addLog(
                            LOG_TYPES.SYSTEM,
                            '⚠️ 参加者データの全一致確認により暫定復元しました'
                        );
                    }
                }
                restoredOk = true;
            } catch (e) {
                onlineDomEffects.setStatusText('❌ 復元データの再生に失敗しました。再接続してください。');
                setOnlineReconnectLegacyFlag(true);
            } finally {
                if (!restoreReplayUsesExecutor) OnlineRuntimeState.runtime.setReplaying(false);
            }
            if (!restoredOk) {
                _abortOnlineRestore(restoreGeneration, "復元データの再生に失敗しました。再接続して再試行します。");
                return;
            }
            const legacyRestoreActivationPlan = Object.freeze({
                restoredThroughSeq,
            });
            _onlineDiagnosticSelections.onlineRestoreActivationPlanSelection =
                OnlineRestoreActivation.selectPlan({
                    restoredThroughSeq,
                }, legacyRestoreActivationPlan, {
                    authorityEnabled: isOnlineRestoreActivationPlanAuthorityEnabled(),
                });
            _onlineDiagnosticSelections.onlineRestoreActivationEffectSelection =
                _onlineRestoreActivationEffectAuthoritySelection(
                    _onlineDiagnosticSelections.onlineRestoreActivationPlanSelection
                );
            const restoreActivationPlan =
                _onlineDiagnosticSelections.onlineRestoreActivationPlanSelection.plan;
            if (_onlineDiagnosticSelections.onlineRestoreActivationEffectSelection.source === 'executor') {
                const activationResult = OnlineRestoreActivation.execute(
                    restoreActivationPlan,
                    {
                        resetReconnectCompleted: () => {
                            _onlineReconnectCompletionController.reset();
                        },
                        activateOnlineGame: () => { OnlineRuntimeState.runtime.setOnline(true); },
                        clearReconnectFlag: () => {
                            setOnlineReconnectLegacyFlag(false);
                        },
                        resetPreviousCoins: () => { GameRuntimeState.runtime.setPreviousCoins(null); },
                        setAppliedSequence: value => {
                            _onlineActionSequenceController.replace(value);
                        },
                        flushRestoreEvents: value => _flushOnlineRestoreEvents(
                            restoreGeneration,
                            value,
                            {
                                gameAction: handleGameAction,
                                actionAccepted: handleActionAccepted,
                                hostChanged: handleHostChanged,
                            }
                        ),
                        observeRestoreActivated: () => {
                            _observeOnlineReconnectEvent(
                                OnlineReconnectState.events.RESTORE_ACTIVATED
                            );
                        },
                        applyActivatedStatus: () => {
                            _applyOnlineReconnectLifecycleStatusEffectAuthority(
                                OnlineReconnectState.events.RESTORE_ACTIVATED
                            );
                        },
                    }
                );
                if (!activationResult.result) return;
            } else {
                _onlineReconnectCompletionController.reset();
                OnlineRuntimeState.runtime.setOnline(true);
                setOnlineReconnectLegacyFlag(false);
                GameRuntimeState.runtime.setPreviousCoins(null);
                _onlineActionSequenceController.replace(
                    restoreActivationPlan.restoredThroughSeq
                );
                if (!_flushOnlineRestoreEvents(
                    restoreGeneration,
                    restoreActivationPlan.restoredThroughSeq,
                    {
                        gameAction: handleGameAction,
                        actionAccepted: handleActionAccepted,
                        hostChanged: handleHostChanged,
                    }
                )) return;
                _observeOnlineReconnectEvent(
                    OnlineReconnectState.events.RESTORE_ACTIVATED
                );
                _applyOnlineReconnectLifecycleStatusEffectAuthority(
                    OnlineReconnectState.events.RESTORE_ACTIVATED
                );
            }
            const currentPendingMatches = !!pendingBeforeRejoin &&
                !acceptedPendingReconciliation &&
                _sameOnlineActionEntry(
                    _readPendingOutboundActionForCurrentSession(),
                    pendingBeforeRejoin
                );
            const pendingSocket = onlineSessionSnapshot().socket;
            const pendingResendEligible = currentPendingMatches &&
                !!pendingSocket && pendingSocket.connected !== false;
            const pendingResendAllowed = pendingResendEligible &&
                _canResendPendingOutboundAction(pendingBeforeRejoin);
            const pendingResendDecisions = OnlinePendingResend.decisions;
            const legacyPendingResendPlan = Object.freeze({
                decision: !pendingResendEligible
                    ? pendingResendDecisions.NONE
                    : (pendingResendAllowed
                        ? pendingResendDecisions.RESEND
                        : pendingResendDecisions.CLEAR),
                pending: pendingResendAllowed ? pendingBeforeRejoin : null,
            });
            _onlineDiagnosticSelections.onlinePendingResendPlanSelection = OnlinePendingResend.selectPlan({
                pending: pendingBeforeRejoin,
                acceptedPending: acceptedPendingReconciliation,
                currentPendingMatches,
                socketConnected: !!pendingSocket && pendingSocket.connected !== false,
                canResend: pendingResendAllowed,
            }, legacyPendingResendPlan, {
                authorityEnabled: isOnlinePendingResendPlanAuthorityEnabled(),
            });
            const pendingResendEffectSelection =
                _onlinePendingResendEffectAuthoritySelection(
                    _onlineDiagnosticSelections.onlinePendingResendPlanSelection
                );
            _onlineDiagnosticSelections.onlinePendingResendEffectSelection = pendingResendEffectSelection;
            const pendingResendPlan = _onlineDiagnosticSelections.onlinePendingResendPlanSelection.plan;
            if (pendingResendEffectSelection.source === 'executor') {
                OnlinePendingResend.execute(pendingResendPlan, {
                    clearPendingOutboundAction: () => _clearPendingOutboundAction(),
                    setActionFlight: () => _setOnlineActionInFlight(true),
                    emitAction: pending => onlineSocketEffects.gameAction({
                        action: pending.action,
                        data: pending.data,
                        clientActionId: pending.clientActionId,
                    }, pendingSocket),
                });
                return;
            }
            if (pendingResendPlan.decision === pendingResendDecisions.CLEAR) {
                _clearPendingOutboundAction();
                return;
            }
            if (pendingResendPlan.decision === pendingResendDecisions.RESEND) {
                _setOnlineActionInFlight(true);
                onlineSocketEffects.gameAction({
                    action: pendingResendPlan.pending.action,
                    data: pendingResendPlan.pending.data,
                    clientActionId: pendingResendPlan.pending.clientActionId,
                }, pendingSocket);
            }
        };
        const preload = preloadOnlineRlModelsForSettings(playerNames.length, ps || []);
        if (preload && typeof preload.then === "function") {
            onlineDomEffects.setStatusText('深層学習AIモデルを読み込んでいます。');
            preload.then(restoreOnlineGame).catch(error => {
                if (restoreGeneration !== _onlineRestoreLifecycleController.getGeneration()) return;
                console.error(error);
                _abortOnlineRestore(restoreGeneration, "深層学習AIモデルを読み込めませんでした。再接続して再試行します。");
            });
            return;
        }
        restoreOnlineGame();
    });

    socketEvents.on(OnlineSocketRegistry.keys.HOSTLESS_COLLECT, ({ roomId, generation }) => {
        if (roomId !== onlineSessionSnapshot().myRoomId) return;
        onlineDomEffects.setStatusText('♻️ 参加者間の復元データ一致を確認しています...');
        if (!_submitHostlessRestoreCandidate(generation)) {
            onlineDomEffects.setStatusText('❌ 復元候補の世代が一致しません。保存データは削除されていません。');
        }
    });

    socketEvents.on(OnlineSocketRegistry.keys.HOSTLESS_CONFIRMATION, ({ roomId, candidateCount }) => {
        if (roomId !== onlineSessionSnapshot().myRoomId) return;
        const message =
            `${candidateCount || 0}人の参加者データが完全一致しました。あなたを新しいホストとして暫定復元しますか？`;
        const respond = approved => {
            const responseSocket = onlineSessionSnapshot().socket;
            if (!responseSocket || responseSocket.connected === false) return;
            onlineSocketEffects.confirmHostlessRestore({
                roomId,
                approved: approved === true,
            }, responseSocket);
        };
        if (typeof showConfirm !== 'function' ||
                showConfirm(message, () => respond(true), () => respond(false)) !== true) {
            respond(false);
        }
    });

    socketEvents.on(OnlineSocketRegistry.keys.HOSTLESS_STATUS, ({ roomId, reason, stage, candidateCount }) => {
        if (roomId && roomId !== onlineSessionSnapshot().myRoomId) return;
        if (reason === 'host-restored') {
            _hostlessRestoreState.clear();
            _clearRejoinRetry();
            setOnlineReconnectLegacyFlag(true);
            onlineDomEffects.setStatusText('♻️ 元のホストが復元しました。再接続しています...');
            _emitOnlineRejoinRequest();
            return;
        }
        if (reason === 'waiting-for-host') {
            onlineDomEffects.setStatusText('⏳ 元のホストの復元を60秒待っています...');
            return;
        }
        if (stage === 'confirming' && reason === 'quorum-ready') {
            onlineDomEffects.setStatusText(
                `⏳ ${candidateCount || 0}人の候補が一致しました。ホスト承認を待っています...`
            );
            return;
        }
        const terminalReasons = new Set([
            'disabled',
            'unsupported-client',
            'original-host',
            'generation-mismatch',
            'insufficient-candidates',
            'candidate-mismatch',
            'completed-game',
            'attempt-limit',
            'confirmation-exhausted',
            'retention-timeout',
            'restore-failed',
            'room-exists',
        ]);
        if (!terminalReasons.has(reason)) return;
        _hostlessRestoreState.clear();
        _markOnlineRejoinAttemptExhausted();
        setOnlineReconnectLegacyFlag(true);
        _observeOnlineReconnectEvent(OnlineReconnectState.events.RETRY_EXHAUSTED);
        onlineDomEffects.setStatusText(
            '❌ ' + OnlinePayload.hostlessRestoreStatusMessage(reason) +
            ' 再接続をやり直すか、タイトル画面から保存データを明示的に破棄できます。'
        );
    });

    socketEvents.on(OnlineSocketRegistry.keys.HOSTLESS_APPROVED, ({ roomId, hostPlayerIndex }) => {
        const session = onlineSessionSnapshot();
        if (roomId !== session.myRoomId) return;
        _hostlessRestoreState.clear();
        if (hostPlayerIndex === session.myOriginalPlayerIndex) return;
        _clearRejoinRetry();
        setOnlineReconnectLegacyFlag(true);
        onlineDomEffects.setStatusText('♻️ 暫定復元したルームへ再接続しています...');
        _emitOnlineRejoinRequest();
    });

    socketEvents.on(OnlineSocketRegistry.keys.PLAYER_REJOINED, ({ playerIndex, playerName }) => {
        if (playerIndex !== onlineSessionSnapshot().myOriginalPlayerIndex) {
            const currentGame = onlineGameRuntimeSnapshot().game;
            currentGame && currentGame.addLog(LOG_TYPES.SYSTEM, `🔌 ${playerName}が再接続しました`);
        }
        onlineClientEffects.render();
    });

    socketEvents.on(OnlineSocketRegistry.keys.PLAYER_DISCONNECTED, ({ playerIndex, playerName }) => {
        const name = playerName || `プレイヤー${playerIndex + 1}`;
        const currentGame = onlineGameRuntimeSnapshot().game;
        currentGame && currentGame.addLog(LOG_TYPES.SYSTEM, `🔌 ${name}が切断しました`);
        onlineClientEffects.render();
    });

    socketEvents.on(OnlineSocketRegistry.keys.HOST_CHANGED, handleHostChanged);

    socketEvents.on(OnlineSocketRegistry.keys.CONNECT, () => {
        _runOnlineSocketConnectEffects();
    });

    socketEvents.on(OnlineSocketRegistry.keys.DISCONNECT, () => {
        _runOnlineSocketDisconnectEffects();
    });

    socketEvents.on(OnlineSocketRegistry.keys.CONNECT_ERROR, () => {
        onlineDomEffects.setStatusText('⏳ サーバーに接続中です。初回は起動に30秒ほどかかる場合があります...');
    });

    socketEvents.on(OnlineSocketRegistry.keys.APP_ERROR, handleAppError);
    socketEvents.assertComplete();
    return true;
}

function _runOnlineReconnectTerminalCleanupLegacy() {
    const currentSocket = onlineSessionSnapshot().socket;
    _clearPendingOutboundActionForCurrentSession();
    setOnlineReconnectLegacyFlag(false);
    _removeOnlineSessionStorageItem();
    _clearOnlineRestoreBundle();
    onlineClientEffects.updateResumeButton();
    if (currentSocket) {
        currentSocket.disconnect();
        OnlineRuntimeState.runtime.setSocket(null);
    }
}

function _runOnlineReconnectTerminalCleanup(cleanupSelection) {
    const effectSelection = _onlineReconnectCleanupEffectAuthoritySelection(cleanupSelection);
    _onlineDiagnosticSelections.onlineReconnectCleanupEffectSelection = effectSelection;
    if (effectSelection.source !== 'event') {
        _runOnlineReconnectTerminalCleanupLegacy();
        return effectSelection;
    }
    OnlineReconnectCleanup.executeTerminal({
        clearPendingOutboundAction: () => _clearPendingOutboundActionForCurrentSession(),
        clearReconnectFlag: () => setOnlineReconnectLegacyFlag(false),
        removeOnlineSession: () => _removeOnlineSessionStorageItem(),
        clearRestoreBundle: () => _clearOnlineRestoreBundle(),
        updateResumeButton: () => onlineClientEffects.updateResumeButton(),
        disconnectSocket: () => {
            const currentSocket = onlineSessionSnapshot().socket;
            if (currentSocket) {
                currentSocket.disconnect();
                OnlineRuntimeState.runtime.setSocket(null);
            }
        },
    });
    return effectSelection;
}

function handleAppError(msg) {
    const session = onlineSessionSnapshot();
    finishOnlineLobbyRequest();
    _setOnlineActionInFlight(false);
    setOnlineCreateRoomPending(false);
    if (msg === 'ROOM_NOT_FOUND' && session.isReconnectingOnline) {
        if (session.isRoomHost) {
            if (!_tryRestoreRoom()) _scheduleRejoinRetry();
        } else {
            _scheduleRejoinRetry();
        }
        return;
    }
    if (msg === '無効な操作です' && session.isOnlineGame && session.socket && session.myRoomId &&
            session.myOriginalPlayerIndex >= 0 && session.myPlayerName && session.reconnectToken) {
        _clearPendingOutboundActionForCurrentSession({ requireExplicitRoomId: true });
        setOnlineReconnectLegacyFlag(true);
        onlineClientEffects.invalidateCpuSchedule();
        onlineDomEffects.setStatusText('⚠️ 操作がサーバーで拒否されました。状態を再同期しています...');
        _emitOnlineRejoinRequest();
        return;
    }
    const cleanupSelection = _onlineReconnectCleanupAuthoritySelection(session.isReconnectingOnline);
    if (cleanupSelection.cleanup) {
        _runOnlineReconnectTerminalCleanup(cleanupSelection);
    }
    onlineDomEffects.setStatusText(`❌ ${msg}`);
}

function snapshotOnlinePlayerSettings(playerCount = onlineSetupStateController.snapshot().selectedCount) {
    return OnlinePlayerSettings.snapshot(onlineSetupStateController.snapshot().playerSettings, playerCount);
}

function hasOnlineRlCpuSetting(playerCount = onlineSetupStateController.snapshot().selectedCount, settings = onlineSetupStateController.snapshot().playerSettings) {
    return OnlinePlayerSettings.hasRlCpu(settings, playerCount);
}

function canPreloadOnlineRlModels() {
    return typeof RLModelPortfolio !== "undefined" && typeof RLModelPortfolio.preloadEligibleModels === "function";
}

function onlineRlModelLoadState(playerCount = onlineSetupStateController.snapshot().selectedCount) {
    const usesRl = hasOnlineRlCpuSetting(playerCount);
    if (!usesRl) return OnlinePlayerSettings.rlModelLoadState({ usesRl: false, playerCount });
    const loaderAvailable = canPreloadOnlineRlModels();
    return OnlinePlayerSettings.rlModelLoadState({
        usesRl,
        loaderAvailable,
        playerCount,
        eligibleLoadState: loaderAvailable && typeof RLModelPortfolio.eligibleLoadState === "function"
            ? count => RLModelPortfolio.eligibleLoadState(count) : null,
    });
}

function onlineRlModelStatusMessage(state) {
    return OnlinePlayerSettings.rlModelStatusMessage(state);
}

function updateOnlineRlModelReadinessUi() {
    const state = onlineRlModelLoadState(onlineSetupStateController.snapshot().selectedCount);
    const view = OnlinePlayerSettings.createButtonView(
        state,
        onlineLobbyRequestController.snapshot().createPending
    );
    onlineDomEffects.applyButtonView(OnlineDomEffects.ids.createButton, view);
    onlineDomEffects.setText(OnlineDomEffects.ids.rlStatus, onlineRlModelStatusMessage(state));
    return state;
}

function renderOnlineJoinRoomPending() {
    const view = OnlinePlayerSettings.joinButtonView(onlineLobbyRequestController.snapshot().joinPending);
    onlineDomEffects.applyButtonView(OnlineDomEffects.ids.joinButton, view);
}

function setOnlineJoinRoomPending(pending) {
    onlineLobbyRequestController.setJoinPending(pending);
    renderOnlineJoinRoomPending();
}

function finishOnlineLobbyRequest(kind = '') {
    const transition = onlineLobbyRequestController.finish(kind);
    if (!transition.finished) return false;
    if (transition.timer) clearTimeout(transition.timer);
    updateOnlineRlModelReadinessUi();
    renderOnlineJoinRoomPending();
    return true;
}

function beginOnlineLobbyRequest(kind) {
    const transition = onlineLobbyRequestController.begin(kind);
    if (transition.replacedTimer) clearTimeout(transition.replacedTimer);
    updateOnlineRlModelReadinessUi();
    renderOnlineJoinRoomPending();
    const timer = setTimeout(() => {
        if (!onlineLobbyRequestController.isCurrent(kind, transition.generation)) return;
        finishOnlineLobbyRequest(kind);
        onlineDomEffects.setStatusText('⚠️ サーバー応答がありません。もう一度お試しください。');
        onlineClientEffects.showNotice('サーバー応答がタイムアウトしました。通信状態を確認してもう一度お試しください。');
    }, ONLINE_LOBBY_REQUEST_TIMEOUT_MS);
    onlineLobbyRequestController.attachTimer(kind, transition.generation, timer);
}

function setOnlineCreateRoomPending(pending) {
    onlineLobbyRequestController.setCreatePending(pending);
    updateOnlineRlModelReadinessUi();
}

function preloadOnlineRlModelsForSettings(playerCount, settings) {
    if (!hasOnlineRlCpuSetting(playerCount, settings)) return null;
    if (!canPreloadOnlineRlModels()) return Promise.reject(new Error("RL model loader is not available"));
    return RLModelPortfolio.preloadEligibleModels(playerCount, { attempts: 3 });
}

function preloadOnlineRlModelsForCreate(playerCount, settings = onlineSetupStateController.snapshot().playerSettings) {
    return preloadOnlineRlModelsForSettings(playerCount, settings);
}

function preloadOnlineRlModelsInBackground(reason = 'online-rl-background-preload') {
    const setup = onlineSetupStateController.snapshot();
    if (!hasOnlineRlCpuSetting(setup.selectedCount, setup.playerSettings) || !canPreloadOnlineRlModels()) {
        updateOnlineRlModelReadinessUi();
        return null;
    }
    updateOnlineRlModelReadinessUi();
    const preload = RLModelPortfolio.preloadEligibleModels(setup.selectedCount, { attempts: 3, retryDelayMs: 0 });
    if (preload && typeof preload.then === "function") {
        preload.then(() => updateOnlineRlModelReadinessUi()).catch(error => {
            if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn(reason, error);
            updateOnlineRlModelReadinessUi();
        });
    }
    updateOnlineRlModelReadinessUi();
    return preload;
}

function emitCreateRoom(name, playerCount = onlineSetupStateController.snapshot().selectedCount, settings = onlineSetupStateController.snapshot().playerSettings) {
    OnlineRuntimeState.runtime.setPlayerName(name);
    const setup = onlineSetupStateController.setCpuSpeed(parseInt(onlineDomEffects.inputValue(OnlineDomEffects.ids.cpuSpeed)));
    if (!initSocket()) return;
    beginOnlineLobbyRequest('create');
    OnlineRuntimeState.runtime.setHost(true);
    const selection = GameSelectionState.runtime.snapshot();
    const createPayload = {
        playerName: name,
        playerCount,
        playerSettings: freezeOnlinePlayerSettings(settings, playerCount),
        cpuSpeed: setup.cpuSpeed,
        enabledCards: [...selection.enabledCards],
        enabledLandmarks: [...selection.enabledLandmarks],
        clientVersion: getClientVersion(),
        hostlessRestoreVersion: OnlinePayload.hostlessRestoreVersion,
    };
    onlineSocketEffects.createRoom(OnlinePayload.withGameSchemaCapabilities(
        createPayload, getGameSchemaCapabilitiesForTransport()
    ));
}

function showCreateRoom() {
    if (onlineLobbyRequestController.snapshot().createPending) return;
    const name = onlineDomEffects.inputValue(OnlineDomEffects.ids.playerName).trim();
    if (!name) { onlineClientEffects.showNotice("名前を入力してください"); return; }
    const setup = onlineSetupStateController.snapshot();
    const createPlayerCount = setup.selectedCount;
    const createPlayerSettings = OnlinePlayerSettings.snapshot(setup.playerSettings, createPlayerCount);
    const state = updateOnlineRlModelReadinessUi();
    if (state.status === 'loading') {
        onlineClientEffects.showNotice("深層学習AIモデルを読み込んでいます。");
        return;
    }
    const preload = preloadOnlineRlModelsForCreate(createPlayerCount, createPlayerSettings);
    if (preload && typeof preload.then === "function") {
        setOnlineCreateRoomPending(true);
        onlineDomEffects.applyButtonView(OnlineDomEffects.ids.createButton, {
            disabled: true,
            textContent: 'モデル読み込み中',
        });
        onlineClientEffects.showNotice("深層学習AIモデルを読み込んでいます。");
        preload
            .then(() => {
                setOnlineCreateRoomPending(false);
                updateOnlineRlModelReadinessUi();
                emitCreateRoom(name, createPlayerCount, createPlayerSettings);
            })
            .catch(error => {
                setOnlineCreateRoomPending(false);
                console.error(error);
                updateOnlineRlModelReadinessUi();
                onlineClientEffects.showNotice("深層学習AIモデルを読み込めませんでした。通信状態を確認してもう一度部屋を作成してください。");
            });
        return;
    }
    emitCreateRoom(name, createPlayerCount, createPlayerSettings);
}

function joinRoom() {
    if (onlineLobbyRequestController.snapshot().joinPending) return;
    const name = onlineDomEffects.inputValue(OnlineDomEffects.ids.playerName).trim();
    const roomId = onlineDomEffects.inputValue(OnlineDomEffects.ids.roomId).trim().toUpperCase();
    if (!name) { onlineClientEffects.showNotice("名前を入力してください"); return; }
    if (roomId.length !== 6) { onlineClientEffects.showNotice("ルームIDは6文字です"); return; }
    OnlineRuntimeState.runtime.setPlayerName(name);
    OnlineRuntimeState.runtime.setHost(false);
    if (!initSocket()) return;
    beginOnlineLobbyRequest('join');
    const joinPayload = {
        roomId,
        playerName: name,
        clientVersion: getClientVersion(),
        hostlessRestoreVersion: OnlinePayload.hostlessRestoreVersion,
    };
    onlineSocketEffects.joinRoom(OnlinePayload.withGameSchemaCapabilities(
        joinPayload, getGameSchemaCapabilitiesForTransport()
    ));
}

function initOnlineGame(playerNames, ps, playerOrder) {
    const count = playerNames.length;
    onlineClientEffects.invalidateCpuSchedule();
    if (typeof cancelDelayedHumanAction === 'function') cancelDelayedHumanAction();
    if (typeof cancelAutoSkip === 'function') cancelAutoSkip();
    GameRuntimeState.runtime.setPreviousCoins(null);
    GameRuntimeState.runtime.setUndoState(null);
    resetFullLog();
    if (typeof resetStatsRecorded === "function") {
        resetStatsRecorded();
    }
    const initializedGameState = GameRuntimeState.runtime.setGame(new GameManager(count));
    const currentGame = initializedGameState.game;
    const selection = GameSelectionState.runtime.snapshot();
    const selectedLandmarks = selection.enabledLandmarks.length > 0
        ? selection.enabledLandmarks
        : Player.landmarkNames();
    const selectedCards = new Set(selection.enabledCards);
    currentGame.enabledLandmarks = new Set(selectedLandmarks);
    for (const card of CARDS) {
        setShopStockCount(SHOP_STOCK, card, selectedCards.has(card.name) ? getInitialCardStock(card, count) : 0);
    }

    // playerOrderに従ってプレイヤー名とCPU設定を設定
    const order = playerOrder || playerNames.map((_, i) => i);
    for (let i = 0; i < count; i++) {
        const originalIndex = order[i];
        currentGame.players[i].name = playerNames[originalIndex];
    }

    // CPU設定をorderに合わせて反映
    if (ps && ps.length > 0) {
        const orderedSettings = order.map(originalIndex => ps[originalIndex] || null);
        const opponentDifficulties = onlineCpuOpponentDifficultiesFromSettings(orderedSettings);
        GameRuntimeState.runtime.setCpuPlayers(orderedSettings.map(s => {
            return s && s.type === "cpu"
                ? createOnlineCpuPlayer(s.difficulty, { expertPurpose: "live", playerCount: count, expertOpponentDifficulties: opponentDifficulties, rlModelId: s.rlModelId || s.modelId || null })
                : null;
        }));
    } else {
        GameRuntimeState.runtime.setCpuPlayers(currentGame.players.map(() => null));
    }

    // myPlayerIndexをシャッフル後の位置に更新
    // order[i] === 元のindex なので、自分の元indexがorderの何番目かを探す
    const orderedPlayerIndex = order.indexOf(onlineSessionSnapshot().myOriginalPlayerIndex);
    OnlineRuntimeState.runtime.setCurrentPlayerIndex(
        orderedPlayerIndex === -1 ? 0 : orderedPlayerIndex
    ); // 見つからない場合はホスト

    currentGame.addLog(LOG_TYPES.SYSTEM, `👤 ${currentGame.currentPlayer().name}のターン`);
    onlineClientEffects.render();
    onlineClientEffects.scheduleCpu();
}

function _createOnlineGameEngineRuntimeAdapter() {
    const currentGame = onlineGameRuntimeSnapshot().game;
    return GameEngineRuntimeAdapter.create({
        createGame: playerCount => new GameManager(playerCount),
        enabledLandmarks: currentGame && currentGame.enabledLandmarks
            ? currentGame.enabledLandmarks
            : Player.landmarkNames(),
        landmarkNames: Player.landmarkNames,
        createCardByName,
        assignShopStockSnapshot,
        decrementShopStock,
        pendingActionsFor: GameManager.serializedPendingActionsFor,
        logLimit: ONLINE_SNAPSHOT_LOG_LIMIT,
    });
}

function _hydrateOnlineGameEngineShadowSnapshot(snapshot) {
    return _createOnlineGameEngineRuntimeAdapter().hydrate(snapshot);
}

function _serializeOnlineGameEngineShadowRuntime(runtime) {
    return _createOnlineGameEngineRuntimeAdapter().serialize(runtime);
}

function _prepareOnlineGameEngineShadow(action, data) {
    if (!isOnlineGameEngineShadowEnabled() ||
            typeof GameEngineClientShadow === 'undefined') return null;
    const snapshot = buildOnlineSnapshot();
    return GameEngineClientShadow.prepare({
        enabled: true,
        action,
        data,
        snapshot,
        transition(sourceSnapshot, shadowAction, shadowData) {
            return GameEngine.transitionSnapshot({
                snapshot: sourceSnapshot,
                action: shadowAction,
                data: shadowData,
                hydrate: _hydrateOnlineGameEngineShadowSnapshot,
                serialize(runtime) {
                    if (shadowAction === 'undoBuild' || shadowAction === 'nextTurn') {
                        runtime.undoState = null;
                    }
                    return _serializeOnlineGameEngineShadowRuntime(runtime);
                },
            });
        },
    });
}

function _adoptOnlineGameEngineShadowSnapshot(snapshot) {
    const runtime = _hydrateOnlineGameEngineShadowSnapshot(snapshot);
    const rebuilt = _serializeOnlineGameEngineShadowRuntime(runtime);
    if (!GameEngineClientShadow.equalSnapshots(rebuilt, snapshot)) return false;
    GameRuntimeState.runtime.setGame(runtime.game);
    assignShopStockSnapshot(SHOP_STOCK, runtime.shopStock);
    GameRuntimeState.runtime.setUndoState(runtime.undoState);
    return true;
}

function _finishOnlineGameEngineShadow(prepared) {
    if (!prepared) return null;
    const outcome = GameEngineClientShadow.finish({
        prepared,
        liveSnapshot: buildOnlineSnapshot(),
        authorityEnabled: isOnlineGameEngineAuthorityEnabled(),
        adoptSnapshot: _adoptOnlineGameEngineShadowSnapshot,
    });
    _onlineDiagnosticSelections.onlineGameEngineShadowOutcome = outcome;
    return outcome;
}

function applyAction(action, data) {
    return GameEngine.applyMutableAction({
        game: onlineGameRuntimeSnapshot().game,
        shopStock: SHOP_STOCK,
        action,
        data,
        createCardByName: name => CARDS.find(card => card.name === name),
        decrementShopStock,
        restoreUndoState: restoreUndoSnapshot,
    });
}

function applyReplayedAction(action, data) {
    if (action === 'buildCard' || action === 'buildLandmark') {
        GameRuntimeState.runtime.setUndoState(buildOnlineUndoSnapshot());
    }
    const shadow = _prepareOnlineGameEngineShadow(action, data);
    const applied = applyAction(action, data);
    if (action === 'undoBuild' || action === 'nextTurn') {
        GameRuntimeState.runtime.setUndoState(null);
    }
    _finishOnlineGameEngineShadow(shadow);
    return applied;
}

function restoreOnlineSnapshot(state) {
    const currentGame = onlineGameRuntimeSnapshot().game;
    if (!state || !currentGame) return;
    GameSnapshot.hydrateMutableGameState({
        game: currentGame,
        shopStock: SHOP_STOCK,
        state,
        createCardByName,
        assignShopStockSnapshot,
        normalizePlayerCoins: value => value,
        readDormantIndices: value => value || [],
        readLandmarks: value => value || {},
        readLog: value => value || [],
        normalizeCurrentPlayerIndex: value => value || 0,
        onUndoState: value => { GameRuntimeState.runtime.setUndoState(value); },
    });
}

function sendAction(action, data = {}) {
    const session = onlineSessionSnapshot();
    if (session.isOnlineGame && session.socket) {
        if (isOnlineReconnectInputBlocked() || _onlineActionFlightController.isInFlight() || session.socket.connected === false) return false;
        _setOnlineActionInFlight(true);
        onlineClientEffects.invalidateCpuSchedule();
        const pending = _savePendingOutboundAction(action, data);
        const encodedWire = encodeOnlineGameSchemaAction({ action, data, clientActionId: pending.clientActionId });
        if (!encodedWire.ok) {
            _setOnlineActionInFlight(false);
            _clearPendingOutboundAction();
            return false;
        }
        onlineSocketEffects.gameAction(encodedWire.value, session.socket);
        return true;
    }
    return !session.isOnlineGame;
}

function _tryRestoreRoom() {
    try {
        const gameStartPayload = _readOnlineGameStartPayload();
        if (!gameStartPayload) {
            onlineDomEffects.setStatusText('❌ 復元データが見つかりません');
            return;
        }
        if (gameStartPayload.schemaVersion !== ONLINE_RESTORE_SCHEMA_VERSION ||
                !Array.isArray(gameStartPayload.reconnectTokenHashes)) {
            _clearOnlineRestoreBundle();
            onlineDomEffects.setStatusText('❌ 古い復元データのため再接続できません');
            return;
        }
        const isStoredHost = gameStartPayload.hostPlayerIndex === onlineSessionSnapshot().myOriginalPlayerIndex;
        if (!isStoredHost) return false;
        const restoreAudit = _readOnlineRestoreAudit();
        const stateSnapshot = restoreAudit ? _readOnlineStateSnapshot() : null;
        const actionLog = _readOnlineActionLog();
        onlineDomEffects.setStatusText('♻️ サーバー再起動を検知。ゲームを復元中...');
        return _sendRecreateRoomFromBundle({
            gameStartPayload,
            stateSnapshot,
            actionLog,
            restoreAudit,
        });
    } catch(e) {
        onlineDomEffects.setStatusText('❌ 復元に失敗しました');
        return false;
    }
}

function _readLocalRestoreBundle() {
    try {
        const gameStartPayload = _readOnlineGameStartPayload();
        if (!gameStartPayload || gameStartPayload.schemaVersion !== ONLINE_RESTORE_SCHEMA_VERSION ||
                !Array.isArray(gameStartPayload.reconnectTokenHashes)) return null;
        const restoreAudit = _readOnlineRestoreAudit();
        const stateSnapshot = restoreAudit ? _readOnlineStateSnapshot() : null;
        const actionLog = _readOnlineActionLog();
        return { gameStartPayload, stateSnapshot, actionLog, restoreAudit };
    } catch (_) {
        return null;
    }
}

function _onlineHostlessRestoreIdentity() {
    const session = onlineSessionSnapshot();
    return {
        roomId: session.myRoomId,
        playerIndex: session.myOriginalPlayerIndex,
        playerName: session.myPlayerName,
        reconnectToken: session.reconnectToken,
    };
}

function _requestHostlessRestore() {
    const currentSocket = onlineSessionSnapshot().socket;
    if (!currentSocket || currentSocket.connected === false || _hostlessRestoreState.isPending()) return false;
    const bundle = _readLocalRestoreBundle();
    const payload = OnlinePayload.buildHostlessRestoreRequest(
        bundle,
        _onlineHostlessRestoreIdentity()
    );
    if (!payload || !_hostlessRestoreState.tryBegin(true)) return false;
    setOnlineReconnectLegacyFlag(true);
    onlineSocketEffects.requestHostlessRestore(payload, currentSocket);
    return true;
}

function _submitHostlessRestoreCandidate(generation) {
    const currentSocket = onlineSessionSnapshot().socket;
    const bundle = _readLocalRestoreBundle();
    if (!bundle || bundle.gameStartPayload.hostlessRestoreGeneration !== generation) {
        return false;
    }
    const payload = OnlinePayload.buildHostlessRestoreCandidate(
        bundle,
        _onlineHostlessRestoreIdentity()
    );
    if (!payload || !currentSocket || currentSocket.connected === false) return false;
    onlineSocketEffects.submitHostlessRestoreCandidate(payload, currentSocket);
    return true;
}

function _sendRecreateRoomFromBundle(bundle) {
    const session = onlineSessionSnapshot();
    const payload = {
        roomId: session.myRoomId,
        gameStartPayload: bundle.gameStartPayload,
        stateSnapshot: bundle.stateSnapshot,
        actionLog: bundle.actionLog,
        restoreAudit: bundle.restoreAudit,
        playerIndex: session.myOriginalPlayerIndex,
        playerName: session.myPlayerName,
        reconnectToken: session.reconnectToken,
    };
    const encoded = encodeOnlineRecreateRoomPayload(payload);
    if (!encoded.ok || !session.socket || session.socket.connected === false) {
        onlineDomEffects.setStatusText('❌ 復元payloadのschema変換に失敗しました');
        return false;
    }
    onlineSocketEffects.recreateRoom(encoded.value);
    return true;
}

function _scheduleRejoinRetry() {
    if (OnlineRetryPolicy.isRejoinExhausted(_onlineRejoinAttemptController.getAttemptCount())) return _finishRejoinRetryTimeout();
    onlineDomEffects.setStatusText(
        OnlineRetryPolicy.rejoinWaitingMessage(_onlineRejoinAttemptController.getAttemptCount())
    );
    return _armOnlineRejoinResponseTimeout();
}
