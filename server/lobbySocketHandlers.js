const { planCreateRoomAdmission, planJoinRoomAdmission } = require('./lobbyAdmission');

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
        pruneExpiredWaitingReservations: pruneExpiredWaitingReservationsEffect = () => [],
    } = dependencies;
    const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now;
    const log = typeof dependencies.log === 'function' ? dependencies.log : console.log;
    const resolveGameSchemaCapabilities = typeof dependencies.resolveClientGameSchemaCapabilities === 'function'
        ? dependencies.resolveClientGameSchemaCapabilities
        : (() => ({ ok: true, capabilities: null, reason: '' }));
    const negotiateSchemaCandidate = typeof dependencies.negotiateRoomGameSchemaCandidate === 'function'
        ? dependencies.negotiateRoomGameSchemaCandidate
        : (() => ({ ok: true, reason: '' }));

    socket.on('createRoom', payload => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        let { playerName, playerCount, playerSettings, cpuSpeed, enabledCards, enabledLandmarks, clientVersion, hostlessRestoreVersion, gameSchemaCapabilities } = payload;
        const schemaResolution = resolveGameSchemaCapabilities(gameSchemaCapabilities);
        if (!schemaResolution.ok) { emitAppError(socket, 'SCHEMA_CAPABILITY_INVALID'); return; }
        socket.gameSchemaCapabilities = schemaResolution.capabilities;
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
        const admission = planCreateRoomAdmission({
            enabledLandmarks,
            allLandmarks: landmarkNames(),
            playerSettings,
        });
        if (!admission.ok) {
            emitAppError(socket, admission.message);
            return;
        }
        const { selectedLandmarks, hostIndex } = admission;
        markCreateRoomForSocket(socket, createdAt);
        markCreateRoomForRateKey(createRoomRateKeyForSocket(socket), createdAt);
        rooms[roomId] = {
            roomId,
            createdAt,
            lastTouchedAt: createdAt,
            enabledCards: selectedCards,
            enabledLandmarks: selectedLandmarks,
            players: [{ id: socket.id, name: playerName, index: hostIndex, reconnectToken, gameSchemaCapabilities: schemaResolution.capabilities }],
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
        socket.emit('roomCreated', {
            roomId, playerIndex: hostIndex, reconnectToken, hostPlayerIndex: hostIndex,
        });
        io.to(roomId).emit('playerList', buildPlayerList(rooms[roomId]));
        checkGameStart(io, roomId);
        log('ルーム作成: ' + roomId + ' (' + playerCount + '人)');
    });

    socket.on('joinRoom', payload => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        let { roomId, playerName, clientVersion, hostlessRestoreVersion, gameSchemaCapabilities } = payload;
        const schemaResolution = resolveGameSchemaCapabilities(gameSchemaCapabilities);
        if (!schemaResolution.ok) { emitAppError(socket, 'SCHEMA_CAPABILITY_INVALID'); return; }
        socket.gameSchemaCapabilities = schemaResolution.capabilities;
        socket.clientVersion = clientVersion || 'unknown';
        socket.hostlessRestoreVersion = hostlessRestoreVersion === 1 ? 1 : 0;
        playerName = sanitizeName(playerName);
        if (!playerName) { emitAppError(socket, '名前が無効です'); return; }
        if (!isValidRoomId(roomId)) { emitAppError(socket, 'ルームが見つかりません'); return; }
        const room = rooms[roomId];
        if (!room) { emitAppError(socket, 'ルームが見つかりません'); return; }
        pruneExpiredWaitingReservationsEffect(room, now());
        const roomEntry = validateSocketCanEnterRoom(socket, roomId, rooms);
        if (!roomEntry.ok) { emitAppError(socket, roomEntry.message); return; }
        const admission = planJoinRoomAdmission({ room, socketId: socket.id, playerName });
        if (!admission.ok) { emitAppError(socket, admission.message); return; }
        const { playerIndex } = admission;
        const schemaCandidate = negotiateSchemaCandidate(room, playerIndex, schemaResolution.capabilities);
        if (!schemaCandidate.ok) { emitAppError(socket, 'SCHEMA_VERSION_UNSUPPORTED'); return; }
        const reconnectToken = generateReconnectToken();
        room.lastTouchedAt = now();
        room.players.push({ id: socket.id, name: playerName, index: playerIndex, reconnectToken, gameSchemaCapabilities: schemaResolution.capabilities });
        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = playerIndex;
        socket.emit('roomJoined', {
            roomId, playerIndex, reconnectToken, hostPlayerIndex: room.hostPlayerIndex,
        });
        io.to(roomId).emit('playerList', buildPlayerList(room));
        checkGameStart(io, roomId);
    });
}

module.exports = { registerLobbySocketHandlers };
