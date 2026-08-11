const assert = require('assert');
const { makeElement, runTest } = require('./helpers/test-utils');
const { loadIntegrationRuntime } = require('./helpers/integration-runtime');
const { loadGameRuntime } = require('./helpers/runtime-loaders');

function hideAllTestModals(rt) {
    if (rt && rt.__test && typeof rt.__test.hideAllModals === 'function') {
        rt.__test.hideAllModals();
        return;
    }
    ['confirmModal', 'pendingModal', 'rulesModal', 'cardSelectModal', 'cardDetailModal'].forEach(id => {
        const el = rt.__test.elements[id];
        if (el && el.style) el.style.display = 'none';
        if (el) el.hidden = false;
    });
    if (rt.window) rt.window.__machikoroConfirmModalOpen = false;
}

runTest('integration: build phaseのshortcutは既存建設menuへfocusしてpending中は隠れる', () => {
    const rt = loadIntegrationRuntime();
    const game = rt.__test.startLocalGame();
    game.phase = rt.GAME_PHASES.BUILD;
    game.builtThisTurn = false;
    game.currentPlayer().coins = 10;
    rt.render();

    const shortcut = rt.__test.elements.btnBuildShortcut;
    assert.strictEqual(shortcut.style.display, 'block');
    assert.strictEqual(shortcut.disabled, false);
    let scrollOptions = null;
    rt.__test.elements.buildMenu.scrollIntoView = options => { scrollOptions = options; };
    assert.strictEqual(rt.focusBuildMenu(), true);
    assert.strictEqual(rt.__test.elements.buildMenu.focused, true);
    assert.strictEqual(scrollOptions.block, 'start');

    game.pendingIT = true;
    rt.render();
    assert.strictEqual(shortcut.style.display, 'none');
    assert.strictEqual(shortcut.disabled, true);
});

runTest('integration: tutorialをOFFにしても詳しさと支援技術向け状態を保つ', () => {
    const rt = loadIntegrationRuntime();
    rt.onChangeTutorialLevel('advanced');
    rt.onToggleTutorial(true);
    rt.onToggleTutorial(false);

    assert.strictEqual(rt.__test.elements.tutorialLevel.value, 'advanced');
    assert.strictEqual(rt.__test.elements.btnTutorialToggle.getAttribute('aria-pressed'), 'false');
    assert.strictEqual(
        rt.__test.elements.btnTutorialLevel.getAttribute('aria-label'),
        'チュートリアルの詳しさ、現在 上級者向け'
    );
});

runTest('integration: ローカル開始→勝利→統計タブ表示まで連携する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    assert.strictEqual(rt.__test.elements.status.focused, true);
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
    rt.__test.elements.status.focused = false;
    rt.resumeGame();

    const resumed = rt.__test.getGame();
    assert.ok(resumed);
    assert.strictEqual(resumed.currentPlayer().coins, 7);
    assert.strictEqual(resumed.currentPlayer().countCard('麦畑') >= 2, true);
    assert.strictEqual(resumed.phase, rt.GAME_PHASES.BUILD);
    assert.strictEqual(resumed.turnCount, 4);
    assert.strictEqual(rt.__test.elements.resumeSection.style.display, 'flex');
    assert.strictEqual(rt.__test.elements.status.focused, true);
});

runTest('integration: 保存削除confirm後に消えたopenerからgame statusへfocusを戻す', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);
    rt.startGame();
    rt.saveGameState();
    rt.updateResumeButton();

    const opener = rt.document.getElementById('btnDeleteSave');
    opener.parentElement = rt.__test.elements.resumeSection;
    opener.focus = () => { rt.document.activeElement = opener; };
    rt.__test.elements.status.focused = false;
    rt.__test.elements.status.focus = () => {
        rt.__test.elements.status.focused = true;
        rt.document.activeElement = rt.__test.elements.status;
    };
    rt.document.activeElement = opener;

    rt.deleteSavedGame();
    rt.__test.elements.confirmOkBtn.onclick();

    assert.strictEqual(rt.localStorage.getItem('savedGame'), null);
    assert.strictEqual(rt.__test.elements.resumeSection.style.display, 'none');
    assert.strictEqual(rt.document.activeElement, rt.__test.elements.status);
    assert.strictEqual(rt.__test.elements.status.focused, true);
});

runTest('integration: 保存したstrong CPUのサイコロ後フェーズは再開後に人間手番まで完了する', () => {
    const cases = [
        {
            name: 'rerollConfirm',
            prepare(rt, game) {
                game.phase = rt.GAME_PHASES.REROLL_CONFIRM;
                game.usedReroll = false;
                game.lastDice1 = 3;
                game.lastDice2 = 4;
                game.lastDiceResult = 7;
                game.pendingTunaDice = [2, 5];
                game.currentPlayer().landmarks['電波塔'] = true;
            },
        },
        {
            name: 'harborChoice',
            prepare(rt, game) {
                game.phase = rt.GAME_PHASES.HARBOR_CHOICE;
                game.usedReroll = true;
                game.lastDice1 = 5;
                game.lastDice2 = 5;
                game.lastDiceResult = 10;
                game.pendingTunaDice = [3, 4];
                game.currentPlayer().landmarks['港'] = true;
            },
        },
        {
            name: 'build',
            prepare(rt, game) {
                game.phase = rt.GAME_PHASES.BUILD;
                game.builtThisTurn = false;
                game.currentPlayer().coins = 0;
            },
        },
    ];

    for (const testCase of cases) {
        const rt = loadIntegrationRuntime();
        rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
        rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
        rt.__test.setPlayerSettings([
            { type: 'human', difficulty: 'normal' },
            { type: 'cpu', difficulty: 'strong' },
        ]);
        rt.startGame();
        rt.__test.timeouts.length = 0;
        const game = rt.__test.getGame();
        const cpuIndex = rt.__test.getCpuPlayers().findIndex(Boolean);
        assert.notStrictEqual(cpuIndex, -1, testCase.name + ' CPU index');
        game.currentPlayerIndex = cpuIndex;
        testCase.prepare(rt, game);
        rt.saveGameState();

        rt.__test.setGame(null);
        rt.resumeGame();
        const resumedCpuIndex = rt.__test.getCpuPlayers().findIndex(Boolean);
        rt.__test.flushTimeouts();

        const resumed = rt.__test.getGame();
        assert.ok(resumed, testCase.name + ' resumed game');
        assert.notStrictEqual(resumed.currentPlayerIndex, resumedCpuIndex, testCase.name + ' advances to human');
        assert.strictEqual(resumed.phase, rt.GAME_PHASES.ROLL, testCase.name + ' human roll phase');
        assert.strictEqual(rt.localStorage.getItem('machikoroActiveCpuStep'), null, testCase.name + ' journal cleared');
        assert.ok(
            rt.window.__machikoroClientCheckpoints.some(entry =>
                entry.event === 'scheduleCPU-step-result' && entry.details.difficulty === 'strong'
            ),
            testCase.name + ' completed checkpoint'
        );
    }
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

    assert.strictEqual(rt.__test.getGame().builtThisTurn, true);
    assert.strictEqual(rt.__test.getGame().phase, rt.GAME_PHASES.BUILD);
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
    assert.strictEqual(rt.__test.getCpuSchedulerHealth().stepScheduled, false);
    rt.__test.runIntervals(1);

    const freezeReports = rt.__test.fetchCalls
        .filter(call => call.url === '/api/client-error')
        .map(call => JSON.parse(call.options.body))
        .filter(report => report.source === 'freeze-watchdog');
    assert.strictEqual(freezeReports.length, 0);
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
});

