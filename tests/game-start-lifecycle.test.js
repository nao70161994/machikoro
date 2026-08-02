'use strict';

const assert = require('assert');
const makeGameStartLifecycle = require('../server/gameStartLifecycle');
const { runTest } = require('./helpers/test-utils');

runTest('game start lifecycleはroom初期化、mirror reset、時刻、永続化の順を維持する', () => {
    const calls = [];
    const payload = { playerNames: ['Alice'] };
    const room = {
        roomId: 'ROOM01',
        started: false,
        gameStartPayload: { old: true },
        stateSnapshot: { actionSeq: 4 },
        actionLog: [{ seq: 5 }],
        lastUndoState: { old: true },
        lastTouchedAt: 10,
    };
    const { markRoomGameStarted } = makeGameStartLifecycle({
        resetRoomCanonicalMirror(candidate) {
            calls.push('reset');
            assert.strictEqual(candidate.started, true);
            assert.strictEqual(candidate.gameStartPayload, payload);
            assert.strictEqual(candidate.stateSnapshot, null);
            assert.deepStrictEqual(candidate.actionLog, []);
            assert.strictEqual(candidate.lastUndoState, null);
            assert.strictEqual(candidate.lastTouchedAt, 10);
            candidate.canonicalMirror = { ready: true };
        },
        persistRoomCanonicalState(roomId, candidate, reason, now) {
            calls.push('persist');
            assert.strictEqual(roomId, 'ROOM01');
            assert.strictEqual(candidate, room);
            assert.strictEqual(reason, 'game-start');
            assert.strictEqual(now, 1234);
            assert.strictEqual(candidate.lastTouchedAt, 1234);
        },
    });

    assert.strictEqual(markRoomGameStarted(room, payload, 1234), undefined);
    assert.deepStrictEqual(calls, ['reset', 'persist']);
    assert.deepStrictEqual(room.canonicalMirror, { ready: true });
});

runTest('game start lifecycleは不正な注入依存をroom変更前に拒否する', () => {
    assert.throws(() => makeGameStartLifecycle({}), /resetRoomCanonicalMirror must be a function/);
    assert.throws(
        () => makeGameStartLifecycle({ resetRoomCanonicalMirror() {} }),
        /persistRoomCanonicalState must be a function/
    );
});
