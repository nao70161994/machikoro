'use strict';

function makeRoomLifecycle({ limits, defaultRooms, log = console }) {
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

    function validateCreateRoomLifecycle(socket, now = Date.now(), targetRooms = defaultRooms) {
        cleanupExpiredRooms(now, targetRooms);
        if (Object.keys(targetRooms).length >= limits.maxRooms) {
            return { ok: false, message: 'ルーム数が上限に達しています。しばらくしてから再試行してください' };
        }
        if (!canCreateRoomForSocket(socket, now)) {
            return { ok: false, message: 'ルーム作成が短時間に連続しています。少し待ってから再試行してください' };
        }
        return { ok: true };
    }

    return {
        roomTimestamp,
        isRoomExpired,
        cleanupExpiredRooms,
        canCreateRoomForSocket,
        markCreateRoomForSocket,
        validateCreateRoomLifecycle,
    };
}

module.exports = makeRoomLifecycle;
