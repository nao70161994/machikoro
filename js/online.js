// オンライン対戦（タイトル画面設定）
let onlineSelectedCount = 2;
let onlinePlayerSettings = [];
let onlineCpuSpeed = 1500;
const ONLINE_SNAPSHOT_LOG_LIMIT = 30;

function createOnlineCpuPlayer(difficulty, options = {}) {
    if (typeof createCpuPlayer === "function") {
        return createCpuPlayer(difficulty, options);
    }
    return new CPU(difficulty, options);
}

function onlineCpuOpponentDifficultiesFromSettings(settings) {
    return settings.map(setting => {
        if (!setting || setting.type !== "cpu") return "human";
        return setting.difficulty || "normal";
    });
}

function freezeOnlinePlayerSettings(settings, playerCount) {
    return settings.map(setting => {
        if (!setting || setting.type !== "cpu") return setting;
        const frozen = Object.assign({}, setting);
        if (frozen.difficulty === "rl" && !frozen.rlModelId && typeof RLModelPortfolio !== "undefined") {
            const model = RLModelPortfolio.selectRandomModel(playerCount);
            if (model) frozen.rlModelId = model.id;
        }
        return frozen;
    });
}

function getClientVersion() {
    return (typeof window !== "undefined" && window.MACHIKORO_CLIENT_VERSION) || "unknown";
}

function changeOnlineCount(delta) {
    onlineSelectedCount = Math.min(10, Math.max(2, onlineSelectedCount + delta));
    document.getElementById("onlinePlayerCount").textContent = onlineSelectedCount;
    renderOnlinePlayerSettings();
}

function getOnlineRlCpuSettingNote(playerCount) {
    if (typeof getRlCpuSettingNote === "function") {
        return getRlCpuSettingNote(playerCount);
    }
    if (playerCount >= 3) {
        return "AI（深層学習・ランダム）は多人数用の深層学習モデルから選び、5人以上では脅威度上位3人の相手を見て判断します。CPU（最強）は安定したルールベースの基準CPUです。";
    }
    return "AI（深層学習・ランダム）は2人用の複数モデルからランダムに選びます。CPU（最強）は安定したルールベースの基準CPUです。";
}

function renderOnlinePlayerSettings() {
    while (onlinePlayerSettings.length < onlineSelectedCount) {
        onlinePlayerSettings.push({ type: "human", difficulty: "normal" });
    }
    onlinePlayerSettings = onlinePlayerSettings.slice(0, onlineSelectedCount).map((setting) => ({
        type: setting.type === "cpu" ? "cpu" : "human",
        difficulty: setting.difficulty || "normal",
    }));
    const rlNotice = `<div class="player-setting-note">${getOnlineRlCpuSettingNote(onlineSelectedCount)}</div>`;
    const html = onlinePlayerSettings.map((s, i) => `
        <div class="player-setting">
            <span class="player-setting-name">プレイヤー${i + 1}</span>
            <select data-ui-change="onlinePlayerType" data-player-index="${i}" class="player-setting-select" aria-label="プレイヤー${i + 1}の種類">
                <option value="human" ${s.type === "human" ? "selected" : ""}>人間</option>
                <option value="weak"  ${s.type === "cpu" && s.difficulty === "weak"   ? "selected" : ""}>CPU（弱）</option>
                <option value="normal" ${s.type === "cpu" && s.difficulty === "normal" ? "selected" : ""}>CPU（普通）</option>
                <option value="strong" ${s.type === "cpu" && s.difficulty === "strong" ? "selected" : ""}>CPU（強）</option>
                <option value="expert" ${s.type === "cpu" && s.difficulty === "expert" ? "selected" : ""}>CPU（最強）</option>
                <option value="rl" ${s.type === "cpu" && s.difficulty === "rl" ? "selected" : ""}>AI（深層学習・ランダム）</option>
            </select>
        </div>
    `).join("") + rlNotice;
    document.getElementById("onlinePlayerSettings").innerHTML = html;
}

