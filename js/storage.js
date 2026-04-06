function saveGameState() {
    if (!game || isOnlineGame) return;
    if (game.checkWinner()) return;
    try {
        const state = {
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
            log: game.log.slice(-30),
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
            cpuSettings: cpuPlayers.map(c => c ? { difficulty: c.difficulty } : null),
            cpuSpeed,
            enabledCardsList: [...enabledCards],
            enabledLandmarksList: [...enabledLandmarks],
        };
        localStorage.setItem('savedGame', JSON.stringify(state));
    } catch(e) {}
}

function updateResumeButton() {
    const localSection = document.getElementById('resumeSection');
    if (localSection) localSection.style.display = localStorage.getItem('savedGame') ? 'flex' : 'none';
    const onlineSection = document.getElementById('onlineResumeSection');
    if (onlineSection) onlineSection.style.display = localStorage.getItem('onlineSession') ? 'block' : 'none';
}

function deleteSavedGame() {
    showConfirm("セーブデータを削除しますか？", () => {
        localStorage.removeItem('savedGame');
        updateResumeButton();
    });
}

function deleteOnlineSession() {
    showConfirm("オンライン再接続データを削除しますか？", () => {
        localStorage.removeItem('onlineSession');
        updateResumeButton();
    });
}

function reconnectOnline() {
    const raw = localStorage.getItem('onlineSession');
    if (!raw) return;
    try {
        const session = JSON.parse(raw);
        isReconnectingOnline = true;
        isRoomHost = session.isRoomHost || false;
        myPlayerName = session.playerName || '';
        myRoomId = session.roomId;
        reconnectToken = session.reconnectToken || '';
        initSocket();
        document.getElementById('onlineStatus') && (document.getElementById('onlineStatus').textContent = '再接続中...');
        switchTab('online');
        socket.emit('rejoinRoom', {
            roomId: session.roomId,
            playerIndex: session.playerIndex,
            playerName: session.playerName,
            reconnectToken: session.reconnectToken,
        });
    } catch(e) {
        isReconnectingOnline = false;
        localStorage.removeItem('onlineSession');
        updateResumeButton();
        alert('再接続データの読み込みに失敗しました');
    }
}

function resumeGame() {
    const raw = localStorage.getItem('savedGame');
    if (!raw) return;
    try {
        const state = JSON.parse(raw);
        cpuScheduleToken++;
        cpuSpeed = state.cpuSpeed || 1500;
        if (state.enabledCardsList) enabledCards = new Set(state.enabledCardsList);
        if (state.enabledLandmarksList && state.enabledLandmarksList.length > 0) {
            enabledLandmarks = new Set(state.enabledLandmarksList);
        } else {
            enabledLandmarks = new Set(Player.landmarkNames());
        }
        game = new GameManager(state.players.length);
        game.enabledLandmarks = new Set(enabledLandmarks);
        for (const [name, count] of Object.entries(state.shopStock)) SHOP_STOCK[name] = count;
        state.players.forEach((ps, i) => {
            const p = game.players[i];
            p.name = ps.name;
            p.coins = ps.coins;
            p.cards = ps.cards.map(name => createCardByName(name)).filter(Boolean);
            p.dormantCards = ps.dormantIndices.map(idx => p.cards[idx]).filter(Boolean);
            p.landmarks = Object.assign({}, ps.landmarks);
            p.itVentureCoins = ps.itVentureCoins || 0;
            p.hasYakusho = ps.hasYakusho !== false;
        });
        game.currentPlayerIndex = state.currentPlayerIndex;
        game.phase = state.phase;
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
        cpuPlayers = state.cpuSettings.map(s => s ? new CPU(s.difficulty, { expertPurpose: "live" }) : null);
        prevCoins = null;
        winSoundPlayed = false;
        cancelAutoSkip();
        undoState = null;
        document.getElementById("titleScreen").style.display = "none";
        document.getElementById("gameScreen").style.display = "block";
        render();
        scheduleCPU();
    } catch(e) {
        localStorage.removeItem('savedGame');
        updateResumeButton();
        alert("セーブデータの読み込みに失敗しました");
    }
}

