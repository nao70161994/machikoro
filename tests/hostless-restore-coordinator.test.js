const assert = require('assert');
const {
    HOSTLESS_RESTORE_SCHEMA_VERSION,
    HOSTLESS_RESTORE_RESULTS,
} = require('../server/hostlessRestoreCandidate');
const {
    HOSTLESS_RESTORE_STAGES,
    HOSTLESS_RESTORE_TERMINAL_REASONS,
    createHostlessRestoreCoordinator,
} = require('../server/hostlessRestoreCoordinator');

function runTest(name, fn) {
    try {
        fn();
        console.log(`テスト成功: ${name}`);
    } catch (error) {
        console.error(`テスト失敗: ${name}`);
        throw error;
    }
}

function createClock() {
    let now = 1_000;
    let nextId = 1;
    const timers = new Map();
    function setTimeout(callback, delay) {
        const id = nextId++;
        timers.set(id, { callback, at: now + delay });
        return id;
    }
    function clearTimeout(id) {
        timers.delete(id);
    }
    function advance(ms) {
        const target = now + ms;
        while (true) {
            const due = Array.from(timers.entries())
                .filter(([, timer]) => timer.at <= target)
                .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            if (!due) break;
            timers.delete(due[0]);
            now = due[1].at;
            due[1].callback();
        }
        now = target;
    }
    return { now: () => now, setTimeout, clearTimeout, advance, pending: () => timers.size };
}

function candidate(playerIndex, overrides = {}) {
    return Object.assign({
        playerIndex,
        playerType: 'human',
        socketId: `socket-${playerIndex}`,
        capabilityVersion: HOSTLESS_RESTORE_SCHEMA_VERSION,
        generation: 1,
        rank: { hostEpoch: 2, actionSeq: 9 },
        canonicalHash: 'c'.repeat(64),
        completed: false,
        payload: { source: playerIndex },
    }, overrides);
}

function setup(overrides = {}) {
    const clock = createClock();
    const events = [];
    const coordinator = createHostlessRestoreCoordinator(Object.assign({
        now: clock.now,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        onEvent: event => events.push(event),
    }, overrides));
    return { clock, events, coordinator };
}

runTest('coordinatorは60秒host grace後に30秒候補収集へ進む', () => {
    const { clock, events, coordinator } = setup();
    assert.deepStrictEqual(coordinator.start({ roomId: 'room1', generation: 1 }), {
        ok: true,
        roomId: 'ROOM1',
        generation: 1,
    });
    assert.strictEqual(coordinator.inspect('room1').stage, HOSTLESS_RESTORE_STAGES.HOST_GRACE);
    clock.advance(59_999);
    assert.strictEqual(coordinator.inspect('room1').stage, HOSTLESS_RESTORE_STAGES.HOST_GRACE);
    clock.advance(1);
    assert.strictEqual(coordinator.inspect('room1').stage, HOSTLESS_RESTORE_STAGES.COLLECTING);
    assert.deepStrictEqual(events.map(event => event.type), ['host-grace-started', 'collection-started']);
    clock.advance(30_000);
    assert.strictEqual(coordinator.inspect('room1'), null);
    assert.strictEqual(events.at(-1).reason, HOSTLESS_RESTORE_RESULTS.INSUFFICIENT);
});

runTest('hostがgrace中に復元した場合は候補収集を開始しない', () => {
    const { clock, events, coordinator } = setup();
    coordinator.start({ roomId: 'ROOM1' });
    assert.strictEqual(coordinator.hostRestored('room1'), true);
    clock.advance(180_000);
    assert.strictEqual(coordinator.inspect('ROOM1'), null);
    assert.strictEqual(events.at(-1).reason, HOSTLESS_RESTORE_TERMINAL_REASONS.HOST_RESTORED);
});

