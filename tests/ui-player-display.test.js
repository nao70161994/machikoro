const assert = require('assert');
const UiPlayerDisplay = require('../js/uiPlayerDisplay');

assert.strictEqual(UiPlayerDisplay.difficultyLabel('weak'), '弱');
assert.strictEqual(UiPlayerDisplay.difficultyLabel('normal'), '普');
assert.strictEqual(UiPlayerDisplay.difficultyLabel('strong'), '強');
assert.strictEqual(UiPlayerDisplay.difficultyLabel('rl'), '深');
assert.strictEqual(UiPlayerDisplay.difficultyLabel('expert'), 'AI');
assert.strictEqual(UiPlayerDisplay.normalizeCpuDifficulty('expert'), 'expert');
assert.strictEqual(UiPlayerDisplay.normalizeCpuDifficulty('unknown'), 'normal');

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

console.log('ui player display tests passed');
