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


runTest('integration: 購入後もrender step例外で操作不能にならない', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.BUILD;
    game.currentPlayer().coins = 5;
    rt.renderPending = function renderPendingCrash() { throw new Error('pending render boom'); };

    rt.onBuildCard('麦畑');
    rt.__test.elements.confirmOkBtn.onclick();

    assert.strictEqual(game.builtThisTurn, true);
    assert.strictEqual(game.phase, rt.GAME_PHASES.BUILD);
    assert.strictEqual(rt.__test.elements.confirmModal.style.display, 'none');
    assert.notStrictEqual(rt.__test.elements.gameScreen.inert, true);
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    assert.strictEqual(rt.__test.elements.btnSkip.textContent, '建設完了・ターン終了');
    assert.ok(rt.__test.elements.buildMenu.innerHTML.includes('施設一覧'));
    assert.notStrictEqual(rt.__test.elements.crashScreen.style.display, 'flex');
    const trace = JSON.parse(rt.localStorage.getItem('machikoroLastFlowTrace'));
    assert.strictEqual(trace.event, 'build-card-rendered');
    assert.strictEqual(Array.isArray(rt.window.__machikoroFlowTrace), true);
    const renderErrorTrace = rt.window.__machikoroFlowTrace.find(entry => entry.event === 'render-step-error');
    assert.ok(renderErrorTrace);
    assert.strictEqual(renderErrorTrace.details.step, 'renderPending');
    assert.strictEqual(renderErrorTrace.details.recoverable, true);
    assert.ok(renderErrorTrace.details.stack.includes('pending render boom'));

    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.ok(reportCall);
    const report = JSON.parse(reportCall.options.body);
    assert.strictEqual(report.source, 'render-step');
    assert.strictEqual(report.phase, rt.GAME_PHASES.BUILD);
    assert.ok(report.message.includes('render renderPending'));
    assert.ok(report.stack.includes('pending render boom'));
    assert.ok(report.stack.includes('FLOW_TRACE'));
    assert.ok(report.stack.includes('render-step-error'));
});


runTest('integration: 購入後watchdogは操作可能な通常待機をfreeze扱いしない', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.BUILD;
    game.currentPlayer().coins = 5;

    rt.onBuildCard('麦畑');
    rt.__test.elements.confirmOkBtn.onclick();
    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    const freezeReports = rt.__test.fetchCalls
        .filter(call => call.url === '/api/client-error')
        .map(call => JSON.parse(call.options.body))
        .filter(report => report.source === 'freeze-watchdog');
    assert.strictEqual(freezeReports.length, 0);
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
});

runTest('integration: 購入後操作不能ならwatchdogがsnapshot保存と通知を行う', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.BUILD;
    game.currentPlayer().coins = 5;

    rt.onBuildCard('麦畑');
    rt.__test.elements.confirmOkBtn.onclick();
    rt.__test.elements.btnSkip.disabled = true;

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    const freezeSnapshot = JSON.parse(rt.localStorage.getItem('machikoroFreezeSnapshot'));
    assert.strictEqual(freezeSnapshot.freezeKind, 'post-build-ui-blocked');
    assert.strictEqual(freezeSnapshot.snapshot.phase, rt.GAME_PHASES.BUILD);
    assert.strictEqual(freezeSnapshot.snapshot.builtThisTurn, true);
    assert.strictEqual(freezeSnapshot.snapshot.ui.btnSkip.disabled, true);

    const reportCall = rt.__test.fetchCalls.find(call => {
        if (call.url !== '/api/client-error') return false;
        const report = JSON.parse(call.options.body);
        return report.source === 'freeze-watchdog';
    });
    assert.ok(reportCall);
    const report = JSON.parse(reportCall.options.body);
    assert.ok(report.message.includes('post-build-ui-blocked'));
    assert.ok(report.stack.includes('FREEZE_SNAPSHOT'));
});

runTest('integration: ランドマーク購入後もskip操作へ進める', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.BUILD;
    game.currentPlayer().coins = 10;

    rt.onBuildLandmark('駅');
    rt.__test.elements.confirmOkBtn.onclick();

    assert.strictEqual(game.currentPlayer().landmarks['駅'], true);
    assert.strictEqual(game.builtThisTurn, true);
    assert.strictEqual(rt.__test.elements.confirmModal.style.display, 'none');
    assert.notStrictEqual(rt.__test.elements.gameScreen.inert, true);
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    assert.strictEqual(rt.__test.elements.btnSkip.textContent, '建設完了・ターン終了');
});

if (process.exitCode) {
    throw new Error('integrationテストで失敗が発生しました');
}
