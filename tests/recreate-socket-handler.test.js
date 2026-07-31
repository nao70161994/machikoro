'use strict';

const assert = require('assert');
const RecreateRoomPayload = require('../js/recreateRoomPayload');
const { registerRecreateSocketHandler } = require('../server/recreateSocketHandler');
const { runTest } = require('./helpers/test-utils');

function runtime(overrides = {}) {
    const handlers = {};
    const calls = [];
    const socket = {
        on(event, handler) { handlers[event] = handler; },
    };
    registerRecreateSocketHandler(socket, Object.assign({
        decodePayload: payload => RecreateRoomPayload.decode(true, payload),
        emitAppError(_socket, message) { calls.push(['error', message]); },
        handleRecreateRoom(_socket, payload) {
            calls.push(['handle', payload]);
            return { ok: true, roomId: payload.roomId };
        },
        hostRestored(roomId) { calls.push(['restored', roomId]); },
    }, overrides));
    return { handlers, calls, socket };
}

runTest('recreate socket handlerは既存eventだけを登録する', () => {
    const rt = runtime();
    assert.deepStrictEqual(Object.keys(rt.handlers), ['recreateRoom']);
});

runTest('recreate socket handlerはv1をdecodeして既存restore順を維持する', () => {
    const rt = runtime();
    const payload = { roomId: 'ABC123' };
    rt.handlers.recreateRoom({ schemaVersion: 1, recreateRoom: payload });
    assert.deepStrictEqual(rt.calls, [
        ['handle', payload],
        ['restored', 'ABC123'],
    ]);
});

runTest('recreate socket handlerはlegacyを受理しdecode失敗を副作用前に拒否する', () => {
    const rt = runtime();
    const legacy = { roomId: 'ABC123' };
    rt.handlers.recreateRoom(legacy);
    assert.deepStrictEqual(rt.calls, [
        ['handle', legacy],
        ['restored', 'ABC123'],
    ]);

    const rejected = runtime();
    rejected.handlers.recreateRoom({ schemaVersion: 99, recreateRoom: legacy });
    assert.deepStrictEqual(rejected.calls, [['error', '復元データが不完全です']]);
});

runTest('recreate socket handlerはrestore失敗時にhostless coordinatorを進めない', () => {
    const rt = runtime({ handleRecreateRoom() { return { ok: false }; } });
    rt.handlers.recreateRoom({ roomId: 'ABC123' });
    assert.deepStrictEqual(rt.calls, []);
});
