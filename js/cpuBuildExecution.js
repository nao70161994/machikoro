'use strict';

const CPUActionProposalApi = typeof module !== 'undefined' && module.exports
    ? require('./cpuActionProposal').CPUActionProposal
    : globalThis.CPUActionProposal;
const CPUGameEngineApi = typeof module !== 'undefined' && module.exports
    ? require('./gameEngine')
    : globalThis.GameEngine;

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
    if (!card || typeof card.name !== 'string' || !card.name || !CPUActionProposalApi) return null;
    return CPUActionProposalApi.create('buildCard', { cardName: card.name });
}

/**
 * @param {string} name
 * @returns {CPUBuildActionProposal|null}
 */
function createLandmarkBuildAction(name) {
    if (typeof name !== 'string' || !name || !CPUActionProposalApi) return null;
    return CPUActionProposalApi.create('buildLandmark', { name });
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

/**
 * Applies one previously selected canonical build proposal.
 * @param {Object} cpu
 * @param {CPUBuildActionProposal|null} proposal
 * @param {Object} game
 * @param {Object} shopStock
 * @param {Object} context
 * @returns {boolean}
 */
function executeAction(cpu, proposal, game, shopStock, context = {}) {
    if (!proposal || typeof proposal !== 'object') return setBuildActionResult(cpu, false);
    const applyMutableAction = typeof context.applyMutableAction === 'function'
        ? context.applyMutableAction
        : CPUGameEngineApi && CPUGameEngineApi.applyMutableAction;
    if (!context.isOnlineGame && typeof applyMutableAction === 'function') {
        if (!game || game.builtThisTurn) return setBuildActionResult(cpu, false);
        if (proposal.action === 'buildCard') {
            const cardName = proposal.data && proposal.data.cardName;
            if (!cardName || !shopStock || (shopStock[cardName] || 0) <= 0 ||
                    typeof context.resolveCard !== 'function') {
                return setBuildActionResult(cpu, false);
            }
        } else if (proposal.action === 'buildLandmark') {
            if (!proposal.data || !proposal.data.name) return setBuildActionResult(cpu, false);
        } else {
            return setBuildActionResult(cpu, false);
        }
        const shadow = typeof context.prepareLocalAction === 'function'
            ? context.prepareLocalAction(proposal.action, proposal.data)
            : null;
        const applied = applyMutableAction({
            game,
            shopStock,
            action: proposal.action,
            data: proposal.data,
            createCardByName: context.resolveCard,
            decrementShopStock(stock, card) {
                stock[card.name]--;
            },
        }) === true;
        if (typeof context.finishLocalAction === 'function') {
            context.finishLocalAction(shadow);
        }
        return setBuildActionResult(cpu, applied);
    }
    if (proposal.action === 'buildCard') {
        const cardName = proposal.data && proposal.data.cardName;
        const card = typeof context.resolveCard === 'function'
            ? context.resolveCard(cardName)
            : null;
        return buyCard(cpu, card, game, shopStock, context);
    }
    if (proposal.action === 'buildLandmark') {
        return buyLandmark(cpu, proposal.data && proposal.data.name, game, context);
    }
    return setBuildActionResult(cpu, false);
}

const CPUBuildExecution = Object.freeze({
    setBuildActionResult,
    onlineBuildBlocked,
    createCardBuildAction,
    createLandmarkBuildAction,
    buyCard,
    buyLandmark,
    executeAction,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUBuildExecution };
}
if (typeof window !== 'undefined') window.CPUBuildExecution = CPUBuildExecution;
if (typeof globalThis !== 'undefined') globalThis.CPUBuildExecution = CPUBuildExecution;
