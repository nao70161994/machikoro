'use strict';

const GAME_START_DECISIONS = Object.freeze({
    SKIP: 'skip',
    START: 'start',
});

const GAME_START_SKIP_REASONS = Object.freeze({
    MISSING_ROOM: 'missing-room',
    ALREADY_STARTED: 'already-started',
    WAITING_HUMAN_SLOTS: 'waiting-human-slots',
    WAITING_READY_PLAYERS: 'waiting-ready-players',
});

/** @param {any} room @param {number} requiredHumanSlots @param {(socketId: string) => boolean} [isSocketConnected] */
function planGameStart(room, requiredHumanSlots, isSocketConnected = () => true) {
    if (!room) {
        return Object.freeze({
            decision: GAME_START_DECISIONS.SKIP,
            reason: GAME_START_SKIP_REASONS.MISSING_ROOM,
        });
    }
    if (room.started) {
        return Object.freeze({
            decision: GAME_START_DECISIONS.SKIP,
            reason: GAME_START_SKIP_REASONS.ALREADY_STARTED,
        });
    }
    const connectedHumanPlayers = room.players.filter(player =>
        player && typeof player.id === 'string' && player.id !== '' &&
            isSocketConnected(player.id)
    ).length;
    if (connectedHumanPlayers < requiredHumanSlots) {
        return Object.freeze({
            decision: GAME_START_DECISIONS.SKIP,
            reason: GAME_START_SKIP_REASONS.WAITING_HUMAN_SLOTS,
        });
    }
    if (room.players.some(player => player && typeof player.id === 'string' &&
            player.id !== '' && isSocketConnected(player.id) && player.ready === false)) {
        return Object.freeze({
            decision: GAME_START_DECISIONS.SKIP,
            reason: GAME_START_SKIP_REASONS.WAITING_READY_PLAYERS,
        });
    }
    return Object.freeze({
        decision: GAME_START_DECISIONS.START,
        room,
    });
}

module.exports = {
    GAME_START_DECISIONS,
    GAME_START_SKIP_REASONS,
    planGameStart,
};
