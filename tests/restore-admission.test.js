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
        getExpectedReconnectTokenHash: () => { calls.push('expected-token'); return 'expected-hash'; },
        hashReconnectToken: () => { calls.push('hash-token'); return 'expected-hash'; },
        isValidRestoreReconnectTokenHashes: () => { calls.push('token-hashes'); return true; },
        buildRestoredHumanPlayers: () => { calls.push('players'); return [{ index: 0 }]; },
        sanitizeRestoreActionLog: log => { calls.push('sanitize-existing'); return log; },
        restoreAuditSecret: () => { calls.push('secret-existing'); return 'secret'; },
        canReplaceRestoredRoom: () => { calls.push('replace-existing'); return true; },
        isIncomingRestoreNewer: () => { calls.push('newer-existing'); return false; },
        decideExistingRoomRestore: input => {
            calls.push('decision-existing');
            if (input.incomingCanReplace) return { action: 'replace' };
            if (input.existingHostRestoreAuthenticated && input.incomingRestoreNewer) {
                return { action: 'reject' };
            }
            return { action: 'rejoin' };
        },
        ...overrides,
    };
    const admission = makeRestoreAdmission(dependencies);
    return {
        calls,
        payload,
        plan: admission.planRestoreAdmission,
        planGameStart: admission.planRestoreGameStartAdmission,
        planIdentity: admission.planRestoreIdentityAdmission,
        planExisting: admission.planExistingRoomRestoreAdmission,
    };
}

