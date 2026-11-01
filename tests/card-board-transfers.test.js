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
    let timer = null, timerDelay = null, cancelled = 0, appReducedMotion = false, observerCallback = null;
    const animated = [];
    const motion = { matches: false, addEventListener(type, callback) { this.callback = callback; },
        removeEventListener() { this.callback = null; } };
    const documentRef = { defaultView: { matchMedia: () => motion,
        MutationObserver: class {
            constructor(callback) { observerCallback = callback; }
            observe() {}
            disconnect() { observerCallback = null; }
        },
        setTimeout: (callback, delay) => { timer = callback; timerDelay = delay; return 1; }, clearTimeout: () => { timer = null; } },
        body: { classList: { contains: name => name === 'accessibility-reduced-motion' && appReducedMotion } },
        createElement: () => new Element() };
    class Element {
        constructor() { this.children = []; this.style = {}; this.dataset = {}; this.attributes = {}; this.isConnected = true; this.ownerDocument = documentRef; }
        appendChild(child) { this.children.push(child); child.parentNode = this; }
        remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.isConnected = false; }
        setAttribute(name, value) { this.attributes[name] = value; }
        animate(frames, options) { animated.push({ frames, options }); return { cancel: () => { cancelled++; }, finished: Promise.resolve() }; }
        getBoundingClientRect() { return { left: 0, top: 0, width: 600, height: 400 }; }
        querySelector(selector) {
            if (selector.includes('"2"')) return null;
            return { getBoundingClientRect: () => ({ left: selector.includes('"1"') ? 400 : 20, top: 20, width: 100, height: 40 }) };
        }
    }
    return { container: new Element(), animated, timer: () => timer, timerDelay: () => timerDelay, cancelled: () => cancelled,
        setAppReducedMotion(value) { appReducedMotion = value; },
        notifyPreferenceChanged() { observerCallback?.(); }, motion };
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

runTest('同じ送受信者間でも発動施設ごとに送金元を識別する', () => {
    assert.deepStrictEqual(CardBoardTransfers.project({
        participantNames: ['街A', '街B'],
        activations: [
            { from: 0, to: 1, amount: 2, subject: '麦畑', facility: true },
            { from: 0, to: 1, amount: 3, subject: 'パン屋', facility: true },
            { from: 0, to: 1, amount: 1, subject: '麦畑', facility: true },
        ],
    }), [
        { from: 0, to: 1, subject: '麦畑', amount: 3, text: '麦畑：街A → 街B：3コイン' },
        { from: 0, to: 1, subject: 'パン屋', amount: 3, text: 'パン屋：街A → 街B：3コイン' },
    ]);
});

runTest('移動中は金額を短く示し、詳細には施設と移動元・移動先を保持する', () => {
    const { container, animated } = fixture();
    const controller = CardBoardTransfers.create();
    controller.play({ container, delayMs: 500, events: { participantNames: ['街A', '街B'], activations: [
        { from: 0, to: 1, amount: 5, subject: 'パン屋', facility: true },
    ] } });
    const movingCoin = container.children[0].children[1];
    assert.strictEqual(movingCoin.textContent, '5コイン');
    assert.strictEqual(movingCoin.dataset.route, '街A → 街B');
    assert.strictEqual(animated[0].options.delay, 500, '出目確定が終わってから送金を示す');
    assert.strictEqual(movingCoin.title, 'パン屋：街A → 街B：5コイン');
    assert.strictEqual(movingCoin.attributes['aria-hidden'], 'true');
    controller.clear();
});

runTest('銀行と分配プールの受取・支払いをコイン移動色と大収益演出へ正しく対応させる', () => {
    const { container } = fixture();
    const controller = CardBoardTransfers.create();
    controller.play({ container, events: { participantNames: ['街A'], activations: [
        { from: 'pool', to: 0, amount: 5, subject: '共同基金' },
        { from: 0, to: 'pool', amount: 6, subject: '共同基金' },
    ] } });
    const [outgoing, incoming] = container.children[0].children.slice(1);
    assert.strictEqual(incoming.dataset.flow, 'incoming');
    assert.strictEqual(incoming.dataset.large, 'true');
    assert.strictEqual(outgoing.dataset.flow, 'outgoing');
    assert.strictEqual(outgoing.dataset.large, undefined);
    controller.clear();
});