runTest('integration: 建設後にskip disabledが遅れて残ってもstabilizerがwatchdog前に復旧する', () => {
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
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);

    rt.__test.elements.btnSkip.disabled = true;
    rt.__test.flushTimeouts();

    assert.strictEqual(rt.__test.getGame().builtThisTurn, true);
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    assert.strictEqual(rt.__test.elements.btnSkip.textContent, '建設完了・ターン終了');
    const snapshot = rt.collectUiLockSnapshot('post-build-stabilized');
    assert.strictEqual(rt.validateUiInteractability(snapshot).find(issue => issue.action === 'nextTurn'), undefined);
    assert.strictEqual(rt.__test.fetchCalls.find(call => call.url === '/api/client-error'), undefined);
});

runTest('integration: 建設後unlockはrenderで再disabled化されたskipを即時復旧する', () => {
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
    const originalRender = rt.render;
    rt.render = () => {
        originalRender();
        const activeGame = rt.__test.getGame();
        if (activeGame.phase === rt.GAME_PHASES.BUILD && activeGame.builtThisTurn) {
            rt.__test.elements.btnSkip.disabled = true;
        }
    };

    rt.onBuildCard('麦畑');
    rt.__test.elements.confirmOkBtn.onclick();

    assert.strictEqual(rt.__test.getGame().builtThisTurn, true);
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    const snapshot = rt.collectUiLockSnapshot('post-build-unlock-after-render-sync');
    assert.strictEqual(rt.classifyLikelyFreeze(snapshot), '');
    assert.strictEqual(rt.__test.fetchCalls.find(call => call.url === '/api/client-error'), undefined);
});

runTest('integration: 購入後操作不能をwatchdogが復旧できても通知して原因を残す', () => {
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
    assert.deepStrictEqual(freezeSnapshot.recovery, { attempted: true, success: true });
    const reportCall = rt.__test.fetchCalls.find(call => {
        if (call.url !== '/api/client-error') return false;
        const report = JSON.parse(call.options.body);
        return report.source === 'freeze-watchdog';
    });
    assert.ok(reportCall);
    const report = JSON.parse(reportCall.options.body);
    assert.ok(report.stack.includes('recovery=success'));
    assert.ok(report.stack.includes('cpuSchedulerHealth'));
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    assert.strictEqual(rt.__test.elements.btnSkip.textContent, '建設完了・ターン終了');
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'freeze-watchdog-recovered'));
});


runTest('integration: post-build recovery はrender後に残ったskip disabledを成功判定前に直す', () => {
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

    rt.__test.elements.btnSkip.disabled = true;
    const originalRender = rt.render;
    rt.render = () => {
        originalRender();
        rt.__test.elements.btnSkip.disabled = true;
    };

    const before = rt.collectUiLockSnapshot('post-build-render-redisable-before');
    assert.strictEqual(rt.classifyLikelyFreeze(before), 'post-build-ui-blocked');
    assert.strictEqual(rt.recoverUiInteractability(before), true);

    const after = rt.collectUiLockSnapshot('post-build-render-redisable-after');
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    assert.strictEqual(rt.classifyLikelyFreeze(after), '');
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

    assert.strictEqual(rt.__test.getGame().builtThisTurn, true);
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

    const activeGame = rt.__test.getGame();
    assert.notStrictEqual(activeGame.currentPlayerIndex, cpuIndex);
    assert.strictEqual(activeGame.phase, rt.GAME_PHASES.ROLL);
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.confirmModal.style.display, 'none');
    assert.strictEqual(rt.__test.elements.btnRoll.disabled, false);
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'scheduleCPU-human-turn-unlock'));
});

runTest('integration: CPU build turn stall はwatchdogがCPU処理を再スケジュールする', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'normal' },
    ]);

    rt.startGame();
    rt.__test.flushTimeouts();
    const game = rt.__test.getGame();
    game.currentPlayerIndex = 2;
    game.phase = rt.GAME_PHASES.BUILD;
    game.builtThisTurn = false;
    rt.__test.setCpuPlayers([null, null, {
        chooseTVTarget() { return 0; },
        chooseBusinessMove() { return null; },
        chooseCleaningTarget() { return null; },
        chooseMoverMove() { return null; },
        chooseRenovationTarget() { return null; },
        chooseITInvest() { return false; },
        chooseDiceCount() { return false; },
        chooseReroll() { return false; },
        chooseHarbor() { return false; },
        build() { return false; },
    }]);
    rt.__test.timeouts.length = 0;
    rt.__test.cancelCpuSchedule('test-cpu-stall-clear-schedule');

    const before = rt.collectUiLockSnapshot('cpu-build-turn-stalled');
    assert.strictEqual(before.isCpuTurn, true);
    assert.strictEqual(before.cpuStepScheduled, false);
    assert.strictEqual(rt.classifyLikelyFreeze(before), 'cpu-turn-stalled');

    assert.strictEqual(rt.recoverUiInteractability(before), true);
    const after = rt.collectUiLockSnapshot('cpu-build-turn-stalled-after-recovery');
    assert.strictEqual(after.cpuStepScheduled, true);
    assert.strictEqual(rt.classifyLikelyFreeze(after), '');
    assert.ok(rt.__test.timeouts.length > 0);
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'freeze-watchdog-cpu-reschedule'));
});

