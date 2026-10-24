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

runTest('市場をnative dialogへ移した後も卓と市場の補助disclosureを排他に閉じる', () => {
    const previous = global.document;
    const filter = { open: true }, goals = { open: true }, guide = { open: true };
    const roots = {
        cardboardBoard: { querySelectorAll: () => [guide] },
        cardboardMarketDialog: { querySelectorAll: () => [filter, goals] },
    };
    global.document = { getElementById: id => roots[id] || null };
    try {
        CardBoardField.closeDisclosures(goals);
        assert.strictEqual(goals.open, true);
        assert.strictEqual(filter.open, false);
        assert.strictEqual(guide.open, false);
        CardBoardField.closeDisclosures();
        assert.strictEqual(goals.open, false);
    } finally {
        if (previous === undefined) delete global.document;
        else global.document = previous;
    }
});

runTest('収支の内訳を開いても祖先の出目パネルは閉じない', () => {
    const previous = global.document;
    const inner = { open: true };
    const outer = { open: true, contains: target => target === inner };
    const other = { open: true };
    global.document = { getElementById: id => id === 'cardboardBoard'
        ? { querySelectorAll: () => [outer, inner, other] } : null };
    try {
        CardBoardField.closeDisclosures(inner);
        assert.strictEqual(outer.open, true);
        assert.strictEqual(inner.open, true);
        assert.strictEqual(other.open, false);
        CardBoardField.closeDisclosures();
        assert.strictEqual(outer.open, false);
        assert.strictEqual(inner.open, false);
    } finally {
        if (previous === undefined) delete global.document;
        else global.document = previous;
    }
});
