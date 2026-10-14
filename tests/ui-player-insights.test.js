'use strict';
const assert = require('assert');
const UiPlayerInsights = require('../js/uiPlayerInsights');
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const active = { name: '森林' }, dormant = { name: '森林' };
const player = { name: '街の主', coins: 9, cards: [active, dormant, { name: '<パン屋>' }],
    landmarks: { '駅': true, '港': false, '役所': true }, hasYakusho: true,
    isDormant(card) { return card === dormant; } };
const options = {
    landmarkNames: ['駅', '港'], enabledLandmarks: new Set(['駅', '港', '役所']),
    cardDefinitions: [
        { name: '森林', color: 'blue', category: '工業', diceNums: [5] },
        { name: '<パン屋>', color: 'green', category: '農業', diceNums: [3] },
    ],
    renderFacilityArt: name => `<svg data-art="${escapeHtml(name)}"></svg>`,
};
const original = JSON.stringify(player);
const view = UiPlayerInsights.snapshot(player, options);
assert.deepStrictEqual(view.cards, [
    { name: '<パン屋>', count: 1, dormant: 0, color: 'green', category: '農業', diceNums: [3] },
    { name: '森林', count: 2, dormant: 1, color: 'blue', category: '工業', diceNums: [5] },
]);
assert.deepStrictEqual(view.landmarks, [{ name: '駅', built: true }, { name: '港', built: false }]);
assert.ok(Object.isFrozen(view) && Object.isFrozen(view.cards) && Object.isFrozen(view.cards[0]));
assert.ok(Object.isFrozen(view.cards[0].diceNums));
assert.strictEqual(view.hasYakusho, true);
const html = UiPlayerInsights.buildHtml(player, escapeHtml, options);
assert.match(html, /plaza-insight-card-blue/);
assert.match(html, /森林、出目 5、所有 2枚、休業 1枚/);
assert.match(html, /plaza-insight-dice">出目 5/);
assert.match(html, /×2/);
assert.match(html, /data-art="森林"/);
assert.match(html, /data-action="showCardDetail" data-card-name="&lt;パン屋&gt;"/);
assert.match(html, /data-action="showLandmarkDetail" data-landmark-name="駅"/);
assert.match(html, /data-action="showLandmarkDetail" data-landmark-name="港"/);
assert.match(html, /建設済み/);
assert.match(html, /未建設/);
assert.match(html, /役所：あり/);
assert.doesNotMatch(html, /data-card-name="役所"/);
assert.strictEqual(JSON.stringify(player), original);
const other = { ...player, name: '街の主', cards: [], landmarks: {}, hasYakusho: false };
assert.match(UiPlayerInsights.buildHtml(other, escapeHtml, options), /施設なし/);
assert.match(UiPlayerInsights.buildHtml(other, escapeHtml, options), /役所：なし/);
assert.strictEqual(UiPlayerInsights.snapshot(player, { ...options, enabledLandmarks: new Set(['役所']) }).landmarks.length, 0);
console.log('ui player insights tests passed');