runTest('integration: Safari形のCPU build stallを5秒watchdogがrecovery successで再予約する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'normal' },
    ]);
    rt.startGame();
    rt.__test.flushTimeouts();
    const game = rt.__test.getGame();
    game.currentPlayerIndex = 1;
    game.phase = rt.GAME_PHASES.BUILD;
    game.builtThisTurn = false;
    rt.__test.setCpuPlayers([null, {
        chooseTVTarget() { return 0; },
        chooseBusinessMove() { return null; },
        chooseCleaningTarget() { return null; },
        chooseMoverMove() { return null; },
        chooseRenovationTarget() { return null; },
        chooseITInvest() { return false; },
        chooseDiceCount() { return false; },
        chooseReroll() { return false; },
        chooseHarbor() { return false; },
        build() { return false; },
    }]);
    rt.__test.scheduleCpuTurn('test-safari-cpu-timer-lost');
    rt.__test.timeouts.length = 0;
    rt.__test.elements.pendingMenu.style.display = 'block';
    rt.__test.elements.pendingMenu.innerHTML = '';

    rt.__test.runIntervals(1);
    rt.__test.advanceTime(6000);
    rt.__test.runIntervals(1);

    const saved = JSON.parse(rt.localStorage.getItem('machikoroFreezeSnapshot'));
    assert.strictEqual(saved.freezeKind, 'cpu-turn-stalled');
    assert.deepStrictEqual(saved.recovery, { attempted: true, success: true });
    assert.strictEqual(saved.snapshot.ui.pendingMenu.display, 'block');
    assert.strictEqual(saved.snapshot.cpuSchedulerHealth.stepScheduled, false);
    assert.strictEqual(saved.snapshot.cpuSchedulerHealth.blockedReason, '');
    assert.ok(Number.isInteger(saved.snapshot.cpuSchedulerHealth.token));
    assert.ok(Number.isFinite(saved.snapshot.cpuSchedulerHealth.scheduledUntil));
    assert.strictEqual(rt.collectUiLockSnapshot('after-safari-watchdog').cpuStepScheduled, true);
    assert.ok(rt.__test.timeouts.length > 0);
    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.ok(reportCall);
    const report = JSON.parse(reportCall.options.body);
    assert.ok(report.message.includes('cpu-turn-stalled'));
    assert.ok(report.stack.includes('recovery=success'));
});

runTest('integration: online action ACK停止はwatchdogがpendingを保持して再同期する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);
    rt.startGame();
    rt.__test.getGame().phase = rt.GAME_PHASES.BUILD;
    rt.initSocket();
    rt.__test.setOnlineState({
        isOnlineGame: true,
        myRoomId: 'ROOM01',
        myOriginalPlayerIndex: 0,
        myPlayerName: 'Alice',
        reconnectToken: 'token-a',
    });

    assert.strictEqual(rt.sendAction('nextTurn', {}), true);
    const pending = rt.localStorage.getItem('onlinePendingAction');
    const snapshot = rt.buildClientRuntimeSnapshot('online-ack-stalled');
    assert.strictEqual(snapshot.onlineActionInFlight, true);
    assert.strictEqual(snapshot.onlineActionInFlightAt > 0, true);
    assert.strictEqual(rt.classifyLikelyFreeze(snapshot), '');
    rt.__test.advanceTime(14999);
    assert.strictEqual(rt.classifyLikelyFreeze(rt.buildClientRuntimeSnapshot('online-ack-waiting')), '');
    rt.__test.advanceTime(1);
    const timedOutSnapshot = rt.buildClientRuntimeSnapshot('online-ack-timed-out');
    assert.strictEqual(rt.classifyLikelyFreeze(timedOutSnapshot), 'online-action-in-flight-stalled');

    assert.strictEqual(rt.recoverFreezeKind('online-action-in-flight-stalled', timedOutSnapshot), true);
    assert.strictEqual(rt.localStorage.getItem('onlinePendingAction'), pending);
    assert.strictEqual(rt.__test.socketEmits.some(event => event.name === 'rejoinRoom'), true);
    assert.strictEqual(rt.buildClientRuntimeSnapshot().isReconnectingOnline, true);
    assert.strictEqual(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'freeze-watchdog-online-action-resync'), true);
});

runTest('integration: online待機一覧は参加枠と自動開始条件を説明する', () => {
    const rt = loadIntegrationRuntime({ includeOnline: true });
    rt.initSocket();
    rt.__test.socketHandlers.roomCreated({
        roomId: 'ROOM01', playerIndex: 0, reconnectToken: 'token-a',
    });
    rt.__test.socketHandlers.playerList(['Alice', '待機中...', 'CPU（普通）']);

    const status = rt.__test.elements.onlineStatus.innerHTML;
    assert.ok(status.includes('参加枠（3枠）: Alice、待機中...、CPU（普通）'));
    assert.ok(status.includes('参加枠が揃うと自動開始します'));
    assert.ok(!status.includes('(3人)'));
});

runTest('integration: 勝利表示後のbuild phaseをwatchdogがfreeze扱いしない', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set([rt.LANDMARK_NAMES.STATION]);
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);
    rt.startGame();
    const game = rt.__test.getGame();
    game.enabledLandmarks = new Set([rt.LANDMARK_NAMES.STATION]);
    game.players[game.currentPlayerIndex].landmarks[rt.LANDMARK_NAMES.STATION] = true;
    game.phase = rt.GAME_PHASES.BUILD;
    game.builtThisTurn = true;
    rt.render();

    const snapshot = rt.buildClientRuntimeSnapshot('winner-watchdog');
    assert.strictEqual(snapshot.hasWinner, true);
    assert.strictEqual(rt.classifyLikelyFreeze(snapshot), '');
    assert.strictEqual(rt.recoverUiInteractability(snapshot), false);
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

