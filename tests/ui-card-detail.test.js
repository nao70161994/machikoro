const assert = require('assert');
const UiCardDetail = require('../js/uiCardDetail');
const { runTest } = require('./helpers/test-utils');

runTest('UI card detailはeffect説明と既存fallback文言をpureに投影する', () => {
    const descriptions = { special: income => `special:${income}` };
    assert.strictEqual(UiCardDetail.cardEffectText({ effect: 'special', income: 3 }, descriptions), 'special:3');
    assert.strictEqual(UiCardDetail.cardEffectText({ effect: 'plain', color: 'red', income: 2 }, descriptions), '相手から2コイン奪う');
    assert.strictEqual(UiCardDetail.cardEffectText({ effect: 'plain', color: 'blue', income: 1 }, descriptions), '+1コイン');
});

runTest('UI card detailはランドマーク説明とemoji fallbackをpureに投影する', () => {
    const definitions = [
        { name: '駅', effect: '2個振れる', emoji: '🚉' },
        { name: '役所', effect: '補助', emoji: 'X' },
    ];
    const station = UiCardDetail.landmarkPresentation('駅', definitions, '役所');
    assert.deepStrictEqual(station, { effectText: '2個振れる', emoji: '🚉' });
    assert.strictEqual(Object.isFrozen(station), true);
    assert.deepStrictEqual(
        UiCardDetail.landmarkPresentation('役所', definitions, '役所'),
        { effectText: '補助', emoji: '🏛️' }
    );
    assert.deepStrictEqual(
        UiCardDetail.landmarkPresentation('未知', definitions, '役所'),
        { effectText: '', emoji: '🏛️' }
    );
    assert.deepStrictEqual(definitions, [
        { name: '駅', effect: '2個振れる', emoji: '🚉' },
        { name: '役所', effect: '補助', emoji: 'X' },
    ]);
});
