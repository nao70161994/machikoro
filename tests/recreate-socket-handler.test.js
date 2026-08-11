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
    let currentTime = 1000;
    registerRecreateSocketHandler(socket, Object.assign({
        now: () => currentTime,
        validateRawPayload(payload) {
            calls.push(['preflight', payload]);
            return true;
        },
        decodePayload: payload => RecreateRoomPayload.decode(true, payload),
        emitAppError(_socket, message) { calls.push(['error', message]); },
        handleRecreateRoom(_socket, payload) {
            calls.push(['handle', payload]);
            return { ok: true, roomId: payload.roomId };
        },
        hostRestored(roomId) { calls.push(['restored', roomId]); },
    }, overrides));
    return { handlers, calls, socket, advance(ms) { currentTime += ms; } };
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
        ['preflight', { schemaVersion: 1, recreateRoom: payload }],
        ['handle', payload],
        ['restored', 'ABC123'],
    ]);
});

runTest('recreate socket handlerはlegacyを受理しdecode失敗を後続復元前に拒否する', () => {
    const rt = runtime();
    const legacy = { roomId: 'ABC123' };
    rt.handlers.recreateRoom(legacy);
    assert.deepStrictEqual(rt.calls, [
        ['preflight', legacy],
        ['handle', legacy],
        ['restored', 'ABC123'],
    ]);

    const rejected = runtime();
    rejected.handlers.recreateRoom({ schemaVersion: 99, recreateRoom: legacy });
    assert.deepStrictEqual(rejected.calls, [
        ['preflight', { schemaVersion: 99, recreateRoom: legacy }],
        ['error', '復元データが不完全です'],
    ]);
    rejected.handlers.recreateRoom({ schemaVersion: 1, recreateRoom: legacy });
    assert.deepStrictEqual(rejected.calls.slice(2), [
        ['error', '復元処理を続けて実行できません'],
    ]);
    rejected.advance(1000);
    rejected.handlers.recreateRoom({ schemaVersion: 1, recreateRoom: legacy });
    assert.deepStrictEqual(rejected.calls.slice(3), [
        ['preflight', { schemaVersion: 1, recreateRoom: legacy }],
        ['handle', legacy],
        ['restored', 'ABC123'],
    ]);
});

runTest('recreate socket handlerはrestore失敗時にhostless coordinatorを進めない', () => {
    const rt = runtime({ handleRecreateRoom() { return { ok: false }; } });
    rt.handlers.recreateRoom({ roomId: 'ABC123' });
    assert.deepStrictEqual(rt.calls, [['preflight', { roomId: 'ABC123' }]]);
});

runTest('recreate socket handlerはraw上限をdecode前に拒否して連投を抑止する', () => {
    let decoded = 0;
    const oversized = runtime({
        validateRawPayload: () => false,
        decodePayload() { decoded++; return { ok: true, value: {} }; },
    });
    oversized.handlers.recreateRoom({ actionLog: Array.from({ length: 1001 }, () => ({})) });
    assert.strictEqual(decoded, 0);
    assert.deepStrictEqual(oversized.calls, [['error', '復元データが不完全です']]);

    oversized.handlers.recreateRoom({ roomId: 'ABC123' });
    assert.deepStrictEqual(oversized.calls[1], ['error', '復元処理を続けて実行できません']);
    oversized.advance(1000);
    oversized.handlers.recreateRoom({ roomId: 'ABC123' });
    assert.strictEqual(decoded, 0);
});

runTest('recreate socket handlerはraw・decode・handle拒否を同じcooldownで抑止する', () => {
    const cases = [
        {
            name: 'raw',
            overrides: { validateRawPayload: () => false },
        },
        {
            name: 'decode',
            overrides: { decodePayload: () => ({ ok: false }) },
        },
        {
            name: 'handle',
            overrides: { handleRecreateRoom: () => ({ ok: false }) },
        },
    ];
    for (const testCase of cases) {
        let handled = 0;
        const rt = runtime(Object.assign({
            handleRecreateRoom() {
                handled++;
                return { ok: false };
            },
        }, testCase.overrides));
        rt.handlers.recreateRoom({ roomId: 'ABC123' });
        const callsAfterFirst = rt.calls.length;
        rt.handlers.recreateRoom({ roomId: 'ABC123' });
        assert.deepStrictEqual(
            rt.calls.slice(callsAfterFirst),
            [['error', '復元処理を続けて実行できません']],
            testCase.name
        );
        assert.ok(Number.isFinite(rt.socket.lastRecreateRoomAt), testCase.name);
        assert.ok(handled <= 1, testCase.name);
    }
});
