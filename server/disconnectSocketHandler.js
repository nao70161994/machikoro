'use strict';

function createDisconnectSocketHandler(dependencies) {
    const {
        io,
        rooms,
        buildPlayerList,
        getRemainingConnectedPlayers,
        setRoomHostPlayerIndex,
        emitRoomHostChanged,
        persistRoomCanonicalState,
        disconnectHostlessRestore,
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
        targetIo.to(roomId).emit('playerList', playerList);
        return { removedRoom: false, playerList };
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

    function handleSocketDisconnect(targetIo, socket) {
        try {
            const roomId = socket.roomId;
            if (roomId && rooms[roomId]) {
                const room = rooms[roomId];
                if (!room.started) {
                    removeWaitingRoomSocket(targetIo, roomId, room, socket);
                } else {
                    const result = handleStartedRoomSocketDisconnect(targetIo, roomId, room, socket);
                    if (result.ignored) return;
                }
                log(`切断: ${socket.id} (ルーム: ${roomId})`);
            }
        } catch (error) {
            logError('disconnect handler error:', error);
        }
    }

    function registerSocket(socket) {
        socket.on('disconnect', () => {
            disconnectHostlessRestore(socket);
            handleSocketDisconnect(io, socket);
        });
    }

    return Object.freeze({
        registerSocket,
        removeWaitingRoomSocket,
        handleStartedRoomSocketDisconnect,
        handleSocketDisconnect,
    });
}

module.exports = {
    createDisconnectSocketHandler,
};
