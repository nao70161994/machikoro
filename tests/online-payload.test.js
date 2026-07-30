const assert = require('assert');
const { OnlinePayload } = require('../js/onlinePayload');
const { HOSTLESS_RESTORE_EVENTS } = require('../server/hostlessRestoreRuntime');
const { runTest } = require('./helpers/test-utils');

runTest('online payload は保存sessionの必須fieldを正規化し追加fieldを保持する', () => {
    assert.deepStrictEqual(OnlinePayload.normalizeSession({
        roomId: ' room-01 ',
        playerIndex: 2,
        playerName: ' Alice ',
        reconnectToken: ' token-1 ',
        isRoomHost: true,
    }), {
        roomId: 'ROOM-01',
        playerIndex: 2,
        playerName: 'Alice',
        reconnectToken: 'token-1',
        isRoomHost: true,
    });
});

runTest('online payload は不正な保存sessionをfail closedにする', () => {
    const cases = [
        null,
        [],
        {},
        { roomId: 'ROOM01', playerIndex: -1, playerName: 'Alice', reconnectToken: 'token-1' },
        { roomId: 'ROOM01', playerIndex: 0, playerName: ' ', reconnectToken: 'token-1' },
        { roomId: 'ROOM01', playerIndex: 0, playerName: 'Alice', reconnectToken: '' },
    ];
    for (const value of cases) assert.strictEqual(OnlinePayload.normalizeSession(value), null);
});

runTest('online payload は再接続wire fieldを既存順序と値で生成する', () => {
    assert.deepStrictEqual(OnlinePayload.buildRejoin({
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token-1',
        ignored: 'not-on-wire',
    }, 'build-123'), {
        roomId: 'ROOM01',
        playerIndex: 1,
        playerName: 'Alice',
        reconnectToken: 'token-1',
        clientVersion: 'build-123',
        hostlessRestoreVersion: 1,
    });
});

runTest('online payload はopt-in時だけschema capability fieldを加える', () => {
    const capabilities = { actionVersions: [0, 1], snapshotVersions: [0, 1] };
    const payload = OnlinePayload.buildRejoin({ roomId: 'ROOM01' }, 'build-123', capabilities);
    assert.strictEqual(payload.gameSchemaCapabilities, capabilities);
    assert.deepStrictEqual(Object.keys(payload), [
        'roomId', 'playerIndex', 'playerName', 'reconnectToken', 'clientVersion',
        'hostlessRestoreVersion', 'gameSchemaCapabilities',
    ]);
});

runTest('online payload は欠落sessionも旧undefined field契約を維持する', () => {
    assert.deepStrictEqual(OnlinePayload.buildRejoin(null, 'unknown'), {
        roomId: null,
        playerIndex: null,
        playerName: null,
        reconnectToken: null,
        clientVersion: 'unknown',
        hostlessRestoreVersion: 1,
    });
});

runTest('online payload はhostless capabilityをfrozen定数で公開する', () => {
    assert.strictEqual(OnlinePayload.hostlessRestoreVersion, 1);
});

function hostlessBundle(overrides = {}) {
    return {
        gameStartPayload: Object.assign({
            playerNames: ['Host', 'Guest', 'CPU'],
            playerSettings: [{ type: 'human' }, { type: 'human' }, { type: 'cpu' }],
            hostPlayerIndex: 0,
            hostlessRestoreCapabilities: [1, 1, 0],
            hostlessRestoreGeneration: 2,
            hostlessRestoreCount: 1,
        }, overrides),
        stateSnapshot: { actionSeq: 4 },
        actionLog: [{ action: 'nextTurn' }],
        restoreAudit: { version: 1 },
    };
}

const hostlessIdentity = {
    roomId: 'ROOM01',
    playerIndex: 1,
    playerName: 'Guest',
    reconnectToken: 'token-guest',
};

runTest('hostless軽量requestはraw snapshotとaction logを送らない', () => {
    const payload = OnlinePayload.buildHostlessRestoreRequest(hostlessBundle(), hostlessIdentity);
    assert.deepStrictEqual(payload, {
        roomId: 'ROOM01',
        gameStartPayload: hostlessBundle().gameStartPayload,
        playerIndex: 1,
        playerName: 'Guest',
        reconnectToken: 'token-guest',
        capabilityVersion: 1,
    });
    assert.strictEqual(Object.hasOwn(payload, 'stateSnapshot'), false);
    assert.strictEqual(Object.hasOwn(payload, 'actionLog'), false);
    assert.strictEqual(Object.hasOwn(payload, 'restoreAudit'), false);
});