runTest('integration: human pendingは初回だけ解決操作へfocusし完了後gameへ戻す', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);
    rt.startGame();
    const game = rt.__test.getGame();
    const pendingAction = makeElement();
    let focusCount = 0;
    pendingAction.focus = () => {
        focusCount++;
        rt.document.activeElement = pendingAction;
    };
    rt.__test.elements.pendingMenu.querySelector = () => pendingAction;
    rt.__test.elements.pendingMenu.contains = target => target === pendingAction;
    rt.__test.elements.pendingModal.contains = target => target === pendingAction;
    rt.__test.elements.status.focus = () => {
        rt.__test.elements.status.focused = true;
        rt.document.activeElement = rt.__test.elements.status;
    };

    game.phase = rt.GAME_PHASES.PENDING;
    game.pendingTV = 1;
    rt.render();
    assert.strictEqual(focusCount, 1);
    assert.strictEqual(rt.document.activeElement, pendingAction);

    rt.render();
    assert.strictEqual(focusCount, 1);

    game.pendingTV = 0;
    game.phase = rt.GAME_PHASES.BUILD;
    rt.render();
    assert.strictEqual(rt.document.activeElement, rt.__test.elements.status);
});

runTest('integration: human dice choiceは初回focusし結果を一度だけ通知する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);
    const choice = makeElement();
    let focusCount = 0;
    choice.focus = () => {
        focusCount++;
        rt.document.activeElement = choice;
    };
    rt.__test.elements.diceChoose.querySelector = () => choice;

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.SELECT_DICE;
    rt.render();
    assert.strictEqual(focusCount, 1);
    rt.render();
    assert.strictEqual(focusCount, 1);

    game.lastDice1 = 2;
    game.lastDice2 = 6;
    game.lastDiceResult = 8;
    game.phase = rt.GAME_PHASES.BUILD;
    rt.render();
    assert.strictEqual(
        rt.__test.elements.diceResultAnnouncer.textContent,
        'サイコロの出目は2と6、合計8です'
    );
    rt.render();
    assert.strictEqual(
        rt.__test.elements.diceResultAnnouncer.textContent,
        'サイコロの出目は2と6、合計8です'
    );
});

runTest('integration: 駅→電波塔→港のchoice identity変化ごとに新しい操作へfocusする', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);
    let focusCount = 0;
    rt.__test.elements.diceChoose.querySelector = () => ({
        focus() { focusCount++; },
    });

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.SELECT_DICE;
    rt.render();
    assert.strictEqual(focusCount, 1);
    rt.render();
    assert.strictEqual(focusCount, 1);

    game.lastDiceResult = 10;
    game.phase = rt.GAME_PHASES.REROLL_CONFIRM;
    rt.render();
    assert.strictEqual(focusCount, 2);
    rt.render();
    assert.strictEqual(focusCount, 2);

    game.phase = rt.GAME_PHASES.HARBOR_CHOICE;
    rt.render();
    assert.strictEqual(focusCount, 3);
    rt.render();
    assert.strictEqual(focusCount, 3);
});

runTest('integration: 駅・電波塔・港の選択完了後は次のprimary操作へfocusを戻す', () => {
    const scenarios = [
        { phase: 'SELECT_DICE', nextPhase: 'ROLL', expectedTarget: 'btnRoll' },
        { phase: 'REROLL_CONFIRM', nextPhase: 'BUILD', expectedTarget: 'btnSkip' },
        { phase: 'HARBOR_CHOICE', nextPhase: 'BUILD', expectedTarget: 'btnSkip' },
    ];
    scenarios.forEach(scenario => {
        const rt = loadIntegrationRuntime();
        rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
        rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
        rt.__test.setPlayerSettings([
            { type: 'human', difficulty: 'normal' },
            { type: 'human', difficulty: 'normal' },
        ]);
        const choice = makeElement();
        choice.focus = () => { rt.document.activeElement = choice; };
        rt.__test.elements.diceChoose.querySelector = () => choice;
        rt.__test.elements.diceChoose.contains = target => target === choice;
        ['btnRoll', 'btnSkip'].forEach(id => {
            rt.__test.elements[id].focus = () => {
                rt.document.activeElement = rt.__test.elements[id];
            };
        });

        rt.startGame();
        const game = rt.__test.getGame();
        game.phase = rt.GAME_PHASES[scenario.phase];
        game.lastDice1 = 5;
        game.lastDice2 = 5;
        game.lastDiceResult = 10;
        rt.render();
        assert.strictEqual(rt.document.activeElement, choice, scenario.phase);

        game.phase = rt.GAME_PHASES[scenario.nextPhase];
        rt.render();
        assert.strictEqual(
            rt.document.activeElement,
            rt.__test.elements[scenario.expectedTarget],
            scenario.phase
        );
    });
});

runTest('integration: local pending save復帰は可視の解決操作へfocusを戻す', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);
    const pendingAction = makeElement();
    let focusCount = 0;
    pendingAction.focus = () => {
        focusCount++;
        rt.document.activeElement = pendingAction;
    };
    rt.__test.elements.pendingMenu.querySelector = () => pendingAction;
    rt.__test.elements.pendingMenu.contains = target => target === pendingAction;
    rt.__test.elements.pendingModal.contains = target => target === pendingAction;
    rt.__test.elements.status.focus = () => {
        rt.__test.elements.status.focused = true;
        rt.document.activeElement = rt.__test.elements.status;
    };

    rt.startGame();
    const game = rt.__test.getGame();
    game.phase = rt.GAME_PHASES.PENDING;
    game.pendingTV = 1;
    rt.render();
    assert.strictEqual(rt.document.activeElement, pendingAction);
    assert.strictEqual(focusCount, 1);
    rt.saveGameState();

    rt.__test.setGame(null);
    assert.strictEqual(rt.resumeGame(), true);
    assert.strictEqual(rt.__test.elements.pendingModal.style.display, 'flex');
    assert.strictEqual(rt.document.activeElement, pendingAction);
    assert.strictEqual(focusCount, 2);
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
    assert.ok(report.stack.includes('allowed-action-container-not-clickable'));
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
    assert.strictEqual(rt.__test.getGame().builtThisTurn, true);
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
    assert.deepStrictEqual(freezeSnapshot.recovery, { attempted: true, success: true });
    assert.strictEqual(rt.__test.elements.confirmModal.style.display, 'none');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.ok(reportCall);
    const report = JSON.parse(reportCall.options.body);
    assert.ok(report.stack.includes('recovery=success'));
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'freeze-watchdog-recovered'));
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

