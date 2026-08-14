'use strict';

const assert = require('assert');
const GameSetupPresets = require('../js/gameSetupPresets');
const { runTest } = require('./helpers/test-utils');

runTest('setup presetは人数・CPU・選択setを正規化して最大8件を保持する', () => {
    let presets = [];
    for (let index = 0; index < 10; index++) {
        presets = GameSetupPresets.upsert(presets, {
            name: `設定${index}`,
            selectedCount: 12,
            cpuSpeed: 9999,
            playerSettings: [{ type: 'cpu', difficulty: 'expert', name: 'CPU' }],
            enabledCards: ['麦畑', '麦畑'],
            enabledLandmarks: ['駅'],
        }, index + 1);
    }
    assert.strictEqual(presets.length, 8);
    assert.strictEqual(presets[0].selectedCount, 10);
    assert.strictEqual(presets[0].cpuSpeed, 3000);
    assert.deepStrictEqual(presets[0].enabledCards, ['麦畑']);
    assert.strictEqual(GameSetupPresets.parse(JSON.stringify(presets)).length, 8);
});

runTest('setup presetは未知CPU難易度を通常へ戻し12文字の名前を保持する', () => {
    const preset = GameSetupPresets.normalizePreset({
        name: '互換設定',
        selectedCount: 2,
        playerSettings: [
            { type: 'cpu', difficulty: 'future-mode', name: 'ABCDEFGHIJKLZ' },
            { type: 'human', difficulty: 'expert', name: 'Bob' },
        ],
    });
    assert.strictEqual(preset.playerSettings[0].difficulty, 'normal');
    assert.strictEqual(preset.playerSettings[0].name, 'ABCDEFGHIJKL');
    assert.strictEqual(preset.playerSettings[1].difficulty, 'normal');
});

runTest('setup preset HTMLは名前をescapeし適用・削除identityを保持する', () => {
    const preset = GameSetupPresets.normalizePreset({
        id: 'preset-1', name: '<家族戦>', selectedCount: 3,
    });
    const html = GameSetupPresets.buildListHtml([preset]);
    assert.ok(html.includes('&lt;家族戦&gt;'));
    assert.ok(html.includes('data-ui-action="applySetupPreset"'));
    assert.ok(html.includes('data-preset-id="preset-1"'));
    assert.ok(!html.includes('<家族戦>'));
});
