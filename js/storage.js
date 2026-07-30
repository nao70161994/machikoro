const storageClientStorageFacade = ClientStorage.createFacade();

function getSafeClientStorage() {
    return storageClientStorageFacade.storage();
}

function safeStorageGet(key, fallback = null) {
    return storageClientStorageFacade.get(key, fallback);
}

function safeStorageSet(key, value) {
    return storageClientStorageFacade.set(key, value);
}

function safeStorageRemove(key) {
    storageClientStorageFacade.remove(key);
}

function setStorageOnlineReconnectLegacyFlag(value) {
    if (typeof setOnlineReconnectLegacyFlag === 'function') {
        return setOnlineReconnectLegacyFlag(value);
    }
    isReconnectingOnline = value === true;
    return isReconnectingOnline;
}

let localResumePending = false;
let localResumeGeneration = 0;

function setLocalResumePending(pending) {
    localResumePending = pending === true;
    const button = typeof document !== 'undefined' && document.getElementById
        ? document.getElementById('btnResume')
        : null;
    if (button) {
        button.disabled = localResumePending;
        button.textContent = localResumePending ? 'モデル読み込み中' : '続きから再開';
    }
}

function getStorageClientVersion() {
    if (typeof getClientVersion === 'function') return getClientVersion();
    return (typeof window !== 'undefined' && window.MACHIKORO_CLIENT_VERSION) || 'unknown';
}

function buildStorageOnlineRejoinPayload(session) {
    return {
        roomId: session && session.roomId,
        playerIndex: session && session.playerIndex,
        playerName: session && session.playerName,
        reconnectToken: session && session.reconnectToken,
        clientVersion: getStorageClientVersion(),
    };
}

const STORAGE_ONLINE_SESSION_KEY = typeof ONLINE_SESSION_STORAGE_KEY !== 'undefined'
    ? ONLINE_SESSION_STORAGE_KEY
    : 'onlineSession';
const STORAGE_ONLINE_ROOM_KEY_SEPARATOR = typeof ONLINE_ROOM_STORAGE_KEY_SEPARATOR !== 'undefined'
    ? ONLINE_ROOM_STORAGE_KEY_SEPARATOR
    : ':room:';
const STORAGE_ONLINE_STORAGE_KEYS = typeof ONLINE_STORAGE_KEYS !== 'undefined'
    ? ONLINE_STORAGE_KEYS
    : Object.freeze({
        gameStart: 'onlineGameStart',
        actionLog: 'onlineActionLog',
        stateSnapshot: 'onlineStateSnapshot',
        restoreAudit: 'onlineRestoreAudit',
        pendingAction: 'onlinePendingAction',
    });
const STORAGE_ONLINE_RESTORE_ROOM_INDEX_KEY = typeof ONLINE_RESTORE_ROOM_INDEX_KEY !== 'undefined'
    ? ONLINE_RESTORE_ROOM_INDEX_KEY
    : 'onlineRestoreRoomIndex';
const ONLINE_RESTORE_BUNDLE_KEYS = Object.freeze([
    STORAGE_ONLINE_STORAGE_KEYS.gameStart,
    STORAGE_ONLINE_STORAGE_KEYS.actionLog,
    STORAGE_ONLINE_STORAGE_KEYS.stateSnapshot,
    STORAGE_ONLINE_STORAGE_KEYS.restoreAudit,
    STORAGE_ONLINE_STORAGE_KEYS.pendingAction,
    STORAGE_ONLINE_RESTORE_ROOM_INDEX_KEY,
]);
let storageOnlineStorageFacade = null;

function getStorageOnlineStorageFacade() {
    if (storageOnlineStorageFacade) return storageOnlineStorageFacade;
    if (typeof createOnlineStorageFacade !== 'function') return null;
    const storage = getSafeClientStorage();
    if (!storage) return null;
    storageOnlineStorageFacade = createOnlineStorageFacade({
        storage,
        sessionKey: STORAGE_ONLINE_SESSION_KEY,
        storageKeys: STORAGE_ONLINE_STORAGE_KEYS,
        roomIndexKey: STORAGE_ONLINE_RESTORE_ROOM_INDEX_KEY,
        roomKeySeparator: STORAGE_ONLINE_ROOM_KEY_SEPARATOR,
        getCurrentRoomId: () => (typeof myRoomId === 'string' ? myRoomId : ''),
    });
    return storageOnlineStorageFacade;
}

function normalizeOnlineSessionPayload(session) {
    return OnlinePayload.normalizeSession(session);
}

