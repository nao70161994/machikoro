'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const { create } = require('../js/sharedMarketMount');

function fixture() {
    const documentRef = { activeElement: null, createComment: () => new Node(), getElementById: () => market };
    class Node {
        constructor() { this.children = []; this.parentNode = null; this.scrollTop = 0; this.scrollLeft = 0; }
        insertBefore(child, before) {
            child.remove();
            const index = before ? this.children.indexOf(before) : this.children.length;
            assert.ok(index >= 0);
            this.children.splice(index, 0, child);
            child.parentNode = this;
            if (child.contains(documentRef.activeElement)) documentRef.activeElement = null;
            child.scrollTop = 0;
            child.scrollLeft = 0;
        }
        remove() {
            if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
            this.parentNode = null;
        }
        contains(child) { return child === this || this.children.some(item => item.contains(child)); }
        focus(options) { assert.deepStrictEqual(options, { preventScroll: true }); documentRef.activeElement = this; }
    }
    const screen = new Node(), market = new Node(), footer = new Node(), plaza = new Node(), cardboard = new Node(), button = new Node();
    screen.insertBefore(market, null);
    screen.insertBefore(footer, null);
    market.insertBefore(button, null);
    return { coordinator: create(documentRef), documentRef, screen, market, footer, plaza, cardboard, button };
}

runTest('市場の所有者を移す前に旧ビューを片付け元位置と単一DOMを維持する', () => {
    const { coordinator, screen, market, footer, plaza, cardboard } = fixture();
    let cleaned = 0;
    const cleanup = () => { cleaned++; coordinator.release('plaza'); };
    coordinator.mount('plaza', plaza, cleanup);
    assert.deepStrictEqual(plaza.children, [market]);
    coordinator.mount('plaza', plaza, cleanup);
    assert.strictEqual(cleaned, 0);
    coordinator.mount('cardboard', cardboard, () => {});
    assert.strictEqual(cleaned, 1);
    assert.deepStrictEqual(plaza.children, []);
    assert.deepStrictEqual(cardboard.children, [market]);
    coordinator.release('plaza'); // A delayed old owner cannot steal the market.
    assert.strictEqual(market.parentNode, cardboard);
    coordinator.release('cardboard');
    assert.deepStrictEqual(screen.children, [market, footer]);
    assert.deepStrictEqual(cardboard.children, []);
});

runTest('高速往復でも同じ市場・子ボタン・フォーカスとスクロールを維持する', () => {
    const { coordinator, documentRef, screen, market, footer, plaza, cardboard, button } = fixture();
    market.scrollTop = 127;
    market.scrollLeft = 9;
    documentRef.activeElement = button;
    for (let count = 0; count < 30; count++) {
        coordinator.mount('plaza', plaza, () => coordinator.release('plaza'));
        coordinator.mount('cardboard', cardboard, () => coordinator.release('cardboard'));
    }
    coordinator.release('cardboard');
    assert.deepStrictEqual(screen.children, [market, footer]);
    assert.deepStrictEqual(market.children, [button]);
    assert.strictEqual(documentRef.activeElement, button);
    assert.strictEqual(market.scrollTop, 127);
    assert.strictEqual(market.scrollLeft, 9);
});