runTest('全一致quorumは元player順で確認を要求し承認候補だけ返す', () => {
    const { clock, events, coordinator } = setup();
    coordinator.start({ roomId: 'ROOM1', generation: 1 });
    clock.advance(60_000);
    coordinator.submitCandidate('ROOM1', candidate(3));
    coordinator.submitCandidate('ROOM1', candidate(1));
    clock.advance(30_000);
    assert.strictEqual(coordinator.inspect('ROOM1').stage, HOSTLESS_RESTORE_STAGES.CONFIRMING);
    assert.strictEqual(coordinator.inspect('ROOM1').confirmationPlayerIndex, 1);
    const result = coordinator.respondToConfirmation('ROOM1', 1, true);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.approved, true);
    assert.strictEqual(result.playerIndex, 1);
    assert.deepStrictEqual(result.candidate.payload, { source: 1 });
    assert.strictEqual(coordinator.inspect('ROOM1'), null);
    assert.strictEqual(events.at(-1).type, 'approved');
});

runTest('候補不一致は多数決せず全raw候補を破棄する', () => {
    const { clock, events, coordinator } = setup();
    coordinator.start({ roomId: 'ROOM1' });
    clock.advance(60_000);
    coordinator.submitCandidate('ROOM1', candidate(0));
    coordinator.submitCandidate('ROOM1', candidate(1));
    coordinator.submitCandidate('ROOM1', candidate(2, { canonicalHash: 'd'.repeat(64) }));
    clock.advance(30_000);
    assert.strictEqual(coordinator.inspect('ROOM1'), null);
    assert.strictEqual(events.at(-1).reason, HOSTLESS_RESTORE_RESULTS.MISMATCH);
    assert.strictEqual(events.at(-1).candidateCount, 3);
});

runTest('同一playerの再提出は置換し異なるfingerprintは即fail closedにする', () => {
    const { clock, events, coordinator } = setup();
    coordinator.start({ roomId: 'ROOM1' });
    clock.advance(60_000);
    assert.deepStrictEqual(coordinator.submitCandidate('ROOM1', candidate(1)), {
        ok: true,
        replaced: false,
    });
    assert.deepStrictEqual(coordinator.submitCandidate('ROOM1', candidate(1, { payload: { source: 'new' } })), {
        ok: true,
        replaced: true,
    });
    assert.strictEqual(coordinator.inspect('ROOM1').candidateCount, 1);
    assert.strictEqual(coordinator.submitCandidate('ROOM1', candidate(1, {
        canonicalHash: 'd'.repeat(64),
    })).reason, HOSTLESS_RESTORE_RESULTS.MISMATCH);
    assert.strictEqual(coordinator.inspect('ROOM1'), null);
    assert.strictEqual(events.at(-1).reason, HOSTLESS_RESTORE_RESULTS.MISMATCH);
});

runTest('確認拒否・切断・timeoutは次のplayerへ移り全員失敗で終了する', () => {
    const { clock, events, coordinator } = setup();
    coordinator.start({ roomId: 'ROOM1' });
    clock.advance(60_000);
    coordinator.submitCandidate('ROOM1', candidate(1));
    coordinator.submitCandidate('ROOM1', candidate(2));
    coordinator.submitCandidate('ROOM1', candidate(3));
    coordinator.submitCandidate('ROOM1', candidate(4));
    clock.advance(30_000);
    assert.strictEqual(coordinator.inspect('ROOM1').confirmationPlayerIndex, 1);
    coordinator.respondToConfirmation('ROOM1', 1, false);
    assert.strictEqual(coordinator.inspect('ROOM1').confirmationPlayerIndex, 2);
    assert.strictEqual(events.at(-1).type, 'confirmation-requested');
    assert.strictEqual(events.at(-1).reason, 'rejected');
    clock.advance(60_000);
    assert.strictEqual(coordinator.inspect('ROOM1').confirmationPlayerIndex, 3);
    assert.strictEqual(events.at(-1).type, 'confirmation-requested');
    assert.strictEqual(events.at(-1).reason, 'timeout');
    coordinator.confirmationOwnerDisconnected('ROOM1', 3);
    assert.strictEqual(coordinator.inspect('ROOM1').confirmationPlayerIndex, 4);
    assert.strictEqual(events.at(-1).type, 'confirmation-requested');
    assert.strictEqual(events.at(-1).reason, 'disconnected');
    coordinator.respondToConfirmation('ROOM1', 4, false);
    assert.strictEqual(coordinator.inspect('ROOM1'), null);
    assert.strictEqual(events.at(-1).reason, HOSTLESS_RESTORE_TERMINAL_REASONS.CONFIRMATION_EXHAUSTED);
    assert.strictEqual(events.at(-1).confirmationReason, 'rejected');
});

