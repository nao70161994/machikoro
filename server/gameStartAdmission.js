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

function planGameStart(room, requiredHumanSlots) {
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
    const connectedHumanPlayers = room.players.filter(player => player && player.id !== null).length;
    if (connectedHumanPlayers < requiredHumanSlots) {
        return Object.freeze({
            decision: GAME_START_DECISIONS.SKIP,
            reason: GAME_START_SKIP_REASONS.WAITING_HUMAN_SLOTS,
        });
    }
    if (room.players.some(player => player && player.id !== null && player.ready === false)) {
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
