'use strict';

const SERVER_AUTHORITATIVE_DICE_ACTIONS = Object.freeze({
    rollDice: true,
    selectDice: true,
    rerollDice: true,
});

module.exports = function makeServerDice(options = {}) {
    const { isPlainObject, stationName, rollDie } = options;

    function isServerAuthoritativeDiceAction(action) {
        return !!SERVER_AUTHORITATIVE_DICE_ACTIONS[action];
    }

    function makeServerDiceActionData(game, action, data, actionRollDie = rollDie) {
        if (!isPlainObject(data) || !isServerAuthoritativeDiceAction(action)) return data;
        const tunaDice = () => [actionRollDie(), actionRollDie()];
        if (action === 'rollDice') {
            if (game.currentPlayer().landmarks[stationName]) {
                return { forceDice: null, tunaDice: null };
            }
            return { forceDice: actionRollDie(), tunaDice: tunaDice() };
        }
        if (action === 'selectDice') {
            if (typeof data.useTwo !== 'boolean') return data;
            return {
                useTwo: data.useTwo,
                diceCount: data.useTwo ? 2 : 1,
                d1: actionRollDie(),
                d2: data.useTwo ? actionRollDie() : 0,
                tunaDice: tunaDice(),
            };
        }
        if (action === 'rerollDice') {
            return { forceDice: actionRollDie(), tunaDice: tunaDice() };
        }
        return data;
    }

    return Object.freeze({
        SERVER_AUTHORITATIVE_DICE_ACTIONS,
        isServerAuthoritativeDiceAction,
        makeServerDiceActionData,
    });
};
