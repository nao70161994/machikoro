'use strict';

function makeActionValidationGateway({
    getRoomCanonicalMirror,
    canSocketSubmitCurrentAction,
    getAllowedActions,
    makeServerDiceActionData,
    validateActionPayloadForState,
}) {
    const dependencies = {
        getRoomCanonicalMirror,
        canSocketSubmitCurrentAction,
        getAllowedActions,
        makeServerDiceActionData,
        validateActionPayloadForState,
    };
    for (const [name, dependency] of Object.entries(dependencies)) {
        if (typeof dependency !== 'function') {
            throw new TypeError(`${name} must be a function`);
        }
    }

    function validateGameAction(room, socket, action, data) {
        const mirror = getRoomCanonicalMirror(room);
        if (!mirror) return { ok: false };
        const { game, cpuPlayers, shopStock } = mirror;
        if (game.checkWinner && game.checkWinner()) return { ok: false };
        if (!canSocketSubmitCurrentAction(room, socket, game, cpuPlayers)) return { ok: false };

        const allowed = getAllowedActions(game);
        if (!allowed.has(action)) return { ok: false };

        const authoritativeData = makeServerDiceActionData(game, action, data);
        return {
            ok: validateActionPayloadForState(room, game, shopStock, action, authoritativeData, {
                undoState: room.lastUndoState || mirror.lastUndoState,
                requireUndoPayload: false,
            }),
            mirror,
            data: authoritativeData,
        };
    }

    return { validateGameAction };
}

module.exports = makeActionValidationGateway;
