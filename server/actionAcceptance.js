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

function makeRoomActionSequence(resolveRestoreRank) {
    if (typeof resolveRestoreRank !== 'function') {
        throw new TypeError('resolveRestoreRank must be a function');
    }
    function planNext(room) {
        const current = Number.isInteger(room.actionSeq)
            ? room.actionSeq
            : resolveRestoreRank(room.gameStartPayload, room.stateSnapshot, room.actionLog).actionSeq;
        return current + 1;
    }
    function commit(room, actionSeq) {
        if (!room || !Number.isSafeInteger(actionSeq) || actionSeq < 1) return false;
        room.actionSeq = actionSeq;
        if (room.gameStartPayload && typeof room.gameStartPayload === 'object') {
            room.gameStartPayload.actionSeq = actionSeq;
        }
        return true;
    }
    return Object.freeze({ planNext, commit });
}

function makeNextRoomActionSeq(resolveRestoreRank) {
    const sequence = makeRoomActionSequence(resolveRestoreRank);
    return function nextRoomActionSeq(room) {
        const actionSeq = sequence.planNext(room);
        sequence.commit(room, actionSeq);
        return actionSeq;
    };
}

module.exports = {
    MAX_ACCEPTED_CLIENT_ACTIONS,
    acceptedClientActionKey,
    findAcceptedClientAction,
    rememberAcceptedClientAction,
    acceptedClientActionRefs,
    makeRoomActionSequence,
    makeNextRoomActionSeq,
};
