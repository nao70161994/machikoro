const assert = require('assert');
const LifecycleNotify = require('../js/lifecycleNotify');
const { runTest } = require('./helpers/test-utils');

runTest('lifecycle storage gatewayは現行key・legacy fallback・marker形式を維持する', () => {
    const values = new Map([[LifecycleNotify.storageKeys.legacyNotify, 'false']]);
    const calls = [];
    const accessStorage = (operation, fallback) => {
        calls.push(['access', fallback]);
        return operation({
            getItem(key) {
                calls.push(['get', key]);
                return values.has(key) ? values.get(key) : null;
            },
            setItem(key, value) {
                calls.push(['set', key, value]);
                values.set(key, value);
            },
            removeItem(key) {
                calls.push(['remove', key]);
                values.delete(key);
            },
        });
    };

    assert.ok(Object.isFrozen(LifecycleNotify.storageKeys));
    assert.strictEqual(LifecycleNotify.readNotificationValue(accessStorage), 'false');
    LifecycleNotify.writeNotificationEnabled(accessStorage, true);
    assert.strictEqual(LifecycleNotify.readNotificationValue(accessStorage), 'true');
    LifecycleNotify.writeStartMarker(accessStorage, 'online|4|2', 1000);
    assert.strictEqual(
        LifecycleNotify.readStartMarker(accessStorage),
        '{"signature":"online|4|2","timestamp":1000}'
    );
    LifecycleNotify.clearStartMarker(accessStorage);
    assert.strictEqual(LifecycleNotify.readStartMarker(accessStorage), null);
    assert.deepStrictEqual(calls.slice(0, 3), [
        ['access', null],
        ['get', 'machikoroLifecycleNotifyEnabled'],
        ['get', 'machikoroLifecycleNotificationsEnabled'],
    ]);
    assert.ok(calls.some(call => call.join('|') === 'set|machikoroLifecycleNotifyEnabled|true'));
    assert.ok(calls.some(call => call.join('|') === 'remove|machikoroLifecycleNotificationsEnabled'));
});

runTest('lifecycle notify は既存opt-out値だけを無効として扱う', () => {
    for (const value of ['0', 'false', 'FALSE', 'no', 'off', 'disabled']) {
        assert.strictEqual(LifecycleNotify.isDisabledValue(value), true, value);
    }
    for (const value of [null, '', '1', 'true', 'yes', 'enabled']) {
        assert.strictEqual(LifecycleNotify.isDisabledValue(value), false, String(value));
    }
});

runTest('lifecycle runtime metadataはCPU数・人数・mode・versionをpureに投影する', () => {
    const sparseCpuPlayers = [];
    sparseCpuPlayers[0] = null;
    sparseCpuPlayers[2] = { difficulty: 'normal' };

    assert.strictEqual(LifecycleNotify.cpuCount(sparseCpuPlayers), 1);
    assert.strictEqual(LifecycleNotify.cpuCount(null), 0);
    assert.strictEqual(LifecycleNotify.playerCount([{}, {}, {}], 9), 3);
    assert.strictEqual(LifecycleNotify.playerCount(null, '4'), 4);
    assert.strictEqual(LifecycleNotify.gameMode(true), 'online');
    assert.strictEqual(LifecycleNotify.gameMode(false), 'local');
    assert.strictEqual(LifecycleNotify.appVersion('abc123'), 'abc123');
    assert.strictEqual(LifecycleNotify.appVersion(''), '');
});

runTest('lifecycle runtime metadataは既存の不正値fallbackを維持する', () => {
    assert.strictEqual(LifecycleNotify.playerCount(null, 0), 0);
    assert.strictEqual(LifecycleNotify.playerCount(null, 'invalid'), 0);
    assert.strictEqual(LifecycleNotify.playerCount(null, -2), -2);
    assert.strictEqual(LifecycleNotify.appVersion(42), 42);

    const throwingCpuPlayers = new Proxy([], {
        get() {
            throw new Error('broken cpu players');
        },
    });
    const throwingCount = {
        valueOf() {
            throw new Error('broken selected count');
        },
    };
    assert.strictEqual(LifecycleNotify.cpuCount(throwingCpuPlayers), 0);
    assert.strictEqual(LifecycleNotify.playerCount(null, throwingCount), 0);
});

runTest('lifecycle stateはsession/start/finishをimmutableに保持する', () => {
    const state = LifecycleNotify.lifecycleState('session-1', true, false);
    assert.deepStrictEqual(state, {
        sessionId: 'session-1',
        startSent: true,
        finishSent: false,
    });
    assert.strictEqual(Object.isFrozen(state), true);
    assert.strictEqual(
        LifecycleNotify.ensureSessionState(state, 'ignored-session'),
        state
    );
    assert.deepStrictEqual(
        LifecycleNotify.ensureSessionState(LifecycleNotify.lifecycleState(), 'session-2'),
        { sessionId: 'session-2', startSent: false, finishSent: false }
    );
});

