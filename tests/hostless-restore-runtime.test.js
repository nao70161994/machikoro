const assert = require('assert');
const {
    HOSTLESS_RESTORE_EVENTS,
    hostlessRestoreEnabled,
    createHostlessRestoreRuntime,
} = require('../server/hostlessRestoreRuntime');

function runTest(name, fn) {
    try {
        fn();
        console.log(`テスト成功: ${name}`);
    } catch (error) {
        console.error(`テスト失敗: ${name}`);
        throw error;
    }
}

function socket(id) {
    const handlers = {};
    const emitted = [];
    return {
        id,
        handlers,
        emitted,
        on(name, handler) { handlers[name] = handler; },
        emit(name, payload) { emitted.push({ name, payload }); },
    };
}

function setup(overrides = {}) {
    const sockets = new Map();
    const sessions = new Map();
    const coordinator = {
        start(input) {
            if (sessions.has(input.roomId)) return { ok: false, reason: 'already-started' };
            sessions.set(input.roomId, {
                roomId: input.roomId,
                generation: input.generation,
                attemptCount: input.attemptCount,
                stage: 'host-grace',
            });
            return { ok: true };
        },
        inspect(roomId) { return sessions.get(roomId) || null; },
        submitCandidate(roomId, candidate) {
            this.lastCandidate = candidate;
            return { ok: sessions.get(roomId)?.stage === 'collecting' };
        },
        respondToConfirmation(roomId, playerIndex, approved) {
            if (!approved) return { ok: true, approved: false };
            return {
                ok: true,
                approved: true,
                roomId,
                generation: 2,
                playerIndex,
                candidateCount: 2,
                candidate: {
                    playerIndex,
                    canonicalHash: 'a'.repeat(64),
                    rank: { hostEpoch: 1, actionSeq: 8 },
                    payload: {
                        gameStartPayload: { hostlessRestoreCount: 1 },
                        marker: 'canonical',
                    },
                },
            };
        },
        confirmationOwnerDisconnected() { return true; },
        hostRestored(roomId) {
            const existed = sessions.delete(roomId);
            return existed;
        },
    };
    const gateway = {
        validateRequest(payload) {
            if (payload.invalid) return { ok: false, reason: 'invalid-token' };
            return {
                ok: true,
                roomId: payload.roomId,
                playerIndex: payload.playerIndex,
                generation: payload.generation || 0,
                attemptCount: payload.attemptCount || 0,
            };
        },
        prepareCandidate(_socket, payload) {
            if (payload.invalid) return { ok: false, reason: 'action-log' };
            return {
                ok: true,
                roomId: payload.roomId,
                attemptCount: payload.attemptCount || 0,
                candidate: {
                    playerIndex: payload.playerIndex,
                    generation: payload.generation || 0,
                    payload: { marker: 'canonical' },
                },
            };
        },
    };
    const approvals = [];
    const runtime = createHostlessRestoreRuntime(Object.assign({
        io: { sockets: { sockets } },
        coordinator,
        gateway,
        hasRoom: () => false,
        approveCandidate(_socket, payload, metadata) {
            approvals.push({ payload, metadata });
            return { ok: true };
        },
    }, overrides));
    return { sockets, sessions, coordinator, gateway, approvals, runtime };
}

runTest('hostless restoreは既定有効で明示false値だけ緊急停止する', () => {
    assert.strictEqual(hostlessRestoreEnabled({}), true);
    for (const value of ['0', 'false', 'no', 'off', 'disabled']) {
        assert.strictEqual(hostlessRestoreEnabled({ HOSTLESS_RESTORE_ENABLED: value }), false);
    }
    assert.strictEqual(hostlessRestoreEnabled({ HOSTLESS_RESTORE_ENABLED: '1' }), true);
});

runTest('runtimeは追加eventだけをsocketへ登録する', () => {
    const { runtime } = setup();
    const client = socket('s1');
    runtime.registerSocket(client);
    assert.deepStrictEqual(Object.keys(client.handlers).sort(), [
        HOSTLESS_RESTORE_EVENTS.CANDIDATE,
        HOSTLESS_RESTORE_EVENTS.CONFIRM,
        HOSTLESS_RESTORE_EVENTS.REQUEST,
    ].sort());
});

runTest('軽量requestはroomごとにcoordinatorを開始し同一player tabを置換する', () => {
    const { runtime, sockets } = setup();
    const first = socket('s1');
    const second = socket('s2');
    sockets.set(first.id, first);
    sockets.set(second.id, second);
    assert.strictEqual(runtime.request(first, { roomId: 'ROOM01', playerIndex: 1 }).ok, true);
    assert.strictEqual(runtime.request(second, { roomId: 'ROOM01', playerIndex: 1 }).ok, true);
    assert.strictEqual(runtime.inspect('ROOM01').requesterCount, 1);
    assert.strictEqual(first.emitted.at(-1).payload.reason, 'waiting-for-host');
});

