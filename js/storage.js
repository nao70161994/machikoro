const ONLINE_RESTORE_BUNDLE_KEYS = Object.freeze([
    'onlineGameStart',
    'onlineActionLog',
    'onlineStateSnapshot',
    'onlineRestoreAudit',
    'onlinePendingAction',
    'onlineRestoreRoomIndex',
]);

function removeOnlineRestoreBundleStorageKeyVariants(key) {
    localStorage.removeItem(key);
    try {
        if (typeof localStorage.length !== 'number' || typeof localStorage.key !== 'function') return;
        const scopedPrefix = `${key}:room:`;
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const storageKey = localStorage.key(i);
            if (typeof storageKey === 'string' && storageKey.startsWith(scopedPrefix)) {
                keysToRemove.push(storageKey);
            }
        }
        keysToRemove.forEach(storageKey => localStorage.removeItem(storageKey));
    } catch (e) {}
}

function clearOnlineRestoreBundleStorage() {
    if (typeof _clearOnlineRestoreBundle === 'function') {
        _clearOnlineRestoreBundle();
    }
    for (const key of ONLINE_RESTORE_BUNDLE_KEYS) {
        removeOnlineRestoreBundleStorageKeyVariants(key);
    }
}

function clearOnlineSessionStorage() {
    removeOnlineRestoreBundleStorageKeyVariants('onlineSession');
    clearOnlineRestoreBundleStorage();
}

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
            pendingActions: (typeof GameManager !== 'undefined' && typeof GameManager.serializedPendingActionsFor === 'function')
                ? GameManager.serializedPendingActionsFor(game)
                : [],
            pendingIT: game.pendingIT,
            usedReroll: game.usedReroll,
            pendingTunaDice: game.pendingTunaDice,
            turnCount: game.turnCount,
            hadAmusementParkAtRoll: game.hadAmusementParkAtRoll,
            shopStock: Object.assign({}, SHOP_STOCK),
            cpuSettings: cpuPlayers.map(c => c ? { difficulty: c.difficulty, rlModelId: c.modelId || null } : null),
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
    const onlineDescription = document.getElementById('onlineResumeDescription');
    const onlineSession = readOnlineSession();
    if (onlineSection) onlineSection.style.display = onlineSession ? 'block' : 'none';
    if (onlineDescription) {
        onlineDescription.textContent = onlineSession
            ? `🌐 ${onlineSession.playerName} として ${onlineSession.roomId} に再接続できます`
            : '🌐 オンラインゲームが中断されました';
    }
}

function readOnlineSession() {
    try {
        const raw = localStorage.getItem('onlineSession');
        if (!raw) return null;
        const session = JSON.parse(raw);
        const roomId = typeof session.roomId === 'string' ? session.roomId.trim() : '';
        const playerName = typeof session.playerName === 'string' ? session.playerName.trim() : '';
        const reconnectToken = typeof session.reconnectToken === 'string' ? session.reconnectToken.trim() : '';
        if (
            !session ||
            roomId === '' ||
            !Number.isInteger(session.playerIndex) ||
            session.playerIndex < 0 ||
            playerName === '' ||
            reconnectToken === ''
        ) {
            return null;
        }
        return Object.assign({}, session, { roomId, playerName, reconnectToken });
    } catch(e) {
        return null;
    }
}

function deleteSavedGame() {
    showConfirm("セーブデータを削除しますか？", () => {
        localStorage.removeItem('savedGame');
        updateResumeButton();
    });
}

function deleteOnlineSession() {
    showConfirm("オンライン再接続データを削除しますか？", () => {
        clearOnlineSessionStorage();
        updateResumeButton();
    });
}

