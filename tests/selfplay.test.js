const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    loadRuntime,
    createPlayers,
    createShopStock,
    playCpuStep,
    simulateGame,
    simulateGameLightweight,
    collectBuildDiagnostics,
    runSeries,
    runDifficultyLadder,
    comparePresets,
    createBusinessStatsBucket,
    resolveBusinessMoveCards,
    recordBusinessStat,
    listLegalActions,
    parseArgs,
    printSeries,
    printPresetComparison,
    printDifficultyLadder,
} = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));

runTest('selfplayはlive強CPUの性能方針を評価用optionで明示できる', () => {
    const players = createPlayers(loadRuntime(), ['strong', 'normal'], {
        strongSimulationMode: 'realtime',
    });
    assert.strictEqual(players[0].simulationMode, 'realtime');
    assert.notStrictEqual(players[1].simulationMode, 'realtime');
});

function loadMultiplayerRlModel() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'models', 'rl_model', 'portfolio', 'seed103-4p.browser.json'), 'utf8'));
}

function loadTwoPlayerRlModel() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'models', 'rl_model', 'portfolio', 'seed71-top3.browser.json'), 'utf8'));
}

runTest('playCpuStep は CPU pending helper の fallback business を trace 付きで使う', () => {
    const runtime = loadRuntime();
    const game = new runtime.GameManager(2);
    game.phase = runtime.GAME_PHASES.PENDING;
    game.pendingBusiness = 1;
    game.currentPlayer().cards = [runtime.createCardByName('ビジネスセンター'), runtime.createCardByName('麦畑')];
    game.players[1].cards = [runtime.createCardByName('森林')];
    const cpu = new runtime.CPU('normal');
    cpu.chooseBusinessMove = () => ({ myCard: 99, targetIndex: 1, theirCard: 99 });
    const traceEntries = [];
    runtime.__selfplayOptions = {
        traceEntries,
        businessStats: {},
        cpuPlayers: [cpu, new runtime.CPU('normal')],
    };

    playCpuStep(runtime, game, cpu, createShopStock(runtime.CARDS), () => 0.5);

    assert.strictEqual(game.pendingBusiness, 0);
    assert.ok(game.currentPlayer().cards.some(card => card.name === '森林'));
    assert.strictEqual(traceEntries.length, 1);
    assert.ok(traceEntries[0].chosenAction.label.startsWith('BUSINESS:'));
    assert.ok(traceEntries[0].after);
    assert.strictEqual(runtime.__selfplayOptions.businessStats.normal.total, 1);
});

runTest('simulateGame は CPU 同士の試合を最後まで進められる', () => {
    const result = simulateGame({
        difficulties: ['expert', 'strong', 'normal'],
        seed: 42,
        maxSteps: 3000,
        expertPreset: 'rush',
        lite: true,
    });

    assert.strictEqual(result.exhausted, false);
    assert.ok(result.winner >= 0);
    assert.ok(result.turns > 0);
    assert.strictEqual(result.expertPreset, 'rush');
    assert.strictEqual(result.finalState.length, 3);
    assert.ok(typeof result.finalState[0].coins === 'number');
    assert.ok(Array.isArray(result.finalState[0].builtLandmarks));
});

runTest('simulateGame は5人以上の rule-based CPU 試合を最後まで進められる', () => {
    const result = simulateGame({
        difficulties: ['expert', 'strong', 'normal', 'weak', 'expert'],
        seed: 52,
        maxSteps: 5000,
        expertPurpose: 'live',
        expertPreset: 'v2simple',
        lite: true,
    });

    assert.strictEqual(result.exhausted, false);
    assert.ok(result.winner >= 0);
    assert.strictEqual(result.finalState.length, 5);
});

runTest('simulateGame は5人以上のrl混在lineupをrlとして進める', () => {
    const result = simulateGame({
        difficulties: ['rl', 'strong', 'normal', 'weak', 'expert'],
        seed: 53,
        maxSteps: 5000,
        rlModelData: loadMultiplayerRlModel(),
        expertPurpose: 'live',
        expertPreset: 'v2simple',
        lite: true,
    });

    assert.strictEqual(result.exhausted, false);
    assert.ok(result.winner >= 0);
    assert.strictEqual(result.finalState.length, 5);
    assert.strictEqual(result.difficulties[0], 'rl');
});