runTest('lifecycle start transitionは送信・reload抑止・多重送信をpureに区別する', () => {
    const initial = LifecycleNotify.lifecycleState();
    const send = LifecycleNotify.startTransition(initial, false, 'session-1');
    assert.deepStrictEqual(send, {
        status: 'send',
        state: { sessionId: 'session-1', startSent: true, finishSent: false },
        shouldSend: true,
        shouldRememberStart: true,
    });
    assert.strictEqual(Object.isFrozen(send), true);
    assert.strictEqual(Object.isFrozen(send.state), true);
    assert.deepStrictEqual(initial, { sessionId: '', startSent: false, finishSent: false });

    const suppressedSource = LifecycleNotify.lifecycleState('', false, true);
    const suppressed = LifecycleNotify.startTransition(suppressedSource, true, 'unused');
    assert.deepStrictEqual(suppressed, {
        status: 'suppressed',
        state: { sessionId: '', startSent: true, finishSent: true },
        shouldSend: false,
        shouldRememberStart: false,
    });

    const duplicate = LifecycleNotify.startTransition(send.state, false, 'unused');
    assert.strictEqual(duplicate.status, 'already-sent');
    assert.strictEqual(duplicate.state, send.state);
    assert.strictEqual(duplicate.shouldSend, false);
    assert.strictEqual(duplicate.shouldRememberStart, false);
});

runTest('lifecycle finish/reset transitionは一度だけ送信して初期stateへ戻す', () => {
    const started = LifecycleNotify.lifecycleState('session-1', true, false);
    const finish = LifecycleNotify.finishTransition(started);
    assert.deepStrictEqual(finish, {
        status: 'send',
        state: { sessionId: 'session-1', startSent: true, finishSent: true },
        shouldSend: true,
        shouldRememberStart: false,
    });
    const duplicate = LifecycleNotify.finishTransition(finish.state);
    assert.strictEqual(duplicate.status, 'already-sent');
    assert.strictEqual(duplicate.state, finish.state);
    assert.strictEqual(duplicate.shouldSend, false);
    assert.deepStrictEqual(LifecycleNotify.resetLifecycleState(), {
        sessionId: '',
        startSent: false,
        finishSent: false,
    });
});

runTest('lifecycle finish payload追加fieldは勝者種別を決定論的に投影する', () => {
    assert.deepStrictEqual(LifecycleNotify.finishPayloadExtras(12, 'strong'), {
        turn: 12,
        winnerKind: 'cpu',
        winnerCpuDifficulty: 'strong',
    });
    assert.deepStrictEqual(LifecycleNotify.finishPayloadExtras(0, ''), {
        turn: 0,
        winnerKind: 'human',
        winnerCpuDifficulty: '',
    });
    assert.strictEqual(Object.isFrozen(LifecycleNotify.finishPayloadExtras(1, null)), true);
});

runTest('lifecycle finishは勝者参照から既存CPU難易度をpureに取得する', () => {
    const human = { name: 'human' };
    const cpuWinner = { name: 'cpu' };
    const players = [human, cpuWinner];
    const cpuPlayers = [null, { difficulty: 'expert' }];

    assert.strictEqual(
        LifecycleNotify.winnerCpuDifficulty(players, cpuPlayers, cpuWinner),
        'expert'
    );
    assert.strictEqual(LifecycleNotify.winnerCpuDifficulty(players, cpuPlayers, human), '');
    assert.strictEqual(LifecycleNotify.winnerCpuDifficulty(players, cpuPlayers, {}), '');
    assert.strictEqual(LifecycleNotify.winnerCpuDifficulty(null, cpuPlayers, cpuWinner), '');
    assert.strictEqual(LifecycleNotify.winnerCpuDifficulty(players, null, cpuWinner), '');
});

runTest('lifecycle finishのCPU難易度取得は不正値を既存どおり空文字へfallbackする', () => {
    const winner = {};
    const throwingCpu = {};
    Object.defineProperty(throwingCpu, 'difficulty', {
        get() {
            throw new Error('broken difficulty');
        },
    });

    assert.strictEqual(LifecycleNotify.winnerCpuDifficulty([winner], [throwingCpu], winner), '');
    assert.strictEqual(LifecycleNotify.winnerCpuDifficulty([winner], [{ difficulty: 0 }], winner), '');
    assert.strictEqual(LifecycleNotify.winnerCpuDifficulty([winner], [{ difficulty: 42 }], winner), '42');
});

