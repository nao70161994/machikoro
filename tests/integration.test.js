const assert = require('assert');
const { makeElement, runTest } = require('./helpers/test-utils');
const { loadIntegrationRuntime } = require('./helpers/integration-runtime');

function hideAllTestModals(rt) {
    ['confirmModal', 'pendingModal', 'rulesModal', 'cardSelectModal', 'cardDetailModal'].forEach(id => {
        const el = rt.__test.elements[id];
        if (el && el.style) el.style.display = 'none';
        if (el) el.hidden = false;
    });
    if (rt.window) rt.window.__machikoroConfirmModalOpen = false;
}

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
    assert.strictEqual(Array.isArray(rt.window.__machikoroFlowTrace), true);
    assert.ok(rt.window.__machikoroFlowTrace.some(entry => entry.event === 'build-card-rendered'));
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
    assert.ok(report.stack.includes('FREEZE_SUMMARY'));
    assert.ok(!report.stack.includes('FREEZE_SNAPSHOT'));
    const summary = JSON.parse(report.stack.replace(/^FREEZE_SUMMARY /, ''));
    assert.strictEqual(summary.gameScreen.inert, false);
    assert.strictEqual(summary.confirmModal.display, 'none');
    assert.deepStrictEqual(summary.expectedPrimaryActions, ['nextTurn']);
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    assert.strictEqual(rt.__test.elements.btnSkip.textContent, '建設完了・ターン終了');
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'freeze-watchdog-recovered'));
});


runTest('integration: 建設後にUI lockが残っても自分ターン操作を復旧する', () => {
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
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.confirmModal.style.display = 'flex';
    rt.__test.elements.btnSkip.disabled = true;

    rt.onBuildCard('麦畑');
    rt.__test.elements.confirmOkBtn.onclick();

    assert.strictEqual(game.builtThisTurn, true);
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.confirmModal.style.display, 'none');
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'scheduleCPU-human-turn-unlock'));
});

runTest('integration: CPUターン終了後に人間ターンのUI lockを解除する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    const cpuIndex = rt.__test.getCpuPlayers().findIndex(Boolean);
    assert.ok(cpuIndex >= 0);
    game.currentPlayerIndex = cpuIndex;
    game.phase = rt.GAME_PHASES.BUILD;
    game.builtThisTurn = true;
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.confirmModal.style.display = 'flex';
    rt.__test.elements.btnRoll.disabled = true;

    rt.scheduleCPU();
    rt.__test.flushTimeouts();

    assert.notStrictEqual(game.currentPlayerIndex, cpuIndex);
    assert.strictEqual(game.phase, rt.GAME_PHASES.ROLL);
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.confirmModal.style.display, 'none');
    assert.strictEqual(rt.__test.elements.btnRoll.disabled, false);
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'scheduleCPU-human-turn-unlock'));
});

runTest('integration: pending中の正当なmodal lockは人間ターンunlockで解除しない', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.PENDING;
    game.pendingTV = 1;
    rt.__test.elements.pendingModal.style.display = 'flex';
    rt.__test.elements.pendingMenu.innerHTML = '<button data-action="resolveTV">対象</button>';
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');

    rt.scheduleCPU();

    assert.strictEqual(rt.__test.elements.pendingModal.style.display, 'flex');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, true);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), 'true');
});

runTest('integration: 自分ターンで操作可能ボタンがなければwatchdogがUI lockを検知する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.ROLL;
    rt.render();
    rt.__test.elements.btnRoll.disabled = true;

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    const reportCall = rt.__test.fetchCalls.find(call => {
        if (call.url !== '/api/client-error') return false;
        const report = JSON.parse(call.options.body);
        return report.source === 'freeze-watchdog' && report.message.includes('human-turn-ui-locked');
    });
    assert.ok(reportCall);
    assert.strictEqual(rt.__test.elements.btnRoll.disabled, false);
    const snapshot = JSON.parse(rt.localStorage.getItem('machikoroFreezeSnapshot'));
    assert.ok(snapshot.snapshot.allowedActions.includes('rollDice'));
    assert.strictEqual(snapshot.freezeKind, 'human-turn-ui-locked');
});