function reconnectOnline() {
    const session = readOnlineSession();
    if (!session) {
        if (localStorage.getItem('onlineSession')) {
            clearOnlineSessionStorage();
            updateResumeButton();
            showNotice('再接続データの読み込みに失敗しました');
        }
        return;
    }
    try {
        isReconnectingOnline = true;
        if (typeof _clearRejoinRetry === 'function') _clearRejoinRetry();
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
        clearOnlineSessionStorage();
        updateResumeButton();
        showNotice('再接続データの読み込みに失敗しました');
    }
}

function resumeGame() {
    const raw = localStorage.getItem('savedGame');
    if (!raw) return;
    try {
        const state = JSON.parse(raw);
        if (!isValidSavedGameState(state)) {
            throw new Error('Invalid saved game');
        }
        const savedCpuSettings = normalizeSavedCpuSettings(state);
        const hasRlCpu = savedCpuSettings.some(setting => setting && setting.difficulty === 'rl');
        if (hasRlCpu && typeof RLModelPortfolio !== 'undefined' && typeof RLModelPortfolio.preloadEligibleModels === 'function') {
            const loadState = typeof RLModelPortfolio.eligibleLoadState === 'function'
                ? RLModelPortfolio.eligibleLoadState(state.players.length)
                : null;
            if (!loadState || loadState.status !== 'ready') {
                const preload = RLModelPortfolio.preloadEligibleModels(state.players.length, { attempts: 3 });
                if (preload && typeof preload.then === 'function') {
                    showNotice("深層学習AIモデルを読み込んでいます。");
                    preload.then(() => resumeGame()).catch(error => {
                        console.error(error);
                        showNotice("深層学習AIモデルを読み込めませんでした。通信状態を確認してもう一度再開してください。");
                    });
                    return;
                }
            }
        }
        cpuScheduleToken++;
        if (typeof cancelDelayedHumanAction === 'function') cancelDelayedHumanAction();
        if (typeof resetOnlineState === 'function') resetOnlineState();
        if (typeof resetUiLocksForGameReset === 'function') resetUiLocksForGameReset('resume-game-reset-ui-locks');
        cpuSpeed = state.cpuSpeed || 1500;
        if (state.enabledCardsList) enabledCards = new Set(state.enabledCardsList);
        if (state.enabledLandmarksList && state.enabledLandmarksList.length > 0) {
            enabledLandmarks = new Set(state.enabledLandmarksList);
        } else {
            enabledLandmarks = new Set(Player.landmarkNames());
        }
        game = new GameManager(state.players.length);
        game.enabledLandmarks = new Set(enabledLandmarks);
        assignSavedShopStockSnapshot(SHOP_STOCK, state.shopStock || {});
        state.players.forEach((ps, i) => {
            const p = game.players[i];
            p.name = ps.name;
            p.coins = ps.coins;
            p.cards = (Array.isArray(ps.cards) ? ps.cards : []).map(name => createCardByName(name)).filter(Boolean);
            p.dormantCards = (Array.isArray(ps.dormantIndices) ? ps.dormantIndices : []).map(idx => p.cards[idx]).filter(Boolean);
            p.landmarks = Object.assign({}, makeDefaultLandmarks(), p.landmarks, ps.landmarks);
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
        const cpuSettings = savedCpuSettings;
        const opponentDifficulties = cpuSettings.map(s => s ? s.difficulty || "normal" : "human");
        cpuPlayers = cpuSettings.map(s => {
            if (!s) return null;
            const options = {
                expertPurpose: "live",
                playerCount: state.players.length,
                expertOpponentDifficulties: opponentDifficulties,
                rlModelId: s.rlModelId || s.modelId || null,
            };
            return typeof createCpuPlayer === "function"
                ? createCpuPlayer(s.difficulty, options)
                : new CPU(s.difficulty, options);
        });
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
        showNotice("セーブデータの読み込みに失敗しました");
    }
}

function normalizeSavedCpuSettings(state) {
    const defaults = state.players.map((_, index) => index === 0 ? null : { difficulty: "normal" });
    if (!Array.isArray(state.cpuSettings)) return defaults;
    return state.players.map((_, index) => {
        const setting = state.cpuSettings[index];
        if (setting === undefined) return defaults[index];
        if (!setting) return null;
        if (typeof setting === "string") return { difficulty: setting };
        return {
            difficulty: setting.difficulty || "normal",
            rlModelId: setting.rlModelId || setting.modelId || null,
        };
    });
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasDuplicateValues(values) {
    return new Set(values).size !== values.length;
}

function isKnownCardName(name) {
    return !!createCardByName(name);
}

function savedShopStockNameFromKey(key) {
    if (isKnownCardName(key)) return key;
    if (typeof CARD_NAME_BY_ID !== "undefined" && CARD_NAME_BY_ID[key] && isKnownCardName(CARD_NAME_BY_ID[key])) {
        return CARD_NAME_BY_ID[key];
    }
    return null;
}

function assignSavedShopStockSnapshot(target, source) {
    if (typeof assignShopStockSnapshot === "function") return assignShopStockSnapshot(target, source);
    if (!target || !source || typeof source !== "object") return target;
    for (const [key, count] of Object.entries(source)) {
        const name = savedShopStockNameFromKey(key);
        if (name && Number.isInteger(count) && count >= 0) target[name] = count;
    }
    return target;
}

function isKnownLandmarkName(name) {
    return Player.landmarkNames().includes(name);
}

function makeDefaultLandmarks() {
    return Object.fromEntries(Player.landmarkNames().map(name => [name, false]));
}

const SAVED_PENDING_ACTION_BY_FIELD = Object.freeze({
    pendingTV: 'resolveTV',
    pendingBusiness: 'resolveBusiness',
    pendingCleaning: 'resolveCleaning',
    pendingMover: 'resolveMover',
    pendingRenovation: 'resolveRenovation',
});

function isValidSavedPendingActions(state) {
    if (!Object.prototype.hasOwnProperty.call(state, 'pendingActions')) return true;
    if (!Array.isArray(state.pendingActions)) return false;
    const counts = Object.fromEntries(Object.keys(SAVED_PENDING_ACTION_BY_FIELD).map(field => [field, 0]));
    for (const pending of state.pendingActions) {
        if (!isPlainObject(pending)) return false;
        const expectedAction = SAVED_PENDING_ACTION_BY_FIELD[pending.field];
        if (!expectedAction || pending.action !== expectedAction) return false;
        counts[pending.field]++;
    }
    return Object.keys(SAVED_PENDING_ACTION_BY_FIELD).every(field =>
        counts[field] === (Number.isInteger(state[field]) ? state[field] : 0)
    );
}

function isValidSavedGameState(state) {
    if (!isPlainObject(state)) return false;
    if (!Array.isArray(state.players) || state.players.length < 2 || state.players.length > 10) return false;
    if (!Number.isInteger(state.currentPlayerIndex) ||
        state.currentPlayerIndex < 0 ||
        state.currentPlayerIndex >= state.players.length) return false;
    const phases = new Set(['roll', 'selectDice', 'rerollConfirm', 'harborChoice', 'pending', 'build']);
    if (typeof state.phase !== 'string' || !phases.has(state.phase)) return false;
    if (state.log != null && !Array.isArray(state.log)) return false;
    for (const field of ['lastDiceResult', 'lastDice1', 'lastDice2', 'turnCount']) {
        if (Object.prototype.hasOwnProperty.call(state, field) &&
            (!Number.isInteger(state[field]) || state[field] < 0)) return false;
    }
    for (const field of ['pendingTV', 'pendingBusiness', 'pendingCleaning', 'pendingMover', 'pendingRenovation']) {
        if (Object.prototype.hasOwnProperty.call(state, field) &&
            (!Number.isInteger(state[field]) || state[field] < 0)) return false;
    }
    if (!isValidSavedPendingActions(state)) return false;
    for (const field of ['builtThisTurn', 'pendingIT', 'usedReroll', 'hadAmusementParkAtRoll']) {
        if (Object.prototype.hasOwnProperty.call(state, field) &&
            typeof state[field] !== 'boolean') return false;
    }
    if (Object.prototype.hasOwnProperty.call(state, 'pendingTunaDice') &&
        state.pendingTunaDice !== null &&
        (!Array.isArray(state.pendingTunaDice) ||
        state.pendingTunaDice.length !== 2 ||
        state.pendingTunaDice.some(value => !Number.isInteger(value) || value < 1 || value > 6))) return false;
    if (state.enabledLandmarksList != null &&
        (!Array.isArray(state.enabledLandmarksList) ||
        state.enabledLandmarksList.length === 0 ||
        state.enabledLandmarksList.some(name => !isKnownLandmarkName(name)))) return false;
    if (state.enabledCardsList != null &&
        (!Array.isArray(state.enabledCardsList) ||
        state.enabledCardsList.some(name => !isKnownCardName(name)))) return false;
    for (const playerState of state.players) {
        if (!isValidSavedPlayerState(playerState)) return false;
    }
    if (state.shopStock != null && !isValidSavedShopStock(state.shopStock, state.enabledCardsList)) return false;
    return true;
}

function isValidSavedPlayerState(playerState) {
    if (!isPlainObject(playerState)) return false;
    if (typeof playerState.name !== 'string') return false;
    if (!Number.isInteger(playerState.coins) || playerState.coins < 0) return false;
    if (!Array.isArray(playerState.cards) || playerState.cards.some(name => !isKnownCardName(name))) return false;
    const dormantIndices = Array.isArray(playerState.dormantIndices) ? playerState.dormantIndices : [];
    if (hasDuplicateValues(dormantIndices) ||
        dormantIndices.some(idx => !Number.isInteger(idx) || idx < 0 || idx >= playerState.cards.length)) return false;
    if (isPlainObject(playerState.landmarks)) {
        for (const [name, built] of Object.entries(playerState.landmarks)) {
            if (!isKnownLandmarkName(name) || typeof built !== 'boolean') return false;
        }
    } else if (playerState.landmarks != null) {
        return false;
    }
    if (Object.prototype.hasOwnProperty.call(playerState, 'itVentureCoins') &&
        (!Number.isInteger(playerState.itVentureCoins) || playerState.itVentureCoins < 0)) return false;
    if (Object.prototype.hasOwnProperty.call(playerState, 'hasYakusho') &&
        typeof playerState.hasYakusho !== 'boolean') return false;
    return true;
}

function isValidSavedShopStock(shopStock, enabledCardsList) {
    if (!isPlainObject(shopStock)) return false;
    const enabled = Array.isArray(enabledCardsList) ? new Set(enabledCardsList) : null;
    for (const [key, count] of Object.entries(shopStock)) {
        const name = savedShopStockNameFromKey(key);
        if (!name || !Number.isInteger(count) || count < 0) return false;
        if (enabled && !enabled.has(name) && count !== 0) return false;
    }
    return true;
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
        p.landmarks = Object.assign({}, makeDefaultLandmarks(), p.landmarks, state.playerLandmarks[i]);
        p.itVentureCoins = state.playerItVenture?.[i] ?? 0;
        p.hasYakusho = state.playerHasYakusho?.[i] !== false;
    });
    assignSavedShopStockSnapshot(SHOP_STOCK, state.shopStock);
    game.builtThisTurn = state.builtThisTurn === true;
    game.log = Array.isArray(state.log) ? [...state.log] : [];
    game.hadAmusementParkAtRoll = state.hadAmusementParkAtRoll || false;
    undoState = null;
    prevCoins = null;
    cancelAutoSkip();
}

function doUndo() {
    if (!undoState) return;
    if (isOnlineGame && (!game || game.currentPlayerIndex !== myPlayerIndex)) return;
    const state = undoState;
    if (isOnlineGame) {
        sendAction('undoBuild', { state });
        return;
    }
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
