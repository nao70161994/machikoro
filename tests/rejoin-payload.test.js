const assert = require('assert');
const makeRejoinPayload = require('../server/rejoinPayload');
const { runTest } = require('./helpers/test-utils');

function makeSubject() {
    const calls = [];
    const acceptedClientActions = [{ playerIndex: 0, clientActionId: 'action-1', seq: 4 }];
    const { buildRejoinDataPayload } = makeRejoinPayload({
        acceptedClientActionRefs(room) {
            calls.push(['accepted', room]);
            return acceptedClientActions;
        },
        buildRestoreSnapshotAudit(roomId, gameStartPayload, stateSnapshot) {
            calls.push(['audit', roomId, gameStartPayload, stateSnapshot]);
            return { roomId, snapshotSeq: stateSnapshot && stateSnapshot.actionSeq };
        },
    });
    return { buildRejoinDataPayload, calls, acceptedClientActions };
}

runTest('rejoin payloadは既存room stateとACK metadataを同じshapeで返す', () => {
    const subject = makeSubject();
    const room = {
        roomId: 'ABC123',
        gameStartPayload: { playerNames: ['Alice', 'Bob'] },
        stateSnapshot: { actionSeq: 3 },
        actionLog: [{ action: 'nextTurn', data: {}, seq: 4 }],
        hostPlayerIndex: 1,
        hostEpoch: 2,
    };

    const payload = subject.buildRejoinDataPayload(room, 0);

    assert.deepStrictEqual(payload, {
        gameStartPayload: room.gameStartPayload,
        stateSnapshot: room.stateSnapshot,
        actionLog: room.actionLog,
        acceptedClientActions: subject.acceptedClientActions,
        playerIndex: 0,
        hostPlayerIndex: 1,
        hostEpoch: 2,
        restoreAudit: { roomId: 'ABC123', snapshotSeq: 3 },
    });
    assert.deepStrictEqual(subject.calls, [
        ['accepted', room],
        ['audit', 'ABC123', room.gameStartPayload, room.stateSnapshot],
    ]);
});

runTest('rejoin payload overrideはnullと空配列を含む既存の優先規則を維持する', () => {
    const subject = makeSubject();
    const room = {
        roomId: 'ABC123',
        gameStartPayload: { playerNames: ['old'] },
        stateSnapshot: { actionSeq: 3 },
        actionLog: [{ action: 'nextTurn' }],
        hostPlayerIndex: 1,
        hostEpoch: 2,
    };
    const gameStartPayload = { playerNames: ['new'] };

    const payload = subject.buildRejoinDataPayload(room, 1, {
        gameStartPayload,
        stateSnapshot: null,
        actionLog: [],
        hostPlayerIndex: 0,
        hostEpoch: 9,
        restoreAudit: null,
    });

    assert.strictEqual(payload.gameStartPayload, gameStartPayload);
    assert.strictEqual(payload.stateSnapshot, null);
    assert.deepStrictEqual(payload.actionLog, []);
    assert.strictEqual(payload.hostPlayerIndex, 0);
    assert.strictEqual(payload.hostEpoch, 9);
    assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'restoreAudit'));
    assert.deepStrictEqual(subject.calls, [['accepted', room]]);
});

runTest('暫定hostless restore metadataは対象roomにだけ付与する', () => {
    const subject = makeSubject();
    const baseRoom = {
        roomId: 'ABC123',
        gameStartPayload: {},
        actionLog: [],
        hostPlayerIndex: 0,
    };

    const normal = subject.buildRejoinDataPayload(baseRoom, 0, { restoreAudit: null });
    assert.ok(!Object.prototype.hasOwnProperty.call(normal, 'provisionalRestore'));

    const provisional = subject.buildRejoinDataPayload({
        ...baseRoom,
        provisionalRestore: true,
        hostlessRestoreGeneration: 5,
        hostlessRestoreCount: 2,
    }, 0, { restoreAudit: null });
    assert.strictEqual(provisional.provisionalRestore, true);
    assert.strictEqual(provisional.hostlessRestoreGeneration, 5);
    assert.strictEqual(provisional.hostlessRestoreCount, 2);
});
