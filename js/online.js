// オンライン対戦（タイトル画面設定）
let onlineSelectedCount = 2;
let onlinePlayerSettings = [];
let onlineCpuSpeed = 1500;
let onlineCreateRoomPending = false;
let onlineJoinRoomPending = false;
let onlineLobbyRequestTimer = null;
let onlineLobbyRequestKind = '';
let onlineLobbyRequestGeneration = 0;
const ONLINE_LOBBY_REQUEST_TIMEOUT_MS = 15000;
let onlineSocketUnavailableReported = false;
const ONLINE_SNAPSHOT_LOG_LIMIT = 30;

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

function isGameSchemaNegotiationTransportEnabled() {
    return typeof window !== 'undefined' &&
        window.MACHIKORO_GAME_SCHEMA_NEGOTIATION_ENABLED === true;
}

function isGameSchemaWireTransportEnabled() {
    return isGameSchemaNegotiationTransportEnabled() && typeof window !== 'undefined' &&
        window.MACHIKORO_GAME_SCHEMA_WIRE_ENABLED === true;
}

function isGameSchemaSnapshotWireTransportEnabled() {
    return isGameSchemaNegotiationTransportEnabled() && typeof window !== 'undefined' &&
        window.MACHIKORO_GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED === true;
}

function getGameSchemaCapabilitiesForTransport() {
    const enabled = isGameSchemaNegotiationTransportEnabled();
    if (typeof GameSchemaNegotiation === 'undefined') return null;
    return GameSchemaNegotiation.transportCapabilities(enabled);
}

function acceptsNegotiatedGameSchema(selection) {
    if (!isGameSchemaNegotiationTransportEnabled()) return true;
    if (typeof GameSchemaNegotiation === 'undefined') return selection == null;
    return GameSchemaNegotiation.supportsSelection(getGameSchemaCapabilitiesForTransport(), selection);
}

function encodeOnlineGameSchemaAction(payload) {
    const actionEnabled = isGameSchemaWireTransportEnabled();
    if (!actionEnabled) return { ok: true, value: payload };
    if (typeof GameSchemaWire === 'undefined') return { ok: false, reason: 'wire-codec-unavailable' };
    return GameSchemaWire.encodeActionPayload(actionEnabled, false, onlineGameSchemaSelection, payload);
}

function decodeOnlineGameSchemaAction(payload) {
    const actionEnabled = isGameSchemaWireTransportEnabled();
    const snapshotEnabled = isGameSchemaSnapshotWireTransportEnabled();
    if (!actionEnabled && !snapshotEnabled) return { ok: true, value: payload };
    if (typeof GameSchemaWire === 'undefined') return { ok: false, reason: 'wire-codec-unavailable' };
    return GameSchemaWire.decodeActionPayload(
        actionEnabled,
        snapshotEnabled,
        onlineGameSchemaSelection,
        payload
    );
}

function decodeOnlineGameSchemaSnapshotPayload(payload) {
    if (!isGameSchemaSnapshotWireTransportEnabled()) return { ok: true, value: payload };
    if (typeof GameSchemaWire === 'undefined') return { ok: false, reason: 'wire-codec-unavailable' };
    const selection = payload && payload.gameStartPayload && payload.gameStartPayload.gameSchema ||
        onlineGameSchemaSelection;
    return GameSchemaWire.decodeSnapshotField(true, selection, payload);
}

function buildOnlineRejoinPayload(session) {
    return OnlinePayload.buildRejoin(session, getClientVersion(), getGameSchemaCapabilitiesForTransport());
}

function changeOnlineCount(delta) {
    onlineSelectedCount = Math.min(10, Math.max(2, onlineSelectedCount + delta));
    document.getElementById("onlinePlayerCount").textContent = onlineSelectedCount;
    renderOnlinePlayerSettings();
    preloadOnlineRlModelsInBackground('online-player-count-preload');
}

function getOnlineRlCpuSettingNote(playerCount) {
    return OnlinePlayerSettings.rlSettingNote(playerCount);
}

function renderOnlinePlayerSettings() {
    onlinePlayerSettings = Array.from(OnlinePlayerSettings.normalizeSettings(
        onlinePlayerSettings,
        onlineSelectedCount
    ));
    document.getElementById("onlinePlayerSettings").innerHTML = OnlinePlayerSettings.buildSettingsHtml(
        onlinePlayerSettings,
        onlineSelectedCount
    );
    updateOnlineRlModelReadinessUi();
}

function onChangeOnlinePlayerType(index, value) {
    if (value === "human") {
        onlinePlayerSettings[index] = { type: "human", difficulty: "normal" };
    } else {
        onlinePlayerSettings[index] = { type: "cpu", difficulty: value };
    }
    updateOnlineRlModelReadinessUi();
    if (value === "rl") preloadOnlineRlModelsInBackground('online-rl-selected-preload');
}

// オンライン対戦（セッション状態）— resetOnlineState() でまとめてリセット
let socket = null;
let isOnlineGame = false;
let isRoomHost = false;
let myPlayerIndex = -1;
let myOriginalPlayerIndex = -1;
let myPlayerName = '';
let myRoomId = null;
let reconnectToken = '';
let isReplaying = false;
let isReconnectingOnline = false;

function setOnlineReconnectLegacyFlag(value) {
    isReconnectingOnline = value === true;
    return isReconnectingOnline;
}
let onlineActionInFlight = false;
let onlineActionInFlightAt = 0;
let _onlineActionTimeoutTimer = null;
let onlineGameSchemaSelection = null;
let _rejoinRetryCount = 0;
let _rejoinRetryTimer = null;
let _rejoinRetryDeadline = 0;
let _rejoinRetryExhausted = false;
let _hostlessRestorePending = false;
let _onlineRestoreGeneration = 0;
let _onlineRestoreInProgress = false;
let _onlineRestoreEventQueue = [];
let _lastAppliedOnlineActionSeqMemory = 0;
let _flushingOnlineRestoreEvents = false;
let _onlineRestoreQuarantined = false;
const _pendingOutboundActionsMemory = new Map();
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
const _onlineRejoinTimerController = OnlineRetryPolicy.createRejoinTimerController({
    setTimer: typeof setTimeout === 'function' ? setTimeout : null,
    clearTimer: typeof clearTimeout === 'function' ? clearTimeout : null,
    now: () => Date.now(),
});
let _onlineReconnectCompleted = false;

function _onlineReconnectObservationFlags() {
    const connected = !!socket && socket.connected !== false;
    return {
        failed: _rejoinRetryExhausted,
        completed: _onlineReconnectCompleted,
        replaying: isReplaying,
        restoring: _onlineRestoreInProgress,
        rejoining: isReconnectingOnline && connected,
        connecting: isReconnectingOnline && !connected,
        active: isOnlineGame,
    };
}

function _observeOnlineReconnectEvent(event) {
    const observation = _onlineReconnectController.observe(event, _onlineReconnectObservationFlags());
    _applyOnlineReconnectEffectAuthority(isReconnectingOnline);
    return observation;
}

function isOnlineReconnectEventAuthorityEnabled() {
    return typeof window !== 'undefined' &&
        window.MACHIKORO_ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED === true;
}

function isOnlineReconnectEffectAuthorityEnabled() {
    return typeof window !== 'undefined' &&
        window.MACHIKORO_ONLINE_RECONNECT_EFFECT_AUTHORITY_ENABLED === true;
}

function isOnlineReconnectTimerAuthorityEnabled() {
    return typeof window !== 'undefined' &&
        window.MACHIKORO_ONLINE_RECONNECT_TIMER_AUTHORITY_ENABLED === true;
}

function isOnlineReconnectCallbackAuthorityEnabled() {
    return typeof window !== 'undefined' &&
        window.MACHIKORO_ONLINE_RECONNECT_CALLBACK_AUTHORITY_ENABLED === true;
}

function _onlineReconnectEffectSelection(legacyValue = isReconnectingOnline) {
    return OnlineReconnectState.selectEffectAuthority(
        _onlineReconnectController.snapshot(),
        legacyValue === true,
        { effectAuthorityEnabled: isOnlineReconnectEffectAuthorityEnabled() }
    );
}

function _applyOnlineReconnectEffectAuthority(legacyValue = isReconnectingOnline) {
    const selection = _onlineReconnectEffectSelection(legacyValue);
    if (selection.reconnecting !== isReconnectingOnline) {
        setOnlineReconnectLegacyFlag(selection.reconnecting);
    }
    return selection;
}

function _onlineReconnectTimerAuthoritySelection() {
    const effectSelection = _onlineReconnectEffectSelection(isReconnectingOnline);
    const enabled = isOnlineReconnectTimerAuthorityEnabled();
    const active = enabled && effectSelection.source === 'event';
    return Object.freeze({
        source: active ? 'event' : (enabled ? 'legacy-fallback' : 'legacy'),
        ready: effectSelection.ready,
        fallbackReason: effectSelection.fallbackReason,
        pending: active
            ? _onlineRejoinTimerController.hasPending()
            : !!_rejoinRetryTimer,
        deadline: active
            ? _onlineRejoinTimerController.getDeadline()
            : _rejoinRetryDeadline,
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
        effectAuthority: _onlineReconnectEffectSelection(isReconnectingOnline),
        timerAuthority: _onlineReconnectTimerAuthoritySelection(),
        callbackAuthority: _onlineReconnectCallbackAuthoritySelection(),
    });
}