runTest('integration: watchdogは重複通知を抑止しても同種UI lockを再復旧する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.ROLL;
    rt.render();
    rt.__test.elements.btnRoll.disabled = true;

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);
    assert.strictEqual(rt.__test.elements.btnRoll.disabled, false);
    const firstReports = rt.__test.fetchCalls.filter(call => call.url === '/api/client-error');
    assert.strictEqual(firstReports.length, 1);

    rt.__test.elements.btnRoll.disabled = true;
    rt.__test.advanceTime(1000);
    rt.__test.runIntervals(1);

    const reports = rt.__test.fetchCalls.filter(call => call.url === '/api/client-error');
    assert.strictEqual(reports.length, 1);
    assert.strictEqual(rt.__test.elements.btnRoll.disabled, false);
    assert.ok(rt.window.__machikoroClientCheckpoints.filter(entry => entry.event === 'freeze-watchdog-recovered').length >= 2);
});

runTest('integration: pending操作不能ならwatchdogが縮約通知してrender復旧する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.PENDING;
    game.pendingTV = 1;
    rt.render();
    assert.ok(rt.__test.elements.pendingMenu.innerHTML.includes('テレビ局'));
    rt.__test.elements.pendingModal.style.pointerEvents = 'none';
    rt.__test.elements.pendingMenu.style.pointerEvents = 'none';

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    const reportCall = rt.__test.fetchCalls.find(call => {
        if (call.url !== '/api/client-error') return false;
        const report = JSON.parse(call.options.body);
        return report.source === 'freeze-watchdog' && report.message.includes('pending-ui-locked');
    });
    assert.ok(reportCall);
    const report = JSON.parse(reportCall.options.body);
    assert.ok(report.stack.includes('FREEZE_SUMMARY'));
    assert.ok(!report.stack.includes('FREEZE_SNAPSHOT'));
    assert.ok(!report.stack.includes('Alice'));
    assert.strictEqual(rt.__test.elements.pendingModal.style.pointerEvents, 'auto');
    assert.strictEqual(rt.__test.elements.pendingMenu.style.pointerEvents, 'auto');
    assert.ok(rt.__test.elements.pendingMenu.innerHTML.includes('テレビ局'));
    const snapshot = JSON.parse(rt.localStorage.getItem('machikoroFreezeSnapshot'));
    assert.strictEqual(snapshot.freezeKind, 'pending-ui-locked');
});

runTest('integration: Business Center pending modal の pointer-events none をwatchdogが復旧する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.PENDING;
    game.pendingBusiness = 1;
    game.players[0].addCard(rt.createCardByName('パン屋'));
    game.players[1].addCard(rt.createCardByName('牧場'));
    rt.render();
    assert.ok(rt.__test.elements.pendingMenu.innerHTML.includes('ビジネスセンター'));
    assert.strictEqual(rt.__test.elements.pendingModal.style.pointerEvents, 'auto');

    rt.__test.elements.pendingModal.style.pointerEvents = 'none';
    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    const reportCall = rt.__test.fetchCalls.find(call => {
        if (call.url !== '/api/client-error') return false;
        const report = JSON.parse(call.options.body);
        return report.source === 'freeze-watchdog' && report.message.includes('pending-ui-locked');
    });
    assert.ok(reportCall);
    assert.strictEqual(rt.__test.elements.pendingModal.style.pointerEvents, 'auto');
    assert.strictEqual(rt.__test.elements.pendingMenu.style.pointerEvents, 'auto');
});

runTest('integration: buildMenu pointer-events none を共通UI invariantで検知して復旧する', () => {
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
    hideAllTestModals(rt);
    rt.render();
    assert.ok(rt.__test.elements.buildMenu.innerHTML.length > 0);
    rt.__test.elements.buildMenu.style.pointerEvents = 'none';

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    const freezeSnapshot = JSON.parse(rt.localStorage.getItem('machikoroFreezeSnapshot'));
    assert.strictEqual(freezeSnapshot.freezeKind, 'human-turn-ui-locked');
    assert.ok(freezeSnapshot.snapshot.allowedActions.includes('buildCard'));
    assert.ok(freezeSnapshot.snapshot.ui.buildMenu.pointerEvents === 'none');
    assert.strictEqual(rt.__test.elements.buildMenu.style.pointerEvents, '');
    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.ok(reportCall);
    const report = JSON.parse(reportCall.options.body);
    assert.ok(report.stack.includes('allowed-build-not-clickable'));
    assert.ok(report.stack.includes('pointer-events-none'));
});

