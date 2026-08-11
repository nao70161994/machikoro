'use strict';

const assert = require('assert');
const makeRecreateRoomRuntime = require('../server/recreateRoomRuntime');
const makeRoomLifecycle = require('../server/roomLifecycle');
const { runTest } = require('./helpers/test-utils');

function createHarness(admission, roomExists = false, existingResult = { handled: false }, overrides = {}) {
    const calls = [];
    const room = { id: 'room-ref' };
    const runtime = makeRecreateRoomRuntime({
        planAdmission(payload, options) {
            calls.push(['admission', payload, options]);
            return admission;
        },
        emitAppError(socket, message) { calls.push(['error', socket, message]); },
        hasRoom(roomId) { calls.push(['has-room', roomId]); return roomExists; },
        roomForId(roomId) { calls.push(['room', roomId]); return room; },
        validateCreateRoomLifecycle(socket, now, rooms) {
            calls.push(['lifecycle', socket, now, rooms]);
            return { ok: true };
        },
        rooms: {},
        markCreateRoomForSocket(socket, now) { calls.push(['mark-socket', socket, now]); },
        createRoomRateKeyForSocket(socket) {
            calls.push(['rate-key', socket]);
            return 'rate-key';
        },
        markCreateRoomForRateKey(key, now) { calls.push(['mark-rate', key, now]); },
        now: () => 1234,
        existingRoomRuntime: {
            handle(input) { calls.push(['existing', input]); return existingResult; },
        },
        newRoomRuntime: {
            handle(input) { calls.push(['new', input]); return { ok: true, source: 'new' }; },
        },
        ...overrides,
    });
    return { runtime, calls, room };
}

function acceptedAdmission() {
    return {
        ok: true,
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token',
        canonicalRecord: { revision: 2 },
        clientSnapshotTrusted: true,
        replayStateSnapshot: { actionSeq: 3 },
        gameStartPayload: { playerNames: ['Host', 'Alice'] },
        stateSnapshot: { actionSeq: 3 },
        actionLog: [{ action: 'nextTurn' }],
    };
}

runTest('recreate room runtimeはadmission拒否を既存error/result契約で返す', () => {
    const result = { ok: false, reason: 'invalid' };
    const harness = createHarness({ ok: false, errorMessage: 'bad', result });
    const socket = { id: 'socket' };
    assert.strictEqual(harness.runtime.handle(socket, { roomId: 'bad' }, { approved: true }), result);
    assert.deepStrictEqual(harness.calls, [
        ['admission', { roomId: 'bad' }, { approved: true }],
        ['error', socket, 'bad'],
    ]);
});

runTest('recreate room runtimeは既存roomでhandledなら新規復元へ進まない', () => {
    const admission = acceptedAdmission();
    const harness = createHarness(admission, true, { handled: true });
    const socket = { id: 'socket' };
    assert.strictEqual(harness.runtime.handle(socket, {}, { candidateCount: 2 }), undefined);
    const existing = harness.calls.find(call => call[0] === 'existing')[1];
    assert.strictEqual(existing.socket, socket);
    assert.strictEqual(existing.room, harness.room);
    assert.deepStrictEqual(existing.admissionInput, {
        room: harness.room,
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token',
        actionLog: admission.actionLog,
        replayStateSnapshot: admission.replayStateSnapshot,
        canonicalRecord: admission.canonicalRecord,
        gameStartPayload: admission.gameStartPayload,
        clientSnapshotTrusted: true,
    });
    assert.strictEqual(harness.calls.some(call => call[0] === 'new'), false);
});

runTest('recreate room runtimeはreplaceまたはroom不在を同じ新規runtimeへ渡す', () => {
    for (const roomExists of [true, false]) {
        const admission = acceptedAdmission();
        const harness = createHarness(admission, roomExists, { handled: false });
        const socket = { id: 'socket-' + roomExists };
        assert.deepStrictEqual(harness.runtime.handle(socket, {}, { candidateCount: 4 }), {
            ok: true,
            source: 'new',
        });
        const input = harness.calls.find(call => call[0] === 'new')[1];
        assert.deepStrictEqual(input, { socket, admission, candidateCount: 4 });
        assert.strictEqual(harness.calls.filter(call => call[0] === 'existing').length, roomExists ? 1 : 0);
        assert.strictEqual(harness.calls.filter(call => call[0] === 'lifecycle').length, roomExists ? 0 : 1);
        assert.strictEqual(harness.calls.filter(call => call[0] === 'mark-socket').length, roomExists ? 0 : 1);
    }
});

