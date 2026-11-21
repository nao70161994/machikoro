'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const { computePinwheelGeometry, marketScaleWithinHole } = require('../js/cardTableLayout');

runTest('風車配置は非対称な四席と中央市場を重なりなく正規化し入力を変更しない', () => {
    const fixture = {
        top: { width: 3032, height: 210 }, right: { width: 600, height: 680 },
        bottom: { width: 2024, height: 340 }, left: { width: 720, height: 512 },
        market: { width: 1016, height: 332 }, gap: 24, padding: 24,
    };
    const before = JSON.stringify(fixture);
    const result = computePinwheelGeometry(fixture);
    assert.strictEqual(JSON.stringify(fixture), before);
    const rects = Object.values(result.rects);
    for (const rect of rects) {
        assert.ok(rect.x >= 24 && rect.y >= 24);
        assert.ok(rect.x + rect.width <= result.width - 24);
        assert.ok(rect.y + rect.height <= result.height - 24);
    }
    for (let first = 0; first < rects.length; first++) {
        for (const second of rects.slice(first + 1)) {
            const rect = rects[first];
            const overlapX = Math.min(rect.x + rect.width, second.x + second.width) - Math.max(rect.x, second.x);
            const overlapY = Math.min(rect.y + rect.height, second.y + second.height) - Math.max(rect.y, second.y);
            assert.ok(overlapX <= 0 || overlapY <= 0);
        }
    }
    assert.ok(result.hole.width >= fixture.market.width);
    assert.ok(result.hole.height >= fixture.market.height);
    assert.ok(result.rects.top.y < result.rects.market.y);
    assert.ok(result.rects.right.x > result.rects.market.x);
    assert.ok(result.rects.bottom.y > result.rects.market.y);
    assert.ok(result.rects.left.x < result.rects.market.x);
});

runTest('風車配置は大きな市場と小さな席でも市場の中央穴を維持する', () => {
    const result = computePinwheelGeometry({
        top: { width: 176, height: 180 }, bottom: { width: 176, height: 180 },
        left: { width: 180, height: 176 }, right: { width: 180, height: 176 },
        market: { width: 1016, height: 600 },
    });
    assert.deepStrictEqual(result.hole, { width: 1016, height: 600 });
    assert.strictEqual(result.rects.market.width, 1016);
    assert.strictEqual(result.rects.market.height, 600);
});

runTest('市場の拡大は既存の中央空間内だけで行い余白不足では縮小しない', () => {
    const market = { width: 344, height: 380 };
    assert.strictEqual(marketScaleWithinHole(market, { width: 688, height: 760 }), 1.5);
    assert.strictEqual(marketScaleWithinHole(market, { width: 430, height: 760 }), 1.25);
    assert.strictEqual(marketScaleWithinHole(market, { width: 688, height: 418 }), 1.1);
    assert.strictEqual(marketScaleWithinHole(market, { width: 344, height: 760 }), 1);
    assert.strictEqual(marketScaleWithinHole(market, { width: 200, height: 380 }), 1);
    assert.strictEqual(marketScaleWithinHole({ width: 0, height: 380 }, market), 1);
    assert.strictEqual(marketScaleWithinHole(market, { width: NaN, height: 380 }), 1);
    assert.deepStrictEqual(market, { width: 344, height: 380 });
});

runTest('密集した対面横卓は134pxカードの18種類を一行で比較する候補を持つ', () => {
    const { endColumnCandidates } = require('../js/cardTableLayout');
    assert.deepStrictEqual(endColumnCandidates({ wide: true, denseFour: false, densePortraitOpponents: false,
        denseWideOpponents: true }), [4, 6, 8, 12, 18]);
    assert.deepStrictEqual(endColumnCandidates({ wide: true, denseFour: false, densePortraitOpponents: false,
        denseWideOpponents: false }), [4, 6, 8, 12]);
    assert.deepStrictEqual(endColumnCandidates({ wide: false, denseFour: false, densePortraitOpponents: true,
        denseWideOpponents: false }), [1, 2, 3, 4, 6, 8]);
    assert.deepStrictEqual(endColumnCandidates({ wide: false, denseFour: false, densePortraitOpponents: false,
        denseWideOpponents: false }), [1, 2, 3, 4]);
    const columns = 18;
    const ownerWidth = columns * 160 + (columns - 1) * 4 + 16;
    const footprintWidth = ownerWidth + 12 * 2;
    assert.strictEqual(Math.ceil(18 / columns), 1);
    assert.ok(824 / footprintWidth * 160 >= 44, '固定160px幅の施設を横方向44px以上へ収められる候補');
    // The optimizer must still measure native header/landmark/134px heights;
    // this width proof alone is not a browser-fit or candidate adoption claim.
});