runTest('integration: visible modal pointer-events none を共通UI invariantで検知して復旧する', () => {
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
    rt.render();
    rt.__test.elements.rulesModal.style.display = 'flex';
    rt.__test.elements.rulesModal.style.pointerEvents = 'none';

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    const freezeSnapshot = JSON.parse(rt.localStorage.getItem('machikoroFreezeSnapshot'));
    assert.ok(freezeSnapshot.freezeKind.startsWith('modal-ui-locked'));
    assert.strictEqual(rt.__test.elements.rulesModal.style.pointerEvents, 'auto');
    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.ok(reportCall);
    const report = JSON.parse(reportCall.options.body);
    assert.ok(report.message.includes('modal-ui-locked'));
    assert.ok(report.stack.includes('visible-modal-pointer-events-none'));
});

runTest('integration: stale confirmModal が post-build の親lockを残してもwatchdogが復旧する', () => {
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
    assert.strictEqual(game.builtThisTurn, true);
    rt.__test.setOnlineState({ isOnlineGame: false, myPlayerIndex: -1 });

    rt.__test.elements.confirmModal.style.display = 'flex';
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');
    rt.__test.elements.btnSkip.disabled = false;

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    const freezeSnapshot = JSON.parse(rt.localStorage.getItem('machikoroFreezeSnapshot'));
    assert.strictEqual(freezeSnapshot.freezeKind, 'post-build-ui-blocked');
    assert.ok(freezeSnapshot.snapshot.allowedActions.includes('nextTurn'));
    assert.ok(freezeSnapshot.snapshot.visibleModals.includes('confirmModal'));
    assert.strictEqual(freezeSnapshot.snapshot.myPlayerIndex, -1);
    assert.strictEqual(freezeSnapshot.snapshot.ui.btnSkip.disabled, false);
    assert.strictEqual(freezeSnapshot.snapshot.ui.btnSkip.ancestorBlocked, true);
    assert.strictEqual(rt.__test.elements.confirmModal.style.display, 'none');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.ok(reportCall);
    const report = JSON.parse(reportCall.options.body);
    const summary = JSON.parse(report.stack.replace(/^FREEZE_SUMMARY /, ''));
    assert.strictEqual(summary.confirmModal.display, 'flex');
    assert.strictEqual(summary.confirmModal.awaitingChoice, false);
    assert.strictEqual(summary.gameScreen.inert, true);
    assert.deepStrictEqual(summary.expectedPrimaryActions, ['nextTurn']);
});

runTest('integration: active modalなしでgameScreen.inertだけ残ったhuman-turn lockをwatchdogが復旧する', () => {
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
    game.builtThisTurn = false;
    hideAllTestModals(rt);
    rt.__test.setOnlineState({ isOnlineGame: false, myPlayerIndex: -1 });
    rt.render();
    hideAllTestModals(rt);
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');
    rt.__test.elements.btnSkip.disabled = false;

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    const freezeSnapshot = JSON.parse(rt.localStorage.getItem('machikoroFreezeSnapshot'));
    assert.strictEqual(freezeSnapshot.freezeKind, 'human-turn-ui-locked');
    assert.deepStrictEqual(freezeSnapshot.snapshot.visibleModals, []);
    assert.strictEqual(freezeSnapshot.snapshot.ui.confirmModal.display, 'none');
    assert.strictEqual(freezeSnapshot.snapshot.ui.gameScreen.inert, true);
    assert.strictEqual(freezeSnapshot.snapshot.ui.btnSkip.disabled, false);
    assert.strictEqual(freezeSnapshot.snapshot.ui.btnSkip.ancestorBlocked, true);
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.ok(reportCall);
    const report = JSON.parse(reportCall.options.body);
    const summary = JSON.parse(report.stack.replace(/^FREEZE_SUMMARY /, ''));
    assert.deepStrictEqual(summary.visibleModals, []);
    assert.strictEqual(summary.confirmModal.display, 'none');
    assert.strictEqual(summary.confirmModal.awaitingChoice, false);
    assert.strictEqual(summary.gameScreen.inert, true);
});

