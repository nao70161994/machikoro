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
const onlineComposition = OnlineComposition.create({
    clientEffectsModule: OnlineClientEffects,
    clientStorageModule: ClientStorage,
    domEffectsModule: OnlineDomEffects,
    gameState: GameRuntimeState.runtime,
    getDocument: () => typeof document !== 'undefined' ? document : null,
    hostlessEvents: OnlinePayload.hostlessRestoreEvents,
    resolveClientEffect: name => {
        const resolveEffect = onlineClientEffectResolvers[name];
        return typeof resolveEffect === 'function' ? resolveEffect() : null;
    },
    sessionState: OnlineRuntimeState.runtime,
    socketEffectsModule: OnlineSocketEffects,
});
const onlineClientEffects = onlineComposition.clientEffects;
const onlineDomEffects = onlineComposition.domEffects;
const onlineSocketEffects = onlineComposition.socketEffects;
const onlineClientStorageFacade = onlineComposition.storage;

function selectOnlineRoomIdText() {
    const target = typeof document !== 'undefined'
        ? document.querySelector('.room-id-display[data-room-id-value]')
        : null;
    const selection = typeof window !== 'undefined' && typeof window.getSelection === 'function'
        ? window.getSelection() : null;
    if (!target || !selection || typeof document.createRange !== 'function') return false;
    const range = document.createRange();
    range.selectNodeContents(target);
    selection.removeAllRanges();
    selection.addRange(range);
    if (typeof target.focus === 'function') target.focus({ preventScroll: true });
    return true;
}

function copyOnlineRoomId(roomId) {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : null;
    return OnlineRoomShare.copyRoomId(roomId, {
        writeText: clipboard && typeof clipboard.writeText === 'function'
            ? value => clipboard.writeText(value)
            : null,
        selectText: selectOnlineRoomIdText,
        notify: message => onlineClientEffects.showNotice(message),
    });
}

function leaveOnlineLobby() {
    const session = onlineSessionSnapshot();
    if (session.isOnlineGame || !session.myRoomId) return false;
    const roomId = session.myRoomId;
    return showConfirm('待機室から退出しますか？\n再参加にはルームIDが必要です', () => {
        onlineDomEffects.setInputValue(OnlineDomEffects.ids.roomId, roomId);
        _removeOnlineSessionStorageItem(roomId);
        resetOnlineState();
        onlineDomEffects.setStatusText(`ルーム ${roomId} から退出しました。再参加する場合は参加ボタンを押してください。`);
        if (typeof switchTab === 'function') switchTab('online');
        if (typeof switchOnlineTab === 'function') switchOnlineTab('join');
        onlineClientEffects.updateResumeButton();
    });
}

function removeOnlineLobbyPlayer(playerIndex) {
    const session = onlineSessionSnapshot();
    if (session.isOnlineGame || !session.isRoomHost || !session.myRoomId ||
            !Number.isInteger(playerIndex) || playerIndex < 0 ||
            playerIndex === session.myOriginalPlayerIndex || !session.socket) return false;
    return showConfirm('この参加者を待機室から外しますか？', () => {
        onlineSocketEffects.removeWaitingPlayer({
            roomId: session.myRoomId,
            playerIndex,
        }, session.socket);
    });
}

function changeOnlineLobbySlots(delta) {
    const session = onlineSessionSnapshot();
    if (session.isOnlineGame || !session.isRoomHost || !session.myRoomId ||
            (delta !== 1 && delta !== -1) || !session.socket) return false;
    return onlineSocketEffects.manageWaitingRoom({
        roomId: session.myRoomId,
        action: 'slots',
        delta,
    }, session.socket);
}

function startOnlineLobbyNow() {
    const session = onlineSessionSnapshot();
    if (session.isOnlineGame || !session.isRoomHost || !session.myRoomId || !session.socket) return false;
    return showConfirm('空いている参加枠をCPU（普通）にして開始しますか？', () => {
        onlineSocketEffects.manageWaitingRoom({ roomId: session.myRoomId, action: 'start' }, session.socket);
    });
}

function onlineGameRuntimeSnapshot() {
    return onlineComposition.snapshotGame();
}

function onlineSessionSnapshot() {
    return onlineComposition.snapshotSession();
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
    UiPlayerCount.applyView(
        onlineDomEffects.element(OnlineDomEffects.ids.playerCount),
        UiPlayerCount.buildView(state.selectedCount)
    );
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
    return onlineComposition.sessionState.setReconnecting(value).isReconnectingOnline;
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
    restoreBundleStatus: 'onlineRestoreBundleStatus',
});
const ONLINE_RESTORE_ROOM_INDEX_KEY = 'onlineRestoreRoomIndex';
const ONLINE_RESTORE_ROOM_INDEX_SCHEMA_VERSION = 1;

