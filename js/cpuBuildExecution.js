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

/**
 * @typedef {Object} CPUBuildActionProposal
 * @property {'buildCard'|'buildLandmark'} action
 * @property {Object} data
 */

/**
 * @param {{name: string}|null} card
 * @returns {CPUBuildActionProposal|null}
 */
function createCardBuildAction(card) {
    if (!card || typeof card.name !== 'string' || !card.name) return null;
    return Object.freeze({
        action: 'buildCard',
        data: Object.freeze({ cardName: card.name }),
    });
}

/**
 * @param {string} name
 * @returns {CPUBuildActionProposal|null}
 */
function createLandmarkBuildAction(name) {
    if (typeof name !== 'string' || !name) return null;
    return Object.freeze({
        action: 'buildLandmark',
        data: Object.freeze({ name }),
    });
}

function buyCard(cpu, card, game, shopStock, context = {}) {
    if (!game || game.builtThisTurn || !card) return setBuildActionResult(cpu, false);
    if (onlineBuildBlocked(context)) return setBuildActionResult(cpu, false);
    if (!shopStock || (shopStock[card.name] || 0) <= 0) return setBuildActionResult(cpu, false);
    const proposal = createCardBuildAction(card);
    if (!proposal) return setBuildActionResult(cpu, false);
    if (context.isOnlineGame) {
        return setBuildActionResult(
            cpu,
            typeof context.sendAction === 'function' &&
                context.sendAction(proposal.action, proposal.data) === true
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
    const proposal = createLandmarkBuildAction(name);
    if (!proposal) return setBuildActionResult(cpu, false);
    if (context.isOnlineGame) {
        return setBuildActionResult(
            cpu,
            typeof context.sendAction === 'function' &&
                context.sendAction(proposal.action, proposal.data) === true
        );
    }
    return setBuildActionResult(cpu, game.buildLandmark(name) === true);
}

const CPUBuildExecution = Object.freeze({
    setBuildActionResult,
    onlineBuildBlocked,
    createCardBuildAction,
    createLandmarkBuildAction,
    buyCard,
    buyLandmark,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUBuildExecution };
}
if (typeof window !== 'undefined') window.CPUBuildExecution = CPUBuildExecution;
if (typeof globalThis !== 'undefined') globalThis.CPUBuildExecution = CPUBuildExecution;
