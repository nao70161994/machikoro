'use strict';

const assert = require('assert');
const makeRecreateRoomRuntime = require('../server/recreateRoomRuntime');
const { runTest } = require('./helpers/test-utils');

function createHarness(admission, roomExists = false, existingResult = { handled: false }) {
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
        existingRoomRuntime: {
            handle(input) { calls.push(['existing', input]); return existingResult; },
        },
        newRoomRuntime: {
            handle(input) { calls.push(['new', input]); return { ok: true, source: 'new' }; },
        },
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
    }
});

runTest('recreate room runtimeは必須dependency欠落を初期化時に拒否する', () => {
    assert.throws(() => makeRecreateRoomRuntime(), /planAdmission dependency is required/);
    assert.throws(() => makeRecreateRoomRuntime({
        planAdmission() {}, emitAppError() {}, hasRoom() {}, roomForId() {},
    }), /existingRoomRuntime dependency is required/);
});