const ONLINE_ROOM_STORAGE_KEY_SEPARATOR = ':room:';
const _onlineReconnectRuntime = OnlineReconnectRuntime.create({
    statePolicy: OnlineReconnectState,
    retryPolicy: OnlineRetryPolicy,
    setTimer: typeof setTimeout === 'function' ? setTimeout : null,
    clearTimer: typeof clearTimeout === 'function' ? clearTimeout : null,
    now: () => Date.now(),
    getLegacyReconnecting: () => onlineSessionSnapshot().isReconnectingOnline,
    setLegacyReconnecting: value => setOnlineReconnectLegacyFlag(value),
    getObservationFlags: () => _onlineReconnectObservationFlags(),
    getStatusText: () => onlineDomEffects.statusText(),
    setStatusText: message => onlineDomEffects.setStatusText(message),
});
const _onlineRejoinAttemptController = _onlineReconnectRuntime.attempts;
const _onlineRejoinTimerController = _onlineReconnectRuntime.timer;
const _onlineReconnectCompletionController = _onlineReconnectRuntime.completion;
const _onlineActionFlightController = OnlineRetryPolicy.createActionFlightController({
    setTimer: typeof setTimeout === 'function' ? setTimeout : null,
    clearTimer: typeof clearTimeout === 'function' ? clearTimeout : null,
    now: () => Date.now(),
});
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
        replaying: session.isReplaying,
        restoring: _onlineRestoreLifecycleController.isInProgress(),
        rejoining: session.isReconnectingOnline && connected,
        connecting: session.isReconnectingOnline && !connected,
        active: session.isOnlineGame,
    };
}

function _observeOnlineReconnectEvent(event) {
    return _onlineReconnectRuntime.observe(event, {
        effectAuthorityEnabled: isOnlineReconnectEffectAuthorityEnabled(),
    });
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
], {
    // Clean event history is the production state authority. Explicit false keeps
    // the legacy boolean projection as an immediate rollback path.
    defaultEnabledNames: [
        'isOnlineReconnectEventAuthorityEnabled',
        'isOnlineReconnectEffectAuthorityEnabled',
    ],
});

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
    return _onlineReconnectRuntime.effectSelection(
        legacyValue,
        isOnlineReconnectEffectAuthorityEnabled()
    );
}

function _applyOnlineReconnectEffectAuthority(legacyValue = onlineSessionSnapshot().isReconnectingOnline) {
    return _onlineReconnectRuntime.applyEffectAuthority(
        legacyValue,
        isOnlineReconnectEffectAuthorityEnabled()
    );
}

function _applyOnlineReconnectStatusEffectAuthority(event, legacyMessage) {
    return _onlineReconnectRuntime.applyStatus(
        event,
        legacyMessage,
        isOnlineReconnectStatusEffectAuthorityEnabled()
    );
}

function _applyOnlineReconnectLifecycleStatusEffectAuthority(event) {
    return _onlineReconnectRuntime.applyLifecycleStatus(
        event,
        isOnlineReconnectStatusEffectAuthorityEnabled()
    );
}

function _onlineReconnectTimerAuthoritySelection() {
    return _onlineReconnectRuntime.timerSelection(
        isOnlineReconnectEffectAuthorityEnabled(),
        isOnlineReconnectTimerAuthorityEnabled()
    );
}

function _onlineReconnectCallbackAuthoritySelection() {
    return _onlineReconnectRuntime.callbackSelection(
        isOnlineReconnectEffectAuthorityEnabled(),
        isOnlineReconnectTimerAuthorityEnabled(),
        isOnlineReconnectCallbackAuthorityEnabled()
    );
}

function _onlineReconnectCleanupAuthoritySelection(legacyValue = onlineSessionSnapshot().isReconnectingOnline) {
    return _onlineReconnectRuntime.cleanupSelection(
        legacyValue,
        isOnlineReconnectCleanupAuthorityEnabled()
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
    return _onlineReconnectRuntime.authoritySelection(
        isOnlineReconnectEventAuthorityEnabled()
    );
}

function getOnlineReconnectState() {
    return _onlineReconnectRuntime.getState(isOnlineReconnectEventAuthorityEnabled());
}

function getOnlineReconnectStateSnapshot() {
    getOnlineReconnectState();
    const snapshot = _onlineReconnectRuntime.rawSnapshot();
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
    return _onlineReconnectRuntime.inputBlocked(isOnlineReconnectEventAuthorityEnabled());
}

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
    _removeOnlineRestoreStorageItem(ONLINE_STORAGE_KEYS.restoreBundleStatus);
    _clearPendingOutboundAction();
    _removeOnlineRestoreRoomIndexEntry(roomIdBeforeClear);
}

function _readOnlineRestoreBundleStatus() {
    return _readOnlineRoomStorageJson(ONLINE_STORAGE_KEYS.restoreBundleStatus, null);
}

function _isOnlineRestoreBundleIncomplete() {
    const status = _readOnlineRestoreBundleStatus();
    return !!status && status.schemaVersion === 1 && status.status === 'incomplete';
}

function _markOnlineRestoreBundleIncomplete(prepared, storedActionLog) {
    const completeThroughSeq = Array.isArray(storedActionLog)
        ? storedActionLog.reduce((highest, entry) =>
            Number.isInteger(entry && entry.seq) ? Math.max(highest, entry.seq) : highest, 0)
        : 0;
    _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.restoreBundleStatus, {
        schemaVersion: 1,
        status: 'incomplete',
        observedSeq: Number.isInteger(prepared && prepared.restoredThroughSeq)
            ? prepared.restoredThroughSeq
            : 0,
        completeThroughSeq,
    });
}

function _clearOnlineRestoreBundleIncomplete() {
    _removeOnlineRestoreStorageItem(ONLINE_STORAGE_KEYS.restoreBundleStatus);
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
        _onlineReconnectRuntime.rawSnapshot(),
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
    if (currentSession.isOnlineGame) {
        onlineDomEffects.setGameStatusText('⏳ サーバーに再参加しています...');
    }
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
        _onlineReconnectRuntime.rawSnapshot(),
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
        _onlineReconnectRuntime.rawSnapshot(),
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
        requestRejoin: !!(session.myRoomId && session.myOriginalPlayerIndex >= 0 &&
            session.myPlayerName && session.reconnectToken),
    });
}

