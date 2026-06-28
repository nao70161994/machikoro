'use strict';

function makeRoomLifecycle({ limits, defaultRooms, log = console }) {
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
    };
}

module.exports = makeRoomLifecycle;