runTest('integration: selectDice中のgameScreen lockをwatchdogが復旧する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.SELECT_DICE;
    game.players[game.currentPlayerIndex].landmarks['駅'] = true;
    hideAllTestModals(rt);
    rt.render();
    assert.ok(rt.__test.elements.diceChoose.innerHTML.includes('selectDiceCount'));
    rt.__test.elements.gameScreen.style.display = 'none';
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    const freezeSnapshot = JSON.parse(rt.localStorage.getItem('machikoroFreezeSnapshot'));
    assert.strictEqual(freezeSnapshot.freezeKind, 'human-turn-ui-locked');
    assert.ok(freezeSnapshot.snapshot.allowedActions.includes('selectDice'));
    assert.strictEqual(freezeSnapshot.snapshot.ui.gameScreen.display, 'none');
    assert.strictEqual(freezeSnapshot.snapshot.actionButtons.buttons.diceChoose.ancestorBlocked, true);
    assert.strictEqual(rt.__test.elements.gameScreen.style.display, 'block');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), null);
});

runTest('integration: rerollConfirm中のdiceChoose display noneをwatchdogが復旧する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.REROLL_CONFIRM;
    game.lastDiceResult = 6;
    hideAllTestModals(rt);
    rt.render();
    assert.ok(rt.__test.elements.diceChoose.innerHTML.includes('rerollDice'));
    assert.strictEqual(rt.__test.elements.diceChoose.style.display, 'block');
    rt.__test.elements.diceChoose.style.display = 'none';

    const before = rt.collectUiLockSnapshot('reroll-before-recovery');
    const beforeIssue = rt.validateUiInteractability(before).find(item => item.action === 'rerollDice');
    assert.ok(beforeIssue);
    assert.strictEqual(beforeIssue.target, 'diceChoose');
    assert.strictEqual(beforeIssue.actionTarget, 'rerollDice');
    assert.strictEqual(beforeIssue.reason, 'parent-display-none');

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    const freezeSnapshot = JSON.parse(rt.localStorage.getItem('machikoroFreezeSnapshot'));
    assert.strictEqual(freezeSnapshot.freezeKind, 'human-turn-ui-locked');
    assert.ok(freezeSnapshot.snapshot.allowedActions.includes('rerollDice'));
    assert.ok(freezeSnapshot.snapshot.allowedActions.includes('skipReroll'));
    assert.strictEqual(freezeSnapshot.snapshot.actionButtons.buttons.diceChoose.display, 'none');
    assert.strictEqual(rt.__test.elements.diceChoose.style.display, 'block');
    assert.ok(rt.__test.elements.diceChoose.innerHTML.includes('skipReroll'));
});

runTest('integration: allowed action container は子ボタン全disabledをクリック不能として診断する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.SELECT_DICE;
    game.players[game.currentPlayerIndex].landmarks['駅'] = true;
    hideAllTestModals(rt);
    rt.render();
    const disabledChoice = makeElement({ disabled: true });
    disabledChoice.setAttribute('data-action', 'selectDiceCount');
    rt.__test.elements.diceChoose.querySelectorAll = () => [disabledChoice];

    const snapshot = rt.collectUiLockSnapshot('test-disabled-action-child');
    const issues = rt.validateUiInteractability(snapshot);

    assert.ok(snapshot.allowedActions.includes('selectDice'));
    const issue = issues.find(item => item.action === 'selectDice');
    assert.ok(issue);
    assert.strictEqual(issue.kind, 'allowed-primary-not-clickable');
    assert.strictEqual(issue.reason, 'child-not-clickable');
    assert.strictEqual(snapshot.actionButtons.buttons.diceChoose.totalInteractiveChildren, 1);
    assert.strictEqual(snapshot.actionButtons.buttons.diceChoose.usableInteractiveChildren, 0);
});

