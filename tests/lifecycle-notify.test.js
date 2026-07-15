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