runTest('integration: primary action registry は各phaseのhidden/inert/pointer-blocked containerを復旧する', () => {
    const cases = [
        {
            name: 'roll pointer-blocked',
            action: 'rollDice',
            targetId: 'btnRoll',
            corrupt(el) { el.style.pointerEvents = 'none'; },
            assertRecovered(el) { assert.notStrictEqual(el.style.pointerEvents, 'none'); },
            setup(rt, game) { game.phase = rt.GAME_PHASES.ROLL; },
        },
        {
            name: 'rerollConfirm hidden',
            action: 'rerollDice',
            targetId: 'diceChoose',
            corrupt(el) { el.style.display = 'none'; },
            assertRecovered(el) { assert.strictEqual(el.style.display, 'block'); },
            setup(rt, game) { game.phase = rt.GAME_PHASES.REROLL_CONFIRM; game.lastDiceResult = 6; },
        },
        {
            name: 'harborChoice inert',
            action: 'resolveHarbor',
            targetId: 'diceChoose',
            corrupt(el) { el.inert = true; el.setAttribute('aria-hidden', 'true'); },
            assertRecovered(el) { assert.strictEqual(el.inert, false); assert.strictEqual(el.getAttribute('aria-hidden'), null); },
            setup(rt, game) { game.phase = rt.GAME_PHASES.HARBOR_CHOICE; game.lastDiceResult = 10; },
        },
        {
            name: 'pending resolveBusiness pointer-blocked',
            action: 'resolveBusiness',
            targetId: 'pendingMenu',
            corrupt(el, rt) { rt.__test.elements.pendingModal.style.pointerEvents = 'none'; el.style.pointerEvents = 'none'; },
            assertRecovered(el, rt) { assert.strictEqual(rt.__test.elements.pendingModal.style.pointerEvents, 'auto'); assert.strictEqual(el.style.pointerEvents, 'auto'); },
            setup(rt, game) { game.phase = rt.GAME_PHASES.PENDING; game.pendingBusiness = 1; },
        },
        {
            name: 'build nextTurn inert',
            action: 'nextTurn',
            targetId: 'btnSkip',
            corrupt(el) { el.inert = true; },
            assertRecovered(el) { assert.strictEqual(el.inert, false); },
            setup(rt, game) { game.phase = rt.GAME_PHASES.BUILD; game.builtThisTurn = true; },
        },
    ];

    for (const testCase of cases) {
        const rt = loadIntegrationRuntime();
        rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
        rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
        rt.__test.setPlayerSettings([
            { type: 'human', difficulty: 'normal' },
            { type: 'human', difficulty: 'normal' },
        ]);
        rt.startGame();
        const game = rt.__test.getGame();
        hideAllTestModals(rt);
        testCase.setup(rt, game);
        rt.render();
        assert.ok(rt.collectUiLockSnapshot(testCase.name).allowedActions.includes(testCase.action), testCase.name);
        const target = rt.__test.elements[testCase.targetId];
        assert.ok(target, testCase.name + ' target');
        assert.ok(target.innerHTML.length > 0 || testCase.targetId !== 'diceChoose' && testCase.targetId !== 'pendingMenu', testCase.name + ' content');
        testCase.corrupt(target, rt);

        const before = rt.collectUiLockSnapshot(testCase.name + '-before');
        const issue = rt.validateUiInteractability(before).find(item => item.action === testCase.action);
        assert.ok(issue, testCase.name + ' issue');
        assert.strictEqual(issue.kind, 'allowed-action-container-not-clickable');
        assert.strictEqual(issue.freezeKind, 'human-turn-ui-locked');

        assert.strictEqual(rt.recoverUiInteractability(before), true, testCase.name + ' recovery');
        testCase.assertRecovered(target, rt);
    }
});

runTest('integration: buildLandmark allowed でも建設候補がなければ子ボタン要求でlock扱いしない', () => {
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
    game.currentPlayer().coins = 0;
    hideAllTestModals(rt);
    rt.render();

    const snapshot = rt.collectUiLockSnapshot('build-landmark-no-candidate');
    assert.ok(snapshot.allowedActions.includes('buildLandmark'));
    const issue = rt.validateUiInteractability(snapshot).find(item => item.action === 'buildLandmark');
    assert.strictEqual(issue, undefined);
});

runTest('integration: 建設済みbuild phaseではbuildLandmark子ボタンを要求しない', () => {
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
    game.currentPlayer().coins = 30;
    hideAllTestModals(rt);
    rt.render();

    const snapshot = rt.collectUiLockSnapshot('build-landmark-built-this-turn');
    assert.ok(snapshot.allowedActions.includes('buildLandmark'));
    assert.ok(snapshot.allowedActions.includes('nextTurn'));
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    assert.strictEqual(rt.validateUiInteractability(snapshot).find(item => item.action === 'buildLandmark'), undefined);
    assert.strictEqual(rt.validateUiInteractability(snapshot).filter(issue => issue.freezeKind === 'human-turn-ui-locked').length, 0);
});

runTest('integration: 建設済みbuild phaseでbuildMenuが空でも購入actionをlock原因にしない', () => {
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
    game.currentPlayer().coins = 30;
    hideAllTestModals(rt);
    rt.render();

    rt.__test.elements.buildMenu.innerHTML = '';
    rt.__test.elements.btnSkip.disabled = true;

    const snapshot = rt.collectUiLockSnapshot('post-build-empty-menu');
    const issues = rt.validateUiInteractability(snapshot);
    assert.ok(snapshot.allowedActions.includes('buildCard'));
    assert.ok(snapshot.allowedActions.includes('buildLandmark'));
    assert.ok(snapshot.allowedActions.includes('undoBuild'));
    assert.strictEqual(issues.find(item => item.action === 'buildCard'), undefined);
    assert.strictEqual(issues.find(item => item.action === 'buildLandmark'), undefined);
    assert.strictEqual(issues.find(item => item.action === 'undoBuild'), undefined);
    assert.strictEqual(issues.find(item => item.action === 'nextTurn').reason, 'disabled-mismatch');
    assert.strictEqual(rt.classifyLikelyFreeze(snapshot), 'post-build-ui-blocked');
});

