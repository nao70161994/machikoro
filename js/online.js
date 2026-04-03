// オンライン対戦（タイトル画面設定）
let onlineSelectedCount = 2;
let onlinePlayerSettings = [];
let onlineCpuSpeed = 1500;

function changeOnlineCount(delta) {
    onlineSelectedCount = Math.min(10, Math.max(2, onlineSelectedCount + delta));
    document.getElementById("onlinePlayerCount").textContent = onlineSelectedCount;
    renderOnlinePlayerSettings();
}

function renderOnlinePlayerSettings() {
    while (onlinePlayerSettings.length < onlineSelectedCount) {
        onlinePlayerSettings.push({ type: "human", difficulty: "normal" });
    }
    onlinePlayerSettings = onlinePlayerSettings.slice(0, onlineSelectedCount);
    const html = onlinePlayerSettings.map((s, i) => `
        <div class="player-setting">
            <span class="player-setting-name">プレイヤー${i + 1}</span>
            <select onchange="onChangeOnlinePlayerType(${i}, this.value)" class="player-setting-select">
                <option value="human" ${s.type === "human" ? "selected" : ""}>人間</option>
                <option value="weak"  ${s.type === "cpu" && s.difficulty === "weak"   ? "selected" : ""}>CPU（弱）</option>
                <option value="normal" ${s.type === "cpu" && s.difficulty === "normal" ? "selected" : ""}>CPU（普通）</option>
                <option value="strong" ${s.type === "cpu" && s.difficulty === "strong" ? "selected" : ""}>CPU（強）</option>
            </select>
        </div>
    `).join("");
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

    socket.on('gameStart', ({ playerNames, playerSettings: ps, cpuSpeed: cs, playerOrder, enabledCards: ec, enabledLandmarks: el }) => {
        isOnlineGame = true;
        cpuSpeed = cs || 1500;
        if (ec) enabledCards = new Set(ec);
        enabledLandmarks = new Set((el && el.length > 0) ? el : Player.landmarkNames());
        // initOnlineGame がmyPlayerIndexを上書きする前に保存
        saveOnlineSession();
        document.getElementById("titleScreen").style.display = "none";
        document.getElementById("gameScreen").style.display = "block";
        initOnlineGame(playerNames, ps, playerOrder);
    });

    socket.on('gameAction', ({ action, data, playerIndex }) => {
        applyAction(action, data);
        render();
        scheduleCPU();
    });

    socket.on('rejoinData', ({ gameStartPayload, actionLog, playerIndex }) => {
        const { playerNames, playerSettings: ps, cpuSpeed: cs, playerOrder, enabledCards: ec, enabledLandmarks: el } = gameStartPayload;
        isOnlineGame = true;
        isReconnectingOnline = false;
        cpuSpeed = cs || 1500;
        if (ec) enabledCards = new Set(ec);
        enabledLandmarks = new Set((el && el.length > 0) ? el : Player.landmarkNames());
        myOriginalPlayerIndex = playerIndex;
        myPlayerIndex = playerIndex;
        cpuScheduleToken++;

        document.getElementById("titleScreen").style.display = "none";
        document.getElementById("gameScreen").style.display = "block";

        // 既存ゲームをリプレイで再構築（render/scheduleCPUを抑制）
        isReplaying = true;
        initOnlineGame(playerNames, ps, playerOrder);
        for (const { action, data } of actionLog) {
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
            game.addLog(LOG_TYPES.SYSTEM, `👑 あなたがホストになりました`);
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
    });

    socket.on('connect_error', () => {
        document.getElementById("onlineStatus").textContent =
            '⏳ サーバーに接続中です。初回は起動に30秒ほどかかる場合があります...';
    });

    socket.on('error', (msg) => {
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
    });
}

function showCreateRoom() {
    const name = document.getElementById("playerNameInput").value.trim();
    if (!name) { alert("名前を入力してください"); return; }
    myPlayerName = name;
    onlineCpuSpeed = parseInt(document.getElementById("onlineCpuSpeed").value);
    initSocket();
    isRoomHost = true;
    socket.emit('createRoom', {
        playerName: name,
        playerCount: onlineSelectedCount,
        playerSettings: onlinePlayerSettings,
        cpuSpeed: onlineCpuSpeed,
        enabledCards: [...enabledCards],
        enabledLandmarks: [...enabledLandmarks]
    });
}

function joinRoom() {
    const name = document.getElementById("playerNameInput").value.trim();
    const roomId = document.getElementById("roomIdInput").value.trim().toUpperCase();
    if (!name) { alert("名前を入力してください"); return; }
    if (roomId.length !== 6) { alert("ルームIDは6文字です"); return; }
    myPlayerName = name;
    initSocket();
    socket.emit('joinRoom', { roomId, playerName: name });
}

function initOnlineGame(playerNames, ps, playerOrder) {
    const count = playerNames.length;
    resetFullLog();
    game = new GameManager(count);
    game.enabledLandmarks = new Set(enabledLandmarks.size > 0 ? enabledLandmarks : Player.landmarkNames());
    for (const card of CARDS) {
        SHOP_STOCK[card.name] = enabledCards.has(card.name) ? 6 : 0;
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
            return s && s.type === "cpu" ? new CPU(s.difficulty) : null;
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

function handleRemoteAction(action, data) {
    applyAction(action, data);
    render();
    scheduleCPU();
}

function sendAction(action, data = {}) {
    if (isOnlineGame && socket) {
        socket.emit('gameAction', { action, data });
    }
}