runTest('simulateGame は4人以下のrl混在lineupをrlとして進める', () => {
    const result = simulateGame({
        difficulties: ['rl', 'strong', 'normal', 'weak'],
        seed: 54,
        maxSteps: 5000,
        rlModelData: loadMultiplayerRlModel(),
        expertPurpose: 'live',
        expertPreset: 'v2simple',
        lite: true,
    });

    assert.strictEqual(result.exhausted, false);
    assert.ok(result.winner >= 0);
    assert.strictEqual(result.finalState.length, 4);
    assert.strictEqual(result.difficulties[0], 'rl');
});

runTest('simulateGame は2人用rlモデルの3人以上lineupを拒否する', () => {
    assert.throws(() => simulateGame({
        difficulties: ['rl', 'normal', 'strong'],
        seed: 56,
        maxSteps: 10,
        rlModelData: loadTwoPlayerRlModel(),
        lite: true,
    }), /2-player RL model/);
});

runTest('listLegalActions はRLの商店街ターゲットhead選択を合法手へ反映する', () => {
    const runtime = loadRuntime();
    const model = loadMultiplayerRlModel();
    const cpu = new runtime.RLCPU(model);
    cpu.numTargetSlots = 3;
    cpu._targetLayerForKind = (kind) => kind === 'business' ? {} : null;
    cpu._selectTargetIndex = () => 1;
    const game = new runtime.GameManager(3);
    game.phase = runtime.GAME_PHASES.PENDING;
    game.pendingBusiness = 1;
    game.currentPlayerIndex = 0;
    game.players[0].cards = [runtime.createCardByName('麦畑')];
    game.players[1].cards = [runtime.createCardByName('カフェ')];
    game.players[2].cards = [runtime.createCardByName('パン屋')];

    const selectedTarget = 1;
    const selectedCard = game.players[selectedTarget].cards[0].name;
    const otherIndex = selectedTarget === 1 ? 2 : 1;
    const otherCard = game.players[otherIndex].cards[0].name;
    const labels = listLegalActions(runtime, game, createShopStock(runtime.CARDS), cpu).map(action => action.label);

    assert.ok(labels.includes(`BUSINESS:麦畑->${selectedCard}`));
    assert.ok(!labels.includes(`BUSINESS:麦畑->${otherCard}`));
});

runTest('simulateGameLightweight は10人rule-based lineupで例外なく進む', () => {
    const result = simulateGameLightweight({
        difficulties: ['expert', 'strong', 'normal', 'weak', 'expert', 'strong', 'normal', 'weak', 'expert', 'strong'],
        seed: 55,
        maxSteps: 500,
        expertPurpose: 'live',
        expertPreset: 'v2simple',
        includeRL: false,
        lite: true,
    });

    assert.strictEqual(result.difficulties.length, 10);
    assert.ok(result.turns > 0);
    assert.strictEqual(result.finalState, null);
});

runTest('simulateGameLightweight は5人以上の大施設初期在庫を人数分にする', () => {
    const runtime = loadRuntime({ includeRL: false });
    const stock = createShopStock(runtime.CARDS, 10, runtime);
    assert.strictEqual(stock['スタジアム'], 10);
    assert.strictEqual(stock['テレビ局'], 10);
});

runTest('simulateGameLightweight は軽量経路で試合を最後まで進められる', () => {
    const result = simulateGameLightweight({
        difficulties: ['expert', 'weak'],
        seed: 21,
        maxSteps: 3000,
        expertPurpose: 'live',
        includeRL: false,
        lite: true,
    });

    assert.strictEqual(result.exhausted, false);
    assert.ok(result.winner >= 0);
    assert.ok(result.turns > 0);
    assert.strictEqual(result.finalState, null);
});

runTest('simulateGame は includeBuildDiagnostics 指定時だけexpert build診断をtraceへ追加する', () => {
    const traceEntries = [];
    simulateGame({
        difficulties: ['expert', 'weak'],
        seed: 3,
        maxSteps: 120,
        lite: true,
        traceEntries,
        includeBuildDiagnostics: true,
    });

    const buildTrace = traceEntries.find(entry =>
        entry.actorDifficulty === 'expert' &&
        entry.chosenAction &&
        ['BUY_CARD:', 'BUY_LM:', 'PASS'].some(prefix => entry.chosenAction.label.startsWith(prefix)) &&
        entry.buildDiagnostics
    );
    assert.ok(buildTrace);
    assert.strictEqual(buildTrace.buildDiagnostics.diagnosticSource, '_listExpertBuildOptions/_scoreExpertBuildOption');
    assert.strictEqual(buildTrace.buildDiagnostics.mode, 'generic');
    assert.strictEqual(typeof buildTrace.buildDiagnostics.coins, 'number');
    assert.ok(Array.isArray(buildTrace.buildDiagnostics.affordableLandmarks));
    assert.ok(Array.isArray(buildTrace.buildDiagnostics.buildOptions));
    assert.ok(buildTrace.buildDiagnostics.chosenBuildAction);
    assert.strictEqual(buildTrace.buildDiagnostics.buildActionLabel, buildTrace.buildDiagnostics.chosenBuildAction.label);

    const defaultTraceEntries = [];
    simulateGame({
        difficulties: ['expert', 'weak'],
        seed: 3,
        maxSteps: 120,
        lite: true,
        traceEntries: defaultTraceEntries,
    });
    assert.ok(defaultTraceEntries.every(entry => !('buildDiagnostics' in entry)));
});

