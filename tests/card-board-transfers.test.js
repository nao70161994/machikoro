'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const CardBoardTransfers = require('../js/cardBoardTransfers');
const UiTurnEvents = require('../js/uiTurnEvents');
const { loadGameRuntime } = require('./helpers/runtime-loaders');

const events = { participantNames: ['街A', '街B', '街C'], activations: [
    { from: 0, to: 1, amount: 2 }, { from: 0, to: 1, amount: 3 },
    { from: null, to: 0, amount: 4 }, { from: 1, to: 2, amount: 0 },
] };
function fixture() {
    let timer = null, cancelled = 0;
    const animated = [];
    const documentRef = { defaultView: { matchMedia: () => ({ matches: false }),
        setTimeout: callback => { timer = callback; return 1; }, clearTimeout: () => { timer = null; } },
        createElement: () => new Element() };
    class Element {
        constructor() { this.children = []; this.style = {}; this.attributes = {}; this.isConnected = true; this.ownerDocument = documentRef; }
        appendChild(child) { this.children.push(child); child.parentNode = this; }
        remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.isConnected = false; }
        setAttribute(name, value) { this.attributes[name] = value; }
        animate(frames, options) { animated.push({ frames, options }); return { cancel: () => { cancelled++; }, finished: Promise.resolve() }; }
        getBoundingClientRect() { return { left: 0, top: 0, width: 600, height: 400 }; }
        querySelector(selector) {
            if (selector.startsWith('#cardboardDiceReceipt')) return null;
            if (selector.includes('"2"')) return null;
            return { getBoundingClientRect: () => ({ left: selector.includes('"1"') ? 400 : 20, top: 20, width: 100, height: 40 }) };
        }
    }
    return { container: new Element(), animated, timer: () => timer, cancelled: () => cancelled };
}

runTest('確定した送金だけを送受信者ごとに集約し銀行と0額を正確に示す', () => {
    const before = JSON.stringify(events);
    assert.deepStrictEqual(CardBoardTransfers.project(events), [
        { from: 0, to: 1, amount: 5, text: '街A → 街B：5コイン' },
        { from: null, to: 0, amount: 4, text: '銀行 → 街A：4コイン' },
        { from: 1, to: 2, amount: 0, text: '街B → 街C：0コイン' },
    ]);
    assert.strictEqual(JSON.stringify(events), before);
    assert.deepStrictEqual(CardBoardTransfers.project({ participantNames: ['A'], activations: [
        { from: 0, to: 9, amount: 3 }, { from: 0, to: null, amount: -1 }, { from: 0, to: 0, amount: 1 },
    ] }), []);
});

runTest('表示中HUDへ向かう演出と文字summaryは同じ確定収支を使いclearで全解除する', () => {
    const { container, animated, timer, cancelled } = fixture();
    const controller = CardBoardTransfers.create();
    assert.strictEqual(controller.play({ container, events }), true);
    assert.strictEqual(animated.length, 2, '0円/非表示相手は移動しない');
    assert.ok(animated[0].frames.at(-1).transform.includes('380px'));
    assert.strictEqual(animated[0].options.delay, 0);
    assert.strictEqual(animated[1].options.delay, 100, '複数の送金先は解決順に少しずつ表示する');
    assert.ok(container.children[0].children[0].textContent.includes('席2→席3 0'));
    assert.ok(container.children[0].children[0].attributes['aria-label'].includes('街B → 街C：0コイン'));
    assert.strictEqual(typeof timer(), 'function');
    controller.clear();
    assert.strictEqual(container.children.length, 0);
    assert.strictEqual(cancelled(), 2);
    assert.strictEqual(timer(), null);
    controller.clear();
});

runTest('Reduced Motionでも誰から誰への金額を静止表示し未集計を断定しない', () => {
    const { container, animated } = fixture();
    const controller = CardBoardTransfers.create();
    controller.play({ container, events: { ...events, incomplete: true }, reducedMotion: true });
    assert.strictEqual(animated.length, 0);
    const text = container.children[0].children[0].textContent;
    assert.ok(text.includes('席1→席2 5'));
    assert.ok(container.children[0].children[0].attributes['aria-label'].includes('街A → 街B：5コイン'));
    assert.ok(text.includes('未集計の特殊効果'));
    controller.clear();
    assert.strictEqual(controller.play({ container, events: {} }), false);
});

runTest('実ルールの赤施設・残高不足を共通projectionから同じ送金方向と実額で表示する', () => {
    const { GameManager, createCardByName, LOG_TYPES } = loadGameRuntime();
    const game = new GameManager(3);
    game.currentPlayerIndex = 0;
    game.players.forEach((player, index) => {
        player.name = `街${index + 1}`;
        player.coins = index ? 0 : 1;
        player.cards = index ? [createCardByName('カフェ')] : [];
    });
    game.rollDice(3);
    const receipt = UiTurnEvents.project(game.log, { players: game.players, turnPlayerIndex: 0, logTypes: LOG_TYPES });
    const routes = CardBoardTransfers.project(receipt).filter(route => route.from === 0);
    assert.strictEqual(routes.length, 2);
    assert.ok(routes.every(route => route.from === 0 && route.to > 0));
    assert.strictEqual(routes.reduce((sum, route) => sum + route.amount, 0), 1);
    assert.ok(routes.some(route => route.amount === 0));
});

runTest('アプリ内の動きを減らす設定でもWAAPIの送金を止め文字で伝える', () => {
    const { container, animated } = fixture();
    container.ownerDocument.body = { classList: { contains: name => name === 'accessibility-reduced-motion' } };
    const controller = CardBoardTransfers.create();
    controller.play({ container, events, reducedMotion: false });
    assert.strictEqual(animated.length, 0);
    assert.ok(container.children[0].children[0].textContent.includes('席1→席2 5'));
    controller.clear();
});
