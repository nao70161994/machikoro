'use strict';

const MainAutoSkipRuntime = (() => {
    /**
     * 建設不能時の自動手番終了を、状態参照と副作用の順序を保ったまま構成する。
     * @param {Record<string, any>} dependencies
     */
    function createRuntime(dependencies = {}) {
        const requiredObjects = [
            'cards', 'gamePhases', 'landmarkNames', 'player', 'policy', 'shopStock',
        ];
        for (const name of requiredObjects) {
            if (!dependencies[name]) {
                throw new TypeError(`main auto skip runtime dependency is required: ${name}`);
            }
        }
        const requiredEffects = [
            'canRunLocalHumanAction', 'clearTimeout', 'getEnabledLandmarks',
            'getGameState', 'getOnlineState', 'getStockCount', 'runAction', 'setTimeout',
        ];
        for (const name of requiredEffects) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`main auto skip runtime effect is required: ${name}`);
            }
        }

        const controller = dependencies.policy.createScheduleController();

        function cancel() {
            const timer = controller.getTimer();
            if (timer) dependencies.clearTimeout(timer);
            controller.finish();
        }

        function check() {
            if (controller.isPending()) return false;
            const gameState = dependencies.getGameState();
            const currentGame = gameState.game;
            if (!currentGame || currentGame.checkWinner()) return false;
            if (currentGame.phase !== dependencies.gamePhases.BUILD) {
                cancel();
                return false;
            }
            if (gameState.cpuPlayers[currentGame.currentPlayerIndex]) return false;
            const onlineState = dependencies.getOnlineState();
            if (
                onlineState.isOnlineGame &&
                currentGame.currentPlayerIndex !== onlineState.myPlayerIndex
            ) return false;
            if (currentGame.pendingRenovation > 0) return false;
            if (currentGame.builtThisTurn) {
                cancel();
                return false;
            }

            const availability = dependencies.policy.buildAvailability({
                cards: dependencies.cards,
                current: currentGame.currentPlayer(),
                shopStock: dependencies.shopStock,
                getStockCount: dependencies.getStockCount,
                enabledLandmarks: dependencies.getEnabledLandmarks(),
                yakushoName: dependencies.landmarkNames.YAKUSHO,
                landmarkCost: name => dependencies.player.landmarkCost(name),
            });
            if (availability.canAffordAny) return false;

            const scheduledPlayerIndex = currentGame.currentPlayerIndex;
            controller.begin();
            controller.setTimer(dependencies.setTimeout(() => {
                controller.finish();
                const delayedGame = dependencies.getGameState().game;
                if (
                    dependencies.canRunLocalHumanAction(scheduledPlayerIndex) &&
                    delayedGame.phase === dependencies.gamePhases.BUILD &&
                    !delayedGame.builtThisTurn
                ) {
                    dependencies.runAction('nextTurn', {}, () => delayedGame.nextTurn());
                }
            }, 1500));
            return true;
        }

        return Object.freeze({ cancel, check, controller });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MainAutoSkipRuntime;
if (typeof window !== 'undefined') Object.assign(window, { MainAutoSkipRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { MainAutoSkipRuntime });