runTest('collectBuildDiagnostics はv2simpleで買えるランドマークだけを診断候補にする', () => {
    const runtime = loadRuntime({ includeRL: false });
    const game = new runtime.GameManager(2);
    game.enabledLandmarks = new Set(runtime.Player.landmarkNames());
    game.currentPlayer().coins = 4;
    const cpu = new runtime.CPU('expert', { expertPreset: 'v2simple' });
    const diagnostics = collectBuildDiagnostics(runtime, game, createShopStock(runtime.CARDS), cpu);
    assert.strictEqual(diagnostics.diagnosticSource, 'v2simple-landmark-options');
    assert.strictEqual(diagnostics.mode, 'v2simple');
    assert.strictEqual(diagnostics.landmarkDelayContext.nearestLandmark, '港');
    assert.strictEqual(diagnostics.landmarkDelayContext.shortfallBefore, 0);
    assert.ok(diagnostics.buildOptions.length > 0);
    assert.ok(diagnostics.buildOptions.every(option => option.type === 'landmark'));
    assert.ok(diagnostics.buildOptions.every(option => option.score === null));
});

runTest('collectBuildDiagnostics はv2simpleでランドマーク目前の購入遅延を診断する', () => {
    const runtime = loadRuntime({ includeRL: false });
    const game = new runtime.GameManager(2);
    game.enabledLandmarks = new Set([runtime.LANDMARK_NAMES.STATION]);
    game.currentPlayer().coins = 3;
    const cpu = new runtime.CPU('expert', { expertPreset: 'v2simple' });
    const diagnostics = collectBuildDiagnostics(runtime, game, createShopStock(runtime.CARDS), cpu);
    const bakery = diagnostics.buildOptions.find(option => option.label === 'BUY_CARD:パン屋');
    assert.ok(bakery);
    assert.strictEqual(diagnostics.landmarkDelayContext.nearestLandmark, runtime.LANDMARK_NAMES.STATION);
    assert.strictEqual(diagnostics.landmarkDelayContext.shortfallBefore, 1);
    assert.strictEqual(bakery.landmarkDelayPreview.cardCost, 1);
    assert.strictEqual(bakery.landmarkDelayPreview.shortfallAfter, 2);
    assert.strictEqual(bakery.landmarkDelayPreview.delayCoins, 1);
    assert.strictEqual(bakery.landmarkDelayPreview.wouldTrigger, true);
});