function saveUndoState() {
    undoState = {
        playerCoins: game.players.map(p => p.coins),
        playerCardNames: game.players.map(p => p.cards.map(c => c.name)),
        playerDormantIndices: game.players.map(p => p.dormantCards.map(dc => p.cards.indexOf(dc)).filter(i => i >= 0)),
        playerLandmarks: game.players.map(p => Object.assign({}, p.landmarks)),
        playerItVenture: game.players.map(p => p.itVentureCoins),
        playerHasYakusho: game.players.map(p => p.hasYakusho),
        hadAmusementParkAtRoll: game.hadAmusementParkAtRoll,
        shopStock: Object.assign({}, SHOP_STOCK),
        builtThisTurn: game.builtThisTurn,
        log: [...game.log],
    };
}

function restoreUndoSnapshot(state) {
    if (!state) return;
    game.players.forEach((p, i) => {
        p.coins = state.playerCoins[i];
        p.cards = state.playerCardNames[i].map(name => createCardByName(name)).filter(Boolean);
        p.dormantCards = (state.playerDormantIndices?.[i] || []).map(idx => p.cards[idx]).filter(Boolean);
        p.landmarks = Object.assign({}, state.playerLandmarks[i]);
        p.itVentureCoins = state.playerItVenture[i];
        p.hasYakusho = state.playerHasYakusho?.[i] !== false;
    });
    Object.assign(SHOP_STOCK, state.shopStock);
    game.builtThisTurn = state.builtThisTurn;
    game.log = [...state.log];
    game.hadAmusementParkAtRoll = state.hadAmusementParkAtRoll || false;
    undoState = null;
    prevCoins = null;
    cancelAutoSkip();
}

function doUndo() {
    if (!undoState) return;
    const state = undoState;
    if (isOnlineGame) sendAction('undoBuild', { state });
    restoreUndoSnapshot(state);
    render();
}

function saveSettings() {
    try {
        localStorage.setItem('selectedCount', selectedCount);
        localStorage.setItem('playerSettings', JSON.stringify(playerSettings));
        localStorage.setItem('tutorialEnabled', tutorialEnabled ? 'true' : 'false');
        localStorage.setItem('tutorialLevel', tutorialLevel);
        const speedEl = document.getElementById('cpuSpeed');
        if (speedEl) localStorage.setItem('cpuSpeed', speedEl.value);
    } catch(e) {}
}

function loadSettings() {
    try {
        const normalizeName = typeof normalizeLocalPlayerName === 'function'
            ? normalizeLocalPlayerName
            : ((name, index) => String(name || '').trim() || `プレイヤー${index + 1}`);
        const count = parseInt(localStorage.getItem('selectedCount') || '2');
        selectedCount = Math.min(10, Math.max(2, count));
        document.getElementById("playerCount").textContent = selectedCount;
        const ps = localStorage.getItem('playerSettings');
        if (ps) {
            playerSettings = JSON.parse(ps).slice(0, selectedCount).map((setting, index) => ({
                type: setting.type === 'cpu' ? 'cpu' : 'human',
                difficulty: setting.difficulty || 'normal',
                name: normalizeName(setting.name, index),
            }));
        }
        const speed = localStorage.getItem('cpuSpeed');
        if (speed) {
            const speedEl = document.getElementById('cpuSpeed');
            if (speedEl) {
                speedEl.value = speed;
                document.getElementById('speedLabel').textContent = typeof formatCpuSpeedLabel === 'function'
                    ? formatCpuSpeedLabel(speed)
                    : ((parseInt(speed, 10) / 1000) + '秒');
            }
        }
        tutorialEnabled = localStorage.getItem('tutorialEnabled') !== 'false';
        tutorialLevel = localStorage.getItem('tutorialLevel') === 'advanced' ? 'advanced' : 'beginner';
    } catch(e) {}
    syncTutorialControls();
    renderPlayerSettings();
}