function _onlineSocketConnectPlanSelection() {
    const session = onlineSessionSnapshot();
    const legacyPlan = _legacyOnlineSocketConnectPlan();
    const requested = isOnlineSocketConnectPlanAuthorityEnabled();
    const stateSelection = OnlineReconnectState.selectAuthorityState(
        _onlineReconnectRuntime.rawSnapshot(),
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
    _onlineReconnectRuntime.reconcile({ event: 'socket-disconnect-plan' });
    const legacyPlan = _legacyOnlineSocketDisconnectPlan();
    const requested = isOnlineSocketDisconnectPlanAuthorityEnabled();
    const stateSelection = OnlineReconnectState.selectAuthorityState(
        _onlineReconnectRuntime.rawSnapshot(),
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
        setHostState: isHost => { onlineComposition.sessionState.setHost(isHost); },
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
        disconnectSocket() {
            const currentSocket = onlineSessionSnapshot().socket;
            if (currentSocket) currentSocket.disconnect();
            onlineComposition.sessionState.setSocket(null);
        },
        leaveOnlineGame() { onlineComposition.sessionState.setOnline(false); },
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
                onlineComposition.sessionState.setSocket(null);
            }
        },
        leaveOnlineGame() { onlineComposition.sessionState.setOnline(false); },
        clearHost() { onlineComposition.sessionState.setHost(false); },
        clearPlayerIndexes() { onlineComposition.sessionState.clearPlayerIndexes(); },
        clearRoom() { onlineComposition.sessionState.clearRoom(); },
        clearReconnectToken() { onlineComposition.sessionState.clearReconnectToken(); },
        clearSchemaSelection() { onlineSchemaSelectionController.clear(); },
        clearReplayFlag() { onlineComposition.sessionState.setReplaying(false); },
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
        if (_isOnlineRestoreBundleIncomplete()) return;
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
        if (_isOnlineRestoreBundleIncomplete()) return;
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
        _onlineReconnectRuntime.rawSnapshot(),
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
    if (!session.myRoomId || session.myOriginalPlayerIndex < 0 ||
            !session.myPlayerName || !session.reconnectToken) return false;
    try {
        _writeOnlineSessionStorageJson({
            roomId: session.myRoomId,
            playerIndex: session.myOriginalPlayerIndex,
            playerName: session.myPlayerName,
            reconnectToken: session.reconnectToken,
            isRoomHost: session.isRoomHost,
            gameGeneration: session.gameGeneration,
        });
        onlineClientEffects.updateResumeButton();
        return true;
    } catch (e) {
        return false;
    }
}

function _applyOnlineHostPayload(gameStartPayload, hostPlayerIndex, hostEpoch) {
    const restoreMetadata = /** @type {any} */ (globalThis).OnlineRestoreMetadata;
    if (!gameStartPayload || typeof gameStartPayload !== 'object') return gameStartPayload;
    if (Number.isInteger(hostPlayerIndex)) {
        gameStartPayload.hostPlayerIndex = hostPlayerIndex;
    }
    if (restoreMetadata.isNonnegativeSafeInteger(hostEpoch)) {
        gameStartPayload.hostEpoch = hostEpoch;
    } else {
        gameStartPayload.hostEpoch = restoreMetadata.normalizeCounter(
            gameStartPayload.hostEpoch
        );
    }
    return gameStartPayload;
}

function _setOnlineHostState(hostPlayerIndex) {
    return onlineComposition.sessionState.setHost(
        Number.isInteger(hostPlayerIndex) && hostPlayerIndex === onlineSessionSnapshot().myOriginalPlayerIndex
    ).isRoomHost;
}