runTest('collectBuildDiagnostics はv2simpleでカード候補をbreakdown付きで診断する', () => {
    const runtime = loadRuntime({ includeRL: false });
    const game = new runtime.GameManager(2);
    game.enabledLandmarks = new Set(runtime.Player.landmarkNames());
    game.currentPlayer().coins = 1;
    const cpu = new runtime.CPU('expert', { expertPreset: 'v2simple' });
    const diagnostics = collectBuildDiagnostics(runtime, game, createShopStock(runtime.CARDS), cpu);
    assert.strictEqual(diagnostics.diagnosticSource, 'v2simple-card-breakdown');
    assert.strictEqual(diagnostics.mode, 'v2simple');
    assert.strictEqual(diagnostics.affordableLandmarks.length, 0);
    assert.strictEqual(typeof diagnostics.preEv, 'number');
    assert.strictEqual(typeof diagnostics.landmarkDelayContext.remainingLandmarks, 'number');
    assert.strictEqual(diagnostics.nearTie.threshold, 0.25);
    assert.ok(Array.isArray(diagnostics.nearTie.tiedOptions));
    assert.ok(diagnostics.buildOptions.length > 0);
    assert.ok(diagnostics.buildOptions.every(option => option.type === 'card'));
    assert.ok(diagnostics.buildOptions.every(option => option.breakdown));
    assert.ok(diagnostics.buildOptions.every(option => option.score === option.breakdown.total));
    assert.ok(diagnostics.buildOptions.every(option => option.deltaScore === option.breakdown.deltaTotal));
    assert.ok(diagnostics.buildOptions.every(option => option.landmarkDelayPreview));
    for (const option of diagnostics.buildOptions) {
        assert.strictEqual(option.breakdown.preEv, diagnostics.preEv);
        assert.strictEqual(option.breakdown.postEv, option.breakdown.baseEv);
        assert.ok(Math.abs(option.breakdown.deltaEv - (option.breakdown.postEv - option.breakdown.preEv)) < 1e-9);
        const expectedDeltaTotal = option.breakdown.deltaEv +
            option.breakdown.comboUnlockBonus +
            option.breakdown.tempoBonus +
            (option.breakdown.redOpponentTurnBonus || 0) -
            (option.breakdown.renovationRiskPenalty || 0) +
            (option.breakdown.portfolioBonus || 0);
        assert.ok(Math.abs(option.breakdown.deltaTotal - expectedDeltaTotal) < 1e-9);
        assert.strictEqual(option.landmarkDelayPreview.remainingLandmarks, diagnostics.landmarkDelayContext.remainingLandmarks);
        assert.strictEqual(option.landmarkDelayPreview.coinsBefore, diagnostics.landmarkDelayContext.coinsBefore);
        assert.strictEqual(option.landmarkDelayPreview.cardCost, option.cost);
        assert.strictEqual(option.landmarkDelayPreview.delayCoins, Math.max(0, option.landmarkDelayPreview.shortfallAfter - option.landmarkDelayPreview.shortfallBefore));
    }
});

runTest('collectBuildDiagnostics は休業中の大施設を重複購入候補にしない', () => {
    const runtime = loadRuntime({ includeRL: false });
    const game = new runtime.GameManager(2);
    game.enabledLandmarks = new Set();
    const current = game.currentPlayer();
    current.coins = 7;
    const tv = runtime.createCardByName('テレビ局');
    current.cards = [tv];
    current.makeDormant(tv);
    const cpu = new runtime.CPU('expert', { expertPreset: 'v2simple' });
    const diagnostics = collectBuildDiagnostics(runtime, game, createShopStock(runtime.CARDS), cpu);

    assert.strictEqual(diagnostics.diagnosticSource, 'v2simple-card-breakdown');
    assert.ok(!diagnostics.buildOptions.some(option => option.label === 'BUY_CARD:テレビ局'));
});

runTest('collectBuildDiagnostics は相手の即勝利脅威を診断する', () => {
    const runtime = loadRuntime({ includeRL: false });
    const game = new runtime.GameManager(2);
    game.enabledLandmarks = new Set([runtime.LANDMARK_NAMES.AIRPORT]);
    game.currentPlayer().coins = 7;
    game.players[1].coins = 30;
    for (const name of runtime.Player.landmarkNames()) {
        game.players[1].landmarks[name] = name !== runtime.LANDMARK_NAMES.AIRPORT;
    }
    const cpu = new runtime.CPU('expert', { expertPreset: 'v2simple' });
    const diagnostics = collectBuildDiagnostics(runtime, game, createShopStock(runtime.CARDS), cpu);
    assert.strictEqual(diagnostics.diagnosticSource, 'v2simple-card-breakdown');
    assert.strictEqual(diagnostics.opponentWinThreats.length, 1);
    const threat = diagnostics.opponentWinThreats[0];
    assert.strictEqual(threat.playerIndex, 1);
    assert.strictEqual(threat.canWinNow, true);
    assert.strictEqual(threat.nearestWinLandmark, runtime.LANDMARK_NAMES.AIRPORT);
    assert.strictEqual(threat.nearestWinLandmarkCost, 30);
    assert.strictEqual(threat.shortfallToWin, 0);
    assert.deepStrictEqual(threat.affordableWinningLandmarks, [{ name: runtime.LANDMARK_NAMES.AIRPORT, cost: 30 }]);
});

runTest('collectBuildDiagnostics はコイン不足の相手を即勝利脅威にしない', () => {
    const runtime = loadRuntime({ includeRL: false });
    const game = new runtime.GameManager(2);
    game.enabledLandmarks = new Set([runtime.LANDMARK_NAMES.AIRPORT]);
    game.currentPlayer().coins = 7;
    game.players[1].coins = 29;
    for (const name of runtime.Player.landmarkNames()) {
        game.players[1].landmarks[name] = name !== runtime.LANDMARK_NAMES.AIRPORT;
    }
    const cpu = new runtime.CPU('expert', { expertPreset: 'v2simple' });
    const diagnostics = collectBuildDiagnostics(runtime, game, createShopStock(runtime.CARDS), cpu);
    const threat = diagnostics.opponentWinThreats[0];
    assert.strictEqual(threat.canWinNow, false);
    assert.strictEqual(threat.shortfallToWin, 1);
    assert.deepStrictEqual(threat.affordableWinningLandmarks, []);
});

