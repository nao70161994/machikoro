const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const { loadIntegrationRuntime } = require('./helpers/integration-runtime');

runTest('integration: ローカル開始→勝利→統計タブ表示まで連携する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    const winner = game.players[0];
    for (const landmark of rt.enabledLandmarks) {
        winner.landmarks[landmark] = true;
    }
    game.turnCount = 9;

    rt.render();
    rt.switchTab('stats');

    const stats = JSON.parse(rt.localStorage.getItem('gameStats'));
    assert.strictEqual(rt.__test.elements.titleScreen.style.display, 'none');
    assert.strictEqual(rt.__test.elements.gameScreen.style.display, 'block');
    assert.ok(rt.__test.elements.status.innerHTML.includes('勝利'));
    assert.strictEqual(stats.local.totalGames, 2);
    assert.ok(rt.__test.elements.tabContentStats.innerHTML.includes('総ゲーム数'));
});

runTest('integration: セーブ→再開でゲーム状態を復元する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.currentPlayer().coins = 7;
    game.currentPlayer().addCard(rt.createCardByName('麦畑'));
    game.phase = rt.GAME_PHASES.BUILD;
    game.turnCount = 4;
    rt.saveGameState();
    rt.updateResumeButton();

    rt.__test.setGame(null);
    rt.resumeGame();

    const resumed = rt.__test.getGame();
    assert.ok(resumed);
    assert.strictEqual(resumed.currentPlayer().coins, 7);
    assert.strictEqual(resumed.currentPlayer().countCard('麦畑') >= 2, true);
    assert.strictEqual(resumed.phase, rt.GAME_PHASES.BUILD);
    assert.strictEqual(resumed.turnCount, 4);
    assert.strictEqual(rt.__test.elements.resumeSection.style.display, 'flex');
});

if (process.exitCode) {
    throw new Error('integrationテストで失敗が発生しました');
}
