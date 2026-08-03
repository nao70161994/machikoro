'use strict';

const assert = require('assert');
const { ROOM_GC_INTERVAL_MS, startRoomGc } = require('../server/roomGcRuntime');
const { runTest } = require('./helpers/test-utils');

runTest('room GC runtimeは10分周期・callback時刻・rooms identityを維持する', () => {
    const calls = [];
    const rooms = { ABC123: { started: false } };
    const timer = { unrefCalls: 0, unref() { this.unrefCalls++; } };
    let callback = null;
    const result = startRoomGc({
        cleanupExpiredRooms(now, targetRooms) {
            calls.push([now, targetRooms]);
        },
        rooms,
        now: () => 12345,
        setIntervalFn(fn, intervalMs) {
            callback = fn;
            calls.push(['schedule', intervalMs]);
            return timer;
        },
    });
    assert.strictEqual(result, timer);
    assert.deepStrictEqual(calls, [['schedule', ROOM_GC_INTERVAL_MS]]);
    assert.strictEqual(timer.unrefCalls, 1);
    callback();
    assert.deepStrictEqual(calls, [
        ['schedule', ROOM_GC_INTERVAL_MS],
        [12345, rooms],
    ]);
});

runTest('room GC runtimeはunrefなしtimerと明示intervalを許容する', () => {
    let scheduledMs = 0;
    const timer = {};
    assert.strictEqual(startRoomGc({
        cleanupExpiredRooms() {},
        rooms: {},
        intervalMs: 25,
        setIntervalFn(fn, ms) {
            assert.strictEqual(typeof fn, 'function');
            scheduledMs = ms;
            return timer;
        },
    }), timer);
    assert.strictEqual(scheduledMs, 25);
});

runTest('room GC runtimeは不完全な配線を起動前に拒否する', () => {
    assert.throws(() => startRoomGc({ rooms: {} }), /cleanupExpiredRooms is required/);
    assert.throws(() => startRoomGc({ cleanupExpiredRooms() {}, rooms: [] }), /rooms is required/);
    assert.throws(() => startRoomGc({ cleanupExpiredRooms() {}, rooms: {}, now: null }), /now must be a function/);
    assert.throws(() => startRoomGc({ cleanupExpiredRooms() {}, rooms: {}, setIntervalFn: null }), /setIntervalFn must be a function/);
    assert.throws(() => startRoomGc({ cleanupExpiredRooms() {}, rooms: {}, intervalMs: 0 }), /intervalMs must be positive/);
});