runTest('collectBuildDiagnostics はコイン妨害カードの即勝利遅延を診断する', () => {
    const runtime = loadRuntime({ includeRL: false });
    const game = new runtime.GameManager(2);
    game.enabledLandmarks = new Set([runtime.LANDMARK_NAMES.AIRPORT]);
    game.currentPlayer().coins = 7;
    game.players[1].coins = 30;
    for (const name of runtime.Player.landmarkNames()) {
        game.players[1].landmarks[name] = name !== runtime.LANDMARK_NAMES.AIRPORT;
    }
    const cpu = new runtime.CPU('expert', { expertPreset: 'v2simple' });
    const diagnostics = collectBuildDiagnostics(runtime, game, createShopStock(runtime.CARDS), cpu);
    const tv = diagnostics.buildOptions.find(option => option.label === 'BUY_CARD:テレビ局');
    assert.ok(tv);
    assert.strictEqual(tv.disruptionPreview.isDisruptionCard, true);
    assert.strictEqual(tv.disruptionPreview.canDelayImmediateWin, true);
    assert.strictEqual(tv.disruptionPreview.targetableThreatCount, 1);
    assert.deepStrictEqual(tv.disruptionPreview.affectedThreats, [1]);

    const renovation = diagnostics.buildOptions.find(option => option.label === 'BUY_CARD:改装屋');
    assert.ok(renovation);
    assert.strictEqual(renovation.disruptionPreview.isDisruptionCard, true);
    assert.strictEqual(renovation.disruptionPreview.canDelayImmediateWin, false);
});

runTest('collectBuildDiagnostics は非finite scoreをnullへ正規化する', () => {
    const runtime = loadRuntime({ includeRL: false });
    const game = new runtime.GameManager(2);
    game.enabledLandmarks = new Set(runtime.Player.landmarkNames());
    game.currentPlayer().coins = 100;
    const cpu = {
        difficulty: 'expert',
        _listExpertBuildOptions() {
            return [
                { type: 'card', cardName: 'パン屋' },
                { type: 'landmark', name: '空港' },
            ];
        },
        _scoreExpertBuildOption(subject, stock, option) {
            return option.type === 'card' ? Infinity : 3;
        },
    };
    const diagnostics = collectBuildDiagnostics(runtime, game, createShopStock(runtime.CARDS), cpu);
    assert.strictEqual(diagnostics.diagnosticSource, '_listExpertBuildOptions/_scoreExpertBuildOption');
    assert.strictEqual(diagnostics.buildOptions.find(option => option.label === 'BUY_CARD:パン屋').score, null);
    assert.strictEqual(diagnostics.buildOptions.find(option => option.label === 'BUY_LM:空港').score, 3);
});

runTest('runSeries は難易度ごとの勝利数を集計する', () => {
    const result = runSeries({
        games: 3,
        seed: 10,
        maxSteps: 3000,
        players: ['expert', 'strong'],
        expertPreset: 'economy',
        lite: true,
    });

    assert.strictEqual(result.games, 3);
    assert.strictEqual(result.wins.expert + result.wins.strong, 3);
    assert.strictEqual(result.seatWins.length, 2);
    assert.strictEqual(result.matchLog.length, 3);
    assert.ok(typeof result.matchLog[0].seed === 'number');
    assert.strictEqual(result.matchLog[0].expertPreset, 'economy');
    assert.strictEqual(result.matchLog[0].finalState.length, 2);
    assert.ok(Array.isArray(result.matchLog[0].finalState[0].topCards));
    assert.strictEqual(result.buildStats.length, 2);
    assert.ok(typeof result.buildStats[0].total === 'number');
    assert.ok(result.businessStats);
});

runTest('runSeries は games/maxSteps の 0 指定を既定値で上書きしない', () => {
    const result = runSeries({
        games: 0,
        seed: 0,
        maxSteps: 0,
        players: ['expert', 'weak'],
        includeRL: false,
    });

    assert.strictEqual(result.games, 0);
    assert.strictEqual(result.wins.expert + result.wins.weak, 0);
    assert.deepStrictEqual(result.matchLog, []);
});