function isOnlineReconnectInputBlocked() {
    if (!isOnlineReconnectEventAuthorityEnabled()) return !!isReconnectingOnline;
    getOnlineReconnectState();
    const selection = _onlineReconnectAuthoritySelection();
    if (selection.source !== 'event') return !!isReconnectingOnline;
    return OnlineReconnectState.blocksInput(selection.state);
}

function _maxOnlineRestoreActionSeq(gameStart, snapshot, actionLog, pendingAction) {
    const logSeq = Array.isArray(actionLog)
        ? actionLog.reduce((max, entry) => Number.isInteger(entry && entry.seq) ? Math.max(max, entry.seq) : max, 0)
        : 0;
    return Math.max(
        Number.isInteger(gameStart && gameStart.actionSeq) ? gameStart.actionSeq : 0,
        Number.isInteger(snapshot && snapshot.actionSeq) ? snapshot.actionSeq : 0,
        logSeq,
        Number.isInteger(pendingAction && pendingAction.seq) ? pendingAction.seq : 0
    );
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
    getCurrentRoomId: () => myRoomId,
    sessionKey: ONLINE_SESSION_STORAGE_KEY,
    storageKeys: ONLINE_STORAGE_KEYS,
    roomIndexKey: ONLINE_RESTORE_ROOM_INDEX_KEY,
    roomIndexSchemaVersion: ONLINE_RESTORE_ROOM_INDEX_SCHEMA_VERSION,
    roomKeySeparator: ONLINE_ROOM_STORAGE_KEY_SEPARATOR,
    maxRestoreActionSeq: _maxOnlineRestoreActionSeq,
});

function _normalizeOnlineRoomId(roomId) {
    return onlineStorage.normalizeRoomId(roomId);
}

function _isKnownOnlineGameAction(action) {
    if (typeof action !== 'string') return false;
    if (typeof GAME_ACTION_REGISTRY === 'undefined') return true;
    return !!GAME_ACTION_REGISTRY[action];
}

function _onlineRoomStorageKey(key, roomId = myRoomId) {
    return onlineStorage.roomStorageKey(key, roomId);
}

function _onlineRoomStorageKeys(key, roomId = myRoomId) {
    return onlineStorage.roomStorageKeys(key, roomId);
}

function _writeOnlineRoomStorageJson(key, value, roomId = myRoomId) {
    return onlineStorage.writeRoomStorageJson(key, value, roomId);
}

function _removeOnlineRoomStorageItem(key, roomId = myRoomId) {
    return onlineStorage.removeRoomStorageItem(key, roomId);
}

function _writeOnlineRestoreStorageJson(key, value, roomId = myRoomId) {
    return onlineStorage.writeRestoreStorageJson(key, value, roomId);
}

function _removeOnlineRestoreStorageItem(key, roomId = myRoomId) {
    return onlineStorage.removeRestoreStorageItem(key, roomId);
}

function _writeOnlineSessionStorageJson(value, roomId = myRoomId) {
    return onlineStorage.writeSessionStorageJson(value, roomId);
}

function _removeOnlineSessionStorageItem(roomId = myRoomId) {
    return onlineStorage.removeSessionStorageItem(roomId);
}

function _readOnlineStorageJson(key, fallback = null) {
    return onlineStorage.readStorageJson(key, fallback);
}

function _readOnlineRoomStorageJson(key, fallback = null, roomId = myRoomId) {
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

function _refreshOnlineRestoreRoomIndex(roomId = myRoomId, now = Date.now()) {
    return onlineStorage.refreshRestoreRoomIndex(roomId, now);
}

function _removeOnlineRestoreRoomIndexEntry(roomId = myRoomId) {
    return onlineStorage.removeRestoreRoomIndexEntry(roomId);
}

function _pruneOnlineRestoreRoomIndex() {
    return onlineStorage.pruneRestoreRoomIndex();
}

function _clearOnlineRestoreBundle() {
    const roomIdBeforeClear = myRoomId;
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
    return _isOnlineReconnectTimerAuthorityActive()
        ? _onlineRejoinTimerController.hasPending()
        : !!_rejoinRetryTimer;
}

function _onlineRejoinTimerDeadline() {
    return _isOnlineReconnectTimerAuthorityActive()
        ? _onlineRejoinTimerController.getDeadline()
        : _rejoinRetryDeadline;
}

function _clearOnlineRejoinTimer() {
    _onlineRejoinTimerController.clear();
    if (_rejoinRetryTimer && typeof clearTimeout === 'function') {
        clearTimeout(_rejoinRetryTimer);
    }
    _rejoinRetryTimer = null;
    _rejoinRetryDeadline = 0;
}

function _clearRejoinRetry() {
    _rejoinRetryCount = 0;
    _rejoinRetryExhausted = false;
    _clearOnlineRejoinTimer();
}

function _finishRejoinRetryTimeout() {
    if (_hostlessRestorePending) return true;
    if (_requestHostlessRestore()) {
        const waitingEl = document.getElementById("onlineStatus");
        if (waitingEl) {
            waitingEl.textContent = '⏳ 元のホストを60秒待機後、参加者データの一致確認を開始します...';
        }
        return true;
    }
    _clearOnlineRejoinTimer();
    _rejoinRetryExhausted = true;
    const el = document.getElementById("onlineStatus");
    if (el) el.textContent = '❌ 再接続がタイムアウトしました。再接続をやり直すか、タイトルへ戻ってください。';
    // Canonical state is unknown. Keep all game input and host CPU blocked.
    setOnlineReconnectLegacyFlag(true);
    _observeOnlineReconnectEvent(OnlineReconnectState.events.RETRY_EXHAUSTED);
    cpuScheduleToken++;
    try { if (typeof render === 'function') render(); } catch (_) {}
    return false;
}

function _handleOnlineRejoinResponseTimeout() {
    _rejoinRetryTimer = null;
    _rejoinRetryDeadline = 0;
    let shouldExhaust = false;
    if (_isOnlineReconnectCallbackAuthorityActive()) {
        const decision = OnlineRetryPolicy.rejoinTimeoutDecision(
            isReconnectingOnline,
            _rejoinRetryCount
        );
        if (decision === OnlineRetryPolicy.timeoutDecisions.IGNORE) return;
        shouldExhaust = decision === OnlineRetryPolicy.timeoutDecisions.EXHAUST;
    } else {
        if (!isReconnectingOnline) return;
        shouldExhaust = OnlineRetryPolicy.isRejoinExhausted(_rejoinRetryCount);
    }
    if (shouldExhaust) {
        _finishRejoinRetryTimeout();
        return;
    }
    const session = typeof readOnlineSession === 'function' ? readOnlineSession() : null;
    _emitOnlineRejoinRequest(session);
}

function _armOnlineRejoinResponseTimeout() {
    if (_hasOnlineRejoinTimer() || _rejoinRetryExhausted || typeof setTimeout !== 'function') return true;
    if (_isOnlineReconnectTimerAuthorityActive()) {
        return _onlineRejoinTimerController.arm(
            _handleOnlineRejoinResponseTimeout,
            ONLINE_REJOIN_RETRY_DELAY_MS
        ).armed;
    }
    _rejoinRetryDeadline = OnlineRetryPolicy.rejoinDeadline(Date.now());
    _rejoinRetryTimer = setTimeout(
        _handleOnlineRejoinResponseTimeout,
        ONLINE_REJOIN_RETRY_DELAY_MS
    );
    return true;
}

function _clearOnlineActionTimeout() {
    onlineActionInFlightAt = 0;
    if (_onlineActionTimeoutTimer && typeof clearTimeout === 'function') {
        clearTimeout(_onlineActionTimeoutTimer);
    }
    _onlineActionTimeoutTimer = null;
}

function _setOnlineActionInFlight(value) {
    onlineActionInFlight = value === true;
    _clearOnlineActionTimeout();
    if (!onlineActionInFlight) return;
    onlineActionInFlightAt = Date.now();
    if (typeof setTimeout === 'function') {
        _onlineActionTimeoutTimer = setTimeout(_handleOnlineActionTimeout, ONLINE_ACTION_ACK_TIMEOUT_MS);
    }
}

function _emitOnlineRejoinRequest(sessionOverride = null) {
    const session = sessionOverride || {
        roomId: myRoomId,
        playerIndex: myOriginalPlayerIndex,
        playerName: myPlayerName,
        reconnectToken,
    };
    if (!socket || !session.roomId || session.playerIndex < 0 || !session.playerName || !session.reconnectToken) return false;
    setOnlineReconnectLegacyFlag(true);
    _observeOnlineReconnectEvent(OnlineReconnectState.events.RECONNECT_REQUESTED);
    if (socket.connected === false) return true;
    if (OnlineRetryPolicy.isRejoinExhausted(_rejoinRetryCount)) return _finishRejoinRetryTimeout();
    _clearOnlineRejoinTimer();
    _rejoinRetryCount++;
    socket.emit('rejoinRoom', buildOnlineRejoinPayload(session));
    _armOnlineRejoinResponseTimeout();
    return true;
}

function resumeOnlineReconnectAfterPageActivation() {
    if (!isReconnectingOnline || _rejoinRetryExhausted) return false;
    if (!socket || socket.connected === false) return false;
    if (_hasOnlineRejoinTimer() && _onlineRejoinTimerDeadline() > Date.now()) return false;
    _clearOnlineRejoinTimer();
    return _emitOnlineRejoinRequest();
}

function _handleOnlineActionTimeout() {
    if (!onlineActionInFlight) return false;
    _setOnlineActionInFlight(false);
    if (!isOnlineGame) return false;
    setOnlineReconnectLegacyFlag(true);
    cpuScheduleToken++;
    const el = document.getElementById("onlineStatus");
    if (el) el.textContent = '⚠️ サーバー応答がタイムアウトしました。状態を再同期しています...';
    return _emitOnlineRejoinRequest();
}

function markOnlineGameFinished() {
    _onlineReconnectCompleted = true;
    isOnlineGame = false;
    setOnlineReconnectLegacyFlag(false);
    _setOnlineActionInFlight(false);
    _clearRejoinRetry();
    _observeOnlineReconnectEvent(OnlineReconnectState.events.GAME_COMPLETED);
}

function resetOnlineState() {
    _onlineReconnectCompleted = false;
    finishOnlineLobbyRequest();
    const roomIdBeforeReset = myRoomId;
    cpuScheduleToken++;
    if (socket) { socket.disconnect(); socket = null; }
    isOnlineGame = false;
    isRoomHost = false;
    myPlayerIndex = -1;
    myOriginalPlayerIndex = -1;
    myRoomId = null;
    reconnectToken = '';
    onlineGameSchemaSelection = null;
    isReplaying = false;
    setOnlineReconnectLegacyFlag(false);
    _setOnlineActionInFlight(false);
    _clearPendingOutboundAction(roomIdBeforeReset);
    _clearRejoinRetry();
    _hostlessRestorePending = false;
    _onlineRestoreGeneration++;
    _onlineRestoreInProgress = false;
    _onlineRestoreEventQueue = [];
    _lastAppliedOnlineActionSeqMemory = 0;
    _flushingOnlineRestoreEvents = false;
    _onlineRestoreQuarantined = false;
    _pendingOutboundActionsMemory.clear();
    _observeOnlineReconnectEvent(OnlineReconnectState.events.RESET);
}

function _saveActionLog(action, data, options = {}) {
    try {
        let log = _readOnlineActionLog();
        const seq = Number.isInteger(options.seq) ? options.seq : _nextOnlineActionSeq(log);
        if (Number.isInteger(options.seq) && options.alreadyApplied) {
            _writeOnlineGameStartPatch({ actionSeq: seq });
        }
        if (log.length >= ONLINE_ACTION_LOG_LIMIT && game) {
            const snapshot = buildOnlineSnapshot();
            if (snapshot) {
                _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.stateSnapshot, snapshot);
                _removeOnlineRestoreStorageItem(ONLINE_STORAGE_KEYS.restoreAudit);
            }
        }
        if (Number.isInteger(options.seq) && !options.alreadyApplied) {
            _writeOnlineGameStartPatch({ actionSeq: seq });
        }
        const entry = { action, data };
        if (Number.isInteger(options.playerIndex)) entry.playerIndex = options.playerIndex;
        if (typeof options.clientActionId === 'string') entry.clientActionId = options.clientActionId;
        if (options.restoreActionAudit && typeof options.restoreActionAudit === 'object') entry.restoreActionAudit = options.restoreActionAudit;
        entry.seq = seq;
        log.push(entry);
        const serverSnapshotSeq = Number.isInteger(options.stateSnapshot?.actionSeq) ? options.stateSnapshot.actionSeq : null;
        if (options.stateSnapshot && options.restoreAudit && Number.isInteger(serverSnapshotSeq)) {
            _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.stateSnapshot, options.stateSnapshot);
            _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.restoreAudit, options.restoreAudit);
            log = log.filter(item => !Number.isInteger(item.seq) || item.seq > serverSnapshotSeq);
            _writeOnlineGameStartPatch({ actionSeq: Math.max(seq, serverSnapshotSeq) });
        }
        _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.actionLog, log);
    } catch(e) {}
}