function onChangeOnlinePlayerType(index, value) {
    if (value === "human") {
        onlinePlayerSettings[index] = { type: "human", difficulty: "normal" };
    } else {
        onlinePlayerSettings[index] = { type: "cpu", difficulty: value };
    }
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
let onlineActionInFlight = false;
let onlineActionInFlightAt = 0;
let _onlineActionTimeoutTimer = null;
let _rejoinRetryCount = 0;
let _rejoinRetryTimer = null;
const APP_ERROR_EVENT = 'appError';
const ONLINE_ACTION_LOG_LIMIT = 200;
const ONLINE_ACTION_ACK_TIMEOUT_MS = 15000;
const ONLINE_RESTORE_SCHEMA_VERSION = 2;
const ONLINE_STORAGE_KEYS = Object.freeze({
    gameStart: 'onlineGameStart',
    actionLog: 'onlineActionLog',
    stateSnapshot: 'onlineStateSnapshot',
    pendingAction: 'onlinePendingAction',
});

const ONLINE_ROOM_STORAGE_KEY_SEPARATOR = ':room:';
const ONLINE_STORAGE_MISSING = Symbol('onlineStorageMissing');

function _onlineRoomStorageKey(key, roomId = myRoomId) {
    if (typeof key !== 'string' || key === '') return key;
    if (key.includes(ONLINE_ROOM_STORAGE_KEY_SEPARATOR)) return key;
    if (typeof roomId !== 'string' || roomId.trim() === '') return key;
    return `${key}${ONLINE_ROOM_STORAGE_KEY_SEPARATOR}${roomId.trim().toUpperCase()}`;
}

function _writeOnlineRoomStorageJson(key, value, roomId = myRoomId) {
    const scopedKey = _onlineRoomStorageKey(key, roomId);
    if (scopedKey !== key) _writeOnlineStorageJson(scopedKey, value);
}

function _removeOnlineRoomStorageItem(key, roomId = myRoomId) {
    const scopedKey = _onlineRoomStorageKey(key, roomId);
    if (scopedKey !== key) _removeOnlineStorageItem(scopedKey);
}

function _writeOnlineRestoreStorageJson(key, value, roomId = myRoomId) {
    _writeOnlineStorageJson(key, value);
    _writeOnlineRoomStorageJson(key, value, roomId);
}

function _removeOnlineRestoreStorageItem(key, roomId = myRoomId) {
    _removeOnlineStorageItem(key);
    _removeOnlineRoomStorageItem(key, roomId);
}

function _readOnlineStorageJson(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

function _readOnlineRoomStorageJson(key, fallback = null, roomId = myRoomId) {
    const scopedKey = _onlineRoomStorageKey(key, roomId);
    if (scopedKey !== key) {
        const scopedValue = _readOnlineStorageJson(scopedKey, ONLINE_STORAGE_MISSING);
        if (scopedValue !== ONLINE_STORAGE_MISSING) return scopedValue;
    }
    return _readOnlineStorageJson(key, fallback);
}

function _writeOnlineStorageJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function _removeOnlineStorageItem(key) {
    localStorage.removeItem(key);
}

function _clearOnlineRestoreBundle() {
    _removeOnlineRestoreStorageItem(ONLINE_STORAGE_KEYS.gameStart);
    _removeOnlineRestoreStorageItem(ONLINE_STORAGE_KEYS.actionLog);
    _removeOnlineRestoreStorageItem(ONLINE_STORAGE_KEYS.stateSnapshot);
    _removeOnlineStorageItem(ONLINE_STORAGE_KEYS.pendingAction);
}

function _readOnlineStateSnapshot() {
    return _readOnlineRoomStorageJson(ONLINE_STORAGE_KEYS.stateSnapshot, null);
}

function _clearRejoinRetry() {
    _rejoinRetryCount = 0;
    if (_rejoinRetryTimer) {
        clearTimeout(_rejoinRetryTimer);
        _rejoinRetryTimer = null;
    }
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

function _emitOnlineRejoinRequest() {
    if (!socket || socket.connected === false || !myRoomId || myOriginalPlayerIndex < 0 || !myPlayerName || !reconnectToken) return false;
    socket.emit('rejoinRoom', {
        roomId: myRoomId,
        playerIndex: myOriginalPlayerIndex,
        playerName: myPlayerName,
        reconnectToken,
    });
    return true;
}

function _handleOnlineActionTimeout() {
    if (!onlineActionInFlight) return false;
    _setOnlineActionInFlight(false);
    if (!isOnlineGame) return false;
    isReconnectingOnline = true;
    cpuScheduleToken++;
    const el = document.getElementById("onlineStatus");
    if (el) el.textContent = '⚠️ サーバー応答がタイムアウトしました。状態を再同期しています...';
    return _emitOnlineRejoinRequest();
}

function resetOnlineState() {
    const roomIdBeforeReset = myRoomId;
    cpuScheduleToken++;
    if (socket) { socket.disconnect(); socket = null; }
    isOnlineGame = false;
    isRoomHost = false;
    myPlayerIndex = -1;
    myOriginalPlayerIndex = -1;
    myRoomId = null;
    reconnectToken = '';
    isReplaying = false;
    isReconnectingOnline = false;
    _setOnlineActionInFlight(false);
    _clearPendingOutboundAction(roomIdBeforeReset);
    _clearRejoinRetry();
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
                log = [];
                if (options.alreadyApplied) {
                    _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.actionLog, log);
                    return;
                }
            }
        }
        if (Number.isInteger(options.seq) && !options.alreadyApplied) {
            _writeOnlineGameStartPatch({ actionSeq: seq });
        }
        const entry = { action, data };
        if (Number.isInteger(options.playerIndex)) entry.playerIndex = options.playerIndex;
        if (typeof options.clientActionId === 'string') entry.clientActionId = options.clientActionId;
        entry.seq = seq;
        log.push(entry);
        _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.actionLog, log);
    } catch(e) {}
}

