const assert = require('assert');
const { makeGameLifecycleReporting } = require('../server/gameLifecycleReporting');
const { runTest } = require('./helpers/test-utils');

const reporting = makeGameLifecycleReporting({
    truncateText(value, maxLength) {
        return String(value || '').slice(0, maxLength);
    },
});

runTest('server lifecycle reporting はevent titleとCPU難易度labelを維持する', () => {
    assert.strictEqual(reporting.lifecycleEventTitle('play-start'), '[ダイスシティ] Game Started');
    assert.strictEqual(reporting.lifecycleEventTitle('victory'), '[ダイスシティ] Victory');
    assert.strictEqual(reporting.lifecycleEventTitle('play-finish'), '[ダイスシティ] Game Finished');

    assert.strictEqual(reporting.lifecycleCpuDifficultyLabel('weak'), 'Weak');
    assert.strictEqual(reporting.lifecycleCpuDifficultyLabel('normal'), 'Normal');
    assert.strictEqual(reporting.lifecycleCpuDifficultyLabel('strong'), 'Strong');
    assert.strictEqual(reporting.lifecycleCpuDifficultyLabel('expert'), 'Expert');
    assert.strictEqual(reporting.lifecycleCpuDifficultyLabel('rl'), 'RL');
    assert.strictEqual(reporting.lifecycleCpuDifficultyLabel('unknown'), '');
});

runTest('server lifecycle reporting は不正event・人数・sessionを拒否する', () => {
    assert.deepStrictEqual(reporting.normalizeGameLifecyclePayload(null), {
        ok: false,
        reason: 'invalid_event',
    });
    assert.deepStrictEqual(reporting.normalizeGameLifecyclePayload({
        event: 'unknown',
        playerCount: 2,
        sessionId: 'session',
    }), {
        ok: false,
        reason: 'invalid_event',
    });
    assert.deepStrictEqual(reporting.normalizeGameLifecyclePayload({
        event: 'play-start',
        playerCount: 'invalid',
        sessionId: 'session',
    }), {
        ok: false,
        reason: 'invalid_player_count',
    });
    assert.deepStrictEqual(reporting.normalizeGameLifecyclePayload({
        event: 'play-start',
        playerCount: 2,
        sessionId: '***',
    }), {
        ok: false,
        reason: 'invalid_session_id',
    });
});

runTest('server lifecycle reporting は既存の範囲・sanitize・privacy契約を維持する', () => {
    const normalized = reporting.normalizeGameLifecyclePayload({
        event: 'victory',
        mode: 'other',
        playerCount: 99,
        cpuCount: 99,
        turn: 20000,
        winnerKind: 'cpu',
        winnerCpuDifficulty: 'expert',
        sessionId: ' session<>:id ',
        appVersion: 'v'.repeat(100),
        playerName: 'private-player',
        roomId: 'PRIVATE',
    }, 1700000000000);

    assert.strictEqual(normalized.ok, true);
    assert.deepStrictEqual(normalized.report, {
        event: 'victory',
        mode: 'local',
        playerCount: 10,
        cpuCount: 10,
        turn: 10000,
        winnerKind: 'cpu',
        winnerCpuDifficulty: 'expert',
        sessionId: 'session:id',
        appVersion: 'v'.repeat(80),
        timestamp: '2023-11-14T22:13:20.000Z',
    });
});

runTest('server lifecycle reporting はhuman勝者からCPU難易度を除き通知本文を固定する', () => {
    const normalized = reporting.normalizeGameLifecyclePayload({
        event: 'play-finish',
        mode: 'online',
        playerCount: 4,
        cpuCount: 3,
        turn: 14,
        winnerKind: 'human',
        winnerCpuDifficulty: 'strong',
        sessionId: 'abc123',
        appVersion: 'build1',
    }, 1700000000000);

    assert.strictEqual(normalized.ok, true);
    assert.strictEqual(normalized.report.winnerCpuDifficulty, '');
    assert.strictEqual(reporting.formatNtfyGameLifecycleMessage(normalized.report), [
        'event=play-finish',
        'mode=online',
        'players=4',
        'cpu=3',
        'winnerKind=human',
        'turn=14',
        'version=build1',
    ].join('\n'));
});