runTest('表示中HUDへ向かう演出と文字summaryは同じ確定収支を使いclearで全解除する', () => {
    const { container, animated, timer, cancelled } = fixture();
    const controller = CardBoardTransfers.create();
    assert.strictEqual(controller.play({ container, events }), true);
    assert.strictEqual(animated.length, 2, '0円/非表示相手は移動しない');
    assert.deepStrictEqual(animated.map(item => item.options.delay), [0, 70], '複数の送金を短くずらして方向を追いやすくする');
    assert.ok(animated[0].frames.at(-1).transform.includes('380px'));
    const summary = container.children[0].children[0];
    assert.ok(!summary.textContent.includes('街B → 街C：0コイン'));
    assert.ok(summary.textContent.startsWith('5コイン · 街A → 街B\n4コイン · 銀行 → 街A'));
    assert.strictEqual(summary.attributes['aria-label'], '5コイン。街A → 街B。4コイン。銀行 → 街A');
    assert.strictEqual(typeof timer(), 'function');
    controller.clear();
    assert.strictEqual(container.children.length, 0);
    assert.strictEqual(cancelled(), 2);
    assert.strictEqual(timer(), null);
    controller.clear();
});

runTest('経路summaryを盤面外のイベント欄へ置いてもclearで両方を解除する', () => {
    const { container, animated } = fixture();
    const receipt = new (container.constructor)();
    const controller = CardBoardTransfers.create();
    controller.play({ container, summaryContainer: receipt, events });
    assert.strictEqual(receipt.children.length, 1);
    assert.ok(receipt.children[0].textContent.includes('5コイン · 街A → 街B'));
    assert.ok(container.children[0].children.every(child => child.className !== 'cardboard-transfer-summary'));
    assert.strictEqual(animated.length, 2);
    controller.clear();
    assert.strictEqual(receipt.children.length, 0);
    assert.strictEqual(container.children.length, 0);
});

runTest('演出しない送金は後続アニメーションの開始を遅らせない', () => {
    const { container, animated } = fixture();
    const controller = CardBoardTransfers.create();
    controller.play({ container, events: { participantNames: ['街A', '街B', '街C'], activations: [
        { from: 1, to: 2, amount: 0 }, { from: 0, to: 1, amount: 5 },
    ] } });
    assert.strictEqual(animated.length, 1);
    assert.strictEqual(animated[0].options.delay, 0);
    controller.clear();
});

runTest('詳細盤面に出ていない相手へもロスター端から送金を示す', () => {
    const { animated } = fixture();
    const container = {
        isConnected: true,
        ownerDocument: { defaultView: { matchMedia: () => ({ matches: false }), setTimeout: () => 1, clearTimeout() {} },
            body: { classList: { contains: () => false } }, createElement: () => new TransferElement() },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }),
        appendChild(child) { child.parentNode = this; this.layer = child; },
        querySelector(selector) {
            if (selector === '[data-player-index="0"] .cardboard-header') {
                return { getBoundingClientRect: () => ({ left: 20, top: 20, width: 100, height: 40 }) };
            }
            if (selector === '.cardboard-roster-seat[data-cardboard-player-index="1"]') {
                return { getBoundingClientRect: () => ({ left: 820, top: -58, width: 160, height: 44 }) };
            }
            return null;
        },
    };
    function TransferElement() {
        this.style = {};
        this.dataset = {};
        this.children = [];
        this.isConnected = true;
        this.appendChild = child => this.children.push(child);
        this.setAttribute = () => {};
        this.remove = () => {};
        this.animate = (frames, options) => { animated.push({ frames, options }); return { cancel() {}, finished: Promise.resolve() }; };
    }
    const controller = CardBoardTransfers.create();
    controller.play({ container, events: { participantNames: ['自分', '相手'], activations: [{ from: 0, to: 1, amount: 5 }] } });
    assert.strictEqual(animated.length, 1);
    assert.ok(animated[0].frames.at(-1).transform.includes('522px'));
    assert.ok(animated[0].frames.at(-1).transform.includes('-32px'));
    controller.clear();
});

