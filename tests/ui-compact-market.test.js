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
                cardFilter: cardFilter === 'affordable' && !canBuildCardAction ? '' : cardFilter,
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

runTest('市場の購入ボタン名に色・分類・出目・可否・在庫・効果を含める', () => {
    const html = UiCompactMarket.buildFacilitiesHtml(fixture());
    assert.ok(html.includes('aria-label="パン屋。緑、飲食店。出目2・3。2コインで建設可能。残り3枚。+1 &lt;コイン&gt;"'));
    assert.ok(html.includes('aria-label="テレビ局。紫、大施設。出目6。コイン不足、7コイン必要。残り4枚。+1 &lt;コイン&gt;"'));
    assert.ok(html.includes('compact-market-purple compact-market-unavailable'));
});

runTest('建設段階は今回の出目に反応する候補だけを強調し読み上げる', () => {
    const html = UiCompactMarket.buildFacilitiesHtml(fixture({
        activeDiceValue: 3,
        cards: fixture().cards.map(card => card.name === 'カフェ' ? { ...card, cost: 4 } : card),
        shopStock: { '<麦畑>': 2, 'パン屋': 3, 'テレビ局': 4, 'カフェ': 1 },
    }));
    assert.ok(html.includes('compact-market-item compact-market-green compact-market-roll-match'));
    assert.ok(html.includes('今回の出目3に一致'));
    assert.ok(html.includes('今建設しても、この出目では発動しません'));
    assert.ok(html.includes('compact-market-item compact-market-red compact-market-unavailable compact-market-roll-match'));
    assert.ok(!html.includes('compact-market-item compact-market-blue compact-market-roll-match'));
    assert.ok(!UiCompactMarket.buildFacilitiesHtml(fixture()).includes('compact-market-roll-match'));
});

runTest('紫の所持・休業込み重複、コイン不足、action gateを共有する', () => {
    const options = fixture({ current: { coins: 30, countCardIncludingDormant: name => name === 'テレビ局' ? 1 : 0 } });
    const html = UiCompactMarket.buildFacilitiesHtml(options);
    assert.ok(html.includes('data-action="buildCard" data-card-name="テレビ局" disabled'));
    assert.ok(html.includes('紫施設はすでに所有済みのため建設できません'));
    assert.ok(html.includes('data-action="showCardDetail" data-card-name="テレビ局"'));
    assert.ok(!html.includes('data-card-name="カフェ"'));
    assert.ok(html.includes('&lt;麦畑&gt;'));
    assert.ok(html.includes('+1 &lt;コイン&gt;'));
});

runTest('ランドマークの建設と詳細を同じ定義・設定・価格で分離する', () => {
    const options = fixture({ currentCoins: 4 });
    const html = UiCompactMarket.buildLandmarksHtml(options);
    assert.ok(html.includes('data-action="buildLandmark" data-landmark-name="駅" aria-label'));
    assert.ok(html.includes('aria-label="駅、4コインで建設可能。ランドマークの効果"'));
    assert.ok(html.includes('class="compact-market-art" aria-hidden="true"><svg aria-label="駅"></svg>'));
    assert.ok(html.includes('data-action="buildLandmark" data-landmark-name="電波塔" disabled'));
    assert.ok(html.includes('建設済'));
    assert.ok(html.includes('data-action="showLandmarkDetail" data-landmark-name="電波塔"'));
    assert.ok(!html.includes('data-landmark-name="港"'));
    const blocked = UiCompactMarket.buildLandmarksHtml({ ...options, canBuildLandmarkAction: false });
    assert.ok(blocked.includes('data-action="buildLandmark" data-landmark-name="駅" disabled'));
    assert.ok(blocked.includes('aria-label="駅、現在は建設できません。ランドマークの効果"'));
});

runTest('小型市場は状態を変更せず既存filter・Undo・補充状態を表示する', () => {
    const options = fixture({ highlightedCardNames: ['パン屋'], undoBtn: '<button data-action="undoBuild">取消</button>', marketStatusHtml: '<section>山札3枚</section>' });
    const before = JSON.stringify(options);
    const html = UiCompactMarket.buildHtml(options);
    assert.strictEqual(JSON.stringify(options), before);
    assert.ok(html.includes('data-action="setCardFilter"'));
    assert.ok(html.includes('data-action="undoBuild"'));
    assert.ok(html.includes('class="compact-market-expand" data-action="expandMarket" aria-controls="cardboardMarketDialog" aria-haspopup="dialog" aria-expanded="false" aria-label="中央市場を大きく表示"'));
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

runTest('建設できない間も建設可フィルタで市場一覧と無効な購入操作を保つ', () => {
    const html = UiCompactMarket.buildFacilitiesHtml(fixture({cardFilter: 'affordable', canBuildCardAction: false}));
    assert.strictEqual((html.match(/data-action="buildCard"/g) || []).length, 3);
    assert.strictEqual((html.match(/data-card-name="[^"]+" disabled/g) || []).length, 3);
    assert.ok(html.includes('今は全施設を表示'));
    assert.ok(!html.includes('現在建設できる施設はありません'));
});
