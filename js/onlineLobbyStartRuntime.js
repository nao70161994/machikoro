'use strict';

const OnlineLobbyStartRuntime = (() => {
    const STATUS = Object.freeze({
        SCHEMA_UNSUPPORTED: 'ゲーム状態のschema versionに対応していません。アプリを更新してください。',
        MODEL_LOADING: '深層学習AIモデルを読み込んでいます。',
        MODEL_FAILED: '深層学習AIモデルを読み込めませんでした。再接続して再試行します。',
    });
    const UI_RESET_REASON = 'online-game-start-reset-ui-locks';
    const VERSION_WARNING = '⚠️ バージョン不一致: ゲームが正常に動作しない可能性があります。全員アプリをリロードしてください。';

    function createRuntime(dependencies = {}) {
        const requiredObjects = [
            'console', 'logTypes', 'reconnectEvents', 'restoreKeys',
        ];
        for (const name of requiredObjects) {
            if (!dependencies[name]) {
                throw new TypeError(`online game start dependency is required: ${name}`);
            }
        }
        const requiredEffects = [
            'abortRestore', 'acceptRoom', 'acceptSchema', 'applyHostPayload',
            'clearHostlessState', 'clearPending', 'clearRejoinRetry', 'clearRestoreEventQueue',
            'clearRestoreBundleIncomplete', 'clearRestoreQuarantine', 'defaultLandmarks', 'flushRestoreEvents',
            'finishLobbyRequest', 'focusGame', 'getGame', 'getRestoreEventHandlers',
            'getRestoreGeneration', 'getSession', 'initGame', 'incrementRestoreGeneration',
            'notifyLifecycleStart', 'observeReconnect',
            'preloadModels', 'removeRestoreItem', 'replaceActionSequence',
            'replaceEnabledCards', 'replaceEnabledLandmarks', 'resetReconnectCompletion',
            'resetUiLocks', 'saveSession', 'setActionFlight', 'setCpuSpeed',
            'setHostState', 'setOnline', 'setReconnectFlag', 'setSchema', 'setStatusHtml', 'setStatusText',
            'showGame',
            'startRestore', 'writeRestoreJson',
        ];
        for (const name of requiredEffects) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`online game start effect is required: ${name}`);
            }
        }
        if (!Number.isInteger(dependencies.restoreSchemaVersion)) {
            throw new TypeError('online game start restore schema version is required');
        }
        if (!dependencies.roomShare ||
                typeof dependencies.roomShare.buildWaitingHtml !== 'function') {
            throw new TypeError('online game start room share dependency is required');
        }

        function buildRestorePayload(input) {
            const {
                playerNames,
                playerSettings,
                cpuSpeed,
                playerOrder,
                enabledCards,
                enabledLandmarks,
                versions,
                reconnectTokenHashes,
                hostPlayerIndex,
                hostEpoch,
                actionSeq,
                hostlessRestoreCapabilities,
                hostlessRestoreGeneration,
                hostlessRestoreCount,
                gameSchema,
            } = input;
            const payload = dependencies.applyHostPayload({
                schemaVersion: dependencies.restoreSchemaVersion,
                playerNames,
                playerSettings,
                cpuSpeed,
                playerOrder,
                enabledCards: enabledCards ? [...enabledCards] : null,
                enabledLandmarks: enabledLandmarks || null,
                versions,
                reconnectTokenHashes,
                hostPlayerIndex,
                actionSeq: Number.isInteger(actionSeq) ? actionSeq : 0,
                hostlessRestoreCapabilities,
                hostlessRestoreGeneration: Number.isInteger(hostlessRestoreGeneration)
                    ? hostlessRestoreGeneration : 0,
                hostlessRestoreCount: Number.isInteger(hostlessRestoreCount)
                    ? hostlessRestoreCount : 0,
            }, hostPlayerIndex, hostEpoch);
            if (gameSchema) payload.gameSchema = gameSchema;
            return payload;
        }

        function persistInitialBundle(gameStartPayload) {
            try {
                dependencies.writeRestoreJson(
                    dependencies.restoreKeys.gameStart,
                    gameStartPayload
                );
                dependencies.removeRestoreItem(dependencies.restoreKeys.stateSnapshot);
                dependencies.writeRestoreJson(dependencies.restoreKeys.actionLog, []);
                dependencies.clearRestoreBundleIncomplete();
                dependencies.clearPending();
            } catch (_) {
                // The existing online start path treats local persistence as best effort.
            }
        }

        function hasVersionMismatch(versions) {
            return Array.isArray(versions) && versions.length > 1 &&
                new Set(versions).size > 1;
        }

        function acceptLobbyRoom({ roomId, playerIndex, reconnectToken, hostPlayerIndex }) {
            dependencies.acceptRoom({ playerIndex, roomId, reconnectToken });
            if (Number.isInteger(hostPlayerIndex)) {
                dependencies.setHostState(hostPlayerIndex);
            }
        }

        function handleRoomCreated({ roomId, playerIndex, reconnectToken, hostPlayerIndex }) {
            dependencies.finishLobbyRequest('create');
            dependencies.clearRejoinRetry();
            dependencies.setReconnectFlag(false);
            acceptLobbyRoom({ roomId, playerIndex, reconnectToken, hostPlayerIndex });
            dependencies.saveSession();
            dependencies.setStatusHtml(dependencies.roomShare.buildWaitingHtml(roomId));
        }

        function handleRoomJoined({ roomId, playerIndex, reconnectToken, hostPlayerIndex }) {
            dependencies.finishLobbyRequest('join');
            dependencies.clearRejoinRetry();
            dependencies.setReconnectFlag(false);
            acceptLobbyRoom({ roomId, playerIndex, reconnectToken, hostPlayerIndex });
            dependencies.saveSession();
            dependencies.setStatusText(`ルーム ${roomId} に参加しました！`);
        }

        function handlePlayerList(players) {
            const roomId = dependencies.getSession().myRoomId;
            dependencies.setStatusHtml(dependencies.roomShare.buildWaitingHtml(roomId, players));
        }

        function handle(input = {}) {
            if (!dependencies.acceptSchema(input.gameSchema)) {
                dependencies.setStatusText(STATUS.SCHEMA_UNSUPPORTED);
                return;
            }
            dependencies.setSchema(input.gameSchema);
            if (typeof dependencies.setGameGeneration === 'function') {
                dependencies.setGameGeneration(input.gameGeneration);
            }
            dependencies.clearRejoinRetry();
            dependencies.clearHostlessState();
            dependencies.clearRestoreQuarantine();
            const generation = dependencies.incrementRestoreGeneration();
            dependencies.startRestore();
            dependencies.clearRestoreEventQueue();
            const gameStartPayload = buildRestorePayload(input);

            const startOnlineGame = () => {
                if (generation !== dependencies.getRestoreGeneration()) return;
                dependencies.resetReconnectCompletion();
                if (typeof dependencies.resetWinnerPresentation === 'function') {
                    dependencies.resetWinnerPresentation();
                }
                dependencies.setOnline(true);
                dependencies.setHostState(input.hostPlayerIndex);
                dependencies.setCpuSpeed(input.cpuSpeed || 1500);
                if (input.enabledCards) dependencies.replaceEnabledCards(input.enabledCards);
                dependencies.replaceEnabledLandmarks(
                    input.enabledLandmarks && input.enabledLandmarks.length > 0
                        ? input.enabledLandmarks
                        : dependencies.defaultLandmarks()
                );
                persistInitialBundle(gameStartPayload);
                dependencies.saveSession();
                dependencies.resetUiLocks(UI_RESET_REASON);
                dependencies.showGame();
                dependencies.initGame(
                    input.playerNames,
                    input.playerSettings,
                    input.playerOrder
                );
                dependencies.focusGame();
                dependencies.notifyLifecycleStart();
                if (hasVersionMismatch(input.versions)) {
                    dependencies.getGame().addLog(
                        dependencies.logTypes.SYSTEM,
                        VERSION_WARNING
                    );
                }
                const lastAppliedSeq = dependencies.replaceActionSequence(input.actionSeq);
                const flushed = dependencies.flushRestoreEvents(
                    generation,
                    lastAppliedSeq,
                    dependencies.getRestoreEventHandlers()
                );
                if (flushed) {
                    dependencies.observeReconnect(dependencies.reconnectEvents.GAME_ACTIVATED);
                }
            };

            const preload = dependencies.preloadModels(
                input.playerNames.length,
                input.playerSettings || []
            );
            if (preload && typeof preload.then === 'function') {
                dependencies.setStatusText(STATUS.MODEL_LOADING);
                preload.then(startOnlineGame).catch(error => {
                    if (generation !== dependencies.getRestoreGeneration()) return;
                    dependencies.console.error(error);
                    dependencies.setOnline(false);
                    dependencies.setActionFlight(false);
                    dependencies.abortRestore(generation, STATUS.MODEL_FAILED);
                });
                return;
            }
            startOnlineGame();
        }

        return Object.freeze({
            buildRestorePayload,
            handle,
            handlePlayerList,
            handleRoomCreated,
            handleRoomJoined,
            hasVersionMismatch,
        });
    }

    return Object.freeze({ STATUS, UI_RESET_REASON, VERSION_WARNING, createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineLobbyStartRuntime;
if (typeof window !== 'undefined') Object.assign(window, { OnlineLobbyStartRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { OnlineLobbyStartRuntime });
