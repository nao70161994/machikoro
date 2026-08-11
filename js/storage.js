const storageClientStorageFacade = ClientStorage.createFacade();

function storageGameRuntimeSnapshot() {
    return GameRuntimeState.runtime.snapshot();
}

function storageOnlineRuntimeSnapshot() {
    return OnlineRuntimeState.runtime.snapshot();
}
function storageHasActiveOnlineContext(snapshot = storageOnlineRuntimeSnapshot()) {
    let lobbyRequestPending = false;
    try {
        lobbyRequestPending = typeof _isOnlineFlowActive === 'function' && _isOnlineFlowActive();
    } catch (_) {}
    return OnlineRuntimeState.hasActiveContext(snapshot, { lobbyRequestPending });
}
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
    if (typeof OnlineRuntimeState !== 'undefined' && OnlineRuntimeState.runtime) {
        return OnlineRuntimeState.runtime.setReconnecting(value).isReconnectingOnline;
    }
    isReconnectingOnline = value === true;
    return isReconnectingOnline;
}

const localResumePreloadController = LocalResumePreloadState.create();
const localResumeEffects = LocalResumeEffects.create({
    getElementById: id => typeof document !== 'undefined' && document.getElementById
        ? document.getElementById(id)
        : null,
});

function applyLocalResumePreloadState(state) {
    localResumeEffects.applyPendingButton(LocalResumeView.pendingButton(state.pending));
}

function setLocalResumePending(pending) {
    applyLocalResumePreloadState(localResumePreloadController.setPending(pending));
}

function startLocalResumePreload() {
    const state = localResumePreloadController.start();
    applyLocalResumePreloadState(state);
    return state.generation;
}

function finishLocalResumePreload(generation) {
    const result = localResumePreloadController.finish(generation);
    if (result.accepted) applyLocalResumePreloadState(result.state);
    return result.accepted;
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
        getCurrentRoomId: () => storageOnlineRuntimeSnapshot().myRoomId || '',
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
    const selection = GameSelectionState.runtime.snapshot();
    const gameState = storageGameRuntimeSnapshot();
    const onlineState = storageOnlineRuntimeSnapshot();
    const currentGame = gameState.game;
    const decision = LocalSaveRuntime.admission({
        hasGame: !!currentGame,
        isOnline: onlineState.isOnlineGame,
        hasWinner: () => currentGame.checkWinner(),
    });
    if (decision !== LocalSaveRuntime.DECISIONS.SAVE) return;
    LocalSaveRuntime.execute({
        serialize: () => GameSnapshot.serializeLocalSaveState(currentGame, SHOP_STOCK, {
            logLimit: 30,
            pendingActionsFor: value =>
                (typeof GameManager !== 'undefined' &&
                    typeof GameManager.serializedPendingActionsFor === 'function')
                    ? GameManager.serializedPendingActionsFor(value)
                    : [],
            cpuSettings: gameState.cpuPlayers.map(cpu => cpu
                ? { difficulty: cpu.difficulty, rlModelId: cpu.modelId || null }
                : null),
            cpuSpeed: GameSetupState.runtime.snapshot().cpuSpeed,
            enabledCardsList: [...selection.enabledCards],
            enabledLandmarksList: [...selection.enabledLandmarks],
        }),
        save: state => getLocalSaveRepository().save(state),
    });
}

function updateResumeButton() {
    const view = LocalResumeView.resumeSections(
        getLocalSaveRepository().exists(),
        readOnlineSession()
    );
    localResumeEffects.applyResumeSections(view);
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
                if (typeof OnlineRuntimeState !== 'undefined' && OnlineRuntimeState.runtime) {
                    OnlineRuntimeState.runtime.restoreIdentity(value);
                    return;
                }
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
        const reset = StoredOnlineReconnect.resetRuntime();
        if (typeof OnlineRuntimeState !== 'undefined' && OnlineRuntimeState.runtime) {
            OnlineRuntimeState.runtime.restoreIdentity(reset);
        } else {
            isRoomHost = reset.isRoomHost;
            myPlayerName = reset.playerName;
            myRoomId = reset.roomId;
            myOriginalPlayerIndex = reset.originalPlayerIndex;
            myPlayerIndex = reset.playerIndex;
            reconnectToken = reset.reconnectToken;
        }
        showNotice('再接続処理に失敗しました。もう一度お試しください');
    }
}

