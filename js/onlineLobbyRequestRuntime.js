'use strict';

const OnlineLobbyRequestRuntime = (() => {
    const TEXT = Object.freeze({
        NAME_REQUIRED: '名前を入力してください',
        ROOM_ID_INVALID: 'ルームIDは6文字です',
        MODEL_LOADING: '深層学習AIモデルを読み込んでいます。',
        MODEL_FAILED: '深層学習AIモデルを読み込めませんでした。通信状態を確認してもう一度部屋を作成してください。',
        REQUEST_TIMEOUT_STATUS: '⚠️ サーバー応答がありません。もう一度お試しください。',
        REQUEST_TIMEOUT_NOTICE: 'サーバー応答がタイムアウトしました。通信状態を確認してもう一度お試しください。',
    });

    function createRuntime(dependencies = {}) {
        const requiredObjects = [
            'controller', 'ids', 'playerSettings', 'setupRuntime',
        ];
        for (const name of requiredObjects) {
            if (!dependencies[name]) {
                throw new TypeError(`online lobby request dependency is required: ${name}`);
            }
        }
        const requiredFunctions = [
            'applyButtonView', 'clearTimer', 'createRoom', 'freezeSettings',
            'getCapabilities', 'getClientVersion', 'getModelPortfolio',
            'getSelection', 'initSocket', 'inputValue', 'joinRoom', 'setHost',
            'schedulePwaRefresh', 'setPlayerName', 'setStatusText', 'setText',
            'setTimer', 'showNotice', 'warn', 'withCapabilities',
        ];
        for (const name of requiredFunctions) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`online lobby request effect is required: ${name}`);
            }
        }
        if (!Number.isFinite(dependencies.requestTimeoutMs)) {
            throw new TypeError('online lobby request timeout is required');
        }

        function snapshotPlayerSettings(playerCount = dependencies.setupRuntime.snapshot().selectedCount) {
            const setup = dependencies.setupRuntime.snapshot();
            return dependencies.playerSettings.snapshot(setup.playerSettings, playerCount);
        }

        function hasRlCpu(playerCount = dependencies.setupRuntime.snapshot().selectedCount,
                settings = dependencies.setupRuntime.snapshot().playerSettings) {
            return dependencies.playerSettings.hasRlCpu(settings, playerCount);
        }

        function modelPortfolio() {
            return dependencies.getModelPortfolio();
        }

        function canPreloadModels() {
            const portfolio = modelPortfolio();
            return !!portfolio && typeof portfolio.preloadEligibleModels === 'function';
        }

        function modelLoadState(playerCount = dependencies.setupRuntime.snapshot().selectedCount) {
            const usesRl = hasRlCpu(playerCount);
            if (!usesRl) {
                return dependencies.playerSettings.rlModelLoadState({
                    usesRl: false,
                    playerCount,
                });
            }
            const portfolio = modelPortfolio();
            const loaderAvailable = canPreloadModels();
            return dependencies.playerSettings.rlModelLoadState({
                usesRl,
                loaderAvailable,
                playerCount,
                eligibleLoadState: loaderAvailable &&
                        typeof portfolio.eligibleLoadState === 'function'
                    ? count => portfolio.eligibleLoadState(count)
                    : null,
            });
        }

        function modelStatusMessage(state) {
            return dependencies.playerSettings.rlModelStatusMessage(state);
        }

        function updateReadinessUi() {
            const state = modelLoadState(dependencies.setupRuntime.snapshot().selectedCount);
            const view = dependencies.playerSettings.createButtonView(
                state,
                dependencies.controller.snapshot().createPending
            );
            dependencies.applyButtonView(dependencies.ids.createButton, view);
            dependencies.setText(dependencies.ids.rlStatus, modelStatusMessage(state));
            return state;
        }

        function renderJoinPending() {
            const view = dependencies.playerSettings.joinButtonView(
                dependencies.controller.snapshot().joinPending
            );
            dependencies.applyButtonView(dependencies.ids.joinButton, view);
        }

        function setJoinPending(pending) {
            dependencies.controller.setJoinPending(pending);
            renderJoinPending();
        }

        function finish(kind = '') {
            const transition = dependencies.controller.finish(kind);
            if (!transition.finished) return false;
            if (transition.timer) dependencies.clearTimer(transition.timer);
            updateReadinessUi();
            renderJoinPending();
            dependencies.schedulePwaRefresh();
            return true;
        }

        function begin(kind) {
            const transition = dependencies.controller.begin(kind);
            if (transition.replacedTimer) {
                dependencies.clearTimer(transition.replacedTimer);
            }
            updateReadinessUi();
            renderJoinPending();
            const timer = dependencies.setTimer(() => {
                if (!dependencies.controller.isCurrent(kind, transition.generation)) return;
                finish(kind);
                dependencies.setStatusText(TEXT.REQUEST_TIMEOUT_STATUS);
                dependencies.showNotice(TEXT.REQUEST_TIMEOUT_NOTICE, { announce: false });
            }, dependencies.requestTimeoutMs);
            dependencies.controller.attachTimer(kind, transition.generation, timer);
        }

        function setCreatePending(pending) {
            const state = dependencies.controller.setCreatePending(pending);
            updateReadinessUi();
            if (!state.createPending && !state.joinPending) {
                dependencies.schedulePwaRefresh();
            }
        }

        function preloadForSettings(playerCount, settings) {
            if (!hasRlCpu(playerCount, settings)) return null;
            const portfolio = modelPortfolio();
            if (!canPreloadModels()) {
                return Promise.reject(new Error('RL model loader is not available'));
            }
            return portfolio.preloadEligibleModels(playerCount, { attempts: 3 });
        }

        function preloadForCreate(playerCount,
                settings = dependencies.setupRuntime.snapshot().playerSettings) {
            return preloadForSettings(playerCount, settings);
        }

        function preloadInBackground(reason = 'online-rl-background-preload') {
            const setup = dependencies.setupRuntime.snapshot();
            if (!hasRlCpu(setup.selectedCount, setup.playerSettings) ||
                    !canPreloadModels()) {
                updateReadinessUi();
                return null;
            }
            updateReadinessUi();
            const preload = modelPortfolio().preloadEligibleModels(
                setup.selectedCount,
                { attempts: 3, retryDelayMs: 0 }
            );
            if (preload && typeof preload.then === 'function') {
                preload.then(() => updateReadinessUi()).catch(error => {
                    dependencies.warn(reason, error);
                    updateReadinessUi();
                });
            }
            updateReadinessUi();
            return preload;
        }

        function emitCreate(name, playerCount = dependencies.setupRuntime.snapshot().selectedCount,
                settings = dependencies.setupRuntime.snapshot().playerSettings) {
            dependencies.setPlayerName(name);
            const setup = dependencies.setupRuntime.setCpuSpeed(
                parseInt(dependencies.inputValue(dependencies.ids.cpuSpeed))
            );
            if (!dependencies.initSocket()) return false;
            begin('create');
            dependencies.setHost(true);
            const selection = dependencies.getSelection();
            const payload = {
                playerName: name,
                playerCount,
                playerSettings: dependencies.freezeSettings(settings, playerCount),
                cpuSpeed: setup.cpuSpeed,
                enabledCards: [...selection.enabledCards],
                enabledLandmarks: [...selection.enabledLandmarks],
                marketRule: selection.marketRule,
                marketRuleVersion: 1,
                clientVersion: dependencies.getClientVersion(),
                hostlessRestoreVersion: dependencies.hostlessRestoreVersion,
            };
            dependencies.createRoom(dependencies.withCapabilities(
                payload,
                dependencies.getCapabilities()
            ));
            return true;
        }

        function showCreate() {
            if (dependencies.controller.snapshot().createPending) return false;
            const name = dependencies.inputValue(dependencies.ids.playerName).trim();
            if (!name) {
                dependencies.showNotice(TEXT.NAME_REQUIRED);
                return false;
            }
            const setup = dependencies.setupRuntime.snapshot();
            const playerCount = setup.selectedCount;
            const settings = dependencies.playerSettings.snapshot(
                setup.playerSettings,
                playerCount
            );
            const state = updateReadinessUi();
            if (state.status === 'loading') {
                dependencies.showNotice(TEXT.MODEL_LOADING);
                return false;
            }
            const preload = preloadForCreate(playerCount, settings);
            if (preload && typeof preload.then === 'function') {
                setCreatePending(true);
                dependencies.applyButtonView(dependencies.ids.createButton, {
                    disabled: true,
                    textContent: 'モデル読み込み中',
                });
                dependencies.showNotice(TEXT.MODEL_LOADING);
                preload.then(() => {
                    setCreatePending(false);
                    updateReadinessUi();
                    emitCreate(name, playerCount, settings);
                }).catch(error => {
                    setCreatePending(false);
                    dependencies.warn('online-rl-create-preload', error, true);
                    updateReadinessUi();
                    dependencies.showNotice(TEXT.MODEL_FAILED);
                });
                return true;
            }
            return emitCreate(name, playerCount, settings);
        }

        function join() {
            if (dependencies.controller.snapshot().joinPending) return false;
            const name = dependencies.inputValue(dependencies.ids.playerName).trim();
            const roomId = dependencies.inputValue(dependencies.ids.roomId)
                .trim()
                .toUpperCase();
            if (!name) {
                dependencies.showNotice(TEXT.NAME_REQUIRED);
                return false;
            }
            if (roomId.length !== 6) {
                dependencies.showNotice(TEXT.ROOM_ID_INVALID);
                return false;
            }
            dependencies.setPlayerName(name);
            dependencies.setHost(false);
            if (!dependencies.initSocket()) return false;
            begin('join');
            const payload = {
                roomId,
                playerName: name,
                clientVersion: dependencies.getClientVersion(),
                hostlessRestoreVersion: dependencies.hostlessRestoreVersion,
                marketRuleVersion: 1,
            };
            dependencies.joinRoom(dependencies.withCapabilities(
                payload,
                dependencies.getCapabilities()
            ));
            return true;
        }

        return Object.freeze({
            begin,
            canPreloadModels,
            emitCreate,
            finish,
            hasRlCpu,
            join,
            modelLoadState,
            modelStatusMessage,
            preloadForCreate,
            preloadForSettings,
            preloadInBackground,
            renderJoinPending,
            setCreatePending,
            setJoinPending,
            showCreate,
            snapshotPlayerSettings,
            updateReadinessUi,
        });
    }

    return Object.freeze({ TEXT, createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineLobbyRequestRuntime;
if (typeof window !== 'undefined') Object.assign(window, { OnlineLobbyRequestRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { OnlineLobbyRequestRuntime });
