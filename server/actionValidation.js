'use strict';

function makeActionValidation({ gameRuntime }) {
    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function isNonEmptyString(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }

    function isPlayerIndex(value, game) {
        return Number.isInteger(value) && value >= 0 && value < game.players.length;
    }

    function hasPendingAction(game, action) {
        return gameRuntime.GameManager.pendingActionsFor(game)
            .some(pending => pending.action === action);
    }

    function validateBusinessPayload(game, data) {
        if (!hasPendingAction(game, 'resolveBusiness') || !isPlainObject(data)) return false;
        const { myCard, targetIndex, theirCard } = data;
        if (!isPlayerIndex(targetIndex, game)) {
            return false;
        }
        if (targetIndex === game.currentPlayerIndex) return false;
        if (!Number.isInteger(myCard) || !Number.isInteger(theirCard)) return false;
        const current = game.currentPlayer();
        const target = game.players[targetIndex];
        return !!game._resolveCardRef(current, myCard) &&
            !!game._resolveCardRef(target, theirCard);
    }

    function validateCleaningPayload(game, data) {
        if (!hasPendingAction(game, 'resolveCleaning') || !isPlainObject(data)) return false;
        if (!isNonEmptyString(data.cardName)) return false;
        const targetCard = gameRuntime.createCardByName(data.cardName);
        if (!targetCard || targetCard.category === gameRuntime.CARD_CATEGORIES.MAJOR) return false;
        return game.players.some(player =>
            player.cards.some(card => card.name === data.cardName && card.category !== gameRuntime.CARD_CATEGORIES.MAJOR && !player.isDormant(card))
        );
    }

    function validateMoverPayload(game, data) {
        if (!hasPendingAction(game, 'resolveMover') || !isPlainObject(data)) return false;
        const cardRef = Number.isInteger(data.cardIndex) ? data.cardIndex : data.cardName;
        const { targetIndex } = data;
        if (!isPlayerIndex(targetIndex, game)) return false;
        if (targetIndex === game.currentPlayerIndex) return false;
        if (!Number.isInteger(cardRef) && !isNonEmptyString(cardRef)) return false;
        const current = game.currentPlayer();
        return !!game._resolveCardRef(current, cardRef);
    }

    function validateRenovationPayload(game, data) {
        if (!hasPendingAction(game, 'resolveRenovation') || !isPlainObject(data)) return false;
        if (!isNonEmptyString(data.landmarkName)) return false;
        const current = game.currentPlayer();
        if (!Object.prototype.hasOwnProperty.call(current.landmarks, data.landmarkName)) return false;
        return current.landmarks[data.landmarkName] === true;
    }

    function isValidDieValue(value) {
        return Number.isInteger(value) && value >= 1 && value <= 6;
    }

    function validateTunaDiceFromData(data) {
        if (!isPlainObject(data) || !Object.prototype.hasOwnProperty.call(data, 'tunaDice') || data.tunaDice == null) {
            return true;
        }
        return Array.isArray(data.tunaDice) &&
            data.tunaDice.length === 2 &&
            data.tunaDice.every(isValidDieValue);
    }

    function validateRollDicePayload(data, game = null) {
        if (!isPlainObject(data)) return false;
        if (data.forceDice == null) {
            return !!game &&
                !!game.currentPlayer().landmarks[gameRuntime.LANDMARK_NAMES.STATION] &&
                validateTunaDiceFromData(data);
        }
        if (!isValidDieValue(data.forceDice)) return false;
        return validateTunaDiceFromData(data);
    }

    function validateSelectDicePayload(data) {
        if (!isPlainObject(data)) return false;
        if (typeof data.useTwo !== 'boolean') return false;
        const hasDiceCount = Object.prototype.hasOwnProperty.call(data, 'diceCount');
        const diceCount = hasDiceCount ? data.diceCount : (data.useTwo ? 2 : 1);
        if (diceCount !== 1 && diceCount !== 2) return false;
        if (hasDiceCount && data.useTwo !== (diceCount === 2)) return false;
        if (!isValidDieValue(data.d1)) return false;
        if (diceCount === 2) {
            if (!isValidDieValue(data.d2)) return false;
        } else if (Object.prototype.hasOwnProperty.call(data, 'd2') && data.d2 != null && data.d2 !== 0 && !isValidDieValue(data.d2)) {
            return false;
        }
        return validateTunaDiceFromData(data);
    }

    function validateRerollDicePayload(data) {
        if (!isPlainObject(data) || !isValidDieValue(data.forceDice)) return false;
        return validateTunaDiceFromData(data);
    }

    function validateResolveHarborPayload(data) {
        return isPlainObject(data) && typeof data.useBonus === 'boolean';
    }

    function validateResolveITPayload(data) {
        return isPlainObject(data) && typeof data.doSave === 'boolean';
    }

    function validateResolveTVPayload(game, data) {
        return isPlainObject(data) &&
            Number.isInteger(data.targetIndex) &&
            data.targetIndex >= 0 &&
            data.targetIndex < game.players.length &&
            data.targetIndex !== game.currentPlayerIndex;
    }

    function validateBuildCardPayload(room, game, shopStock, data) {
        const cardName = data?.cardName;
        const enabledCards = new Set(room.gameStartPayload?.enabledCards || gameRuntime.CARDS.map(c => c.name));
        const card = gameRuntime.createCardByName(cardName);
        const current = game.currentPlayer();
        return !!card &&
            enabledCards.has(cardName) &&
            gameRuntime.getShopStockCount(shopStock, card) > 0 &&
            !game.builtThisTurn &&
            current.coins >= card.cost &&
            !(card.color === 'purple' && current.countCardIncludingDormantById(card.id) > 0);
    }

    function validateBuildLandmarkPayload(room, game, data) {
        const name = data?.name;
        const enabledLandmarks = new Set(room.gameStartPayload?.enabledLandmarks || gameRuntime.Player.landmarkNames());
        const current = game.currentPlayer();
        const cost = gameRuntime.Player.landmarkCost(name);
        return gameRuntime.Player.isKnownLandmark(name) &&
            enabledLandmarks.has(name) &&
            !game.builtThisTurn &&
            !current.landmarks[name] &&
            current.coins >= cost;
    }

    // Payload-only validator. Actor authority and phase/action allowance must be checked by the caller.
    function validateActionPayloadForState(room, game, shopStock, action, data, options = {}) {
        if (action === 'rollDice') return validateRollDicePayload(data, game);
        if (action === 'selectDice') return validateSelectDicePayload(data);
        if (action === 'rerollDice') return validateRerollDicePayload(data);
        if (action === 'skipReroll') return isPlainObject(data);
        if (action === 'resolveHarbor') return validateResolveHarborPayload(data);
        if (action === 'resolveTV') return validateResolveTVPayload(game, data);
        if (action === 'resolveBusiness') return validateBusinessPayload(game, data);
        if (action === 'resolveCleaning') return validateCleaningPayload(game, data);
        if (action === 'resolveMover') return validateMoverPayload(game, data);
        if (action === 'resolveRenovation') return validateRenovationPayload(game, data);
        if (action === 'resolveIT') return validateResolveITPayload(data);
        if (action === 'buildCard') return validateBuildCardPayload(room, game, shopStock, data);
        if (action === 'buildLandmark') return validateBuildLandmarkPayload(room, game, data);
        if (action === 'undoBuild') {
            return !!options.undoState &&
                game.builtThisTurn &&
                (!options.requireUndoPayload || isPlainObject(data));
        }
        if (action === 'nextTurn') return isPlainObject(data);
        return false;
    }

    function getAllowedActions(game) {
        return gameRuntime.GameManager.allowedActionsFor(game);
    }

    return {
        isPlainObject,
        isNonEmptyString,
        isPlayerIndex,
        hasPendingAction,
        validateBusinessPayload,
        validateCleaningPayload,
        validateMoverPayload,
        validateRenovationPayload,
        isValidDieValue,
        validateTunaDiceFromData,
        validateRollDicePayload,
        validateSelectDicePayload,
        validateRerollDicePayload,
        validateResolveHarborPayload,
        validateResolveITPayload,
        validateResolveTVPayload,
        validateBuildCardPayload,
        validateBuildLandmarkPayload,
        validateActionPayloadForState,
        getAllowedActions,
    };
}

module.exports = makeActionValidation;