function _normalizeOnlineActionLog(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(entry => entry && typeof entry.action === 'string')
        .map(entry => {
            const normalized = { action: entry.action, data: entry.data || {} };
            if (Number.isInteger(entry.playerIndex)) normalized.playerIndex = entry.playerIndex;
            if (Number.isInteger(entry.seq)) normalized.seq = entry.seq;
            if (typeof entry.clientActionId === 'string') normalized.clientActionId = entry.clientActionId;
            return normalized;
        });
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
        Number.isInteger(payload?.actionSeq) ? payload.actionSeq : 0,
        snapshotSeq,
        logSeq
    );
}

function _serverOnlineActionSeq(gameStartPayload, stateSnapshot, actionLog) {
    const logSeq = (actionLog || []).reduce((max, entry) => Number.isInteger(entry.seq) ? Math.max(max, entry.seq) : max, 0);
    return Math.max(
        Number.isInteger(gameStartPayload?.actionSeq) ? gameStartPayload.actionSeq : 0,
        Number.isInteger(stateSnapshot?.actionSeq) ? stateSnapshot.actionSeq : 0,
        logSeq
    );
}

function _isOnlineRestoreRankAction(entry) {
    return !!(entry && typeof entry.action === 'string' &&
        typeof GAME_ACTION_REGISTRY !== 'undefined' && GAME_ACTION_REGISTRY[entry.action]);
}

function _onlineRestoreReplaySeq(stateSnapshot, actionLog) {
    const snapshotSeq = Number.isInteger(stateSnapshot?.actionSeq) ? stateSnapshot.actionSeq : 0;
    const replayedActionCount = Array.isArray(actionLog)
        ? actionLog.filter(_isOnlineRestoreRankAction).length
        : 0;
    return snapshotSeq + replayedActionCount;
}

function _onlineRestoreRank(gameStartPayload, stateSnapshot, actionLog) {
    return {
        hostEpoch: Number.isInteger(gameStartPayload?.hostEpoch) ? gameStartPayload.hostEpoch : 0,
        actionSeq: _onlineRestoreReplaySeq(stateSnapshot || null, actionLog || []),
    };
}

function _isOnlineRestoreRankNewer(localRank, serverRank) {
    return localRank.hostEpoch > serverRank.hostEpoch ||
        (localRank.hostEpoch === serverRank.hostEpoch && localRank.actionSeq > serverRank.actionSeq);
}

function _nextOnlineActionSeq(log = null) {
    const seq = _currentOnlineActionSeq(log) + 1;
    _writeOnlineGameStartPatch({ actionSeq: seq });
    return seq;
}

function _readPendingOutboundAction() {
    const entry = _readOnlineRoomStorageJson(ONLINE_STORAGE_KEYS.pendingAction, null);
    if (!entry || typeof entry.action !== 'string') return null;
    const normalized = { action: entry.action, data: entry.data || {} };
    if (Number.isInteger(entry.playerIndex)) normalized.playerIndex = entry.playerIndex;
    if (typeof entry.roomId === 'string') normalized.roomId = entry.roomId;
    if (Number.isInteger(entry.seq)) normalized.seq = entry.seq;
    if (typeof entry.clientActionId === 'string') normalized.clientActionId = entry.clientActionId;
    return normalized;
}

function _clearPendingOutboundAction(roomId = myRoomId) {
    try {
        _removeOnlineStorageItem(ONLINE_STORAGE_KEYS.pendingAction);
        _removeOnlineRoomStorageItem(ONLINE_STORAGE_KEYS.pendingAction, roomId);
    } catch (e) {}
}

function _pendingOutboundActionBelongsToCurrentSession(entry, options = {}) {
    if (!entry) return true;
    if (typeof entry.roomId !== 'string') {
        if (options.requireExplicitRoomId) return false;
        return !options.requireRoomId || !myRoomId || Number.isInteger(entry.seq);
    }
    if (!myRoomId) return false;
    return entry.roomId === myRoomId;
}

