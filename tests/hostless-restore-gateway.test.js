const assert = require('assert');
const crypto = require('crypto');
const {
    HOSTLESS_RESTORE_SCHEMA_VERSION,
} = require('../server/hostlessRestoreCandidate');
const {
    makeHostlessRestoreGateway,
} = require('../server/hostlessRestoreGateway');
const {
    buildSignedRestoreAuditRecord,
    validateRestoreAuditRecord,
    verifySignedRestoreAuditRecord,
} = require('../server/restoreAudit');


function runTest(name, fn) {
    try {
        fn();
        console.log(`テスト成功: ${name}`);
    } catch (error) {
        console.error(`テスト失敗: ${name}`);
        throw error;
    }
}

function startPayload(overrides = {}) {
    return Object.assign({
        schemaVersion: 2,
        playerNames: ['Host', 'Guest', 'Guest2'],
        playerSettings: [{ type: 'human' }, { type: 'human' }, { type: 'human' }],
        playerOrder: [2, 0, 1],
        hostPlayerIndex: 0,
        hostEpoch: 4,
        actionSeq: 7,
        gameSchema: { actionVersion: 1, snapshotVersion: 1 },
        reconnectTokenHashes: ['hash-host', 'hash-guest', 'hash-guest2'],
        hostlessRestoreCapabilities: [1, 1, 1],
        hostlessRestoreGeneration: 2,
        hostlessRestoreCount: 1,
        ignoredFutureField: 'not-canonical',
    }, overrides);
}

function makeGateway(overrides = {}) {
    return makeHostlessRestoreGateway(Object.assign({
        crypto,
        isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
        isValidRoomId: roomId => roomId === 'ROOM01',
        validateRestorePayloadLimits: () => ({ ok: true }),
        validateRestoreAuditRecord: () => ({ ok: true, record: null }),
        isVerifiedClientRestoreSnapshot: () => true,
        sanitizeRestoreActionLog: actionLog => Array.isArray(actionLog) ? actionLog : [],
        sanitizeClientStateSnapshot: snapshot => Object.assign({}, snapshot),
        isValidGameStartPayload: (payload, count) => Array.isArray(payload.playerNames) && payload.playerNames.length === count,
        hasInvalidOnlineRlModelSettings: () => false,
        normalizePlayerSettings: settings => settings,
        isValidRestoreReconnectTokenHashes: payload => Array.isArray(payload.reconnectTokenHashes),
        getExpectedReconnectTokenHash: (_room, playerIndex, playerName) =>
            playerName === (playerIndex === 1 ? 'Guest' : 'Guest2') ? `hash-${playerName.toLowerCase()}` : '',
        hashReconnectToken: token => `hash-${token}`,
        restorePayloadRank: payload => ({ hostEpoch: payload.hostEpoch, actionSeq: 7 }),
        createRoomMirror: room => ({
            game: { checkWinner: () => room.stateSnapshot?.winner === true },
            shopStock: { 麦畑: 5 },
            lastUndoState: null,
        }),
        serializeMirrorState: (_game, shopStock, _undo, actionSeq) => ({ actionSeq, shopStock }),
        restoreAuditSecret: () => '',
    }, overrides));
}

function candidatePayload(overrides = {}) {
    return Object.assign({
        roomId: 'ROOM01',
        capabilityVersion: HOSTLESS_RESTORE_SCHEMA_VERSION,
        gameStartPayload: startPayload(),
        stateSnapshot: { actionSeq: 7 },
        actionLog: [],
        restoreAudit: { schemaVersion: 1 },
        playerIndex: 1,
        playerName: 'Guest',
        reconnectToken: 'guest',
    }, overrides);
}

