'use strict';

const MainHumanActionRuntime = (() => {
    function createRuntime(dependencies = {}) {
        const requiredObjects = [
            'actions', 'cards', 'document', 'landmarkNames', 'localActionPolicy',
            'pageActivationRuntime', 'player', 'shopStock',
        ];
        for (const name of requiredObjects) {
            if (!dependencies[name]) {
                throw new TypeError(`main human action runtime dependency is required: ${name}`);
            }
        }
        const requiredEffects = [
            'allowedActionsFor', 'cancelAutoSkip', 'checkpoint', 'clearUndoState',
            'decrementStock', 'getActionFlightState', 'getGameState', 'getLandmarkEmoji', 'getOnlineState',
            'getStockCount', 'isReconnectBlocked', 'playSound', 'render', 'rollDie', 'runAction',
            'saveUndoState', 'scheduleCpu', 'sendAction', 'showConfirm', 'traceBuild',
            'unlockHumanTurn', 'updateDiceDisplay',
        ];
        for (const name of requiredEffects) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`main human action runtime effect is required: ${name}`);
            }
        }
        const pageRuntime = dependencies.pageActivationRuntime;
        for (const name of ['isDelayedPending', 'scheduleDelayed']) {
            if (typeof pageRuntime[name] !== 'function') {
                throw new TypeError(`main human action page runtime method is required: ${name}`);
            }
        }

        function gameState() {
            return dependencies.getGameState();
        }

        function onlineState() {
            return dependencies.getOnlineState();
        }

        function canRunAction(action) {
            const currentGame = gameState().game;
            if (!currentGame || !action) return false;
            if (typeof currentGame.allowedActions === 'function') {
                return currentGame.allowedActions().has(action);
            }
            return dependencies.allowedActionsFor(currentGame).has(action);
        }

        function canRunLocalHumanAction(expectedPlayerIndex = null) {
            const state = gameState();
            const currentGame = state.game;
            if (!currentGame || currentGame.checkWinner()) return false;
            const online = onlineState();
            return dependencies.localActionPolicy.canRunHumanAction({
                hasGame: true,
                hasWinner: false,
                expectedPlayerIndex,
                currentPlayerIndex: currentGame.currentPlayerIndex,
                isCpuTurn: !!state.cpuPlayers[currentGame.currentPlayerIndex],
                isOnlineGame: online.isOnlineGame,
                myPlayerIndex: online.myPlayerIndex,
                isReconnecting: online.isOnlineGame ? dependencies.isReconnectBlocked() : false,
                onlineActionInFlight: online.isOnlineGame && dependencies.getActionFlightState().inFlight,
                socketConnected: !online.isOnlineGame ||
                    (!!online.socket && online.socket.connected !== false),
            });
        }

        function canRunHumanAction(action, expectedPlayerIndex = null) {
            return canRunLocalHumanAction(expectedPlayerIndex) && canRunAction(action);
        }

        function onRoll() {
            if (!canRunHumanAction(dependencies.actions.ROLL_DICE)) return;
            const currentGame = gameState().game;
            dependencies.playSound('dice');
            if (currentGame.currentPlayer().landmarks[dependencies.landmarkNames.STATION]) {
                dependencies.runAction(
                    dependencies.actions.ROLL_DICE,
                    { forceDice: null, tunaDice: null },
                    () => currentGame.rollDice(null, null)
                );
                return;
            }
            if (pageRuntime.isDelayedPending()) return;
            const scheduledPlayerIndex = currentGame.currentPlayerIndex;
            dependencies.updateDiceDisplay(null, true);
            pageRuntime.scheduleDelayed(
                dependencies.actions.ROLL_DICE,
                scheduledPlayerIndex,
                () => {
                    const delayedGame = gameState().game;
                    if (onlineState().isOnlineGame) {
                        dependencies.runAction(
                            dependencies.actions.ROLL_DICE,
                            { forceDice: null, tunaDice: null },
                            () => delayedGame.rollDice(null, null)
                        );
                        return;
                    }
                    const forceDice = dependencies.rollDie();
                    const tunaDice = [dependencies.rollDie(), dependencies.rollDie()];
                    dependencies.runAction(
                        dependencies.actions.ROLL_DICE,
                        { forceDice, tunaDice },
                        () => delayedGame.rollDice(forceDice, tunaDice)
                    );
                },
                600
            );
        }

        function onSelectDiceCount(useTwo) {
            if (!canRunHumanAction(dependencies.actions.SELECT_DICE)) return;
            if (pageRuntime.isDelayedPending()) return;
            const currentGame = gameState().game;
            dependencies.playSound('dice');
            const scheduledPlayerIndex = currentGame.currentPlayerIndex;
            dependencies.updateDiceDisplay(null, true);
            pageRuntime.scheduleDelayed(
                dependencies.actions.SELECT_DICE,
                scheduledPlayerIndex,
                () => {
                    const delayedGame = gameState().game;
                    if (onlineState().isOnlineGame) {
                        dependencies.runAction(
                            dependencies.actions.SELECT_DICE,
                            { useTwo, diceCount: useTwo ? 2 : 1 },
                            () => delayedGame.selectDiceCount(useTwo, 1, useTwo ? 1 : 0, null)
                        );
                        return;
                    }
                    const d1 = dependencies.rollDie();
                    const d2 = useTwo ? dependencies.rollDie() : 0;
                    const tunaDice = [dependencies.rollDie(), dependencies.rollDie()];
                    dependencies.runAction(
                        dependencies.actions.SELECT_DICE,
                        { useTwo, diceCount: useTwo ? 2 : 1, d1, d2, tunaDice },
                        () => delayedGame.selectDiceCount(useTwo, d1, d2, tunaDice)
                    );
                },
                600
            );
        }

        function onReroll() {
            if (!canRunHumanAction(dependencies.actions.REROLL_DICE)) return;
            const currentGame = gameState().game;
            if (onlineState().isOnlineGame) {
                dependencies.runAction(
                    dependencies.actions.REROLL_DICE,
                    {},
                    () => currentGame.rerollDice(1, null)
                );
                return;
            }
            const forceDice = dependencies.rollDie();
            const tunaDice = [dependencies.rollDie(), dependencies.rollDie()];
            dependencies.runAction(
                dependencies.actions.REROLL_DICE,
                { forceDice, tunaDice },
                () => currentGame.rerollDice(forceDice, tunaDice)
            );
        }

        function onSkipReroll() {
            if (!canRunHumanAction(dependencies.actions.SKIP_REROLL)) return;
            const currentGame = gameState().game;
            dependencies.runAction(
                dependencies.actions.SKIP_REROLL,
                {},
                () => currentGame.skipReroll()
            );
        }

        function onResolveHarbor(useBonus) {
            if (!canRunHumanAction(dependencies.actions.RESOLVE_HARBOR)) return;
            dependencies.runAction(
                dependencies.actions.RESOLVE_HARBOR,
                { useBonus },
                () => gameState().game.resolveHarbor(useBonus)
            );
        }

        function onResolveTV(targetIndex) {
            if (!canRunHumanAction(dependencies.actions.RESOLVE_TV)) return;
            dependencies.runAction(
                dependencies.actions.RESOLVE_TV,
                { targetIndex },
                () => gameState().game.resolveTV(targetIndex)
            );
        }

        function onResolveBusiness(targetIndex) {
            if (!canRunHumanAction(dependencies.actions.RESOLVE_BUSINESS)) return;
            const myCard = parseInt(dependencies.document.getElementById('myCardSelect').value, 10);
            const theirCard = parseInt(
                dependencies.document.getElementById(`theirCardSelect_${targetIndex}`).value,
                10
            );
            dependencies.runAction(
                dependencies.actions.RESOLVE_BUSINESS,
                { myCard, targetIndex, theirCard },
                () => gameState().game.resolveBusiness(myCard, targetIndex, theirCard)
            );
        }

        function onResolveCleaning(cardName) {
            if (!canRunHumanAction(dependencies.actions.RESOLVE_CLEANING)) return;
            dependencies.runAction(
                dependencies.actions.RESOLVE_CLEANING,
                { cardName },
                () => gameState().game.resolveCleaning(cardName)
            );
        }

        function onResolveMover(targetIndex) {
            if (!canRunHumanAction(dependencies.actions.RESOLVE_MOVER)) return;
            const cardIndex = parseInt(
                dependencies.document.getElementById('moverCardSelect').value,
                10
            );
            dependencies.runAction(
                dependencies.actions.RESOLVE_MOVER,
                { cardIndex, targetIndex },
                () => gameState().game.resolveMover(cardIndex, targetIndex)
            );
        }

        function onResolveRenovation(landmarkName) {
            if (!canRunHumanAction(dependencies.actions.RESOLVE_RENOVATION)) return;
            dependencies.runAction(
                dependencies.actions.RESOLVE_RENOVATION,
                { landmarkName },
                () => gameState().game.resolveRenovation(landmarkName)
            );
        }

        function onResolveIT(doSave) {
            if (!canRunHumanAction(dependencies.actions.RESOLVE_IT)) return;
            dependencies.runAction(
                dependencies.actions.RESOLVE_IT,
                { doSave },
                () => gameState().game.resolveIT(doSave)
            );
        }

        function traceBuildFlow(stage, details = {}) {
            dependencies.traceBuild(stage, details);
        }

        function onBuildCard(name) {
            if (!canRunHumanAction(dependencies.actions.BUILD_CARD)) return;
            traceBuildFlow('card-request', { cardName: name });
            const card = dependencies.cards.find(candidate => candidate.name === name);
            if (!card) return;
            const scheduledPlayerIndex = gameState().game.currentPlayerIndex;
            dependencies.showConfirm(`${card.name}を建設しますか？\n💰 ${card.cost}コイン`, () => {
                traceBuildFlow('card-confirmed', { cardName: name, scheduledPlayerIndex });
                if (!canRunHumanAction(dependencies.actions.BUILD_CARD, scheduledPlayerIndex)) {
                    traceBuildFlow('card-stale-action', { cardName: name, scheduledPlayerIndex });
                    return;
                }
                if (dependencies.getStockCount(dependencies.shopStock, card) <= 0) {
                    traceBuildFlow('card-out-of-stock', { cardName: name });
                    return;
                }
                dependencies.saveUndoState();
                dependencies.cancelAutoSkip();
                if (onlineState().isOnlineGame) {
                    const sent = dependencies.sendAction(
                        dependencies.actions.BUILD_CARD,
                        { cardName: name }
                    );
                    traceBuildFlow('card-online-send', { cardName: name, sent });
                    return;
                }
                const built = dependencies.runAction(
                    dependencies.actions.BUILD_CARD,
                    { cardName: name },
                    () => {
                        const applied = gameState().game.buildCard(card);
                        if (applied) dependencies.decrementStock(dependencies.shopStock, card);
                        return applied;
                    },
                    { effects: false }
                );
                if (!built) return;
                traceBuildFlow('card-applied', { cardName: name });
                dependencies.playSound('build');
                dependencies.render();
                traceBuildFlow('card-rendered', { cardName: name });
                dependencies.unlockHumanTurn('build-card-human-turn-unlock');
                dependencies.scheduleCpu();
            });
        }

        function onBuildLandmark(name) {
            if (!canRunHumanAction(dependencies.actions.BUILD_LANDMARK)) return;
            traceBuildFlow('landmark-request', { landmarkName: name });
            const cost = dependencies.player.landmarkCost(name);
            const scheduledPlayerIndex = gameState().game.currentPlayerIndex;
            dependencies.showConfirm(
                `${dependencies.getLandmarkEmoji(name)} ${name}を建設しますか？\n💰 ${cost}コイン`,
                () => {
                    traceBuildFlow('landmark-confirmed', { landmarkName: name, scheduledPlayerIndex });
                    if (!canRunHumanAction(dependencies.actions.BUILD_LANDMARK, scheduledPlayerIndex)) {
                        traceBuildFlow('landmark-stale-action', { landmarkName: name, scheduledPlayerIndex });
                        return;
                    }
                    dependencies.saveUndoState();
                    dependencies.cancelAutoSkip();
                    if (onlineState().isOnlineGame) {
                        const sent = dependencies.sendAction(
                            dependencies.actions.BUILD_LANDMARK,
                            { name }
                        );
                        traceBuildFlow('landmark-online-send', { landmarkName: name, sent });
                        return;
                    }
                    const built = dependencies.runAction(
                        dependencies.actions.BUILD_LANDMARK,
                        { name },
                        () => gameState().game.buildLandmark(name),
                        { effects: false }
                    );
                    if (!built) return;
                    traceBuildFlow('landmark-applied', { landmarkName: name });
                    dependencies.playSound('build');
                    dependencies.render();
                    traceBuildFlow('landmark-rendered', { landmarkName: name });
                    dependencies.unlockHumanTurn('build-landmark-human-turn-unlock');
                    dependencies.scheduleCpu();
                }
            );
        }

        function onSkip() {
            dependencies.checkpoint('skip-request');
            if (!canRunHumanAction(dependencies.actions.NEXT_TURN)) {
                dependencies.checkpoint('skip-rejected-gate');
                return;
            }
            const currentGame = gameState().game;
            let message;
            if (currentGame.builtThisTurn) {
                message = '建設完了・ターン終了しますか？';
            } else if (currentGame.currentPlayer().landmarks[dependencies.landmarkNames.AIRPORT]) {
                message = '建設せずにターン終了しますか？\n✈️ 空港効果で+10コイン獲得します';
            } else {
                message = '建設せずにターン終了しますか？';
            }
            const scheduledPlayerIndex = currentGame.currentPlayerIndex;
            dependencies.showConfirm(message, () => {
                dependencies.checkpoint('skip-confirmed', { scheduledPlayerIndex });
                if (!canRunHumanAction(dependencies.actions.NEXT_TURN, scheduledPlayerIndex)) {
                    dependencies.checkpoint('skip-stale-action', { scheduledPlayerIndex });
                    return;
                }
                dependencies.cancelAutoSkip();
                dependencies.clearUndoState();
                const result = dependencies.runAction(
                    dependencies.actions.NEXT_TURN,
                    {},
                    () => gameState().game.nextTurn()
                );
                dependencies.checkpoint('skip-nextTurn-returned', { result });
            });
        }

        return Object.freeze({
            canRunAction,
            canRunHumanAction,
            canRunLocalHumanAction,
            onBuildCard,
            onBuildLandmark,
            onReroll,
            onResolveBusiness,
            onResolveCleaning,
            onResolveHarbor,
            onResolveIT,
            onResolveMover,
            onResolveRenovation,
            onResolveTV,
            onRoll,
            onSelectDiceCount,
            onSkip,
            onSkipReroll,
            traceBuildFlow,
        });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MainHumanActionRuntime;
if (typeof window !== 'undefined') Object.assign(window, { MainHumanActionRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { MainHumanActionRuntime });