function _clearPendingOutboundActionForCurrentSession(options = {}) {
    const entry = _readPendingOutboundAction();
    if (_pendingOutboundActionBelongsToCurrentSession(entry, options)) {
        _clearPendingOutboundAction();
    }
}

function _sameOnlineActionEntry(a, b) {
    if (!a || !b) return false;
    if (a.clientActionId || b.clientActionId) return a.clientActionId === b.clientActionId;
    return a.action === b.action &&
        a.playerIndex === b.playerIndex &&
        JSON.stringify(a.data || {}) === JSON.stringify(b.data || {});
}

function _acceptedClientActionMatchesPending(ref, pending) {
    return !!(ref && pending && typeof ref.clientActionId === 'string' &&
        ref.clientActionId === pending.clientActionId &&
        Number.isInteger(ref.playerIndex) && ref.playerIndex === pending.playerIndex);
}

function _shouldClearPendingForAcceptedAction(accepted, pending) {
    if (!pending) return false;
    if (typeof pending.clientActionId === 'string') {
        return typeof accepted?.clientActionId === 'string' && _sameOnlineActionEntry(accepted, pending);
    }
    return _sameOnlineActionEntry(accepted, pending);
}


function _appendPendingForRestore(actionLog, pending) {
    if (!pending) return actionLog;
    if (!_pendingOutboundActionBelongsToCurrentSession(pending, { requireRoomId: true })) return actionLog;
    if (!actionLog.some(entry => _sameOnlineActionEntry(entry, pending))) {
        actionLog.push(pending);
    }
    return actionLog;
}

function _canResendPendingOutboundAction(pending) {
    if (!_pendingOutboundActionBelongsToCurrentSession(pending, { requireRoomId: true })) return false;
    if (!pending || !game || !Number.isInteger(myOriginalPlayerIndex)) return false;
    if (Number.isInteger(pending.playerIndex) && pending.playerIndex >= 0 && pending.playerIndex !== myOriginalPlayerIndex) return false;
    if (!Number.isInteger(myPlayerIndex) || myPlayerIndex < 0) return false;
    const currentIndex = game.currentPlayerIndex;
    if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= game.players.length) return false;
    if (cpuPlayers[currentIndex]) return isRoomHost;
    return currentIndex === myPlayerIndex;
}

function buildOnlineSnapshot() {
    if (!game) return null;
    return {
        players: game.players.map(p => ({
            name: p.name,
            coins: p.coins,
            cards: p.cards.map(c => c.name),
            dormantIndices: p.dormantCards.map(dc => p.cards.indexOf(dc)).filter(i => i >= 0),
            landmarks: Object.assign({}, p.landmarks),
            itVentureCoins: p.itVentureCoins,
            hasYakusho: p.hasYakusho,
        })),
        currentPlayerIndex: game.currentPlayerIndex,
        phase: game.phase,
        log: Array.isArray(game.log) ? game.log.slice(-ONLINE_SNAPSHOT_LOG_LIMIT) : [],
        lastDiceResult: game.lastDiceResult,
        lastDice1: game.lastDice1,
        lastDice2: game.lastDice2,
        builtThisTurn: game.builtThisTurn,
        pendingTV: game.pendingTV,
        pendingBusiness: game.pendingBusiness,
        pendingCleaning: game.pendingCleaning,
        pendingMover: game.pendingMover,
        pendingRenovation: game.pendingRenovation,
        pendingActions: (typeof GameManager !== 'undefined' && typeof GameManager.serializedPendingActionsFor === 'function')
            ? GameManager.serializedPendingActionsFor(game)
            : [],
        pendingIT: game.pendingIT,
        usedReroll: game.usedReroll,
        pendingTunaDice: game.pendingTunaDice,
        turnCount: game.turnCount,
        hadAmusementParkAtRoll: game.hadAmusementParkAtRoll,
        shopStock: Object.assign({}, SHOP_STOCK),
        undoState: undoState || null,
        actionSeq: _currentOnlineActionSeq(),
    };
}

