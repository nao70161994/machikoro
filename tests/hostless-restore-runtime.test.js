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
        cancel(roomId) {
            return sessions.delete(roomId);
        },
        hostRestored(roomId) {
            const existed = sessions.delete(roomId);
            return existed;
        },
    };
    let prepareCalls = 0;
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
            prepareCalls++;
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
    return {
        sockets,
        sessions,
        coordinator,
        gateway,
        approvals,
        runtime,
        getPrepareCalls: () => prepareCalls,
    };
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

runTest('requestはroom IDを大文字化し同一socketの旧sessionを解放する', () => {
    const { runtime, sessions } = setup();
    const client = socket('s1');
    assert.strictEqual(runtime.request(client, { roomId: 'room01', playerIndex: 1 }).ok, true);
    assert.strictEqual(client.hostlessRestoreRoomId, 'ROOM01');
    assert.strictEqual(sessions.has('ROOM01'), true);

    assert.strictEqual(runtime.request(client, { roomId: 'room02', playerIndex: 1 }).ok, true);
    assert.strictEqual(sessions.has('ROOM01'), false);
    assert.strictEqual(runtime.inspect('ROOM01').requesterCount, 0);
    assert.strictEqual(sessions.has('ROOM02'), true);
    assert.strictEqual(client.hostlessRestoreRoomId, 'ROOM02');
});

runTest('socket切替は旧roomの他requesterと置換後の現ownerを解除しない', () => {
    const active = setup();
    const first = socket('s1');
    const other = socket('s2');
    active.runtime.request(first, { roomId: 'ROOM01', playerIndex: 1 });
    active.runtime.request(other, { roomId: 'ROOM01', playerIndex: 2 });
    active.runtime.request(first, { roomId: 'ROOM02', playerIndex: 1 });
    assert.strictEqual(active.sessions.has('ROOM01'), true);
    assert.strictEqual(active.runtime.inspect('ROOM01').requesterCount, 1);

    const replaced = setup();
    const stale = socket('stale');
    const current = socket('current');
    replaced.runtime.request(stale, { roomId: 'ROOM01', playerIndex: 1 });
    replaced.runtime.request(current, { roomId: 'ROOM01', playerIndex: 1 });
    replaced.runtime.request(stale, { roomId: 'ROOM02', playerIndex: 1 });
    assert.strictEqual(replaced.sessions.has('ROOM01'), true);
    assert.strictEqual(replaced.runtime.inspect('ROOM01').requesterCount, 1);
    assert.strictEqual(current.hostlessRestoreRoomId, 'ROOM01');
});

runTest('IP start-rateは新規sessionだけを制限し既存session参加を許可する', () => {
    let allowed = true;
    const marks = [];
    const active = setup({
        startRateKeyForSocket: () => 'ip:shared',
        canStartForRateKey: key => allowed && key === 'ip:shared',
        markStartForRateKey: key => marks.push(key),
    });
    const first = socket('s1');
    const late = socket('s2');
    const rejected = socket('s3');
    assert.strictEqual(active.runtime.request(first, { roomId: 'ROOM01', playerIndex: 1 }).ok, true);
    assert.deepStrictEqual(marks, ['ip:shared']);

    allowed = false;
    assert.strictEqual(active.runtime.request(late, { roomId: 'ROOM01', playerIndex: 2 }).ok, true);
    assert.strictEqual(active.runtime.request(rejected, { roomId: 'ROOM02', playerIndex: 1 }).reason, 'start-rate-limit');
    assert.deepStrictEqual(marks, ['ip:shared']);
    assert.strictEqual(active.sessions.has('ROOM02'), false);
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
        generation: 0,
        attemptCount: 0,
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
        roomId: 'ROOM01', playerIndex: 1, generation: 3, attemptCount: 0,
    }).reason, 'generation-mismatch');
    const stranger = socket('other');
    assert.strictEqual(runtime.submit(stranger, {
        roomId: 'ROOM01', playerIndex: 1, generation: 2,
    }).reason, 'requester-mismatch');
});