runTest('lifecycle notify は既存payload fieldとoptional条件を維持する', () => {
    assert.deepStrictEqual(LifecycleNotify.buildPayload({
        event: 'play-finish',
        mode: 'online',
        playerCount: 4,
        cpuCount: 2,
        sessionId: 'session-1',
        appVersion: 'abc123',
        turn: 0,
        winnerKind: 'cpu',
        winnerCpuDifficulty: 'strong',
    }), {
        event: 'play-finish',
        mode: 'online',
        playerCount: 4,
        cpuCount: 2,
        sessionId: 'session-1',
        appVersion: 'abc123',
        turn: 0,
        winnerKind: 'cpu',
        winnerCpuDifficulty: 'strong',
    });

    assert.deepStrictEqual(LifecycleNotify.buildPayload({
        event: 'play-start',
        mode: 'local',
        playerCount: 2,
        cpuCount: 1,
        sessionId: 'session-2',
        appVersion: '',
        winnerKind: '',
        winnerCpuDifficulty: null,
    }), {
        event: 'play-start',
        mode: 'local',
        playerCount: 2,
        cpuCount: 1,
        sessionId: 'session-2',
        appVersion: '',
    });
});

runTest('lifecycle notify は開始署名と保存markerの既存形式を固定する', () => {
    const signature = LifecycleNotify.startSignature('online', 4, 2);
    assert.strictEqual(signature, 'online|4|2');
    assert.strictEqual(
        LifecycleNotify.serializeStartMarker(signature, 1000),
        '{"signature":"online|4|2","timestamp":1000}'
    );
});

runTest('lifecycle notify stateは現行keyとopt-out/default状態をpureに投影する', () => {
    assert.deepStrictEqual(LifecycleNotify.notificationState('current', 'legacy', null), {
        key: 'current',
        legacyKey: 'legacy',
        value: null,
        enabled: true,
        defaultEnabled: true,
    });
    assert.deepStrictEqual(LifecycleNotify.notificationState('current', 'legacy', 'false'), {
        key: 'current',
        legacyKey: 'legacy',
        value: 'false',
        enabled: false,
        defaultEnabled: false,
    });
    assert.strictEqual(Object.isFrozen(
        LifecycleNotify.notificationState('current', 'legacy', 'true')
    ), true);
});

runTest('lifecycle session IDは注入時刻と乱数から決定論的に生成する', () => {
    const now = 1700000000000;
    const randomValue = 0.123456789;
    assert.strictEqual(
        LifecycleNotify.createSessionId(now, randomValue),
        now.toString(36) + '-' + randomValue.toString(36).slice(2, 10)
    );
});

runTest('lifecycle notify は開始通知のstrict抑止境界と壊れたmarkerを固定する', () => {
    const raw = LifecycleNotify.serializeStartMarker('local|2|1', 1000);
    assert.strictEqual(LifecycleNotify.isRecentStart(raw, 'local|2|1', 1099, 100), true);
    assert.strictEqual(LifecycleNotify.isRecentStart(raw, 'local|2|1', 1100, 100), false);
    assert.strictEqual(LifecycleNotify.isRecentStart(raw, 'other', 1099, 100), false);
    for (const malformed of [null, '', '{', 'null', '[]', '{"signature":"local|2|1"}']) {
        assert.strictEqual(
            LifecycleNotify.isRecentStart(malformed, 'local|2|1', 1099, 100),
            false,
            String(malformed)
        );
    }
});


runTest('lifecycle controllerはsession/start/finishの唯一のmutable ownerになる', () => {
    const controller = LifecycleNotify.createController();
    assert.deepStrictEqual(controller.snapshot(), {
        sessionId: '', startSent: false, finishSent: false,
    });
    const ensured = controller.ensureSession('session-1');
    assert.strictEqual(controller.snapshot(), ensured);
    assert.deepStrictEqual(ensured, {
        sessionId: 'session-1', startSent: false, finishSent: false,
    });

    const started = controller.start(false, 'ignored-session');
    assert.strictEqual(started.status, 'send');
    assert.strictEqual(controller.snapshot(), started.state);
    assert.deepStrictEqual(controller.snapshot(), {
        sessionId: 'ignored-session', startSent: true, finishSent: false,
    });

    const finished = controller.finish();
    assert.strictEqual(finished.status, 'send');
    assert.strictEqual(controller.snapshot(), finished.state);
    assert.deepStrictEqual(controller.snapshot(), {
        sessionId: 'ignored-session', startSent: true, finishSent: true,
    });
    assert.ok(Object.isFrozen(controller));
});

runTest('lifecycle controllerはduplicate/suppressed/resetの既存transitionを維持する', () => {
    const controller = LifecycleNotify.createController({
        sessionId: 'existing', startSent: false, finishSent: true,
    });
    const suppressed = controller.start(true, 'unused');
    assert.strictEqual(suppressed.status, 'suppressed');
    assert.deepStrictEqual(controller.snapshot(), {
        sessionId: 'existing', startSent: true, finishSent: true,
    });
    assert.strictEqual(controller.start(false, 'unused').status, 'already-sent');
    assert.strictEqual(controller.finish().status, 'already-sent');
    assert.deepStrictEqual(controller.reset(), {
        sessionId: '', startSent: false, finishSent: false,
    });
});
