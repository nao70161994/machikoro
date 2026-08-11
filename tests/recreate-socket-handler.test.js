'use strict';

const assert = require('assert');
const RecreateRoomPayload = require('../js/recreateRoomPayload');
const makeRoomLifecycle = require('../server/roomLifecycle');
const {
    makeRecreateAttemptAdmission,
    registerRecreateSocketHandler,
} = require('../server/recreateSocketHandler');
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

runTest('recreate attempt admissionは同一IPのraw・decode・handle失敗を入口で制限する', () => {
    const cases = [
        { name: 'raw', overrides: { validateRawPayload: () => false } },
        { name: 'decode', overrides: { decodePayload: () => ({ ok: false }) } },
        { name: 'handle', overrides: { handleRecreateRoom: () => ({ ok: false }) } },
    ];
    for (const testCase of cases) {
        const admission = makeRecreateAttemptAdmission({ windowMs: 1000, max: 2, maxBuckets: 10 });
        let admitted = 0;
        const overrides = Object.assign({
            isAttemptRateLimited: (socket, now) =>
                admission.isRateLimited(socket.handshake.address, now),
            validateRawPayload: payload => { admitted++; return !!payload; },
        }, testCase.overrides);
        const first = runtime(overrides);
        const second = runtime(overrides);
        const limited = runtime(overrides);
        for (const rt of [first, second, limited]) {
            rt.socket.handshake = { address: 'same-ip' };
        }
        first.handlers.recreateRoom({ roomId: 'ROOM01' });
        second.handlers.recreateRoom({ roomId: 'ROOM01' });
        limited.handlers.recreateRoom({ roomId: 'ROOM01' });
        assert.deepStrictEqual(limited.calls, [[
            'error',
            '復元処理が短時間に集中しています。少し待ってから再試行してください',
        ]], testCase.name);
        if (testCase.name !== 'raw') assert.strictEqual(admitted, 2, testCase.name);
    }
});

runTest('recreate attempt admissionはIPを分離しwindow後にresetする', () => {
    const admission = makeRecreateAttemptAdmission({ windowMs: 1000, max: 1, maxBuckets: 10 });
    assert.strictEqual(admission.isRateLimited('ip-a', 1000), false);
    assert.strictEqual(admission.isRateLimited('ip-a', 1001), true);
    assert.strictEqual(admission.isRateLimited('ip-b', 1001), false);
    assert.strictEqual(admission.isRateLimited('ip-a', 2000), false);
});

runTest('recreate attempt admissionは成功attemptを一度だけ数える', () => {
    const admission = makeRecreateAttemptAdmission({ windowMs: 1000, max: 2, maxBuckets: 10 });
    const shared = {
        isAttemptRateLimited: (_socket, now) => admission.isRateLimited('same-ip', now),
    };
    const successful = runtime(shared);
    const second = runtime(shared);
    const limited = runtime(shared);
    successful.handlers.recreateRoom({ roomId: 'ROOM01' });
    second.handlers.recreateRoom({ roomId: 'ROOM02' });
    limited.handlers.recreateRoom({ roomId: 'ROOM03' });
    assert.strictEqual(successful.calls.some(call => call[0] === 'restored'), true);
    assert.strictEqual(second.calls.some(call => call[0] === 'restored'), true);
    assert.deepStrictEqual(limited.calls, [[
        'error',
        '復元処理が短時間に集中しています。少し待ってから再試行してください',
    ]]);
});

runTest('recreate attempt admissionは通常room作成成功bucketと状態を共有しない', () => {
    const limits = {
        createRoomRateLimitMs: 1000,
        createRoomIpRateLimitWindowMs: 1000,
        createRoomIpRateLimitMax: 1,
        createRoomIpRateLimitMaxBuckets: 10,
        maxRooms: 10,
        pendingRoomTtlMs: 1000,
        startedRoomTtlMs: 1000,
    };
    const lifecycle = makeRoomLifecycle({ limits, defaultRooms: {}, log: { log() {} } });
    const admission = makeRecreateAttemptAdmission({ windowMs: 1000, max: 1, maxBuckets: 10 });
    const socket = { handshake: { address: 'same-ip' } };
    const key = lifecycle.createRoomRateKeyForSocket(socket);

    lifecycle.markCreateRoomForRateKey(key, 1000);
    assert.strictEqual(lifecycle.canCreateRoomForRateKey(key, 1001), false);
    assert.strictEqual(admission.isRateLimited(key, 1001), false);

    const freshLifecycle = makeRoomLifecycle({ limits, defaultRooms: {}, log: { log() {} } });
    const freshAdmission = makeRecreateAttemptAdmission({ windowMs: 1000, max: 1, maxBuckets: 10 });
    assert.strictEqual(freshAdmission.isRateLimited(key, 1000), false);
    assert.strictEqual(freshAdmission.isRateLimited(key, 1001), true);
    assert.strictEqual(freshLifecycle.canCreateRoomForRateKey(key, 1001), true);
});