runTest('candidateは軽量identity gateとcooldown後だけ復元payloadを処理する', () => {
    let now = 1000;
    const disabled = setup({ enabled: false, now: () => now });
    const disabledClient = socket('disabled');
    assert.strictEqual(disabled.runtime.submit(disabledClient, {}).reason, 'disabled');
    assert.strictEqual(disabled.getPrepareCalls(), 0);

    const active = setup({ now: () => now });
    const client = socket('s1');
    const stranger = socket('stranger');
    assert.strictEqual(active.runtime.submit(stranger, { roomId: 'ROOM01', playerIndex: 1 }).reason, 'requester-mismatch');
    assert.strictEqual(active.getPrepareCalls(), 0);
    active.runtime.request(client, { roomId: 'ROOM01', playerIndex: 1 });
    assert.strictEqual(active.runtime.submit(client, { roomId: 'ROOM01', playerIndex: 1 }).reason, 'not-collecting');
    assert.strictEqual(active.getPrepareCalls(), 0);
    active.sessions.get('ROOM01').stage = 'collecting';
    const candidate = { roomId: 'ROOM01', playerIndex: 1, generation: 0, attemptCount: 0 };
    assert.strictEqual(active.runtime.submit(client, candidate).ok, true);
    assert.strictEqual(active.getPrepareCalls(), 1);
    assert.strictEqual(active.runtime.submit(client, candidate).reason, 'candidate-rate-limit');
    assert.strictEqual(active.getPrepareCalls(), 1);
    now += 1000;
    assert.strictEqual(active.runtime.submit(client, candidate).ok, true);
    assert.strictEqual(active.getPrepareCalls(), 2);
});

runTest('candidateは世代と試行回数を整数で必須化して非zero sessionを処理する', () => {
    const active = setup();
    const client = socket('s1');
    active.runtime.request(client, {
        roomId: 'ROOM01', playerIndex: 1, generation: 2, attemptCount: 1,
    });
    active.sessions.get('ROOM01').stage = 'collecting';
    for (const payload of [
        { roomId: 'ROOM01', playerIndex: 1 },
        { roomId: 'ROOM01', playerIndex: 1, generation: 2, attemptCount: '1' },
    ]) {
        assert.strictEqual(active.runtime.submit(client, payload).reason, 'invalid-payload');
    }
    assert.strictEqual(active.getPrepareCalls(), 0);
    assert.strictEqual(active.runtime.submit(client, {
        roomId: 'ROOM01', playerIndex: 1, generation: 2, attemptCount: 1,
    }).ok, true);
    assert.strictEqual(active.getPrepareCalls(), 1);
});

runTest('candidate cooldownは再request・別socket・切断を越えてroom/player単位で維持する', () => {
    let now = 1000;
    const active = setup({ now: () => now });
    const first = socket('s1');
    const second = socket('s2');
    const third = socket('s3');
    const keeper = socket('keeper');
    const request = { roomId: 'ROOM01', playerIndex: 1, generation: 0, attemptCount: 0 };
    const candidate = { ...request };

    active.runtime.request(first, request);
    active.runtime.request(keeper, { ...request, playerIndex: 2 });
    active.sessions.get('ROOM01').stage = 'collecting';
    assert.strictEqual(active.runtime.submit(first, candidate).ok, true);
    active.runtime.request(first, request);
    assert.strictEqual(active.runtime.submit(first, candidate).reason, 'candidate-rate-limit');

    active.runtime.request(second, request);
    assert.strictEqual(active.runtime.submit(second, candidate).reason, 'candidate-rate-limit');
    assert.strictEqual(active.runtime.disconnect(first), true);
    assert.strictEqual(active.runtime.submit(second, candidate).reason, 'candidate-rate-limit');

    now += 1000;
    assert.strictEqual(active.runtime.submit(second, candidate).ok, true);
    assert.strictEqual(active.runtime.disconnect(second), true);
    active.runtime.request(third, request);
    assert.strictEqual(active.runtime.submit(third, candidate).reason, 'candidate-rate-limit');
    assert.strictEqual(active.getPrepareCalls(), 2);

    active.runtime.handleCoordinatorEvent({
        type: 'terminal', roomId: 'ROOM01', generation: 0, stage: 'collecting', reason: 'cancelled',
    });
    assert.strictEqual(active.runtime.inspect('ROOM01').requesterCount, 0);
});

runTest('confirmationはmalformed payloadとdisabled状態を例外なく拒否する', () => {
    const disabled = setup({ enabled: false });
    const disabledClient = socket('disabled');
    assert.deepStrictEqual(disabled.runtime.confirm(disabledClient, null), { ok: false, reason: 'disabled' });

    const { runtime } = setup();
    const client = socket('s1');
    runtime.registerSocket(client);
    for (const payload of [null, [], 'ROOM01']) {
        assert.doesNotThrow(() => runtime.confirm(client, payload));
        assert.deepStrictEqual(runtime.confirm(client, payload), { ok: false, reason: 'invalid-payload' });
        assert.doesNotThrow(() => client.handlers[HOSTLESS_RESTORE_EVENTS.CONFIRM](payload));
    }
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

runTest('最後のactive requester切断はsessionを終了しhost復元はno-opになる', () => {
    const { runtime, sockets } = setup();
    const client = socket('s1');
    sockets.set(client.id, client);
    runtime.request(client, { roomId: 'ROOM01', playerIndex: 1 });
    assert.strictEqual(runtime.disconnect(client), true);
    assert.strictEqual(runtime.hostRestored('ROOM01'), false);
    assert.strictEqual(runtime.inspect('ROOM01').requesterCount, 0);
});
