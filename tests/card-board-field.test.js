'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const CardBoardField = require('../js/cardBoardField');
function box(top, left, children = {}) {
    return { scrollTop: top, scrollLeft: left, querySelector: selector => children[selector] || null };
}
runTest('テーマ離脱時の市場・席別カード・roster位置を新DOMへ一度だけ戻す', () => {
    const memory = CardBoardField.createScrollMemory();
    memory.capture('market', box(0, 0, { '.compact-market-facilities': box(120, 0) }));
    memory.capture('player:0', box(0, 0, { '.cardboard-cards': box(0, 96) }));
    memory.capture('player:1', box(0, 0, { '.cardboard-cards': box(48, 0) }));
    memory.capture('roster', box(0, 0, { '.cardboard-roster': box(0, 215) }));
    for (const [key, selector, top, left] of [
        ['market', '.compact-market-facilities', 120, 0],
        ['player:0', '.cardboard-cards', 0, 96],
        ['player:1', '.cardboard-cards', 48, 0],
        ['roster', '.cardboard-roster', 0, 215],
    ]) {
        const child = box(0, 0), element = box(0, 0, { [selector]: child });
        memory.restore(key, element);
        assert.strictEqual(child.scrollTop, top);
        assert.strictEqual(child.scrollLeft, left);
        child.scrollTop = 7; child.scrollLeft = 8;
        memory.restore(key, element);
        assert.strictEqual(child.scrollTop, 7, '復帰後の利用者scrollを古い記録で上書きしない');
        assert.strictEqual(child.scrollLeft, 8);
    }
});
runTest('新sessionでは前対局のscroll記録を破棄する', () => {
    const memory = CardBoardField.createScrollMemory();
    memory.capture('market', box(80, 90));
    memory.clear();
    const target = box(0, 0);
    memory.restore('market', target);
    assert.strictEqual(target.scrollTop, 0);
    assert.strictEqual(target.scrollLeft, 0);
    memory.capture('missing', null);
    memory.restore('missing', null);
});
