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
    assert.ok(html.includes('青 · 工業'));
    assert.ok(html.includes('class="visually-hidden">工業。青：全員の手番に発動。詳しい効果を開く。'));
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
    assert.ok(html.includes('data-short-label="+3 · 2回"'));
    assert.ok(html.includes('data-short-label="休1 稼1"'));
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
    assert.strictEqual((html.match(/class="cardboard-color-count cardboard-color-count-blue"/g) || []).length, 10);
    assert.ok(html.includes('cardboard-color-count-blue">青 2</span>'));
    assert.ok(html.includes('cardboard-color-count-green">緑 0</span>'));
    assert.ok(html.includes('cardboard-color-count-red">赤 0</span>'));
    assert.ok(html.includes('cardboard-color-count-purple">紫 0</span>'));
});
runTest('2〜4人は全員、5〜10人は役割を優先し重複時も必ず3人を比較できる', () => {
    for (let count = 2; count <= 4; count++) {
        assert.deepStrictEqual(UiCardBoard.selectDetailIndices(count, { selfIndex: 1, currentIndex: 1, selectedIndex: 1 }),
            Array.from({ length: count }, (_, index) => index));
    }
    for (let count = 5; count <= 10; count++) {
        for (let self = 0; self < count; self++) {
            for (let current = 0; current < count; current++) {
                for (let selected = 0; selected < count; selected++) {
                    const roles = { selfIndex: self, currentIndex: current, selectedIndex: selected };
                    const indices = UiCardBoard.selectDetailIndices(count, roles);
                    assert.strictEqual(indices.length, 3);
                    assert.strictEqual(new Set(indices).size, 3);
                    assert.strictEqual(indices[0], self);
                    assert.ok(indices.includes(current));
                    assert.ok(indices.includes(selected));
                    assert.deepStrictEqual(UiCardBoard.selectDetailIndices(count, roles), indices);
                    if (self === current && self === selected) {
                        assert.deepStrictEqual(indices.slice(1), Array.from({ length: count }, (_, index) => index)
                            .filter(index => index !== self).slice(0, 2));
                    }
                }
            }
        }
    }
});
runTest('不正な席は詳細表示へ持ち込まず入力を変更しない', () => {
    const roles = { selfIndex: 9, currentIndex: -1, selectedIndex: '1' };
    assert.deepStrictEqual(UiCardBoard.selectDetailIndices(5, roles), [0, 1, 2]);
    assert.deepStrictEqual(roles, { selfIndex: 9, currentIndex: -1, selectedIndex: '1' });
    assert.deepStrictEqual(UiCardBoard.selectDetailIndices(0, roles), []);
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
