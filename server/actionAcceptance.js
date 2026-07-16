'use strict';

const MAX_ACCEPTED_CLIENT_ACTIONS = 100;

function acceptedClientActionKey(playerIndex, clientActionId) {
    return `${playerIndex}:${clientActionId}`;
}

function findAcceptedClientAction(room, clientActionId, playerIndex) {
    if (!room || typeof clientActionId !== 'string' || !clientActionId || !Number.isInteger(playerIndex)) return null;
    const matchesPlayer = entry => entry && entry.clientActionId === clientActionId && entry.playerIndex === playerIndex;
    const key = acceptedClientActionKey(playerIndex, clientActionId);
    if (room.acceptedClientActions && matchesPlayer(room.acceptedClientActions[key])) {
        return room.acceptedClientActions[key];
    }
    if (room.acceptedClientActions && matchesPlayer(room.acceptedClientActions[clientActionId])) {
        return room.acceptedClientActions[clientActionId];
    }
    return (room.actionLog || []).find(matchesPlayer) || null;
}

function rememberAcceptedClientAction(room, actionEntry) {
    if (!room || !actionEntry || typeof actionEntry.clientActionId !== 'string' || !actionEntry.clientActionId || !Number.isInteger(actionEntry.playerIndex)) return;
    if (!room.acceptedClientActions) room.acceptedClientActions = {};
    room.acceptedClientActions[acceptedClientActionKey(actionEntry.playerIndex, actionEntry.clientActionId)] = actionEntry;
    const ids = Object.keys(room.acceptedClientActions);
    if (ids.length > MAX_ACCEPTED_CLIENT_ACTIONS) {
        ids.sort((a, b) => (room.acceptedClientActions[a].seq || 0) - (room.acceptedClientActions[b].seq || 0));
        for (const id of ids.slice(0, ids.length - MAX_ACCEPTED_CLIENT_ACTIONS)) delete room.acceptedClientActions[id];
    }
}

function acceptedClientActionRefs(room) {
    if (!room || !room.acceptedClientActions) return [];
    return Object.values(room.acceptedClientActions)
        .filter(entry => entry && typeof entry.clientActionId === 'string' && Number.isInteger(entry.playerIndex))
        .map(entry => {
            const ref = { playerIndex: entry.playerIndex, clientActionId: entry.clientActionId };
            if (Number.isInteger(entry.seq)) ref.seq = entry.seq;
            return ref;
        });
}

module.exports = {
    MAX_ACCEPTED_CLIENT_ACTIONS,
    acceptedClientActionKey,
    findAcceptedClientAction,
    rememberAcceptedClientAction,
    acceptedClientActionRefs,
};