runTest('integration: post-build undoBuild 子ボタン欠落をwatchdog復旧で再生成する', () => {
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
    rt.__test.setUndoState({ state: 'test' });
    hideAllTestModals(rt);
    rt.render();

    rt.__test.elements.buildMenu.innerHTML = '<button data-action="buildCard" disabled>bad stale build child</button>';
    rt.__test.elements.btnSkip.disabled = true;

    const before = rt.collectUiLockSnapshot('post-build-missing-undo-child');
    const issue = rt.validateUiInteractability(before).find(item => item.action === 'undoBuild');
    assert.ok(issue);
    assert.strictEqual(issue.kind, 'allowed-action-container-not-clickable');
    assert.strictEqual(issue.reason, 'action-child-not-clickable');

    assert.strictEqual(rt.recoverUiInteractability(before), true);
    assert.ok(rt.__test.elements.buildMenu.innerHTML.includes('data-action="undoBuild"'));
    const after = rt.collectUiLockSnapshot('post-build-missing-undo-child-after');
    assert.strictEqual(rt.classifyLikelyFreeze(after), '');
    assert.strictEqual(rt.validateUiInteractability(after).find(item => item.action === 'undoBuild'), undefined);
});

runTest('integration: render直後syncはpost-build undoBuild子ボタン欠落をwatchdog前に再生成する', () => {
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
    rt.__test.setUndoState({ state: 'test' });
    hideAllTestModals(rt);
    rt.render();

    rt.__test.elements.buildMenu.innerHTML = '<button data-action="buildCard" disabled>bad stale build child</button>';
    rt.__test.elements.btnSkip.disabled = false;

    const before = rt.collectUiLockSnapshot('post-build-missing-undo-child-before-render-sync');
    assert.strictEqual(rt.validateUiInteractability(before).find(item => item.action === 'undoBuild').reason, 'action-child-not-clickable');
    assert.strictEqual(rt.syncUiInteractabilityAfterRender('test-post-build-undo-render-sync'), true);
    assert.ok(rt.__test.elements.buildMenu.innerHTML.includes('data-action="undoBuild"'));
    const after = rt.collectUiLockSnapshot('post-build-missing-undo-child-after-render-sync');
    assert.strictEqual(rt.classifyLikelyFreeze(after), '');
    assert.strictEqual(rt.validateUiInteractability(after).find(item => item.action === 'undoBuild'), undefined);
});

runTest('integration: card filterで建設可能カードが非表示ならbuildCard子ボタン欠落をlock扱いしない', () => {
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
    game.currentPlayer().coins = 1;
    hideAllTestModals(rt);
    rt.render();
    rt.setCardFilter('red');

    const snapshot = rt.collectUiLockSnapshot('build-card-filter-hidden-buildable-card');
    assert.ok(snapshot.allowedActions.includes('buildCard'));
    assert.strictEqual(rt.validateUiInteractability(snapshot).find(item => item.action === 'buildCard'), undefined);
    assert.strictEqual(rt.classifyLikelyFreeze(snapshot), '');
});

runTest('integration: card filter再描画は選択ARIAと同一filter focusを同期する', () => {
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
    hideAllTestModals(rt);
    rt.render();

    const buildMenu = rt.__test.elements.buildMenu;
    const oldRed = makeElement({ dataset: { action: 'setCardFilter', cardFilter: 'red' } });
    const newRed = makeElement({
        dataset: { action: 'setCardFilter', cardFilter: 'red' },
        parentElement: buildMenu,
        isConnected: true,
    });
    buildMenu.querySelectorAll = selector => selector.includes('setCardFilter') ? [newRed] : [];

    rt.setCardFilter('red', oldRed);

    assert.strictEqual(newRed.focused, true);
    assert.strictEqual((buildMenu.innerHTML.match(/aria-pressed="true"/g) || []).length, 1);
    assert.ok(/data-card-filter="red"[^>]+aria-pressed="true"/.test(buildMenu.innerHTML));
});

runTest('integration: 建設可filterは購入可能施設だけを表示し0件状態でもfocusを維持する', () => {
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
    game.currentPlayer().coins = 1;
    hideAllTestModals(rt);
    rt.render();

    const buildMenu = rt.__test.elements.buildMenu;
    const oldAffordable = makeElement({
        dataset: { action: 'setCardFilter', cardFilter: 'affordable' },
    });
    const newAffordable = makeElement({
        dataset: { action: 'setCardFilter', cardFilter: 'affordable' },
        parentElement: buildMenu,
        isConnected: true,
    });
    buildMenu.querySelectorAll = selector => selector.includes('setCardFilter')
        ? [newAffordable] : [];
    rt.setCardFilter('affordable', oldAffordable);

    assert.strictEqual(newAffordable.focused, true);
    assert.ok(/data-card-name="麦畑"/.test(buildMenu.innerHTML));
    assert.ok(!/data-card-name="森林"/.test(buildMenu.innerHTML));

    game.builtThisTurn = true;
    rt.render();
    assert.ok(buildMenu.innerHTML.includes('現在建設できる施設はありません'));
    const snapshot = rt.collectUiLockSnapshot('affordable-filter-empty');
    assert.strictEqual(rt.classifyLikelyFreeze(snapshot), '');
});

runTest('integration: 建設確定後はskip、local Undo後は復元cardへfocusを移す', () => {
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
    hideAllTestModals(rt);
    rt.render();

    const buildMenu = rt.__test.elements.buildMenu;
    const oldCard = makeElement({
        dataset: { action: 'buildCard', cardName: '麦畑' },
        parentElement: buildMenu,
    });
    oldCard.focus = () => { rt.document.activeElement = oldCard; };
    const restoredCard = makeElement({
        dataset: { action: 'buildCard', cardName: '麦畑' },
        parentElement: buildMenu,
    });
    restoredCard.focus = () => { rt.document.activeElement = restoredCard; };
    const undo = makeElement({
        dataset: { action: 'undoBuild' },
        parentElement: buildMenu,
    });
    const skip = rt.__test.elements.btnSkip;
    skip.focus = () => { rt.document.activeElement = skip; };
    buildMenu.querySelectorAll = selector => selector.includes('buildCard')
        ? [restoredCard]
        : [];

    rt.document.activeElement = oldCard;
    rt.saveUndoState();
    assert.strictEqual(game.buildCard(rt.createCardByName('麦畑')), true);
    restoredCard.disabled = true;
    rt.render();
    assert.strictEqual(game.builtThisTurn, true);
    assert.strictEqual(rt.document.activeElement, skip);

    rt.document.activeElement = undo;
    restoredCard.disabled = false;
    rt.doUndo();
    assert.strictEqual(rt.__test.getGame().builtThisTurn, false);
    assert.strictEqual(rt.document.activeElement, restoredCard);
});

