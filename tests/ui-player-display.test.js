const assert = require('assert');
const UiPlayerDisplay = require('../js/uiPlayerDisplay');

assert.strictEqual(UiPlayerDisplay.difficultyLabel('weak'), '弱');
assert.strictEqual(UiPlayerDisplay.difficultyLabel('normal'), '普');
assert.strictEqual(UiPlayerDisplay.difficultyLabel('strong'), '強');
assert.strictEqual(UiPlayerDisplay.difficultyLabel('rl'), '深');
assert.strictEqual(UiPlayerDisplay.difficultyLabel('expert'), '最強');
assert.strictEqual(UiPlayerDisplay.normalizeCpuDifficulty('expert'), 'expert');
assert.strictEqual(UiPlayerDisplay.normalizeCpuDifficulty('unknown'), 'normal');
assert.deepStrictEqual(UiPlayerDisplay.buildCoinAnimationView(3), {
    playSound: true,
    className: 'coin-float coin-gain',
    text: '+3🪙',
});
assert.deepStrictEqual(UiPlayerDisplay.buildCoinAnimationView(-2), {
    playSound: false,
    className: 'coin-float coin-lose',
    text: '-2🪙',
});
const zeroCoinView = UiPlayerDisplay.buildCoinAnimationView(0);
assert.deepStrictEqual(zeroCoinView, {
    playSound: false,
    className: 'coin-float coin-lose',
    text: '0🪙',
});
assert.strictEqual(Object.isFrozen(zeroCoinView), true);

assert.deepStrictEqual(UiPlayerDisplay.resolvePlayerSetting({
    playerSettings: [{ type: 'human', name: 'Alice' }],
    cpuPlayers: [null],
    index: 0,
    player: { name: 'Alice' },
}), {
    type: 'human',
    difficulty: 'human',
    name: 'Alice',
    missing: false,
});

assert.deepStrictEqual(UiPlayerDisplay.resolvePlayerSetting({
    playerSettings: [{ type: 'cpu', difficulty: 'strong', name: 'CPU1' }],
    cpuPlayers: [{ difficulty: 'rl' }],
    index: 0,
    player: { name: 'CPU1', isCPU: true },
}), {
    type: 'cpu',
    difficulty: 'rl',
    name: 'CPU1',
    missing: false,
});

const originalSettings = [
    { type: 'human', difficulty: 'normal', name: 'Alice' },
    { type: 'cpu', difficulty: 'strong', name: 'CPU1' },
];
const shuffledCpuPlayers = [{ difficulty: 'strong' }, null];
assert.deepStrictEqual(UiPlayerDisplay.resolvePlayerSetting({
    playerSettings: originalSettings,
    cpuPlayers: shuffledCpuPlayers,
    index: 0,
    player: { name: 'CPU1' },
}), {
    type: 'cpu',
    difficulty: 'strong',
    name: 'CPU1',
    missing: false,
});
assert.deepStrictEqual(UiPlayerDisplay.resolvePlayerSetting({
    playerSettings: originalSettings,
    cpuPlayers: shuffledCpuPlayers,
    index: 1,
    player: { name: 'Alice' },
}), {
    type: 'human',
    difficulty: 'human',
    name: 'Alice',
    missing: false,
});

assert.deepStrictEqual(UiPlayerDisplay.resolvePlayerSetting({
    playerSettings: [],
    cpuPlayers: [null, { difficulty: 'broken' }],
    index: 1,
    player: { name: 'CPU2', isCPU: true },
}), {
    type: 'cpu',
    difficulty: 'normal',
    name: 'CPU2',
    missing: true,
});

assert.deepStrictEqual(UiPlayerDisplay.resolvePlayerSetting({
    playerSettings: [],
    cpuPlayers: [],
    index: 2,
    player: null,
}), {
    type: 'human',
    difficulty: 'human',
    name: 'プレイヤー3',
    missing: true,
});

const players = [
    {
        name: '<Alice>',
        coins: 7,
        itVentureCoins: 2,
        landmarks: { 駅: true, 空港: false },
        cards: [
            { name: 'パン屋', color: 'green', effect: 'income' },
            { name: 'ローン会社', color: 'purple', effect: 'loan' },
            { name: 'パン屋', color: 'green', effect: 'income' },
        ],
        isDormant(card) {
            return card.name === 'パン屋';
        },
    },
    {
        name: 'CPU',
        coins: 1,
        itVentureCoins: 0,
        landmarks: { 駅: false },
        cards: [],
        isDormant() {
            return false;
        },
    },
];
const html = UiPlayerDisplay.buildPlayersHtml(players, {
    settings: [
        { type: 'human', difficulty: 'human' },
        { type: 'cpu', difficulty: 'strong' },
    ],
    currentPlayerIndex: 1,
    enabledLandmarks: new Set(['駅']),
    getLandmarkEmoji: name => name === '駅' ? '🚉' : '?',
    compareCardNames: (a, b) => a.localeCompare(b, 'ja'),
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    loanEffect: 'loan',
});
assert(html.includes('<span class="player-icon">👤</span>'));
assert(html.includes('<span class="player-name">&lt;Alice&gt;</span>'));
assert(html.includes('<span class="landmark-badge built" aria-label="駅、建設済み">🚉 駅</span>'));
assert(html.includes('<span class="landmark-badge " aria-label="駅、未建設">🚉 駅</span>'));
assert(!html.includes('空港'));
assert(html.includes('パン屋×2（休2）'));
assert(html.includes('<span class="it-badge">💻2</span>'));
assert(html.includes('<span class="loan-badge">💳×1</span>'));
assert(html.includes('<div class="player-box active">'));
assert(html.includes('<span class="player-icon">🤖強</span>'));
assert(html.includes('<span class="player-name">▶ CPU</span>'));

const escapedLandmark = UiPlayerDisplay.buildLandmarkBadgeHtml('<駅">', false, {
    getLandmarkEmoji: () => '<🚉>',
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
});
assert(escapedLandmark.includes('aria-label="&lt;駅&quot;&gt;、未建設"'));
assert(escapedLandmark.includes('&lt;🚉&gt; &lt;駅&quot;&gt;'));
assert(!escapedLandmark.includes('<駅'));

console.log('ui player display tests passed');
