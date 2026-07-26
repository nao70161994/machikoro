function registerLobbySocketHandlers(socket, dependencies) {
    const {
        requirePlainSocketPayload,
        sanitizeName,
        emitAppError,
        hasInvalidOnlineRlModelSettings,
        normalizePlayerSettings,
        normalizeCpuSpeed,
        validateCreateRoomLifecycle,
        rooms,
        generateRoomId,
        generateReconnectToken,
        normalizeEnabledCards,
        landmarkNames,
        markCreateRoomForSocket,
        createRoomRateKeyForSocket,
        markCreateRoomForRateKey,
        buildPlayerList,
        io,
        checkGameStart,
        validateSocketCanEnterRoom,
        isValidRoomId,
    } = dependencies;
    const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now;
    const log = typeof dependencies.log === 'function' ? dependencies.log : console.log;

    socket.on('createRoom', payload => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        let { playerName, playerCount, playerSettings, cpuSpeed, enabledCards, enabledLandmarks, clientVersion, hostlessRestoreVersion } = payload;
        socket.clientVersion = clientVersion || 'unknown';
        socket.hostlessRestoreVersion = hostlessRestoreVersion === 1 ? 1 : 0;
        playerName = sanitizeName(playerName);
        if (!playerName) { emitAppError(socket, '名前が無効です'); return; }
        playerCount = Number(playerCount);
        if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 10) {
            emitAppError(socket, 'プレイヤー数が無効です');
            return;
        }
        if (hasInvalidOnlineRlModelSettings(playerSettings)) {
            emitAppError(socket, 'RLモデルIDが無効です');
            return;
        }
        playerSettings = normalizePlayerSettings(playerSettings, playerCount);
        cpuSpeed = normalizeCpuSpeed(cpuSpeed);
        const createdAt = now();
        const roomLifecycle = validateCreateRoomLifecycle(socket, createdAt, rooms);
        if (!roomLifecycle.ok) {
            emitAppError(socket, roomLifecycle.message);
            return;
        }
        const roomId = generateRoomId();
        const reconnectToken = generateReconnectToken();
        const selectedCards = normalizeEnabledCards(enabledCards);
        const allLandmarks = landmarkNames();
        const validLandmarks = new Set(allLandmarks);
        const selectedLandmarks = Array.isArray(enabledLandmarks)
            ? enabledLandmarks.filter(name => validLandmarks.has(name))
            : allLandmarks;
        if (selectedLandmarks.length === 0) {
            emitAppError(socket, 'ランドマークは最低1つ必要です');
            return;
        }
        let hostIndex = 0;
        if (playerSettings && playerSettings.length > 0) {
            hostIndex = playerSettings.findIndex(setting => setting.type === 'human');
            if (hostIndex === -1) {
                emitAppError(socket, 'オンライン対戦は最低1人の人間プレイヤーが必要です');
                return;
            }
        }
        markCreateRoomForSocket(socket, createdAt);
        markCreateRoomForRateKey(createRoomRateKeyForSocket(socket), createdAt);
        rooms[roomId] = {
            roomId,
            createdAt,
            lastTouchedAt: createdAt,
            enabledCards: selectedCards,
            enabledLandmarks: selectedLandmarks,
            players: [{ id: socket.id, name: playerName, index: hostIndex, reconnectToken }],
            hostPlayerIndex: hostIndex,
            hostEpoch: 0,
            actionSeq: 0,
            acceptedClientActions: {},
            maxPlayers: playerCount,
            playerSettings,
            cpuSpeed,
            started: false,
        };
        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = hostIndex;
        socket.emit('roomCreated', { roomId, playerIndex: hostIndex, reconnectToken });
        io.to(roomId).emit('playerList', buildPlayerList(rooms[roomId]));
        checkGameStart(io, roomId);
        log('ルーム作成: ' + roomId + ' (' + playerCount + '人)');
    });

    socket.on('joinRoom', payload => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        let { roomId, playerName, clientVersion, hostlessRestoreVersion } = payload;
        socket.clientVersion = clientVersion || 'unknown';
        socket.hostlessRestoreVersion = hostlessRestoreVersion === 1 ? 1 : 0;
        playerName = sanitizeName(playerName);
        if (!playerName) { emitAppError(socket, '名前が無効です'); return; }
        if (!isValidRoomId(roomId)) { emitAppError(socket, 'ルームが見つかりません'); return; }
        const room = rooms[roomId];
        if (!room) { emitAppError(socket, 'ルームが見つかりません'); return; }
        const roomEntry = validateSocketCanEnterRoom(socket, roomId, rooms);
        if (!roomEntry.ok) { emitAppError(socket, roomEntry.message); return; }
        if (room.started) { emitAppError(socket, 'ゲームはすでに開始されています'); return; }
        if (room.players.some(player => player.id === socket.id)) {
            emitAppError(socket, 'すでにこのルームに参加しています');
            return;
        }
        if (room.players.some(player => player.name === playerName)) {
            emitAppError(socket, 'その名前はすでに使われています');
            return;
        }
        let playerIndex = -1;
        if (room.playerSettings.length > 0) {
            for (let index = 0; index < room.playerSettings.length; index++) {
                const taken = room.players.some(player => player.index === index);
                if (!taken && room.playerSettings[index].type === 'human') {
                    playerIndex = index;
                    break;
                }
            }
        } else {
            if (room.players.length >= room.maxPlayers) {
                emitAppError(socket, '参加できる枠がありません');
                return;
            }
            playerIndex = room.players.length;
        }
        if (playerIndex === -1) {
            emitAppError(socket, '参加できる枠がありません');
            return;
        }
        const reconnectToken = generateReconnectToken();
        room.lastTouchedAt = now();
        room.players.push({ id: socket.id, name: playerName, index: playerIndex, reconnectToken });
        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = playerIndex;
        socket.emit('roomJoined', { roomId, playerIndex, reconnectToken });
        io.to(roomId).emit('playerList', buildPlayerList(room));
        checkGameStart(io, roomId);
    });
}

module.exports = { registerLobbySocketHandlers };
