'use strict';

const LocalGameInitializer = (() => {
    function createRuntime(dependencies = {}) {
        const requiredFunctions = [
            'cancelAutoSkip', 'cancelCpuSchedule', 'cancelDelayedHumanAction',
            'cpuLabel', 'createCpu', 'createGame', 'getEnabledCards',
            'getEnabledLandmarks', 'getMarketRule', 'initialCardStock', 'landmarkNames',
            'normalizePlayerName', 'normalizePlayerSetting', 'opponentDifficulties',
            'random', 'render', 'replaceEnabledLandmarks', 'resetFullLog',
            'scheduleCpu', 'setShopStockCount', 'setWinSoundPlayed', 'stopConfetti',
        ];
        for (const name of requiredFunctions) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`local game initializer dependency is required: ${name}`);
            }
        }
        if (!dependencies.cards || !dependencies.gameRuntime || !dependencies.setupRuntime ||
                !dependencies.marketSupply ||
                !dependencies.shopStock || !dependencies.logTypes) {
            throw new TypeError('local game initializer runtime dependencies are required');
        }

        function shuffledIndexes(count) {
            const order = Array.from({ length: count }, (_, index) => index);
            for (let index = order.length - 1; index > 0; index--) {
                const swapIndex = Math.floor(dependencies.random() * (index + 1));
                [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
            }
            return order;
        }

        function initialize(playerCount) {
            dependencies.cancelCpuSchedule('init-cancel-cpu');
            dependencies.cancelDelayedHumanAction();
            dependencies.gameRuntime.setPreviousCoins(null);
            dependencies.stopConfetti();
            dependencies.setWinSoundPlayed(false);
            dependencies.cancelAutoSkip();
            dependencies.gameRuntime.setUndoState(null);
            dependencies.resetFullLog();

            const initialized = dependencies.gameRuntime.setGame(dependencies.createGame(playerCount));
            const game = initialized.game;
            const order = shuffledIndexes(playerCount);
            let enabledLandmarks = dependencies.getEnabledLandmarks();
            if (enabledLandmarks.size === 0) {
                enabledLandmarks = dependencies.replaceEnabledLandmarks(dependencies.landmarkNames());
            }
            const enabledCards = dependencies.getEnabledCards();
            const marketRule = dependencies.getMarketRule();
            game.enabledLandmarks = new Set(enabledLandmarks);
            game.marketSupply = dependencies.marketSupply.initialize({
                mode: marketRule,
                seed: marketRule === dependencies.marketSupply.MODES.TEN_TYPE
                    ? Math.floor((dependencies.random() || 0) * 0x100000000) >>> 0
                    : 0,
                cards: dependencies.cards,
                enabledCardNames: enabledCards,
                playerCount,
                shopStock: dependencies.shopStock,
                initialStock: dependencies.initialCardStock,
                setStock: dependencies.setShopStockCount,
            });

            const setup = dependencies.setupRuntime.snapshot();
            const normalized = dependencies.setupRuntime.setPlayerSettings(
                Array.from({ length: playerCount }, (_, index) =>
                    dependencies.normalizePlayerSetting(setup.playerSettings[index], index, playerCount)
                )
            );
            const shuffledSettings = order.map(originalIndex => normalized.playerSettings[originalIndex] || {});
            const opponentDifficulties = dependencies.opponentDifficulties(shuffledSettings);
            const cpuPlayers = [];
            for (let index = 0; index < playerCount; index++) {
                const originalIndex = order[index];
                const setting = shuffledSettings[index];
                game.players[index].name = setting.type === 'cpu'
                    ? dependencies.cpuLabel(setting.difficulty)
                    : dependencies.normalizePlayerName(setting.name, originalIndex);
                cpuPlayers.push(setting.type === 'cpu'
                    ? dependencies.createCpu(setting.difficulty, {
                        expertPurpose: 'live',
                        playerCount,
                        expertOpponentDifficulties: opponentDifficulties,
                    })
                    : null);
            }
            dependencies.gameRuntime.setCpuPlayers(cpuPlayers);
            game.addLog(
                dependencies.logTypes.SYSTEM,
                `👤 ${game.currentPlayer().name}のターン`
            );
            dependencies.render();
            dependencies.scheduleCpu();
            return Object.freeze({
                game,
                order: Object.freeze(order),
                cpuPlayers: Object.freeze(cpuPlayers.slice()),
            });
        }

        return Object.freeze({ initialize, shuffledIndexes });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalGameInitializer;
if (typeof window !== 'undefined') Object.assign(window, { LocalGameInitializer });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { LocalGameInitializer });