runTest('確認中でもcollection開始から2分でraw候補を破棄する', () => {
    const { clock, events, coordinator } = setup();
    coordinator.start({ roomId: 'ROOM1' });
    clock.advance(60_000);
    coordinator.submitCandidate('ROOM1', candidate(1));
    coordinator.submitCandidate('ROOM1', candidate(2));
    coordinator.submitCandidate('ROOM1', candidate(3));
    clock.advance(30_000);
    clock.advance(90_000);
    assert.strictEqual(coordinator.inspect('ROOM1'), null);
    assert.strictEqual(events.at(-1).reason, HOSTLESS_RESTORE_TERMINAL_REASONS.RETENTION_TIMEOUT);
});

runTest('確認owner以外の応答と収集外candidateを拒否する', () => {
    const { clock, coordinator } = setup();
    coordinator.start({ roomId: 'ROOM1' });
    assert.strictEqual(coordinator.submitCandidate('ROOM1', candidate(1)).ok, false);
    clock.advance(60_000);
    coordinator.submitCandidate('ROOM1', candidate(1));
    coordinator.submitCandidate('ROOM1', candidate(2));
    clock.advance(30_000);
    assert.deepStrictEqual(coordinator.respondToConfirmation('ROOM1', 2, true), {
        ok: false,
        reason: 'not-confirmation-owner',
    });
});

runTest('disabled・重複開始・3回上限を副作用なしで拒否する', () => {
    const { coordinator } = setup();
    assert.strictEqual(coordinator.start({ roomId: 'OFF01', enabled: false }).reason, 'disabled');
    assert.strictEqual(coordinator.start({ roomId: 'ROOM1' }).ok, true);
    assert.strictEqual(coordinator.start({ roomId: 'ROOM1' }).reason, 'already-started');
    assert.strictEqual(coordinator.start({ roomId: 'LIMIT1', attemptCount: 3 }).reason, 'attempt-limit');
});

runTest('active session上限は新規開始だけを拒否しterminal後に枠を解放する', () => {
    const { coordinator } = setup({ limits: { maxActiveSessions: 2 } });
    assert.strictEqual(coordinator.start({ roomId: 'ROOM1' }).ok, true);
    assert.strictEqual(coordinator.start({ roomId: 'ROOM2' }).ok, true);
    assert.strictEqual(coordinator.activeCount(), 2);
    assert.strictEqual(coordinator.start({ roomId: 'ROOM3' }).reason, 'session-limit');
    assert.strictEqual(coordinator.start({ roomId: 'ROOM1' }).reason, 'already-started');
    assert.strictEqual(coordinator.cancel('ROOM1'), true);
    assert.strictEqual(coordinator.activeCount(), 1);
    assert.strictEqual(coordinator.start({ roomId: 'ROOM3' }).ok, true);
    assert.strictEqual(coordinator.activeCount(), 2);
});

runTest('coordinator診断はraw candidate payloadを公開しない', () => {
    const { clock, coordinator } = setup();
    coordinator.start({ roomId: 'ROOM1' });
    clock.advance(60_000);
    coordinator.submitCandidate('ROOM1', candidate(1, { payload: { secret: 'raw-state' } }));
    const diagnostic = coordinator.inspect('ROOM1');
    assert.deepStrictEqual(Object.keys(diagnostic).sort(), [
        'attemptCount',
        'candidateCount',
        'collectionStartedAt',
        'confirmationPlayerIndex',
        'generation',
        'roomId',
        'stage',
        'startedAt',
    ]);
    assert.strictEqual(JSON.stringify(diagnostic).includes('raw-state'), false);
});