for (const scenario of [
    { name: 'パンで画面外へ移動した見出しの代わりに表示中のHUDへ送金する',
        header: { left: 20, top: 600, width: 100, height: 40 },
        roster: { left: 100, top: 8, width: 100, height: 44 },
        flights: 1, targetX: -150, targetY: -170 },
    { name: 'カード卓内の見出しが見えている間はその施設所有者へ送金する',
        header: { left: 20, top: 120, width: 100, height: 40 },
        roster: { left: 100, top: 8, width: 100, height: 44 },
        flights: 1, targetX: -230, targetY: -60 },
    { name: 'カード卓の見出しもHUDも画面外なら誤った端への飛行を表示しない',
        header: { left: 20, top: 600, width: 100, height: 40 },
        roster: { left: 900, top: 8, width: 100, height: 44 },
        flights: 0 },
]) {
    runTest(scenario.name, () => {
        const { container, animated } = fixture();
        container.querySelector = selector => {
            const rect = selector === '#cardboardTableViewport'
                ? { left: 0, top: 100, width: 600, height: 300 }
                : selector === '[data-player-index="0"] .cardboard-header' ? scenario.header
                    : selector === '.cardboard-roster-seat[data-cardboard-player-index="0"]' ? scenario.roster : null;
            return rect ? { getBoundingClientRect: () => rect } : null;
        };
        const controller = CardBoardTransfers.create();
        controller.play({ container, events: { participantNames: ['街A'], activations: [
            { from: null, to: 0, amount: 4 },
        ] } });
        assert.strictEqual(animated.length, scenario.flights);
        if (scenario.flights) {
            const arrival = animated[0].frames.at(-1).transform;
            assert.ok(arrival.includes(`${scenario.targetX}px`), arrival);
            assert.ok(arrival.includes(`${scenario.targetY}px`), arrival);
        }
        assert.ok(container.children[0].children[0].textContent.includes('4コイン · 銀行 → 街A'));
        controller.clear();
    });
}

runTest('Reduced Motionでも誰から誰への金額を静止表示し未集計を断定しない', () => {
    const { container, animated } = fixture();
    const controller = CardBoardTransfers.create();
    controller.play({ container, events: { ...events, incomplete: true }, reducedMotion: true });
    assert.strictEqual(animated.length, 0);
    const text = container.children[0].children[0].textContent;
    assert.ok(text.includes('5コイン · 街A → 街B'));
    assert.ok(text.includes('未集計の記録は発動・支払いの内訳で確認'));
    controller.clear();
    assert.strictEqual(controller.play({ container, events: {} }), false);
});

runTest('参加者名が欠けた復元イベントは席番号で送金先を識別する', () => {
    assert.deepStrictEqual(CardBoardTransfers.project({ activations: [{ from: 0, to: 1, amount: 2 }] }), [
        { from: 0, to: 1, amount: 2, text: '席1 → 席2：2コイン' },
    ]);
});

runTest('破損または途中復元された発動レコードを安全に無視する', () => {
    assert.deepStrictEqual(CardBoardTransfers.project({ activations: [null, 3, { from: 0, to: 1, amount: 2 }] }), [
        { from: 0, to: 1, amount: 2, text: '席1 → 席2：2コイン' },
    ]);
    assert.deepStrictEqual(CardBoardTransfers.project({ activations: { from: 0, to: 1, amount: 2 } }), []);
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
    assert.ok(container.children[0].children[0].textContent.includes('5コイン · 街A → 街B'));
    controller.clear();
});

