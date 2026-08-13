'use strict';

const ONLINE_REMATCH_EVENTS = Object.freeze({
    REQUEST: 'requestOnlineRematch',
    STATUS: 'onlineRematchStatus',
    IDENTITY: 'onlineRematchIdentity',
});
const ONLINE_REMATCH_TIMEOUT_MS = 60 * 1000;

function connectedHumanPlayers(room) {
    return Array.isArray(room?.players)
        ? room.players.filter(player => player && player.id)
        : [];
}

function createOnlineRematchRuntime(dependencies = {}) {
    const required = [
        'rooms', 'io', 'emitAppError', 'requirePlainSocketPayload',
        'isActiveRoomSocket', 'generateReconnectToken', 'hashReconnectToken',
        'buildGameStartPayload', 'markRoomGameStarted',
    ];
    for (const name of required) {
        if (dependencies[name] == null) throw new TypeError(`${name} is required`);
    }
    const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now;
    const setTimeoutFn = typeof dependencies.setTimeoutFn === 'function'
        ? dependencies.setTimeoutFn : setTimeout;
    const clearTimeoutFn = typeof dependencies.clearTimeoutFn === 'function'
        ? dependencies.clearTimeoutFn : clearTimeout;
    const persistRollback = typeof dependencies.persistRoomCanonicalState === 'function'
        ? dependencies.persistRoomCanonicalState : (() => {});
    const sessions = new Map();

    function clear(roomId, reason = '') {
        const session = sessions.get(roomId);
        if (!session) return false;
        clearTimeoutFn(session.timer);
        sessions.delete(roomId);
        if (reason) dependencies.io.to(roomId).emit(ONLINE_REMATCH_EVENTS.STATUS, {
            state: 'cancelled', reason,
        });
        return true;
    }

    function begin(roomId, room) {
        const session = { votes: new Set(), createdAt: now(), timer: null };
        session.timer = setTimeoutFn(() => clear(roomId, 'timeout'), ONLINE_REMATCH_TIMEOUT_MS);
        if (session.timer && typeof session.timer.unref === 'function') session.timer.unref();
        sessions.set(roomId, session);
        return session;
    }

    function hasWinner(room) {
        return !!(room?.canonicalMirror?.game?.checkWinner &&
            room.canonicalMirror.game.checkWinner());
    }

    function start(roomId, room, session) {
        const humans = connectedHumanPlayers(room);
        const generation = Number.isSafeInteger(room.gameGeneration) && room.gameGeneration >= 0
            ? room.gameGeneration + 1 : 1;
        if (!Number.isSafeInteger(generation)) return false;
        const identities = humans.map(player => {
            const reconnectToken = dependencies.generateReconnectToken();
            const hadTokenHash = Object.prototype.hasOwnProperty.call(player, 'reconnectTokenHash');
            const previousTokenHash = player.reconnectTokenHash ||
                dependencies.hashReconnectToken(player.reconnectToken);
            return {
                player,
                reconnectToken,
                reconnectTokenHash: dependencies.hashReconnectToken(reconnectToken),
                previousToken: player.reconnectToken,
                hadTokenHash,
                previousTokenHash,
                hadPreviousGraceHash: Object.prototype.hasOwnProperty.call(
                    player, 'previousReconnectTokenHash'
                ),
                previousGraceHash: player.previousReconnectTokenHash,
                hadPreviousGraceGeneration: Object.prototype.hasOwnProperty.call(
                    player, 'previousReconnectTokenGeneration'
                ),
                previousGraceGeneration: player.previousReconnectTokenGeneration,
            };
        });
        const previousRoomState = { ...room };
        const restorePreviousState = () => {
            for (const key of Object.keys(room)) {
                if (!Object.prototype.hasOwnProperty.call(previousRoomState, key)) delete room[key];
            }
            Object.assign(room, previousRoomState);
            for (const identity of identities) {
                identity.player.reconnectToken = identity.previousToken;
                if (identity.hadTokenHash) {
                    identity.player.reconnectTokenHash = identity.previousTokenHash;
                } else {
                    delete identity.player.reconnectTokenHash;
                }
                if (identity.hadPreviousGraceHash) {
                    identity.player.previousReconnectTokenHash = identity.previousGraceHash;
                } else {
                    delete identity.player.previousReconnectTokenHash;
                }
                if (identity.hadPreviousGraceGeneration) {
                    identity.player.previousReconnectTokenGeneration = identity.previousGraceGeneration;
                } else {
                    delete identity.player.previousReconnectTokenGeneration;
                }
            }
        };
        for (const identity of identities) {
            identity.player.previousReconnectTokenHash = identity.previousTokenHash;
            identity.player.previousReconnectTokenGeneration = room.gameGeneration;
            identity.player.reconnectToken = identity.reconnectToken;
            identity.player.reconnectTokenHash = identity.reconnectTokenHash;
        }
        room.gameGeneration = generation;
        room.hostEpoch = 0;
        room.actionSeq = 0;
        room.acceptedClientActions = {};
        room.fullActionLog = [];
        room.started = false;
        room.gameStartPayload = null;
        let payload;
        try {
            payload = dependencies.buildGameStartPayload(dependencies.io, room);
        } catch (_) {
            payload = null;
        }
        if (!payload) {
            restorePreviousState();
            clear(roomId, 'start-failed');
            return false;
        }
        payload.gameGeneration = generation;
        try {
            dependencies.markRoomGameStarted(room, payload, now());
        } catch (_) {
            restorePreviousState();
            try { persistRollback(roomId, room, 'online-rematch-start-rollback', now()); } catch (_) {}
            clear(roomId, 'start-failed');
            return false;
        }
        for (const identity of identities) {
            try {
                const target = dependencies.io.sockets.sockets.get(identity.player.id);
                if (target) target.emit(ONLINE_REMATCH_EVENTS.IDENTITY, {
                    roomId,
                    playerIndex: identity.player.index,
                    reconnectToken: identity.reconnectToken,
                    gameGeneration: generation,
                });
            } catch (_) {}
        }
        try {
            dependencies.io.to(roomId).emit('gameStart', payload);
        } catch (_) {
            // The new generation is already canonical. Clients that missed delivery
            // recover with the immediately previous token grace during rejoin.
        }
        clearTimeoutFn(session.timer);
        sessions.delete(roomId);
        return true;
    }

    function request(socket, payload) {
        if (!dependencies.requirePlainSocketPayload(socket, payload)) return false;
        const roomId = socket.roomId;
        const room = roomId && dependencies.rooms[roomId];
        if (!room || !room.started || !dependencies.isActiveRoomSocket(room, socket) || !hasWinner(room)) {
            dependencies.emitAppError(socket, 'REMATCH_UNAVAILABLE');
            return false;
        }
        if (payload.approved === false) {
            clear(roomId, 'rejected');
            return true;
        }
        if (payload.approved !== true) {
            dependencies.emitAppError(socket, 'REMATCH_INVALID_VOTE');
            return false;
        }
        const humans = connectedHumanPlayers(room);
        if (humans.length !== room.players.length) {
            dependencies.emitAppError(socket, 'REMATCH_PLAYERS_MISSING');
            return false;
        }
        const session = sessions.get(roomId) || begin(roomId, room);
        session.votes.add(socket.playerIndex);
        dependencies.io.to(roomId).emit(ONLINE_REMATCH_EVENTS.STATUS, {
            state: 'voting', votes: session.votes.size, required: humans.length,
        });
        if (session.votes.size === humans.length) return start(roomId, room, session);
        return true;
    }

    function registerSocket(socket) {
        socket.on(ONLINE_REMATCH_EVENTS.REQUEST, payload => request(socket, payload));
    }

    return Object.freeze({ events: ONLINE_REMATCH_EVENTS, registerSocket, request, clear });
}

module.exports = Object.freeze({
    ONLINE_REMATCH_EVENTS,
    ONLINE_REMATCH_TIMEOUT_MS,
    connectedHumanPlayers,
    createOnlineRematchRuntime,
});
