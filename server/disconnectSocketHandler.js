'use strict';

const EXPLICIT_LEAVE_REASONS = new Set([
    'client namespace disconnect',
    'server namespace disconnect',
]);

function pruneExpiredWaitingReservations(room, now = Date.now()) {
    if (!room || room.started || !Array.isArray(room.players)) return [];
    const removed = [];
    room.players = room.players.filter(player => {
        const expired = player && !player.id &&
            Number.isFinite(player.reservedUntil) && player.reservedUntil <= now;
        if (expired) removed.push(player);
        return !expired;
    });
    return removed;
}

function reserveWaitingPlayer(room, socket, now, ttlMs) {
    if (!room || room.started || !socket || !Number.isFinite(now) ||
        !Number.isFinite(ttlMs) || ttlMs <= 0) return null;
    const player = room.players.find(candidate => candidate &&
        candidate.id === socket.id && candidate.index === socket.playerIndex);
    if (!player) return null;
    player.id = null;
    player.reservedUntil = now + ttlMs;
    room.lastTouchedAt = now;
    return player;
}

function isWaitingReservation(player, now = Date.now()) {
    return !!(player && !player.id && Number.isFinite(player.reservedUntil) &&
        player.reservedUntil > now);
}

function shouldRemoveWaitingPlayerImmediately(reason) {
    return EXPLICIT_LEAVE_REASONS.has(reason);
}

function createDisconnectSocketHandler(dependencies) {
    const {
        io,
        rooms,
        buildPlayerList,
        buildLobbyState,
        getRemainingConnectedPlayers,
        setRoomHostPlayerIndex,
        emitRoomHostChanged,
        persistRoomCanonicalState,
        disconnectHostlessRestore,
        cancelOnlineRematch = () => false,
        waitingReservationTtlMs,
        reserveWaitingPlayer: reserveWaitingPlayerEffect = reserveWaitingPlayer,
        shouldRemoveWaitingPlayerImmediately: shouldRemoveWaitingPlayerImmediatelyEffect = shouldRemoveWaitingPlayerImmediately,
    } = dependencies;
    const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now;
    const log = typeof dependencies.log === 'function' ? dependencies.log : console.log;
    const logError = typeof dependencies.logError === 'function' ? dependencies.logError : console.error;

    function removeWaitingRoomSocket(targetIo, roomId, room, socket) {
        room.players = room.players.filter(player => player.id !== socket.id);
        if (room.players.length === 0) {
            delete rooms[roomId];
            return { removedRoom: true };
        }
        const playerList = buildPlayerList(room);
        targetIo.to(roomId).emit('playerList', playerList, buildLobbyState(room));
        return { removedRoom: false, playerList };
    }

    function reserveWaitingRoomSocket(targetIo, roomId, room, socket) {
        const player = reserveWaitingPlayerEffect(room, socket, now(), waitingReservationTtlMs);
        if (!player) return { ignored: true };
        if (socket.playerIndex === room.hostPlayerIndex) {
            const remaining = getRemainingConnectedPlayers(room, targetIo.sockets.sockets, socket.id)
                .sort((left, right) => left.index - right.index);
            if (remaining.length > 0) {
                setRoomHostPlayerIndex(room, remaining[0].index);
                emitRoomHostChanged(roomId, room, targetIo);
            }
        }
        const playerList = buildPlayerList(room);
        targetIo.to(roomId).emit('playerList', playerList, buildLobbyState(room));
        return { ignored: false, player, playerList };
    }

    function handleStartedRoomSocketDisconnect(targetIo, roomId, room, socket) {
        const disconnectedPlayer = room.players.find(player => player.index === socket.playerIndex);
        if (!disconnectedPlayer || disconnectedPlayer.id !== socket.id) return { ignored: true };
        disconnectedPlayer.id = null;
        room.lastTouchedAt = now();
        targetIo.to(roomId).emit('playerDisconnected', {
            playerIndex: socket.playerIndex,
            playerName: disconnectedPlayer.name || `プレイヤー${socket.playerIndex + 1}`,
        });
        if (socket.playerIndex === room.hostPlayerIndex) {
            const remaining = getRemainingConnectedPlayers(room, targetIo.sockets.sockets, socket.id);
            if (remaining.length > 0) {
                setRoomHostPlayerIndex(room, remaining[0].index);
                emitRoomHostChanged(roomId, room, targetIo);
                persistRoomCanonicalState(roomId, room, 'host-changed');
                log(`ホスト移譲: ${roomId} → プレイヤー${room.hostPlayerIndex}`);
                return { ignored: false, hostChanged: true, playerIndex: socket.playerIndex };
            }
        }
        return { ignored: false, hostChanged: false, playerIndex: socket.playerIndex };
    }

    function handleSocketDisconnect(targetIo, socket, reason = '') {
        try {
            const roomId = socket.roomId;
            if (roomId && rooms[roomId]) {
                const room = rooms[roomId];
                if (!room.started) {
                    if (shouldRemoveWaitingPlayerImmediatelyEffect(reason)) {
                        removeWaitingRoomSocket(targetIo, roomId, room, socket);
                    } else {
                        const result = reserveWaitingRoomSocket(targetIo, roomId, room, socket);
                        if (result.ignored) return;
                    }
                } else {
                    const result = handleStartedRoomSocketDisconnect(targetIo, roomId, room, socket);
                    if (result.ignored) return;
                    cancelOnlineRematch(roomId, 'player-disconnected');
                }
                log(`切断: ${socket.id} (ルーム: ${roomId})`);
            }
        } catch (error) {
            logError('disconnect handler error:', error);
        }
    }

    function registerSocket(socket) {
        socket.on('disconnect', reason => {
            disconnectHostlessRestore(socket);
            handleSocketDisconnect(io, socket, reason);
        });
    }

    return Object.freeze({
        registerSocket,
        removeWaitingRoomSocket,
        reserveWaitingRoomSocket,
        handleStartedRoomSocketDisconnect,
        handleSocketDisconnect,
    });
}

module.exports = {
    createDisconnectSocketHandler,
    isWaitingReservation,
    pruneExpiredWaitingReservations,
    reserveWaitingPlayer,
    shouldRemoveWaitingPlayerImmediately,
};