runTest('既存room・無効flag・不正identityはhost-only statusへ倒す', () => {
    const existing = setup({ hasRoom: () => true });
    const client = socket('s1');
    assert.strictEqual(existing.runtime.request(client, { roomId: 'ROOM01', playerIndex: 1 }).reason, 'host-restored');
    const disabled = setup({ enabled: false });
    assert.strictEqual(disabled.runtime.request(client, { roomId: 'ROOM01', playerIndex: 1 }).reason, 'disabled');
    const invalid = setup();
    assert.strictEqual(invalid.runtime.request(client, { roomId: 'ROOM01', playerIndex: 1, invalid: true }).reason, 'invalid-token');
});

runTest('collection開始時だけrequesterへraw候補提出を要求する', () => {
    const { runtime, sockets, sessions } = setup();
    const client = socket('s1');
    sockets.set(client.id, client);
    runtime.request(client, { roomId: 'ROOM01', playerIndex: 1 });
    sessions.get('ROOM01').stage = 'collecting';
    runtime.handleCoordinatorEvent({
        type: 'collection-started',
        roomId: 'ROOM01',
        generation: 0,
        stage: 'collecting',
        timeoutMs: 30_000,
    });
    assert.strictEqual(client.emitted.at(-1).name, HOSTLESS_RESTORE_EVENTS.COLLECT);
    assert.strictEqual(runtime.submit(client, {
        roomId: 'ROOM01',
        playerIndex: 1,
    }).ok, true);
});

runTest('collection中に遅れて登録したrequesterにも候補提出を要求する', () => {
    const { runtime, sockets, sessions } = setup();
    const first = socket('s1');
    const late = socket('s2');
    sockets.set(first.id, first);
    sockets.set(late.id, late);
    runtime.request(first, { roomId: 'ROOM01', playerIndex: 1 });
    sessions.get('ROOM01').stage = 'collecting';
    runtime.request(late, { roomId: 'ROOM01', playerIndex: 2 });
    assert.strictEqual(late.emitted.at(-1).name, HOSTLESS_RESTORE_EVENTS.COLLECT);
    assert.strictEqual(late.emitted.at(-1).payload.generation, 0);
});

runTest('generation不一致・未登録socket・収集外提出を拒否する', () => {
    const { runtime, sockets, sessions } = setup();
    const client = socket('s1');
    sockets.set(client.id, client);
    runtime.request(client, { roomId: 'ROOM01', playerIndex: 1, generation: 2 });
    assert.strictEqual(runtime.submit(client, {
        roomId: 'ROOM01', playerIndex: 1, generation: 2,
    }).reason, 'not-collecting');
    sessions.get('ROOM01').stage = 'collecting';
    assert.strictEqual(runtime.submit(client, {
        roomId: 'ROOM01', playerIndex: 1, generation: 3,
    }).reason, 'generation-mismatch');
    const stranger = socket('other');
    assert.strictEqual(runtime.submit(stranger, {
        roomId: 'ROOM01', playerIndex: 1, generation: 2,
    }).reason, 'requester-mismatch');
});

runTest('confirmationはownerだけ承認できcanonical候補をrestore callbackへ渡す', () => {
    const { runtime, sockets, approvals } = setup();
    const client = socket('s1');
    sockets.set(client.id, client);
    runtime.request(client, { roomId: 'ROOM01', playerIndex: 1 });
    client.hostlessRestorePlayerIndex = 1;
    const result = runtime.confirm(client, { roomId: 'ROOM01', approved: true });
    assert.deepStrictEqual(result, { ok: true, approved: true });
    assert.strictEqual(approvals.length, 1);
    assert.strictEqual(approvals[0].payload.marker, 'canonical');
    assert.strictEqual(client.emitted.at(-1).name, HOSTLESS_RESTORE_EVENTS.APPROVED);
});

runTest('coordinator eventの公開statusにraw payloadやhashを含めない', () => {
    const { runtime, sockets } = setup();
    const client = socket('s1');
    sockets.set(client.id, client);
    runtime.request(client, { roomId: 'ROOM01', playerIndex: 1 });
    runtime.handleCoordinatorEvent({
        type: 'terminal',
        roomId: 'ROOM01',
        generation: 0,
        stage: 'collecting',
        reason: 'candidate-mismatch',
        candidateCount: 2,
        canonicalHash: 'secret-hash',
        payload: { raw: true },
    });
    const status = client.emitted.at(-1);
    assert.strictEqual(status.name, HOSTLESS_RESTORE_EVENTS.STATUS);
    assert.strictEqual(JSON.stringify(status.payload).includes('secret-hash'), false);
    assert.strictEqual(JSON.stringify(status.payload).includes('raw'), false);
});

runTest('disconnectは確認rotationへ通知しhost復元はsessionを終了する', () => {
    const { runtime, sockets } = setup();
    const client = socket('s1');
    sockets.set(client.id, client);
    runtime.request(client, { roomId: 'ROOM01', playerIndex: 1 });
    assert.strictEqual(runtime.disconnect(client), true);
    assert.strictEqual(runtime.hostRestored('ROOM01'), true);
    assert.strictEqual(runtime.inspect('ROOM01').requesterCount, 0);
});