function _persistOnlineHostState(hostPlayerIndex, hostEpoch) {
    const restoreMetadata = /** @type {any} */ (globalThis).OnlineRestoreMetadata;
    const runtimeSession = onlineSessionSnapshot();
    const session = _readOnlineStorageJson(ONLINE_SESSION_STORAGE_KEY, null);
    if (session && typeof session === 'object') {
        session.isRoomHost = runtimeSession.isRoomHost;
        session.reconnectToken = runtimeSession.reconnectToken || session.reconnectToken || '';
        _writeOnlineSessionStorageJson(session, session.roomId || runtimeSession.myRoomId);
    }
    try {
        if (_isOnlineRestoreBundleIncomplete()) return;
        const gameStartPayload = _readOnlineGameStartPayload();
        if (gameStartPayload) {
            if (Number.isInteger(hostPlayerIndex)) {
                gameStartPayload.hostPlayerIndex = hostPlayerIndex;
            }
            gameStartPayload.hostEpoch = restoreMetadata.isNonnegativeSafeInteger(hostEpoch)
                ? hostEpoch
                : restoreMetadata.incrementEpoch(gameStartPayload.hostEpoch);
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
    getGameGeneration: () => onlineSessionSnapshot().gameGeneration,
    getReconnectSnapshot: () => _onlineReconnectRuntime.rawSnapshot(),
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
        onlineClientEffects.showNotice(message, { announce: false });
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
    const connectedSession = onlineComposition.sessionState.setSocket(io());
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
        acceptRoom: value => onlineComposition.sessionState.acceptRoom(value),
        acceptSchema: selection => acceptsNegotiatedGameSchema(selection),
        applyHostPayload: (payload, hostPlayerIndex, hostEpoch) =>
            _applyOnlineHostPayload(payload, hostPlayerIndex, hostEpoch),
        clearHostlessState: () => _hostlessRestoreState.clear(),
        clearPending: () => _clearPendingOutboundAction(),
        clearRejoinRetry: () => _clearRejoinRetry(),
        clearRestoreBundleIncomplete: () => _clearOnlineRestoreBundleIncomplete(),
        clearRestoreEventQueue: () => _clearOnlineRestoreEventQueue(),
        clearRestoreQuarantine: () => _clearOnlineRestoreQuarantine(),
        console,
        defaultLandmarks: () => Player.landmarkNames(),
        finishLobbyRequest: kind => finishOnlineLobbyRequest(kind),
        flushRestoreEvents: (generation, sequence, handlers) =>
            _flushOnlineRestoreEvents(generation, sequence, handlers),
        focusGame: () => UiScreenFocus.focusGameOrPending(document, {
            pendingEligible: typeof isCurrentHumanUiTurn === 'function' &&
                isCurrentHumanUiTurn(),
        }),
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
        roomShare: OnlineRoomShare,
        restoreKeys: ONLINE_STORAGE_KEYS,
        restoreSchemaVersion: ONLINE_RESTORE_SCHEMA_VERSION,
        saveSession: () => saveOnlineSession(),
        setActionFlight: value => _setOnlineActionInFlight(value),
        setCpuSpeed: value => GameSetupState.runtime.setCpuSpeed(value),
        setHostState: hostPlayerIndex => _setOnlineHostState(hostPlayerIndex),
        setOnline: value => onlineComposition.sessionState.setOnline(value),
        setReconnectFlag: value => setOnlineReconnectLegacyFlag(value),
        setGameGeneration: value => onlineComposition.sessionState.setGameGeneration(value),
        resetWinnerPresentation: () => {
            winSoundPlayed = false;
            if (typeof UiWinner !== 'undefined' && UiWinner.gameOriginRuntime) {
                UiWinner.gameOriginRuntime.reset();
            }
        },
        renderWaitingLobby: (statusText, html) =>
            onlineDomEffects.renderWaitingLobby(statusText, html),
        setSchema: selection => onlineSchemaSelectionController.set(selection),
        setStatusText: message => onlineDomEffects.setStatusText(message),
        showGame: () => onlineDomEffects.showGame(),
        startRestore: () => _startOnlineRestore(),
        writeRestoreJson: (key, value) => _writeOnlineRestoreStorageJson(key, value),
    });
    const onlineRejoinPreparationRuntime = OnlineRejoinPreparationRuntime.createRuntime({
        applyHostPayload: (payload, hostPlayerIndex, hostEpoch) =>
            _applyOnlineHostPayload(payload, hostPlayerIndex, hostEpoch),
        applyReconnectStatus: event => {
            _applyOnlineReconnectLifecycleStatusEffectAuthority(event);
        },
        calculateRank: (gameStartPayload, stateSnapshot, actionLog) =>
            _onlineRestoreRank(gameStartPayload, stateSnapshot, actionLog),
        clearRestoreBundleIncomplete: () => _clearOnlineRestoreBundleIncomplete(),
        clearHostlessState: () => _hostlessRestoreState.clear(),
        clearPending: () => _clearPendingOutboundAction(),
        clearQuarantine: () => _clearOnlineRestoreQuarantine(),
        clearRetry: () => _clearRejoinRetry(),
        getDefaultLandmarks: () => Player.landmarkNames(),
        getOriginalPlayerIndex: () => onlineSessionSnapshot().myOriginalPlayerIndex,
        incrementRestoreGeneration: () => _incrementOnlineRestoreGeneration(),
        invalidateCpuSchedule: () => onlineClientEffects.invalidateCpuSchedule(),
        isActionLogPlanAuthorityEnabled: () =>
            isRejoinActionLogPlanAuthorityEnabled(),
        isPendingPlanAuthorityEnabled: () =>
            isPendingReconciliationPlanAuthorityEnabled(),
        isPersistencePlanAuthorityEnabled: () =>
            isOnlineRejoinPersistencePlanAuthorityEnabled(),
        isQueueCarryRequired: () =>
            _onlineRestoreLifecycleController.isInProgress() ||
            _onlineRestoreLifecycleController.isQuarantined(),
        isRestoreOfferPlanAuthorityEnabled: () =>
            isLocalHostRestoreOfferPlanAuthorityEnabled(),
        markRestoreBundleIncomplete: (prepared, storedActionLog) =>
            _markOnlineRestoreBundleIncomplete(prepared, storedActionLog),
        normalizeActionLog: value => _normalizeOnlineActionLog(value),
        observeReconnect: event => _observeOnlineReconnectEvent(event),
        payload: OnlinePayload,
        pendingBelongsToSession: pending =>
            _pendingOutboundActionBelongsToCurrentSession(
                pending,
                { requireRoomId: true }
            ),
        pendingMatchesAccepted: (reference, pending) =>
            _acceptedClientActionMatchesPending(reference, pending),
        readActionLog: () => _readOnlineActionLog(),
        readLocalBundle: () => _readLocalRestoreBundle(),
        readPending: () => _readPendingOutboundAction(),
        readRestoreQueue: () => _readOnlineRestoreEventQueue(),
        reconnectEvents: OnlineReconnectState.events,
        recordDiagnostic: (key, selection) => {
            _onlineDiagnosticSelections[key] = selection;
        },
        recordQueueDiagnostic: selection => {
            _onlineRestoreQueueDiagnostics.write(
                _onlineRestoreQueueDiagnosticKeys.STATE,
                Object.freeze({
                    source: selection.source,
                    matched: selection.matched,
                    fallbackReason: selection.fallbackReason,
                })
            );
        },
        rejoinPersistence: OnlineRejoinPersistence,
        removeRestoreItem: key => _removeOnlineRestoreStorageItem(key),
        replaceEnabledCards: values => replaceEnabledCardSelection(values),
        replaceEnabledLandmarks: values => replaceEnabledLandmarkSelection(values),
        replaceRestoreQueue: queue => _replaceOnlineRestoreEventQueue(queue),
        resetUiLocks: reason => onlineClientEffects.resetUiLocks(reason),
        restoreQueueState: OnlineRestoreQueueState,
        restoreRank: OnlineRestoreRank,
        restoreSchemaVersion: ONLINE_RESTORE_SCHEMA_VERSION,
        sameActionEntry: (left, right) => _sameOnlineActionEntry(left, right),
        saveSession: () => saveOnlineSession(),
        selectPersistenceEffect: selection =>
            _onlineRejoinPersistenceEffectAuthoritySelection(selection),
        selectQueueTransition: (pureTransition, legacyTransition) =>
            _selectOnlineRestoreQueueStateTransition(pureTransition, legacyTransition),
        sendLocalBundle: bundle => _sendRecreateRoomFromBundle(bundle),
        serverActionSeq: (gameStartPayload, stateSnapshot, actionLog) =>
            _serverOnlineActionSeq(gameStartPayload, stateSnapshot, actionLog),
        setActionFlight: value => _setOnlineActionInFlight(value),
        setCpuSpeed: value => GameSetupState.runtime.setCpuSpeed(value),
        setHostState: value => _setOnlineHostState(value),
        setPlayerIndexes: value => onlineComposition.sessionState.setPlayerIndexes(value),
        setReconnectFlag: value => setOnlineReconnectLegacyFlag(value),
        setStatusText: message => onlineDomEffects.setStatusText(message),
        startRestore: () => _startOnlineRestore(),
        storageKeys: ONLINE_STORAGE_KEYS,
        supportsResetUiLocks: () => onlineClientEffects.supportsResetUiLocks(),
        writeRestoreJson: (key, value) => _writeOnlineRestoreStorageJson(key, value),
    });
    const onlineRejoinActivationRuntime = OnlineRejoinActivationRuntime.createRuntime({
        abortRestore: (generation, message) => _abortOnlineRestore(generation, message),
        applyAction: (action, data) => applyReplayedAction(action, data),
        applyReconnectStatus: event => {
            _applyOnlineReconnectLifecycleStatusEffectAuthority(event);
        },
        canResendPending: pending => _canResendPendingOutboundAction(pending),
        clearPending: () => _clearPendingOutboundAction(),
        emitAction: (pending, targetSocket) => onlineSocketEffects.gameAction({
            action: pending.action,
            data: pending.data,
            clientActionId: pending.clientActionId,
        }, targetSocket),
        flushRestoreEvents: (generation, sequence, handlers) =>
            _flushOnlineRestoreEvents(generation, sequence, handlers),
        focusGame: () => UiScreenFocus.focusGameOrPending(document, {
            pendingEligible: typeof isCurrentHumanUiTurn === 'function' &&
                isCurrentHumanUiTurn(),
        }),
        getGame: () => onlineGameRuntimeSnapshot().game,
        getPending: () => _readPendingOutboundActionForCurrentSession(),
        getRestoreEventHandlers: () => ({
            gameAction: handleGameAction,
            actionAccepted: handleActionAccepted,
            hostChanged: handleHostChanged,
        }),
        getRestoreGeneration: () => _onlineRestoreLifecycleController.getGeneration(),
        getSocket: () => onlineSessionSnapshot().socket,
        initGame: (names, settings, order) => initOnlineGame(names, settings, order),
        isActivationPlanAuthorityEnabled: () =>
            isOnlineRestoreActivationPlanAuthorityEnabled(),
        isPendingResendPlanAuthorityEnabled: () =>
            isOnlinePendingResendPlanAuthorityEnabled(),
        isReplayPlanAuthorityEnabled: () =>
            isOnlineRestoreReplayPlanAuthorityEnabled(),
        logTypes: LOG_TYPES,
        observeReconnect: event => _observeOnlineReconnectEvent(event),
        pendingResend: OnlinePendingResend,
        reconnectEvents: OnlineReconnectState.events,
        recordDiagnostic: (key, selection) => {
            _onlineDiagnosticSelections[key] = selection;
        },
        replaceActionSequence: sequence => _onlineActionSequenceController.replace(sequence),
        resetPreviousCoins: () => GameRuntimeState.runtime.setPreviousCoins(null),
        resetReconnectCompletion: () => _onlineReconnectCompletionController.reset(),
        restoreActivation: OnlineRestoreActivation,
        restoreReplay: OnlineRestoreReplay,
        restoreSnapshot: snapshot => restoreOnlineSnapshot(snapshot),
        samePending: (left, right) => _sameOnlineActionEntry(left, right),
        selectActivationEffect: selection =>
            _onlineRestoreActivationEffectAuthoritySelection(selection),
        selectPendingResendEffect: selection =>
            _onlinePendingResendEffectAuthoritySelection(selection),
        selectReplayEffect: selection =>
            _onlineRestoreReplayEffectAuthoritySelection(selection),
        setActionFlight: value => _setOnlineActionInFlight(value),
        setOnline: value => onlineComposition.sessionState.setOnline(value),
        setReconnectFlag: value => setOnlineReconnectLegacyFlag(value),
        setReplaying: value => onlineComposition.sessionState.setReplaying(value),
        setStatusText: message => onlineDomEffects.setStatusText(message),
        showGame: () => onlineDomEffects.showGame(),
    });
    const onlineRejoinRuntime = OnlineRejoinRuntime.createRuntime({
        abortRestore: (generation, message) => _abortOnlineRestore(generation, message),
        acceptSchema: selection => acceptsNegotiatedGameSchema(selection),
        activationRuntime: onlineRejoinActivationRuntime,
        console,
        decodePayload: payload => decodeOnlineGameSchemaSnapshotPayload(payload),
        getRestoreGeneration: () => _onlineRestoreLifecycleController.getGeneration(),
        preloadModels: (playerCount, settings) =>
            preloadOnlineRlModelsForSettings(playerCount, settings),
        preparationRuntime: onlineRejoinPreparationRuntime,
        setSchema: selection => onlineSchemaSelectionController.set(selection),
        setStatusText: message => onlineDomEffects.setStatusText(message),
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
        (players, lobbyState) => onlineLobbyStartRuntime.handlePlayerList(players, lobbyState)
    );

    socketEvents.on(OnlineSocketRegistry.keys.GAME_START, payload => {
        return onlineLobbyStartRuntime.handle(payload);
    });

    socketEvents.on(OnlineSocketRegistry.keys.GAME_ACTION, handleGameAction);
    socketEvents.on(OnlineSocketRegistry.keys.ACTION_ACCEPTED, handleActionAccepted);
    socketEvents.on(OnlineSocketRegistry.keys.ONLINE_REMATCH_STATUS, payload => {
        if (!payload || payload.state === 'cancelled') {
            onlineDomEffects.setStatusText('オンライン再戦は成立しませんでした。');
            return;
        }
        onlineDomEffects.setStatusText(`再戦の同意を待っています（${payload.votes}/${payload.required}）`);
    });
    socketEvents.on(OnlineSocketRegistry.keys.ONLINE_REMATCH_IDENTITY, (payload, acknowledge) => {
        const session = onlineSessionSnapshot();
        if (!payload || payload.roomId !== session.myRoomId ||
                payload.playerIndex !== session.myOriginalPlayerIndex) return;
        onlineComposition.sessionState.setReconnectToken(payload.reconnectToken);
        onlineComposition.sessionState.setGameGeneration(payload.gameGeneration);
        if (saveOnlineSession() && typeof acknowledge === 'function') acknowledge();
    });

    socketEvents.on(
        OnlineSocketRegistry.keys.REJOIN_DATA,
        payload => onlineRejoinRuntime.handle(payload)
    );

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
        const disposition = OnlineHostlessRestoreState.statusDisposition(reason, stage);
        if (disposition === OnlineHostlessRestoreState.statusDispositions.RESTORED) {
            _hostlessRestoreState.clear();
            _clearRejoinRetry();
            setOnlineReconnectLegacyFlag(true);
            onlineDomEffects.setStatusText('♻️ 元のホストが復元しました。再接続しています...');
            _emitOnlineRejoinRequest();
            return;
        }
        if (reason === OnlineHostlessRestoreState.statusReasons.WAITING_FOR_HOST) {
            onlineDomEffects.setStatusText('⏳ 元のホストの復元を60秒待っています...');
            return;
        }
        if (disposition === OnlineHostlessRestoreState.statusDispositions.PROGRESS) {
            onlineDomEffects.setStatusText(
                `⏳ ${candidateCount || 0}人の候補が一致しました。ホスト承認を待っています...`
            );
            return;
        }
        if (disposition === OnlineHostlessRestoreState.statusDispositions.IGNORE) return;
        _hostlessRestoreState.clear();
        if (disposition === OnlineHostlessRestoreState.statusDispositions.RETRYABLE) {
            setOnlineReconnectLegacyFlag(true);
            onlineDomEffects.setStatusText(
                '⚠️ 復元要求が一時的に混み合っています。保存データは保持されています。' +
                '時間をおいて再接続をやり直してください。'
            );
            return;
        }
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
        onlineComposition.sessionState.setSocket(null);
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
                onlineComposition.sessionState.setSocket(null);
            }
        },
    });
    return effectSelection;
}