function buildOnlineUndoSnapshot() {
    if (!game) return null;
    return {
        playerCoins: game.players.map(p => p.coins),
        playerCardNames: game.players.map(p => p.cards.map(c => c.name)),
        playerDormantIndices: game.players.map(p => p.dormantCards.map(dc => p.cards.indexOf(dc)).filter(i => i >= 0)),
        playerLandmarks: game.players.map(p => Object.assign({}, p.landmarks)),
        playerItVenture: game.players.map(p => p.itVentureCoins),
        playerHasYakusho: game.players.map(p => p.hasYakusho),
        hadAmusementParkAtRoll: game.hadAmusementParkAtRoll,
        shopStock: Object.assign({}, SHOP_STOCK),
        builtThisTurn: game.builtThisTurn,
        log: Array.isArray(game.log) ? game.log.slice(-ONLINE_SNAPSHOT_LOG_LIMIT) : [],
    };
}

function saveOnlineSession() {
    if (!myRoomId || myOriginalPlayerIndex < 0 || !myPlayerName || !reconnectToken) return;
    try {
        localStorage.setItem('onlineSession', JSON.stringify({
            roomId: myRoomId,
            playerIndex: myOriginalPlayerIndex,
            playerName: myPlayerName,
            reconnectToken,
            isRoomHost,
        }));
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
    const raw = localStorage.getItem('onlineSession');
    if (raw) {
        try {
            const s = JSON.parse(raw);
            s.isRoomHost = isRoomHost;
            s.reconnectToken = reconnectToken || s.reconnectToken || '';
            localStorage.setItem('onlineSession', JSON.stringify(s));
        } catch (_) {}
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
    if (socket) return;
    if (typeof io !== 'function') {
        showNotice('オンライン機能を読み込めませんでした。通信状態を確認して再読み込みしてください。');
        return;
    }
    socket = io();

    socket.on('roomCreated', ({ roomId, playerIndex, reconnectToken: token }) => {
        myOriginalPlayerIndex = playerIndex;
        myPlayerIndex = playerIndex;
        myRoomId = roomId;
        reconnectToken = token;
        document.getElementById("onlineStatus").innerHTML = `
            <div>ルームを作成しました！</div>
            <div class="room-id-display">${roomId}</div>
            <div class="waiting-players">プレイヤーを待っています...</div>`;
    });

    socket.on('roomJoined', ({ roomId, playerIndex, reconnectToken: token }) => {
        myOriginalPlayerIndex = playerIndex;
        myPlayerIndex = playerIndex;
        myRoomId = roomId;
        reconnectToken = token;
        document.getElementById("onlineStatus").textContent = `ルーム ${roomId} に参加しました！`;
    });

    socket.on('playerList', (players) => {
        document.getElementById("onlineStatus").innerHTML = `
            <div class="room-id-display">${myRoomId}</div>
            <div class="waiting-players">プレイヤー: ${players.join('、')} (${players.length}人)</div>`;
    });

    socket.on('gameStart', ({ playerNames, playerSettings: ps, cpuSpeed: cs, playerOrder, enabledCards: ec, enabledLandmarks: el, versions, reconnectTokenHashes, hostPlayerIndex, hostEpoch, actionSeq }) => {
        isOnlineGame = true;
        _setOnlineHostState(hostPlayerIndex);
        cpuSpeed = cs || 1500;
        if (ec) enabledCards = new Set(ec);
        enabledLandmarks = new Set((el && el.length > 0) ? el : Player.landmarkNames());
        // ゲーム開始データとアクションログをlocalStorageに保存（サーバー再起動後の復元用）
        try {
            const gameStartPayload = _applyOnlineHostPayload({ schemaVersion: ONLINE_RESTORE_SCHEMA_VERSION, playerNames, playerSettings: ps, cpuSpeed: cs, playerOrder, enabledCards: ec ? [...ec] : null, enabledLandmarks: el || null, versions, reconnectTokenHashes, hostPlayerIndex, actionSeq: Number.isInteger(actionSeq) ? actionSeq : 0 }, hostPlayerIndex, hostEpoch);
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
    });

    socket.on('gameAction', ({ action, data, playerIndex, seq, clientActionId }) => {
        _saveActionLog(action, data, { playerIndex, seq, clientActionId });
        applyReplayedAction(action, data);
        render();
        scheduleCPU();
    });

    socket.on('actionAccepted', ({ action, data, playerIndex, seq, clientActionId }) => {
        _setOnlineActionInFlight(false);
        const pendingBeforeAccept = _readPendingOutboundAction();
        if (_shouldClearPendingForAcceptedAction({ action, data, playerIndex, seq, clientActionId }, pendingBeforeAccept)) {
            _clearPendingOutboundAction();
        }
        applyReplayedAction(action, data);
        render();
        _saveActionLog(action, data, { alreadyApplied: true, playerIndex, seq, clientActionId });
        scheduleCPU();
    });

    socket.on('rejoinData', ({ gameStartPayload, stateSnapshot, actionLog, acceptedClientActions, playerIndex, hostPlayerIndex, hostEpoch }) => {
        const { playerNames, playerSettings: ps, cpuSpeed: cs, playerOrder, enabledCards: ec, enabledLandmarks: el } = gameStartPayload;
        const replayActionLog = _normalizeOnlineActionLog(actionLog);
        const localBundle = _readLocalRestoreBundle();
        if (localBundle && localBundle.gameStartPayload.hostPlayerIndex === myOriginalPlayerIndex) {
            const localRank = _onlineRestoreRank(localBundle.gameStartPayload, localBundle.stateSnapshot, localBundle.actionLog);
            const serverRank = _onlineRestoreRank(gameStartPayload, stateSnapshot, replayActionLog);
            const canOfferLocalHostBundle = hostPlayerIndex === myOriginalPlayerIndex || localRank.hostEpoch > serverRank.hostEpoch;
            if (canOfferLocalHostBundle && _isOnlineRestoreRankNewer(localRank, serverRank)) {
                isReconnectingOnline = true;
                document.getElementById("onlineStatus").textContent = '♻️ より新しいローカル復元データをサーバーへ送信しています...';
                _sendRecreateRoomFromBundle(localBundle);
                return;
            }
        }
        gameStartPayload.schemaVersion = ONLINE_RESTORE_SCHEMA_VERSION;
        _applyOnlineHostPayload(gameStartPayload, hostPlayerIndex, hostEpoch);
        gameStartPayload.actionSeq = _serverOnlineActionSeq(gameStartPayload, stateSnapshot, replayActionLog);
        const pendingBeforeRejoin = _readPendingOutboundAction();
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
        isOnlineGame = true;
        isReconnectingOnline = false;
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
            _writeOnlineRestoreStorageJson(ONLINE_STORAGE_KEYS.actionLog, replayActionLog);
        } catch(e) {}
        saveOnlineSession();
        cpuScheduleToken++;
        if (typeof resetUiLocksForGameReset === 'function') resetUiLocksForGameReset('online-rejoin-reset-ui-locks');

        document.getElementById("titleScreen").style.display = "none";
        document.getElementById("gameScreen").style.display = "block";

        let restoredOk = false;
        try {
            // 既存ゲームをリプレイで再構築（render/scheduleCPUを抑制）
            isReplaying = true;
            initOnlineGame(playerNames, ps, playerOrder);
            if (stateSnapshot) {
                restoreOnlineSnapshot(stateSnapshot);
            }
            for (const { action, data } of replayActionLog) {
                applyReplayedAction(action, data);
            }
            restoredOk = true;
        } catch (e) {
            document.getElementById("onlineStatus").textContent = '❌ 復元データの再生に失敗しました。再接続してください。';
            isReconnectingOnline = true;
        } finally {
            isReplaying = false;
        }
        if (!restoredOk) return;
        prevCoins = null;
        render();
        scheduleCPU();
        if (pendingBeforeRejoin && !pendingAccepted && socket && socket.connected !== false) {
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

    socket.on('hostChanged', ({ newHostPlayerIndex, hostEpoch }) => {
        if (_setOnlineHostState(newHostPlayerIndex)) {
            game && game.addLog(LOG_TYPES.SYSTEM, `👑 あなたがホストになりました`);
            render();
            scheduleCPU();
        } else {
            cpuScheduleToken++;
        }
        _persistOnlineHostState(newHostPlayerIndex, hostEpoch);
    });

    socket.on('connect', () => {
        const el = document.getElementById("onlineStatus");
        if (el && el.textContent.startsWith('⏳')) el.textContent = '';
        if (isOnlineGame && myRoomId && myOriginalPlayerIndex >= 0 && myPlayerName && reconnectToken) {
            isReconnectingOnline = true;
            socket.emit('rejoinRoom', {
                roomId: myRoomId,
                playerIndex: myOriginalPlayerIndex,
                playerName: myPlayerName,
                reconnectToken,
            });
        }
    });

    socket.on('disconnect', () => {
        if (!isOnlineGame) return;
        isReconnectingOnline = true;
        _setOnlineActionInFlight(false);
        cpuScheduleToken++;
        const el = document.getElementById("onlineStatus");
        if (el) el.textContent = '⏳ 接続が切れました。再接続しています...';
    });

    socket.on('connect_error', () => {
        document.getElementById("onlineStatus").textContent =
            '⏳ サーバーに接続中です。初回は起動に30秒ほどかかる場合があります...';
    });

    socket.on(APP_ERROR_EVENT, handleAppError);
}

function handleAppError(msg) {
    _setOnlineActionInFlight(false);
    if (msg === 'ROOM_NOT_FOUND' && isReconnectingOnline) {
        if (isRoomHost) {
            _tryRestoreRoom();
        } else {
            _scheduleRejoinRetry();
        }
        return;
    }
    if (msg === '無効な操作です' && isOnlineGame && socket && myRoomId && myOriginalPlayerIndex >= 0 && myPlayerName && reconnectToken) {
        _clearPendingOutboundActionForCurrentSession({ requireExplicitRoomId: true });
        isReconnectingOnline = true;
        cpuScheduleToken++;
        document.getElementById("onlineStatus").textContent = '⚠️ 操作がサーバーで拒否されました。状態を再同期しています...';
        _emitOnlineRejoinRequest();
        return;
    }
    if (isReconnectingOnline) {
        _clearPendingOutboundActionForCurrentSession();
        isReconnectingOnline = false;
        localStorage.removeItem('onlineSession');
        _clearOnlineRestoreBundle();
        updateResumeButton();
        if (socket) {
            socket.disconnect();
            socket = null;
        }
    }
    document.getElementById("onlineStatus").textContent = `❌ ${msg}`;
}

function showCreateRoom() {
    const name = document.getElementById("playerNameInput").value.trim();
    if (!name) { showNotice("名前を入力してください"); return; }
    myPlayerName = name;
    onlineCpuSpeed = parseInt(document.getElementById("onlineCpuSpeed").value);
    initSocket();
    isRoomHost = true;
    socket.emit('createRoom', {
        playerName: name,
        playerCount: onlineSelectedCount,
        playerSettings: freezeOnlinePlayerSettings(onlinePlayerSettings, onlineSelectedCount),
        cpuSpeed: onlineCpuSpeed,
        enabledCards: [...enabledCards],
        enabledLandmarks: [...enabledLandmarks],
        clientVersion: getClientVersion(),
    });
}

function joinRoom() {
    const name = document.getElementById("playerNameInput").value.trim();
    const roomId = document.getElementById("roomIdInput").value.trim().toUpperCase();
    if (!name) { showNotice("名前を入力してください"); return; }
    if (roomId.length !== 6) { showNotice("ルームIDは6文字です"); return; }
    myPlayerName = name;
    initSocket();
    isRoomHost = false;
    socket.emit('joinRoom', { roomId, playerName: name, clientVersion: getClientVersion() });
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
    switch(action) {
        case 'rollDice':        game.rollDice(data.forceDice, data.tunaDice); break;
        case 'selectDice':      game.selectDiceCount(data.useTwo, data.d1, data.d2, data.tunaDice); break;
        case 'skipReroll':      game.skipReroll(); break;
        case 'rerollDice':      game.rerollDice(data.forceDice, data.tunaDice); break;
        case 'resolveHarbor':   game.resolveHarbor(data.useBonus); break;
        case 'resolveTV':       game.resolveTV(data.targetIndex); break;
        case 'resolveBusiness': game.resolveBusiness(data.myCard, data.targetIndex, data.theirCard); break;
        case 'resolveCleaning': game.resolveCleaning(data.cardName); break;
        case 'resolveMover':    game.resolveMover(data.cardIndex ?? data.cardName, data.targetIndex); break;
        case 'resolveRenovation': game.resolveRenovation(data.landmarkName); break;
        case 'resolveIT':       game.resolveIT(data.doSave); break;
        case 'buildCard': {
            const card = CARDS.find(c => c.name === data.cardName);
            if (card && game.buildCard(card)) decrementShopStock(SHOP_STOCK, card);
            break;
        }
        case 'buildLandmark':   game.buildLandmark(data.name); break;
        case 'undoBuild':       restoreUndoSnapshot(data.state); break;
        case 'nextTurn':        game.nextTurn(); break;
    }
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
    game.players.forEach((p, i) => {
        const playerState = Array.isArray(state.players) ? state.players[i] : null;
        if (!playerState) return;
        p.name = playerState.name;
        p.coins = playerState.coins;
        p.cards = Array.isArray(playerState.cards)
            ? playerState.cards.map(name => createCardByName(name)).filter(Boolean)
            : p.cards;
        p.dormantCards = (playerState.dormantIndices || []).map(idx => p.cards[idx]).filter(Boolean);
        p.landmarks = Object.assign({}, p.landmarks, playerState.landmarks || {});
        p.itVentureCoins = playerState.itVentureCoins || 0;
        p.hasYakusho = playerState.hasYakusho !== false;
    });
    assignShopStockSnapshot(SHOP_STOCK, state.shopStock || {});
    game.currentPlayerIndex = state.currentPlayerIndex || 0;
    game.phase = state.phase || game.phase;
    game.log = state.log || [];
    game.lastDiceResult = state.lastDiceResult || 0;
    game.lastDice1 = state.lastDice1 || 0;
    game.lastDice2 = state.lastDice2 || 0;
    game.builtThisTurn = state.builtThisTurn || false;
    if (typeof game.resetPendingState === 'function') game.resetPendingState();
    game.pendingTV = state.pendingTV || 0;
    game.pendingBusiness = state.pendingBusiness || 0;
    game.pendingCleaning = state.pendingCleaning || 0;
    game.pendingMover = state.pendingMover || 0;
    game.pendingRenovation = state.pendingRenovation || 0;
    game.pendingActionQueue = Array.isArray(state.pendingActions)
        ? state.pendingActions
            .filter(pending => pending && typeof pending === 'object')
            .map(pending => ({ action: pending.action, field: pending.field }))
        : [];
    if (typeof game.rebuildPendingActionsFromFields === 'function' && game.pendingActionQueue.length === 0) {
        game.rebuildPendingActionsFromFields();
    }
    game.pendingIT = state.pendingIT || false;
    game.usedReroll = state.usedReroll || false;
    game.pendingTunaDice = state.pendingTunaDice || null;
    game.turnCount = state.turnCount || 0;
    game.hadAmusementParkAtRoll = state.hadAmusementParkAtRoll || false;
    undoState = state.undoState || null;
}


function sendAction(action, data = {}) {
    if (isOnlineGame && socket) {
        if (isReconnectingOnline || onlineActionInFlight || socket.connected === false) return false;
        _setOnlineActionInFlight(true);
        cpuScheduleToken++;
        const pending = _savePendingOutboundAction(action, data);
        socket.emit('gameAction', { action, data, clientActionId: pending.clientActionId });
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
        const stateSnapshot = _readOnlineStateSnapshot();
        const actionLog = _readOnlineActionLog();
        _appendPendingForRestore(actionLog, _readPendingOutboundAction());
        document.getElementById("onlineStatus").textContent = '♻️ サーバー再起動を検知。ゲームを復元中...';
        socket.emit('recreateRoom', {
            roomId: myRoomId,
            gameStartPayload,
            stateSnapshot,
            actionLog,
            playerIndex: myOriginalPlayerIndex,
            playerName: myPlayerName,
            reconnectToken,
        });
    } catch(e) {
        document.getElementById("onlineStatus").textContent = '❌ 復元に失敗しました';
    }
}

function _readLocalRestoreBundle() {
    try {
        const gameStartPayload = _readOnlineGameStartPayload();
        if (!gameStartPayload || gameStartPayload.schemaVersion !== ONLINE_RESTORE_SCHEMA_VERSION ||
                !Array.isArray(gameStartPayload.reconnectTokenHashes)) return null;
        const stateSnapshot = _readOnlineStateSnapshot();
        const actionLog = _readOnlineActionLog();
        _appendPendingForRestore(actionLog, _readPendingOutboundAction());
        return { gameStartPayload, stateSnapshot, actionLog };
    } catch (_) {
        return null;
    }
}

function _sendRecreateRoomFromBundle(bundle) {
    socket.emit('recreateRoom', {
        roomId: myRoomId,
        gameStartPayload: bundle.gameStartPayload,
        stateSnapshot: bundle.stateSnapshot,
        actionLog: bundle.actionLog,
        playerIndex: myOriginalPlayerIndex,
        playerName: myPlayerName,
        reconnectToken,
    });
}

function _scheduleRejoinRetry() {
    const MAX_RETRY = 8;
    if (_rejoinRetryCount >= MAX_RETRY) {
        document.getElementById("onlineStatus").textContent = '❌ 再接続がタイムアウトしました。ホストが復元できなかった可能性があります。';
        isReconnectingOnline = false;
        return;
    }
    _rejoinRetryCount++;
    document.getElementById("onlineStatus").textContent = `⏳ ホストの復元を待っています... (${_rejoinRetryCount}/${MAX_RETRY})`;
    _rejoinRetryTimer = setTimeout(() => {
        if (!socket || !isReconnectingOnline) return;
        const raw = localStorage.getItem('onlineSession');
        if (!raw) return;
        try {
            const session = JSON.parse(raw);
            socket.emit('rejoinRoom', {
                roomId: session.roomId,
                playerIndex: session.playerIndex,
                playerName: session.playerName,
                reconnectToken: session.reconnectToken,
            });
        } catch(e) {}
    }, 3000);
}
