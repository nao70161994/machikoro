'use strict';

function makeRoomLifecycle({ limits, defaultRooms, log = console, cpuDifficultyLabel = difficulty => difficulty || '普', hashReconnectToken = token => token || '' }) {
    const createRoomRateBuckets = new Map();

    function roomTimestamp(value) {
        return Number.isFinite(value) ? value : 0;
    }

    function isRoomExpired(room, now = Date.now()) {
        if (!room) return false;
        const ttl = room.started
            ? limits.startedRoomTtlMs
            : limits.pendingRoomTtlMs;
        const touchedAt = roomTimestamp(room.lastTouchedAt) || roomTimestamp(room.createdAt);
        return touchedAt > 0 && now - touchedAt > ttl;
    }

    function cleanupExpiredRooms(now = Date.now(), targetRooms = defaultRooms) {
        let deleted = 0;
        for (const [id, room] of Object.entries(targetRooms)) {
            if (isRoomExpired(room, now)) {
                delete targetRooms[id];
                deleted++;
                log.log(`ルーム削除（TTL）: ${id}`);
            }
        }
        return deleted;
    }

    function canCreateRoomForSocket(socket, now = Date.now()) {
        const lastCreatedAt = roomTimestamp(socket && socket.lastCreateRoomAt);
        return lastCreatedAt === 0 || now - lastCreatedAt >= limits.createRoomRateLimitMs;
    }

    function markCreateRoomForSocket(socket, now = Date.now()) {
        if (socket) socket.lastCreateRoomAt = now;
    }

    function createRoomRateKeyForSocket(socket) {
        return socket?.handshake?.address ||
            socket?.conn?.remoteAddress ||
            socket?.request?.socket?.remoteAddress ||
            socket?.request?.connection?.remoteAddress ||
            null;
    }

    function pruneCreateRoomRateBuckets(now = Date.now()) {
        const windowMs = limits.createRoomIpRateLimitWindowMs || limits.createRoomRateLimitMs;
        for (const [key, bucket] of createRoomRateBuckets.entries()) {
            if (now - bucket.windowStart >= windowMs) createRoomRateBuckets.delete(key);
        }
        const maxBuckets = limits.createRoomIpRateLimitMaxBuckets || 0;
        if (maxBuckets > 0 && createRoomRateBuckets.size > maxBuckets) {
            for (const key of createRoomRateBuckets.keys()) {
                createRoomRateBuckets.delete(key);
                if (createRoomRateBuckets.size <= maxBuckets) break;
            }
        }
    }

    function createRoomRateBucketForKey(rateKey, now = Date.now()) {
        if (!rateKey) return null;
        const windowMs = limits.createRoomIpRateLimitWindowMs || limits.createRoomRateLimitMs;
        let bucket = createRoomRateBuckets.get(rateKey);
        if (!bucket || now - bucket.windowStart >= windowMs) {
            bucket = { windowStart: now, count: 0 };
            createRoomRateBuckets.set(rateKey, bucket);
        }
        pruneCreateRoomRateBuckets(now);
        return bucket;
    }

    function canCreateRoomForRateKey(rateKey, now = Date.now()) {
        if (!rateKey || !limits.createRoomIpRateLimitMax) return true;
        const bucket = createRoomRateBucketForKey(rateKey, now);
        return !bucket || bucket.count < limits.createRoomIpRateLimitMax;
    }

    function markCreateRoomForRateKey(rateKey, now = Date.now()) {
        if (!rateKey || !limits.createRoomIpRateLimitMax) return;
        const bucket = createRoomRateBucketForKey(rateKey, now);
        if (bucket) bucket.count++;
    }

    function isSocketInActiveRoom(socket, targetRooms = defaultRooms) {
        const roomId = socket && socket.roomId;
        const socketId = socket && socket.id;
        const room = roomId && targetRooms && targetRooms[roomId];
        return !!(room && socketId && Array.isArray(room.players) && room.players.some(player => player && player.id === socketId));
    }

    function validateSocketCanEnterRoom(socket, targetRoomId = null, targetRooms = defaultRooms) {
        const roomId = socket && socket.roomId;
        if (!isSocketInActiveRoom(socket, targetRooms)) return { ok: true };
        if (targetRoomId && roomId === targetRoomId) return { ok: true };
        return { ok: false, message: 'すでに別のルームに参加しています' };
    }

    function validateCreateRoomLifecycle(socket, now = Date.now(), targetRooms = defaultRooms) {
        cleanupExpiredRooms(now, targetRooms);
        const activeRoom = validateSocketCanEnterRoom(socket, null, targetRooms);
        if (!activeRoom.ok) return activeRoom;
        if (Object.keys(targetRooms).length >= limits.maxRooms) {
            return { ok: false, message: 'ルーム数が上限に達しています。しばらくしてから再試行してください' };
        }
        if (!canCreateRoomForSocket(socket, now)) {
            return { ok: false, message: 'ルーム作成が短時間に連続しています。少し待ってから再試行してください' };
        }
        if (!canCreateRoomForRateKey(createRoomRateKeyForSocket(socket), now)) {
            return { ok: false, message: 'ルーム作成が短時間に集中しています。少し待ってから再試行してください' };
        }
        return { ok: true };
    }

    function buildPlayerList(room) {
        if (room.playerSettings.length === 0) {
            return room.players.map(p => p.name);
        }
        return room.playerSettings.map((s, i) => {
            if (s.type === "cpu") {
                const diffLabel = cpuDifficultyLabel(s.difficulty);
                return `CPU（${diffLabel}）`;
            }
            const p = room.players.find(p => p.index === i);
            if (p) return p.name;
            return "待機中...";
        });
    }

    function countRoomHumanSlots(room) {
        return room.playerSettings.length > 0
            ? room.playerSettings.filter(s => s.type === "human").length
            : room.maxPlayers;
    }

    function buildGameStartPlayerNames(room) {
        if (room.playerSettings.length === 0) return room.players.map(p => p.name);
        let cpuCount = 0;
        return room.playerSettings.map((s, i) => {
            if (s.type === "cpu") {
                cpuCount++;
                const diffLabel = cpuDifficultyLabel(s.difficulty);
                return `CPU${cpuCount}（${diffLabel}）`;
            }
            const p = room.players.find(p => p.index === i);
            if (p) return p.name;
            return "不明";
        });
    }

    function shuffledPlayerOrder(playerNames, randomFn = Math.random) {
        const playerOrder = playerNames.map((_, i) => i);
        for (let i = playerOrder.length - 1; i > 0; i--) {
            const j = Math.floor(randomFn() * (i + 1));
            [playerOrder[i], playerOrder[j]] = [playerOrder[j], playerOrder[i]];
        }
        return playerOrder;
    }

    function roomClientVersions(sockets, room) {
        return room.players.map(p => {
            const s = sockets.get(p.id);
            return s ? (s.clientVersion || 'unknown') : 'unknown';
        });
    }

    function roomReconnectTokenHashes(room, playerNames) {
        return playerNames.map((_, index) => {
            const player = room.players.find(p => p.index === index);
            return player?.reconnectToken ? hashReconnectToken(player.reconnectToken) : '';
        });
    }

    function getRemainingConnectedPlayers(room, sockets, disconnectedSocketId) {
        return room.players.filter(p =>
            p.id &&
            p.id !== disconnectedSocketId &&
            sockets.has(p.id)
        );
    }

    function setRoomHostPlayerIndex(room, hostPlayerIndex) {
        if (room.hostPlayerIndex !== hostPlayerIndex) {
            room.hostEpoch = (Number.isInteger(room.hostEpoch) ? room.hostEpoch : 0) + 1;
        }
        room.hostPlayerIndex = hostPlayerIndex;
        if (room.gameStartPayload && typeof room.gameStartPayload === 'object') {
            room.gameStartPayload.hostPlayerIndex = hostPlayerIndex;
            room.gameStartPayload.hostEpoch = room.hostEpoch || 0;
        }
    }

    function roomHostChangedPayload(room) {
        return {
            newHostPlayerIndex: room?.hostPlayerIndex,
            hostEpoch: Number.isInteger(room?.hostEpoch) ? room.hostEpoch : 0,
        };
    }

    function roomHostlessRestoreCapabilities(sockets, room, playerNames) {
        return playerNames.map((_, index) => {
            const setting = Array.isArray(room.playerSettings) ? room.playerSettings[index] : null;
            if (setting?.type === 'cpu') return 0;
            const player = room.players.find(candidate => candidate.index === index);
            const playerSocket = player?.id ? sockets.get(player.id) : null;
            return playerSocket?.hostlessRestoreVersion === 1 ? 1 : 0;
        });
    }

    return {
        roomTimestamp,
        isRoomExpired,
        cleanupExpiredRooms,
        canCreateRoomForSocket,
        markCreateRoomForSocket,
        createRoomRateKeyForSocket,
        canCreateRoomForRateKey,
        markCreateRoomForRateKey,
        isSocketInActiveRoom,
        validateSocketCanEnterRoom,
        validateCreateRoomLifecycle,
        buildPlayerList,
        countRoomHumanSlots,
        buildGameStartPlayerNames,
        shuffledPlayerOrder,
        roomClientVersions,
        roomReconnectTokenHashes,
        getRemainingConnectedPlayers,
        setRoomHostPlayerIndex,
        roomHostChangedPayload,
        roomHostlessRestoreCapabilities,
    };
}

module.exports = makeRoomLifecycle;