function _runOnlineReconnectRetryableCleanup(plan) {
    const currentSocket = onlineSessionSnapshot().socket;
    if (currentSocket) {
        currentSocket.disconnect();
        onlineComposition.sessionState.setSocket(null);
    }
    if (plan && plan.clearHostlessPending) _hostlessRestoreState.clear();
    _clearPendingOutboundActionForCurrentSession();
    _setOnlineActionInFlight(false);
    _clearRejoinRetry();
    setOnlineReconnectLegacyFlag(false);
    onlineClientEffects.updateResumeButton();
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
    const recreateErrorPlan = OnlineRetryPolicy.recreateAppErrorPlan(msg, {
        isReconnectingOnline: session.isReconnectingOnline,
        isRoomHost: session.isRoomHost,
        hostlessRestorePending: _hostlessRestoreState.isPending(),
    });
    if (recreateErrorPlan.decision === OnlineRetryPolicy.recreateAppErrorDecisions.RETRYABLE) {
        _runOnlineReconnectRetryableCleanup(recreateErrorPlan);
        onlineDomEffects.setStatusText(
            `⚠️ ${msg} 復元データは保持されています。時間をおいて「続きから」を押してください。`
        );
        return;
    }
    const cleanupSelection = _onlineReconnectCleanupAuthoritySelection(session.isReconnectingOnline);
    if (cleanupSelection.cleanup) {
        _runOnlineReconnectTerminalCleanup(cleanupSelection);
    }
    onlineDomEffects.setStatusText(`❌ ${msg}`);
}

