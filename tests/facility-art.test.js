'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CARDS } = require('./helpers/runtime-loaders').loadGameRuntime();
const UiBuildMenu = require('../js/uiBuildMenu');
const { runTest } = require('./helpers/test-utils');
const sprite = fs.readFileSync(path.join(__dirname, '../icons/facility-art.svg'), 'utf8');
function render(card) {
    return UiBuildMenu.renderBuildCardButton({ card, stock: 6, canBuildThis: true, escapeHtml: value => String(value), getEffectText: () => '' });
}
runTest('全施設の図版参照は同梱されたSVG symbolへ解決する', () => {
    for (const card of CARDS) {
        const match = render(card).match(/facility-art\.svg#([a-z]+)/);
        assert.ok(match, card.name);
        assert.ok(sprite.includes(`id="${match[1]}"`), card.name);
    }
});
runTest('農園と工場の図版は商店へ誤分類されず、未知の名前も安全に分類する', () => {
    const corn = CARDS.find(card => card.name === 'コーン畑');
    assert.ok(render(corn).includes('facility-art.svg#field'));
    assert.ok(render({ ...corn, name: 'constructor' }).includes('facility-art.svg#field'));
    const cheese = CARDS.find(card => card.name === 'チーズ工場');
    assert.ok(render(cheese).includes('facility-art.svg#factory'));
});

runTest('街の施設数は建設と取消に追従し、無効なランドマークを数えない', () => {
    const wheat = CARDS.find(card => card.name === '麦畑');
    const player = { cards: [wheat], landmarks: { '駅': true, '港': true, '空港': false } };
    const enabled = new Set(['駅', '空港']);
    const original = UiBuildMenu.renderTownHtml(player, enabled);
    assert.ok(original.includes('施設 1枚 · ランドマーク 1個'));
    player.cards.push(wheat);
    const built = UiBuildMenu.renderTownHtml(player, enabled);
    assert.ok(built.includes('施設 2枚 · ランドマーク 1個'));
    assert.ok(built.includes('×2'));
    assert.strictEqual((built.match(/facility-art.svg#field/g) || []).length, 1);
    player.cards.pop();
    assert.strictEqual(UiBuildMenu.renderTownHtml(player, enabled), original);
});

runTest('街の省略表示でも施設総数を保持し、施設名をHTMLへ埋め込まない', () => {
    const cards = Array.from({ length: 10 }, (_, i) => ({ name: `<img src=x onerror=alert(${i})>`, category: '農園' }));
    const html = UiBuildMenu.renderTownHtml({ cards, landmarks: {} });
    assert.ok(html.includes('施設 10枚'));
    assert.ok(html.includes('ほか2種類'));
    assert.strictEqual((html.match(/facility-art.svg#field/g) || []).length, 8);
    assert.ok(!html.includes('onerror'));
});
