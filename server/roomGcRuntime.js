'use strict';

const ROOM_GC_INTERVAL_MS = 30 * 1000;

function startRoomGc(options = {}) {
    const cleanupExpiredRooms = options.cleanupExpiredRooms;
    const rooms = options.rooms;
    const now = options.now === undefined ? Date.now : options.now;
    const setIntervalFn = options.setIntervalFn === undefined ? setInterval : options.setIntervalFn;
    const intervalMs = options.intervalMs === undefined ? ROOM_GC_INTERVAL_MS : options.intervalMs;
    if (typeof cleanupExpiredRooms !== 'function') {
        throw new TypeError('cleanupExpiredRooms is required');
    }
    if (!rooms || typeof rooms !== 'object' || Array.isArray(rooms)) {
        throw new TypeError('rooms is required');
    }
    if (typeof now !== 'function') throw new TypeError('now must be a function');
    if (typeof setIntervalFn !== 'function') throw new TypeError('setIntervalFn must be a function');
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        throw new TypeError('intervalMs must be positive');
    }

    const timer = setIntervalFn(() => {
        cleanupExpiredRooms(now(), rooms);
    }, intervalMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
    return timer;
}

module.exports = Object.freeze({ ROOM_GC_INTERVAL_MS, startRoomGc });