function removeOnlineRestoreBundleStorageKeyVariants(key) {
    const storageFacade = getStorageOnlineStorageFacade();
    if (storageFacade && typeof storageFacade.removeStorageItem === 'function') {
        storageFacade.removeStorageItem(key);
    } else {
        safeStorageRemove(key);
    }
    const scopedPrefix = key + STORAGE_ONLINE_ROOM_KEY_SEPARATOR;
    storageClientStorageFacade.keysWithPrefix(scopedPrefix).forEach(safeStorageRemove);
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
    removeOnlineRestoreBundleStorageKeyVariants(STORAGE_ONLINE_SESSION_KEY);
    clearOnlineRestoreBundleStorage();
}

function saveGameState() {
    if (!game || isOnlineGame) return;
    if (game.checkWinner()) return;
    try {
        const state = GameSnapshot.serializeLocalSaveState(game, SHOP_STOCK, {
            logLimit: 30,
            pendingActionsFor: value =>
                (typeof GameManager !== 'undefined' &&
                    typeof GameManager.serializedPendingActionsFor === 'function')
                    ? GameManager.serializedPendingActionsFor(value)
                    : [],
            cpuSettings: cpuPlayers.map(cpu => cpu
                ? { difficulty: cpu.difficulty, rlModelId: cpu.modelId || null }
                : null),
            cpuSpeed,
            enabledCardsList: [...enabledCards],
            enabledLandmarksList: [...enabledLandmarks],
        });
        safeStorageSet('savedGame', JSON.stringify(state));
    } catch(e) {}
}

function updateResumeButton() {
    const localSection = document.getElementById('resumeSection');
    if (localSection) localSection.style.display = safeStorageGet('savedGame') ? 'flex' : 'none';
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
        const storageFacade = getStorageOnlineStorageFacade();
        const session = storageFacade && typeof storageFacade.readStorageJson === 'function'
            ? storageFacade.readStorageJson(STORAGE_ONLINE_SESSION_KEY, null)
            : JSON.parse(safeStorageGet(STORAGE_ONLINE_SESSION_KEY) || 'null');
        return normalizeOnlineSessionPayload(session);
    } catch(e) {
        return null;
    }
}