runTest('gatewayは検証済みbundleをserver canonical snapshotとhashへ変換する', () => {
    const gateway = makeGateway();
    const result = gateway.prepareCandidate({ id: 'socket-guest' }, candidatePayload());
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.roomId, 'ROOM01');
    assert.strictEqual(result.attemptCount, 1);
    assert.strictEqual(result.candidate.socketId, 'socket-guest');
    assert.strictEqual(result.candidate.generation, 2);
    assert.deepStrictEqual(result.candidate.rank, { hostEpoch: 4, actionSeq: 7 });
    assert.deepStrictEqual(result.candidate.payload.stateSnapshot, {
        actionSeq: 7,
        shopStock: { 麦畑: 5 },
    });
    assert.deepStrictEqual(result.candidate.payload.actionLog, []);
    assert.strictEqual(result.candidate.canonicalHash.length, 64);
    assert.strictEqual(result.candidate.payload.gameStartPayload.schemaVersion, undefined);
    assert.strictEqual(result.candidate.payload.gameStartPayload.ignoredFutureField, undefined);
    assert.deepStrictEqual(result.candidate.payload.gameStartPayload.gameSchema, { actionVersion: 1, snapshotVersion: 1 });
});

runTest('client専用schemaを除外してserver署名snapshotを検証する', () => {
    const secret = 'hostless-test-secret';
    const stateSnapshot = { actionSeq: 7 };
    const serverGameStart = startPayload();
    delete serverGameStart.schemaVersion;
    delete serverGameStart.ignoredFutureField;
    const restoreAudit = buildSignedRestoreAuditRecord('ROOM01', {
        gameStartPayload: serverGameStart,
        stateSnapshot,
    }, {
        crypto,
        secret,
        now: 1,
    });
    const gateway = makeGateway({
        validateRestoreAuditRecord,
        isVerifiedClientRestoreSnapshot(roomId, gameStartPayload, snapshot, audit) {
            return verifySignedRestoreAuditRecord(audit, {
                gameStartPayload,
                stateSnapshot: snapshot,
            }, {
                roomId,
                crypto,
                secret,
            }).ok;
        },
    });
    const result = gateway.prepareCandidate({ id: 'signed-client' }, candidatePayload({
        gameStartPayload: Object.assign({ schemaVersion: 2 }, serverGameStart),
        stateSnapshot,
        restoreAudit,
    }));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.candidate.payload.gameStartPayload.schemaVersion, undefined);
});

runTest('軽量requestはraw stateなしでidentity・世代・回数を検証する', () => {
    const gateway = makeGateway();
    const result = gateway.validateRequest({
        roomId: 'ROOM01',
        capabilityVersion: 1,
        gameStartPayload: startPayload(),
        playerIndex: 1,
        playerName: 'Guest',
        reconnectToken: 'guest',
    });
    assert.deepStrictEqual(result, {
        ok: true,
        roomId: 'ROOM01',
        playerIndex: 1,
        generation: 2,
        attemptCount: 1,
    });
    assert.strictEqual(JSON.stringify(result).includes('stateSnapshot'), false);
    assert.strictEqual(JSON.stringify(result).includes('actionLog'), false);
});

runTest('gateway hashはraw snapshotのkey順と余分なgameStart fieldに影響されない', () => {
    const gateway = makeGateway();
    const left = gateway.prepareCandidate({ id: 'left' }, candidatePayload({
        stateSnapshot: { actionSeq: 7, winner: false },
    }));
    const right = gateway.prepareCandidate({ id: 'right' }, candidatePayload({
        gameStartPayload: startPayload({ anotherIgnoredField: true }),
        stateSnapshot: { winner: false, actionSeq: 7 },
    }));
    assert.strictEqual(left.candidate.canonicalHash, right.candidate.canonicalHash);
});

runTest('旧client混在を示すcapability欠落・不一致はhost-onlyへfail closedする', () => {
    const gateway = makeGateway();
    const cases = [
        startPayload({ hostlessRestoreCapabilities: undefined }),
        startPayload({ hostlessRestoreCapabilities: [1, 0, 1] }),
        startPayload({ hostlessRestoreCapabilities: [1, 1] }),
    ];
    for (const gameStartPayload of cases) {
        assert.strictEqual(gateway.prepareCandidate({ id: 'socket' }, candidatePayload({
            gameStartPayload,
        })).reason, 'unsupported-client');
    }
});

