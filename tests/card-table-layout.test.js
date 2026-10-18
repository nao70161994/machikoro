'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const { computePinwheelGeometry } = require('../js/cardTableLayout');

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