runTest('integration: gameScreen display none と inert が残ったpost-build lockをwatchdogが復旧する', () => {
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
    game.builtThisTurn = true;
    hideAllTestModals(rt);
    rt.__test.setOnlineState({ isOnlineGame: false, myPlayerIndex: -1 });
    rt.render();
    hideAllTestModals(rt);
    rt.__test.elements.gameScreen.style.display = 'none';
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');
    rt.__test.elements.btnSkip.disabled = false;

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    const freezeSnapshot = JSON.parse(rt.localStorage.getItem('machikoroFreezeSnapshot'));
    assert.strictEqual(freezeSnapshot.freezeKind, 'post-build-ui-blocked');
    assert.deepStrictEqual(freezeSnapshot.snapshot.visibleModals, []);
    assert.ok(freezeSnapshot.snapshot.allowedActions.includes('nextTurn'));
    assert.strictEqual(freezeSnapshot.snapshot.ui.gameScreen.display, 'none');
    assert.strictEqual(freezeSnapshot.snapshot.ui.gameScreen.inert, true);
    assert.strictEqual(freezeSnapshot.snapshot.ui.btnSkip.disabled, false);
    assert.strictEqual(freezeSnapshot.snapshot.ui.btnSkip.ancestorBlocked, true);
    assert.strictEqual(rt.__test.elements.gameScreen.style.display, 'block');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.ok(reportCall);
    const report = JSON.parse(reportCall.options.body);
    const summary = JSON.parse(report.stack.replace(/^FREEZE_SUMMARY /, ''));
    assert.strictEqual(summary.gameScreen.display, 'none');
    assert.strictEqual(summary.gameScreen.inert, true);
});

runTest('integration: title screenではorphan gameScreen displayを勝手に復旧しない', () => {
    const rt = loadIntegrationRuntime();
    hideAllTestModals(rt);
    rt.__test.elements.titleScreen.style.display = 'block';
    rt.__test.elements.gameScreen.style.display = 'none';
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    assert.strictEqual(rt.__test.elements.gameScreen.style.display, 'none');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, true);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), 'true');
    assert.strictEqual(rt.localStorage.getItem('machikoroFreezeSnapshot'), null);
});

runTest('integration: restart後の未開始title状態をwatchdogがUI lock扱いしない', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    rt.__test.elements.gameScreen.style.display = 'none';
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');
    rt.document.getElementById('confirmModal').style.display = 'flex';
    rt.document.body.classList.add('modal-open');
    rt.localStorage.setItem('machikoroFreezeSnapshot', 'old-freeze');

    rt.restartGame();
    assert.strictEqual(typeof rt.__test.elements.confirmOkBtn.onclick, 'function');
    rt.__test.elements.confirmOkBtn.onclick();
    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    assert.strictEqual(rt.__test.getGame(), null);
    assert.strictEqual(rt.__test.elements.titleScreen.style.display, 'block');
    assert.strictEqual(rt.__test.elements.gameScreen.style.display, 'none');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(rt.document.getElementById('confirmModal').style.display, 'none');
    assert.strictEqual(rt.document.body.classList.contains('modal-open'), false);
    assert.strictEqual(rt.localStorage.getItem('machikoroFreezeSnapshot'), null);
    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.strictEqual(reportCall, undefined);
});

runTest('integration: stale pendingModal が通常操作を塞いだらwatchdogが閉じて復旧する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.ROLL;
    rt.render();
    rt.__test.elements.pendingModal.style.display = 'flex';
    rt.__test.elements.pendingMenu.innerHTML = '';

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    const freezeSnapshot = JSON.parse(rt.localStorage.getItem('machikoroFreezeSnapshot'));
    assert.strictEqual(freezeSnapshot.freezeKind, 'stale-modal-ui-locked');
    assert.strictEqual(rt.__test.elements.pendingModal.style.display, 'none');
    assert.strictEqual(rt.__test.elements.btnRoll.disabled, false);
    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.ok(reportCall);
    const report = JSON.parse(reportCall.options.body);
    assert.ok(report.message.includes('stale-modal-ui-locked'));
});

