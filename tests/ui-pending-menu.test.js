const assert = require('assert');
const UiPendingMenu = require('../js/uiPendingMenu');
const { runTest } = require('./helpers/test-utils');

const escapeHtml = value => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function makePlayer(name, cardNames, options = {}) {
    return {
        name,
        coins: options.coins ?? 3,
        itVentureCoins: options.itVentureCoins ?? 2,
        landmarks: options.landmarks || { 役所: true, 駅: true, 空港: false },
        cards: cardNames.map(cardName => ({ name: cardName })),
        getMinorCards() { return this.cards; },
        isDormant(card) { return card.name === options.dormantCard; },
    };
}

function makeGame() {
    const players = [
        makePlayer('Alice', ['麦畑', 'パン屋'], { dormantCard: 'パン屋' }),
        makePlayer('<Bob>', ['牧場']),
    ];
    return {
        currentPlayerIndex: 0,
        pendingTV: 1,
        pendingBusiness: 1,
        pendingCleaning: 1,
        pendingMover: 1,
        pendingRenovation: 1,
        pendingIT: true,
        players,
        currentPlayer() { return players[this.currentPlayerIndex]; },
    };
}

runTest('ui pending menu はrenderer action/field契約を固定する', () => {
    assert.deepStrictEqual(UiPendingMenu.rendererSpecs(), [
        { field: 'pendingTV', action: 'resolveTV' },
        { field: 'pendingBusiness', action: 'resolveBusiness' },
        { field: 'pendingCleaning', action: 'resolveCleaning' },
        { field: 'pendingMover', action: 'resolveMover' },
        { field: 'pendingRenovation', action: 'resolveRenovation' },
        { field: 'pendingIT', action: 'resolveIT' },
    ]);
});

runTest('ui pending menu は先頭pendingだけを描画し表示値をescapeする', () => {
    const html = UiPendingMenu.buildMenuHtml(
        makeGame(),
        new Set(['resolveTV', 'resolveBusiness']),
        { field: 'pendingTV', action: 'resolveTV' },
        { escapeHtml, landmarkNames: { YAKUSHO: '役所' } }
    );

    assert.ok(html.includes('data-action="resolveTV"'));
    assert.ok(html.includes('&lt;Bob&gt;'));
    assert.ok(!html.includes('<Bob>'));
    assert.ok(!html.includes('data-action="resolveBusiness"'));
});

runTest('ui pending menu はbusiness/renovation/ITの既存selectorを維持する', () => {
    const game = makeGame();
    const html = UiPendingMenu.buildMenuHtml(
        game,
        new Set(['resolveBusiness', 'resolveRenovation', 'resolveIT']),
        null,
        { escapeHtml, landmarkNames: { YAKUSHO: '役所' } }
    );

    assert.ok(html.includes('data-action="selectBusinessCard"'));
    assert.ok(html.includes('data-action="resolveBusiness"'));
    assert.ok(html.includes('data-action="resolveRenovation"'));
    assert.ok(!html.includes('data-landmark-name="役所"'));
    assert.ok(html.includes('data-action="resolveIT"'));
    assert.ok(html.includes('パン屋 💤'));
});
