'use strict';

const assert = require('assert');
const UiGameStatusView = require('../js/uiGameStatusView');
const { runTest } = require('./helpers/test-utils');

runTest('UI game status viewは手番表示とroll/skip状態を純粋計算する', () => {
    assert.strictEqual(
        UiGameStatusView.buildTurnStatusText({ name: 'Alice', coins: 7 }),
        '👤 Aliceのターン　🪙 7コイン'
    );
    assert.deepStrictEqual(UiGameStatusView.buildRollButtonView(true), { disabled: false });
    assert.deepStrictEqual(UiGameStatusView.buildRollButtonView(false), { disabled: true });
    const built = UiGameStatusView.buildSkipButtonView({
        canNextTurn: true,
        pendingRenovation: 0,
        builtThisTurn: true,
    });
    assert.deepStrictEqual(built, { disabled: false, textContent: '建設完了・ターン終了' });
    assert.ok(Object.isFrozen(built));
    assert.deepStrictEqual(UiGameStatusView.buildSkipButtonView({
        canNextTurn: true,
        pendingRenovation: 1,
        builtThisTurn: false,
    }), { disabled: true, textContent: '建設しないでターン終了' });
});

runTest('UI game status viewは既存の二個・一個・未出目表示を選択する', () => {
    const pair = UiGameStatusView.selectDiceValues({ lastDice1: 2, lastDice2: 5, lastDiceResult: 7 });
    assert.deepStrictEqual(pair, [2, 5]);
    assert.ok(Object.isFrozen(pair));
    assert.deepStrictEqual(UiGameStatusView.selectDiceValues({ lastDice1: 0, lastDice2: 0, lastDiceResult: 4 }), [4]);
    assert.strictEqual(UiGameStatusView.selectDiceValues({ lastDice1: 0, lastDice2: 0, lastDiceResult: 0 }), null);
});

runTest('ゲーム稼働状況は操作可能・CPU・通信待ちを区別する', () => {
    const base = {
        hasGame: true,
        hasWinner: false,
        phase: 'roll',
        pendingPhase: 'pending',
        currentPlayerIndex: 0,
        currentName: 'Alice',
        isCpuTurn: false,
        isOnlineGame: false,
        myPlayerIndex: -1,
        isReconnecting: false,
        isReplaying: false,
        socketConnected: true,
        actionInFlight: false,
    };
    assert.deepStrictEqual(UiGameStatusView.buildActivityStatusView(base), {
        visible: true,
        identity: 'ready:0:roll',
        kind: 'ready',
        label: '操作できます',
        detail: 'ボタンを選んで進めてください',
        startedAt: 0,
    });
    assert.strictEqual(UiGameStatusView.buildActivityStatusView({
        ...base,
        phase: 'pending',
    }).label, '入力待ち：追加効果を選べます');
    const cpu = UiGameStatusView.buildActivityStatusView({
        ...base,
        currentPlayerIndex: 1,
        currentName: 'CPU 1',
        isCpuTurn: true,
        cpuHealth: { token: 4, activeStep: { stepExecutionId: 9, startedAt: 2000 } },
    });
    assert.strictEqual(cpu.label, 'CPU 1が処理中');
    assert.strictEqual(cpu.identity, 'cpu:1:9');
    assert.strictEqual(cpu.startedAt, 2000);
    const flight = UiGameStatusView.buildActivityStatusView({
        ...base,
        isOnlineGame: true,
        myPlayerIndex: 0,
        actionInFlight: true,
        actionStartedAt: 3000,
    });
    assert.strictEqual(flight.label, 'サーバーの応答待ち');
    assert.strictEqual(flight.startedAt, 3000);
    assert.strictEqual(UiGameStatusView.buildActivityStatusView({
        ...base,
        isReconnecting: true,
        actionInFlight: true,
    }).label, 'オンライン再接続中');
    assert.strictEqual(UiGameStatusView.buildActivityStatusView({
        ...base,
        isOnlineGame: true,
        myPlayerIndex: 1,
    }).label, '相手の操作待ち');
});

