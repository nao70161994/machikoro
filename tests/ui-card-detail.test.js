const assert = require('assert');
const UiCardDetail = require('../js/uiCardDetail');
const { runTest } = require('./helpers/test-utils');

runTest('UI card detailはeffect説明と既存fallback文言をpureに投影する', () => {
    const descriptions = { special: income => `special:${income}` };
    assert.strictEqual(UiCardDetail.cardEffectText({ effect: 'special', income: 3 }, descriptions), 'special:3');
    assert.strictEqual(UiCardDetail.cardEffectText({ effect: 'plain', color: 'red', income: 2 }, descriptions), '相手から2コイン奪う');
    assert.strictEqual(UiCardDetail.cardEffectText({ effect: 'plain', color: 'blue', income: 1 }, descriptions), '+1コイン');
});

runTest('sunsetのカード詳細は共通施設アートを名称と効果より先に表示しclassicでは維持する', () => {
    const options = {
        card: { name: 'パン屋', color: 'blue', category: '商店', cost: 1, diceNums: [2, 3] },
        escapeHtml: value => value,
        getEffectText: () => '+1コイン',
        safeCardColorName: color => color,
        renderFacilityArt: (name, landmark, category) =>
            '<svg data-facility="' + name + '" data-landmark="' + landmark + '" data-category="' + category + '"></svg>',
    };
    const sunset = UiCardDetail.buildCardDetailContent({ ...options, useSunsetIcons: true });
    assert.ok(sunset.html.indexOf('card-detail-art card-color-blue') < sunset.html.indexOf('card-detail-section'));
    assert.ok(sunset.html.includes('data-facility="パン屋" data-landmark="false" data-category="商店"'));
    assert.ok(sunset.html.includes('card-detail-coin'));
    assert.ok(sunset.html.includes('card-detail-dice'));

    const classic = UiCardDetail.buildCardDetailContent(options);
    assert.ok(!classic.html.includes('card-detail-art'));
    assert.ok(classic.html.includes('💰'));
    assert.ok(classic.html.includes('🎲'));
});

runTest('sunsetのランドマーク詳細もカード一覧と同じアートを使いclassic絵文字を保つ', () => {
    const options = {
        name: '駅',
        emoji: '🚉',
        cost: 4,
        effectText: 'サイコロを2個振れます',
        escapeHtml: value => value,
        renderFacilityArt: (name, landmark) =>
            '<svg data-facility="' + name + '" data-landmark="' + landmark + '"></svg>',
    };
    const sunset = UiCardDetail.buildLandmarkDetailContent({ ...options, useSunsetIcons: true });
    assert.strictEqual(sunset.title, '駅');
    assert.ok(sunset.html.includes('card-detail-art card-color-landmark'));
    assert.ok(sunset.html.includes('data-facility="駅" data-landmark="true"'));
    const classic = UiCardDetail.buildLandmarkDetailContent(options);
    assert.strictEqual(classic.title, '🚉 駅');
    assert.ok(!classic.html.includes('card-detail-art'));
    assert.ok(classic.html.includes('💰'));
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