runTest('integration: buildLandmark allowed かつ建設候補ありなら専用子ボタンを要求する', () => {
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
    hideAllTestModals(rt);
    rt.render();

    const disabledLandmark = makeElement({ disabled: true });
    disabledLandmark.setAttribute('data-action', 'buildLandmark');
    rt.__test.elements.buildMenu.querySelectorAll = selector => selector.includes('buildLandmark') ? [disabledLandmark] : [];

    const snapshot = rt.collectUiLockSnapshot('build-landmark-disabled-child');
    const issue = rt.validateUiInteractability(snapshot).find(item => item.action === 'buildLandmark');
    assert.ok(issue);
    assert.strictEqual(issue.kind, 'allowed-action-container-not-clickable');
    assert.strictEqual(issue.reason, 'action-child-not-clickable');
    assert.strictEqual(rt.recoverUiInteractability(snapshot), true);
    assert.strictEqual(disabledLandmark.disabled, false);
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
    assert.strictEqual(issue.kind, 'allowed-action-container-not-clickable');
    assert.strictEqual(issue.reason, 'child-not-clickable');
    assert.strictEqual(snapshot.actionButtons.buttons.diceChoose.totalInteractiveChildren, 1);
    assert.strictEqual(snapshot.actionButtons.buttons.diceChoose.usableInteractiveChildren, 0);
    assert.strictEqual(rt.recoverUiInteractability(snapshot), true);
    assert.strictEqual(disabledChoice.disabled, false);
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
    assert.deepStrictEqual(freezeSnapshot.recovery, { attempted: true, success: true });
    assert.strictEqual(rt.__test.elements.gameScreen.style.display, 'block');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    const reportCall = rt.__test.fetchCalls.find(call => call.url === '/api/client-error');
    assert.ok(reportCall);
    const report = JSON.parse(reportCall.options.body);
    assert.ok(report.stack.includes('recovery=success'));
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'freeze-watchdog-recovered'));
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
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'freeze-watchdog-recovered'));
});


runTest('integration: nested blocking modal はinteractability診断で検出する', () => {
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
    rt.render();
    hideAllTestModals(rt);

    rt.__test.elements.confirmModal.style.display = 'flex';
    rt.window.__machikoroConfirmModalOpen = true;
    rt.__test.elements.cardDetailModal.style.display = 'flex';
    const snapshot = rt.collectUiLockSnapshot('nested-modal-test');
    const issues = rt.validateUiInteractability(snapshot);

    assert.ok(issues.some(issue => issue.kind === 'nested-blocking-modal-policy-violation'));
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

runTest('integration: primary action container registry は GameManager action contract を網羅する', () => {
    const rt = loadIntegrationRuntime();
    const gameRuntime = loadGameRuntime();
    const registry = rt.primaryActionContainerRegistryForDiagnostics();
    const registryActions = registry.flatMap(entry => entry.actions);
    const expectedActions = Object.values(gameRuntime.GAME_ACTIONS);

    assert.deepStrictEqual([...new Set(registryActions)].sort(), expectedActions.slice().sort());
    assert.strictEqual(registryActions.length, expectedActions.length, 'registry actions must not be duplicated');

    const phaseActionEntries = Object.entries(gameRuntime.GAME_PHASE_ACTIONS)
        .flatMap(([phase, actions]) => actions.map(action => [action, phase]));
    const pendingEntries = gameRuntime.PENDING_ACTION_SPECS
        .map(spec => [spec.action, gameRuntime.GAME_PHASES.PENDING])
        .concat([[gameRuntime.PENDING_IT_QUEUE_POLICY.action, gameRuntime.GAME_PHASES.PENDING]]);
    const expectedPhaseByAction = new Map(phaseActionEntries.concat(pendingEntries));

    for (const entry of registry) {
        assert.ok(rt.__test.elements[entry.targetId], `${entry.targetId} target exists`);
        if (entry.modalId) assert.ok(rt.__test.elements[entry.modalId], `${entry.modalId} modal exists`);
        for (const action of entry.actions) {
            assert.strictEqual(entry.phase, expectedPhaseByAction.get(action), `${action} registry phase`);
            assert.strictEqual(gameRuntime.GAME_ACTION_REGISTRY[action].phase, entry.phase, `${action} GameManager phase`);
        }
    }
});

runTest('integration: 未登録allowed actionはinteractability contract違反として検出する', () => {
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
    hideAllTestModals(rt);
    rt.render();

    const snapshot = rt.collectUiLockSnapshot('missing-registry-action');
    snapshot.allowedActions = ['futureAction'];
    const issue = rt.validateUiInteractability(snapshot).find(item => item.action === 'futureAction');
    assert.ok(issue);
    assert.strictEqual(issue.kind, 'allowed-action-missing-container-registry');
    assert.strictEqual(issue.reason, 'missing-registry');
    assert.strictEqual(issue.freezeKind, 'human-turn-ui-locked');
});

runTest('integration: 通常renderは主要action containerをrecoveryなしで操作可能にする', () => {
    const cases = [
        {
            name: 'roll',
            action: 'rollDice',
            setup(rt, game) { game.phase = rt.GAME_PHASES.ROLL; },
        },
        {
            name: 'selectDice',
            action: 'selectDice',
            setup(rt, game) { game.phase = rt.GAME_PHASES.SELECT_DICE; },
        },
        {
            name: 'rerollConfirm reroll',
            action: 'rerollDice',
            setup(rt, game) { game.phase = rt.GAME_PHASES.REROLL_CONFIRM; game.lastDiceResult = 6; },
        },
        {
            name: 'rerollConfirm skip',
            action: 'skipReroll',
            setup(rt, game) { game.phase = rt.GAME_PHASES.REROLL_CONFIRM; game.lastDiceResult = 6; },
        },
        {
            name: 'harborChoice',
            action: 'resolveHarbor',
            setup(rt, game) { game.phase = rt.GAME_PHASES.HARBOR_CHOICE; game.lastDiceResult = 10; },
        },
        {
            name: 'pending resolveBusiness',
            action: 'resolveBusiness',
            setup(rt, game) {
                game.phase = rt.GAME_PHASES.PENDING;
                game.pendingBusiness = 1;
                game.currentPlayer().cards.push(rt.createCardByName('ビジネスセンター'));
                game.players[1].cards.push(rt.createCardByName('森林'));
            },
        },
        {
            name: 'pending resolveTV',
            action: 'resolveTV',
            setup(rt, game) {
                game.phase = rt.GAME_PHASES.PENDING;
                game.pendingTV = 1;
            },
        },
        {
            name: 'pending resolveCleaning',
            action: 'resolveCleaning',
            setup(rt, game) {
                game.phase = rt.GAME_PHASES.PENDING;
                game.pendingCleaning = 1;
                game.players[1].cards.push(rt.createCardByName('森林'));
            },
        },
        {
            name: 'pending resolveMover',
            action: 'resolveMover',
            setup(rt, game) {
                game.phase = rt.GAME_PHASES.PENDING;
                game.pendingMover = 1;
                game.currentPlayer().cards.push(rt.createCardByName('森林'));
            },
        },
        {
            name: 'pending resolveRenovation',
            action: 'resolveRenovation',
            setup(rt, game) {
                game.phase = rt.GAME_PHASES.PENDING;
                game.pendingRenovation = 1;
                game.currentPlayer().landmarks['駅'] = true;
            },
        },
        {
            name: 'pending resolveIT',
            action: 'resolveIT',
            setup(rt, game) {
                game.phase = rt.GAME_PHASES.PENDING;
                game.pendingIT = true;
                game.currentPlayer().coins = 3;
            },
        },
        {
            name: 'buildCard',
            action: 'buildCard',
            setup(rt, game) { game.phase = rt.GAME_PHASES.BUILD; game.currentPlayer().coins = 10; },
        },
        {
            name: 'buildLandmark',
            action: 'buildLandmark',
            setup(rt, game) { game.phase = rt.GAME_PHASES.BUILD; game.currentPlayer().coins = 10; },
        },
        {
            name: 'undoBuild',
            action: 'undoBuild',
            setup(rt, game) {
                game.phase = rt.GAME_PHASES.BUILD;
                game.builtThisTurn = true;
                rt.__test.setUndoState({ state: 'test' });
            },
        },
        {
            name: 'build nextTurn',
            action: 'nextTurn',
            setup(rt, game) { game.phase = rt.GAME_PHASES.BUILD; game.builtThisTurn = true; },
        },
    ];

    for (const testCase of cases) {
        const rt = loadIntegrationRuntime();
        rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
        rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
        rt.__test.setPlayerSettings([
            { type: 'human', difficulty: 'normal' },
            { type: 'human', difficulty: 'normal' },
        ]);
        rt.startGame();
        const game = rt.__test.getGame();
        hideAllTestModals(rt);
        testCase.setup(rt, game);
        rt.render();

        const snapshot = rt.collectUiLockSnapshot(testCase.name);
        assert.ok(snapshot.allowedActions.includes(testCase.action), testCase.name + ' allowed');
        assert.strictEqual(rt.validateUiInteractability(snapshot).filter(issue => issue.freezeKind === 'human-turn-ui-locked').length, 0, testCase.name + ' no human lock');
        assert.strictEqual(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'freeze-watchdog-recovered'), false, testCase.name + ' no watchdog recovery');
    }
});

runTest('integration: harborChoice の正常なresolveHarborボタンはfreeze扱いしない', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    rt.startGame();
    const game = rt.__test.getGame();
    hideAllTestModals(rt);
    game.phase = rt.GAME_PHASES.HARBOR_CHOICE;
    game.lastDiceResult = 10;
    rt.render();

    const snapshot = rt.collectUiLockSnapshot('harbor-choice-normal');
    assert.deepStrictEqual(Array.from(snapshot.allowedActions), ['resolveHarbor']);
    assert.ok(rt.__test.elements.diceChoose.innerHTML.includes('data-action="resolveHarbor"'));
    assert.strictEqual(rt.validateUiInteractability(snapshot).filter(issue => issue.freezeKind === 'human-turn-ui-locked').length, 0);
    assert.strictEqual(rt.classifyLikelyFreeze(snapshot), '');
});

