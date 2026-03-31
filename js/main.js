let game;
const SHOP_STOCK = {};
let selectedCount = 2;
let playerSettings = [];
let cpuPlayers = [];
let cpuSpeed = 1500;

// オンライン対戦
let onlineSelectedCount = 2;
let onlinePlayerSettings = [];
let onlineCpuSpeed = 1500;
let isRoomHost = false; // ルーム作成者かどうか

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
let socket = null;
let myPlayerIndex = -1;
let isOnlineGame = false;
let myRoomId = null;

function changeCount(delta) {
    selectedCount = Math.min(10, Math.max(2, selectedCount + delta));
    document.getElementById("playerCount").textContent = selectedCount;
    renderPlayerSettings();
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
}

function startGame() {
    cpuSpeed = parseInt(document.getElementById("cpuSpeed").value);
    document.getElementById("titleScreen").style.display = "none";
    document.getElementById("gameScreen").style.display = "block";
    cpuPlayers = playerSettings.map(s =>
        s.type === "cpu" ? new CPU(s.difficulty) : null
    );
    init(selectedCount);
}

function restartGame() {
    isOnlineGame = false;
    isRoomHost = false;
    myPlayerIndex = -1;
    document.getElementById("gameScreen").style.display = "none";
    document.getElementById("titleScreen").style.display = "block";
    selectedCount = 2;
    playerSettings = [];
    cpuPlayers = [];
    document.getElementById("playerCount").textContent = 2;
    renderPlayerSettings();
    drawCitySkyline();
}

function init(playerCount) {
    game = new GameManager(playerCount);
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
}