runTest('ゲーム稼働状況は10秒後に応答確認中と表示し秒数だけは再告知しない', () => {
    const controller = UiGameStatusView.createActivityStatusController({ checkingAfterMs: 10000 });
    const waiting = {
        visible: true,
        identity: 'cpu:1:4',
        kind: 'waiting',
        label: 'CPU 1が処理中',
        detail: '通常は数秒で進みます',
        startedAt: 1000,
    };
    assert.deepStrictEqual(controller.transition(waiting, 1000), {
        visible: true,
        kind: 'waiting',
        label: 'CPU 1が処理中',
        announceLabel: 'CPU 1が処理中',
        detail: '通常は数秒で進みます',
        elapsedText: '',
    });
    assert.strictEqual(controller.transition(waiting, 5000).announceLabel, '');
    assert.strictEqual(controller.transition(waiting, 5000).elapsedText, '・4秒');
    const checking = controller.transition(waiting, 11000);
    assert.strictEqual(checking.kind, 'checking');
    assert.strictEqual(checking.label, 'CPU 1が処理中（応答を確認中）');
    assert.strictEqual(checking.detail, '停止を検知した場合は自動復旧します');
    assert.strictEqual(controller.transition(waiting, 12000).announceLabel, '');
    controller.resumeAt(60000);
    const resumed = controller.transition(waiting, 60000);
    assert.strictEqual(resumed.kind, 'waiting');
    assert.strictEqual(resumed.elapsedText, '');
    assert.strictEqual(controller.transition({
        ...waiting,
        identity: 'cpu:1:5',
        startedAt: 12000,
    }, 12000).kind, 'waiting');
    controller.reset();
    assert.strictEqual(controller.transition({
        visible: true,
        identity: 'ready:0:roll',
        kind: 'ready',
        label: '操作できます',
        detail: '',
        startedAt: 0,
    }, 20000).elapsedText, '');
});

runTest('watchdog稼働状況は復旧中を確実に表示して成功・失敗後に通常表示へ戻る', () => {
    const base = Object.freeze({
        visible: true,
        kind: 'ready',
        label: '操作できます',
        announceLabel: '',
        detail: '',
        elapsedText: '',
    });
    const controller = UiGameStatusView.createWatchdogActivityController({
        minimumRecoveringMs: 500,
        recoveredVisibleMs: 1000,
        failedVisibleMs: 2000,
    });
    assert.strictEqual(controller.observe({ stage: 'recovering' }, 1000), true);
    assert.strictEqual(controller.observe({ stage: 'recovered' }, 1000), true);
    assert.strictEqual(controller.project(base, 1200).label, '停止を検知：自動復旧中');
    assert.strictEqual(controller.project(base, 1300).announceLabel, '');
    assert.strictEqual(controller.project(base, 1500).label, '自動復旧しました');
    assert.strictEqual(controller.project(base, 1600).announceLabel, '');
    const restored = controller.project(base, 2500);
    assert.strictEqual(restored.kind, 'ready');
    assert.strictEqual(restored.announceLabel, '操作できます');

    controller.observe({ stage: 'recovering' }, 3000);
    controller.observe({ stage: 'failed' }, 3000);
    assert.strictEqual(controller.project(base, 3500).kind, 'failed');
    assert.strictEqual(controller.project(base, 3500).detail, '画面を再読み込みするか、保存データから再開してください');
});


runTest('UI active game viewは手番遷移とコイン差分を入力非破壊で投影する', () => {
    const players = [{ name: 'Alice', coins: 7 }, { name: 'CPU', coins: 3 }];
    const previousCoins = [5, 3];
    const view = UiGameStatusView.buildActiveGameView({
        current: players[0],
        players,
        phase: 'roll',
        rollPhase: 'roll',
        currentPlayerIndex: 0,
        previousPlayerIndex: 1,
        currentTurnCount: 4,
        previousTurnCount: 3,
        previousPhase: 'build',
        isReplaying: false,
        currentName: 'Alice',
        isCpuTurn: false,
        canRoll: true,
        canNextTurn: false,
        pendingRenovation: 0,
        builtThisTurn: false,
        previousCoins,
        lastDice1: 2,
        lastDice2: 4,
        lastDiceResult: 6,
    });
    assert.strictEqual(view.statusText, '👤 Aliceのターン　🪙 7コイン');
    assert.deepStrictEqual(view.rollButton, { disabled: false });
    assert.deepStrictEqual(view.skipButton, {
        disabled: true,
        textContent: '建設しないでターン終了',
    });
    assert.deepStrictEqual(view.diceValues, [2, 4]);
    assert.deepStrictEqual(view.turnTransition, {
        announce: true,
        name: 'Alice',
        isCpuTurn: false,
        playerIndex: 0,
        nextPreviousPlayerIndex: 0,
        nextPreviousTurnCount: 4,
        nextPreviousPhase: 'roll',
    });
    assert.deepStrictEqual(view.coinChanges, [{ playerIndex: 0, diff: 2 }]);
    assert.strictEqual(view.coinChangeAnnouncement, 'Alice +2コイン');
    assert.deepStrictEqual(view.nextCoins, [7, 3]);
    assert.deepStrictEqual(previousCoins, [5, 3]);
    assert.ok(Object.isFrozen(view));
    assert.ok(Object.isFrozen(view.coinChanges));
    assert.ok(Object.isFrozen(view.coinChanges[0]));
});