runTest('integration: active modal表示中はgameScreen display復旧を走らせない', () => {
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
    game.builtThisTurn = true;
    hideAllTestModals(rt);
    rt.render();
    hideAllTestModals(rt);
    rt.__test.elements.cardDetailModal.style.display = 'flex';
    rt.__test.elements.gameScreen.style.display = 'none';
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');
    rt.__test.elements.btnSkip.disabled = false;

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    assert.strictEqual(rt.__test.elements.cardDetailModal.style.display, 'flex');
    assert.strictEqual(rt.__test.elements.gameScreen.style.display, 'none');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, true);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), 'true');
    assert.strictEqual(rt.localStorage.getItem('machikoroFreezeSnapshot'), null);
    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.strictEqual(reportCall, undefined);
});

runTest('integration: 正当な別modal表示中はorphan inert復旧を走らせない', () => {
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
    game.builtThisTurn = false;
    hideAllTestModals(rt);
    rt.render();
    hideAllTestModals(rt);
    rt.__test.elements.cardDetailModal.style.display = 'flex';
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');
    rt.__test.elements.btnSkip.disabled = false;

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    assert.strictEqual(rt.__test.elements.cardDetailModal.style.display, 'flex');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, true);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), 'true');
    assert.strictEqual(rt.localStorage.getItem('machikoroFreezeSnapshot'), null);
    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.strictEqual(reportCall, undefined);
});

runTest('integration: reconnect中のstale confirmModalはwatchdogが解除しない', () => {
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
    game.builtThisTurn = true;
    rt.render();
    rt.__test.setOnlineState({
        socket: { connected: false },
        isOnlineGame: true,
        isReconnectingOnline: true,
        onlineActionInFlight: false,
        myPlayerIndex: game.currentPlayerIndex,
    });
    rt.window.__machikoroConfirmModalOpen = false;
    rt.__test.elements.confirmModal.style.display = 'flex';
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');
    rt.__test.elements.btnSkip.disabled = false;

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    assert.strictEqual(rt.__test.elements.confirmModal.style.display, 'flex');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, true);
    assert.strictEqual(rt.localStorage.getItem('machikoroFreezeSnapshot'), null);
});

runTest('integration: 正当なconfirmModal表示中はwatchdogが閉じない', () => {
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
    assert.strictEqual(rt.__test.elements.confirmModal.style.display, 'flex');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, true);
    assert.strictEqual(rt.window.__machikoroConfirmModalOpen, true);

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    assert.strictEqual(rt.__test.elements.confirmModal.style.display, 'flex');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, true);
    assert.strictEqual(rt.localStorage.getItem('machikoroFreezeSnapshot'), null);
    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.strictEqual(reportCall, undefined);
});

runTest('integration: lifecycle通知はlocalStorage false時だけ送信しない', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.localStorage.setItem('machikoroLifecycleNotifyEnabled', 'false');
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'strong' },
    ]);

    const disabledState = rt.window.__machikoroLifecycleNotifyState();
    assert.strictEqual(disabledState.key, 'machikoroLifecycleNotifyEnabled');
    assert.strictEqual(disabledState.legacyKey, 'machikoroLifecycleNotificationsEnabled');
    assert.strictEqual(disabledState.value, 'false');
    assert.strictEqual(disabledState.enabled, false);
    assert.strictEqual(disabledState.defaultEnabled, false);
    rt.startGame();

    assert.strictEqual(rt.__test.fetchCalls.some(call => call.url === '/api/game-lifecycle'), false);
});