runTest('integration: build phase render はstale root/container lockをwatchdog前に同期する', () => {
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

    rt.__test.elements.gameScreen.style.display = 'none';
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');
    rt.__test.elements.btnSkip.disabled = true;
    rt.__test.elements.btnSkip.inert = true;
    rt.__test.elements.btnSkip.style.pointerEvents = 'none';
    rt.__test.elements.buildMenu.style.pointerEvents = 'none';

    rt.render();

    const snapshot = rt.collectUiLockSnapshot('post-render-sync');
    assert.strictEqual(rt.__test.elements.gameScreen.style.display, 'block');
    assert.strictEqual(rt.__test.elements.gameScreen.inert, false);
    assert.strictEqual(rt.__test.elements.gameScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(rt.__test.elements.btnSkip.disabled, false);
    assert.strictEqual(rt.__test.elements.btnSkip.inert, false);
    assert.notStrictEqual(rt.__test.elements.btnSkip.style.pointerEvents, 'none');
    assert.notStrictEqual(rt.__test.elements.buildMenu.style.pointerEvents, 'none');
    assert.strictEqual(rt.validateUiInteractability(snapshot).filter(issue => issue.freezeKind === 'human-turn-ui-locked').length, 0);
    assert.ok(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'ui-render-interactability-sync'));
    assert.strictEqual(rt.window.__machikoroClientCheckpoints.some(entry => entry.event === 'freeze-watchdog-recovered'), false);
    assert.strictEqual(rt.__test.fetchCalls.find(call => call.url === '/api/client-error'), undefined);
});

runTest('integration: watchdog recovery 発火時はbefore/after診断をtraceに残す', () => {
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
    rt.__test.elements.gameScreen.inert = true;
    rt.__test.elements.gameScreen.setAttribute('aria-hidden', 'true');
    rt.__test.elements.btnSkip.disabled = false;

    const before = rt.collectUiLockSnapshot('manual-recovery-trace');
    assert.strictEqual(rt.recoverUiInteractability(before), true);

    const trace = rt.window.__machikoroClientCheckpoints.find(entry => entry.event === 'ui-interactability-recovery-fired');
    assert.ok(trace);
    assert.ok(trace.details.before);
    assert.ok(trace.details.after);
    assert.ok(Array.isArray(trace.details.issues));
    assert.ok(trace.details.issues.some(issue => issue.target === 'gameScreen' || issue.target === 'btnSkip'));
    assert.ok(Array.isArray(trace.details.recentCheckpoints));
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

    const activeGame = rt.__test.getGame();
    assert.strictEqual(activeGame.currentPlayer().landmarks['駅'], true);
    assert.strictEqual(activeGame.builtThisTurn, true);
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
