'use strict';

const MAX_ACTION_LOG_LENGTH = 200;

const ROOM_LIFECYCLE_LIMITS = Object.freeze({
    startedRoomTtlMs: 2 * 60 * 60 * 1000,
    pendingRoomTtlMs: 30 * 60 * 1000,
    maxRooms: 500,
    createRoomRateLimitMs: 5000,
    createRoomIpRateLimitWindowMs: 60 * 1000,
    createRoomIpRateLimitMax: 20,
    createRoomIpRateLimitMaxBuckets: 2000,
});

const RESTORE_PAYLOAD_LIMITS = Object.freeze({
    maxJsonBytes: 1024 * 1024,
    maxActionLogEntries: 1000,
    maxStringLength: 4000,
    maxTotalStringChars: 200000,
    maxPlayerCardRefs: 5000,
});

const SOCKET_PAYLOAD_LIMITS = Object.freeze({
    maxJsonBytes: 16 * 1024,
    maxStringLength: 1000,
    maxTotalStringChars: 4000,
    maxDepth: 8,
});

const CLIENT_ERROR_LIMITS = Object.freeze({
    maxJsonBytes: 32 * 1024,
    maxStringLength: 4000,
    maxStackLength: 2400,
    maxMessageLength: 500,
    rateLimitWindowMs: 60 * 1000,
    rateLimitMax: 20,
    rateLimitMaxBuckets: 2000,
    duplicateWindowMs: 60 * 1000,
});

const GAME_LIFECYCLE_LIMITS = Object.freeze({
    duplicateWindowMs: 5 * 60 * 1000,
    rateLimitWindowMs: 60 * 1000,
    rateLimitMax: 12,
    rateLimitMaxBuckets: 1000,
});

module.exports = Object.freeze({
    MAX_ACTION_LOG_LENGTH,
    ROOM_LIFECYCLE_LIMITS,
    RESTORE_PAYLOAD_LIMITS,
    SOCKET_PAYLOAD_LIMITS,
    CLIENT_ERROR_LIMITS,
    GAME_LIFECYCLE_LIMITS,
});
