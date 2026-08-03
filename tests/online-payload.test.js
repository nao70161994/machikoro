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

runTest('online payload はpending outbound actionのwire/storage形を参照維持で生成する', () => {
    const data = { cardName: '麦畑' };
    const entry = OnlinePayload.buildPendingOutboundAction(
        'buildCard', data, 2, 'ROOM01', 7, 'client-7'
    );
    assert.deepStrictEqual(entry, {
        action: 'buildCard',
        data,
        playerIndex: 2,
        roomId: 'ROOM01',
        seq: 7,
        clientActionId: 'client-7',
    });
    assert.strictEqual(entry.data, data);
    assert.deepStrictEqual(Object.keys(entry), [
        'action', 'data', 'playerIndex', 'roomId', 'seq', 'clientActionId',
    ]);
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

runTest('online payload pending reconciliationは受理根拠を優先順つきで固定する', () => {
    const reasons = OnlinePayload.pendingReconciliationReasons;
    const pendingWithId = {
        action: 'nextTurn', data: {}, playerIndex: 1, seq: 4, clientActionId: 'client-4',
    };
    const legacyPending = { action: 'nextTurn', data: {}, playerIndex: 1, seq: 4 };
    const cases = [
        {
            name: 'pendingなし', pending: null, log: [], snapshot: null, accepted: [],
            expected: { accepted: true, reason: reasons.NO_PENDING },
        },
        {
            name: 'replay log一致を最優先', pending: pendingWithId,
            log: [Object.assign({}, pendingWithId)], snapshot: { actionSeq: 99 },
            accepted: [{ playerIndex: 1, clientActionId: 'client-4' }],
            expected: { accepted: true, reason: reasons.REPLAY_LOG },
        },
        {
            name: 'legacy pendingのsnapshot圧縮', pending: legacyPending, log: [],
            snapshot: { actionSeq: 4 }, accepted: [],
            expected: { accepted: true, reason: reasons.SNAPSHOT_COMPACTED },
        },
        {
            name: 'clientActionId付きはsnapshot seqだけで受理しない', pending: pendingWithId,
            log: [], snapshot: { actionSeq: 99 }, accepted: [],
            expected: { accepted: false, reason: reasons.UNACCEPTED },
        },
        {
            name: 'accepted client action一致', pending: pendingWithId, log: [],
            snapshot: { actionSeq: 1 },
            accepted: [{ playerIndex: 1, clientActionId: 'client-4' }],
            expected: { accepted: true, reason: reasons.ACCEPTED_CLIENT_ACTION },
        },
        {
            name: 'player不一致は未受理', pending: pendingWithId, log: [], snapshot: null,
            accepted: [{ playerIndex: 0, clientActionId: 'client-4' }],
            expected: { accepted: false, reason: reasons.UNACCEPTED },
        },
    ];
    for (const testCase of cases) {
        const before = JSON.stringify(testCase);
        const plan = OnlinePayload.planPendingReconciliation(
            testCase.pending,
            testCase.log,
            testCase.snapshot,
            testCase.accepted
        );
        assert.deepStrictEqual(plan, testCase.expected, testCase.name);
        assert.strictEqual(Object.isFrozen(plan), true, testCase.name);
        assert.strictEqual(JSON.stringify(testCase), before, testCase.name);
    }
});

runTest('online payload pending reconciliation authorityは完全一致時だけpure planを選ぶ', () => {
    const pending = {
        action: 'nextTurn', data: {}, playerIndex: 0, clientActionId: 'client-1',
    };
    const log = [Object.assign({}, pending)];
    const legacy = Object.freeze({ accepted: true, reason: 'replay-log' });
    const disabled = OnlinePayload.selectPendingReconciliationPlan(
        pending, log, null, [], legacy
    );
    assert.strictEqual(disabled.source, 'legacy');
    assert.strictEqual(disabled.plan, legacy);
    const enabled = OnlinePayload.selectPendingReconciliationPlan(
        pending, log, null, [], legacy, { authorityEnabled: true }
    );
    assert.strictEqual(enabled.source, 'pure-plan');
    assert.strictEqual(enabled.matched, true);
    assert.deepStrictEqual(enabled.plan, legacy);
    const mismatch = Object.freeze({ accepted: false, reason: 'unaccepted' });
    assert.deepStrictEqual(
        OnlinePayload.selectPendingReconciliationPlan(
            pending, log, null, [], mismatch, { authorityEnabled: true }
        ),
        {
            plan: mismatch,
            source: 'legacy-fallback',
            matched: false,
            fallbackReason: 'pending-reconciliation-plan-mismatch',
        }
    );
});

runTest('online payload rejoin action log planは署名なしsnapshotだけ完全logを保護する', () => {
    const stored = [{ seq: 1 }, { seq: 2 }];
    const replay = [{ seq: 2 }];
    const reasons = OnlinePayload.rejoinActionLogReasons;
    const keep = OnlinePayload.planRejoinActionLogPersistence(
        { actionSeq: 2 }, null, stored, replay
    );
    assert.deepStrictEqual(keep, {
        actionLog: stored,
        reason: reasons.STORED_UNSIGNED_FULL_LOG,
    });
    assert.strictEqual(keep.actionLog, stored);
    assert.strictEqual(Object.isFrozen(keep), true);

    const cases = [
        [null, null, reasons.SERVER_REPLAY_LOG],
        [{ actionSeq: 2 }, { signature: 'signed' }, reasons.SERVER_REPLAY_LOG],
        [{ actionSeq: 2 }, null, reasons.STORED_UNSIGNED_FULL_LOG],
    ];
    for (const [snapshot, audit, reason] of cases) {
        const plan = OnlinePayload.planRejoinActionLogPersistence(
            snapshot, audit, stored, replay
        );
        assert.strictEqual(plan.reason, reason);
        assert.strictEqual(
            plan.actionLog,
            reason === reasons.STORED_UNSIGNED_FULL_LOG ? stored : replay
        );
    }
    assert.strictEqual(
        OnlinePayload.planRejoinActionLogPersistence(
            { actionSeq: 2 }, null, replay, stored
        ).actionLog,
        stored
    );
});

runTest('online payload rejoin action log authorityは配列identityまで一致した時だけpure planを選ぶ', () => {
    const stored = [{ seq: 1 }, { seq: 2 }];
    const replay = [];
    const legacy = Object.freeze({
        actionLog: stored,
        reason: 'stored-unsigned-full-log',
    });
    const disabled = OnlinePayload.selectRejoinActionLogPersistencePlan(
        { actionSeq: 2 }, null, stored, replay, legacy
    );
    assert.strictEqual(disabled.source, 'legacy');
    assert.strictEqual(disabled.plan, legacy);
    const enabled = OnlinePayload.selectRejoinActionLogPersistencePlan(
        { actionSeq: 2 }, null, stored, replay, legacy, { authorityEnabled: true }
    );
    assert.strictEqual(enabled.source, 'pure-plan');
    assert.strictEqual(enabled.matched, true);
    assert.strictEqual(enabled.plan.actionLog, stored);
    const mismatch = Object.freeze({
        actionLog: stored.slice(),
        reason: 'stored-unsigned-full-log',
    });
    const fallback = OnlinePayload.selectRejoinActionLogPersistencePlan(
        { actionSeq: 2 }, null, stored, replay, mismatch, { authorityEnabled: true }
    );
    assert.strictEqual(fallback.source, 'legacy-fallback');
    assert.strictEqual(fallback.matched, false);
    assert.strictEqual(fallback.plan, mismatch);
    assert.strictEqual(fallback.fallbackReason, 'rejoin-action-log-plan-mismatch');
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


runTest('online payload restore queue planは世代・snapshot seqを除外して元indexを保持する', () => {
    const queue = [
        { type: 'old-generation', payload: { seq: 9 }, generation: 1 },
        { type: 'already-restored', payload: { seq: 4 }, generation: 2 },
        { type: 'without-seq', payload: {}, generation: 2 },
        { type: 'new-action', payload: { seq: 6 }, generation: 2 },
        null,
    ];
    const before = JSON.stringify(queue);

    const plan = OnlinePayload.planRestoreEventFlush(queue, 2, 4);

    assert.deepStrictEqual(Array.from(plan, entry => [entry.index, entry.event.type]), [
        [2, 'without-seq'],
        [3, 'new-action'],
    ]);
    assert.strictEqual(Object.isFrozen(plan), true);
    assert.strictEqual(plan.every(Object.isFrozen), true);
    assert.strictEqual(plan[0].event, queue[2]);
    assert.strictEqual(JSON.stringify(queue), before);
    assert.deepStrictEqual(OnlinePayload.planRestoreEventFlush(null, 2, 4), []);
});


runTest('online payload restore queue authorityは既定legacy・一致時pure・不一致時fallbackを選ぶ', () => {
    const queue = [
        { type: 'already-restored', payload: { seq: 2 }, generation: 3 },
        { type: 'next-action', payload: { seq: 3 }, generation: 3 },
    ];
    const legacy = Object.freeze([{ event: queue[1], index: 1 }]);

    const disabled = OnlinePayload.selectRestoreEventFlushPlan(queue, 3, 2, legacy);
    assert.strictEqual(disabled.source, 'legacy');
    assert.strictEqual(disabled.matched, true);
    assert.strictEqual(disabled.plan[0].event, queue[1]);

    const enabled = OnlinePayload.selectRestoreEventFlushPlan(queue, 3, 2, legacy, {
        queuePlanAuthorityEnabled: true,
    });
    assert.strictEqual(enabled.source, 'pure-plan');
    assert.strictEqual(enabled.matched, true);
    assert.strictEqual(enabled.fallbackReason, '');
    assert.deepStrictEqual(Array.from(enabled.plan, entry => entry.index), [1]);

    const mismatch = OnlinePayload.selectRestoreEventFlushPlan(queue, 3, 2, [], {
        queuePlanAuthorityEnabled: true,
    });
    assert.strictEqual(mismatch.source, 'legacy-fallback');
    assert.strictEqual(mismatch.matched, false);
    assert.strictEqual(mismatch.fallbackReason, 'plan-mismatch');
    assert.deepStrictEqual(mismatch.plan, []);
});


runTest('online payload incoming gameAction planはlegacy判断順をpureに固定する', () => {
    const decisions = OnlinePayload.incomingGameActionDecisions;
    assert.deepStrictEqual(decisions, {
        NO_GAME: 'no-game',
        DUPLICATE: 'duplicate',
        GAP: 'gap',
        APPLY: 'apply',
    });
    assert.deepStrictEqual(OnlinePayload.planIncomingGameAction(false, 1, 0), { decision: decisions.NO_GAME });
    assert.deepStrictEqual(OnlinePayload.planIncomingGameAction(true, 2, 2), { decision: decisions.DUPLICATE });
    assert.deepStrictEqual(OnlinePayload.planIncomingGameAction(true, 4, 2), { decision: decisions.GAP });
    assert.deepStrictEqual(OnlinePayload.planIncomingGameAction(true, 3, 2), { decision: decisions.APPLY });
    assert.deepStrictEqual(OnlinePayload.planIncomingGameAction(true, undefined, 2), { decision: decisions.APPLY });
});

runTest('online payload incoming gameAction authorityはlegacy完全一致時だけpure planを採用する', () => {
    const legacy = Object.freeze({ decision: 'gap' });
    assert.strictEqual(OnlinePayload.selectIncomingGameActionPlan(true, 4, 2, legacy).source, 'legacy');
    const selected = OnlinePayload.selectIncomingGameActionPlan(true, 4, 2, legacy, { authorityEnabled: true });
    assert.strictEqual(selected.source, 'pure-plan');
    assert.strictEqual(selected.matched, true);
    const mismatch = Object.freeze({ decision: 'apply' });
    assert.deepStrictEqual(
        OnlinePayload.selectIncomingGameActionPlan(true, 4, 2, mismatch, { authorityEnabled: true }),
        {
            plan: mismatch,
            source: 'legacy-fallback',
            matched: false,
            fallbackReason: 'incoming-action-plan-mismatch',
        }
    );
});

runTest('online payload restore abort planは世代一致とqueue fallbackをpureに固定する', () => {
    const queue = [{ type: 'gameAction', generation: 3 }];
    const active = OnlinePayload.planRestoreAbort(3, 3, '再同期', queue);
    assert.deepStrictEqual(active, {
        abort: true,
        statusMessage: '再同期',
        queuedEvents: queue,
    });
    assert.strictEqual(active.queuedEvents, queue);
    assert.ok(Object.isFrozen(active));
    assert.deepStrictEqual(OnlinePayload.planRestoreAbort(2, 3, '', null), {
        abort: false,
        statusMessage: '',
        queuedEvents: [],
    });
});

runTest('online payload restore abort authorityはlegacy完全一致時だけpure planを採用する', () => {
    const queue = [];
    const legacy = Object.freeze({ abort: true, statusMessage: '再同期', queuedEvents: queue });
    const disabled = OnlinePayload.selectRestoreAbortPlan(3, 3, '再同期', queue, legacy);
    assert.strictEqual(disabled.source, 'legacy');
    assert.strictEqual(disabled.plan, legacy);
    const enabled = OnlinePayload.selectRestoreAbortPlan(3, 3, '再同期', queue, legacy, {
        abortPlanAuthorityEnabled: true,
    });
    assert.strictEqual(enabled.source, 'pure-plan');
    assert.strictEqual(enabled.matched, true);
    assert.strictEqual(enabled.plan.queuedEvents, queue);
    const mismatch = Object.freeze({ abort: true, statusMessage: '別表示', queuedEvents: queue });
    assert.deepStrictEqual(
        OnlinePayload.selectRestoreAbortPlan(3, 3, '再同期', queue, mismatch, {
            abortPlanAuthorityEnabled: true,
        }),
        {
            plan: mismatch,
            source: 'legacy-fallback',
            matched: false,
            fallbackReason: 'abort-plan-mismatch',
        }
    );
});