runTest('runSeries は席ローテーション後もbuildStatsByDifficultyを難易度別に集計する', () => {
    const result = runSeries({
        games: 2,
        seed: 18,
        maxSteps: 1000,
        players: ['rl', 'weak'],
        rlModelData: loadTwoPlayerRlModel(),
        lite: true,
    });

    assert.ok(result.buildStatsByDifficulty.rl);
    assert.ok(result.buildStatsByDifficulty.weak);
    const seatTotal = result.buildStats.reduce((sum, stats) => sum + stats.total, 0);
    const difficultyTotal = Object.values(result.buildStatsByDifficulty)
        .reduce((sum, stats) => sum + stats.total, 0);
    assert.strictEqual(difficultyTotal, seatTotal);
    assert.ok(result.buildStatsByDifficulty.rl.total > 0);
});

runTest('runSeries は軽量収集モードで重いログを省略できる', () => {
    const result = runSeries({
        games: 2,
        seed: 4,
        maxSteps: 2000,
        players: ['expert', 'weak'],
        lite: true,
        includeRL: false,
        collectMatchLog: false,
        collectBuildStats: false,
        collectBusinessStats: false,
        includeFinalState: false,
    });

    assert.strictEqual(result.games, 2);
    assert.strictEqual(result.wins.expert + result.wins.weak, 2);
    assert.strictEqual(result.seatWins.length, 2);
    assert.deepStrictEqual(result.matchLog, []);
    assert.deepStrictEqual(result.buildStats, []);
    assert.deepStrictEqual(result.businessStats, {});
    assert.ok(result.averageTurns > 0);
});

runTest('runSeries は lightweightCpuOnly で軽量対局経路を使える', () => {
    const result = runSeries({
        games: 2,
        seed: 6,
        maxSteps: 2000,
        players: ['expert', 'weak'],
        lite: true,
        includeRL: false,
        lightweightCpuOnly: true,
        collectMatchLog: false,
        collectBuildStats: false,
        collectBusinessStats: false,
        includeFinalState: false,
        expertPurpose: 'live',
    });

    assert.strictEqual(result.games, 2);
    assert.strictEqual(result.wins.expert + result.wins.weak, 2);
    assert.deepStrictEqual(result.matchLog, []);
    assert.ok(result.averageTurns > 0);
});

runTest('loadRuntime は RLCPU を省略して読み込める', () => {
    const runtime = loadRuntime({ includeRL: false });
    assert.ok(runtime.CPU);
    assert.ok(runtime.GameManager);
    assert.strictEqual(runtime.RLCPU, undefined);
    assert.strictEqual(runtime.LANDMARK_NAMES.STATION, '駅');
});

runTest('recordBusinessStat はdifficulty別に交換内容を集計する', () => {
    const options = {
        businessStats: {},
        cpuPlayers: [{ difficulty: 'rl' }, { difficulty: 'normal' }],
    };
    const game = { currentPlayerIndex: 0 };
    recordBusinessStat(
        game,
        { difficulty: 'rl' },
        options,
        { targetIndex: 1 },
        { name: '麦畑' },
        { name: 'パン屋' }
    );
    assert.strictEqual(options.businessStats.rl.total, 1);
    assert.strictEqual(options.businessStats.rl.targets.normal, 1);
    assert.strictEqual(options.businessStats.rl.giveCards['麦畑'], 1);
    assert.strictEqual(options.businessStats.rl.takeCards['パン屋'], 1);
    assert.strictEqual(options.businessStats.rl.exchanges['麦畑->パン屋'], 1);

    const empty = createBusinessStatsBucket();
    assert.strictEqual(empty.total, 0);
    assert.deepStrictEqual(empty.exchanges, {});
});

runTest('resolveBusinessMoveCards はRLのカード名参照を解決する', () => {
    const game = {
        currentPlayerIndex: 0,
        players: [
            { cards: [{ name: '麦畑' }, { name: 'パン屋' }] },
            { cards: [{ name: '牧場' }, { name: '森林' }] },
        ],
        currentPlayer() {
            return this.players[this.currentPlayerIndex];
        },
    };
    const result = resolveBusinessMoveCards(game, {
        myCard: 'パン屋',
        targetIndex: 1,
        theirCard: '森林',
    });
    assert.strictEqual(result.giveCard.name, 'パン屋');
    assert.strictEqual(result.takeCard.name, '森林');
});

runTest('runDifficultyLadder は難易度差確認向けの対戦セットを返す', () => {
    const result = runDifficultyLadder({
        games: 1,
        seed: 3,
        maxSteps: 3000,
        lite: true,
    });

    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result[0].players, ['normal', 'weak']);
    assert.deepStrictEqual(result[1].players, ['strong', 'normal']);
    assert.deepStrictEqual(result[2].players, ['expert', 'strong']);
    assert.strictEqual(result[0].result.games, 1);
});

