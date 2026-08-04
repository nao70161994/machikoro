'use strict';

const LocalGameRestartRuntime = (() => {
    const ONLINE_STORAGE_KEYS = Object.freeze([
        'onlineSession',
        'onlineGameStart',
        'onlineActionLog',
        'onlineStateSnapshot',
        'onlinePendingAction',
    ]);
    const CONFIRM_MESSAGE = '最初からやり直しますか？\n現在のゲームは終了します';

    function createRuntime(dependencies = {}) {
        const required = [
            'cancelAutoSkip', 'cancelCpuSchedule', 'cancelDelayedHumanAction',
            'checkpoint', 'drawSkyline', 'getClearOnlineSessionStorage',
            'refreshPwaUpdateState', 'removeStorage', 'renderPlayerSettings',
            'resetFullLog', 'resetLifecycle', 'resetOnline', 'resetUiLocks',
            'setWinSoundPlayed', 'showConfirm', 'stopConfetti', 'updateResumeButton',
        ];
        for (const name of required) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`local game restart dependency is required: ${name}`);
            }
        }
        if (!dependencies.document || !dependencies.gameRuntime || !dependencies.setupRuntime) {
            throw new TypeError('local game restart runtime dependencies are required');
        }

        function clearOnlineStorage() {
            const clear = dependencies.getClearOnlineSessionStorage();
            if (typeof clear === 'function') {
                clear();
                return 'facade';
            }
            for (const key of ONLINE_STORAGE_KEYS) dependencies.removeStorage(key);
            return 'fallback';
        }

        function execute() {
            dependencies.checkpoint('restart-game-confirmed-start');
            dependencies.removeStorage('savedGame');
            clearOnlineStorage();
            dependencies.cancelCpuSchedule('restart-game-cancel-cpu');
            dependencies.cancelDelayedHumanAction();
            dependencies.cancelAutoSkip();
            dependencies.stopConfetti();
            dependencies.resetOnline();
            dependencies.resetUiLocks('restart-game-reset-ui-locks');
            dependencies.resetLifecycle('restart-game-lifecycle-reset');
            dependencies.gameRuntime.setGame(null);
            dependencies.gameRuntime.setPreviousCoins(null);
            dependencies.setWinSoundPlayed(false);
            dependencies.gameRuntime.setUndoState(null);
            dependencies.resetFullLog();
            dependencies.document.getElementById('gameScreen').style.display = 'none';
            dependencies.document.getElementById('titleScreen').style.display = 'block';
            dependencies.setupRuntime.replace({ selectedCount: 2, playerSettings: [] });
            dependencies.gameRuntime.setCpuPlayers([]);
            dependencies.document.getElementById('playerCount').textContent = 2;
            dependencies.renderPlayerSettings();
            dependencies.updateResumeButton();
            dependencies.drawSkyline();
            dependencies.refreshPwaUpdateState();
            dependencies.checkpoint('restart-game-confirmed-complete');
            return Object.freeze({ ok: true });
        }

        function restart() {
            return dependencies.showConfirm(CONFIRM_MESSAGE, execute);
        }

        return Object.freeze({ clearOnlineStorage, execute, restart });
    }

    return Object.freeze({ CONFIRM_MESSAGE, ONLINE_STORAGE_KEYS, createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalGameRestartRuntime;
if (typeof window !== 'undefined') Object.assign(window, { LocalGameRestartRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { LocalGameRestartRuntime });
