'use strict';

const assert = require('assert');
const {
    BUILD_ACTIONS,
    CLEAR_UNDO_ACTIONS,
    makeCanonicalMirrorRuntime,
} = require('../server/canonicalMirrorRuntime');
const { runTest } = require('./helpers/test-utils');

function createRuntime(overrides = {}) {
    const calls = [];
    const runtime = makeCanonicalMirrorRuntime({
        roomCanonicalMirrorMarker(room) { calls.push(['marker', room]); return room.marker || { actionSeq: 1, actionLogLength: 0 }; },
        canonicalMirrorStateHash(mirror) { calls.push(['hash', mirror]); return mirror?.hash || null; },
        createRoomMirror(room) { calls.push(['create', room]); return { game: {}, shopStock: {}, hash: 'rebuilt', created: true }; },
        makeUndoStateFromMirror(game, shopStock) { calls.push(['undo', game, shopStock]); return { saved: true }; },
        applyActionToMirror(game, shopStock, action, data, createCardByName) { calls.push(['apply', game, shopStock, action, data, createCardByName]); return true; },
        createCardByName() {},
        now() { return 1234; },
        warn(...args) { calls.push(['warn', ...args]); },
        ...overrides,
    });
    return { runtime, calls };
}

runTest('canonical mirror runtimeはaction分類をfrozen契約にする', () => {
    assert.deepStrictEqual(BUILD_ACTIONS, ['buildCard', 'buildLandmark']);
    assert.deepStrictEqual(CLEAR_UNDO_ACTIONS, ['undoBuild', 'nextTurn']);
    assert.ok(Object.isFrozen(BUILD_ACTIONS));
    assert.ok(Object.isFrozen(CLEAR_UNDO_ACTIONS));
});

runTest('canonical mirror runtimeはreset時にmirror markerとhashを同期する', () => {
    const { runtime, calls } = createRuntime();
    const room = { marker: { actionSeq: 4, actionLogLength: 2 } };

    const mirror = runtime.resetRoomCanonicalMirror(room);
    assert.strictEqual(mirror, room.canonicalMirror);
    assert.strictEqual(room.canonicalMirrorActionSeq, 4);
    assert.strictEqual(room.canonicalMirrorActionLogLength, 2);
    assert.strictEqual(room.canonicalMirrorStateHash, 'rebuilt');
    assert.deepStrictEqual(calls.map(call => call[0]), ['create', 'marker', 'hash']);
});

runTest('canonical mirror runtimeはstale rebuildのhash mismatchを記録して警告する', () => {
    const { runtime, calls } = createRuntime();
    const currentMirror = { game: {}, shopStock: {}, hash: 'corrupt' };
    const room = {
        roomId: 'ROOM01',
        marker: { actionSeq: 2, actionLogLength: 1 },
        canonicalMirror: currentMirror,
        canonicalMirrorActionSeq: 1,
        canonicalMirrorActionLogLength: 1,
        canonicalMirrorStateHash: 'recorded',
    };

    const rebuilt = runtime.getRoomCanonicalMirror(room);
    assert.strictEqual(rebuilt.created, true);
    assert.deepStrictEqual(room.lastCanonicalMirrorMismatch, {
        previousHash: 'corrupt',
        rebuiltHash: 'rebuilt',
        marker: room.marker,
        detectedAt: 1234,
    });
    const warning = calls.find(call => call[0] === 'warn');
    assert.strictEqual(warning[1], 'canonical mirror mismatch detected');
    assert.deepStrictEqual(warning[2], {
        roomId: 'ROOM01',
        previousHash: 'corrupt',
        rebuiltHash: 'rebuilt',
        marker: room.marker,
    });
});

runTest('canonical mirror runtimeはbuild前undoと成功後clearを既存順で適用する', () => {
    const { runtime, calls } = createRuntime();
    const room = {};
    const mirror = { game: {}, shopStock: {}, lastUndoState: null };
    assert.strictEqual(runtime.applyAcceptedActionToRoomCanonicalMirror(
        room, mirror, { action: 'buildCard', data: { cardName: '麦畑' } }
    ), true);
    assert.deepStrictEqual(mirror.lastUndoState, { saved: true });
    assert.strictEqual(room.canonicalMirror, mirror);
    assert.deepStrictEqual(calls.filter(call => call[0] === 'undo').length, 1);
    assert.deepStrictEqual(calls.filter(call => call[0] === 'apply').length, 1);

    mirror.lastUndoState = { saved: true };
    assert.strictEqual(runtime.applyAcceptedActionToRoomCanonicalMirror(
        room, mirror, { action: 'nextTurn', data: {} }
    ), true);
    assert.strictEqual(mirror.lastUndoState, null);
});

runTest('canonical mirror runtimeはaction適用失敗をroomへ採用しない', () => {
    const previous = { old: true };
    const room = { canonicalMirror: previous };
    const mirror = { game: {}, shopStock: {} };
    const { runtime } = createRuntime({ applyActionToMirror() { return false; } });

    assert.strictEqual(runtime.applyAcceptedActionToRoomCanonicalMirror(
        room, mirror, { action: 'rollDice', data: {} }
    ), false);
    assert.strictEqual(room.canonicalMirror, previous);
});

runTest('canonical mirror runtimeは不正な依存をeffects前に拒否する', () => {
    assert.throws(() => makeCanonicalMirrorRuntime({}), /roomCanonicalMirrorMarker must be a function/);
});