let onlineLobbyRequestRuntime = null;
let onlineLobbyPwaRefreshScheduled = false;

function scheduleOnlineLobbyPwaRefresh() {
    if (onlineLobbyPwaRefreshScheduled) return false;
    onlineLobbyPwaRefreshScheduled = true;
    Promise.resolve().then(() => {
        onlineLobbyPwaRefreshScheduled = false;
        if (typeof refreshPwaUpdateState === 'function') refreshPwaUpdateState();
    });
    return true;
}

function getOnlineLobbyRequestRuntime() {
    if (onlineLobbyRequestRuntime) return onlineLobbyRequestRuntime;
    onlineLobbyRequestRuntime = OnlineLobbyRequestRuntime.createRuntime({
        applyButtonView: (id, view) => onlineDomEffects.applyButtonView(id, view),
        clearTimer: timer => clearTimeout(timer),
        controller: onlineLobbyRequestController,
        createRoom: payload => onlineSocketEffects.createRoom(payload),
        freezeSettings: (settings, playerCount) =>
            freezeOnlinePlayerSettings(settings, playerCount),
        getCapabilities: () => getGameSchemaCapabilitiesForTransport(),
        getClientVersion: () => getClientVersion(),
        getModelPortfolio: () => typeof RLModelPortfolio === 'undefined'
            ? null
            : RLModelPortfolio,
        getSelection: () => GameSelectionState.runtime.snapshot(),
        hostlessRestoreVersion: OnlinePayload.hostlessRestoreVersion,
        ids: OnlineDomEffects.ids,
        initSocket: () => initSocket(),
        inputValue: id => onlineDomEffects.inputValue(id),
        joinRoom: payload => onlineSocketEffects.joinRoom(payload),
        playerSettings: OnlinePlayerSettings,
        requestTimeoutMs: ONLINE_LOBBY_REQUEST_TIMEOUT_MS,
        schedulePwaRefresh: () => scheduleOnlineLobbyPwaRefresh(),
        setHost: value => onlineComposition.sessionState.setHost(value),
        setPlayerName: value => onlineComposition.sessionState.setPlayerName(value),
        setStatusText: message => onlineDomEffects.setStatusText(message),
        setText: (id, text) => onlineDomEffects.setText(id, text),
        setTimer: (callback, delay) => setTimeout(callback, delay),
        setupRuntime: onlineSetupStateController,
        showNotice: (...args) => onlineClientEffects.showNotice(...args),
        warn: (reason, error, asError) => {
            if (typeof console === 'undefined') return;
            if (asError === true && typeof console.error === 'function') {
                console.error(error);
                return;
            }
            if (typeof console.warn === 'function') console.warn(reason, error);
        },
        withCapabilities: (payload, capabilities) =>
            OnlinePayload.withGameSchemaCapabilities(payload, capabilities),
    });
    return onlineLobbyRequestRuntime;
}