function _normalizeOnlineActionLog(value) {
    return OnlinePayload.normalizeActionLog(value);
}

function _readOnlineActionLog() {
    return _normalizeOnlineActionLog(_readOnlineRoomStorageJson(ONLINE_STORAGE_KEYS.actionLog, []));
}

function _savePendingOutboundAction(action, data) {
    const entry = {
        action,
        data,
        playerIndex: myOriginalPlayerIndex,
        roomId: myRoomId,
        seq: _nextOnlineActionSeq(),
        clientActionId: _createOnlineClientActionId(),
    };
    const memoryKey = _normalizeOnlineRoomId(entry.roomId) || '';
    _pendingOutboundActionsMemory.set(memoryKey, entry);
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
    const payload = _readOnlineGameStartPayload();
    const snapshot = _readOnlineStateSnapshot();
    const snapshotSeq = Number.isInteger(snapshot?.actionSeq) ? snapshot.actionSeq : 0;
    const actionLog = log || _readOnlineActionLog();
    const logSeq = actionLog.reduce((max, entry) => Number.isInteger(entry.seq) ? Math.max(max, entry.seq) : max, 0);
    return Math.max(
        _lastAppliedOnlineActionSeqMemory,
        Number.isInteger(payload?.actionSeq) ? payload.actionSeq : 0,
        snapshotSeq,
        logSeq
    );
}

function _lastAppliedOnlineActionSeq(log = null) {
    const snapshot = _readOnlineStateSnapshot();
    const snapshotSeq = Number.isInteger(snapshot?.actionSeq) ? snapshot.actionSeq : 0;
    const actionLog = log || _readOnlineActionLog();
    const storedSeq = actionLog.reduce(
        (max, entry) => Number.isInteger(entry.seq) ? Math.max(max, entry.seq) : max,
        snapshotSeq
    );
    _lastAppliedOnlineActionSeqMemory = Math.max(_lastAppliedOnlineActionSeqMemory, storedSeq);
    return _lastAppliedOnlineActionSeqMemory;
}

