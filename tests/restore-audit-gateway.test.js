'use strict';

const assert = require('assert');
const makeRestoreAuditGateway = require('../server/restoreAuditGateway');
const { runTest } = require('./helpers/test-utils');

function makeSubject(overrides = {}) {
    const calls = [];
    const dependencies = {
        buildSignedRestoreAuditRecord(roomId, payload, options) {
            calls.push(['build', roomId, payload, options]);
            return { signed: true, roomId };
        },
        verifySignedRestoreAuditRecord(record, payload, options) {
            calls.push(['verify', record, payload, options]);
            return { ok: record && record.valid === true };
        },
        buildRestoreSnapshotAuditPayload(gameStartPayload, stateSnapshot) {
            calls.push(['snapshot-payload', gameStartPayload, stateSnapshot]);
            return { kind: 'snapshot', gameStartPayload, stateSnapshot };
        },
        buildRestoreActionAuditPayload(actionEntry) {
            calls.push(['action-payload', actionEntry]);
            return { kind: 'action', actionEntry };
        },
        restoreAuditBuildOptions(now, source) {
            calls.push(['build-options', now, source]);
            return source ? { now, source } : { now };
        },
        restoreAuditVerificationOptions(roomId) {
            calls.push(['verify-options', roomId]);
            return { roomId };
        },
        ...overrides,
    };
    return { gateway: makeRestoreAuditGateway(dependencies), calls };
}

runTest('restore audit gatewayはsnapshot署名のpayloadとoptionを既存順で組み立てる', () => {
    const { gateway, calls } = makeSubject();
    const gameStartPayload = { players: 2 };
    const stateSnapshot = { actionSeq: 4 };

    assert.deepStrictEqual(
        gateway.buildRestoreSnapshotAudit('ROOM1', gameStartPayload, stateSnapshot, 123),
        { signed: true, roomId: 'ROOM1' }
    );
    assert.deepStrictEqual(calls, [
        ['snapshot-payload', gameStartPayload, stateSnapshot],
        ['build-options', 123, undefined],
        ['build', 'ROOM1', { kind: 'snapshot', gameStartPayload, stateSnapshot }, { now: 123 }],
    ]);
});

runTest('restore audit gatewayはsnapshotなしを検証依存へ渡さず許可する', () => {
    const { gateway, calls } = makeSubject();

    assert.strictEqual(gateway.isVerifiedClientRestoreSnapshot('ROOM1', {}, null, null), true);
    assert.deepStrictEqual(calls, []);
});

runTest('restore audit gatewayはsnapshot検証結果だけをbooleanで公開する', () => {
    const record = { valid: true };
    const gameStartPayload = { players: 2 };
    const stateSnapshot = { actionSeq: 4 };
    const { gateway, calls } = makeSubject();

    assert.strictEqual(
        gateway.isVerifiedClientRestoreSnapshot('ROOM1', gameStartPayload, stateSnapshot, record),
        true
    );
    assert.deepStrictEqual(calls, [
        ['snapshot-payload', gameStartPayload, stateSnapshot],
        ['verify-options', 'ROOM1'],
        ['verify', record, { kind: 'snapshot', gameStartPayload, stateSnapshot }, { roomId: 'ROOM1' }],
    ]);
});

runTest('restore audit gatewayはaction署名sourceとentry内audit検証を固定する', () => {
    const actionEntry = { action: 'nextTurn', restoreActionAudit: { valid: false } };
    const { gateway, calls } = makeSubject();

    assert.deepStrictEqual(gateway.buildRestoreActionAudit('ROOM2', actionEntry, 456), {
        signed: true,
        roomId: 'ROOM2',
    });
    assert.strictEqual(gateway.isVerifiedRestoreActionAudit('ROOM2', actionEntry), false);
    assert.deepStrictEqual(calls, [
        ['action-payload', actionEntry],
        ['build-options', 456, 'server-action-log'],
        ['build', 'ROOM2', { kind: 'action', actionEntry }, { now: 456, source: 'server-action-log' }],
        ['action-payload', actionEntry],
        ['verify-options', 'ROOM2'],
        ['verify', actionEntry.restoreActionAudit, { kind: 'action', actionEntry }, { roomId: 'ROOM2' }],
    ]);
});

runTest('restore audit gatewayは不正依存を生成時に拒否する', () => {
    const required = [
        'buildSignedRestoreAuditRecord',
        'verifySignedRestoreAuditRecord',
        'buildRestoreSnapshotAuditPayload',
        'buildRestoreActionAuditPayload',
        'restoreAuditBuildOptions',
        'restoreAuditVerificationOptions',
    ];
    const valid = Object.fromEntries(required.map(name => [name, () => ({ ok: true })]));

    for (const name of required) {
        assert.throws(
            () => makeRestoreAuditGateway({ ...valid, [name]: null }),
            new RegExp(name + ' must be a function')
        );
    }
});