runTest('四席ランドマークrailは施設のみの選択に固定せず有界な実列数を比較する', () => {
    const { railColumnCandidates } = require('../js/cardTableLayout');
    assert.deepStrictEqual(railColumnCandidates(6, [5, 5]), [5, 4]);
    assert.deepStrictEqual(railColumnCandidates(4, [5, 5]), [4, 5]);
    assert.deepStrictEqual(railColumnCandidates(8, [18, 17]), [8, 4, 6, 12, 18]);
    const counts = [5, 5];
    const before = JSON.stringify(counts);
    const candidates = railColumnCandidates(6, counts);
    assert.strictEqual(candidates.length, 2, '5施設は4列と5列だけを新しく実測する');
    assert.strictEqual(JSON.stringify(counts), before);
    assert.ok(candidates.every(columns => columns > 0 && columns <= 5));
});

runTest('密集対面横卓と四席卓の列間を詰め正面閲覧と序中盤では保つ', () => {
    const { ownerColumnGap } = require('../js/cardTableLayout');
    const options = { playerCount: 2, wide: true, reading: false, maximumCardCount: 18 };
    assert.strictEqual(ownerColumnGap(options), 4);
    assert.strictEqual(ownerColumnGap({ ...options, playerCount: 4 }), 4);
    assert.strictEqual(ownerColumnGap({ ...options, playerCount: 4, wide: false }), 6);
    assert.strictEqual(ownerColumnGap({ ...options, playerCount: 4, reading: true }), 8);
    assert.strictEqual(ownerColumnGap({ ...options, playerCount: 4, maximumCardCount: 12 }), 8);
    for (const change of [{ playerCount: 3 }, { playerCount: 5 }, { wide: false }, { reading: true }, { maximumCardCount: 12 }]) {
        assert.strictEqual(ownerColumnGap({ ...options, ...change }), 8);
    }
    assert.deepStrictEqual(options, { playerCount: 2, wide: true, reading: false, maximumCardCount: 18 });
});


runTest('四席の配置は再計測した倍率差が3%以内なら維持し大きな改善は許す', () => {
    const { retainLayoutScore } = require('../js/cardTableLayout');
    assert.strictEqual(retainLayoutScore(0.49, 0.50), true);
    assert.strictEqual(retainLayoutScore(0.485, 0.50), true);
    assert.strictEqual(retainLayoutScore(0.48, 0.50), false);
    assert.strictEqual(retainLayoutScore(0, 0.50), false);
    assert.strictEqual(retainLayoutScore(NaN, 0.50), false);
    assert.strictEqual(retainLayoutScore(0.5, Infinity), false);
});


runTest('横長四席の序中盤だけ市場の表示数を保つ1段候補を比較する', () => {
    const { marketColumnCandidates } = require('../js/cardTableLayout');
    const options = { wide: true, shallow: true, playerCount: 4, reading: false, maximumCardCount: 6, visibleMarketCards: 12 };
    assert.deepStrictEqual(marketColumnCandidates(options), [6, 4, 12]);
    assert.deepStrictEqual(marketColumnCandidates({ ...options, visibleMarketCards: 9 }), [6, 4, 9]);
    for (const change of [{ shallow: false }, { playerCount: 2 }, { playerCount: 3 }, { reading: true },
        { maximumCardCount: 7 }, { visibleMarketCards: 6 }]) {
        assert.deepStrictEqual(marketColumnCandidates({ ...options, ...change }), [6, 4]);
    }
    assert.deepStrictEqual(marketColumnCandidates({ ...options, wide: false }), [2, 3, 1]);
});
