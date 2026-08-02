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
        isValidGameStartPayload: () => { calls.push('game-start'); return true; },
        hasInvalidOnlineRlModelSettings: () => { calls.push('rl'); return false; },
        normalizePlayerSettings: settings => { calls.push('normalize'); return settings; },
        ...overrides,
    };
    const admission = makeRestoreAdmission(dependencies);
    return {
        calls,
        payload,
        plan: admission.planRestoreAdmission,
        planGameStart: admission.planRestoreGameStartAdmission,
    };
}

runTest('restore admissionは依存を副作用前に検証する', () => {
    assert.throws(() => makeRestoreAdmission({}), /isPlainObject must be a function/);
    assert.throws(() => makeHarness({ normalizePlayerSettings: null }), /normalizePlayerSettings must be a function/);
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

runTest('restore game-start admissionはplayerNamesとpayload検証を正規化前に行う', () => {
    const harness = makeHarness();
    const missingNames = harness.planGameStart({ playerSettings: [] });
    assert.deepStrictEqual(missingNames, { ok: false, errorMessage: '復元データが不完全です', result: undefined });
    assert.deepStrictEqual(harness.calls, []);

    const invalid = makeHarness({ isValidGameStartPayload: () => false });
    invalid.payload.gameStartPayload.playerNames = ['Alice'];
    assert.deepStrictEqual(invalid.planGameStart(invalid.payload.gameStartPayload), {
        ok: false,
        errorMessage: '復元データが不完全です',
        result: undefined,
    });
    assert.deepStrictEqual(invalid.calls, []);
});

runTest('restore game-start admissionはRL拒否後に設定を正規化しない', () => {
    const harness = makeHarness({
        hasInvalidOnlineRlModelSettings: () => { harness.calls.push('rl'); return true; },
    });
    harness.payload.gameStartPayload.playerNames = ['Alice', 'CPU'];
    assert.deepStrictEqual(harness.planGameStart(harness.payload.gameStartPayload), {
        ok: false,
        errorMessage: 'RLモデルIDが無効です',
        result: undefined,
    });
    assert.deepStrictEqual(harness.calls, ['game-start', 'rl']);
});

runTest('restore game-start admissionは検証後の設定と元playerNames参照を返す', () => {
    const normalized = [{ type: 'human' }, { type: 'cpu', difficulty: 'normal' }];
    const harness = makeHarness({
        normalizePlayerSettings: (settings, count) => {
            harness.calls.push('normalize');
            assert.strictEqual(count, 2);
            assert.strictEqual(settings, harness.payload.gameStartPayload.playerSettings);
            return normalized;
        },
    });
    harness.payload.gameStartPayload.playerNames = ['Alice', 'CPU'];
    harness.payload.gameStartPayload.playerSettings = [{ type: 'human' }];
    const result = harness.planGameStart(harness.payload.gameStartPayload);
    assert.deepStrictEqual(harness.calls, ['game-start', 'rl', 'normalize']);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.playerNames, harness.payload.gameStartPayload.playerNames);
    assert.strictEqual(result.playerSettings, normalized);
    assert.strictEqual(harness.payload.gameStartPayload.playerSettings.length, 1);
});