function snapshotOnlinePlayerSettings(playerCount) {
    return getOnlineLobbyRequestRuntime().snapshotPlayerSettings(playerCount);
}

function hasOnlineRlCpuSetting(playerCount, settings) {
    return getOnlineLobbyRequestRuntime().hasRlCpu(playerCount, settings);
}

function canPreloadOnlineRlModels() {
    return getOnlineLobbyRequestRuntime().canPreloadModels();
}

function onlineRlModelLoadState(playerCount) {
    return getOnlineLobbyRequestRuntime().modelLoadState(playerCount);
}

function onlineRlModelStatusMessage(state) {
    return getOnlineLobbyRequestRuntime().modelStatusMessage(state);
}

function updateOnlineRlModelReadinessUi() {
    return getOnlineLobbyRequestRuntime().updateReadinessUi();
}

function renderOnlineJoinRoomPending() {
    getOnlineLobbyRequestRuntime().renderJoinPending();
}

function setOnlineJoinRoomPending(pending) {
    getOnlineLobbyRequestRuntime().setJoinPending(pending);
}

function finishOnlineLobbyRequest(kind = '') {
    return getOnlineLobbyRequestRuntime().finish(kind);
}

function beginOnlineLobbyRequest(kind) {
    getOnlineLobbyRequestRuntime().begin(kind);
}

function setOnlineCreateRoomPending(pending) {
    getOnlineLobbyRequestRuntime().setCreatePending(pending);
}

function preloadOnlineRlModelsForSettings(playerCount, settings) {
    return getOnlineLobbyRequestRuntime().preloadForSettings(playerCount, settings);
}

function preloadOnlineRlModelsForCreate(playerCount, settings) {
    return getOnlineLobbyRequestRuntime().preloadForCreate(playerCount, settings);
}

function preloadOnlineRlModelsInBackground(reason = 'online-rl-background-preload') {
    return getOnlineLobbyRequestRuntime().preloadInBackground(reason);
}

function emitCreateRoom(name, playerCount, settings) {
    getOnlineLobbyRequestRuntime().emitCreate(name, playerCount, settings);
}

function showCreateRoom() {
    getOnlineLobbyRequestRuntime().showCreate();
}

function joinRoom() {
    getOnlineLobbyRequestRuntime().join();
}

let onlineGameInitializer = null;