runTest('UI coin change announcementはlocalの人間だけを1通知へ集約する', () => {
    const facts = {
        coinChanges: [
            { playerIndex: 0, diff: 3 },
            { playerIndex: 1, diff: -2 },
            { playerIndex: 2, diff: 5 },
        ],
        players: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'CPU' }],
        cpuPlayerIndexes: [2],
        isOnlineGame: false,
        myPlayerIndex: -1,
        isReplaying: false,
    };
    assert.strictEqual(
        UiGameStatusView.buildCoinChangeAnnouncement(facts),
        'Alice +3コイン、Bob -2コイン'
    );
    assert.strictEqual(UiGameStatusView.buildCoinChangeAnnouncement({
        ...facts,
        coinChanges: [{ playerIndex: 2, diff: 1 }],
    }), '');
});

runTest('UI coin change announcementはonline相手とreplayを通知しない', () => {
    const facts = {
        coinChanges: [
            { playerIndex: 0, diff: 3 },
            { playerIndex: 1, diff: -2 },
        ],
        players: [{ name: 'Alice' }, { name: 'Bob' }],
        cpuPlayerIndexes: [],
        isOnlineGame: true,
        myPlayerIndex: 0,
        isReplaying: false,
    };
    assert.strictEqual(
        UiGameStatusView.buildCoinChangeAnnouncement(facts),
        'Alice +3コイン'
    );
    assert.strictEqual(UiGameStatusView.buildCoinChangeAnnouncement({
        ...facts,
        coinChanges: [{ playerIndex: 1, diff: -2 }],
    }), '');
    assert.strictEqual(UiGameStatusView.buildCoinChangeAnnouncement({
        ...facts,
        isReplaying: true,
    }), '');
});

runTest('UI turn transitionは初回とreplayで告知せず既存index更新を維持する', () => {
    assert.deepStrictEqual(UiGameStatusView.buildTurnTransitionView({
        phase: 'roll',
        rollPhase: 'roll',
        currentPlayerIndex: 2,
        previousPlayerIndex: -1,
        currentTurnCount: 0,
        previousTurnCount: -1,
        previousPhase: '',
        isReplaying: false,
        currentName: 'Carol',
        isCpuTurn: true,
    }), {
        announce: false,
        name: 'Carol',
        isCpuTurn: true,
        playerIndex: 2,
        nextPreviousPlayerIndex: 2,
        nextPreviousTurnCount: 0,
        nextPreviousPhase: 'roll',
    });
    assert.strictEqual(UiGameStatusView.buildTurnTransitionView({
        phase: 'build',
        rollPhase: 'roll',
        currentPlayerIndex: 2,
        previousPlayerIndex: 1,
        currentTurnCount: 2,
        previousTurnCount: 1,
        previousPhase: 'roll',
        isReplaying: false,
        currentName: 'Carol',
        isCpuTurn: true,
    }).nextPreviousPlayerIndex, 1);
});

runTest('UI turn transitionは同じplayerのroll再入を追加ターンとして一度だけ告知する', () => {
    const extraTurn = UiGameStatusView.buildTurnTransitionView({
        phase: 'roll',
        rollPhase: 'roll',
        currentPlayerIndex: 0,
        previousPlayerIndex: 0,
        currentTurnCount: 3,
        previousTurnCount: 3,
        previousPhase: 'build',
        isReplaying: false,
        currentName: 'Alice',
        isCpuTurn: false,
    });
    assert.strictEqual(extraTurn.announce, true);
    assert.strictEqual(extraTurn.nextPreviousPhase, 'roll');

    assert.strictEqual(UiGameStatusView.buildTurnTransitionView({
        phase: 'roll',
        rollPhase: 'roll',
        currentPlayerIndex: 0,
        previousPlayerIndex: 0,
        currentTurnCount: 3,
        previousTurnCount: 3,
        previousPhase: 'roll',
        isReplaying: false,
        currentName: 'Alice',
        isCpuTurn: false,
    }).announce, false);

    assert.strictEqual(UiGameStatusView.buildTurnTransitionView({
        phase: 'roll',
        rollPhase: 'roll',
        currentPlayerIndex: 0,
        previousPlayerIndex: 0,
        currentTurnCount: 3,
        previousTurnCount: 3,
        previousPhase: 'build',
        isReplaying: true,
        currentName: 'Alice',
        isCpuTurn: false,
    }).announce, false);
});