runTest('hostless raw候補は収集event用payloadにだけ含まれる', () => {
    const bundle = hostlessBundle();
    const payload = OnlinePayload.buildHostlessRestoreCandidate(bundle, hostlessIdentity);
    assert.strictEqual(payload.stateSnapshot, bundle.stateSnapshot);
    assert.strictEqual(payload.actionLog, bundle.actionLog);
    assert.strictEqual(payload.restoreAudit, bundle.restoreAudit);
    assert.strictEqual(payload.capabilityVersion, 1);
});

runTest('hostless payloadは元host・旧client混在・3回上限をfail closedする', () => {
    assert.strictEqual(OnlinePayload.buildHostlessRestoreRequest(
        hostlessBundle(),
        Object.assign({}, hostlessIdentity, { playerIndex: 0 })
    ), null);
    assert.strictEqual(OnlinePayload.buildHostlessRestoreRequest(
        hostlessBundle({ hostlessRestoreCapabilities: [1, 0, 0] }),
        hostlessIdentity
    ), null);
    assert.strictEqual(OnlinePayload.buildHostlessRestoreRequest(
        hostlessBundle({ hostlessRestoreCount: 3 }),
        hostlessIdentity
    ), null);
});

runTest('hostless capability判定は旧形式の全員human設定を維持する', () => {
    const bundle = hostlessBundle({
        playerNames: ['Host', 'Guest'],
        playerSettings: [],
        hostlessRestoreCapabilities: [1, 1],
    });
    assert.strictEqual(OnlinePayload.supportsHostlessRestore(bundle, hostlessIdentity), true);
});

runTest('hostless statusは失敗理由を区別し未知理由でもbundle保持を案内する', () => {
    assert.match(OnlinePayload.hostlessRestoreStatusMessage('candidate-mismatch'), /一致しません/);
    assert.match(OnlinePayload.hostlessRestoreStatusMessage('insufficient-candidates'), /足りません/);
    assert.match(OnlinePayload.hostlessRestoreStatusMessage('completed-game'), /完了済み/);
    assert.match(OnlinePayload.hostlessRestoreStatusMessage('unknown'), /削除されていません/);
    assert.ok(Object.isFrozen(OnlinePayload.hostlessRestoreEvents));
});

runTest('hostless additive event名はclient/serverで完全一致する', () => {
    assert.deepStrictEqual(OnlinePayload.hostlessRestoreEvents, HOSTLESS_RESTORE_EVENTS);
    assert.strictEqual(Object.values(HOSTLESS_RESTORE_EVENTS).some(name => name === 'recreateRoom'), false);
});

runTest('online payload は保存済みaction logを既存の最小fieldへ正規化する', () => {
    const audit = { algorithm: 'hmac' };
    assert.deepStrictEqual(OnlinePayload.normalizeActionLog(null), []);
    assert.deepStrictEqual(OnlinePayload.normalizeActionLog([
        null,
        { data: {} },
        {
            action: 'buildCard',
            data: { cardName: '麦畑' },
            playerIndex: 1,
            seq: 7,
            clientActionId: 'client-7',
            restoreActionAudit: audit,
            ignored: true,
        },
    ]), [{
        action: 'buildCard',
        data: { cardName: '麦畑' },
        playerIndex: 1,
        seq: 7,
        clientActionId: 'client-7',
        restoreActionAudit: audit,
    }]);
});

runTest('online payload はpending actionを既知actionとroom正規化の注入契約で絞る', () => {
    const options = {
        isKnownAction(action) {
            return action === 'buildCard';
        },
        normalizeRoomId(roomId) {
            return String(roomId || '').trim().toUpperCase();
        },
    };
    assert.strictEqual(OnlinePayload.normalizePendingOutboundAction({ action: 'unknown' }, options), null);
    assert.deepStrictEqual(OnlinePayload.normalizePendingOutboundAction({
        action: 'buildCard',
        data: { cardName: '麦畑' },
        roomId: ' room01 ',
        playerIndex: 0,
        seq: 3,
        clientActionId: 'client-3',
        ignored: true,
    }, options), {
        action: 'buildCard',
        data: { cardName: '麦畑' },
        playerIndex: 0,
        roomId: 'ROOM01',
        seq: 3,
        clientActionId: 'client-3',
    });
});

