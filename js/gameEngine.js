'use strict';

// Transitional shared execution boundary. GameManager remains mutable today; callers
// inject persistence/inventory adapters so this table can move behind a pure
// snapshot -> action -> snapshot API without duplicating action semantics again.
const GAME_ACTION_HANDLERS = Object.freeze({
    rollDice(context, data) {
        context.game.rollDice(data.forceDice, data.tunaDice);
        return true;
    },
    selectDice(context, data) {
        context.game.selectDiceCount(data.useTwo, data.d1, data.d2, data.tunaDice);
        return true;
    },
    skipReroll(context) {
        context.game.skipReroll();
        return true;
    },
    rerollDice(context, data) {
        context.game.rerollDice(data.forceDice, data.tunaDice);
        return true;
    },
    resolveHarbor(context, data) {
        return context.game.resolveHarbor(data.useBonus) !== false;
    },
    resolveTV(context, data) {
        return context.game.resolveTV(data.targetIndex) !== false;
    },
    resolveBusiness(context, data) {
        return context.game.resolveBusiness(data.myCard, data.targetIndex, data.theirCard) !== false;
    },
    resolveCleaning(context, data) {
        return context.game.resolveCleaning(data.cardName) !== false;
    },
    resolveMover(context, data) {
        return context.game.resolveMover(data.cardIndex ?? data.cardName, data.targetIndex) !== false;
    },
    resolveRenovation(context, data) {
        return context.game.resolveRenovation(data.landmarkName) !== false;
    },
    resolveIT(context, data) {
        return context.game.resolveIT(data.doSave) !== false;
    },
    buildCard(context, data) {
        if (typeof context.createCardByName !== 'function' ||
                typeof context.decrementShopStock !== 'function') return false;
        const card = context.createCardByName(data.cardName);
        if (!card || !context.game.buildCard(card)) return false;
        context.decrementShopStock(context.shopStock, card);
        return true;
    },
    buildLandmark(context, data) {
        return context.game.buildLandmark(data.name) !== false;
    },
    undoBuild(context, data) {
        if (typeof context.restoreUndoState !== 'function') return false;
        return context.restoreUndoState(data.state) !== false;
    },
    nextTurn(context) {
        return context.game.nextTurn() !== false;
    },
});

const GAME_ENGINE_HANDLED_ACTIONS = Object.freeze(Object.keys(GAME_ACTION_HANDLERS));

/**
 * Applies one already-canonicalized action to the current mutable GameManager.
 * Validation and actor authority remain adapter responsibilities.
 *
 * @param {Object} context
 * @returns {boolean} whether the action was handled successfully
 */
function applyMutableAction(context) {
    if (!context || !context.game || !context.data ||
            typeof context.data !== 'object' || Array.isArray(context.data)) return false;
    const handler = GAME_ACTION_HANDLERS[context.action];
    if (!handler) return false;
    return handler(context, context.data);
}

const GameEngine = Object.freeze({
    handledActions: GAME_ENGINE_HANDLED_ACTIONS,
    applyMutableAction,
});

if (typeof module !== 'undefined' && module.exports) module.exports = GameEngine;
if (typeof window !== 'undefined') window.GameEngine = GameEngine;
if (typeof globalThis !== 'undefined') globalThis.GameEngine = GameEngine;
