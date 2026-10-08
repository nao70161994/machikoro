'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const UiBuildMenu = require('../js/uiBuildMenu');
const UiCompactMarket = require('../js/uiCompactMarket');
const escapeHtml = value => String(value).replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
function fixture(overrides = {}) {
    const cards = [
        { name: '<麦畑>', color: 'blue', category: '農園', diceNums: [1], cost: 1 },
        { name: 'パン屋', color: 'green', category: '飲食店', diceNums: [2, 3], cost: 2 },
        { name: 'テレビ局', color: 'purple', category: '大施設', diceNums: [6], cost: 7 },
        { name: 'カフェ', color: 'red', category: '飲食店', diceNums: [3], cost: 2 },
    ];
    return { cards, enabledCards: new Set(cards.map(card => card.name)), shopStock: { '<麦畑>': 2, 'パン屋': 3, 'テレビ局': 4, 'カフェ': 0 },
        current: { coins: 3, countCardIncludingDormant: () => 0 },
        canBuildCardAction: true, canBuildLandmarkAction: true, cardFilter: '',
        compareCardsForDisplay: (a, b) => a.diceNums[0] - b.diceNums[0],
        getShopStockCount: (stock, card) => stock[card.name] || 0,
        landmarks: { '駅': false, '電波塔': true, '港': false }, enabledLandmarks: new Set(['駅', '電波塔']),
        currentCoins: 3, landmarkCost: name => name === '駅' ? 4 : 22,
        escapeHtml, getEffectText: () => '+1 <コイン>', getLandmarkEffectText: () => 'ランドマークの効果',
        renderFacilityArt: name => `<svg aria-label="${escapeHtml(name)}"></svg>`, ...overrides };
}

runTest('小型市場は既存市場と同じ在庫・有効カード・並び・購入可否を使う', () => {
    for (const cardFilter of ['', 'blue', 'green', 'red', 'purple', 'affordable']) {
        for (const canBuildCardAction of [true, false]) {
            const options = fixture({ cardFilter, canBuildCardAction });
            const expected = [];
            UiBuildMenu.buildVisibleCardButtonsHtml({ ...options,
                renderBuildCardButton(card, stock, canBuildThis, highlighted) {
                    expected.push({ name: card.name, stock, canBuildThis, highlighted }); return '';
                } });
            const html = UiCompactMarket.buildFacilitiesHtml(options);
            assert.strictEqual((html.match(/data-action="buildCard"/g) || []).length, expected.length);
            let previousIndex = -1;
            for (const card of expected) {
                const index = html.indexOf(`data-action="buildCard" data-card-name="${escapeHtml(card.name)}"`);
                assert.ok(index > previousIndex);
                previousIndex = index;
                assert.strictEqual(html.slice(index).startsWith(`data-action="buildCard" data-card-name="${escapeHtml(card.name)}" disabled`), !card.canBuildThis);
                assert.ok(html.includes(`残り${card.stock}枚`));
            }
        }
    }
});

runTest('紫の所持・休業込み重複、コイン不足、action gateを共有する', () => {
    const options = fixture({ current: { coins: 30, countCardIncludingDormant: name => name === 'テレビ局' ? 1 : 0 } });
    const html = UiCompactMarket.buildFacilitiesHtml(options);
    assert.ok(html.includes('data-action="buildCard" data-card-name="テレビ局" disabled'));
    assert.ok(html.includes('data-action="showCardDetail" data-card-name="テレビ局"'));
    assert.ok(!html.includes('data-card-name="カフェ"'));
    assert.ok(html.includes('&lt;麦畑&gt;'));
    assert.ok(html.includes('+1 &lt;コイン&gt;'));
});

runTest('ランドマークの建設と詳細を同じ定義・設定・価格で分離する', () => {
    const options = fixture({ currentCoins: 4 });
    const html = UiCompactMarket.buildLandmarksHtml(options);
    assert.ok(html.includes('data-action="buildLandmark" data-landmark-name="駅" aria-label'));
    assert.ok(html.includes('data-action="buildLandmark" data-landmark-name="電波塔" disabled'));
    assert.ok(html.includes('建設済'));
    assert.ok(html.includes('data-action="showLandmarkDetail" data-landmark-name="電波塔"'));
    assert.ok(!html.includes('data-landmark-name="港"'));
    assert.ok(UiCompactMarket.buildLandmarksHtml({ ...options, canBuildLandmarkAction: false })
        .includes('data-action="buildLandmark" data-landmark-name="駅" disabled'));
});

runTest('小型市場は状態を変更せず既存filter・Undo・補充状態を表示する', () => {
    const options = fixture({ highlightedCardNames: ['パン屋'], undoBtn: '<button data-action="undoBuild">取消</button>', marketStatusHtml: '<section>山札3枚</section>' });
    const before = JSON.stringify(options);
    const html = UiCompactMarket.buildHtml(options);
    assert.strictEqual(JSON.stringify(options), before);
    assert.ok(html.includes('data-action="setCardFilter"'));
    assert.ok(html.includes('data-action="undoBuild"'));
    assert.ok(html.includes('山札3枚'));
    assert.ok(html.includes('compact-market-refilled'));
    assert.ok(html.includes('残り3枚 · 補充'));
    assert.ok(html.includes('data-short-stock="残3"'));
    assert.ok(!html.includes('class="card-btn'));
    assert.ok(html.includes('<details class="compact-market-filter-disclosure"><summary>絞込：全て</summary>'));
    assert.ok(html.includes('<details class="compact-market-goal-disclosure"><summary>目標</summary>'));
});

runTest('市場の絞込disclosureは現在の正本filterを短いラベルで示す', () => {
    for (const [cardFilter, label] of [['', '全て'], ['blue', '青'], ['green', '緑'], ['red', '赤'], ['purple', '紫'], ['affordable', '建設可']]) {
        assert.ok(UiCompactMarket.buildHtml(fixture({ cardFilter })).includes(`<summary>絞込：${label}</summary>`));
    }
    assert.ok(!UiCompactMarket.buildHtml(fixture()).includes('compact-market-goal-disclosure" open'));
});
