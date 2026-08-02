const assert = require('assert');
const {
    MAX_ACCEPTED_CLIENT_ACTIONS,
    acceptedClientActionKey,
    findAcceptedClientAction,
    rememberAcceptedClientAction,
    acceptedClientActionRefs,
    makeNextRoomActionSeq,
} = require('../server/actionAcceptance');
const { runTest } = require('./helpers/test-utils');

runTest('action acceptance は同じclient action IDをplayer別に保持する', () => {
    const room = { acceptedClientActions: {}, actionLog: [] };
    const first = { playerIndex: 0, clientActionId: 'same-id', seq: 1 };
    const second = { playerIndex: 1, clientActionId: 'same-id', seq: 2 };

    rememberAcceptedClientAction(room, first);
    rememberAcceptedClientAction(room, second);

    assert.strictEqual(room.acceptedClientActions[acceptedClientActionKey(0, 'same-id')], first);
    assert.strictEqual(findAcceptedClientAction(room, 'same-id', 0), first);
    assert.strictEqual(findAcceptedClientAction(room, 'same-id', 1), second);
});

runTest('action acceptance は旧cache keyとaction logをfallback検索する', () => {
    const legacy = { playerIndex: 0, clientActionId: 'legacy', seq: 4 };
    const logged = { playerIndex: 1, clientActionId: 'logged', seq: 5 };
    const room = { acceptedClientActions: { legacy }, actionLog: [logged] };

    assert.strictEqual(findAcceptedClientAction(room, 'legacy', 0), legacy);
    assert.strictEqual(findAcceptedClientAction(room, 'logged', 1), logged);
    assert.strictEqual(findAcceptedClientAction(room, 'logged', 0), null);
});

runTest('action acceptance は新しい100件だけを保持して最小ACK参照へ変換する', () => {
    const room = { acceptedClientActions: {}, actionLog: [] };
    for (let seq = 1; seq <= MAX_ACCEPTED_CLIENT_ACTIONS + 1; seq++) {
        rememberAcceptedClientAction(room, { playerIndex: 0, clientActionId: `id-${seq}`, seq, action: 'nextTurn' });
    }

    assert.strictEqual(Object.keys(room.acceptedClientActions).length, MAX_ACCEPTED_CLIENT_ACTIONS);
    assert.strictEqual(findAcceptedClientAction(room, 'id-1', 0), null);
    assert.deepStrictEqual(acceptedClientActionRefs(room)[0], { playerIndex: 0, clientActionId: 'id-2', seq: 2 });
    assert.ok(acceptedClientActionRefs(room).every(ref => !Object.hasOwn(ref, 'action')));
});

runTest('action acceptance はroom sequenceをrestore rank fallbackから進めpayloadへ同期する', () => {
    const calls = [];
    const nextRoomActionSeq = makeNextRoomActionSeq((gameStartPayload, stateSnapshot, actionLog) => {
        calls.push([gameStartPayload, stateSnapshot, actionLog]);
        return { actionSeq: 7 };
    });
    const room = { gameStartPayload: { actionSeq: 2 }, stateSnapshot: { actionSeq: 5 }, actionLog: [{ seq: 6 }] };

    assert.strictEqual(nextRoomActionSeq(room), 8);
    assert.strictEqual(room.actionSeq, 8);
    assert.strictEqual(room.gameStartPayload.actionSeq, 8);
    assert.deepStrictEqual(calls, [[room.gameStartPayload, room.stateSnapshot, room.actionLog]]);
    room.actionSeq = 10;
    assert.strictEqual(nextRoomActionSeq(room), 11);
    assert.strictEqual(room.gameStartPayload.actionSeq, 11);
    assert.strictEqual(calls.length, 1);
});

runTest('action acceptance sequence factoryは不正なrank依存を副作用前に拒否する', () => {
    assert.throws(() => makeNextRoomActionSeq(null), /resolveRestoreRank must be a function/);
});
