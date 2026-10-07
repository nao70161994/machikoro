'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const UiCardBoard = require('../js/uiCardBoard');
const { loadGameRuntime } = require('./helpers/runtime-loaders');
const { createCardByName } = loadGameRuntime();
const forest = createCardByName('森林');
const dormant = createCardByName('森林');
const player = { name: '<街の主>', coins: 9, cards: [forest, dormant], dormantCards: [dormant],
    landmarks: { '駅': true, '港': false, '役所': true } };
const options = { index: 1, selfIndex: 1, currentIndex: 0, enabledLandmarks: new Set(['駅', '港', '役所']),
    landmarkNames: ['駅', '港'], renderFacilityArt: (name, landmark) => `<svg data-test-art="${landmark ? 'landmark' : 'facility'}"></svg>` };

runTest('所有を種類で集約し出目・色分類・休業・正しい詳細actionを表示する', () => {
    const before = JSON.stringify(player);
    const html = UiCardBoard.buildPlayerHtml(player, options);
    assert.strictEqual((html.match(/data-card-name="森林"/g) || []).length, 1);
    assert.ok(html.includes('所有 ×2'));
    assert.ok(html.includes('休業 1枚 / 稼働 1枚'));
    assert.ok(html.includes('cardboard-card-blue'));
    assert.ok(html.includes('発動する出目 5'));
    assert.ok(html.includes('工業 · 青：全員の手番'));
    assert.ok(html.includes('data-action="showLandmarkDetail" data-landmark-name="駅"'));
    assert.ok(html.includes('建設済'));
    assert.ok(html.includes('未建設'));
    assert.ok(!html.includes('data-landmark-name="役所"'));
    assert.ok(html.includes('目標 1/2'));
    assert.ok(html.includes('&lt;街の主&gt;'));
    assert.strictEqual(JSON.stringify(player), before);
});
runTest('全色・複数出目と全休業でも施設詳細を使える', () => {
    const cards = ['麦畑', 'パン屋', 'カフェ', 'スタジアム', 'マグロ漁船'].map(createCardByName);
    const html = UiCardBoard.buildPlayerHtml({ ...player, cards, dormantCards: cards }, options);
    for (const color of ['blue', 'green', 'red', 'purple']) assert.ok(html.includes(`cardboard-card-${color}`));
    assert.ok(html.includes('cardboard-card-dormant'));
    assert.ok(html.includes('12・13・14'));
    assert.ok(!html.includes(' disabled'));
});
runTest('確認できた施設発動だけを一致した所有者へ示し0を推測しない', () => {
    const events = { activations: [
        { facility: true, subject: '森林', from: null, to: 1, amount: 3, count: 2 },
        { facility: true, subject: '森林', from: 1, to: 2, amount: 1, count: 1 },
        { facility: true, subject: '森林', from: null, to: 3, amount: 50, count: 1 },
        { facility: false, subject: '森林', from: null, to: 1, amount: 99, count: 1 },
        { facility: true, subject: '森林の別施設', from: null, to: 1, amount: 99, count: 1 },
    ] };
    const before = JSON.stringify(events);
    const html = UiCardBoard.buildPlayerHtml(player, { ...options, events });
    assert.ok(html.includes('data-cardboard-activation-net="3"'));
    assert.ok(html.includes('data-cardboard-activation-count="2"'));
    assert.ok(!UiCardBoard.buildPlayerHtml(player, options).includes('cardboard-activation'));
    const zero = UiCardBoard.buildPlayerHtml(player, { ...options, events: { activations: [
        { facility: true, subject: '森林', from: 1, to: null, amount: 0, count: 1 },
    ], incomplete: true } });
    assert.ok(zero.includes('確認済み：0コイン'));
    assert.ok(zero.includes('確認できた分のみ'));
    assert.strictEqual(JSON.stringify(events), before);
});
runTest('席・名前の同一性と選択/現在/自分を分離し10席に制限する', () => {
    const players = Array.from({ length: 12 }, () => ({ ...player }));
    const html = UiCardBoard.buildRosterHtml(players, { ...options, selectedIndex: 2 });
    assert.strictEqual((html.match(/class="cardboard-roster-seat/g) || []).length, 10);
    assert.strictEqual((html.match(/aria-pressed="true"/g) || []).length, 1);
    assert.strictEqual((html.match(/aria-current="true"/g) || []).length, 1);
    assert.ok(html.includes('席10・&lt;街の主&gt;'));
    assert.ok(!html.includes('席11'));
});
runTest('空状態と任意アダプタ不在でも安全なHTMLを返す', () => {
    const html = UiCardBoard.buildPlayerHtml({ name: '"<script>', coins: 0, cards: [], landmarks: {} });
    assert.ok(html.includes('所有施設なし'));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('対象ランドマークなし'));
});
runTest('contentOnlyは外枠だけを除外し同一の中身を返す', () => {
    const wrapped = UiCardBoard.buildPlayerHtml(player, options);
    const content = UiCardBoard.buildPlayerHtml(player, { ...options, contentOnly: true });
    assert.ok(content.startsWith('<header class="cardboard-header">'));
    assert.ok(!content.includes('<section'));
    assert.strictEqual(wrapped.slice(wrapped.indexOf('>') + 1, -'</section>'.length), content);
});
runTest('同じ赤施設を双方が持っていても支払側施設を誤発動させない', () => {
    const cafe = createCardByName('カフェ');
    const players = [0, 1].map(index => ({ name: `街${index + 1}`, cards: [cafe], coins: 3, landmarks: {} }));
    const events = { activations: [{ facility: true, subject: 'カフェ', from: 0, to: 1, amount: 1, count: 1 }] };
    assert.ok(!UiCardBoard.buildPlayerHtml(players[0], { ...options, index: 0, events }).includes('cardboard-card-activated'));
    const receiver = UiCardBoard.buildPlayerHtml(players[1], { ...options, index: 1, events });
    assert.ok(receiver.includes('cardboard-card-activated'));
    assert.ok(receiver.includes('確認済み：+1コイン'));
    const bankPayment = { activations: [{ facility: true, subject: 'カフェ', from: 0, to: null, amount: 2, count: 1 }] };
    assert.ok(UiCardBoard.buildPlayerHtml(players[0], { ...options, index: 0, events: bankPayment }).includes('確認済み：-2コイン'));
});
