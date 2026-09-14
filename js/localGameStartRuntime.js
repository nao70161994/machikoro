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
            return !!current && (typeof current.preloadSelectedModels === 'function' ||
                typeof current.preloadEligibleModels === 'function');
        }

        function ensureRlModelAssignments(playerCount, settings) {
            const snapshot = playerSettings.snapshot(settings, playerCount);
            const current = portfolio();
            if (!hasRlCpuSetting(snapshot, playerCount) || !current ||
                    typeof current.assignModelIds !== 'function') return snapshot;
            const assigned = current.assignModelIds(snapshot, playerCount);
            setupRuntime.setPlayerSettings(assigned);
            return assigned;
        }

        function modelLoadState(playerCount = setupSnapshot().selectedCount) {
            if (!hasLocalRlCpuSetting(playerCount)) {
                return { status: 'unused', ready: 0, total: 0, errors: [] };
            }
            const current = portfolio();
            if (!canPreloadRlModels()) {
                return { status: 'failed', ready: 0, total: 0, errors: ['RL model loader is not available'] };
            }
            const settings = ensureRlModelAssignments(playerCount, setupSnapshot().playerSettings);
            if (typeof current.selectedLoadState === 'function') {
                return current.selectedLoadState(playerCount, settings);
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
                    normalized.selectedCount,
                    portfolio() && typeof portfolio().eligibleModels === 'function'
                        ? portfolio().eligibleModels(normalized.selectedCount)
                        : []
                );
            }
            updateReadinessUi();
        }

        function restorePlayerTypeFocus(plan) {
            const root = document.getElementById('playerSettings');
            return playerSettings.applyPlayerTypeFocusPlan(plan, {
                findSelect(playerIndex) {
                    if (!root || typeof root.querySelector !== 'function') return null;
                    return root.querySelector(
                        `[data-ui-change="localPlayerType"][data-player-index="${playerIndex}"]`
                    );
                },
                getComputedStyle: document.defaultView &&
                    typeof document.defaultView.getComputedStyle === 'function'
                    ? element => document.defaultView.getComputedStyle(element)
                    : undefined,
            });
        }

        function preloadInBackground(reason = 'local-rl-background-preload') {
            const setup = setupSnapshot();
            const settings = ensureRlModelAssignments(setup.selectedCount, setup.playerSettings);
            if (!hasLocalRlCpuSetting(setup.selectedCount, settings) || !canPreloadRlModels()) {
                updateReadinessUi();
                return null;
            }
            updateReadinessUi();
            const current = portfolio();
            const preload = typeof current.preloadSelectedModels === 'function'
                ? current.preloadSelectedModels(setup.selectedCount, settings, { attempts: 3, retryDelayMs: 0 })
                : current.preloadEligibleModels(setup.selectedCount, { attempts: 3, retryDelayMs: 0 });
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
            const setup = setupSnapshot();
            const settings = setup.playerSettings;
            const focusPlan = playerSettings.playerTypeFocusPlan(index, setup.selectedCount);
            setupRuntime.setPlayerSetting(index, {
                type: value === 'human' ? 'human' : 'cpu',
                difficulty: value === 'human' ? 'normal' : value,
                name: playerSettings.normalizePlayerName(settings[index]?.name, index),
                rlModelId: value === 'rl' ? null : undefined,
                rlModelSelection: value === 'rl' ? 'auto' : undefined,
            });
            renderPlayerSettings();
            restorePlayerTypeFocus(focusPlan);
            if (value === 'rl') preloadInBackground('local-rl-selected-preload');
            saveSettings();
        }

        function changeRlModel(index, value) {
            const setup = setupSnapshot();
            const current = setup.playerSettings[index];
            if (!current || current.type !== 'cpu' || current.difficulty !== 'rl') return false;
            const currentPortfolio = portfolio();
            const selectedModel = value === 'auto' ? null : currentPortfolio &&
                typeof currentPortfolio.modelById === 'function'
                ? currentPortfolio.modelById(value, setup.selectedCount)
                : null;
            if (value !== 'auto' && !selectedModel) return false;
            setupRuntime.setPlayerSetting(index, Object.assign({}, current, {
                rlModelId: selectedModel ? selectedModel.id : null,
                rlModelSelection: value === 'auto' ? 'auto' : 'manual',
            }));
            const settings = ensureRlModelAssignments(setup.selectedCount, setupSnapshot().playerSettings);
            renderPlayerSettings();
            preloadInBackground('local-rl-model-selected-preload');
            saveSettings();
            return settings[index] && settings[index].rlModelId;
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
            const assigned = ensureRlModelAssignments(playerCount, settings);
            if (!hasLocalRlCpuSetting(playerCount, assigned)) return null;
            if (!canPreloadRlModels()) {
                return Promise.reject(new Error('RL model loader is not available'));
            }
            const current = portfolio();
            return typeof current.preloadSelectedModels === 'function'
                ? current.preloadSelectedModels(playerCount, assigned, { attempts: 3 })
                : current.preloadEligibleModels(playerCount, { attempts: 3 });
        }

        function startWithSafeFallback(playerCount, settings, error) {
            const current = portfolio();
            if (!current || typeof current.safeFallbackSettings !== 'function') return false;
            const fallback = current.safeFallbackSettings(settings, playerCount, 'strong');
            if (!fallback.replaced.length) return false;
            setupRuntime.setPlayerSettings(fallback.settings);
            renderPlayerSettings();
            const logger = dependencies.console;
            if (logger && typeof logger.warn === 'function') {
                logger.warn('local-rl-safe-fallback', error);
            }
            showNotice('深層学習AIモデルを読み込めなかったため、CPU（強）で開始します。');
            startNow(playerCount, fallback.settings);
            return true;
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
            const settings = ensureRlModelAssignments(playerCount, setup.playerSettings);
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
                    if (!startWithSafeFallback(playerCount, settings, error)) {
                        const logger = dependencies.console;
                        if (logger && typeof logger.error === 'function') logger.error(error);
                        updateReadinessUi();
                        showNotice('深層学習AIモデルを読み込めませんでした。通信状態を確認してもう一度開始してください。');
                    }
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
            changeRlModel,
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
            startWithSafeFallback,
            startNow,
            start,
        });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalGameStartRuntime;
if (typeof window !== 'undefined') Object.assign(window, { LocalGameStartRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { LocalGameStartRuntime });
