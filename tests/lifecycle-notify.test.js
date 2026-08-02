const assert = require('assert');
const LifecycleNotify = require('../js/lifecycleNotify');
const { runTest } = require('./helpers/test-utils');

runTest('lifecycle notify は既存opt-out値だけを無効として扱う', () => {
    for (const value of ['0', 'false', 'FALSE', 'no', 'off', 'disabled']) {
        assert.strictEqual(LifecycleNotify.isDisabledValue(value), true, value);
    }
    for (const value of [null, '', '1', 'true', 'yes', 'enabled']) {
        assert.strictEqual(LifecycleNotify.isDisabledValue(value), false, String(value));
    }
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
