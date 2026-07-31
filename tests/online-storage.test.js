'use strict';

const assert = require('assert');
const { createOnlineStorageFacade, maxRestoreActionSeq } = require('../js/onlineStorage');
const { runTest } = require('./helpers/test-utils');

runTest('online storageは復元bundle全体の最大action seqを純粋計算する', () => {
    assert.strictEqual(maxRestoreActionSeq(
        { actionSeq: 4 },
        { actionSeq: 8 },
        [{ seq: 3 }, { seq: 12 }, { seq: '99' }, null],
        { seq: 10 }
    ), 12);
    assert.strictEqual(maxRestoreActionSeq(null, null, null, null), 0);
});

runTest('online storage facadeは既定seq policyと既存注入overrideを維持する', () => {
    const values = new Map([
        ['onlineSession:room:ROOM01', JSON.stringify({ playerName: 'Alice', playerIndex: 0 })],
        ['gameStart:room:ROOM01', JSON.stringify({ actionSeq: 2 })],
        ['actionLog:room:ROOM01', JSON.stringify([{ seq: 5 }])],
        ['stateSnapshot:room:ROOM01', JSON.stringify({ actionSeq: 4 })],
        ['pendingAction:room:ROOM01', JSON.stringify({ seq: 6 })],
    ]);
    const storage = {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, value); },
        removeItem(key) { values.delete(key); },
    };
    const options = {
        storage,
        sessionKey: 'onlineSession',
        storageKeys: {
            gameStart: 'gameStart',
            actionLog: 'actionLog',
            stateSnapshot: 'stateSnapshot',
            pendingAction: 'pendingAction',
            restoreAudit: 'restoreAudit',
        },
        roomIndexKey: 'onlineRestoreRoomIndex',
        roomKeySeparator: ':room:',
    };
    assert.strictEqual(createOnlineStorageFacade(options).buildRestoreRoomIndexEntry('room01', 100).actionSeq, 6);
    assert.strictEqual(createOnlineStorageFacade({
        ...options,
        maxRestoreActionSeq: () => 42,
    }).buildRestoreRoomIndexEntry('room01', 100).actionSeq, 42);
});
