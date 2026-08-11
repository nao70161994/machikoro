'use strict';

const assert = require('assert');
const limits = require('../server/runtimeLimits');
const { runTest } = require('./helpers/test-utils');

runTest('server runtime limitsは既存の全上限値を一つのfrozen contractで公開する', () => {
    assert.strictEqual(limits.MAX_ACTION_LOG_LENGTH, 200);
    assert.deepStrictEqual(limits.ROOM_LIFECYCLE_LIMITS, {
        startedRoomTtlMs: 7200000,
        pendingRoomTtlMs: 1800000,
        maxRooms: 500,
        createRoomRateLimitMs: 5000,
        createRoomIpRateLimitWindowMs: 60000,
        createRoomIpRateLimitMax: 20,
        createRoomIpRateLimitMaxBuckets: 2000,
    });
    assert.deepStrictEqual(limits.RESTORE_PAYLOAD_LIMITS, {
        maxJsonBytes: 1048576,
        maxActionLogEntries: 1000,
        maxStringLength: 4000,
        maxTotalStringChars: 300000,
        maxPlayerCardRefs: 30000,
        maxTotalNodes: 65536,
    });
    assert.strictEqual(limits.SOCKET_IO_MAX_HTTP_BUFFER_SIZE, 1114112);
    assert.ok(
        limits.SOCKET_IO_MAX_HTTP_BUFFER_SIZE >= limits.RESTORE_PAYLOAD_LIMITS.maxJsonBytes + 65536
    );
    assert.deepStrictEqual(limits.SOCKET_PAYLOAD_LIMITS, {
        maxJsonBytes: 16384,
        maxStringLength: 1000,
        maxTotalStringChars: 4000,
        maxDepth: 8,
    });
    assert.deepStrictEqual(limits.CLIENT_ERROR_LIMITS, {
        maxJsonBytes: 32768,
        maxStringLength: 4000,
        maxStackLength: 2400,
        maxMessageLength: 500,
        rateLimitWindowMs: 60000,
        rateLimitMax: 20,
        rateLimitMaxBuckets: 2000,
        duplicateWindowMs: 60000,
    });
    assert.deepStrictEqual(limits.GAME_LIFECYCLE_LIMITS, {
        duplicateWindowMs: 300000,
        rateLimitWindowMs: 60000,
        rateLimitMax: 12,
        rateLimitMaxBuckets: 1000,
    });
});

runTest('server runtime limit tablesと公開contractは外部変更できない', () => {
    assert.strictEqual(Object.isFrozen(limits), true);
    for (const [name, value] of Object.entries(limits)) {
        if (typeof value === 'object') assert.strictEqual(Object.isFrozen(value), true, name);
    }
});
