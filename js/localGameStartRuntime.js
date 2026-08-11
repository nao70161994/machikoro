'use strict';

const LocalGameStartRuntime = (() => {
    function createRuntime(dependencies = {}) {
        const {
            document,
            focusGame,
            getPortfolio,
            initializeGame,
            notifyLifecycleStart,
            playerCount,
            playerSettings,
            resetOnline,
            resetStats,
            resetUiLocks,
            saveSettings,
            setupRuntime,
            showNotice,
            startPolicy,
        } = dependencies;
        if (!document || typeof document.getElementById !== 'function' ||
                !playerCount || typeof playerCount.buildView !== 'function' ||
                typeof playerCount.applyView !== 'function' ||
                !playerSettings || !setupRuntime || !startPolicy) {
            throw new TypeError('local game start runtime dependencies are required');
        }
        const requiredEffects = {
            getPortfolio,
            focusGame,
            initializeGame,
            notifyLifecycleStart,
            resetOnline,
            resetStats,
            resetUiLocks,
            saveSettings,
            showNotice,
        };
        for (const [name, effect] of Object.entries(requiredEffects)) {
            if (typeof effect !== 'function') {
                throw new TypeError(`local game start runtime effect is required: ${name}`);
            }
        }

        const pendingController = startPolicy.createPendingController();

        function setupSnapshot() {
            return setupRuntime.snapshot();
        }

        function portfolio() {
            return getPortfolio();
        }

        function hasRlCpuSetting(settings, playerCount) {
            return playerSettings.hasRlCpu(settings, playerCount);
        }

        function snapshotPlayerSettings(playerCount = setupSnapshot().selectedCount) {
            return playerSettings.snapshot(setupSnapshot().playerSettings, playerCount);
        }

        function hasLocalRlCpuSetting(
            playerCount = setupSnapshot().selectedCount,
            settings = setupSnapshot().playerSettings
        ) {
            return hasRlCpuSetting(settings, playerCount);
        }

        function canPreloadRlModels() {
            const current = portfolio();
            return !!current && typeof current.preloadEligibleModels === 'function';
        }

        function modelLoadState(playerCount = setupSnapshot().selectedCount) {
            if (!hasLocalRlCpuSetting(playerCount)) {
                return { status: 'unused', ready: 0, total: 0, errors: [] };
            }
            const current = portfolio();
            if (!current || typeof current.preloadEligibleModels !== 'function') {
                return { status: 'failed', ready: 0, total: 0, errors: ['RL model loader is not available'] };
            }
            if (typeof current.eligibleLoadState === 'function') {
                return current.eligibleLoadState(playerCount);
            }
            return { status: 'idle', ready: 0, total: 1, errors: [] };
        }

        function modelStatusMessage(state) {
            return playerSettings.rlModelStatusMessage(state);
        }

        function updateReadinessUi() {
            const state = modelLoadState(setupSnapshot().selectedCount);
            const button = document.getElementById('btnStart');
            const status = document.getElementById('localRlModelStatus');
            if (button) {
                const view = playerSettings.startButtonView(state, pendingController.isPending());
                button.disabled = view.disabled;
                button.textContent = view.textContent;
            }
            if (status) status.textContent = modelStatusMessage(state);
            return state;
        }

        function renderPlayerSettings() {
            const setup = setupSnapshot();
            const normalized = setupRuntime.setPlayerSettings(
                playerSettings.normalizeSettings(setup.playerSettings, setup.selectedCount)
            );
            const target = document.getElementById('playerSettings');
            if (target) {
                target.innerHTML = playerSettings.buildSettingsHtml(
                    normalized.playerSettings,
                    normalized.selectedCount
                );
            }
            updateReadinessUi();
        }

        function preloadInBackground(reason = 'local-rl-background-preload') {
            const setup = setupSnapshot();
            if (!hasLocalRlCpuSetting(setup.selectedCount, setup.playerSettings) || !canPreloadRlModels()) {
                updateReadinessUi();
                return null;
            }
            updateReadinessUi();
            const preload = portfolio().preloadEligibleModels(
                setup.selectedCount,
                { attempts: 3, retryDelayMs: 0 }
            );
            if (preload && typeof preload.then === 'function') {
                preload.then(() => updateReadinessUi()).catch(error => {
                    const logger = dependencies.console;
                    if (logger && typeof logger.warn === 'function') logger.warn(reason, error);
                    updateReadinessUi();
                });
            }
            updateReadinessUi();
            return preload;
        }

        function changeCount(delta) {
            const setup = setupSnapshot();
            const next = setupRuntime.setSelectedCount(
                Math.min(10, Math.max(2, setup.selectedCount + delta))
            );
            const count = document.getElementById('playerCount');
            playerCount.applyView(count, playerCount.buildView(next.selectedCount));
            renderPlayerSettings();
            preloadInBackground('local-player-count-preload');
            saveSettings();
        }

        function changePlayerType(index, value) {
            const settings = setupSnapshot().playerSettings;
            setupRuntime.setPlayerSetting(index, {
                type: value === 'human' ? 'human' : 'cpu',
                difficulty: value === 'human' ? 'normal' : value,
                name: playerSettings.normalizePlayerName(settings[index]?.name, index),
            });
            renderPlayerSettings();
            if (value === 'rl') preloadInBackground('local-rl-selected-preload');
            saveSettings();
        }

        function changePlayerName(index, value) {
            if (!setupSnapshot().playerSettings[index]) {
                setupRuntime.setPlayerSetting(index, {
                    type: 'human',
                    difficulty: 'normal',
                    name: playerSettings.defaultPlayerName(index),
                });
            }
            setupRuntime.setPlayerName(index, value);
            saveSettings();
        }

        function preloadForStart(playerCount, settings = setupSnapshot().playerSettings) {
            if (!hasLocalRlCpuSetting(playerCount, settings)) return null;
            if (!canPreloadRlModels()) {
                return Promise.reject(new Error('RL model loader is not available'));
            }
            return portfolio().preloadEligibleModels(playerCount, { attempts: 3 });
        }

        function startNow(
            playerCount = setupSnapshot().selectedCount,
            settings = setupSnapshot().playerSettings
        ) {
            const speed = document.getElementById('cpuSpeed');
            const plan = startPolicy.runtimePlan(playerCount, settings, parseInt(speed.value));
            return startPolicy.execute(plan, {
                setRuntime(value) {
                    setupRuntime.replace({
                        selectedCount: value.playerCount,
                        playerSettings: Array.from(value.playerSettings, setting => Object.assign({}, setting)),
                        cpuSpeed: value.cpuSpeed,
                    });
                },
                saveSettings,
                resetStats,
                resetOnline,
                resetUiLocks,
                showGame() {
                    document.getElementById('titleScreen').style.display = 'none';
                    document.getElementById('gameScreen').style.display = 'block';
                },
                initializeGame,
                focusGame,
                notifyLifecycleStart,
            });
        }

        function start() {
            if (startPolicy.initialDecision({ startPending: pendingController.isPending() }) ===
                    startPolicy.REQUEST_DECISIONS.IGNORE_PENDING) return;
            const setup = setupSnapshot();
            const playerCount = setup.selectedCount;
            const settings = playerSettings.snapshot(setup.playerSettings, playerCount);
            const state = updateReadinessUi();
            if (startPolicy.initialDecision({ loadStatus: state.status }) ===
                    startPolicy.REQUEST_DECISIONS.WAIT_LOADING) {
                showNotice('深層学習AIモデルを読み込んでいます。');
                return;
            }
            const preload = preloadForStart(playerCount, settings);
            if (startPolicy.preloadDecision(preload) === startPolicy.REQUEST_DECISIONS.PRELOAD) {
                pendingController.begin();
                updateReadinessUi();
                showNotice('深層学習AIモデルを読み込んでいます。');
                preload.then(() => {
                    pendingController.finish();
                    updateReadinessUi();
                    startNow(playerCount, settings);
                }).catch(error => {
                    pendingController.finish();
                    const logger = dependencies.console;
                    if (logger && typeof logger.error === 'function') logger.error(error);
                    updateReadinessUi();
                    showNotice('深層学習AIモデルを読み込めませんでした。通信状態を確認してもう一度開始してください。');
                });
                return;
            }
            startNow();
        }

        return Object.freeze({
            pendingController,
            changeCount,
            renderPlayerSettings,
            changePlayerType,
            changePlayerName,
            hasRlCpuSetting,
            snapshotPlayerSettings,
            hasLocalRlCpuSetting,
            canPreloadRlModels,
            modelLoadState,
            modelStatusMessage,
            updateReadinessUi,
            preloadForStart,
            preloadInBackground,
            startNow,
            start,
        });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalGameStartRuntime;
if (typeof window !== 'undefined') Object.assign(window, { LocalGameStartRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { LocalGameStartRuntime });