runTest('コイン移動中に動きを減らす設定へ切り替えると飛行を止め、収支summaryを残す', () => {
    const { container, animated, cancelled, setAppReducedMotion, notifyPreferenceChanged } = fixture();
    const receipt = new (container.constructor)();
    const controller = CardBoardTransfers.create();
    controller.play({ container, summaryContainer: receipt, events });
    assert.strictEqual(animated.length, 2);

    setAppReducedMotion(true);
    notifyPreferenceChanged();
    assert.strictEqual(cancelled(), 2);
    assert.strictEqual(container.children.length, 0, '動きのレイヤーだけを片付ける');
    assert.ok(receipt.children[0].textContent.includes('5コイン · 街A → 街B'));
    controller.clear();
    assert.strictEqual(receipt.children.length, 0);
});

runTest('施設の初出順とowner fallbackを字幕と同じ700ms刻みで送金へ対応させる', () => {
    const { container, animated, timerDelay } = fixture();
    const ordered = { participantNames: ['街A', '街B'], activations: [
        { facility: true, subject: '麦畑', from: null, to: 0, amount: 1 },
        { facility: true, subject: '森林', owner: 0, from: null, to: 0, amount: 8 },
        { facility: true, subject: 'カフェ', owner: 1, from: 0, to: 1, amount: 2 },
        { facility: true, subject: 'パン屋', owner: 0, from: null, to: 0, amount: 3 },
    ] };
    const before = JSON.stringify(ordered);
    assert.deepStrictEqual(CardBoardTransfers.projectFacilityTimeline(ordered), [
        { owner: 0, name: '麦畑', net: 1, step: 0 },
        { owner: 0, name: '森林', net: 8, step: 1 },
        { owner: 1, name: 'カフェ', net: 2, step: 2 },
        { owner: 0, name: 'パン屋', net: 3, step: 3 },
    ]);
    const controller = CardBoardTransfers.create();
    controller.play({ container, events: ordered, delayMs: 500 });
    assert.deepStrictEqual(animated.map(item => item.options.delay), [500, 1200, 1900, 2600]);
    assert.ok(animated.every(item => item.options.duration === 600));
    assert.ok(animated.every(item => item.options.easing === 'linear'), 'fade区間を全体easeで前倒ししない');
    assert.deepStrictEqual(animated[0].frames.slice(1, 3).map(frame => [frame.offset, frame.opacity]), [[0.15, 1], [0.85, 1]]);
    assert.strictEqual(animated[0].frames[1].easing, 'ease-in-out', '移動区間の加減速は維持する');
    const flights = container.children[0].children.filter(child => child.className === 'cardboard-transfer');
    assert.deepStrictEqual(flights.map(coin => [coin.dataset.facility, coin.dataset.owner, coin.dataset.step]), [
        ['麦畑', '0', '0'], ['森林', '0', '1'], ['カフェ', '1', '2'], ['パン屋', '0', '3'],
    ]);
    assert.strictEqual(timerDelay(), 3300);
    assert.strictEqual(JSON.stringify(ordered), before);
    controller.clear();
});

runTest('同じ施設からの複数経路は同じ紹介ステップ内に収め0円施設も順番へ残す', () => {
    const { container, animated } = fixture();
    const controller = CardBoardTransfers.create();
    controller.play({ container, delayMs: 500, events: { participantNames: ['街A', '街B'], activations: [
        { facility: true, subject: '麦畑', owner: 0, from: null, to: 0, amount: 0 },
        { facility: true, subject: '共同施設', owner: 1, from: null, to: 1, amount: 3 },
        { facility: true, subject: '共同施設', owner: 1, from: 0, to: 1, amount: 2 },
    ] } });
    assert.deepStrictEqual(animated.map(item => item.options.delay), [1200, 1220]);
    assert.ok(animated.every(item => item.options.delay + item.options.duration < 1900));
    assert.strictEqual(container.children[0].children.filter(child => child.className === 'cardboard-transfer').length, 2);
    controller.clear();
});
