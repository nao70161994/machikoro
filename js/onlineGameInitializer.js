'use strict';

const OnlineGameInitializer = (() => {
    function createRuntime(dependencies = {}) {
        const requiredFunctions = [
            'cancelAutoSkip', 'cancelCpuSchedule', 'cancelDelayedHumanAction',
            'createCpu', 'createGame', 'getSelection', 'initialCardStock',
            'landmarkNames', 'opponentDifficulties', 'render', 'resetFullLog',
            'resetStatsRecorded', 'scheduleCpu', 'setCurrentPlayerIndex',
            'setShopStockCount',
        ];
        for (const name of requiredFunctions) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`online game initializer dependency is required: ${name}`);
            }
        }
        if (!dependencies.cards || !dependencies.gameRuntime ||
                !dependencies.logTypes || !dependencies.shopStock) {
            throw new TypeError('online game initializer runtime dependencies are required');
        }

        function initialize(input = {}) {
            const playerNames = input.playerNames || [];
            const playerSettings = input.playerSettings;
            const playerCount = playerNames.length;
            dependencies.cancelCpuSchedule();
            dependencies.cancelDelayedHumanAction();
            dependencies.cancelAutoSkip();
            dependencies.gameRuntime.setPreviousCoins(null);
            dependencies.gameRuntime.setUndoState(null);
            dependencies.resetFullLog();
            dependencies.resetStatsRecorded();

            const initialized = dependencies.gameRuntime.setGame(
                dependencies.createGame(playerCount)
            );
            const game = initialized.game;
            const selection = dependencies.getSelection();
            const selectedLandmarks = selection.enabledLandmarks.length > 0
                ? selection.enabledLandmarks
                : dependencies.landmarkNames();
            const selectedCards = new Set(selection.enabledCards);
            game.enabledLandmarks = new Set(selectedLandmarks);
            for (const card of dependencies.cards) {
                dependencies.setShopStockCount(
                    dependencies.shopStock,
                    card,
                    selectedCards.has(card.name)
                        ? dependencies.initialCardStock(card, playerCount)
                        : 0
                );
            }

            const order = input.playerOrder || playerNames.map((_, index) => index);
            for (let index = 0; index < playerCount; index++) {
                game.players[index].name = playerNames[order[index]];
            }
            let cpuPlayers;
            if (playerSettings && playerSettings.length > 0) {
                const orderedSettings = order.map(originalIndex =>
                    playerSettings[originalIndex] || null
                );
                const opponentDifficulties = dependencies.opponentDifficulties(
                    orderedSettings
                );
                cpuPlayers = orderedSettings.map(setting => setting && setting.type === 'cpu'
                    ? dependencies.createCpu(setting.difficulty, {
                        expertPurpose: 'live',
                        playerCount,
                        expertOpponentDifficulties: opponentDifficulties,
                        rlModelId: setting.rlModelId || setting.modelId || null,
                    })
                    : null);
            } else {
                cpuPlayers = game.players.map(() => null);
            }
            dependencies.gameRuntime.setCpuPlayers(cpuPlayers);
            const orderedPlayerIndex = order.indexOf(input.myOriginalPlayerIndex);
            dependencies.setCurrentPlayerIndex(
                orderedPlayerIndex === -1 ? 0 : orderedPlayerIndex
            );
            game.addLog(
                dependencies.logTypes.SYSTEM,
                `👤 ${game.currentPlayer().name}のターン`,
                { review: false }
            );
            dependencies.render();
            dependencies.scheduleCpu();
            return Object.freeze({ game, order, cpuPlayers });
        }

        return Object.freeze({ initialize });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineGameInitializer;
if (typeof window !== 'undefined') Object.assign(window, { OnlineGameInitializer });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { OnlineGameInitializer });