runTest('parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '12', '--seed', '5', '--max-steps', '9000', '--format', 'json', '--details', '--ladder', '--fast', '--expert-preset', 'rush', '--compare-presets', 'default,rush', 'expert', 'strong']);

    assert.strictEqual(args.games, 12);
    assert.strictEqual(args.seed, 5);
    assert.strictEqual(args.maxSteps, 9000);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.details, true);
    assert.strictEqual(args.ladder, true);
    assert.strictEqual(args.fast, true);
    assert.strictEqual(args.expertPreset, 'rush');
    assert.deepStrictEqual(args.comparePresets, ['default', 'rush']);
    assert.deepStrictEqual(args.players, ['expert', 'strong']);
});

runTest('parseArgs は games/seed/maxSteps の 0 指定を保持する', () => {
    const args = parseArgs(['--games', '0', '--seed', '0', '--max-steps', '0']);

    assert.strictEqual(args.games, 0);
    assert.strictEqual(args.seed, 0);
    assert.strictEqual(args.maxSteps, 0);
});

runTest('comparePresets は複数プリセットの集計を返す', () => {
    const comparisons = comparePresets({
        games: 1,
        seed: 1,
        maxSteps: 3000,
        players: ['expert', 'strong'],
        comparePresets: ['default', 'rush'],
        format: 'text',
        details: false,
        lite: true,
    });

    assert.strictEqual(comparisons.length, 2);
    assert.strictEqual(comparisons[0].preset, 'default');
    assert.strictEqual(comparisons[1].preset, 'rush');
    assert.strictEqual(comparisons[0].result.games, 1);
});

runTest('simulateGame は expert 指定なしでも default を既定プリセットとして使える', () => {
    const result = simulateGame({
        difficulties: ['expert', 'strong'],
        seed: 7,
        maxSteps: 3000,
        lite: true,
    });

    assert.strictEqual(result.expertPreset, 'default');
    assert.strictEqual(result.expertPurpose, 'training');
    const runtime = loadRuntime();
    const cpu = new runtime.CPU('expert');
    assert.strictEqual(cpu.expertPreset, 'default');
    assert.strictEqual(cpu.expertPurpose, 'training');
    assert.strictEqual(cpu.expertBehaviorFlags.crowdBuildLookahead, true);
    assert.strictEqual(cpu.expertBehaviorFlags.futureLandmarkHold, true);
    assert.strictEqual(cpu.expertBehaviorFlags.lookaheadLeaderStrongOnly, true);
});

runTest('simulateGame は人数別 expert tuning を受け渡せる', () => {
    const result = simulateGame({
        difficulties: ['expert', 'strong', 'strong', 'normal'],
        seed: 11,
        maxSteps: 3000,
        lite: true,
        expertProfileTunings: {
            crowd: { lookaheadWeight: 0.42 },
        },
    });

    assert.strictEqual(result.expertProfileTunings.crowd.lookaheadWeight, 0.42);
});

runTest('simulateGame は expert behavior flags を受け渡せる', () => {
    const result = simulateGame({
        difficulties: ['expert', 'normal', 'normal', 'normal'],
        seed: 12,
        maxSteps: 3000,
        lite: true,
        expertBehaviorFlags: {
            premiumPurpleGate: true,
            endgameBuildFocus: true,
            diceCloserDiscipline: true,
        },
    });

    assert.strictEqual(result.expertBehaviorFlags.premiumPurpleGate, true);
    assert.strictEqual(result.expertBehaviorFlags.endgameBuildFocus, true);
    assert.strictEqual(result.expertBehaviorFlags.diceCloserDiscipline, true);
});

runTest('simulateGame は fast モード指定を結果に保持する', () => {
    const result = simulateGame({
        difficulties: ['expert', 'strong', 'strong', 'normal'],
        seed: 11,
        maxSteps: 6000,
        fast: true,
    });

    assert.strictEqual(result.fast, true);
});

runTest('simulateGame は lite モード指定を結果に保持する', () => {
    const result = simulateGame({
        difficulties: ['expert', 'strong', 'strong', 'normal'],
        seed: 11,
        maxSteps: 6000,
        lite: true,
    });

    assert.strictEqual(result.lite, true);
});

runTest('simulateGame は maxSteps 到達時に exhausted を返す', () => {
    const result = simulateGame({
        difficulties: ['expert', 'strong'],
        seed: 3,
        maxSteps: 1,
    });

    assert.strictEqual(result.exhausted, true);
    assert.strictEqual(result.winner, -1);
});

