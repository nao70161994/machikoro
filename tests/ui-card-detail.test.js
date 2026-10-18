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

    const cardboard = UiCardDetail.buildCardDetailContent({ ...options, showFacilityArt: true });
    assert.ok(cardboard.html.includes('card-detail-art card-color-blue'));
    assert.ok(cardboard.html.includes('💰'));
    assert.ok(cardboard.html.includes('🎲'));

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
    const cardboard = UiCardDetail.buildLandmarkDetailContent({ ...options, showFacilityArt: true });
    assert.ok(cardboard.html.includes('card-detail-art card-color-landmark'));
    assert.ok(cardboard.html.includes('💰'));
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

runTest('卓の短い効果は共通説明から条件・倍率・負担を保持して正本を変えない', () => {
    const { loadGameRuntime } = require('./helpers/runtime-loaders');
    const runtime = loadGameRuntime();
    const before = JSON.stringify(runtime.CARDS);
    const examples = {
        '麦畑': '+1コイン',
        'チーズ工場': '牧場×+3コイン',
        '高級フレンチ': '相手ランドマーク2軒〜：5徴収',
        '会員制BAR': '相手ランドマーク3軒〜：全額',
        '貸金業': '建設時+5／出目5・6で−2',
        'ワイナリー': 'ブドウ園×6・自身休業',
        'マグロ漁船': '港あり：ダイス2個分',
        '清掃業': '1種休業→銀行から休業数',
        '出版社': '相手の飲食店・商店×1徴収',
        'ドリンク工場': '全員のカップ施設×+1(銀行)',
    };
    for (const card of runtime.CARDS) {
        const full = UiCardDetail.cardEffectText(card, runtime.CARD_EFFECT_DESCRIPTIONS);
        const short = UiCardDetail.cardEffectText(card, runtime.CARD_EFFECT_DESCRIPTIONS, true);
        assert.ok(full && short, card.name);
        assert.ok(short.length <= 16, `短い卓表示: ${card.name}: ${short}`);
        // A map index or arbitrary truthy value must not opt into short labels.
        assert.strictEqual(UiCardDetail.cardEffectText(card, runtime.CARD_EFFECT_DESCRIPTIONS, 1), full);
        if (examples[card.name]) assert.strictEqual(short, examples[card.name]);
    }
    assert.strictEqual(UiCardDetail.cardEffectText(runtime.createCardByName('貸金業'), runtime.CARD_EFFECT_DESCRIPTIONS),
        '建設時+5コイン・5か6が出たら-2コイン');
    assert.strictEqual(JSON.stringify(runtime.CARDS), before);
});
