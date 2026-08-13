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
        buildLobbyState,
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
            gameGeneration: 0,
        };
        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = hostIndex;
        socket.emit('roomCreated', {
            roomId, playerIndex: hostIndex, reconnectToken, hostPlayerIndex: hostIndex,
        });
        io.to(roomId).emit('playerList', buildPlayerList(rooms[roomId]), buildLobbyState(rooms[roomId]));
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
        io.to(roomId).emit('playerList', buildPlayerList(room), buildLobbyState(room));
        checkGameStart(io, roomId);
    });

    socket.on('removeWaitingPlayer', payload => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        const roomId = typeof payload.roomId === 'string' ? payload.roomId.trim().toUpperCase() : '';
        const playerIndex = Number(payload.playerIndex);
        const room = rooms[roomId];
        if (!room || room.started || socket.roomId !== roomId ||
                socket.playerIndex !== room.hostPlayerIndex ||
                !Number.isInteger(playerIndex) || playerIndex < 0 ||
                playerIndex === room.hostPlayerIndex) {
            emitAppError(socket, '待機中の参加者を外せません');
            return;
        }
        const target = room.players.find(player => player.index === playerIndex);
        if (!target) {
            emitAppError(socket, '待機中の参加者が見つかりません');
            return;
        }
        room.players = room.players.filter(player => player !== target);
        room.lastTouchedAt = now();
        const targetSocket = target.id && io.sockets?.sockets?.get(target.id);
        if (targetSocket) {
            targetSocket.roomId = null;
            targetSocket.playerIndex = null;
            emitAppError(targetSocket, 'ホストが待機室から外しました');
            if (typeof targetSocket.leave === 'function') targetSocket.leave(roomId);
            if (typeof targetSocket.disconnect === 'function') targetSocket.disconnect(true);
        }
        io.to(roomId).emit('playerList', buildPlayerList(room), buildLobbyState(room));
    });

    socket.on('manageWaitingRoom', payload => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        const roomId = typeof payload.roomId === 'string' ? payload.roomId.trim().toUpperCase() : '';
        const room = rooms[roomId];
        if (!room || room.started || socket.roomId !== roomId ||
                socket.playerIndex !== room.hostPlayerIndex) {
            emitAppError(socket, '待機室を管理できません');
            return;
        }
        if (payload.action === 'start') {
            if (room.players.some(player => !player.id) || room.players.length < 1) {
                emitAppError(socket, '再接続待ちの参加者がいるため開始できません');
                return;
            }
            if (room.playerSettings.length === 0) {
                room.maxPlayers = Math.max(2, room.players.length);
                room.playerSettings = Array.from({ length: room.maxPlayers }, (_, index) =>
                    room.players.some(player => player.index === index)
                        ? { type: 'human', name: '', difficulty: 'human' }
                        : { type: 'cpu', name: '', difficulty: 'normal' }
                );
            } else {
                room.playerSettings = room.playerSettings.map((setting, index) => {
                    if (setting.type !== 'human' || room.players.some(player => player.index === index)) return setting;
                    return { type: 'cpu', difficulty: 'normal' };
                });
            }
            checkGameStart(io, roomId);
            return;
        }
        if (payload.action === 'slots') {
            const delta = Number(payload.delta);
            if (delta !== 1 && delta !== -1) {
                emitAppError(socket, '参加枠の変更が無効です');
                return;
            }
            if (room.playerSettings.length === 0) {
                const next = room.maxPlayers + delta;
                if (next < 2 || next > 10 || (delta < 0 && room.players.some(player => player.index >= next))) {
                    emitAppError(socket, '参加枠を変更できません');
                    return;
                }
                room.maxPlayers = next;
            } else if (delta > 0) {
                if (room.playerSettings.length >= 10) { emitAppError(socket, '参加枠を変更できません'); return; }
                room.playerSettings.push({ type: 'human', name: '', difficulty: 'human' });
                room.maxPlayers = room.playerSettings.length;
            } else {
                const lastIndex = room.playerSettings.length - 1;
                if (room.playerSettings.length <= 2 || room.players.some(player => player.index === lastIndex)) {
                    emitAppError(socket, '参加枠を変更できません');
                    return;
                }
                room.playerSettings.pop();
                room.maxPlayers = room.playerSettings.length;
            }
            io.to(roomId).emit('playerList', buildPlayerList(room), buildLobbyState(room));
            checkGameStart(io, roomId);
            return;
        }
        emitAppError(socket, '待機室の操作が無効です');
    });
}

module.exports = { registerLobbySocketHandlers };
