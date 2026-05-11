// オンライン対戦（タイトル画面設定）
let onlineSelectedCount = 2;
let onlinePlayerSettings = [];
let onlineCpuSpeed = 1500;

function createOnlineCpuPlayer(difficulty, options = {}) {
    if (typeof createCpuPlayer === "function") {
        return createCpuPlayer(difficulty, options);
    }
    return new CPU(difficulty, options);
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
            <select onchange="onChangeOnlinePlayerType(${i}, this.value)" class="player-setting-select">
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
let _rejoinRetryCount = 0;
let _rejoinRetryTimer = null;
const APP_ERROR_EVENT = 'appError';
const ONLINE_ACTION_LOG_LIMIT = 200;

function resetOnlineState() {
    if (socket) { socket.disconnect(); socket = null; }
    isOnlineGame = false;
    isRoomHost = false;
    myPlayerIndex = -1;
    myOriginalPlayerIndex = -1;
    myRoomId = null;
    reconnectToken = '';
    isReplaying = false;
    isReconnectingOnline = false;
    _rejoinRetryCount = 0;
    if (_rejoinRetryTimer) { clearTimeout(_rejoinRetryTimer); _rejoinRetryTimer = null; }
}

function _saveActionLog(action, data) {
    try {
        let log = _readOnlineActionLog();
        if (log.length >= ONLINE_ACTION_LOG_LIMIT && game) {
            const snapshot = buildOnlineSnapshot();
            if (snapshot) {
                localStorage.setItem('onlineStateSnapshot', JSON.stringify(snapshot));
                log = [];
            }
        }
        log.push({ action, data });
        localStorage.setItem('onlineActionLog', JSON.stringify(log));
    } catch(e) {}
}

function _normalizeOnlineActionLog(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(entry => entry && typeof entry.action === 'string')
        .map(entry => ({ action: entry.action, data: entry.data || {} }));
}

function _readOnlineActionLog() {
    try {
        const raw = localStorage.getItem('onlineActionLog');
        return raw ? _normalizeOnlineActionLog(JSON.parse(raw)) : [];
    } catch (e) {
        return [];
    }
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
        log: [...game.log],
        lastDiceResult: game.lastDiceResult,
        lastDice1: game.lastDice1,
        lastDice2: game.lastDice2,
        builtThisTurn: game.builtThisTurn,
        pendingTV: game.pendingTV,
        pendingBusiness: game.pendingBusiness,
        pendingCleaning: game.pendingCleaning,
        pendingMover: game.pendingMover,
        pendingRenovation: game.pendingRenovation,
        pendingIT: game.pendingIT,
        usedReroll: game.usedReroll,
        pendingTunaDice: game.pendingTunaDice,
        turnCount: game.turnCount,
        hadAmusementParkAtRoll: game.hadAmusementParkAtRoll,
        shopStock: Object.assign({}, SHOP_STOCK),
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

// オンライン対戦（Socket.IO）
function initSocket() {
    if (socket) return;
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

    socket.on('gameStart', ({ playerNames, playerSettings: ps, cpuSpeed: cs, playerOrder, enabledCards: ec, enabledLandmarks: el, versions, reconnectTokenHashes }) => {
        isOnlineGame = true;
        cpuSpeed = cs || 1500;
        if (ec) enabledCards = new Set(ec);
        enabledLandmarks = new Set((el && el.length > 0) ? el : Player.landmarkNames());
        // ゲーム開始データとアクションログをlocalStorageに保存（サーバー再起動後の復元用）
        try {
            localStorage.setItem('onlineGameStart', JSON.stringify({ playerNames, playerSettings: ps, cpuSpeed: cs, playerOrder, enabledCards: ec ? [...ec] : null, enabledLandmarks: el || null, versions, reconnectTokenHashes }));
            localStorage.removeItem('onlineStateSnapshot');
            localStorage.setItem('onlineActionLog', JSON.stringify([]));
        } catch(e) {}
        saveOnlineSession();
        document.getElementById("titleScreen").style.display = "none";
        document.getElementById("gameScreen").style.display = "block";
        initOnlineGame(playerNames, ps, playerOrder);
        // バージョン不一致チェック（initOnlineGame後にgameが初期化されてから）
        if (versions && versions.length > 1) {
            const unique = [...new Set(versions)];
            if (unique.length > 1) {
                game.addLog(LOG_TYPES.SYSTEM, '⚠️ バージョン不一致: ゲームが正常に動作しない可能性があります。全員アプリをリロードしてください。');
            }
        }
    });

    socket.on('gameAction', ({ action, data, playerIndex }) => {
        _saveActionLog(action, data);
        applyAction(action, data);
        render();
        scheduleCPU();
    });

    socket.on('rejoinData', ({ gameStartPayload, stateSnapshot, actionLog, playerIndex, hostPlayerIndex }) => {
        const { playerNames, playerSettings: ps, cpuSpeed: cs, playerOrder, enabledCards: ec, enabledLandmarks: el } = gameStartPayload;
        const replayActionLog = _normalizeOnlineActionLog(actionLog);
        isOnlineGame = true;
        isReconnectingOnline = false;
        cpuSpeed = cs || 1500;
        if (ec) enabledCards = new Set(ec);
        enabledLandmarks = new Set((el && el.length > 0) ? el : Player.landmarkNames());
        myOriginalPlayerIndex = playerIndex;
        myPlayerIndex = playerIndex;
        if (Number.isInteger(hostPlayerIndex)) {
            isRoomHost = myOriginalPlayerIndex === hostPlayerIndex;
        }
        try {
            localStorage.setItem('onlineGameStart', JSON.stringify(gameStartPayload));
            if (stateSnapshot) {
                localStorage.setItem('onlineStateSnapshot', JSON.stringify(stateSnapshot));
            } else {
                localStorage.removeItem('onlineStateSnapshot');
            }
            localStorage.setItem('onlineActionLog', JSON.stringify(replayActionLog));
        } catch(e) {}
        saveOnlineSession();
        cpuScheduleToken++;

        document.getElementById("titleScreen").style.display = "none";
        document.getElementById("gameScreen").style.display = "block";

        // 既存ゲームをリプレイで再構築（render/scheduleCPUを抑制）
        isReplaying = true;
        initOnlineGame(playerNames, ps, playerOrder);
        if (stateSnapshot) {
            restoreOnlineSnapshot(stateSnapshot);
        }
        for (const { action, data } of replayActionLog) {
            applyAction(action, data);
        }
        isReplaying = false;
        prevCoins = null;
        undoState = null;
        render();
        scheduleCPU();
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

    socket.on('hostChanged', ({ newHostPlayerIndex }) => {
        if (myOriginalPlayerIndex === newHostPlayerIndex) {
            isRoomHost = true;
            game && game.addLog(LOG_TYPES.SYSTEM, `👑 あなたがホストになりました`);
            render();
            scheduleCPU();
        } else {
            isRoomHost = false;
        }
        const raw = localStorage.getItem('onlineSession');
        if (raw) {
            try {
                const s = JSON.parse(raw);
                s.isRoomHost = isRoomHost;
                s.reconnectToken = reconnectToken || s.reconnectToken || '';
                localStorage.setItem('onlineSession', JSON.stringify(s));
            } catch (_) {}
        }
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

    socket.on('connect_error', () => {
        document.getElementById("onlineStatus").textContent =
            '⏳ サーバーに接続中です。初回は起動に30秒ほどかかる場合があります...';
    });

    socket.on(APP_ERROR_EVENT, handleAppError);
}

function handleAppError(msg) {
    if (msg === 'ROOM_NOT_FOUND' && isReconnectingOnline) {
        if (isRoomHost) {
            _tryRestoreRoom();
        } else {
            _scheduleRejoinRetry();
        }
        return;
    }
    if (isReconnectingOnline) {
        isReconnectingOnline = false;
        localStorage.removeItem('onlineSession');
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
    if (!name) { alert("名前を入力してください"); return; }
    myPlayerName = name;
    onlineCpuSpeed = parseInt(document.getElementById("onlineCpuSpeed").value);
    initSocket();
    isRoomHost = true;
    fetch('/api/version').then(r => r.json()).catch(() => ({ hash: 'unknown' })).then(({ hash }) => {
        socket.emit('createRoom', {
            playerName: name,
            playerCount: onlineSelectedCount,
            playerSettings: onlinePlayerSettings,
            cpuSpeed: onlineCpuSpeed,
            enabledCards: [...enabledCards],
            enabledLandmarks: [...enabledLandmarks],
            clientVersion: hash
        });
    });
}

function joinRoom() {
    const name = document.getElementById("playerNameInput").value.trim();
    const roomId = document.getElementById("roomIdInput").value.trim().toUpperCase();
    if (!name) { alert("名前を入力してください"); return; }
    if (roomId.length !== 6) { alert("ルームIDは6文字です"); return; }
    myPlayerName = name;
    initSocket();
    fetch('/api/version').then(r => r.json()).catch(() => ({ hash: 'unknown' })).then(({ hash }) => {
        socket.emit('joinRoom', { roomId, playerName: name, clientVersion: hash });
    });
}

function initOnlineGame(playerNames, ps, playerOrder) {
    const count = playerNames.length;
    resetFullLog();
    if (typeof resetStatsRecorded === "function") {
        resetStatsRecorded();
    }
    game = new GameManager(count);
    game.enabledLandmarks = new Set(enabledLandmarks.size > 0 ? enabledLandmarks : Player.landmarkNames());
    for (const card of CARDS) {
        SHOP_STOCK[card.name] = enabledCards.has(card.name) ? getInitialCardStock(card, count) : 0;
    }

    // playerOrderに従ってプレイヤー名とCPU設定を設定
    const order = playerOrder || playerNames.map((_, i) => i);
    for (let i = 0; i < count; i++) {
        const originalIndex = order[i];
        game.players[i].name = playerNames[originalIndex];
    }

    // CPU設定をorderに合わせて反映
    if (ps && ps.length > 0) {
        cpuPlayers = order.map(originalIndex => {
            const s = ps[originalIndex];
            return s && s.type === "cpu" ? createOnlineCpuPlayer(s.difficulty, { expertPurpose: "live", playerCount: count }) : null;
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
            if (card && game.buildCard(card)) SHOP_STOCK[data.cardName]--;
            break;
        }
        case 'buildLandmark':   game.buildLandmark(data.name); break;
        case 'undoBuild':       restoreUndoSnapshot(data.state); break;
        case 'nextTurn':        game.nextTurn(); break;
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
        p.landmarks = Object.assign({}, playerState.landmarks);
        p.itVentureCoins = playerState.itVentureCoins || 0;
        p.hasYakusho = playerState.hasYakusho !== false;
    });
    Object.assign(SHOP_STOCK, state.shopStock || {});
    game.currentPlayerIndex = state.currentPlayerIndex || 0;
    game.phase = state.phase || game.phase;
    game.log = state.log || [];
    game.lastDiceResult = state.lastDiceResult || 0;
    game.lastDice1 = state.lastDice1 || 0;
    game.lastDice2 = state.lastDice2 || 0;
    game.builtThisTurn = state.builtThisTurn || false;
    game.pendingTV = state.pendingTV || 0;
    game.pendingBusiness = state.pendingBusiness || 0;
    game.pendingCleaning = state.pendingCleaning || 0;
    game.pendingMover = state.pendingMover || 0;
    game.pendingRenovation = state.pendingRenovation || 0;
    game.pendingIT = state.pendingIT || false;
    game.usedReroll = state.usedReroll || false;
    game.pendingTunaDice = state.pendingTunaDice || null;
    game.turnCount = state.turnCount || 0;
    game.hadAmusementParkAtRoll = state.hadAmusementParkAtRoll || false;
}

function handleRemoteAction(action, data) {
    applyAction(action, data);
    render();
    scheduleCPU();
}

function sendAction(action, data = {}) {
    if (isOnlineGame && socket) {
        _saveActionLog(action, data);
        socket.emit('gameAction', { action, data });
    }
}

function _tryRestoreRoom() {
    try {
        const raw = localStorage.getItem('onlineGameStart');
        const logRaw = localStorage.getItem('onlineActionLog');
        const snapshotRaw = localStorage.getItem('onlineStateSnapshot');
        if (!raw) {
            document.getElementById("onlineStatus").textContent = '❌ 復元データが見つかりません';
            return;
        }
        const gameStartPayload = JSON.parse(raw);
        let stateSnapshot = null;
        let actionLog = [];
        try {
            stateSnapshot = snapshotRaw ? JSON.parse(snapshotRaw) : null;
        } catch (_) {
            stateSnapshot = null;
        }
        try {
            actionLog = logRaw ? _normalizeOnlineActionLog(JSON.parse(logRaw)) : [];
        } catch (_) {
            actionLog = [];
        }
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