function deleteSavedGame() {
    showConfirm("セーブデータを削除しますか？", () => {
        safeStorageRemove('savedGame');
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
        if (safeStorageGet(STORAGE_ONLINE_SESSION_KEY)) {
            clearOnlineSessionStorage();
            updateResumeButton();
            showNotice('再接続データの読み込みに失敗しました');
        }
        return;
    }
    try {
        setStorageOnlineReconnectLegacyFlag(true);
        if (typeof _clearRejoinRetry === 'function') _clearRejoinRetry();
        isRoomHost = session.isRoomHost || false;
        myPlayerName = session.playerName || '';
        myRoomId = session.roomId;
        myOriginalPlayerIndex = Number.isInteger(session.playerIndex) ? session.playerIndex : -1;
        myPlayerIndex = myOriginalPlayerIndex;
        reconnectToken = session.reconnectToken || '';
        if (!initSocket()) {
            setStorageOnlineReconnectLegacyFlag(false);
            isRoomHost = false;
            myPlayerName = '';
            myRoomId = null;
            myOriginalPlayerIndex = -1;
            myPlayerIndex = -1;
            reconnectToken = '';
            return;
        }
        document.getElementById('onlineStatus') && (document.getElementById('onlineStatus').textContent = '再接続中...');
        switchTab('online');
        if (typeof _emitOnlineRejoinRequest !== 'function' || !_emitOnlineRejoinRequest(session)) {
            showNotice('再接続要求を送信できませんでした');
        }
    } catch(e) {
        setStorageOnlineReconnectLegacyFlag(false);
        clearOnlineSessionStorage();
        updateResumeButton();
        showNotice('再接続データの読み込みに失敗しました');
    }
}

function resumeGame(options = {}) {
    if (localResumePending && !options.fromPreload) return;
    const raw = safeStorageGet('savedGame');
    if (!raw) return;
    try {
        const state = JSON.parse(raw);
        if (!isValidSavedGameState(state)) {
            throw new Error('Invalid saved game');
        }
        const savedCpuSettings = normalizeSavedCpuSettings(state);
        const hasRlCpu = savedCpuSettings.some(setting => setting && setting.difficulty === 'rl');
        if (!options.skipRlPreload && hasRlCpu && typeof RLModelPortfolio !== 'undefined' && typeof RLModelPortfolio.preloadEligibleModels === 'function') {
            const loadState = typeof RLModelPortfolio.eligibleLoadState === 'function'
                ? RLModelPortfolio.eligibleLoadState(state.players.length)
                : null;
            if (!loadState || loadState.status !== 'ready') {
                const preload = RLModelPortfolio.preloadEligibleModels(state.players.length, { attempts: 3 });
                if (preload && typeof preload.then === 'function') {
                    const resumeGeneration = ++localResumeGeneration;
                    setLocalResumePending(true);
                    showNotice("深層学習AIモデルを読み込んでいます。");
                    preload.then(() => {
                        if (resumeGeneration !== localResumeGeneration) return;
                        setLocalResumePending(false);
                        resumeGame({ fromPreload: true, skipRlPreload: true });
                    }).catch(error => {
                        if (resumeGeneration !== localResumeGeneration) return;
                        setLocalResumePending(false);
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
        const hydrated = GameSnapshot.hydrateMutableGameState({
            game,
            shopStock: SHOP_STOCK,
            state,
            createCardByName,
            assignShopStockSnapshot: assignSavedShopStockSnapshot,
            normalizePlayerCoins: value => value,
            readDormantIndices: value => Array.isArray(value) ? value : [],
            readLandmarks: value => Object.assign(
                {},
                makeDefaultLandmarks(),
                isPlainObject(value) ? value : {}
            ),
            readLog: value => Array.isArray(value) ? value : [],
            normalizeCurrentPlayerIndex: value => value,
        });
        if (!hydrated) throw new Error('Saved game hydration failed');
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
        setLocalResumePending(false);
        safeStorageRemove('savedGame');
        updateResumeButton();
        showNotice("セーブデータの読み込みに失敗しました");
    }
}

let savedGameValidator = null;

function getSavedGameValidator() {
    if (savedGameValidator) return savedGameValidator;
    savedGameValidator = SavedGameValidation.createValidator({
        isKnownCardName,
        isKnownLandmarkName,
        cardNameById: typeof CARD_NAME_BY_ID !== 'undefined' ? CARD_NAME_BY_ID : {},
    });
    return savedGameValidator;
}

function normalizeSavedCpuSettings(state) {
    return SavedGameValidation.normalizeCpuSettings(state);
}

function isKnownCardName(name) {
    return !!createCardByName(name);
}

function savedShopStockNameFromKey(key) {
    return getSavedGameValidator().savedShopStockNameFromKey(key);
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

function isValidSavedGameState(state) {
    return getSavedGameValidator().isValidSavedGameState(state);
}

function saveUndoState() {
    undoState = GameSnapshot.serializeUndoState(game, SHOP_STOCK, Number.MAX_SAFE_INTEGER);
}

function restoreUndoSnapshot(state) {
    const hydrated = GameSnapshot.hydrateUndoState({
        game,
        shopStock: SHOP_STOCK,
        state,
        createCardByName,
        assignShopStockSnapshot: assignSavedShopStockSnapshot,
        mergePlayerLandmarks: (current, saved) => Object.assign(
            {},
            makeDefaultLandmarks(),
            current,
            saved
        ),
    });
    if (!hydrated) return false;
    undoState = null;
    prevCoins = null;
    cancelAutoSkip();
    return true;
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
    storageClientStorageFacade.access(storage => {
        storage.setItem('selectedCount', selectedCount);
        storage.setItem('playerSettings', JSON.stringify(playerSettings));
        storage.setItem('tutorialEnabled', tutorialEnabled ? 'true' : 'false');
        storage.setItem('tutorialLevel', tutorialLevel);
        const speedEl = document.getElementById('cpuSpeed');
        if (speedEl) storage.setItem('cpuSpeed', speedEl.value);
    });
}

function loadSettings() {
    storageClientStorageFacade.access(storage => {
        const normalizeName = typeof normalizeLocalPlayerName === 'function'
            ? normalizeLocalPlayerName
            : ((name, index) => String(name || '').trim() || `プレイヤー${index + 1}`);
        selectedCount = StorageSettings.normalizePlayerCount(storage.getItem('selectedCount'));
        document.getElementById("playerCount").textContent = selectedCount;
        const ps = storage.getItem('playerSettings');
        const normalizedPlayerSettings = StorageSettings.normalizePlayerSettings(ps, selectedCount, normalizeName);
        if (normalizedPlayerSettings) playerSettings = normalizedPlayerSettings;
        const speed = storage.getItem('cpuSpeed');
        if (speed) {
            const speedEl = document.getElementById('cpuSpeed');
            if (speedEl) {
                speedEl.value = speed;
                document.getElementById('speedLabel').textContent = typeof formatCpuSpeedLabel === 'function'
                    ? formatCpuSpeedLabel(speed)
                    : ((parseInt(speed, 10) / 1000) + '秒');
            }
        }
        tutorialEnabled = StorageSettings.normalizeTutorialEnabled(storage.getItem('tutorialEnabled'));
        tutorialLevel = StorageSettings.normalizeTutorialLevel(storage.getItem('tutorialLevel'));
    });
    syncTutorialControls();
    renderPlayerSettings();
}