function getOnlineGameInitializer() {
    if (onlineGameInitializer) return onlineGameInitializer;
    onlineGameInitializer = OnlineGameInitializer.createRuntime({
        cancelAutoSkip: () => {
            if (typeof cancelAutoSkip === 'function') cancelAutoSkip();
        },
        cancelCpuSchedule: () => onlineClientEffects.invalidateCpuSchedule(),
        cancelDelayedHumanAction: () => {
            if (typeof cancelDelayedHumanAction === 'function') cancelDelayedHumanAction();
        },
        cards: CARDS,
        createCpu: (difficulty, options) => createOnlineCpuPlayer(difficulty, options),
        createGame: playerCount => new GameManager(playerCount),
        gameRuntime: GameRuntimeState.runtime,
        getSelection: () => GameSelectionState.runtime.snapshot(),
        initialCardStock: (card, playerCount) => getInitialCardStock(card, playerCount),
        landmarkNames: () => Player.landmarkNames(),
        logTypes: LOG_TYPES,
        opponentDifficulties: settings => onlineCpuOpponentDifficultiesFromSettings(settings),
        render: () => onlineClientEffects.render(),
        resetFullLog: () => resetFullLog(),
        resetStatsRecorded: () => {
            if (typeof resetStatsRecorded === 'function') resetStatsRecorded();
        },
        scheduleCpu: () => onlineClientEffects.scheduleCpu(),
        setCurrentPlayerIndex: index =>
            onlineComposition.sessionState.setCurrentPlayerIndex(index),
        setShopStockCount: (stock, card, count) =>
            setShopStockCount(stock, card, count),
        shopStock: SHOP_STOCK,
    });
    return onlineGameInitializer;
}

function initOnlineGame(playerNames, playerSettings, playerOrder) {
    return getOnlineGameInitializer().initialize({
        myOriginalPlayerIndex: onlineSessionSnapshot().myOriginalPlayerIndex,
        playerNames,
        playerOrder,
        playerSettings,
    });
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

let onlineGameEngineRuntime = null;

function getOnlineGameEngineRuntime() {
    if (onlineGameEngineRuntime) return onlineGameEngineRuntime;
    onlineGameEngineRuntime = OnlineGameEngineRuntime.createRuntime({
        adoptSnapshot: snapshot => _adoptOnlineGameEngineShadowSnapshot(snapshot),
        applyMutableAction: (action, data) => applyAction(action, data),
        assignShopStock: (stock, snapshot) => assignShopStockSnapshot(stock, snapshot),
        buildSnapshot: () => buildOnlineSnapshot(),
        buildUndoSnapshot: () => buildOnlineUndoSnapshot(),
        createAdapter: () => _createOnlineGameEngineRuntimeAdapter(),
        engine: GameEngine,
        gameRuntime: GameRuntimeState.runtime,
        getClientShadow: () => typeof GameEngineClientShadow === 'undefined'
            ? null
            : GameEngineClientShadow,
        isAuthorityEnabled: () => isOnlineGameEngineAuthorityEnabled(),
        isShadowEnabled: () => isOnlineGameEngineShadowEnabled(),
        setDiagnostic: outcome => {
            _onlineDiagnosticSelections.onlineGameEngineShadowOutcome = outcome;
        },
        shopStock: SHOP_STOCK,
    });
    return onlineGameEngineRuntime;
}

function _hydrateOnlineGameEngineShadowSnapshot(snapshot) {
    return getOnlineGameEngineRuntime().hydrate(snapshot);
}

function _serializeOnlineGameEngineShadowRuntime(runtime) {
    return getOnlineGameEngineRuntime().serialize(runtime);
}

function _prepareOnlineGameEngineShadow(action, data) {
    return getOnlineGameEngineRuntime().prepare(action, data);
}

function _adoptOnlineGameEngineShadowSnapshot(snapshot) {
    return getOnlineGameEngineRuntime().adopt(snapshot);
}

function _finishOnlineGameEngineShadow(prepared) {
    return getOnlineGameEngineRuntime().finish(prepared);
}

function applyReplayedAction(action, data) {
    return getOnlineGameEngineRuntime().applyReplayed(action, data);
}

function restoreOnlineSnapshot(state) {
    const currentGame = onlineGameRuntimeSnapshot().game;
    if (!state || !currentGame) return false;
    return GameSnapshot.hydrateMutableGameState({
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
        const encodedWire = encodeOnlineGameSchemaAction({
            action, data, clientActionId: pending.clientActionId,
            gameGeneration: session.gameGeneration,
        });
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

function requestOnlineRematch() {
    const session = onlineSessionSnapshot();
    if (!session.socket || session.socket.connected === false ||
            !UiWinner.gameOriginRuntime.wasOnline()) return false;
    onlineSocketEffects.requestOnlineRematch({ approved: true }, session.socket);
    onlineDomEffects.setStatusText('再戦の同意を送信しました。全員の同意を待っています。');
    return true;
}

function declineOnlineRematch() {
    const session = onlineSessionSnapshot();
    if (!session.socket || session.socket.connected === false ||
            !UiWinner.gameOriginRuntime.wasOnline()) return false;
    onlineSocketEffects.requestOnlineRematch({ approved: false }, session.socket);
    onlineDomEffects.setStatusText('オンライン再戦を辞退しました。');
    return true;
}

function _tryRestoreRoom() {
    try {
        if (_isOnlineRestoreBundleIncomplete()) {
            onlineDomEffects.setStatusText('❌ 完全な復元履歴を取得できないため、自動復元を停止しました');
            return false;
        }
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
        if (_isOnlineRestoreBundleIncomplete()) return null;
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
