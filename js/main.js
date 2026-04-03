let game;
const SHOP_STOCK = {};
let selectedCount = 2;
let playerSettings = [];
let cpuPlayers = [];
let cpuSpeed = 1500;

// コインアニメーション用
let prevCoins = null;

// 紙吹雪
let confettiInterval = null;
let confettiPieces = [];

// 連勝記録
let winStreak = parseInt(localStorage.getItem('winStreak') || '0');
let lastWinnerName = localStorage.getItem('lastWinnerName') || '';

// サウンド
let audioCtx = null;
let winSoundPlayed = false;

// オートスキップ
let autoSkipPending = false;
let autoSkipTimeout = null;

// 取り消し
let undoState = null;
let tutorialEnabled = localStorage.getItem('tutorialEnabled') !== 'false';
let tutorialLevel = localStorage.getItem('tutorialLevel') || 'beginner';

// オンライン対戦（タイトル画面設定）
let onlineSelectedCount = 2;
let onlinePlayerSettings = [];
let onlineCpuSpeed = 1500;

// CPU進行チェーン制御
let cpuScheduleToken = 0;

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

function changeCount(delta) {
    selectedCount = Math.min(10, Math.max(2, selectedCount + delta));
    document.getElementById("playerCount").textContent = selectedCount;
    renderPlayerSettings();
    saveSettings();
}

function renderPlayerSettings() {
    while (playerSettings.length < selectedCount) {
        playerSettings.push({ type: "human", difficulty: "normal" });
    }
    playerSettings = playerSettings.slice(0, selectedCount);
    const html = playerSettings.map((s, i) => `
        <div class="player-setting">
            <span class="player-setting-name">プレイヤー${i + 1}</span>
            <select onchange="onChangePlayerType(${i}, this.value)" class="player-setting-select">
                <option value="human" ${s.type === "human" ? "selected" : ""}>人間</option>
                <option value="weak"  ${s.type === "cpu" && s.difficulty === "weak"   ? "selected" : ""}>CPU（弱）</option>
                <option value="normal" ${s.type === "cpu" && s.difficulty === "normal" ? "selected" : ""}>CPU（普通）</option>
                <option value="strong" ${s.type === "cpu" && s.difficulty === "strong" ? "selected" : ""}>CPU（強）</option>
            </select>
        </div>
    `).join("");
    document.getElementById("playerSettings").innerHTML = html;
}

function onChangePlayerType(index, value) {
    if (value === "human") {
        playerSettings[index] = { type: "human", difficulty: "normal" };
    } else {
        playerSettings[index] = { type: "cpu", difficulty: value };
    }
    saveSettings();
}

function startGame() {
    cpuSpeed = parseInt(document.getElementById("cpuSpeed").value);
    saveSettings();
    document.getElementById("titleScreen").style.display = "none";
    document.getElementById("gameScreen").style.display = "block";
    cpuPlayers = playerSettings.map(s =>
        s.type === "cpu" ? new CPU(s.difficulty) : null
    );
    init(selectedCount);
}

function restartGame() {
    showConfirm("最初からやり直しますか？\n現在のゲームは終了します", () => {
        localStorage.removeItem('savedGame');
        localStorage.removeItem('onlineSession');
        cpuScheduleToken++;
        resetOnlineState();
        document.getElementById("gameScreen").style.display = "none";
        document.getElementById("titleScreen").style.display = "block";
        selectedCount = 2;
        playerSettings = [];
        cpuPlayers = [];
        document.getElementById("playerCount").textContent = 2;
        renderPlayerSettings();
        updateResumeButton();
        drawCitySkyline();
    });
}