runTest('online payload はpending ACK一致判定のclientActionId優先契約を維持する', () => {
    const pending = {
        action: 'buildCard',
        data: { cardName: '麦畑' },
        playerIndex: 1,
        clientActionId: 'client-1',
    };
    assert.strictEqual(OnlinePayload.sameActionEntry(pending, { clientActionId: 'client-1' }), true);
    assert.strictEqual(OnlinePayload.sameActionEntry(pending, {
        action: pending.action,
        data: pending.data,
        playerIndex: pending.playerIndex,
    }), false);
    assert.strictEqual(OnlinePayload.acceptedClientActionMatchesPending({
        clientActionId: 'client-1',
        playerIndex: 1,
    }, pending), true);
    assert.strictEqual(OnlinePayload.shouldClearPendingForAcceptedAction({
        clientActionId: 'client-1',
    }, pending), true);
    assert.strictEqual(OnlinePayload.shouldClearPendingForAcceptedAction({
        clientActionId: 'client-2',
    }, pending), false);
    assert.strictEqual(OnlinePayload.shouldClearPendingForAcceptedAction({
        action: 'nextTurn',
        data: {},
        playerIndex: 1,
    }, {
        action: 'nextTurn',
        data: {},
        playerIndex: 1,
    }), true);
});


const normalizeRoomId = value => String(value || '').trim().toUpperCase();

runTest('online payload keeps room-scoped pending ownership and legacy seq fallback', () => {
    assert.strictEqual(OnlinePayload.pendingBelongsToSession(null, 'ROOM01', {
        normalizeRoomId,
        requireRoomId: true,
    }), true);
    assert.strictEqual(OnlinePayload.pendingBelongsToSession({
        roomId: ' room01 ',
    }, 'ROOM01', { normalizeRoomId, requireRoomId: true }), true);
    assert.strictEqual(OnlinePayload.pendingBelongsToSession({
        roomId: 'ROOM02',
    }, 'ROOM01', { normalizeRoomId, requireRoomId: true }), false);
    assert.strictEqual(OnlinePayload.pendingBelongsToSession({
        seq: 4,
    }, 'ROOM01', { normalizeRoomId, requireRoomId: true }), true);
    assert.strictEqual(OnlinePayload.pendingBelongsToSession({
        seq: 4,
    }, 'ROOM01', { normalizeRoomId, requireExplicitRoomId: true }), false);
});

runTest('online payload appends current-room pending action once without cloning the log', () => {
    const pending = {
        action: 'nextTurn',
        data: {},
        roomId: 'ROOM01',
        playerIndex: 0,
        seq: 3,
    };
    const log = [];
    assert.strictEqual(OnlinePayload.appendPendingForRestore(log, pending, {
        currentRoomId: 'room01',
        normalizeRoomId,
    }), log);
    assert.deepStrictEqual(log, [pending]);
    OnlinePayload.appendPendingForRestore(log, Object.assign({}, pending), {
        currentRoomId: 'ROOM01',
        normalizeRoomId,
    });
    assert.strictEqual(log.length, 1);
    OnlinePayload.appendPendingForRestore(log, Object.assign({}, pending, {
        roomId: 'ROOM02',
        seq: 4,
    }), {
        currentRoomId: 'ROOM01',
        normalizeRoomId,
    });
    assert.strictEqual(log.length, 1);
});

runTest('online payload isolates pending resend policy from socket and timer side effects', () => {
    const pending = {
        action: 'nextTurn',
        data: {},
        roomId: 'ROOM01',
        playerIndex: 0,
        seq: 3,
    };
    const state = {
        currentRoomId: 'ROOM01',
        normalizeRoomId,
        game: { currentPlayerIndex: 0, players: [{}, {}] },
        originalPlayerIndex: 0,
        playerIndex: 0,
        cpuPlayers: [null, null],
        isRoomHost: false,
    };
    assert.strictEqual(OnlinePayload.canResendPendingOutboundAction(pending, state), true);
    assert.strictEqual(OnlinePayload.canResendPendingOutboundAction(
        Object.assign({}, pending, { roomId: 'ROOM02' }),
        state
    ), false);
    assert.strictEqual(OnlinePayload.canResendPendingOutboundAction(
        Object.assign({}, pending, { playerIndex: 1 }),
        state
    ), false);
    assert.strictEqual(OnlinePayload.canResendPendingOutboundAction(pending, Object.assign({}, state, {
        game: { currentPlayerIndex: 1, players: [{}, {}] },
    })), false);
    assert.strictEqual(OnlinePayload.canResendPendingOutboundAction(pending, Object.assign({}, state, {
        game: { currentPlayerIndex: 1, players: [{}, {}] },
        cpuPlayers: [null, {}],
        isRoomHost: true,
    })), true);
    assert.strictEqual(OnlinePayload.canResendPendingOutboundAction(pending, Object.assign({}, state, {
        game: { currentPlayerIndex: 1, players: [{}, {}] },
        cpuPlayers: [null, {}],
        isRoomHost: false,
    })), false);
});