runTest('元host・CPU・token不一致の候補を拒否する', () => {
    const gateway = makeGateway();
    assert.strictEqual(gateway.prepareCandidate({ id: 'socket' }, candidatePayload({
        playerIndex: 0,
        playerName: 'Host',
        reconnectToken: 'host',
    })).reason, 'original-host');
    assert.strictEqual(gateway.prepareCandidate({ id: 'socket' }, candidatePayload({
        gameStartPayload: startPayload({
            playerSettings: [{ type: 'human' }, { type: 'cpu' }, { type: 'human' }],
        }),
    })).reason, 'cpu-player');
    assert.strictEqual(gateway.prepareCandidate({ id: 'socket' }, candidatePayload({
        reconnectToken: 'wrong',
    })).reason, 'invalid-token');
});

runTest('軽量requestも元host・旧client・token不一致を拒否する', () => {
    const gateway = makeGateway();
    const base = candidatePayload();
    assert.strictEqual(gateway.validateRequest(base).ok, true);
    assert.strictEqual(gateway.validateRequest(Object.assign({}, base, { playerIndex: 0 })).reason, 'original-host');
    assert.strictEqual(gateway.validateRequest(Object.assign({}, base, { capabilityVersion: 0 })).reason, 'unsupported-client');
    assert.strictEqual(gateway.validateRequest(Object.assign({}, base, { reconnectToken: 'wrong' })).reason, 'invalid-token');
});

runTest('署名されていないsnapshotはaction logも空なら採用しない', () => {
    const gateway = makeGateway({ isVerifiedClientRestoreSnapshot: () => false });
    assert.strictEqual(gateway.prepareCandidate({ id: 'socket' }, candidatePayload()).reason, 'empty-state');
});

runTest('壊れたaction log・mirror replay・完了済みを区別する', () => {
    assert.strictEqual(makeGateway({
        sanitizeRestoreActionLog: () => null,
    }).prepareCandidate({ id: 'socket' }, candidatePayload()).reason, 'action-log');
    assert.strictEqual(makeGateway({
        createRoomMirror: () => null,
    }).prepareCandidate({ id: 'socket' }, candidatePayload()).reason, 'mirror-replay');
    const completed = makeGateway().prepareCandidate({ id: 'socket' }, candidatePayload({
        stateSnapshot: { actionSeq: 7, winner: true },
    }));
    assert.strictEqual(completed.ok, true);
    assert.strictEqual(completed.candidate.completed, true);
});

runTest('restore secret設定時はaction audit検証をsanitizeへ要求する', () => {
    let receivedOptions = null;
    const gateway = makeGateway({
        restoreAuditSecret: () => 'secret',
        sanitizeRestoreActionLog(_actionLog, _roomId, _snapshot, options) {
            receivedOptions = options;
            return [];
        },
    });
    assert.strictEqual(gateway.prepareCandidate({ id: 'socket' }, candidatePayload()).ok, true);
    assert.deepStrictEqual(receivedOptions, { requireSignedActionAudit: true });
});

runTest('gatewayはpayload limit・room・game start・auditを既存validatorへ委譲する', () => {
    assert.strictEqual(makeGateway({
        validateRestorePayloadLimits: () => ({ ok: false }),
    }).prepareCandidate({}, candidatePayload()).reason, 'payload-limits');
    assert.strictEqual(makeGateway().prepareCandidate({}, candidatePayload({ roomId: 'BAD' })).reason, 'room-id');
    assert.strictEqual(makeGateway({
        isValidGameStartPayload: () => false,
    }).prepareCandidate({}, candidatePayload()).reason, 'game-start');
    assert.strictEqual(makeGateway({
        validateRestoreAuditRecord: () => ({ ok: false }),
    }).prepareCandidate({}, candidatePayload()).reason, 'restore-audit');
});
