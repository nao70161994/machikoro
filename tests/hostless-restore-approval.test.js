'use strict';

const assert = require('assert');
const makeHostlessRestoreApproval = require('../server/hostlessRestoreApproval');
const { runTest } = require('./helpers/test-utils');

runTest('hostless restore approvalは依存不足をeffect前に拒否する', () => {
    assert.throws(() => makeHostlessRestoreApproval(), /hasRoom/);
    assert.throws(() => makeHostlessRestoreApproval({ hasRoom() {} }), /recreateRoom/);
});

runTest('hostless restore approvalはroom idを正規化し既存roomを先に拒否する', () => {
    const calls = [];
    const approval = makeHostlessRestoreApproval({
        hasRoom(roomId) { calls.push(['hasRoom', roomId]); return true; },
        recreateRoom() { calls.push(['recreateRoom']); },
        roomForId() { calls.push(['roomForId']); },
    });
    assert.deepStrictEqual(approval.approve({}, { roomId: ' ab12cd ' }), {
        ok: false,
        reason: 'room-exists',
    });
    assert.deepStrictEqual(calls, [['hasRoom', 'AB12CD']]);
});

runTest('hostless restore approvalは承認metadataを渡しprovisional roomだけ成功にする', () => {
    const calls = [];
    const socket = { id: 'socket-1' };
    const payload = { roomId: 'abc123' };
    const approval = makeHostlessRestoreApproval({
        hasRoom(roomId) { calls.push(['hasRoom', roomId]); return false; },
        recreateRoom(actualSocket, actualPayload, options) {
            calls.push(['recreateRoom', actualSocket, actualPayload, options]);
            return { ok: true };
        },
        roomForId(roomId) {
            calls.push(['roomForId', roomId]);
            return { provisionalRestore: true };
        },
    });
    assert.deepStrictEqual(approval.approve(socket, payload, { candidateCount: 4 }), { ok: true });
    assert.deepStrictEqual(calls, [
        ['hasRoom', 'ABC123'],
        ['recreateRoom', socket, payload, { approvedHostless: true, candidateCount: 4 }],
        ['roomForId', 'ABC123'],
    ]);
});

runTest('hostless restore approvalはrecreate失敗理由とprovisional欠落を保持する', () => {
    let roomReads = 0;
    const failed = makeHostlessRestoreApproval({
        hasRoom: () => false,
        recreateRoom: () => ({ ok: false, reason: 'audit-failed' }),
        roomForId: () => { roomReads++; return null; },
    });
    assert.deepStrictEqual(failed.approve({}, { roomId: 'ABC123' }), {
        ok: false,
        reason: 'audit-failed',
    });
    assert.strictEqual(roomReads, 0);

    const notProvisional = makeHostlessRestoreApproval({
        hasRoom: () => false,
        recreateRoom: () => ({ ok: true }),
        roomForId: () => ({ provisionalRestore: false }),
    });
    assert.deepStrictEqual(notProvisional.approve({}, { roomId: 'ABC123' }), {
        ok: false,
        reason: 'restore-failed',
    });
});