function resumeGame(options = {}) {
    const onlineState = storageOnlineRuntimeSnapshot();
    if (storageHasActiveOnlineContext(onlineState)) return false;
    const resumePending = localResumePreloadController.snapshot().pending;
    if (!LocalResumePolicy.shouldInspectRepository({
        resumePending,
        fromPreload: options.fromPreload,
    })) return false;
    const repository = getLocalSaveRepository();
    const initialDecision = LocalResumePolicy.initialDecision({
        resumePending,
        fromPreload: options.fromPreload,
        repositoryExists: repository.exists(),
    });
    if (initialDecision !== 'read-save') return false;
    let validatedSave = false;
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
        validatedSave = true;
        if (decision.kind === LocalResumePolicy.DECISIONS.PRELOAD_RL) {
            const preload = RLModelPortfolio.preloadEligibleModels(state.players.length, { attempts: 3 });
            if (preload && typeof preload.then === 'function') {
                const resumeGeneration = startLocalResumePreload();
                showNotice("深層学習AIモデルを読み込んでいます。");
                preload.then(() => {
                    if (!finishLocalResumePreload(resumeGeneration)) return;
                    resumeGame({ fromPreload: true, skipRlPreload: true });
                }).catch(error => {
                    if (!finishLocalResumePreload(resumeGeneration)) return;
                    console.error(error);
                    showNotice("深層学習AIモデルを読み込めませんでした。通信状態を確認してもう一度再開してください。");
                });
                return true;
            }
        }
        const runtimePlan = LocalResumePolicy.runtimePlan(
            state,
            savedCpuSettings,
            Player.landmarkNames()
        );
        const runtimeResult = LocalResumePolicy.executeRuntime(runtimePlan, {
            captureRuntime() {
                const titleScreen = document.getElementById("titleScreen");
                const gameScreen = document.getElementById("gameScreen");
                return {
                    game: GameRuntimeState.runtime.snapshot(),
                    setup: GameSetupState.runtime.snapshot(),
                    enabledCards: Array.from(getEnabledCardSelection()),
                    enabledLandmarks: Array.from(getEnabledLandmarkSelection()),
                    shopStock: Object.assign({}, SHOP_STOCK),
                    winSoundPlayed,
                    titleDisplay: titleScreen && titleScreen.style ? titleScreen.style.display : '',
                    gameDisplay: gameScreen && gameScreen.style ? gameScreen.style.display : '',
                };
            },
            rollbackRuntime(before) {
                invalidateCpuScheduleChain();
                if (typeof globalThis.cancelDelayedHumanAction === 'function') {
                    globalThis.cancelDelayedHumanAction();
                }
                cancelAutoSkip();
                if (typeof resetUiLocksForGameReset === 'function') {
                    resetUiLocksForGameReset('resume-game-rollback-ui-locks');
                }
                GameSetupState.runtime.replace(before.setup);
                replaceEnabledCardSelection(before.enabledCards);
                replaceEnabledLandmarkSelection(before.enabledLandmarks);
                for (const key of Object.keys(SHOP_STOCK)) delete SHOP_STOCK[key];
                Object.assign(SHOP_STOCK, before.shopStock);
                GameRuntimeState.runtime.setGame(before.game.game);
                GameRuntimeState.runtime.setCpuPlayers(before.game.cpuPlayers);
                GameRuntimeState.runtime.setPreviousCoins(before.game.prevCoins);
                GameRuntimeState.runtime.setUndoState(before.game.undoState);
                winSoundPlayed = before.winSoundPlayed;
                const titleScreen = document.getElementById("titleScreen");
                const gameScreen = document.getElementById("gameScreen");
                if (titleScreen && titleScreen.style) titleScreen.style.display = before.titleDisplay;
                if (gameScreen && gameScreen.style) gameScreen.style.display = before.gameDisplay;
            },
            invalidateCpuSchedule() {
                invalidateCpuScheduleChain();
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
                GameSetupState.runtime.setCpuSpeed(plan.cpuSpeed);
                if (plan.enabledCards) replaceEnabledCardSelection(plan.enabledCards);
                replaceEnabledLandmarkSelection(plan.enabledLandmarks);
            },
            createAndHydrateGame(plan) {
                const currentGame = GameRuntimeState.runtime
                    .setGame(new GameManager(plan.playerCount)).game;
                currentGame.enabledLandmarks = getEnabledLandmarkSelection();
                return GameSnapshot.hydrateMutableGameState({
                    game: currentGame,
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
                GameRuntimeState.runtime.setCpuPlayers(plan.map(entry => {
                    if (!entry) return null;
                    return typeof createCpuPlayer === "function"
                        ? createCpuPlayer(entry.difficulty, entry.options)
                        : new CPU(entry.difficulty, entry.options);
                }));
            },
            resetPresentationState() {
                GameRuntimeState.runtime.setPreviousCoins(null);
                winSoundPlayed = false;
            },
            cancelAutoSkip,
            clearUndo() {
                GameRuntimeState.runtime.setUndoState(null);
            },
            showGame() {
                document.getElementById("titleScreen").style.display = "none";
                document.getElementById("gameScreen").style.display = "block";
            },
            render,
            scheduleCpu: scheduleCPU,
        });
        if (runtimeResult.ok !== true) throw new Error('Saved game hydration failed');
        UiScreenFocus.focusGameOrPending(document, {
            pendingEligible: typeof isCurrentHumanUiTurn === 'function' &&
                isCurrentHumanUiTurn(),
        });
        return true;
    } catch(e) {
        setLocalResumePending(false);
        if (!validatedSave) repository.remove();
        updateResumeButton();
        const resumeButton = document.getElementById("btnResume");
        if (validatedSave && resumeButton && typeof resumeButton.focus === 'function') {
            resumeButton.focus();
        }
        showNotice("セーブデータの読み込みに失敗しました");
        return false;
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
    const currentGame = storageGameRuntimeSnapshot().game;
    GameRuntimeState.runtime.setUndoState(
        GameSnapshot.serializeUndoState(currentGame, SHOP_STOCK, Number.MAX_SAFE_INTEGER)
    );
}

function restoreUndoSnapshot(state) {
    const currentGame = storageGameRuntimeSnapshot().game;
    const hydrated = GameSnapshot.hydrateUndoState({
        game: currentGame,
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
    GameRuntimeState.runtime.setUndoState(null);
    GameRuntimeState.runtime.setPreviousCoins(null);
    cancelAutoSkip();
    return true;
}

function doUndo() {
    const gameState = storageGameRuntimeSnapshot();
    const onlineState = storageOnlineRuntimeSnapshot();
    if (!gameState.undoState) return;
    if (onlineState.isOnlineGame && (
        !gameState.game || gameState.game.currentPlayerIndex !== onlineState.myPlayerIndex
    )) return;
    const state = gameState.undoState;
    if (onlineState.isOnlineGame) {
        sendAction('undoBuild', { state });
        return;
    }
    const restored = typeof runLocalOrSendOnline === 'function'
        ? runLocalOrSendOnline(
            'undoBuild',
            { state },
            () => restoreUndoSnapshot(state),
            { effects: false }
        )
        : restoreUndoSnapshot(state);
    if (restored !== false) render();
}

function saveSettings() {
    storageClientStorageFacade.access(storage => {
        const speedEl = document.getElementById('cpuSpeed');
        const setup = GameSetupState.runtime.snapshot();
        const tutorial = UiTutorialSettings.runtime.snapshot();
        const values = StorageSettings.serializeSettings({
            selectedCount: setup.selectedCount,
            playerSettings: setup.playerSettings,
            tutorialEnabled: tutorial.tutorialEnabled,
            tutorialLevel: tutorial.tutorialLevel,
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
        GameSetupState.runtime.setSelectedCount(values.selectedCount);
        document.getElementById("playerCount").textContent = values.selectedCount;
        if (values.playerSettings) GameSetupState.runtime.setPlayerSettings(values.playerSettings);
        if (values.cpuSpeed) {
            const speedEl = document.getElementById('cpuSpeed');
            if (speedEl) {
                speedEl.value = values.cpuSpeed;
                document.getElementById('speedLabel').textContent = typeof formatCpuSpeedLabel === 'function'
                    ? formatCpuSpeedLabel(values.cpuSpeed)
                    : ((parseInt(values.cpuSpeed, 10) / 1000) + '秒');
            }
        }
        UiTutorialSettings.runtime.replace(values);
    });
    syncTutorialControls();
    renderPlayerSettings();
}