runTest('restore admissionは依存を副作用前に検証する', () => {
    assert.throws(() => makeRestoreAdmission({}), /isPlainObject must be a function/);
    assert.throws(() => makeHarness({ normalizePlayerSettings: null }), /normalizePlayerSettings must be a function/);
    assert.throws(() => makeHarness({ buildRestoredHumanPlayers: null }), /buildRestoredHumanPlayers must be a function/);
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

function existingRoomInput(harness, overrides = {}) {
    const gameStartPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
    };
    return {
        room: { started: true, hostPlayerIndex: 1 },
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token',
        actionLog: [{ action: 'nextTurn', seq: 8 }],
        replayStateSnapshot: { actionSeq: 7 },
        canonicalRecord: null,
        gameStartPayload,
        clientSnapshotTrusted: true,
        ...overrides,
    };
}

runTest('existing room restore admissionは未開始roomをtoken処理前に拒否する', () => {
    const harness = makeHarness();
    assert.deepStrictEqual(harness.planExisting(existingRoomInput(harness, {
        room: { started: false, hostPlayerIndex: 1 },
    })), {
        ok: false,
        errorMessage: '同じルームIDが既に使用されています',
        result: undefined,
    });
    assert.deepStrictEqual(harness.calls, []);
});

runTest('existing room restore admissionはhost認証とsanitize後だけ置換を許可する', () => {
    const harness = makeHarness({
        sanitizeRestoreActionLog: (log, roomId, snapshot, options) => {
            harness.calls.push('sanitize-existing');
            const input = existingRoomInput(harness);
            assert.strictEqual(log[0].seq, input.actionLog[0].seq);
            assert.strictEqual(roomId, input.roomId);
            assert.strictEqual(snapshot.actionSeq, input.replayStateSnapshot.actionSeq);
            assert.deepStrictEqual(options, { requireSignedActionAudit: true });
            return log;
        },
    });
    const result = harness.planExisting(existingRoomInput(harness));
    assert.deepStrictEqual(result, { ok: true, action: 'replace' });
    assert.strictEqual(Object.isFrozen(result), true);
    assert.deepStrictEqual(harness.calls, [
        'expected-token',
        'hash-token',
        'secret-existing',
        'sanitize-existing',
        'game-start',
        'rl',
        'replace-existing',
        'decision-existing',
    ]);
});

runTest('existing room restore admissionはnewerなhost復元破損を再join前に拒否する', () => {
    const harness = makeHarness({
        canReplaceRestoredRoom: () => { harness.calls.push('replace-existing'); return false; },
        isIncomingRestoreNewer: () => { harness.calls.push('newer-existing'); return true; },
    });
    assert.deepStrictEqual(harness.planExisting(existingRoomInput(harness)), {
        ok: false,
        errorMessage: '復元データが壊れています',
        result: undefined,
    });
    assert.deepStrictEqual(harness.calls, [
        'expected-token', 'hash-token', 'secret-existing', 'sanitize-existing',
        'game-start', 'rl', 'replace-existing', 'newer-existing', 'decision-existing',
    ]);
});

runTest('existing room restore admissionは認証済みhostの通常再joinを維持する', () => {
    const harness = makeHarness({
        canReplaceRestoredRoom: () => { harness.calls.push('replace-existing'); return false; },
    });
    assert.deepStrictEqual(harness.planExisting(existingRoomInput(harness)), {
        ok: true,
        action: 'rejoin',
    });
    assert.deepStrictEqual(harness.calls, [
        'expected-token', 'hash-token', 'secret-existing', 'sanitize-existing',
        'game-start', 'rl', 'replace-existing', 'newer-existing', 'decision-existing',
    ]);
});

runTest('existing room restore admissionは不正tokenをsanitize前に即拒否する', () => {
    const harness = makeHarness({
        hashReconnectToken: () => { harness.calls.push('hash-token'); return 'wrong-hash'; },
    });
    assert.deepStrictEqual(harness.planExisting(existingRoomInput(harness)), {
        ok: false,
        errorMessage: 'INVALID_TOKEN',
        result: undefined,
    });
    assert.deepStrictEqual(harness.calls, ['expected-token', 'hash-token']);
});

runTest('existing room restore admissionは認証済みguestを通常rejoinへ通す', () => {
    const harness = makeHarness({
        canReplaceRestoredRoom: () => { harness.calls.push('replace-existing'); return false; },
    });
    assert.deepStrictEqual(harness.planExisting(existingRoomInput(harness, {
        room: { started: true, hostPlayerIndex: 0 },
    })), {
        ok: true,
        action: 'rejoin',
    });
    assert.deepStrictEqual(harness.calls, [
        'expected-token', 'hash-token', 'secret-existing', 'sanitize-existing',
        'game-start', 'rl', 'decision-existing',
    ]);
});

runTest('existing room restore admissionはsanitize失敗を置換根拠にせず再joinへ倒す', () => {
    const harness = makeHarness({
        sanitizeRestoreActionLog: () => { harness.calls.push('sanitize-existing'); return null; },
    });
    assert.deepStrictEqual(harness.planExisting(existingRoomInput(harness)), {
        ok: true,
        action: 'rejoin',
    });
    assert.deepStrictEqual(harness.calls, [
        'expected-token', 'hash-token', 'secret-existing', 'sanitize-existing',
        'newer-existing', 'decision-existing',
    ]);
});

function identityInput(harness, overrides = {}) {
    const gameStartPayload = {
        ...harness.payload.gameStartPayload,
        playerNames: ['Alice', 'Bob'],
        hostPlayerIndex: 0,
        reconnectTokenHashes: ['expected-hash', 'bob-hash'],
    };
    return {
        gameStartPayload,
        playerNames: gameStartPayload.playerNames,
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken: 'token',
        approvedHostless: false,
        socketId: 'socket-1',
        ...overrides,
    };
}

runTest('restore identity admissionはplayer indexをtoken処理前に拒否する', () => {
    const harness = makeHarness();
    assert.deepStrictEqual(harness.planIdentity(identityInput(harness, { playerIndex: -1 })), {
        ok: false,
        errorMessage: '復元データが不完全です',
        result: undefined,
    });
    assert.deepStrictEqual(harness.calls, []);
});

runTest('restore identity admissionはexpected tokenなしでhash計算を呼ばない', () => {
    const harness = makeHarness({
        getExpectedReconnectTokenHash: () => { harness.calls.push('expected-token'); return ''; },
    });
    assert.deepStrictEqual(harness.planIdentity(identityInput(harness)), {
        ok: false,
        errorMessage: 'INVALID_TOKEN',
        result: undefined,
    });
    assert.deepStrictEqual(harness.calls, ['expected-token']);
});

runTest('restore identity admissionはtoken後に通常復元の元host制約を適用する', () => {
    const harness = makeHarness();
    const input = identityInput(harness);
    input.gameStartPayload.hostPlayerIndex = 1;
    assert.deepStrictEqual(harness.planIdentity(input), {
        ok: false,
        errorMessage: '復元は元のホストのみ実行できます',
        result: undefined,
    });
    assert.deepStrictEqual(harness.calls, ['expected-token', 'hash-token']);
});

runTest('restore identity admissionはhostlessだけ元host制約を省略する', () => {
    const harness = makeHarness();
    const input = identityInput(harness, { approvedHostless: true });
    input.gameStartPayload.hostPlayerIndex = 1;
    const result = harness.planIdentity(input);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(harness.calls, ['expected-token', 'hash-token', 'token-hashes', 'players']);
});

runTest('restore identity admissionはtoken hash集合検証後だけplayerを生成する', () => {
    const invalid = makeHarness({
        isValidRestoreReconnectTokenHashes: () => { invalid.calls.push('token-hashes'); return false; },
    });
    assert.deepStrictEqual(invalid.planIdentity(identityInput(invalid)), {
        ok: false,
        errorMessage: '復元データが不完全です',
        result: undefined,
    });
    assert.deepStrictEqual(invalid.calls, ['expected-token', 'hash-token', 'token-hashes']);

    const restoredPlayers = [{ id: 'socket-1', index: 0 }];
    const valid = makeHarness({
        getExpectedReconnectTokenHash: (room, playerIndex, playerName) => {
            valid.calls.push('expected-token');
            assert.deepStrictEqual(room.players, []);
            assert.strictEqual(room.gameStartPayload, input.gameStartPayload);
            assert.strictEqual(playerIndex, 0);
            assert.strictEqual(playerName, 'Alice');
            return 'expected-hash';
        },
        buildRestoredHumanPlayers: (payload, playerIndex, socketId) => {
            valid.calls.push('players');
            assert.strictEqual(payload, input.gameStartPayload);
            assert.strictEqual(playerIndex, 0);
            assert.strictEqual(socketId, 'socket-1');
            return restoredPlayers;
        },
    });
    const input = identityInput(valid);
    const result = valid.planIdentity(input);
    assert.deepStrictEqual(valid.calls, ['expected-token', 'hash-token', 'token-hashes', 'players']);
    assert.strictEqual(result.restoredPlayers, restoredPlayers);
});
