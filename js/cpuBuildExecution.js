'use strict';

function setBuildActionResult(cpu, result) {
    cpu._lastBuildActionResult = result;
    return result;
}

function onlineBuildBlocked(context = {}) {
    if (!context.isOnlineGame) return false;
    if (!context.isRoomHost) return true;
    if (context.isReconnectingOnline) return true;
    return context.socketConnected === false;
}

function buyCard(cpu, card, game, shopStock, context = {}) {
    if (!game || game.builtThisTurn || !card) return setBuildActionResult(cpu, false);
    if (onlineBuildBlocked(context)) return setBuildActionResult(cpu, false);
    if (!shopStock || (shopStock[card.name] || 0) <= 0) return setBuildActionResult(cpu, false);
    if (context.isOnlineGame) {
        return setBuildActionResult(
            cpu,
            typeof context.sendAction === 'function' &&
                context.sendAction('buildCard', { cardName: card.name }) === true
        );
    }
    if (game.buildCard(card)) {
        shopStock[card.name]--;
        return setBuildActionResult(cpu, true);
    }
    return setBuildActionResult(cpu, false);
}

function buyLandmark(cpu, name, game, context = {}) {
    if (!game || game.builtThisTurn || !name) return setBuildActionResult(cpu, false);
    if (onlineBuildBlocked(context)) return setBuildActionResult(cpu, false);
    if (context.isOnlineGame) {
        return setBuildActionResult(
            cpu,
            typeof context.sendAction === 'function' &&
                context.sendAction('buildLandmark', { name }) === true
        );
    }
    return setBuildActionResult(cpu, game.buildLandmark(name) === true);
}

const CPUBuildExecution = Object.freeze({
    setBuildActionResult,
    onlineBuildBlocked,
    buyCard,
    buyLandmark,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUBuildExecution };
}
if (typeof window !== 'undefined') window.CPUBuildExecution = CPUBuildExecution;
if (typeof globalThis !== 'undefined') globalThis.CPUBuildExecution = CPUBuildExecution;