runTest('parseArgs はプレイヤー未指定時に既定 lineup を使う', () => {
    const args = parseArgs([]);
    assert.deepStrictEqual(args.players, ['expert', 'strong', 'strong', 'normal']);
    assert.strictEqual(args.comparePresets, null);
});

runTest('parseArgs は lite フラグを解釈する', () => {
    const args = parseArgs(['--lite']);
    assert.strictEqual(args.lite, true);
});

runTest('parseArgs は expert behavior flags を解釈する', () => {
    const args = parseArgs(['--expert-flags', '{"crowdBuildLookahead":true}']);
    assert.strictEqual(args.expertBehaviorFlags.crowdBuildLookahead, true);
});

runTest('printSeries は text/details 形式で明細を出力する', () => {
    const lines = [];
    const realLog = console.log;
    console.log = (line) => lines.push(line);
    try {
        printSeries({
            games: 1,
            players: ['expert', 'strong'],
            wins: { expert: 1, strong: 0 },
            seatWins: [1, 0],
            averageTurns: 12.5,
            exhausted: 0,
            matchLog: [{
                game: 1,
                seed: 7,
                lineup: ['expert', 'strong'],
                winnerDifficulty: 'expert',
                turns: 12,
                exhausted: false,
                expertPreset: 'default',
                finalState: [{
                    coins: 9,
                    builtLandmarkCount: 1,
                    builtLandmarks: ['駅'],
                    missingLandmarks: ['ショッピングモール'],
                    topCards: [{ name: '麦畑', count: 2 }],
                }, {
                    coins: 3,
                    builtLandmarkCount: 0,
                    builtLandmarks: [],
                    missingLandmarks: ['駅', 'ショッピングモール'],
                    topCards: [],
                }],
            }],
        }, { format: 'text', details: true, expertPreset: 'default' });
    } finally {
        console.log = realLog;
    }

    assert.ok(lines.some(line => String(line).includes('games=1 players=expert,strong expertPreset=default')));
    assert.ok(lines.some(line => String(line).includes('expert: 1 wins (100.0%)')));
    assert.ok(lines.some(line => String(line).includes('game=1 seed=7 lineup=expert,strong winner=expert')));
    assert.ok(lines.some(line => String(line).includes('p1=expert coins=9')));
});

runTest('printSeries は json 形式で結果をそのまま出力する', () => {
    const lines = [];
    const realLog = console.log;
    console.log = (line) => lines.push(line);
    try {
        printSeries({ games: 1, wins: { expert: 1 } }, { format: 'json' });
    } finally {
        console.log = realLog;
    }

    assert.strictEqual(JSON.parse(lines[0]).games, 1);
});

runTest('printPresetComparison は text 形式で各 preset を出力する', () => {
    const lines = [];
    const realLog = console.log;
    console.log = (line) => lines.push(line);
    try {
        printPresetComparison([
            {
                preset: 'default',
                result: {
                    games: 1,
                    players: ['expert', 'strong'],
                    wins: { expert: 1, strong: 0 },
                    seatWins: [1, 0],
                    averageTurns: 10,
                    exhausted: 0,
                    matchLog: [],
                },
            },
            {
                preset: 'rush',
                result: {
                    games: 1,
                    players: ['expert', 'strong'],
                    wins: { expert: 0, strong: 1 },
                    seatWins: [0, 1],
                    averageTurns: 9,
                    exhausted: 0,
                    matchLog: [],
                },
            },
        ], { format: 'text' });
    } finally {
        console.log = realLog;
    }

    assert.ok(lines.some(line => String(line).includes('expertPreset=default')));
    assert.ok(lines.some(line => String(line).includes('expertPreset=rush')));
});

runTest('printDifficultyLadder は各対戦セットを text で出力する', () => {
    const lines = [];
    const realLog = console.log;
    console.log = (line) => lines.push(line);
    try {
        printDifficultyLadder([
            {
                players: ['normal', 'weak'],
                result: {
                    games: 1,
                    players: ['normal', 'weak'],
                    wins: { normal: 1, weak: 0 },
                    seatWins: [1, 0],
                    averageTurns: 10,
                    exhausted: 0,
                    matchLog: [],
                },
            },
        ], { format: 'text' });
    } finally {
        console.log = realLog;
    }

    assert.ok(lines.some(line => String(line).includes('players=normal,weak')));
});

if (process.exitCode) {
    throw new Error('selfplayテストで失敗が発生しました');
}
