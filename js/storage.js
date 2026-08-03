const storageClientStorageFacade = ClientStorage.createFacade();
const LOCAL_SAVE_SCHEMA_WRITE_ENABLED = typeof window !== 'undefined' &&
    window.MACHIKORO_LOCAL_SAVE_SCHEMA_WRITE_ENABLED === true;
let localSaveRepository = null;

function getLocalSaveRepository() {
    if (localSaveRepository) return localSaveRepository;
    localSaveRepository = LocalSaveRepository.create({
        storage: storageClientStorageFacade,
        versionedEnabled: LOCAL_SAVE_SCHEMA_WRITE_ENABLED,
    });
    return localSaveRepository;
}

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
        const view = LocalResumeView.pendingButton(localResumePending);
        button.disabled = view.disabled;
        button.textContent = view.textContent;
    }
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
        getLocalSaveRepository().save(state);
    } catch(e) {}
}

function updateResumeButton() {
    const localSection = document.getElementById('resumeSection');
    const onlineSection = document.getElementById('onlineResumeSection');
    const onlineDescription = document.getElementById('onlineResumeDescription');
    const view = LocalResumeView.resumeSections(
        getLocalSaveRepository().exists(),
        readOnlineSession()
    );
    if (localSection) localSection.style.display = view.localDisplay;
    if (onlineSection) onlineSection.style.display = view.onlineDisplay;
    if (onlineDescription) onlineDescription.textContent = view.onlineDescription;
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
        getLocalSaveRepository().remove();
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
        const reconnectPlan = StoredOnlineReconnect.plan(session);
        const result = StoredOnlineReconnect.execute(reconnectPlan, {
            setReconnecting: setStorageOnlineReconnectLegacyFlag,
            clearRetry() {
                if (typeof _clearRejoinRetry === 'function') _clearRejoinRetry();
            },
            setRuntime(value) {
                isRoomHost = value.isRoomHost;
                myPlayerName = value.playerName;
                myRoomId = value.roomId;
                myOriginalPlayerIndex = value.originalPlayerIndex;
                myPlayerIndex = value.playerIndex;
                reconnectToken = value.reconnectToken;
            },
            initializeSocket: initSocket,
            setStatus(message) {
                const status = document.getElementById('onlineStatus');
                if (status) status.textContent = message;
            },
            switchToOnlineTab() {
                switchTab('online');
            },
            emitRejoin(session) {
                return typeof _emitOnlineRejoinRequest === 'function' &&
                    _emitOnlineRejoinRequest(session);
            },
        });
        if (result.kind === 'rejoin-send-failed') {
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
    if (!LocalResumePolicy.shouldInspectRepository({
        resumePending: localResumePending,
        fromPreload: options.fromPreload,
    })) return;
    const repository = getLocalSaveRepository();
    const initialDecision = LocalResumePolicy.initialDecision({
        resumePending: localResumePending,
        fromPreload: options.fromPreload,
        repositoryExists: repository.exists(),
    });
    if (initialDecision !== 'read-save') return;
    try {
        const decoded = repository.read(isValidSavedGameState);
        const decodedState = decoded && decoded.state;
        const savedCpuSettings = decodedState ? normalizeSavedCpuSettings(decodedState) : [];
        const canPreloadRl = typeof RLModelPortfolio !== 'undefined' &&
            typeof RLModelPortfolio.preloadEligibleModels === 'function';
        const inspectRlLoadState = LocalResumePolicy.shouldInspectRlLoadState(
            savedCpuSettings,
            options.skipRlPreload,
            canPreloadRl
        );
        const loadState = inspectRlLoadState && typeof RLModelPortfolio.eligibleLoadState === 'function'
            ? RLModelPortfolio.eligibleLoadState(decodedState.players.length)
            : null;
        const decision = LocalResumePolicy.decide({
            decoded,
            cpuSettings: savedCpuSettings,
            skipRlPreload: options.skipRlPreload,
            canPreloadRl,
            rlLoadState: loadState,
        });
        if (decision.kind === LocalResumePolicy.DECISIONS.INVALID) {
            throw new Error('Invalid saved game');
        }
        const state = decision.state;
        if (decision.kind === LocalResumePolicy.DECISIONS.PRELOAD_RL) {
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
        const runtimePlan = LocalResumePolicy.runtimePlan(
            state,
            savedCpuSettings,
            Player.landmarkNames()
        );
        const runtimeResult = LocalResumePolicy.executeRuntime(runtimePlan, {
            invalidateCpuSchedule() {
                cpuScheduleToken++;
            },
            cancelDelayedHumanAction() {
                if (typeof globalThis.cancelDelayedHumanAction === 'function') {
                    globalThis.cancelDelayedHumanAction();
                }
            },
            resetOnline() {
                if (typeof resetOnlineState === 'function') resetOnlineState();
            },
            resetUiLocks() {
                if (typeof resetUiLocksForGameReset === 'function') {
                    resetUiLocksForGameReset('resume-game-reset-ui-locks');
                }
            },
            applySettings(plan) {
                cpuSpeed = plan.cpuSpeed;
                if (plan.enabledCards) enabledCards = new Set(plan.enabledCards);
                enabledLandmarks = new Set(plan.enabledLandmarks);
            },
            createAndHydrateGame(plan) {
                game = new GameManager(plan.playerCount);
                game.enabledLandmarks = new Set(enabledLandmarks);
                return GameSnapshot.hydrateMutableGameState({
                    game,
                    shopStock: SHOP_STOCK,
                    state: plan.state,
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
            },
            createCpuPlayers(plan) {
                cpuPlayers = plan.map(entry => {
                    if (!entry) return null;
                    return typeof createCpuPlayer === "function"
                        ? createCpuPlayer(entry.difficulty, entry.options)
                        : new CPU(entry.difficulty, entry.options);
                });
            },
            resetPresentationState() {
                prevCoins = null;
                winSoundPlayed = false;
            },
            cancelAutoSkip,
            clearUndo() {
                undoState = null;
            },
            showGame() {
                document.getElementById("titleScreen").style.display = "none";
                document.getElementById("gameScreen").style.display = "block";
            },
            render,
            scheduleCpu: scheduleCPU,
        });
        if (runtimeResult.ok !== true) throw new Error('Saved game hydration failed');
    } catch(e) {
        setLocalResumePending(false);
        repository.remove();
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
    const shadow = typeof _prepareLocalGameEngineShadow === 'function'
        ? _prepareLocalGameEngineShadow('undoBuild', { state })
        : null;
    restoreUndoSnapshot(state);
    if (typeof _finishLocalGameEngineShadow === 'function') {
        _finishLocalGameEngineShadow(shadow);
    }
    render();
}

function saveSettings() {
    storageClientStorageFacade.access(storage => {
        const speedEl = document.getElementById('cpuSpeed');
        const values = StorageSettings.serializeSettings({
            selectedCount,
            playerSettings,
            tutorialEnabled,
            tutorialLevel,
            cpuSpeed: speedEl ? speedEl.value : null,
        });
        storage.setItem('selectedCount', values.selectedCount);
        storage.setItem('playerSettings', values.playerSettings);
        storage.setItem('tutorialEnabled', values.tutorialEnabled);
        storage.setItem('tutorialLevel', values.tutorialLevel);
        if (Object.prototype.hasOwnProperty.call(values, 'cpuSpeed')) {
            storage.setItem('cpuSpeed', values.cpuSpeed);
        }
    });
}

function loadSettings() {
    storageClientStorageFacade.access(storage => {
        const normalizeName = typeof normalizeLocalPlayerName === 'function'
            ? normalizeLocalPlayerName
            : ((name, index) => String(name || '').trim() || `プレイヤー${index + 1}`);
        const values = StorageSettings.normalizeStoredSettings({
            selectedCount: storage.getItem('selectedCount'),
            playerSettings: storage.getItem('playerSettings'),
            cpuSpeed: storage.getItem('cpuSpeed'),
            tutorialEnabled: storage.getItem('tutorialEnabled'),
            tutorialLevel: storage.getItem('tutorialLevel'),
        }, normalizeName);
        selectedCount = values.selectedCount;
        document.getElementById("playerCount").textContent = selectedCount;
        if (values.playerSettings) playerSettings = values.playerSettings;
        if (values.cpuSpeed) {
            const speedEl = document.getElementById('cpuSpeed');
            if (speedEl) {
                speedEl.value = values.cpuSpeed;
                document.getElementById('speedLabel').textContent = typeof formatCpuSpeedLabel === 'function'
                    ? formatCpuSpeedLabel(values.cpuSpeed)
                    : ((parseInt(values.cpuSpeed, 10) / 1000) + '秒');
            }
        }
        tutorialEnabled = values.tutorialEnabled;
        tutorialLevel = values.tutorialLevel;
    });
    syncTutorialControls();
    renderPlayerSettings();
}
