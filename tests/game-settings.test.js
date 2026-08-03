const assert = require('assert');
const makeGameSettings = require('../server/gameSettings');
const { runTest } = require('./helpers/test-utils');

const settings = makeGameSettings({
    cardNames: ['麦畑', 'パン屋', 'カフェ'],
    allowedCpuDifficulties: new Set(['weak', 'normal', 'strong', 'expert', 'rl']),
    allowedRlModelIds: new Set(['approved-model']),
});

runTest('game settings はplayer設定を人数分へ正規化する', () => {
    assert.deepStrictEqual(settings.normalizePlayerSettings([
        { type: 'cpu', difficulty: 'strong' },
        { type: 'cpu', difficulty: 'invalid' },
        { type: 'cpu', difficulty: 'rl', rlModelId: 'approved-model' },
        { type: 'cpu', difficulty: 'rl', rlModelId: 'unknown-model' },
    ], 5), [
        { type: 'cpu', difficulty: 'strong' },
        { type: 'cpu', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl', rlModelId: 'approved-model' },
        { type: 'cpu', difficulty: 'rl' },
        { type: 'human', difficulty: 'normal' },
    ]);
});

runTest('game settings はonline RL model欠落と未知IDだけを拒否対象にする', () => {
    assert.strictEqual(settings.hasInvalidOnlineRlModelSettings([
        { type: 'cpu', difficulty: 'rl' },
    ]), true);
    assert.strictEqual(settings.hasInvalidOnlineRlModelSettings([
        { type: 'cpu', difficulty: 'rl', rlModelId: 'unknown-model' },
    ]), true);
    assert.strictEqual(settings.hasInvalidOnlineRlModelSettings([
        { type: 'cpu', difficulty: 'rl', rlModelId: 'approved-model' },
    ]), false);
    assert.strictEqual(settings.hasInvalidOnlineRlModelSettings(null), false);
});

runTest('game settings はCPU速度と有効カードの既存fallbackを維持する', () => {
    assert.strictEqual(settings.normalizeCpuSpeed('bad'), 1500);
    assert.strictEqual(settings.normalizeCpuSpeed(-1), 0);
    assert.strictEqual(settings.normalizeCpuSpeed(1234.9), 1234);
    assert.strictEqual(settings.normalizeCpuSpeed(99999), 5000);

    assert.deepStrictEqual(settings.normalizeEnabledCards(['パン屋', '不明', 'パン屋']), ['パン屋']);
    assert.deepStrictEqual(settings.normalizeEnabledCards([]), ['麦畑', 'パン屋', 'カフェ']);
    assert.deepStrictEqual(settings.normalizeEnabledCards(null), ['麦畑', 'パン屋', 'カフェ']);
});

runTest('game settingsはCPU難易度表示の既存日本語labelを正本化する', () => {
    assert.strictEqual(makeGameSettings.cpuDifficultyLabel('weak'), '弱');
    assert.strictEqual(settings.cpuDifficultyLabel('normal'), '普');
    assert.strictEqual(settings.cpuDifficultyLabel('strong'), '強');
    assert.strictEqual(settings.cpuDifficultyLabel('rl'), '学');
    assert.strictEqual(settings.cpuDifficultyLabel('expert'), '最強');
    assert.strictEqual(settings.cpuDifficultyLabel('unknown'), '最強');
});