function scheduleCPU() {
    if (isOnlineGame && !isRoomHost) return;
    if (!game || game.checkWinner()) return;
    const ci = game.currentPlayerIndex;
    if (!cpuPlayers[ci]) return;
    const cpu = cpuPlayers[ci];

    setTimeout(() => {
        if (game.phase === "roll") {
            const forceDice = Math.floor(Math.random() * 6) + 1;
            const tunaDice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
            cpuDo('rollDice', { forceDice, tunaDice }, () => game.rollDice(forceDice, tunaDice));
        }
        setTimeout(() => {
            if (game.phase === "selectDice") {
                const useTwo = cpu.chooseDiceCount(game);
                const d1 = Math.floor(Math.random() * 6) + 1;
                const d2 = Math.floor(Math.random() * 6) + 1;
                const tunaDice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
                cpuDo('selectDice', { useTwo, d1, d2, tunaDice }, () => game.selectDiceCount(useTwo, d1, d2, tunaDice));
            }
            setTimeout(() => {
                if (game.phase === "rerollConfirm") {
                    if (cpu.chooseReroll(game)) {
                        const forceDice = Math.floor(Math.random() * 6) + 1;
                        const tunaDice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
                        cpuDo('rerollDice', { forceDice, tunaDice }, () => game.rerollDice(forceDice, tunaDice));
                    } else {
                        cpuDo('skipReroll', {}, () => game.skipReroll());
                    }
                }
                setTimeout(() => {
                    if (game.phase === "harborChoice") {
                        const useBonus = cpu.chooseHarbor(game);
                        cpuDo('resolveHarbor', { useBonus }, () => game.resolveHarbor(useBonus));
                    }
                    setTimeout(() => {
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
                                    cpuDo('resolveBusiness', { myCard: myCard.name, targetIndex: i, theirCard: theirCard.name },
                                        () => game.resolveBusiness(myCard.name, i, theirCard.name));
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
                                const myCards = cur.cards.filter(c => c.category !== "大施設" && !cur.isDormant(c));
                                const others = game.players.map((p, i) => i).filter(i => i !== game.currentPlayerIndex);
                                if (myCards.length > 0 && others.length > 0) {
                                    const cardName = myCards[0].name;
                                    const targetIndex = others[0];
                                    cpuDo('resolveMover', { cardName, targetIndex }, () => game.resolveMover(cardName, targetIndex));
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
                        setTimeout(() => {
                            if (game.phase === "build") {
                                cpu.build(game, SHOP_STOCK);
                                render();
                            }
                            setTimeout(() => {
                                if (game.phase === "build") {
                                    cpuDo('nextTurn', {}, () => game.nextTurn());
                                }
                                setTimeout(() => {
                                    if (game.pendingIT) {
                                        const doSave = cpu.difficulty !== "weak" && game.currentPlayer().coins >= 1;
                                        cpuDo('resolveIT', { doSave }, () => game.resolveIT(doSave));
                                    }
                                    setTimeout(() => {
                                        if (!game.checkWinner()) scheduleCPU();
                                    }, 500);
                                }, cpuSpeed);
                            }, cpuSpeed);
                        }, cpuSpeed);
                    }, cpuSpeed);
                }, cpuSpeed);
            }, cpuSpeed);
        }, cpuSpeed);
    }, cpuSpeed);
}

// オンライン対戦
function initSocket() {
    if (socket) return;
    socket = io();

    socket.on('roomCreated', ({ roomId, playerIndex }) => {
        myPlayerIndex = playerIndex;
        myRoomId = roomId;
        document.getElementById("onlineStatus").innerHTML = `
            <div>ルームを作成しました！</div>
            <div class="room-id-display">${roomId}</div>
            <div class="waiting-players">参加者を待っています...</div>`;
    });

    socket.on('roomJoined', ({ roomId, playerIndex }) => {
        myPlayerIndex = playerIndex;
        myRoomId = roomId;
        document.getElementById("onlineStatus").textContent = `ルーム ${roomId} に参加しました！`;
    });

    socket.on('playerList', (players) => {
        document.getElementById("onlineStatus").innerHTML = `
            <div class="room-id-display">${myRoomId}</div>
            <div class="waiting-players">参加者: ${players.join('、')} (${players.length}人)</div>`;
    });

    socket.on('gameStart', ({ playerNames, playerSettings: ps, cpuSpeed: cs, playerOrder, enabledCards: ec }) => {
        isOnlineGame = true;
        cpuSpeed = cs || 1500;
        if (ec) enabledCards = new Set(ec);
        document.getElementById("titleScreen").style.display = "none";
        document.getElementById("gameScreen").style.display = "block";
        initOnlineGame(playerNames, ps, playerOrder);
    });

    socket.on('gameAction', ({ action, data, playerIndex }) => {
        handleRemoteAction(action, data);
    });

    socket.on('playerDisconnected', (playerIndex) => {
        alert(`プレイヤー${playerIndex + 1}が切断しました`);
    });

    socket.on('error', (msg) => {
        document.getElementById("onlineStatus").textContent = `❌ ${msg}`;
    });
}

function showCreateRoom() {
    const name = document.getElementById("playerNameInput").value.trim();
    if (!name) { alert("名前を入力してください"); return; }
    onlineCpuSpeed = parseInt(document.getElementById("onlineCpuSpeed").value);
    initSocket();
    isRoomHost = true;
    socket.emit('createRoom', {
        playerName: name,
        playerCount: onlineSelectedCount,
        playerSettings: onlinePlayerSettings,
        cpuSpeed: onlineCpuSpeed,
        enabledCards: [...enabledCards]
    });
}

function showJoinRoom() {
    const name = document.getElementById("playerNameInput").value.trim();
    if (!name) { alert("名前を入力してください"); return; }
    document.getElementById("roomInput").style.display = "block";
}

function joinRoom() {
    const name = document.getElementById("playerNameInput").value.trim();
    const roomId = document.getElementById("roomIdInput").value.trim().toUpperCase();
    if (!name) { alert("名前を入力してください"); return; }
    if (roomId.length !== 6) { alert("ルームIDは6文字です"); return; }
    initSocket();
    socket.emit('joinRoom', { roomId, playerName: name });
}

function initOnlineGame(playerNames, ps, playerOrder) {
    const count = playerNames.length;
    game = new GameManager(count);
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
    const originalMyIndex = myPlayerIndex;
    myPlayerIndex = order.indexOf(originalMyIndex);
    if (myPlayerIndex === -1) myPlayerIndex = 0; // 見つからない場合はホスト
    
    game.addLog(`👤 ${game.currentPlayer().name}のターン`);
    render();
    scheduleCPU();
}

function handleRemoteAction(action, data) {
    switch(action) {
        case 'rollDice':      game.rollDice(data.forceDice, data.tunaDice); break;
        case 'selectDice':    game.selectDiceCount(data.useTwo, data.d1, data.d2, data.tunaDice); break;
        case 'skipReroll':    game.skipReroll(); break;
        case 'rerollDice':    game.rerollDice(data.forceDice, data.tunaDice); break;
        case 'resolveHarbor': game.resolveHarbor(data.useBonus); break;
        case 'resolveTV':     game.resolveTV(data.targetIndex); break;
        case 'resolveBusiness': game.resolveBusiness(data.myCard, data.targetIndex, data.theirCard); break;
        case 'resolveCleaning': game.resolveCleaning(data.cardName); break;
        case 'resolveMover':  game.resolveMover(data.cardName, data.targetIndex); break;
        case 'resolveRenovation': game.resolveRenovation(data.landmarkName); break;
        case 'resolveIT':     game.resolveIT(data.doSave); break;
        case 'buildCard':
            const card = CARDS.find(c => c.name === data.cardName);
            if (card && game.buildCard(card)) SHOP_STOCK[data.cardName]--;
            break;
        case 'buildLandmark': game.buildLandmark(data.name); break;
        case 'nextTurn':      game.nextTurn(); break;
    }
    render();
    scheduleCPU();
}

function sendAction(action, data = {}) {
    if (isOnlineGame && socket) {
        socket.emit('gameAction', { action, data });
    }
}

function render() {
    if (!game) return;
    const current = game.currentPlayer();
    const winner = game.checkWinner();

    if (winner) {
        const winnerIdx = game.players.indexOf(winner);
        const isCPUWinner = cpuPlayers[winnerIdx] !== null;
        document.getElementById("status").innerHTML = `
            <div class="winner-screen">
                <div class="winner-emoji">🏆</div>
                <div class="winner-title">${winner.name}の勝利！</div>
                <div class="winner-sub">${isCPUWinner ? '🤖 CPU' : '👤 人間'}プレイヤーが勝ちました</div>
            </div>`;
        document.getElementById("btnRoll").disabled = true;
        const btnSkip = document.getElementById("btnSkip");
        btnSkip.disabled = true;
        btnSkip.textContent = "建設しないでターン終了";
        document.getElementById("btnReroll").style.display = "none";
        document.getElementById("diceChoose").innerHTML = "";
        document.getElementById("buildMenu").innerHTML = "";
        renderPlayers();
        return;
    }

    document.getElementById("status").textContent =
        `👤 ${current.name}のターン　🪙 ${current.coins}コイン`;

    const isCPUTurn = cpuPlayers[game.currentPlayerIndex] !== null;
    const isMyTurn = !isOnlineGame || game.currentPlayerIndex === myPlayerIndex;
    document.getElementById("btnRoll").disabled = game.phase !== "roll" || isCPUTurn || !isMyTurn;
    const btnSkip = document.getElementById("btnSkip");
    btnSkip.disabled = game.phase !== "build" || isCPUTurn || game.pendingRenovation > 0 || !isMyTurn;
    btnSkip.textContent = game.builtThisTurn ? "建設完了・ターン終了" : "建設しないでターン終了";

    document.getElementById("btnReroll").style.display = "none";

    if (game.lastDice1 > 0 && game.lastDice2 > 0) {
        updateDiceDisplay([game.lastDice1, game.lastDice2]);
    } else if (game.lastDiceResult > 0) {
        updateDiceDisplay([game.lastDiceResult]);
    } else {
        updateDiceDisplay(null);
    }

    renderDiceChoose();
    renderPending();

    document.getElementById("log").innerHTML =
        game.log.map(l => {
            let cls = "log-system";
            if (l.startsWith("🎲") || l.startsWith("📡") || l.startsWith("⚓") || l.startsWith("🚉")) cls = "log-dice";
            else if (l.startsWith("💸") || l.startsWith("🍸") || l.startsWith("🍽️")) cls = "log-lose";
            else if (l.startsWith("🌾") || l.startsWith("🏪") || l.startsWith("🐟") || l.startsWith("🌽") || l.startsWith("🍷") || l.startsWith("💻")) cls = "log-gain";
            else if (l.startsWith("🏗️") || l.startsWith("🏆") || l.startsWith("🔨")) cls = "log-build";
            else if (l.startsWith("🏟️") || l.startsWith("📺") || l.startsWith("🏢") || l.startsWith("🧹") || l.startsWith("🚚") || l.startsWith("📰") || l.startsWith("🏛️") || l.startsWith("🌳")) cls = "log-special";
            else if (l.startsWith("❌")) cls = "log-error";
            else if (l.startsWith("👤") || l.startsWith("🎡") || l.startsWith("✈️") || l.startsWith("💳")) cls = "log-system";
            return `<div class="log-item ${cls}">${l}</div>`;
        }).join("");
    // 最新ログに自動スクロール
    const logEl = document.getElementById("log");
    logEl.scrollTop = logEl.scrollHeight;

    renderPlayers();
    renderBuildMenu();
}

function renderDiceChoose() {
    const el = document.getElementById("diceChoose");
    const isMyTurn = !isOnlineGame || game.currentPlayerIndex === myPlayerIndex;
    if (!isMyTurn) { el.innerHTML = ""; return; }

    if (game.phase === "selectDice") {
        el.innerHTML = `
            <div class="dice-choose">
                <p>🚉 駅：何個振りますか？</p>
                <button onclick="onSelectDiceCount(false)">🎲 1個</button>
                <button onclick="onSelectDiceCount(true)">🎲🎲 2個（合計を使う）</button>
            </div>`;
        return;
    }
    if (game.phase === "rerollConfirm") {
        el.innerHTML = `
            <div class="dice-choose">
                <p>📡 電波塔：🎲${game.lastDiceResult} を振り直しますか？</p>
                <button onclick="onReroll()">振り直す</button>
                <button onclick="onSkipReroll()">このまま使う</button>
            </div>`;
        return;
    }
    if (game.phase === "harborChoice") {
        el.innerHTML = `
            <div class="dice-choose">
                <p>⚓ 港効果：合計${game.lastDiceResult}に+2しますか？</p>
                <button onclick="onResolveHarbor(true)">+2する（→${game.lastDiceResult + 2}）</button>
                <button onclick="onResolveHarbor(false)">そのまま使う（${game.lastDiceResult}）</button>
            </div>`;
        return;
    }
    el.innerHTML = "";
}

function renderPending() {
    const el = document.getElementById("pendingMenu");
    if (game.phase !== "pending" && !game.pendingIT && game.pendingRenovation <= 0) { el.innerHTML = ""; return; }

    const isMyTurn = !isOnlineGame || game.currentPlayerIndex === myPlayerIndex;
    if (!isMyTurn) { el.innerHTML = ""; return; }

    let html = "";

    if (game.pendingTV > 0) {
        const others = game.players
            .map((p, i) => ({ p, i }))
            .filter(({ i }) => i !== game.currentPlayerIndex);
        html += `<div class="pending-box">
            <p>📺 テレビ局：コインを奪う相手を選んでください</p>
            ${others.map(({ p, i }) =>
                `<button onclick="onResolveTV(${i})">${p.name}（🪙${p.coins}）</button>`
            ).join("")}
        </div>`;
    }

    if (game.pendingBusiness > 0) {
        const current = game.currentPlayer();
        const myCards = [...new Set(current.cards
            .filter(c => c.category !== "大施設")
            .map(c => c.name))];
        const others = game.players
            .map((p, i) => ({ p, i }))
            .filter(({ i }) => i !== game.currentPlayerIndex);
        html += `<div class="pending-box">
            <p>🏢 ビジネスセンター：施設を交換します</p>
            <p>自分の施設：</p>
            <select id="myCardSelect">
                ${myCards.map(n => `<option value="${n}">${n}</option>`).join("")}
            </select>
            ${others.map(({ p, i }) => {
                const theirCards = [...new Set(p.cards
                    .filter(c => c.category !== "大施設")
                    .map(c => c.name))];
                return `<p>${p.name}の施設：</p>
                    <select id="theirCardSelect_${i}">
                        ${theirCards.map(n => `<option value="${n}">${n}</option>`).join("")}
                    </select>
                    <button onclick="onResolveBusiness(${i})">${p.name}と交換</button>`;
            }).join("")}
        </div>`;
    }

    if (game.pendingCleaning > 0) {
        const allCardNames = [...new Set(
            game.players.flatMap(p =>
                p.cards.filter(c => c.category !== "大施設" && !p.isDormant(c))
                    .map(c => c.name)
            )
        )];
        html += `<div class="pending-box">
            <p>🧹 清掃業：休業にする施設を選んでください</p>
            ${allCardNames.map(name =>
                `<button onclick="onResolveCleaning('${name}')">${name}</button>`
            ).join("")}
        </div>`;
    }

    if (game.pendingMover > 0) {
        const current = game.currentPlayer();
        const myCards = [...new Set(current.cards
            .filter(c => c.category !== "大施設" && !current.isDormant(c))
            .map(c => c.name))];
        const others = game.players
            .map((p, i) => ({ p, i }))
            .filter(({ i }) => i !== game.currentPlayerIndex);
        html += `<div class="pending-box">
            <p>🚚 引越し屋：渡す施設と相手を選んでください</p>
            <p>渡す施設：</p>
            <select id="moverCardSelect">
                ${myCards.map(n => `<option value="${n}">${n}</option>`).join("")}
            </select>
            ${others.map(({ p, i }) =>
                `<button onclick="onResolveMover(${i})">${p.name}に渡す</button>`
            ).join("")}
        </div>`;
    }

    if (game.pendingRenovation > 0) {
        const current = game.currentPlayer();
        const builtLandmarks = Object.entries(current.landmarks)
            .filter(([name, built]) => built && name !== "役所")
            .map(([name]) => name);
        html += `<div class="pending-box">
            <p>🔨 改装屋：取り壊すランドマークを選んでください（+8コイン）</p>
            ${builtLandmarks.length > 0
                ? builtLandmarks.map(name =>
                    `<button onclick="onResolveRenovation('${name}')">${name}</button>`
                ).join("")
                : "<p>建設済みのランドマークがありません</p>"
            }
        </div>`;
    }

    if (game.pendingIT) {
        const cur = game.currentPlayer();
        const canSave = cur.coins >= 1;
        html += `<div class="pending-box">
            <p>💻 ITベンチャー：1コイン積立しますか？</p>
            <p>現在の積立：${cur.itVentureCoins}コイン　所持：🪙${cur.coins}</p>
            <button onclick="onResolveIT(true)" ${canSave ? "" : "disabled"}>
                積立する（→積立${cur.itVentureCoins + 1}コイン）
            </button>
            <button onclick="onResolveIT(false)">スキップ</button>
        </div>`;
    }

    el.innerHTML = html;
}

function renderPlayers() {
    const html = game.players.map((p, idx) => {
        const isActive = idx === game.currentPlayerIndex;
        const isCPU = cpuPlayers[idx] !== null;
        const cpuLabel = isCPU
            ? `🤖${cpuPlayers[idx].difficulty === 'weak' ? '弱' : cpuPlayers[idx].difficulty === 'normal' ? '普' : '強'}`
            : '👤';

        // ランドマーク
        const landmarks = Object.entries(p.landmarks)
            .map(([name, built]) =>
                `<span class="landmark-badge ${built ? 'built' : ''}">${getLandmarkEmoji(name)} ${name}</span>`)
            .join("");

        // カード集計
        const cards = {};
        for (const c of p.cards) {
            if (!cards[c.name]) cards[c.name] = { count: 0, dormant: 0, color: c.color };
            cards[c.name].count++;
            if (p.isDormant(c)) cards[c.name].dormant++;
        }
        const colorDot = { blue: "#3b82f6", green: "#22c55e", red: "#ef4444", purple: "#a855f7" };
        const cardHtml = Object.entries(cards).map(([name, info]) => {
            const dormantText = info.dormant > 0 ? `💤` : '';
            return `<span class="card-badge" style="border-left:2px solid ${colorDot[info.color]}">
                ${name}×${info.count}${dormantText}
            </span>`;
        }).join("");

        const itCoins = p.itVentureCoins > 0 ? `<span class="it-badge">💻${p.itVentureCoins}</span>` : "";
        const loanCount = p.cards.filter(c => c.effect === "loan").length;
        const loanBadge = loanCount > 0 ? `<span class="loan-badge">💳×${loanCount}</span>` : "";

        return `<div class="player-box ${isActive ? 'active' : ''}">
            <div class="player-header">
                <div class="player-name-row">
                    <span class="player-icon">${cpuLabel}</span>
                    <span class="player-name">${isActive ? '▶ ' : ''}${p.name}</span>
                </div>
                <div class="player-coin-row">
                    <span class="player-coins">🪙 ${p.coins}</span>
                    ${itCoins}${loanBadge}
                </div>
            </div>
            <div class="player-landmarks">${landmarks}</div>
            <div class="player-cards">${cardHtml}</div>
        </div>`;
    }).join("");
    document.getElementById("players").innerHTML = html;
}

function getEffectText(card) {
    switch(card.effect) {
        case "cheese":        return "牧場1軒につき+" + card.income + "コイン";
        case "furniture":     return "森林・鉱山1軒につき+" + card.income + "コイン";
        case "market":        return "農園系1軒につき+" + card.income + "コイン";
        case "flower":        return "花畑1軒につき+" + card.income + "コイン";
        case "foodwarehouse": return "飲食店1軒につき+" + card.income + "コイン";
        case "stadium":       return "全員から" + card.income + "コイン奪う";
        case "tv":            return "任意の1人から" + card.income + "コイン奪う";
        case "business":      return "大施設以外を他プレイヤーと交換";
        case "publisher":     return "全員の飲食店・商店1軒につき1コイン奪う";
        case "taxoffice":     return "10コイン以上の全員から半分奪う";
        case "harbor":        return "港あり：+" + card.income + "コイン";
        case "harbor_red":    return "港あり：相手から" + card.income + "コイン奪う";
        case "tuna":          return "港あり：ダイス2個分コイン";
        case "cornfield":     return "ランドマーク0-1軒なら+1コイン";
        case "fewlandmark":   return "ランドマーク0-1軒なら+1コイン";
        case "renovation":    return "ランドマーク1軒を戻して+8コイン";
        case "loan":          return "建設時+5コイン・5か6が出たら-2コイン";
        case "winery":        return "ブドウ園1軒につき+6コイン（自身休業）";
        case "mover":         return "大施設以外を相手に渡して+4コイン";
        case "drinkfactory":  return "全員の飲食店1軒につき+1コイン";
        case "frenchr":       return "相手ランドマーク2軒以上なら5コイン奪う";
        case "memberbar":     return "相手ランドマーク3軒以上なら全コイン奪う";
        case "cleaning":      return "施設1種を休業にして休業数コイン獲得";
        case "itstartup":     return "ターン終了時1コイン積立・全員から積立額奪う";
        case "park":          return "全員のコインを均等分配";
        default:
            if (card.color === "red") return "相手から" + card.income + "コイン奪う";
            return "+" + card.income + "コイン";
    }
}

function getLandmarkEffectText(name) {
    const effects = {
        "駅":             "サイコロを1個か2個か選べる",
        "ショッピングモール": "飲食店・商店の収入+1",
        "遊園地":         "ゾロ目でもう1ターン",
        "電波塔":         "1ターン1回振り直せる",
        "港":             "ダイス合計10以上で+2選択可",
        "空港":           "建設しないターンに+10コイン",
    };
    return effects[name] || "";
}

function getLandmarkEmoji(name) {
    const emojis = {
        "駅":             "🚉",
        "ショッピングモール": "🛍️",
        "遊園地":         "🎡",
        "電波塔":         "📡",
        "港":             "⚓",
        "空港":           "✈️",
        "役所":           "🏛️",
    };
    return emojis[name] || "🏛️";
}

function renderBuildMenu() {
    const current = game.currentPlayer();
    const isMyTurn = !isOnlineGame || game.currentPlayerIndex === myPlayerIndex;
    const isCPUTurn = cpuPlayers[game.currentPlayerIndex] !== null;
    const canBuild = game.phase === "build" && isMyTurn && !isCPUTurn && game.pendingRenovation <= 0;

    const colorMap = {
        blue: "#3b82f6", green: "#22c55e",
        red: "#ef4444", purple: "#a855f7"
    };

    const cardHtml = CARDS.map(card => {
        const stock = SHOP_STOCK[card.name];
        if (stock <= 0) return "";
        const canBuildThis = canBuild &&
            current.coins >= card.cost &&
            !(card.color === "purple" && current.countCard(card.name) > 0);
        const effectText = getEffectText(card);
        return `<button class="card-btn card-color-${card.color}" onclick="onBuildCard('${card.name}')"
            ${canBuildThis ? "" : "disabled"}>
            <div class="card-top-strip">
                <span class="card-dice-num">🎲 ${card.diceNums.join("・")}</span>
                <span class="card-category-tag">${card.category}</span>
            </div>
            <div class="card-body">
                <div class="card-btn-top">
                    <span class="card-name">${card.name}</span>
                    <span class="card-cost">💰${card.cost}</span>
                </div>
                <div class="card-effect">${effectText}</div>
            </div>
            <div class="card-footer">残り${stock}枚</div>
        </button>`;
    }).join("");

    const landmarkHtml = Object.entries(current.landmarks)
        .filter(([name]) => name !== "役所")
        .map(([name, built]) => {
            const cost = Player.landmarkCost(name);
            const canBuildThis = canBuild && !built && current.coins >= cost;
            return `<button class="card-btn card-color-landmark" onclick="onBuildLandmark('${name}')"
                ${canBuildThis ? "" : "disabled"}>
                <div class="card-top-strip">
                    <span class="card-dice-num">${getLandmarkEmoji(name)}</span>
                    <span class="card-category-tag">ランドマーク</span>
                </div>
                <div class="card-body">
                    <div class="card-btn-top">
                        <span class="card-name">${name}</span>
                        <span class="card-cost">${built ? "✅済" : "💰" + cost}</span>
                    </div>
                    <div class="card-effect">${getLandmarkEffectText(name)}</div>
                </div>
            </button>`;
        }).join("");

    document.getElementById("buildMenu").innerHTML = `
        <h3>🏗️ ${canBuild ? "建設する施設を選んでください" : "施設一覧"}</h3>
        <div class="build-section"><h4>施設カード</h4><div class="card-grid">${cardHtml}</div></div>
        <div class="build-section"><h4>ランドマーク</h4><div class="card-grid">${landmarkHtml}</div></div>`;
}

function onRoll() {
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
    const myCard = document.getElementById("myCardSelect").value;
    const theirCard = document.getElementById(`theirCardSelect_${targetIndex}`).value;
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
    const cardName = document.getElementById("moverCardSelect").value;
    game.resolveMover(cardName, targetIndex);
    sendAction('resolveMover', { cardName, targetIndex });
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
    if (card && game.buildCard(card)) {
        SHOP_STOCK[name]--;
        sendAction('buildCard', { cardName: name });
    }
    render();
    scheduleCPU();
}

function onBuildLandmark(name) {
    game.buildLandmark(name);
    sendAction('buildLandmark', { name });
    render();
    scheduleCPU();
}

function onSkip() {
    game.nextTurn();
    sendAction('nextTurn');
    render();
    scheduleCPU();
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

function switchTab(tab) {
    document.getElementById("tabContentLocal").style.display = tab === "local" ? "flex" : "none";
    document.getElementById("tabContentOnline").style.display = tab === "online" ? "flex" : "none";
    document.getElementById("tabLocal").className = `tab-btn ${tab === "local" ? "active" : ""}`;
    document.getElementById("tabOnline").className = `tab-btn ${tab === "online" ? "active" : ""}`;
}

function switchOnlineTab(tab) {
    document.getElementById("onlineCreate").style.display = tab === "create" ? "block" : "none";
    document.getElementById("onlineJoin").style.display = tab === "join" ? "block" : "none";
    document.getElementById("onlineTabCreate").className = `online-tab-btn ${tab === "create" ? "active" : ""}`;
    document.getElementById("onlineTabJoin").className = `online-tab-btn ${tab === "join" ? "active" : ""}`;
}

function showRules() {
    document.getElementById("rulesModal").style.display = "flex";
}

function closeRules() {
    document.getElementById("rulesModal").style.display = "none";
}

// カードセット定義
const CARD_SETS = {
    basic: ["麦畑","牧場","パン屋","カフェ","コンビニ","森林","スタジアム","チーズ工場","家具工場","鉱山","ファミレス","リンゴ園","青果市場","テレビ局","ビジネスセンター"],
    plus:  ["花畑","サンマ漁船","マグロ漁船","フラワーショップ","食品倉庫","寿司屋","ピザ屋","バーガーショップ","出版社","税務署"],
    sharp: ["コーン畑","ブドウ園","雑貨屋","改装屋","貸金業","ワイナリー","引越し屋","ドリンク工場","高級フレンチ","会員制BAR","清掃業","ITベンチャー","公園"],
};

// 有効なカード（デフォルト全ON）
let enabledCards = new Set(CARDS.map(c => c.name));

function showCardSelect() {
    renderCardSelectModal();
    document.getElementById("cardSelectModal").style.display = "flex";
}

function closeCardSelect() {
    document.getElementById("cardSelectModal").style.display = "none";
}

function renderCardSelectModal() {
    for (const [set, cards] of Object.entries(CARD_SETS)) {
        const el = document.getElementById(`cardList${set.charAt(0).toUpperCase() + set.slice(1)}`);
        el.innerHTML = cards.map(name => {
            const on = enabledCards.has(name);
            return `<button class="card-toggle-btn ${on ? 'on' : 'off'}"
                onclick="toggleCard('${name}')" id="cardToggle_${name}">
                ${name}
            </button>`;
        }).join("");

        // セットボタンの状態
        const allOn = cards.every(n => enabledCards.has(n));
        const btn = document.getElementById(`btnSet${set.charAt(0).toUpperCase() + set.slice(1)}`);
        btn.textContent = allOn ? "ON" : "OFF";
        btn.className = `set-toggle ${allOn ? 'on' : 'off'}`;
    }
}

function toggleCard(name) {
    if (enabledCards.has(name)) {
        // 基本セットの麦畑・パン屋は無効化不可
        if (name === "麦畑" || name === "パン屋") return;
        enabledCards.delete(name);
    } else {
        enabledCards.add(name);
    }
    renderCardSelectModal();
}

function toggleSet(set) {
    const cards = CARD_SETS[set];
    const allOn = cards.every(n => enabledCards.has(n));
    for (const name of cards) {
        if (name === "麦畑" || name === "パン屋") continue;
        if (allOn) enabledCards.delete(name);
        else enabledCards.add(name);
    }
    renderCardSelectModal();
}

// 初期表示
renderPlayerSettings();
renderOnlinePlayerSettings();;
drawCitySkyline();
window.addEventListener("resize", drawCitySkyline);