function init(playerCount) {
    cpuScheduleToken++;
    prevCoins = null;
    stopConfetti();
    winSoundPlayed = false;
    cancelAutoSkip();
    undoState = null;
    resetFullLog();
    game = new GameManager(playerCount);
    if (enabledLandmarks.size === 0) enabledLandmarks = new Set(Player.landmarkNames());
    game.enabledLandmarks = new Set(enabledLandmarks);
    for (const card of CARDS) {
        SHOP_STOCK[card.name] = enabledCards.has(card.name) ? 6 : 0;
    }

    // ターン順をランダムにシャッフル
    const order = playerSettings.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }

    // プレイヤー名とCPU設定をシャッフル順に再設定
    const shuffledCpuPlayers = [];
    for (let i = 0; i < playerCount; i++) {
        const originalIndex = order[i];
        game.players[i].name = `プレイヤー${originalIndex + 1}`;
        shuffledCpuPlayers.push(
            playerSettings[originalIndex]?.type === "cpu"
                ? new CPU(playerSettings[originalIndex].difficulty)
                : null
        );
    }
    cpuPlayers = shuffledCpuPlayers;
    game.addLog(`👤 ${game.currentPlayer().name}のターン`);
    render();
    scheduleCPU();
}

// CPUアクションをローカル・オンライン両対応で実行
function cpuDo(action, data, fallback) {
    if (isOnlineGame) {
        sendAction(action, data);
    }
    fallback();
    render();
    scheduleCPU();
}

function queueCPUStep(token, delay, fn) {
    setTimeout(() => {
        if (token !== cpuScheduleToken) return;
        fn();
    }, delay);
}

