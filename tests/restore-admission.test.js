'use strict';

const assert = require('assert');
const makeRestoreAdmission = require('../server/restoreAdmission');
const { runTest } = require('./helpers/test-utils');

function makeHarness(overrides = {}) {
    const calls = [];
    const payload = {
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token',
        gameStartPayload: { source: 'client' },
        stateSnapshot: { source: 'client' },
        actionLog: [{ action: 'rollDice' }],
        restoreAudit: { signature: 'audit' },
    };
    const dependencies = {
        isPlainObject: value => { calls.push('plain'); return !!value && !Array.isArray(value); },
        validateRestorePayloadLimits: () => { calls.push('limits'); return { ok: true }; },
        isValidRoomId: () => { calls.push('room-id'); return true; },
        hasOwnRoom: () => { calls.push('has-room'); return false; },
        loadRoomCanonicalStateRecord: () => { calls.push('load'); return null; },
        selectRestoreSource: (receivedPayload, receivedCanonical, options) => {
            calls.push('source');
            assert.strictEqual(receivedPayload, payload);
            assert.strictEqual(receivedCanonical, null);
            assert.deepStrictEqual(options, { approvedHostless: false });
            return {
                canonicalRecord: receivedCanonical,
                gameStartPayload: receivedPayload.gameStartPayload,
                stateSnapshot: receivedPayload.stateSnapshot,
                actionLog: receivedPayload.actionLog,
            };
        },
        validateRestoreAuditRecord: () => { calls.push('audit'); return { ok: true }; },
        isVerifiedClientRestoreSnapshot: () => { calls.push('verify'); return true; },
        ...overrides,
    };
    return { calls, payload, plan: makeRestoreAdmission(dependencies).planRestoreAdmission };
}

runTest('restore admissionは依存を副作用前に検証する', () => {
    assert.throws(() => makeRestoreAdmission({}), /isPlainObject must be a function/);
});

runTest('restore admissionは入口拒否の順序と既存messageを固定する', () => {
    const fixtures = [
        [{ isPlainObject: () => false }, null, '復元データが不完全です', []],
        [{ validateRestorePayloadLimits: () => ({ ok: false }) }, {}, '復元データが大きすぎます', ['plain']],
        [{}, { roomId: '', gameStartPayload: {}, reconnectToken: 'token' }, '復元データが不完全です', ['plain', 'limits']],
        [{ isValidRoomId: () => false }, {}, '復元データが不完全です', ['plain', 'limits']],
    ];
    for (const [overrides, payloadOverride, errorMessage, expectedCalls] of fixtures) {
        const harness = makeHarness(overrides);
        const input = payloadOverride === null ? null : { ...harness.payload, ...payloadOverride };
        const result = harness.plan(input);
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.errorMessage, errorMessage);
        assert.strictEqual(result.result, undefined);
        assert.deepStrictEqual(harness.calls, expectedCalls);
    }
});

runTest('restore admissionは通常復元のauthorityとtrust判定順を固定する', () => {
    const harness = makeHarness();
    const result = harness.plan(harness.payload);
    assert.deepStrictEqual(harness.calls, ['plain', 'limits', 'room-id', 'load', 'source', 'audit', 'verify']);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.approvedHostless, false);
    assert.strictEqual(result.gameStartPayload, harness.payload.gameStartPayload);
    assert.strictEqual(result.stateSnapshot, harness.payload.stateSnapshot);
    assert.strictEqual(result.actionLog, harness.payload.actionLog);
    assert.strictEqual(result.clientSnapshotTrusted, true);
    assert.strictEqual(result.replayStateSnapshot, harness.payload.stateSnapshot);
});

runTest('restore admissionはcanonical recordがあればclient snapshot署名検証を省略する', () => {
    const canonical = { source: 'canonical' };
    const harness = makeHarness({
        loadRoomCanonicalStateRecord: () => { harness.calls.push('load'); return canonical; },
        selectRestoreSource: payload => {
            harness.calls.push('source');
            return {
                canonicalRecord: canonical,
                gameStartPayload: payload.gameStartPayload,
                stateSnapshot: payload.stateSnapshot,
                actionLog: payload.actionLog,
            };
        },
    });
    const result = harness.plan(harness.payload);
    assert.deepStrictEqual(harness.calls, ['plain', 'limits', 'room-id', 'load', 'source', 'audit']);
    assert.strictEqual(result.canonicalRecord, canonical);
    assert.strictEqual(result.clientSnapshotTrusted, true);
});

runTest('restore admissionはaudit拒否後にsnapshot署名を検証しない', () => {
    const harness = makeHarness({ validateRestoreAuditRecord: () => { harness.calls.push('audit'); return { ok: false }; } });
    assert.deepStrictEqual(harness.plan(harness.payload), {
        ok: false,
        errorMessage: '復元署名メタデータが無効です',
        result: undefined,
    });
    assert.deepStrictEqual(harness.calls, ['plain', 'limits', 'room-id', 'load', 'source', 'audit']);
});

runTest('restore admissionはhostless承認時に既存roomを最優先で拒否する', () => {
    const harness = makeHarness({ hasOwnRoom: () => { harness.calls.push('has-room'); return true; } });
    assert.deepStrictEqual(harness.plan(harness.payload, { approvedHostless: true }), {
        ok: false,
        errorMessage: '同じルームIDが既に使用されています',
        result: { ok: false, reason: 'room-exists' },
    });
    assert.deepStrictEqual(harness.calls, ['plain', 'limits', 'room-id', 'has-room']);
});

runTest('restore admissionはhostless承認時にcanonicalとaudit署名authorityを使わない', () => {
    const harness = makeHarness({
        selectRestoreSource: (payload, canonical, options) => {
            harness.calls.push('source');
            assert.strictEqual(canonical, null);
            assert.deepStrictEqual(options, { approvedHostless: true });
            return {
                canonicalRecord: null,
                gameStartPayload: payload.gameStartPayload,
                stateSnapshot: payload.stateSnapshot,
                actionLog: payload.actionLog,
            };
        },
    });
    const result = harness.plan(harness.payload, { approvedHostless: true });
    assert.deepStrictEqual(harness.calls, ['plain', 'limits', 'room-id', 'has-room', 'source']);
    assert.strictEqual(result.clientSnapshotTrusted, true);
    assert.strictEqual(result.replayStateSnapshot, harness.payload.stateSnapshot);
});

runTest('restore admissionはsnapshotなしの既存null trust値を維持する', () => {
    const harness = makeHarness();
    harness.payload.stateSnapshot = null;
    const result = harness.plan(harness.payload);
    assert.deepStrictEqual(harness.calls, ['plain', 'limits', 'room-id', 'load', 'source', 'audit']);
    assert.strictEqual(result.clientSnapshotTrusted, null);
    assert.strictEqual(result.replayStateSnapshot, null);
});