runTest('integration: lifecycle通知は開始と終了を短いpayloadで送る', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    const defaultState = rt.window.__machikoroLifecycleNotifyState();
    assert.strictEqual(defaultState.key, 'machikoroLifecycleNotifyEnabled');
    assert.strictEqual(defaultState.legacyKey, 'machikoroLifecycleNotificationsEnabled');
    assert.strictEqual(defaultState.value, null);
    assert.strictEqual(defaultState.enabled, true);
    assert.strictEqual(defaultState.defaultEnabled, true);
    rt.changeCount(2);
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal', name: 'Alice' },
        { type: 'cpu', difficulty: 'strong', name: 'CPU Secret' },
        { type: 'cpu', difficulty: 'normal', name: 'CPU Other' },
        { type: 'cpu', difficulty: 'weak', name: 'CPU Third' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.turnCount = 14;
    const cpuPlayers = rt.__test.getCpuPlayers();
    const winnerIndex = cpuPlayers.findIndex(cpu => cpu && cpu.difficulty === 'strong');
    assert.ok(winnerIndex >= 0);
    const winner = game.players[winnerIndex];
    for (const landmark of rt.enabledLandmarks) winner.landmarks[landmark] = true;
    rt.render();

    const lifecycleCalls = rt.__test.fetchCalls.filter(call => call.url === '/api/game-lifecycle');
    assert.strictEqual(lifecycleCalls.length, 2);
    const startPayload = JSON.parse(lifecycleCalls[0].options.body);
    const finishPayload = JSON.parse(lifecycleCalls[1].options.body);
    assert.strictEqual(startPayload.event, 'play-start');
    assert.strictEqual(startPayload.mode, 'local');
    assert.strictEqual(startPayload.playerCount, 4);
    assert.strictEqual(startPayload.cpuCount, 3);
    assert.strictEqual(finishPayload.event, 'play-finish');
    assert.strictEqual(finishPayload.turn, 14);
    assert.strictEqual(finishPayload.winnerKind, 'cpu');
    assert.strictEqual(finishPayload.winnerCpuDifficulty, 'strong');
    assert.ok(!JSON.stringify(finishPayload).includes('Alice'));
    assert.ok(!JSON.stringify(finishPayload).includes('CPU Secret'));
    assert.ok(!JSON.stringify(finishPayload).includes('ROOM'));
});

runTest('integration: lifecycle通知は旧localStorage key falseもopt-outとして扱う', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.localStorage.setItem('machikoroLifecycleNotificationsEnabled', '0');
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'strong' },
    ]);

    assert.strictEqual(rt.window.__machikoroLifecycleNotifyState().enabled, false);
    rt.startGame();

    assert.strictEqual(rt.__test.fetchCalls.some(call => call.url === '/api/game-lifecycle'), false);
});

runTest('integration: lifecycle開始通知は同一sessionとreload連打を抑止する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'strong' },
    ]);

    rt.startGame();
    rt.notifyGameLifecycleStart();

    const lifecycleCalls = rt.__test.fetchCalls.filter(call => call.url === '/api/game-lifecycle');
    assert.strictEqual(lifecycleCalls.length, 1);
    assert.strictEqual(JSON.parse(lifecycleCalls[0].options.body).event, 'play-start');
});

runTest('integration: client側debug error reportを手動送信できる', () => {
    const rt = loadIntegrationRuntime();
    assert.strictEqual(typeof rt.window.__machikoroSendTestErrorReport, 'function');

    const sent = rt.window.__machikoroSendTestErrorReport('debug ping');

    assert.strictEqual(sent, true);
    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.ok(reportCall);
    const report = JSON.parse(reportCall.options.body);
    assert.strictEqual(report.source, 'debug-client-test');
    assert.strictEqual(report.message, 'debug ping');
    const checkpoint = rt.window.__machikoroClientCheckpoints.find(entry => entry.event === 'client-error-fetch-start');
    assert.ok(checkpoint);
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


runTest('integration: render recovery中にplayerSettingsが短くてもrenderPlayersは再例外にしない', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'strong' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.BUILD;
    rt.__test.setPlayerSettings([]);
    rt.__test.setCpuPlayers([null]);

    rt.render();

    assert.ok(rt.__test.elements.players.innerHTML.includes('プレイヤー'));
    assert.ok(!rt.__test.fetchCalls.some(call => call.url === '/api/client-error'));
    const trace = rt.window.__machikoroFlowTrace.find(entry => entry.event === 'render-player-setting-fallback');
    assert.ok(trace);
    assert.strictEqual(trace.details.playerSettingsLength, 0);
});

if (process.exitCode) {
    throw new Error('integrationテストで失敗が発生しました');
}
