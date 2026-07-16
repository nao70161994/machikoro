const assert = require('assert');
const { loadCPURuntime } = require('./helpers/runtime-loaders');
const { makeCpuDecisionFixtures } = require('./helpers/cpu-decision-fixtures');
const {
    captureCpuDecisionSnapshot,
    listLegalBuildActions,
    normalizeValue,
} = require('./helpers/cpu-decision-snapshot');
const { runTest } = require('./helpers/test-utils');

runTest('CPU decision fixtureは2〜10人と主要判断経路を代表する', () => {
    const runtime = loadCPURuntime();
    const fixtures = makeCpuDecisionFixtures(runtime);

    assert.deepStrictEqual(
        Array.from(new Set(fixtures.map(fixture => fixture.game.players.length))).sort((a, b) => a - b),
        [2, 3, 4, 5, 10]
    );
    assert.deepStrictEqual(
        Array.from(new Set(fixtures.map(fixture => fixture.decision))).sort(),
        ['build', 'diceCount', 'harbor', 'pending', 'reroll']
    );
    assert.strictEqual(new Set(fixtures.map(fixture => fixture.name)).size, fixtures.length);
});

runTest('CPU decision fixture builderは毎回独立した状態を返す', () => {
    const runtime = loadCPURuntime();
    const first = makeCpuDecisionFixtures(runtime);
    const second = makeCpuDecisionFixtures(runtime);

    first[0].game.currentPlayer().coins = 999;
    first[0].shopStock['麦畑'] = 0;
    assert.notStrictEqual(second[0].game.currentPlayer().coins, 999);
    assert.notStrictEqual(second[0].shopStock['麦畑'], 0);
});

runTest('legal build action contractは在庫・価格・紫重複・landmark状態を反映する', () => {
    const runtime = loadCPURuntime();
    const fixture = makeCpuDecisionFixtures(runtime)[0];
    const player = fixture.game.currentPlayer();
    player.coins = 20;
    player.cards.push(runtime.createCardByName('スタジアム'));
    player.landmarks[runtime.LANDMARK_NAMES.STATION] = true;
    fixture.shopStock['パン屋'] = 0;

    const actions = listLegalBuildActions(runtime, fixture.game, fixture.shopStock);
    assert.ok(actions.some(action => action.type === 'skip'));
    assert.ok(!actions.some(action => action.type === 'card' && action.cardName === 'パン屋'));
    assert.ok(!actions.some(action => action.type === 'card' && action.cardName === 'スタジアム'));
    assert.ok(!actions.some(action => action.type === 'landmark' && action.name === runtime.LANDMARK_NAMES.STATION));
});

runTest('CPU decision snapshotは同じfixture・seed・difficultyで完全一致する', () => {
    const firstRuntime = loadCPURuntime();
    const secondRuntime = loadCPURuntime();
    const firstFixtures = makeCpuDecisionFixtures(firstRuntime);
    const secondFixtures = makeCpuDecisionFixtures(secondRuntime);

    const first = firstFixtures.map(fixture =>
        captureCpuDecisionSnapshot(firstRuntime, fixture, 'expert', { expertPreset: 'v2simple' })
    );
    const second = secondFixtures.map(fixture =>
        captureCpuDecisionSnapshot(secondRuntime, fixture, 'expert', { expertPreset: 'v2simple' })
    );
    assert.deepStrictEqual(first, second);
    assert.ok(first.every(snapshot => snapshot.chosenAction != null));
});

runTest('CPU decision snapshot normalizerは非finite値とobject key順を固定する', () => {
    assert.deepStrictEqual(normalizeValue({ z: -0, b: Infinity, a: -Infinity, n: NaN }), {
        a: '-Infinity',
        b: 'Infinity',
        n: 'NaN',
        z: 0,
    });
});