function _setLastAppliedOnlineActionSeq(seq) {
    if (Number.isInteger(seq)) {
        _lastAppliedOnlineActionSeqMemory = Math.max(_lastAppliedOnlineActionSeqMemory, seq);
    }
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
    const seq = _currentOnlineActionSeq(log) + 1;
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
    const currentRoomKey = _normalizeOnlineRoomId(myRoomId) || '';
    if (_pendingOutboundActionsMemory.has(currentRoomKey)) {
        return _pendingOutboundActionsMemory.get(currentRoomKey);
    }
    const stored = _normalizePendingOutboundAction(_readOnlineRoomStorageJson(ONLINE_STORAGE_KEYS.pendingAction, null));
    if (stored) {
        const storedRoomKey = _normalizeOnlineRoomId(stored.roomId) || currentRoomKey;
        _pendingOutboundActionsMemory.set(storedRoomKey, stored);
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

function _clearPendingOutboundAction(roomId = myRoomId) {
    const memoryKey = _normalizeOnlineRoomId(roomId) || '';
    _pendingOutboundActionsMemory.delete(memoryKey);
    try {
        _removeOnlineStorageItem(ONLINE_STORAGE_KEYS.pendingAction);
        _removeOnlineRoomStorageItem(ONLINE_STORAGE_KEYS.pendingAction, roomId);
    } catch (e) {}
}

function _pendingOutboundActionBelongsToCurrentSession(entry, options = {}) {
    return OnlinePayload.pendingBelongsToSession(entry, myRoomId, Object.assign({
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

function _queueOnlineEventDuringRestore(type, payload) {
    if (!_onlineRestoreInProgress && !_onlineRestoreQuarantined) return false;
    if (_onlineRestoreEventQueue.length >= ONLINE_RESTORE_EVENT_QUEUE_LIMIT) {
        _abortOnlineRestore(_onlineRestoreGeneration, '復元中の操作が多すぎるため、状態を再同期しています...', []);
        return true;
    }
    _onlineRestoreEventQueue.push({ type, payload, generation: _onlineRestoreGeneration });
    return true;
}


function _abortOnlineRestore(generation, statusMessage, queuedEvents = null) {
    if (generation !== _onlineRestoreGeneration) return;
    _onlineRestoreInProgress = false;
    _onlineRestoreQuarantined = true;
    _onlineRestoreEventQueue = Array.isArray(queuedEvents) ? queuedEvents : [];
    setOnlineReconnectLegacyFlag(true);
    const el = document.getElementById("onlineStatus");
    if (el && statusMessage) el.textContent = statusMessage;
    if (!_emitOnlineRejoinRequest()) _scheduleRejoinRetry();
}

function _flushOnlineRestoreEvents(generation, restoredThroughSeq, handlers) {
    if (generation !== _onlineRestoreGeneration) return false;
    const queuedEvents = _onlineRestoreEventQueue;
    _onlineRestoreEventQueue = [];
    _onlineRestoreInProgress = false;
    _flushingOnlineRestoreEvents = true;
    try {
        for (let index = 0; index < queuedEvents.length; index++) {
            const event = queuedEvents[index];
            if (event.generation !== generation) continue;
            if (Number.isInteger(event.payload?.seq) && event.payload.seq <= restoredThroughSeq) continue;
            const handler = handlers[event.type];
            if (typeof handler === 'function' && handler(event.payload) === false) {
                _abortOnlineRestore(generation, '操作の適用に失敗したため、状態を再同期しています...', queuedEvents.slice(index));
                return false;
            }
        }
    } finally {
        _flushingOnlineRestoreEvents = false;
    }
    render();
    scheduleCPU();
    _onlineRestoreQuarantined = false;
    return true;
}

function _appendPendingForRestore(actionLog, pending) {
    return OnlinePayload.appendPendingForRestore(actionLog, pending, {
        currentRoomId: myRoomId,
        normalizeRoomId: _normalizeOnlineRoomId,
    });
}

function _canResendPendingOutboundAction(pending) {
    return OnlinePayload.canResendPendingOutboundAction(pending, {
        currentRoomId: myRoomId,
        normalizeRoomId: _normalizeOnlineRoomId,
        game,
        originalPlayerIndex: myOriginalPlayerIndex,
        playerIndex: myPlayerIndex,
        cpuPlayers,
        isRoomHost,
    });
}

function buildOnlineSnapshot() {
    if (!game) return null;
    return GameSnapshot.serializeGameState(game, SHOP_STOCK, {
        undoState,
        actionSeq: _currentOnlineActionSeq(),
        logLimit: ONLINE_SNAPSHOT_LOG_LIMIT,
        pendingActionsFor: (typeof GameManager !== 'undefined' &&
                typeof GameManager.serializedPendingActionsFor === 'function')
            ? GameManager.serializedPendingActionsFor
            : () => [],
    });
}

function buildOnlineUndoSnapshot() {
    if (!game) return null;
    return GameSnapshot.serializeUndoState(game, SHOP_STOCK, ONLINE_SNAPSHOT_LOG_LIMIT);
}

function saveOnlineSession() {
    if (!myRoomId || myOriginalPlayerIndex < 0 || !myPlayerName || !reconnectToken) return;
    try {
        _writeOnlineSessionStorageJson({
            roomId: myRoomId,
            playerIndex: myOriginalPlayerIndex,
            playerName: myPlayerName,
            reconnectToken,
            isRoomHost,
        });
        updateResumeButton();
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
    isRoomHost = Number.isInteger(hostPlayerIndex) && hostPlayerIndex === myOriginalPlayerIndex;
    return isRoomHost;
}

function _persistOnlineHostState(hostPlayerIndex, hostEpoch) {
    const session = _readOnlineStorageJson(ONLINE_SESSION_STORAGE_KEY, null);
    if (session && typeof session === 'object') {
        session.isRoomHost = isRoomHost;
        session.reconnectToken = reconnectToken || session.reconnectToken || '';
        _writeOnlineSessionStorageJson(session, session.roomId || myRoomId);
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

// オンライン対戦（Socket.IO）
function initSocket() {
    if (socket) return true;
    if (typeof io !== 'function') {
        const message = 'オンライン機能を読み込めませんでした。サーバーURLから開き直してください。';
        showNotice(message);
        const el = document.getElementById("onlineStatus");
        if (el) el.textContent = `❌ ${message}`;
        if (!onlineSocketUnavailableReported) {
            onlineSocketUnavailableReported = true;
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
    socket = io();

    socket.on('roomCreated', ({ roomId, playerIndex, reconnectToken: token }) => {
        finishOnlineLobbyRequest('create');
        myOriginalPlayerIndex = playerIndex;
        myPlayerIndex = playerIndex;
        myRoomId = roomId;
        reconnectToken = token;
        saveOnlineSession();
        document.getElementById("onlineStatus").innerHTML = `
            <div>ルームを作成しました！</div>
            <div class="room-id-display">${roomId}</div>
            <div class="waiting-players">プレイヤーを待っています...</div>`;
    });

    socket.on('roomJoined', ({ roomId, playerIndex, reconnectToken: token }) => {
        finishOnlineLobbyRequest('join');
        myOriginalPlayerIndex = playerIndex;
        myPlayerIndex = playerIndex;
        myRoomId = roomId;
        reconnectToken = token;
        saveOnlineSession();
        document.getElementById("onlineStatus").textContent = `ルーム ${roomId} に参加しました！`;
    });

    socket.on('playerList', (players) => {
        document.getElementById("onlineStatus").innerHTML = `
            <div class="room-id-display">${myRoomId}</div>
            <div class="waiting-players">プレイヤー: ${players.join('、')} (${players.length}人)</div>`;
    });

    socket.on('gameStart', ({ playerNames, playerSettings: ps, cpuSpeed: cs, playerOrder, enabledCards: ec, enabledLandmarks: el, versions, reconnectTokenHashes, hostPlayerIndex, hostEpoch, actionSeq, hostlessRestoreCapabilities, hostlessRestoreGeneration, hostlessRestoreCount, gameSchema }) => {
        if (!acceptsNegotiatedGameSchema(gameSchema)) {
            document.getElementById("onlineStatus").textContent = 'ゲーム状態のschema versionに対応していません。アプリを更新してください。';
            return;
        }
        onlineGameSchemaSelection = gameSchema || null;
        _clearRejoinRetry();
        _hostlessRestorePending = false;
        _onlineRestoreQuarantined = false;
        const startGeneration = ++_onlineRestoreGeneration;
        _onlineRestoreInProgress = true;
        _onlineRestoreEventQueue = [];
        const gameStartPayload = _applyOnlineHostPayload({
            schemaVersion: ONLINE_RESTORE_SCHEMA_VERSION, playerNames, playerSettings: ps,
            cpuSpeed: cs, playerOrder, enabledCards: ec ? [...ec] : null,
            enabledLandmarks: el || null, versions, reconnectTokenHashes, hostPlayerIndex,
            actionSeq: Number.isInteger(actionSeq) ? actionSeq : 0,
            hostlessRestoreCapabilities,
            hostlessRestoreGeneration: Number.isInteger(hostlessRestoreGeneration)
                ? hostlessRestoreGeneration : 0,
            hostlessRestoreCount: Number.isInteger(hostlessRestoreCount)
                ? hostlessRestoreCount : 0,
        }, hostPlayerIndex, hostEpoch);
        if (gameSchema) gameStartPayload.gameSchema = gameSchema;
        const startOnlineGame = () => {
            if (startGeneration !== _onlineRestoreGeneration) return;
            _onlineReconnectCompleted = false;
            isOnlineGame = true;
            _setOnlineHostState(hostPlayerIndex);
            cpuSpeed = cs || 1500;
            if (ec) enabledCards = new Set(ec);
            enabledLandmarks = new Set((el && el.length > 0) ? el : Player.landmarkNames());
            try {
                _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.gameStart, gameStartPayload);
                _removeOnlineRestoreStorageItem(ONLINE_STORAGE_KEYS.stateSnapshot);
                _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.actionLog, []);
                _clearPendingOutboundAction();
            } catch(e) {}
            saveOnlineSession();
            if (typeof resetUiLocksForGameReset === 'function') resetUiLocksForGameReset('online-game-start-reset-ui-locks');
            document.getElementById("titleScreen").style.display = "none";
            document.getElementById("gameScreen").style.display = "block";
            initOnlineGame(playerNames, ps, playerOrder);
            if (typeof notifyGameLifecycleStart === 'function') notifyGameLifecycleStart();
            // バージョン不一致チェック（initOnlineGame後にgameが初期化されてから）
            if (versions && versions.length > 1) {
                const unique = [...new Set(versions)];
                if (unique.length > 1) {
                    game.addLog(LOG_TYPES.SYSTEM, '⚠️ バージョン不一致: ゲームが正常に動作しない可能性があります。全員アプリをリロードしてください。');
                }
            }
            _lastAppliedOnlineActionSeqMemory = Number.isInteger(actionSeq) ? actionSeq : 0;
            const flushed = _flushOnlineRestoreEvents(startGeneration, _lastAppliedOnlineActionSeqMemory, {
                gameAction: handleGameAction,
                actionAccepted: handleActionAccepted,
                hostChanged: handleHostChanged,
            });
            if (flushed) {
                _observeOnlineReconnectEvent(OnlineReconnectState.events.GAME_ACTIVATED);
            }
        };
        const preload = preloadOnlineRlModelsForSettings(playerNames.length, ps || []);
        if (preload && typeof preload.then === "function") {
            document.getElementById("onlineStatus").textContent = '深層学習AIモデルを読み込んでいます。';
            preload.then(startOnlineGame).catch(error => {
                if (startGeneration !== _onlineRestoreGeneration) return;
                console.error(error);
                isOnlineGame = false;
                _setOnlineActionInFlight(false);
                _abortOnlineRestore(startGeneration, "深層学習AIモデルを読み込めませんでした。再接続して再試行します。");
            });
            return;
        }
        startOnlineGame();
    });

    const handleGameAction = wirePayload => {
        const decodedWire = decodeOnlineGameSchemaAction(wirePayload);
        if (!decodedWire.ok) {
            setOnlineReconnectLegacyFlag(true);
            if (!_emitOnlineRejoinRequest()) _scheduleRejoinRetry();
            return false;
        }
        const { action, data, playerIndex, seq, clientActionId, restoreActionAudit, stateSnapshot, restoreAudit } = decodedWire.value;
        const payload = { action, data, playerIndex, seq, clientActionId, restoreActionAudit, stateSnapshot, restoreAudit };
        if (_queueOnlineEventDuringRestore('gameAction', payload)) return;
        if (!game) {
            setOnlineReconnectLegacyFlag(true);
            const el = document.getElementById("onlineStatus");
            if (el) el.textContent = '⚠️ ゲーム状態を準備できていないため、再接続しています...';
            _emitOnlineRejoinRequest();
            return !_flushingOnlineRestoreEvents;
        }
        const lastAppliedSeq = _lastAppliedOnlineActionSeq();
        if (Number.isInteger(seq) && seq <= lastAppliedSeq) return;
        if (Number.isInteger(seq) && seq !== lastAppliedSeq + 1) {
            setOnlineReconnectLegacyFlag(true);
            cpuScheduleToken++;
            const el = document.getElementById("onlineStatus");
            if (el) el.textContent = "操作の欠落を検知したため、状態を再同期しています...";
            if (!_emitOnlineRejoinRequest()) _scheduleRejoinRetry();
            return !_flushingOnlineRestoreEvents;
        }
        try {
            applyReplayedAction(action, data);
        } catch (error) {
            console.error(error);
            setOnlineReconnectLegacyFlag(true);
            cpuScheduleToken++;
            if (!_flushingOnlineRestoreEvents && !_emitOnlineRejoinRequest()) _scheduleRejoinRetry();
            return false;
        }
        _setLastAppliedOnlineActionSeq(seq);
        _saveActionLog(action, data, { playerIndex, seq, clientActionId, restoreActionAudit, stateSnapshot, restoreAudit });
        if (!_flushingOnlineRestoreEvents) {
            render();
            scheduleCPU();
        }
        return true;
    };
    socket.on('gameAction', handleGameAction);

    const handleActionAccepted = wirePayload => {
        const decodedWire = decodeOnlineGameSchemaAction(wirePayload);
        if (!decodedWire.ok) {
            _setOnlineActionInFlight(false);
            setOnlineReconnectLegacyFlag(true);
            if (!_emitOnlineRejoinRequest()) _scheduleRejoinRetry();
            return false;
        }
        const { action, data, playerIndex, seq, clientActionId, restoreActionAudit, stateSnapshot, restoreAudit } = decodedWire.value;
        const payload = { action, data, playerIndex, seq, clientActionId, restoreActionAudit, stateSnapshot, restoreAudit };
        if (_queueOnlineEventDuringRestore('actionAccepted', payload)) return;
        const pendingBeforeAccept = _readPendingOutboundActionForCurrentSession();
        if (!_shouldClearPendingForAcceptedAction(payload, pendingBeforeAccept)) return;
        _setOnlineActionInFlight(false);
        if (!game) {
            setOnlineReconnectLegacyFlag(true);
            const el = document.getElementById("onlineStatus");
            if (el) el.textContent = '⚠️ ゲーム状態を準備できていないため、再接続してください。';
            return !_flushingOnlineRestoreEvents;
        }
        const lastAppliedSeq = _lastAppliedOnlineActionSeq();
        if (Number.isInteger(seq) && seq <= lastAppliedSeq) {
            _clearPendingOutboundAction();
            return;
        }
        if (Number.isInteger(seq) && seq !== lastAppliedSeq + 1) {
            setOnlineReconnectLegacyFlag(true);
            cpuScheduleToken++;
            if (!_emitOnlineRejoinRequest()) _scheduleRejoinRetry();
            return !_flushingOnlineRestoreEvents;
        }
        try {
            applyReplayedAction(action, data);
        } catch (error) {
            console.error(error);
            setOnlineReconnectLegacyFlag(true);
            cpuScheduleToken++;
            if (!_flushingOnlineRestoreEvents && !_emitOnlineRejoinRequest()) _scheduleRejoinRetry();
            return false;
        }
        _setLastAppliedOnlineActionSeq(seq);
        _saveActionLog(action, data, { alreadyApplied: true, playerIndex, seq, clientActionId, restoreActionAudit, stateSnapshot, restoreAudit });
        _clearPendingOutboundAction();
        if (!_flushingOnlineRestoreEvents) {
            render();
            scheduleCPU();
        }
        return true;
    };
    socket.on('actionAccepted', handleActionAccepted);

    socket.on('rejoinData', rejoinPayload => {
        const decodedSnapshotPayload = decodeOnlineGameSchemaSnapshotPayload(rejoinPayload);
        if (!decodedSnapshotPayload.ok) {
            document.getElementById("onlineStatus").textContent =
                '復元データのSnapshot schema versionに対応していません。再接続してください。';
            return;
        }
        const {
            gameStartPayload, stateSnapshot, actionLog, acceptedClientActions,
            playerIndex, hostPlayerIndex, hostEpoch, restoreAudit, provisionalRestore,
        } = decodedSnapshotPayload.value;
        if (!gameStartPayload || !acceptsNegotiatedGameSchema(gameStartPayload.gameSchema)) {
            document.getElementById("onlineStatus").textContent = '復元データのschema versionに対応していません。アプリを更新してください。';
            return;
        }
        onlineGameSchemaSelection = gameStartPayload.gameSchema || null;
        const carriedEvents = (_onlineRestoreInProgress || _onlineRestoreQuarantined)
            ? _onlineRestoreEventQueue.slice()
            : [];
        const restoreGeneration = ++_onlineRestoreGeneration;
        _onlineRestoreInProgress = true;
        _observeOnlineReconnectEvent(OnlineReconnectState.events.RESTORE_STARTED);
        _onlineRestoreQuarantined = false;
        _onlineRestoreEventQueue = carriedEvents.map(event => ({
            type: event.type,
            payload: event.payload,
            generation: restoreGeneration,
        }));
        _clearRejoinRetry();
        _hostlessRestorePending = false;
        const { playerNames, playerSettings: ps, cpuSpeed: cs, playerOrder, enabledCards: ec, enabledLandmarks: el } = gameStartPayload;
        const replayActionLog = _normalizeOnlineActionLog(actionLog);
        const restoredThroughSeq = _serverOnlineActionSeq(gameStartPayload, stateSnapshot, replayActionLog);
        const localBundle = _readLocalRestoreBundle();
        if (localBundle && localBundle.gameStartPayload.hostPlayerIndex === myOriginalPlayerIndex) {
            const localRank = _onlineRestoreRank(localBundle.gameStartPayload, localBundle.stateSnapshot, localBundle.actionLog);
            const serverRank = _onlineRestoreRank(gameStartPayload, stateSnapshot, replayActionLog);
            const canOfferLocalHostBundle = hostPlayerIndex === myOriginalPlayerIndex || localRank.hostEpoch > serverRank.hostEpoch;
            if (canOfferLocalHostBundle && _isOnlineRestoreRankNewer(localRank, serverRank)) {
                setOnlineReconnectLegacyFlag(true);
                document.getElementById("onlineStatus").textContent = '♻️ より新しいローカル復元データをサーバーへ送信しています...';
                _sendRecreateRoomFromBundle(localBundle);
                return;
            }
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
        const pendingCompactedIntoSnapshot = pendingBeforeRejoin &&
            typeof pendingBeforeRejoin.clientActionId !== 'string' &&
            Number.isInteger(pendingBeforeRejoin.seq) &&
            Number.isInteger(stateSnapshot?.actionSeq) &&
            stateSnapshot.actionSeq >= pendingBeforeRejoin.seq;
        const pendingAcceptedById = pendingBeforeRejoin && Array.isArray(acceptedClientActions) &&
            acceptedClientActions.some(ref => _acceptedClientActionMatchesPending(ref, pendingBeforeRejoin));
        const pendingAccepted = !pendingBeforeRejoin ||
            replayActionLog.some(entry => _sameOnlineActionEntry(entry, pendingBeforeRejoin)) ||
            pendingCompactedIntoSnapshot ||
            pendingAcceptedById;
        const persistRejoinBundle = () => {
            _setOnlineActionInFlight(false);
            if (pendingAccepted) _clearPendingOutboundAction();
            _clearRejoinRetry();
            cpuSpeed = cs || 1500;
            if (ec) enabledCards = new Set(ec);
            enabledLandmarks = new Set((el && el.length > 0) ? el : Player.landmarkNames());
            myOriginalPlayerIndex = playerIndex;
            myPlayerIndex = playerIndex;
            _setOnlineHostState(hostPlayerIndex);
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
                _writeOnlineRestoreStorageJson(
                    ONLINE_STORAGE_KEYS.actionLog,
                    shouldKeepUnsignedFullLog ? storedActionLog : replayActionLog
                );
            } catch(e) {}
            saveOnlineSession();
            cpuScheduleToken++;
            if (typeof resetUiLocksForGameReset === 'function') resetUiLocksForGameReset('online-rejoin-reset-ui-locks');
        };

        const restoreOnlineGame = () => {
            if (restoreGeneration !== _onlineRestoreGeneration) return;
            persistRejoinBundle();
            document.getElementById("titleScreen").style.display = "none";
            document.getElementById("gameScreen").style.display = "block";

            let restoredOk = false;
            try {
                // 既存ゲームをリプレイで再構築（render/scheduleCPUを抑制）
                isReplaying = true;
                _observeOnlineReconnectEvent(OnlineReconnectState.events.REPLAY_STARTED);
                initOnlineGame(playerNames, ps, playerOrder);
                if (stateSnapshot) {
                    restoreOnlineSnapshot(stateSnapshot);
                }
                for (const { action, data } of replayActionLog) {
                    applyReplayedAction(action, data);
                }
                if (provisionalRestore) {
                    game.addLog(LOG_TYPES.SYSTEM, '⚠️ 参加者データの全一致確認により暫定復元しました');
                }
                restoredOk = true;
            } catch (e) {
                document.getElementById("onlineStatus").textContent = '❌ 復元データの再生に失敗しました。再接続してください。';
                setOnlineReconnectLegacyFlag(true);
            } finally {
                isReplaying = false;
            }
            if (!restoredOk) {
                _abortOnlineRestore(restoreGeneration, "復元データの再生に失敗しました。再接続して再試行します。");
                return;
            }
            _onlineReconnectCompleted = false;
            isOnlineGame = true;
            setOnlineReconnectLegacyFlag(false);
            prevCoins = null;
            _lastAppliedOnlineActionSeqMemory = restoredThroughSeq;
            if (!_flushOnlineRestoreEvents(restoreGeneration, restoredThroughSeq, {
                gameAction: handleGameAction,
                actionAccepted: handleActionAccepted,
                hostChanged: handleHostChanged,
            })) return;
            _observeOnlineReconnectEvent(OnlineReconnectState.events.RESTORE_ACTIVATED);
            if (pendingBeforeRejoin && !pendingAccepted &&
                _sameOnlineActionEntry(_readPendingOutboundActionForCurrentSession(), pendingBeforeRejoin) &&
                socket && socket.connected !== false) {
                if (!_canResendPendingOutboundAction(pendingBeforeRejoin)) {
                    _clearPendingOutboundAction();
                    return;
                }
                _setOnlineActionInFlight(true);
                socket.emit('gameAction', {
                    action: pendingBeforeRejoin.action,
                    data: pendingBeforeRejoin.data,
                    clientActionId: pendingBeforeRejoin.clientActionId,
                });
            }
        };
        const preload = preloadOnlineRlModelsForSettings(playerNames.length, ps || []);
        if (preload && typeof preload.then === "function") {
            document.getElementById("onlineStatus").textContent = '深層学習AIモデルを読み込んでいます。';
            preload.then(restoreOnlineGame).catch(error => {
                if (restoreGeneration !== _onlineRestoreGeneration) return;
                console.error(error);
                _abortOnlineRestore(restoreGeneration, "深層学習AIモデルを読み込めませんでした。再接続して再試行します。");
            });
            return;
        }
        restoreOnlineGame();
    });

    const hostlessEvents = OnlinePayload.hostlessRestoreEvents;
    socket.on(hostlessEvents.COLLECT, ({ roomId, generation }) => {
        if (roomId !== myRoomId) return;
        const el = document.getElementById("onlineStatus");
        if (el) el.textContent = '♻️ 参加者間の復元データ一致を確認しています...';
        if (!_submitHostlessRestoreCandidate(generation) && el) {
            el.textContent = '❌ 復元候補の世代が一致しません。保存データは削除されていません。';
        }
    });

    socket.on(hostlessEvents.CONFIRMATION, ({ roomId, candidateCount }) => {
        if (roomId !== myRoomId) return;
        const message =
            `${candidateCount || 0}人の参加者データが完全一致しました。あなたを新しいホストとして暫定復元しますか？`;
        const respond = approved => {
            if (!socket || socket.connected === false) return;
            socket.emit(hostlessEvents.CONFIRM, {
                roomId,
                approved: approved === true,
            });
        };
        if (typeof showConfirm !== 'function' ||
                showConfirm(message, () => respond(true), () => respond(false)) !== true) {
            respond(false);
        }
    });

    socket.on(hostlessEvents.STATUS, ({ roomId, reason, stage, candidateCount }) => {
        if (roomId && roomId !== myRoomId) return;
        const el = document.getElementById("onlineStatus");
        if (reason === 'host-restored') {
            _hostlessRestorePending = false;
            _clearRejoinRetry();
            setOnlineReconnectLegacyFlag(true);
            if (el) el.textContent = '♻️ 元のホストが復元しました。再接続しています...';
            _emitOnlineRejoinRequest();
            return;
        }
        if (reason === 'waiting-for-host') {
            if (el) el.textContent = '⏳ 元のホストの復元を60秒待っています...';
            return;
        }
        if (stage === 'confirming' && reason === 'quorum-ready') {
            if (el) el.textContent =
                `⏳ ${candidateCount || 0}人の候補が一致しました。ホスト承認を待っています...`;
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
        _hostlessRestorePending = false;
        _rejoinRetryExhausted = true;
        setOnlineReconnectLegacyFlag(true);
        _observeOnlineReconnectEvent(OnlineReconnectState.events.RETRY_EXHAUSTED);
        if (el) {
            el.textContent = '❌ ' + OnlinePayload.hostlessRestoreStatusMessage(reason) +
                ' 再接続をやり直すか、タイトル画面から保存データを明示的に破棄できます。';
        }
    });

    socket.on(hostlessEvents.APPROVED, ({ roomId, hostPlayerIndex }) => {
        if (roomId !== myRoomId) return;
        _hostlessRestorePending = false;
        if (hostPlayerIndex === myOriginalPlayerIndex) return;
        _clearRejoinRetry();
        setOnlineReconnectLegacyFlag(true);
        const el = document.getElementById("onlineStatus");
        if (el) el.textContent = '♻️ 暫定復元したルームへ再接続しています...';
        _emitOnlineRejoinRequest();
    });

    socket.on('playerRejoined', ({ playerIndex, playerName }) => {
        if (playerIndex !== myOriginalPlayerIndex) {
            game && game.addLog(LOG_TYPES.SYSTEM, `🔌 ${playerName}が再接続しました`);
        }
        render();
    });

    socket.on('playerDisconnected', ({ playerIndex, playerName }) => {
        const name = playerName || `プレイヤー${playerIndex + 1}`;
        game && game.addLog(LOG_TYPES.SYSTEM, `🔌 ${name}が切断しました`);
        render();
    });

    const handleHostChanged = ({ newHostPlayerIndex, hostEpoch }) => {
        if (_queueOnlineEventDuringRestore("hostChanged", { newHostPlayerIndex, hostEpoch })) return;
        if (_setOnlineHostState(newHostPlayerIndex)) {
            game && game.addLog(LOG_TYPES.SYSTEM, `👑 あなたがホストになりました`);
            render();
            scheduleCPU();
        } else {
            cpuScheduleToken++;
        }
        _persistOnlineHostState(newHostPlayerIndex, hostEpoch);
    };
    socket.on("hostChanged", handleHostChanged);

    socket.on("connect", () => {
        const el = document.getElementById("onlineStatus");
        if (el && el.textContent.startsWith('⏳')) el.textContent = '';
        if ((isOnlineGame || isReconnectingOnline || _onlineRestoreInProgress) && myRoomId && myOriginalPlayerIndex >= 0 && myPlayerName && reconnectToken) {
            setOnlineReconnectLegacyFlag(true);
            _emitOnlineRejoinRequest();
        }
    });

    socket.on('disconnect', () => {
        finishOnlineLobbyRequest();
        if (!isOnlineGame && !_onlineRestoreInProgress) return;
        if (_onlineRestoreInProgress) {
            _onlineRestoreGeneration++;
            _onlineRestoreInProgress = false;
            _onlineRestoreQuarantined = true;
            _onlineRestoreEventQueue = [];
        }
        setOnlineReconnectLegacyFlag(true);
        _setOnlineActionInFlight(false);
        cpuScheduleToken++;
        const el = document.getElementById("onlineStatus");
        _observeOnlineReconnectEvent(OnlineReconnectState.events.SOCKET_DISCONNECTED);
        if (el) el.textContent = '⏳ 接続が切れました。再接続しています...';
    });

    socket.on('connect_error', () => {
        document.getElementById("onlineStatus").textContent =
            '⏳ サーバーに接続中です。初回は起動に30秒ほどかかる場合があります...';
    });

    socket.on(APP_ERROR_EVENT, handleAppError);
    return true;
}

function handleAppError(msg) {
    finishOnlineLobbyRequest();
    _setOnlineActionInFlight(false);
    setOnlineCreateRoomPending(false);
    if (msg === 'ROOM_NOT_FOUND' && isReconnectingOnline) {
        if (isRoomHost) {
            if (!_tryRestoreRoom()) _scheduleRejoinRetry();
        } else {
            _scheduleRejoinRetry();
        }
        return;
    }
    if (msg === '無効な操作です' && isOnlineGame && socket && myRoomId && myOriginalPlayerIndex >= 0 && myPlayerName && reconnectToken) {
        _clearPendingOutboundActionForCurrentSession({ requireExplicitRoomId: true });
        setOnlineReconnectLegacyFlag(true);
        cpuScheduleToken++;
        document.getElementById("onlineStatus").textContent = '⚠️ 操作がサーバーで拒否されました。状態を再同期しています...';
        _emitOnlineRejoinRequest();
        return;
    }
    if (isReconnectingOnline) {
        _clearPendingOutboundActionForCurrentSession();
        setOnlineReconnectLegacyFlag(false);
        _removeOnlineSessionStorageItem();
        _clearOnlineRestoreBundle();
        updateResumeButton();
        if (socket) {
            socket.disconnect();
            socket = null;
        }
    }
    document.getElementById("onlineStatus").textContent = `❌ ${msg}`;
}

function snapshotOnlinePlayerSettings(playerCount = onlineSelectedCount) {
    return OnlinePlayerSettings.snapshot(onlinePlayerSettings, playerCount);
}

function hasOnlineRlCpuSetting(playerCount = onlineSelectedCount, settings = onlinePlayerSettings) {
    return OnlinePlayerSettings.hasRlCpu(settings, playerCount);
}

function canPreloadOnlineRlModels() {
    return typeof RLModelPortfolio !== "undefined" && typeof RLModelPortfolio.preloadEligibleModels === "function";
}

function onlineRlModelLoadState(playerCount = onlineSelectedCount) {
    if (!hasOnlineRlCpuSetting(playerCount)) return { status: 'unused', ready: 0, total: 0, errors: [] };
    if (!canPreloadOnlineRlModels()) return { status: 'failed', ready: 0, total: 0, errors: ['RL model loader is not available'] };
    if (typeof RLModelPortfolio.eligibleLoadState === "function") return RLModelPortfolio.eligibleLoadState(playerCount);
    return { status: 'idle', ready: 0, total: 1, errors: [] };
}

function onlineRlModelStatusMessage(state) {
    if (!state || state.status === 'unused') return '';
    if (state.status === 'ready') return '深層学習AIモデルの準備が完了しました。';
    if (state.status === 'loading') return '深層学習AIモデルを読み込んでいます。';
    if (state.status === 'failed') return '深層学習AIモデルを読み込めませんでした。再試行してください。';
    return '深層学習AIモデルをルーム作成時に読み込みます。';
}

function updateOnlineRlModelReadinessUi() {
    const state = onlineRlModelLoadState(onlineSelectedCount);
    const btn = typeof document !== 'undefined' && document.getElementById ? document.getElementById('onlineCreateSubmitButton') : null;
    const status = typeof document !== 'undefined' && document.getElementById ? document.getElementById('onlineRlModelStatus') : null;
    if (btn && !onlineCreateRoomPending) {
        if (state.status === 'loading') {
            btn.disabled = true;
            btn.textContent = 'モデル読み込み中';
        } else {
            btn.disabled = false;
            btn.textContent = state.status === 'failed' ? 'モデルを再試行' : 'ルームを作る';
        }
    }
    if (status) status.textContent = onlineRlModelStatusMessage(state);
    return state;
}

function setOnlineJoinRoomPending(pending) {
    onlineJoinRoomPending = pending === true;
    const btn = typeof document !== 'undefined' && document.getElementById
        ? document.getElementById('onlineJoinSubmitButton')
        : null;
    if (btn) {
        btn.disabled = onlineJoinRoomPending;
        btn.textContent = onlineJoinRoomPending ? '参加中' : '参加する';
    }
}

function finishOnlineLobbyRequest(kind = '') {
    if (kind && onlineLobbyRequestKind && kind !== onlineLobbyRequestKind) return false;
    onlineLobbyRequestGeneration++;
    if (onlineLobbyRequestTimer) clearTimeout(onlineLobbyRequestTimer);
    onlineLobbyRequestTimer = null;
    onlineLobbyRequestKind = '';
    setOnlineCreateRoomPending(false);
    setOnlineJoinRoomPending(false);
    return true;
}

function beginOnlineLobbyRequest(kind) {
    finishOnlineLobbyRequest();
    onlineLobbyRequestKind = kind;
    const generation = ++onlineLobbyRequestGeneration;
    if (kind === 'create') setOnlineCreateRoomPending(true);
    if (kind === 'join') setOnlineJoinRoomPending(true);
    onlineLobbyRequestTimer = setTimeout(() => {
        if (generation !== onlineLobbyRequestGeneration || onlineLobbyRequestKind !== kind) return;
        finishOnlineLobbyRequest(kind);
        const status = document.getElementById('onlineStatus');
        if (status) status.textContent = '⚠️ サーバー応答がありません。もう一度お試しください。';
        showNotice('サーバー応答がタイムアウトしました。通信状態を確認してもう一度お試しください。');
    }, ONLINE_LOBBY_REQUEST_TIMEOUT_MS);
}

function setOnlineCreateRoomPending(pending) {
    onlineCreateRoomPending = pending === true;
    const btn = typeof document !== 'undefined' && document.getElementById ? document.getElementById('onlineCreateSubmitButton') : null;
    if (onlineCreateRoomPending) {
        if (btn) {
            btn.disabled = true;
            btn.textContent = '作成中';
        }
        return;
    }
    updateOnlineRlModelReadinessUi();
}

function preloadOnlineRlModelsForSettings(playerCount, settings) {
    if (!hasOnlineRlCpuSetting(playerCount, settings)) return null;
    if (!canPreloadOnlineRlModels()) return Promise.reject(new Error("RL model loader is not available"));
    return RLModelPortfolio.preloadEligibleModels(playerCount, { attempts: 3 });
}

function preloadOnlineRlModelsForCreate(playerCount, settings = onlinePlayerSettings) {
    return preloadOnlineRlModelsForSettings(playerCount, settings);
}

function preloadOnlineRlModelsInBackground(reason = 'online-rl-background-preload') {
    if (!hasOnlineRlCpuSetting(onlineSelectedCount) || !canPreloadOnlineRlModels()) {
        updateOnlineRlModelReadinessUi();
        return null;
    }
    updateOnlineRlModelReadinessUi();
    const preload = RLModelPortfolio.preloadEligibleModels(onlineSelectedCount, { attempts: 3, retryDelayMs: 0 });
    if (preload && typeof preload.then === "function") {
        preload.then(() => updateOnlineRlModelReadinessUi()).catch(error => {
            if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn(reason, error);
            updateOnlineRlModelReadinessUi();
        });
    }
    updateOnlineRlModelReadinessUi();
    return preload;
}

function emitCreateRoom(name, playerCount = onlineSelectedCount, settings = onlinePlayerSettings) {
    myPlayerName = name;
    onlineCpuSpeed = parseInt(document.getElementById("onlineCpuSpeed").value);
    if (!initSocket()) return;
    beginOnlineLobbyRequest('create');
    isRoomHost = true;
    const createPayload = {
        playerName: name,
        playerCount,
        playerSettings: freezeOnlinePlayerSettings(settings, playerCount),
        cpuSpeed: onlineCpuSpeed,
        enabledCards: [...enabledCards],
        enabledLandmarks: [...enabledLandmarks],
        clientVersion: getClientVersion(),
        hostlessRestoreVersion: OnlinePayload.hostlessRestoreVersion,
    };
    socket.emit('createRoom', OnlinePayload.withGameSchemaCapabilities(
        createPayload, getGameSchemaCapabilitiesForTransport()
    ));
}

function showCreateRoom() {
    if (onlineCreateRoomPending) return;
    const name = document.getElementById("playerNameInput").value.trim();
    if (!name) { showNotice("名前を入力してください"); return; }
    const createPlayerCount = onlineSelectedCount;
    const createPlayerSettings = snapshotOnlinePlayerSettings(createPlayerCount);
    const state = updateOnlineRlModelReadinessUi();
    if (state.status === 'loading') {
        showNotice("深層学習AIモデルを読み込んでいます。");
        return;
    }
    const preload = preloadOnlineRlModelsForCreate(createPlayerCount, createPlayerSettings);
    if (preload && typeof preload.then === "function") {
        onlineCreateRoomPending = true;
        const btn = document.getElementById("onlineCreateSubmitButton");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "モデル読み込み中";
        }
        showNotice("深層学習AIモデルを読み込んでいます。");
        preload
            .then(() => {
                onlineCreateRoomPending = false;
                updateOnlineRlModelReadinessUi();
                emitCreateRoom(name, createPlayerCount, createPlayerSettings);
            })
            .catch(error => {
                onlineCreateRoomPending = false;
                console.error(error);
                updateOnlineRlModelReadinessUi();
                showNotice("深層学習AIモデルを読み込めませんでした。通信状態を確認してもう一度部屋を作成してください。");
            });
        return;
    }
    emitCreateRoom(name, createPlayerCount, createPlayerSettings);
}

function joinRoom() {
    if (onlineJoinRoomPending) return;
    const name = document.getElementById("playerNameInput").value.trim();
    const roomId = document.getElementById("roomIdInput").value.trim().toUpperCase();
    if (!name) { showNotice("名前を入力してください"); return; }
    if (roomId.length !== 6) { showNotice("ルームIDは6文字です"); return; }
    myPlayerName = name;
    isRoomHost = false;
    if (!initSocket()) return;
    beginOnlineLobbyRequest('join');
    const joinPayload = {
        roomId,
        playerName: name,
        clientVersion: getClientVersion(),
        hostlessRestoreVersion: OnlinePayload.hostlessRestoreVersion,
    };
    socket.emit('joinRoom', OnlinePayload.withGameSchemaCapabilities(
        joinPayload, getGameSchemaCapabilitiesForTransport()
    ));
}

function initOnlineGame(playerNames, ps, playerOrder) {
    const count = playerNames.length;
    cpuScheduleToken++;
    if (typeof cancelDelayedHumanAction === 'function') cancelDelayedHumanAction();
    if (typeof cancelAutoSkip === 'function') cancelAutoSkip();
    prevCoins = null;
    undoState = null;
    resetFullLog();
    if (typeof resetStatsRecorded === "function") {
        resetStatsRecorded();
    }
    game = new GameManager(count);
    game.enabledLandmarks = new Set(enabledLandmarks.size > 0 ? enabledLandmarks : Player.landmarkNames());
    for (const card of CARDS) {
        setShopStockCount(SHOP_STOCK, card, enabledCards.has(card.name) ? getInitialCardStock(card, count) : 0);
    }

    // playerOrderに従ってプレイヤー名とCPU設定を設定
    const order = playerOrder || playerNames.map((_, i) => i);
    for (let i = 0; i < count; i++) {
        const originalIndex = order[i];
        game.players[i].name = playerNames[originalIndex];
    }

    // CPU設定をorderに合わせて反映
    if (ps && ps.length > 0) {
        const orderedSettings = order.map(originalIndex => ps[originalIndex] || null);
        const opponentDifficulties = onlineCpuOpponentDifficultiesFromSettings(orderedSettings);
        cpuPlayers = orderedSettings.map(s => {
            return s && s.type === "cpu"
                ? createOnlineCpuPlayer(s.difficulty, { expertPurpose: "live", playerCount: count, expertOpponentDifficulties: opponentDifficulties, rlModelId: s.rlModelId || s.modelId || null })
                : null;
        });
    } else {
        cpuPlayers = game.players.map(() => null);
    }

    // myPlayerIndexをシャッフル後の位置に更新
    // order[i] === 元のindex なので、自分の元indexがorderの何番目かを探す
    myPlayerIndex = order.indexOf(myOriginalPlayerIndex);
    if (myPlayerIndex === -1) myPlayerIndex = 0; // 見つからない場合はホスト

    game.addLog(LOG_TYPES.SYSTEM, `👤 ${game.currentPlayer().name}のターン`);
    render();
    scheduleCPU();
}

function applyAction(action, data) {
    return GameEngine.applyMutableAction({
        game,
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
        undoState = buildOnlineUndoSnapshot();
    }
    applyAction(action, data);
    if (action === 'undoBuild' || action === 'nextTurn') {
        undoState = null;
    }
}

function restoreOnlineSnapshot(state) {
    if (!state || !game) return;
    GameSnapshot.hydrateMutableGameState({
        game,
        shopStock: SHOP_STOCK,
        state,
        createCardByName,
        assignShopStockSnapshot,
        normalizePlayerCoins: value => value,
        readDormantIndices: value => value || [],
        readLandmarks: value => value || {},
        readLog: value => value || [],
        normalizeCurrentPlayerIndex: value => value || 0,
        onUndoState: value => { undoState = value; },
    });
}

function sendAction(action, data = {}) {
    if (isOnlineGame && socket) {
        if (isOnlineReconnectInputBlocked() || onlineActionInFlight || socket.connected === false) return false;
        _setOnlineActionInFlight(true);
        cpuScheduleToken++;
        const pending = _savePendingOutboundAction(action, data);
        const encodedWire = encodeOnlineGameSchemaAction({ action, data, clientActionId: pending.clientActionId });
        if (!encodedWire.ok) {
            _setOnlineActionInFlight(false);
            _clearPendingOutboundAction();
            return false;
        }
        socket.emit('gameAction', encodedWire.value);
        return true;
    }
    return !isOnlineGame;
}

function _tryRestoreRoom() {
    try {
        const gameStartPayload = _readOnlineGameStartPayload();
        if (!gameStartPayload) {
            document.getElementById("onlineStatus").textContent = '❌ 復元データが見つかりません';
            return;
        }
        if (gameStartPayload.schemaVersion !== ONLINE_RESTORE_SCHEMA_VERSION ||
                !Array.isArray(gameStartPayload.reconnectTokenHashes)) {
            _clearOnlineRestoreBundle();
            document.getElementById("onlineStatus").textContent = '❌ 古い復元データのため再接続できません';
            return;
        }
        const isStoredHost = gameStartPayload.hostPlayerIndex === myOriginalPlayerIndex;
        if (!isStoredHost) return false;
        const restoreAudit = _readOnlineRestoreAudit();
        const stateSnapshot = restoreAudit ? _readOnlineStateSnapshot() : null;
        const actionLog = _readOnlineActionLog();
        document.getElementById("onlineStatus").textContent = '♻️ サーバー再起動を検知。ゲームを復元中...';
        socket.emit('recreateRoom', {
            roomId: myRoomId,
            gameStartPayload,
            stateSnapshot,
            actionLog,
            restoreAudit,
            playerIndex: myOriginalPlayerIndex,
            playerName: myPlayerName,
            reconnectToken,
        });
        return true;
    } catch(e) {
        document.getElementById("onlineStatus").textContent = '❌ 復元に失敗しました';
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
    return {
        roomId: myRoomId,
        playerIndex: myOriginalPlayerIndex,
        playerName: myPlayerName,
        reconnectToken,
    };
}

function _requestHostlessRestore() {
    if (!socket || socket.connected === false || _hostlessRestorePending) return false;
    const bundle = _readLocalRestoreBundle();
    const payload = OnlinePayload.buildHostlessRestoreRequest(
        bundle,
        _onlineHostlessRestoreIdentity()
    );
    if (!payload) return false;
    _hostlessRestorePending = true;
    setOnlineReconnectLegacyFlag(true);
    socket.emit(OnlinePayload.hostlessRestoreEvents.REQUEST, payload);
    return true;
}

function _submitHostlessRestoreCandidate(generation) {
    const bundle = _readLocalRestoreBundle();
    if (!bundle || bundle.gameStartPayload.hostlessRestoreGeneration !== generation) {
        return false;
    }
    const payload = OnlinePayload.buildHostlessRestoreCandidate(
        bundle,
        _onlineHostlessRestoreIdentity()
    );
    if (!payload || !socket || socket.connected === false) return false;
    socket.emit(OnlinePayload.hostlessRestoreEvents.CANDIDATE, payload);
    return true;
}

function _sendRecreateRoomFromBundle(bundle) {
    socket.emit('recreateRoom', {
        roomId: myRoomId,
        gameStartPayload: bundle.gameStartPayload,
        stateSnapshot: bundle.stateSnapshot,
        actionLog: bundle.actionLog,
        restoreAudit: bundle.restoreAudit,
        playerIndex: myOriginalPlayerIndex,
        playerName: myPlayerName,
        reconnectToken,
    });
}

function _scheduleRejoinRetry() {
    if (OnlineRetryPolicy.isRejoinExhausted(_rejoinRetryCount)) return _finishRejoinRetryTimeout();
    const el = document.getElementById("onlineStatus");
    if (el) el.textContent = OnlineRetryPolicy.rejoinWaitingMessage(_rejoinRetryCount);
    return _armOnlineRejoinResponseTimeout();
}