function scheduleCPU() {
    if (isReplaying) return;
    if (isOnlineGame && !isRoomHost) return;
    if (!game || game.checkWinner()) return;
    const ci = game.currentPlayerIndex;
    if (!cpuPlayers[ci]) return;
    const cpu = cpuPlayers[ci];
    const token = ++cpuScheduleToken;

    queueCPUStep(token, cpuSpeed, () => {
        if (game.phase === "roll") {
            const forceDice = Math.floor(Math.random() * 6) + 1;
            const tunaDice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
            cpuDo('rollDice', { forceDice, tunaDice }, () => game.rollDice(forceDice, tunaDice));
        }
        queueCPUStep(token, cpuSpeed, () => {
            if (game.phase === "selectDice") {
                const useTwo = cpu.chooseDiceCount(game);
                const d1 = Math.floor(Math.random() * 6) + 1;
                const d2 = Math.floor(Math.random() * 6) + 1;
                const tunaDice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
                cpuDo('selectDice', { useTwo, d1, d2, tunaDice }, () => game.selectDiceCount(useTwo, d1, d2, tunaDice));
            }
            queueCPUStep(token, cpuSpeed, () => {
                if (game.phase === "rerollConfirm") {
                    if (cpu.chooseReroll(game)) {
                        const forceDice = Math.floor(Math.random() * 6) + 1;
                        const tunaDice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
                        cpuDo('rerollDice', { forceDice, tunaDice }, () => game.rerollDice(forceDice, tunaDice));
                    } else {
                        cpuDo('skipReroll', {}, () => game.skipReroll());
                    }
                }
                queueCPUStep(token, cpuSpeed, () => {
                    if (game.phase === "harborChoice") {
                        const useBonus = cpu.chooseHarbor(game);
                        cpuDo('resolveHarbor', { useBonus }, () => game.resolveHarbor(useBonus));
                    }
                    queueCPUStep(token, cpuSpeed, () => {
                        if (game.phase === "pending") {
                            if (game.pendingTV > 0) {
                                const targetIndex = cpu.chooseTVTarget(game);
                                cpuDo('resolveTV', { targetIndex }, () => game.resolveTV(targetIndex));
                            }
                            if (game.pendingBusiness > 0) {
                                const cur = game.currentPlayer();
                                const myCards = cur.cards.filter(c => c.category !== "大施設");
                                for (let i = 0; i < game.players.length; i++) {
                                    if (i === game.currentPlayerIndex) continue;
                                    const theirCards = game.players[i].cards.filter(c => c.category !== "大施設");
                                    if (theirCards.length === 0) continue;
                                    const myCard = myCards[Math.floor(Math.random() * myCards.length)];
                                    const theirCard = theirCards[Math.floor(Math.random() * theirCards.length)];
                                    const myCardIndex = cur.cards.indexOf(myCard);
                                    const theirCardIndex = game.players[i].cards.indexOf(theirCard);
                                    cpuDo('resolveBusiness', { myCard: myCardIndex, targetIndex: i, theirCard: theirCardIndex },
                                        () => game.resolveBusiness(myCardIndex, i, theirCardIndex));
                                    break;
                                }
                            }
                            if (game.pendingCleaning > 0) {
                                const allNames = [...new Set(game.players.flatMap(p =>
                                    p.cards.filter(c => c.category !== "大施設" && !p.isDormant(c)).map(c => c.name)))];
                                if (allNames.length > 0) {
                                    const cardName = allNames[Math.floor(Math.random() * allNames.length)];
                                    cpuDo('resolveCleaning', { cardName }, () => game.resolveCleaning(cardName));
                                }
                            }
                            if (game.pendingMover > 0) {
                                const cur = game.currentPlayer();
                                const myCards = cur.cards.filter(c => c.category !== "大施設");
                                const others = game.players.map((p, i) => i).filter(i => i !== game.currentPlayerIndex);
                                if (myCards.length > 0 && others.length > 0) {
                                    const cardIndex = cur.cards.indexOf(myCards[0]);
                                    const targetIndex = others[0];
                                    cpuDo('resolveMover', { cardIndex, targetIndex }, () => game.resolveMover(cardIndex, targetIndex));
                                }
                            }
                            if (game.pendingRenovation > 0) {
                                const cur = game.currentPlayer();
                                const builtLandmarks = Object.entries(cur.landmarks)
                                    .filter(([name, built]) => built && name !== "役所").map(([name]) => name);
                                if (builtLandmarks.length > 0) {
                                    const landmarkName = builtLandmarks[builtLandmarks.length - 1];
                                    cpuDo('resolveRenovation', { landmarkName }, () => game.resolveRenovation(landmarkName));
                                }
                            }
                        }
                        queueCPUStep(token, cpuSpeed, () => {
                            if (game.phase === "build") {
                                cpu.build(game, SHOP_STOCK);
                                render();
                            }
                            queueCPUStep(token, cpuSpeed, () => {
                                if (game.phase === "build" && !game.pendingIT) {
                                    cpuDo('nextTurn', {}, () => game.nextTurn());
                                }
                                queueCPUStep(token, cpuSpeed, () => {
                                    if (game.pendingIT) {
                                        const doSave = cpu.difficulty !== "weak" && game.currentPlayer().coins >= 1;
                                        cpuDo('resolveIT', { doSave }, () => game.resolveIT(doSave));
                                    }
                                    queueCPUStep(token, 500, () => {
                                        if (!game.checkWinner()) scheduleCPU();
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

// オンライン対戦
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
            game && game.addLog(`🔌 ${playerName}が再接続しました`);
        }
        render();
    });

    socket.on('playerDisconnected', ({ playerIndex, playerName }) => {
        alert(`${playerName || `プレイヤー${playerIndex + 1}`}が切断しました`);
    });

    socket.on('hostChanged', ({ newHostPlayerIndex }) => {
        if (myOriginalPlayerIndex === newHostPlayerIndex) {
            isRoomHost = true;
            game.addLog(`👑 あなたがホストになりました`);
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
    
    game.addLog(`👤 ${game.currentPlayer().name}のターン`);
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

function onRoll() {
    playSound('dice');
    if (game.currentPlayer().landmarks["駅"]) {
        // 駅あり：アニメーションなしで即座に選択肢を表示
        game.rollDice(null, null);
        sendAction('rollDice', { forceDice: null, tunaDice: null });
        render();
        scheduleCPU();
    } else {
        // 駅なし：アニメーションあり
        updateDiceDisplay(null, true);
        setTimeout(() => {
            const forceDice = Math.floor(Math.random() * 6) + 1;
            const tunaDice = [
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1
            ];
            game.rollDice(forceDice, tunaDice);
            sendAction('rollDice', { forceDice, tunaDice });
            render();
            scheduleCPU();
        }, 600);
    }
}

function onSelectDiceCount(useTwo) {
    playSound('dice');
    updateDiceDisplay(null, true);
    setTimeout(() => {
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = useTwo ? Math.floor(Math.random() * 6) + 1 : 0;
        const tunaDice = [
            Math.floor(Math.random() * 6) + 1,
            Math.floor(Math.random() * 6) + 1
        ];
        game.selectDiceCount(useTwo, d1, d2, tunaDice);
        sendAction('selectDice', { useTwo, d1, d2, tunaDice });
        render();
        scheduleCPU();
    }, 600);
}

function onReroll() {
    const forceDice = Math.floor(Math.random() * 6) + 1;
    const tunaDice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    game.rerollDice(forceDice, tunaDice);
    sendAction('rerollDice', { forceDice, tunaDice });
    render();
    scheduleCPU();
}

function onSkipReroll() {
    game.skipReroll();
    sendAction('skipReroll');
    render();
    scheduleCPU();
}

function onResolveHarbor(useBonus) {
    game.resolveHarbor(useBonus);
    sendAction('resolveHarbor', { useBonus });
    render();
    scheduleCPU();
}

function onResolveTV(i) {
    game.resolveTV(i);
    sendAction('resolveTV', { targetIndex: i });
    render();
    scheduleCPU();
}

function onResolveBusiness(targetIndex) {
    const myCard = parseInt(document.getElementById("myCardSelect").value, 10);
    const theirCard = parseInt(document.getElementById(`theirCardSelect_${targetIndex}`).value, 10);
    game.resolveBusiness(myCard, targetIndex, theirCard);
    sendAction('resolveBusiness', { myCard, targetIndex, theirCard });
    render();
    scheduleCPU();
}

function onResolveCleaning(cardName) {
    game.resolveCleaning(cardName);
    sendAction('resolveCleaning', { cardName });
    render();
    scheduleCPU();
}

function onResolveMover(targetIndex) {
    const cardIndex = parseInt(document.getElementById("moverCardSelect").value, 10);
    game.resolveMover(cardIndex, targetIndex);
    sendAction('resolveMover', { cardIndex, targetIndex });
    render();
    scheduleCPU();
}

function onResolveRenovation(landmarkName) {
    game.resolveRenovation(landmarkName);
    sendAction('resolveRenovation', { landmarkName });
    render();
    scheduleCPU();
}

function onResolveIT(doSave) {
    game.resolveIT(doSave);
    sendAction('resolveIT', { doSave });
    render();
    scheduleCPU();
}

function onBuildCard(name) {
    const card = CARDS.find(c => c.name === name);
    if (!card) return;
    showConfirm(`${card.name}を建設しますか？\n💰 ${card.cost}コイン`, () => {
        saveUndoState();
        cancelAutoSkip();
        if (game.buildCard(card)) {
            SHOP_STOCK[name]--;
            sendAction('buildCard', { cardName: name });
            playSound('build');
        }
        render();
        scheduleCPU();
    });
}

function onBuildLandmark(name) {
    const cost = Player.landmarkCost(name);
    showConfirm(`${getLandmarkEmoji(name)} ${name}を建設しますか？\n💰 ${cost}コイン`, () => {
        saveUndoState();
        cancelAutoSkip();
        if (game.buildLandmark(name)) {
            sendAction('buildLandmark', { name });
            playSound('build');
        }
        render();
        scheduleCPU();
    });
}

function onSkip() {
    let msg;
    if (game.builtThisTurn) {
        msg = "建設完了・ターン終了しますか？";
    } else if (game.currentPlayer().landmarks["空港"]) {
        msg = "建設せずにターン終了しますか？\n✈️ 空港効果で+10コイン獲得します";
    } else {
        msg = "建設せずにターン終了しますか？";
    }
    showConfirm(msg, () => {
        cancelAutoSkip();
        undoState = null;
        game.nextTurn();
        sendAction('nextTurn');
        render();
        scheduleCPU();
    });
}

// サイコロの目を描画
function renderDiceFace(num) {
    // 9マスのドット配置（1=中央, 2=左上+右下 など）
    const layouts = {
        1: [0,0,0, 0,1,0, 0,0,0],
        2: [1,0,0, 0,0,0, 0,0,1],
        3: [1,0,0, 0,1,0, 0,0,1],
        4: [1,0,1, 0,0,0, 1,0,1],
        5: [1,0,1, 0,1,0, 1,0,1],
        6: [1,0,1, 1,0,1, 1,0,1],
    };
    const dots = layouts[num] || layouts[1];
    return `<div class="dice-face">
        ${dots.map(d => `<div class="dot ${d ? '' : 'hidden'}"></div>`).join('')}
    </div>`;
}

function updateDiceDisplay(nums, rolling = false) {
    const el = document.getElementById("diceResult");
    if (rolling) {
        el.innerHTML = `<div class="dice-display">
            <div class="dice-face rolling">
                ${[0,0,0,0,0,0,0,0,0].map(() => `<div class="dot"></div>`).join('')}
            </div>
        </div>`;
        return;
    }
    if (!nums || nums.length === 0) {
        el.innerHTML = `<div class="dice-display">${renderDiceFace(1).replace('dice-face', 'dice-face' )}</div>`;
        el.style.opacity = "0.2";
        return;
    }
    el.style.opacity = "1";
    el.innerHTML = `<div class="dice-display">
        ${nums.map(n => renderDiceFace(n)).join('')}
    </div>`;
}

function drawCitySkyline() {
    const canvas = document.getElementById("cityCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = window.innerWidth > 480 ? 480 : window.innerWidth;
    const H = 220;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = "100%";
    canvas.style.height = H + "px";

    ctx.clearRect(0, 0, W, H);

    // 夕焼けグラデーション空
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0,   "#0a0a2a");
    skyGrad.addColorStop(0.3, "#1a1040");
    skyGrad.addColorStop(0.6, "#3a1020");
    skyGrad.addColorStop(0.8, "#6a2010");
    skyGrad.addColorStop(1,   "#2a0a00");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // 月
    const moonX = W * 0.8;
    const moonY = H * 0.2;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 35);
    moonGlow.addColorStop(0,   "rgba(255,240,180,0.3)");
    moonGlow.addColorStop(1,   "rgba(255,240,180,0)");
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(moonX, moonY, 12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,240,200,0.9)";
    ctx.fill();

    // 星
    for (let i = 0; i < 40; i++) {
        const sx = Math.random() * W;
        const sy = Math.random() * H * 0.6;
        const sr = Math.random() * 1.2;
        const alpha = 0.3 + Math.random() * 0.7;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
    }

    // 雲（薄く）
    for (let i = 0; i < 3; i++) {
        const cx = Math.random() * W;
        const cy = H * 0.1 + Math.random() * H * 0.3;
        const cw = 40 + Math.random() * 60;
        const cloudGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw);
        cloudGrad.addColorStop(0,   "rgba(100,60,80,0.15)");
        cloudGrad.addColorStop(1,   "rgba(100,60,80,0)");
        ctx.fillStyle = cloudGrad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, cw, cw * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ビル（遠景・薄い）
    const farBuildings = [
        {x:0, w:30, h:80}, {x:25, w:20, h:100}, {x:40, w:35, h:70},
        {x:70, w:25, h:90}, {x:90, w:40, h:110}, {x:125, w:20, h:75},
        {x:140, w:30, h:95}, {x:165, w:45, h:120}, {x:205, w:25, h:80},
        {x:225, w:35, h:105}, {x:255, w:20, h:70}, {x:270, w:40, h:115},
        {x:305, w:30, h:85}, {x:330, w:25, h:100}, {x:350, w:45, h:130},
        {x:390, w:20, h:75}, {x:405, w:35, h:95}, {x:435, w:30, h:110},
        {x:460, w:25, h:80},
    ];

    farBuildings.forEach(b => {
        const bx = (b.x / 500) * W;
        const bw = (b.w / 500) * W;
        ctx.fillStyle = "rgba(20,10,30,0.6)";
        ctx.fillRect(bx, H - b.h, bw, b.h);
        // 窓
        const cols = Math.floor(bw / 6);
        const rows = Math.floor(b.h / 10);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (Math.random() > 0.4) {
                    const lit = Math.random();
                    if (lit > 0.5) {
                        ctx.fillStyle = lit > 0.8
                            ? `rgba(255,220,100,${0.2 + Math.random() * 0.3})`
                            : `rgba(150,200,255,${0.15 + Math.random() * 0.2})`;
                        ctx.fillRect(bx + c * 6 + 1, H - b.h + r * 10 + 2, 3, 5);
                    }
                }
            }
        }
    });

    // ビル（近景・濃い）
    const nearBuildings = [
        {x:0,   w:50,  h:150},
        {x:45,  w:65,  h:180},
        {x:105, w:40,  h:130},
        {x:140, w:60,  h:170},
        {x:195, w:35,  h:120},
        {x:225, w:70,  h:160},
        {x:290, w:45,  h:140},
        {x:330, w:60,  h:190},
        {x:385, w:40,  h:125},
        {x:420, w:55,  h:165},
        {x:470, w:35,  h:135},
    ];

    nearBuildings.forEach(b => {
        const bx = (b.x / 510) * W;
        const bw = (b.w / 510) * W;

        // ビル本体グラデーション
        const bGrad = ctx.createLinearGradient(bx, H - b.h, bx + bw, H);
        bGrad.addColorStop(0, "#0d0820");
        bGrad.addColorStop(1, "#180d30");
        ctx.fillStyle = bGrad;
        ctx.fillRect(bx, H - b.h, bw, b.h);

        // 輪郭
        ctx.strokeStyle = "rgba(80,50,120,0.4)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(bx, H - b.h, bw, b.h);

        // アンテナ
        if (Math.random() > 0.6) {
            ctx.strokeStyle = "rgba(150,100,200,0.5)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx + bw / 2, H - b.h);
            ctx.lineTo(bx + bw / 2, H - b.h - 15);
            ctx.stroke();
            // アンテナ先端の赤ランプ
            ctx.beginPath();
            ctx.arc(bx + bw / 2, H - b.h - 15, 2, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,50,50,0.8)";
            ctx.fill();
        }

        // 窓
        const cols = Math.floor(bw / 8);
        const rows = Math.floor(b.h / 12);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (Math.random() > 0.3) {
                    const lit = Math.random();
                    if (lit > 0.25) {
                        const alpha = 0.4 + Math.random() * 0.5;
                        ctx.fillStyle = lit > 0.7
                            ? `rgba(255,230,100,${alpha})`
                            : `rgba(100,180,255,${alpha * 0.7})`;
                        ctx.fillRect(bx + c * 8 + 2, H - b.h + r * 12 + 3, 4, 6);
                    }
                }
            }
        }
    });

    // 地面・道路
    const groundGrad = ctx.createLinearGradient(0, H - 15, 0, H);
    groundGrad.addColorStop(0, "#1a0a30");
    groundGrad.addColorStop(1, "#0a0518");
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, H - 15, W, 15);

    // 道路の反射
    ctx.fillStyle = "rgba(255,150,50,0.1)";
    ctx.fillRect(0, H - 5, W, 5);

    // 水面反射効果
    nearBuildings.forEach(b => {
        const bx = (b.x / 510) * W;
        const bw = (b.w / 510) * W;
        const reflGrad = ctx.createLinearGradient(0, H - 15, 0, H - 5);
        reflGrad.addColorStop(0, "rgba(255,200,50,0.05)");
        reflGrad.addColorStop(1, "rgba(255,200,50,0)");
        ctx.fillStyle = reflGrad;
        ctx.fillRect(bx, H - 15, bw, 10);
    });
}

// ===== コイン獲得アニメーション =====
function showCoinAnimation(playerIndex, diff) {
    if (diff > 0) playSound('coin');
    const boxes = document.querySelectorAll('.player-box');
    if (!boxes[playerIndex]) return;
    const box = boxes[playerIndex];
    box.style.position = 'relative';
    const el = document.createElement('div');
    el.className = `coin-float ${diff > 0 ? 'coin-gain' : 'coin-lose'}`;
    el.textContent = (diff > 0 ? '+' : '') + diff + '🪙';
    box.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

// ===== 紙吹雪 =====
function startConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    canvas.style.display = 'block';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const colors = ['#f0c040','#e94560','#3b82f6','#22c55e','#a855f7','#ffffff'];
    confettiPieces = Array.from({ length: 80 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        r: Math.random() * 5 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        speed: Math.random() * 2.5 + 1,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.15,
    }));
    if (confettiInterval) clearInterval(confettiInterval);
    confettiInterval = setInterval(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const p of confettiPieces) {
            p.y += p.speed;
            p.angle += p.spin;
            if (p.y > canvas.height) p.y = -10;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.8);
            ctx.restore();
        }
    }, 16);
    // 5秒後に自動停止
    setTimeout(stopConfetti, 5000);
}

function stopConfetti() {
    if (confettiInterval) {
        clearInterval(confettiInterval);
        confettiInterval = null;
    }
    const canvas = document.getElementById('confettiCanvas');
    if (canvas) {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = 'none';
    }
}

// ===== サウンド =====
function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playSound(type) {
    try {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        switch (type) {
            case 'dice': {
                const bufferSize = Math.floor(ctx.sampleRate * 0.08);
                const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
                const src = ctx.createBufferSource();
                src.buffer = buffer;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.5, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
                src.connect(g); g.connect(ctx.destination);
                src.start();
                break;
            }
            case 'coin': {
                [523, 659].forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const g = ctx.createGain();
                    osc.type = 'sine';
                    osc.connect(g); g.connect(ctx.destination);
                    const t = ctx.currentTime + i * 0.08;
                    osc.frequency.value = freq;
                    g.gain.setValueAtTime(0, t);
                    g.gain.linearRampToValueAtTime(0.15, t + 0.02);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
                    osc.start(t); osc.stop(t + 0.2);
                });
                break;
            }
            case 'build': {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'triangle';
                osc.connect(g); g.connect(ctx.destination);
                osc.frequency.setValueAtTime(392, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(523, ctx.currentTime + 0.1);
                g.gain.setValueAtTime(0.2, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
                osc.start(); osc.stop(ctx.currentTime + 0.35);
                break;
            }
            case 'win': {
                [523, 659, 784, 1047].forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const g = ctx.createGain();
                    osc.connect(g); g.connect(ctx.destination);
                    osc.frequency.value = freq;
                    const t = ctx.currentTime + i * 0.12;
                    g.gain.setValueAtTime(0, t);
                    g.gain.linearRampToValueAtTime(0.2, t + 0.04);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
                    osc.start(t); osc.stop(t + 0.5);
                });
                break;
            }
        }
    } catch(e) {}
}

// ===== オートスキップ =====
function cancelAutoSkip() {
    if (autoSkipTimeout) { clearTimeout(autoSkipTimeout); autoSkipTimeout = null; }
    autoSkipPending = false;
}

function checkAutoSkip() {
    if (autoSkipPending) return;
    if (!game || game.checkWinner()) return;
    if (game.phase !== "build") { cancelAutoSkip(); return; }
    if (cpuPlayers[game.currentPlayerIndex]) return;
    if (isOnlineGame && game.currentPlayerIndex !== myPlayerIndex) return;
    if (game.pendingRenovation > 0) return;
    if (game.builtThisTurn) { cancelAutoSkip(); return; }

    const current = game.currentPlayer();
    const canAffordCard = CARDS.some(card =>
        SHOP_STOCK[card.name] > 0 &&
        current.coins >= card.cost &&
        card.cost > 0 &&
        !(card.color === "purple" && current.countCard(card.name) > 0)
    );
    const canAffordLandmark = Object.entries(current.landmarks)
        .some(([name, built]) => !built && name !== "役所" && current.coins >= Player.landmarkCost(name));

    if (!canAffordCard && !canAffordLandmark) {
        autoSkipPending = true;
        autoSkipTimeout = setTimeout(() => {
            autoSkipPending = false;
            autoSkipTimeout = null;
            if (game && game.phase === "build" && !game.builtThisTurn) {
                game.nextTurn();
                sendAction('nextTurn');
                render();
                scheduleCPU();
            }
        }, 1500);
    }
}

// 初期表示
loadSettings();
renderOnlinePlayerSettings();;
updateResumeButton();
drawCitySkyline();
window.addEventListener("resize", drawCitySkyline);