runTest('recreate room runtimeは不在roomだけ500室上限をprepare前に拒否する', () => {
    const rooms = {};
    const now = 5000;
    for (let index = 0; index < 500; index++) {
        rooms['room-' + index] = { started: false, createdAt: now, lastTouchedAt: now };
    }
    const lifecycle = makeRoomLifecycle({
        limits: {
            maxRooms: 500,
            pendingRoomTtlMs: 10000,
            startedRoomTtlMs: 10000,
            createRoomRateLimitMs: 1000,
            createRoomIpRateLimitWindowMs: 10000,
            createRoomIpRateLimitMax: 20,
        },
        defaultRooms: rooms,
        log: { log() {} },
    });
    const harness = createHarness(acceptedAdmission(), false, { handled: false }, {
        rooms,
        now: () => now,
        validateCreateRoomLifecycle: lifecycle.validateCreateRoomLifecycle,
        markCreateRoomForSocket: lifecycle.markCreateRoomForSocket,
        createRoomRateKeyForSocket: lifecycle.createRoomRateKeyForSocket,
        markCreateRoomForRateKey: lifecycle.markCreateRoomForRateKey,
    });

    assert.strictEqual(harness.runtime.handle({ id: 'socket' }, {}), undefined);
    assert.strictEqual(harness.calls.some(call => call[0] === 'new'), false);
    assert.deepStrictEqual(harness.calls.find(call => call[0] === 'error').slice(1), [
        { id: 'socket' },
        'ルーム数が上限に達しています。しばらくしてから再試行してください',
    ]);
});

runTest('recreate room runtimeは通常作成と同じIP枠を共有し失敗restoreでは消費しない', () => {
    const rooms = {};
    const now = 7000;
    const limits = {
        maxRooms: 500,
        pendingRoomTtlMs: 10000,
        startedRoomTtlMs: 10000,
        createRoomRateLimitMs: 1000,
        createRoomIpRateLimitWindowMs: 10000,
        createRoomIpRateLimitMax: 1,
    };
    const lifecycle = makeRoomLifecycle({ limits, defaultRooms: rooms, log: { log() {} } });
    const socket = { id: 'restore', handshake: { address: '203.0.113.10' } };
    lifecycle.markCreateRoomForRateKey('203.0.113.10', now);
    const limited = createHarness(acceptedAdmission(), false, { handled: false }, {
        rooms,
        now: () => now + 1,
        validateCreateRoomLifecycle: lifecycle.validateCreateRoomLifecycle,
        markCreateRoomForSocket: lifecycle.markCreateRoomForSocket,
        createRoomRateKeyForSocket: lifecycle.createRoomRateKeyForSocket,
        markCreateRoomForRateKey: lifecycle.markCreateRoomForRateKey,
    });
    assert.strictEqual(limited.runtime.handle(socket, {}), undefined);
    assert.strictEqual(limited.calls.some(call => call[0] === 'new'), false);

    const freshLifecycle = makeRoomLifecycle({ limits, defaultRooms: rooms, log: { log() {} } });
    const failed = createHarness(acceptedAdmission(), false, { handled: false }, {
        rooms,
        now: () => now,
        validateCreateRoomLifecycle: freshLifecycle.validateCreateRoomLifecycle,
        markCreateRoomForSocket: freshLifecycle.markCreateRoomForSocket,
        createRoomRateKeyForSocket: freshLifecycle.createRoomRateKeyForSocket,
        markCreateRoomForRateKey: freshLifecycle.markCreateRoomForRateKey,
        newRoomRuntime: { handle() { return { ok: false, reason: 'invalid' }; } },
    });
    assert.deepStrictEqual(failed.runtime.handle(socket, {}), { ok: false, reason: 'invalid' });
    assert.strictEqual(socket.lastCreateRoomAt, undefined);
    assert.strictEqual(freshLifecycle.canCreateRoomForRateKey('203.0.113.10', now + 1), true);
});

runTest('recreate room runtimeは必須dependency欠落を初期化時に拒否する', () => {
    assert.throws(() => makeRecreateRoomRuntime(), /planAdmission dependency is required/);
    assert.throws(() => makeRecreateRoomRuntime({
        planAdmission() {}, emitAppError() {}, hasRoom() {}, roomForId() {},
    }), /validateCreateRoomLifecycle dependency is required/);
});
