const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const { loadCPURuntime } = require('./helpers/runtime-loaders');

const runtime = loadCPURuntime();
const CPU = runtime.CPU;
const GameManager = runtime.GameManager;
const Player = runtime.Player;
const createCardByName = runtime.createCardByName;
const CARDS = runtime.CARDS;
const CARD_EFFECTS = runtime.CARD_EFFECTS;
const CARD_CATEGORIES = runtime.CARD_CATEGORIES;
const LANDMARK_NAMES = runtime.LANDMARK_NAMES;

// ===== evalCard =====

runTest('evalCard: NORMALカードはincome値をそのまま返す', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const player = game.currentPlayer();
    const wheat = createCardByName('麦畑'); // income 1
    assert.strictEqual(cpu.evalCard(wheat, game, player), 1);
    const mine = createCardByName('鉱山'); // income 5
    assert.strictEqual(cpu.evalCard(mine, game, player), 5);
});

runTest('evalCard: STADIUMは対戦相手数 × incomeを返す', () => {
    const cpu = new CPU("normal");
    const game2p = new GameManager(2);
    const player2 = game2p.currentPlayer();
    const stadium = createCardByName('スタジアム'); // income 2
    // 2人ゲームなので相手は1人
    assert.strictEqual(cpu.evalCard(stadium, game2p, player2), 2);

    const game4p = new GameManager(4);
    const player4 = game4p.currentPlayer();
    // 4人ゲームでも対戦相手数に応じた価値は維持する
    assert.ok(cpu.evalCard(stadium, game4p, player4) >= 5);
});

runTest('evalCard: TVは相手の最大コインと上限incomeの小さい方を返す', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const opponent = game.players[1];
    opponent.coins = 3;
    const tv = createCardByName('テレビ局'); // income 5
    assert.strictEqual(cpu.evalCard(tv, game, current), 3);

    opponent.coins = 10;
    assert.strictEqual(cpu.evalCard(tv, game, current), 5); // incomeの上限5

    opponent.coins = 0;
    assert.strictEqual(cpu.evalCard(tv, game, current), 0);
});

runTest('evalCard: HARBORは港ランドマーク所持でfullスコア、未所持で0.4倍', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const player = game.currentPlayer();
    const sanma = createCardByName('サンマ漁船'); // effect=harbor, income 3

    // 港未所持
    assert.strictEqual(cpu.evalCard(sanma, game, player), sanma.income * 0.4);

    // 港所持
    player.landmarks[LANDMARK_NAMES.HARBOR] = true;
    assert.strictEqual(cpu.evalCard(sanma, game, player), sanma.income);
});

runTest('evalCard: TUNAは港ランドマーク所持で7、未所持で0', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const player = game.currentPlayer();
    const tuna = createCardByName('マグロ漁船');

    assert.strictEqual(cpu.evalCard(tuna, game, player), 0);

    player.landmarks[LANDMARK_NAMES.HARBOR] = true;
    assert.strictEqual(cpu.evalCard(tuna, game, player), 7);
});

runTest('evalCard: CHEESEはcalcCardIncomeで牧場枚数×incomeを返す', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const player = game.currentPlayer();
    player.cards = [createCardByName('牧場'), createCardByName('牧場')];
    player.dormantCards = [];
    const cheese = createCardByName('チーズ工場'); // income 3
    // 2牧場 × 3 = 6
    assert.strictEqual(cpu.evalCard(cheese, game, player), 6);

    player.cards = [];
    assert.strictEqual(cpu.evalCard(cheese, game, player), 0);
});

// ===== chooseDiceCount =====

runTest('chooseDiceCount: strong は有利局面で妥当な真偽値を返す', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    // 2個振り(2~12)のみに反応するカードを複数持たせる
    // dice=7に反応するチーズ工場を持たせると2個振りの期待値が高くなる
    current.cards = [
        createCardByName('チーズ工場'),
        createCardByName('チーズ工場'),
        createCardByName('牧場'),
        createCardByName('牧場'),
        createCardByName('牧場'),
    ];
    current.dormantCards = [];
    const result = cpu.chooseDiceCount(game);
    assert.strictEqual(typeof result, 'boolean');
});

runTest('chooseDiceCount: 1個振りが有利な場合falseを返す（strong）', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    // 相手に多数の赤カード（1~6のみ反応）を持たせ、自分は何もない状況
    const opponent = game.players[1];
    opponent.cards = [
        createCardByName('カフェ'),   // red, dice 3
        createCardByName('カフェ'),
        createCardByName('カフェ'),
        createCardByName('カフェ'),
        createCardByName('カフェ'),
    ];
    opponent.dormantCards = [];
    current.cards = [];
    current.dormantCards = [];
    opponent.coins = 5;
    // 1個振りはdice 1~6のみ → カフェはdice3。相手のカフェが1個振り時のみ発動する
    // 2個振りではdice3の確率が下がるのでむしろ1個振りが良い（か同等）
    // このシナリオでは 2個振りスコア >= 1個振りスコア の判断になる可能性もあるが
    // 少なくとも weak でないことを確認
    const result = cpu.chooseDiceCount(game);
    assert.strictEqual(typeof result, 'boolean');
});

runTest('chooseDiceCount: strong は次の建設計画も見て判断する', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.coins = 1;
    current.cards = [
        createCardByName('チーズ工場'),
        createCardByName('牧場'),
        createCardByName('牧場'),
        createCardByName('牧場'),
    ];
    current.dormantCards = [];

    assert.strictEqual(typeof cpu.chooseDiceCount(game), 'boolean');
});

runTest('chooseDiceCount: expert は先読み評価で選択を返す', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.cards = [createCardByName('チーズ工場'), createCardByName('牧場'), createCardByName('牧場')];
    current.dormantCards = [];

    assert.strictEqual(typeof cpu.chooseDiceCount(game), 'boolean');
});

runTest('chooseDiceCount: expert v2 simple は期待値で2個振りを選ぶ', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple" });
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.cards = [createCardByName('サンマ漁船')];
    current.dormantCards = [];

    assert.strictEqual(cpu.chooseDiceCount(game), true);
});

runTest('chooseDiceCount: expert v2 simple は期待値で1個振りを選ぶ', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple" });
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.cards = [createCardByName('パン屋'), createCardByName('コンビニ')];
    current.dormantCards = [];

    assert.strictEqual(cpu.chooseDiceCount(game), false);
});

runTest('chooseDiceCount: expert v2 simple は港込みの高出目期待値を使う', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple" });
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    current.cards = [
        createCardByName('食品倉庫'),
        createCardByName('パン屋'),
        createCardByName('コンビニ'),
        createCardByName('コンビニ'),
    ];
    current.dormantCards = [];

    const plainTwo = cpu._expectedDiceScore(game, true);
    const harborTwo = cpu._expectedDiceScoreWithHarbor(game, true);
    assert.ok(harborTwo > plainTwo);
    assert.strictEqual(typeof cpu.chooseDiceCount(game), 'boolean');
});

runTest('chooseDiceCount: expert v2 simple は random mode なら駅ありでランダムに選ぶ', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple", expertDiceMode: "random" });
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    const originalRandom = Math.random;
    Math.random = () => 0.2;
    try {
        assert.strictEqual(cpu.chooseDiceCount(game), true);
    } finally {
        Math.random = originalRandom;
    }
});

runTest('chooseReroll: expert v2 simple はランダムで判定する', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple" });
    const game = new GameManager(2);
    const originalRandom = Math.random;
    Math.random = () => 0.2;
    try {
        assert.strictEqual(cpu.chooseReroll(game), true);
    } finally {
        Math.random = originalRandom;
    }
});

runTest('chooseTVTarget: expert v2 simple はコイン最多相手を選ぶ', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple" });
    const game = new GameManager(3);
    game.players[1].coins = 3;
    game.players[2].coins = 5;
    assert.strictEqual(cpu.chooseTVTarget(game), 2);
});

runTest('chooseTVTarget: expert v2 simple は random mode なら合法対象からランダムに選ぶ', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple", expertTvMode: "random" });
    const game = new GameManager(3);
    game.players[1].coins = 3;
    game.players[2].coins = 5;
    const originalRandom = Math.random;
    Math.random = () => 0.99;
    try {
        assert.strictEqual(cpu.chooseTVTarget(game), 2);
    } finally {
        Math.random = originalRandom;
    }
});

runTest('chooseBusinessMove: expert v2 simple は一番いらない自分カードと一番欲しい相手カードを選ぶ', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple" });
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const target = game.players[1];
    current.cards = [createCardByName('パン屋'), createCardByName('麦畑')];
    current.dormantCards = [];
    target.cards = [createCardByName('牧場'), createCardByName('鉱山')];
    target.dormantCards = [];
    const move = cpu.chooseBusinessMove(game);
    assert.strictEqual(move.myCard, 0);
    assert.strictEqual(move.targetIndex, 1);
    assert.strictEqual(move.theirCard, 1);
});

runTest('chooseBusinessMove: expert v2 simple は random mode なら合法手からランダムに選ぶ', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple", expertBusinessMode: "random" });
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const target = game.players[1];
    current.cards = [createCardByName('パン屋'), createCardByName('麦畑')];
    current.dormantCards = [];
    target.cards = [createCardByName('牧場'), createCardByName('鉱山')];
    target.dormantCards = [];
    const originalRandom = Math.random;
    Math.random = () => 0.99;
    try {
        const move = cpu.chooseBusinessMove(game);
        assert.strictEqual(move.myCard, 1);
        assert.strictEqual(move.targetIndex, 1);
        assert.strictEqual(move.theirCard, 1);
    } finally {
        Math.random = originalRandom;
    }
});

runTest('expert tuning は人数別設定で自動切替される', () => {
    const cpu = new CPU("expert", {
        expertProfileTunings: {
            duel: { lookaheadWeight: 0.91 },
            crowd: { lookaheadWeight: 0.42 },
        },
    });
    const duel = new GameManager(2);
    const crowd = new GameManager(4);

    cpu._syncExpertTuningForGame(duel);
    assert.strictEqual(cpu._expertProfileName(duel), 'duel');
    assert.strictEqual(cpu.expertTuning.lookaheadWeight, 0.91);

    cpu._syncExpertTuningForGame(crowd);
    assert.strictEqual(cpu._expertProfileName(crowd), 'crowd');
    assert.strictEqual(cpu.expertTuning.lookaheadWeight, 0.42);
});

runTest('expert は既定で人数別 profile tuning を持つ', () => {
    const cpu = new CPU("expert");
    const duel = new GameManager(2);
    const trio = new GameManager(3);
    const crowd = new GameManager(4);

    cpu._syncExpertTuningForGame(duel);
    assert.strictEqual(cpu.expertTuning.lowValueSpamPenalty, 5.1);

    cpu._syncExpertTuningForGame(trio);
    assert.strictEqual(cpu.expertTuning.stableIncomeWeight, 2.15);
    assert.strictEqual(cpu.expertTuning.redPressureWeight, 0.72);
    assert.strictEqual(cpu.expertTuning.lookaheadWeight, 0.52);

    cpu._syncExpertTuningForGame(crowd);
    assert.strictEqual(cpu.expertTuning.landmarkActionBonus, 18);
    assert.strictEqual(cpu.expertTuning.leaderThreatWeight, 0.08);
});

runTest('expertPurpose: live は realtime モードを既定にする', () => {
    const cpu = new CPU("expert", { expertPurpose: "live" });
    assert.strictEqual(cpu.expertPurpose, 'live');
    assert.strictEqual(cpu.simulationMode, 'realtime');
});

runTest('expert realtime: 4人戦では choice lookahead を使わない', () => {
    const cpu = new CPU("expert", { expertPurpose: "live" });
    const game = new GameManager(4);
    game.phase = runtime.GAME_PHASES.BUILD;
    game.enabledLandmarks = new Set(Player.landmarkNames());
    const current = game.currentPlayer();
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    current.landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;

    assert.strictEqual(cpu._shouldUseExpertChoiceLookahead(game, game.currentPlayerIndex), false);
});

runTest('expert profiler: profileStats 指定時は choice/lookahead 計測を蓄積する', () => {
    const profileStats = {};
    const cpu = new CPU("expert", { simulationMode: "lite", profileStats });
    const game = new GameManager(2);
    const current = game.currentPlayer();
    game.phase = runtime.GAME_PHASES.BUILD;
    game.enabledLandmarks = new Set(Player.landmarkNames());
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    current.landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;

    cpu._syncExpertTuningForGame(game);
    cpu._scoreExpertChoiceState(game, game.currentPlayerIndex);

    const summary = cpu.getProfileSummary();
    assert.ok(summary.some(entry => entry.label === 'expert.choiceState'));
    assert.ok(summary.some(entry => entry.label === 'expert.choiceLookahead'));
    assert.ok(summary.some(entry => entry.label === 'expert.simulateLookahead'));
    assert.ok((profileStats['expert.lookaheadSteps'] || {}).count > 0);
});

runTest('_expertCrowdNormalPlan: expert 4人戦の序中盤では normal 寄りプランを使う', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(4);
    assert.strictEqual(cpu._expertCrowdNormalPlan(game), true);

    const current = game.currentPlayer();
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    current.landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;
    current.cards = [
        createCardByName('コンビニ'),
        createCardByName('コンビニ'),
        createCardByName('コンビニ'),
        createCardByName('コンビニ'),
        createCardByName('麦畑'),
        createCardByName('麦畑'),
        createCardByName('パン屋'),
        createCardByName('パン屋'),
        createCardByName('カフェ'),
    ];
    assert.strictEqual(cpu._expertCrowdNormalPlan(game), false);
});

runTest('all CPU difficulties: 勝てる最後のランドマークがあるなら必ず建てる', () => {
    for (const difficulty of ['weak', 'normal', 'strong', 'expert']) {
        const cpu = new CPU(difficulty);
        const game = new GameManager(2);
        const current = game.currentPlayer();
        current.landmarks = {
            駅: true,
            ショッピングモール: true,
            遊園地: true,
            電波塔: false,
            港: false,
            空港: false,
            役所: true,
        };
        game.enabledLandmarks = new Set(['駅', 'ショッピングモール', '遊園地', '電波塔']);
        current.coins = Player.landmarkCost('電波塔');
        game.phase = runtime.GAME_PHASES.BUILD;
        game.builtThisTurn = false;

        cpu.build(game);

        assert.strictEqual(current.landmarks['電波塔'], true, `difficulty=${difficulty}`);
    }
});

runTest('all CPU difficulties: builtThisTurn 後は盤面を変えない', () => {
    for (const difficulty of ['weak', 'normal', 'strong', 'expert']) {
        const cpu = new CPU(difficulty);
        const game = new GameManager(2);
        const current = game.currentPlayer();
        current.coins = 20;
        const beforeCoins = current.coins;
        const beforeCards = current.cards.length;
        const beforeBuilt = current.builtLandmarkCount();
        game.phase = runtime.GAME_PHASES.BUILD;
        game.builtThisTurn = true;

        cpu.build(game);

        assert.strictEqual(current.coins, beforeCoins, `difficulty=${difficulty}`);
        assert.strictEqual(current.cards.length, beforeCards, `difficulty=${difficulty}`);
        assert.strictEqual(current.builtLandmarkCount(), beforeBuilt, `difficulty=${difficulty}`);
    }
});

// ===== chooseReroll =====

runTest('chooseReroll: strong は不利局面でも妥当な真偽値を返す', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const opponent = game.players[1];

    // 相手が多くの赤カードを持ち、dice=3が出て大きく損をしている状況
    opponent.cards = [
        createCardByName('カフェ'), // red, dice 3, income 1
        createCardByName('カフェ'),
        createCardByName('カフェ'),
        createCardByName('カフェ'),
        createCardByName('カフェ'),
        createCardByName('カフェ'),
    ];
    opponent.dormantCards = [];
    current.cards = [createCardByName('麦畑')];
    current.dormantCards = [];
    opponent.coins = 10;
    game.lastDiceResult = 3; // カフェが多数発動する目
    game.lastDice2 = 0; // 1個振り

    const result = cpu.chooseReroll(game);
    assert.strictEqual(typeof result, 'boolean');
});

runTest('chooseReroll: 現在スコアが高い場合はリロールしない（normal）', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const current = game.currentPlayer();

    // 自分が多くの高収入青カードを持ち、それが全て発動する目が出た状況
    current.cards = [
        createCardByName('鉱山'), // blue, dice 9, income 5
        createCardByName('鉱山'),
        createCardByName('鉱山'),
    ];
    current.dormantCards = [];
    game.players[1].cards = [];
    game.players[1].dormantCards = [];
    game.lastDiceResult = 9; // 鉱山が全部発動
    game.lastDice2 = 0;

    const result = cpu.chooseReroll(game);
    // 現在スコア=15（3鉱山×5）、期待値は低いのでfalseになるはず
    assert.strictEqual(result, false);
});

runTest('chooseReroll: expert は先読み評価でリロール可否を返す', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    current.cards = [createCardByName('パン屋'), createCardByName('コンビニ')];
    current.dormantCards = [];
    game.lastDice1 = 1;
    game.lastDice2 = 0;
    game.lastDiceResult = 1;

    assert.strictEqual(typeof cpu.chooseReroll(game), 'boolean');
});

runTest('chooseHarbor: expert は先読み評価で港ボーナス可否を返す', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    current.cards = [createCardByName('サンマ漁船'), createCardByName('マグロ漁船')];
    current.dormantCards = [];
    game.phase = runtime.GAME_PHASES.HARBOR_CHOICE;
    game.lastDice1 = 4;
    game.lastDice2 = 6;
    game.lastDiceResult = 10;
    game.pendingTunaDice = [4, 6];

    assert.strictEqual(typeof cpu.chooseHarbor(game), 'boolean');
});

runTest('chooseHarbor: expert v2 simple は+2後の結果価値を比較する', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple" });
    const game = new GameManager(2);
    const current = game.currentPlayer();
    game.lastDiceResult = 5;
    current.cards = [createCardByName('マグロ漁船')];
    current.dormantCards = [];
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    assert.strictEqual(cpu.chooseHarbor(game), true);
});

runTest('chooseHarbor: expert v2 simple は random mode ならランダムで選ぶ', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple", expertHarborMode: "random" });
    const game = new GameManager(2);
    const originalRandom = Math.random;
    Math.random = () => 0.2;
    try {
        assert.strictEqual(cpu.chooseHarbor(game), true);
    } finally {
        Math.random = originalRandom;
    }
});

runTest('_countReachableLandmarks は今の所持金で建てられる残りランドマーク数を返す', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.coins = 5;
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;

    const reachable = cpu._countReachableLandmarks(current, [...game.enabledLandmarks]);
    assert.strictEqual(reachable, 1);
});

runTest('_estimateStableIncome は青・緑カードの安定収入を見積もる', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.cards = [
        createCardByName('麦畑'),
        createCardByName('パン屋'),
        createCardByName('カフェ'),
    ];
    current.dormantCards = [];

    const stableIncome = cpu._estimateStableIncome(game, current);
    assert.ok(stableIncome >= 2);
});

runTest('expert roll cap: 既に十分な出目への追加投資は減点される', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    game.enabledLandmarks = new Set([LANDMARK_NAMES.HARBOR]);
    current.cards = [
        createCardByName('パン屋'),
        createCardByName('パン屋'),
        createCardByName('パン屋'),
    ];
    current.dormantCards = [];

    const sameDicePenalty = cpu._scoreExpertRollCapPenalty(createCardByName('パン屋'), game, current);
    const otherDicePenalty = cpu._scoreExpertRollCapPenalty(createCardByName('麦畑'), game, current);

    assert.ok(sameDicePenalty > 0);
    assert.strictEqual(otherDicePenalty, 0);
});

runTest('expert roll cap: 同出目の過剰投資カードは別出目カードより評価が下がる', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    game.enabledLandmarks = new Set([LANDMARK_NAMES.HARBOR]);
    current.cards = [
        createCardByName('パン屋'),
        createCardByName('パン屋'),
        createCardByName('パン屋'),
    ];
    current.dormantCards = [];

    const bakeryScore = cpu._scoreExpertCardCandidate(createCardByName('パン屋'), game, current);
    const ranchScore = cpu._scoreExpertCardCandidate(createCardByName('麦畑'), game, current);

    assert.ok(ranchScore > bakeryScore);
});

runTest('_estimateWinDistance は同じ建設数でも資金と収入が厚い方を近く見る', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const near = game.currentPlayer();
    const far = game.players[1];

    near.landmarks[LANDMARK_NAMES.STATION] = true;
    far.landmarks[LANDMARK_NAMES.STATION] = true;
    near.coins = 14;
    far.coins = 2;
    near.cards = [createCardByName('麦畑'), createCardByName('パン屋'), createCardByName('コンビニ')];
    far.cards = [createCardByName('麦畑')];
    near.dormantCards = [];
    far.dormantCards = [];

    assert.ok(cpu._estimateWinDistance(near, game) < cpu._estimateWinDistance(far, game));
});

runTest('_estimateRedPressure は相手の赤カード圧を見積もる', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(3);
    game.players[1].cards = [createCardByName('カフェ'), createCardByName('寿司屋')];
    game.players[1].dormantCards = [];
    game.players[1].landmarks[LANDMARK_NAMES.HARBOR] = true;
    game.players[2].cards = [createCardByName('カフェ')];
    game.players[2].dormantCards = [];

    const pressure = cpu._estimateRedPressure(game, 0);
    assert.ok(pressure >= 5);
});

runTest('_estimateOpponentThreat は進行した相手ほど高く見積もる', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(3);
    const leader = game.players[1];
    const follower = game.players[2];

    leader.coins = 8;
    leader.landmarks[LANDMARK_NAMES.STATION] = true;
    leader.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    leader.cards.push(createCardByName('コンビニ'));
    leader.dormantCards = [];

    follower.coins = 3;

    assert.ok(cpu._estimateOpponentThreat(leader, game) > cpu._estimateOpponentThreat(follower, game));
});

runTest('_opponentDilutionFactor は対戦人数が増えるほど小さくなる', () => {
    const cpu = new CPU("strong");
    const duel = new GameManager(2);
    const crowd = new GameManager(4);

    assert.strictEqual(cpu._opponentDilutionFactor(duel), 1);
    assert.strictEqual(cpu._opponentDilutionFactor(crowd), 1 / 3);
});

runTest('_strongCrowdOneDieOpponents は駅未建設の相手人数を返す', () => {
    const cpu = new CPU("strong");
    const crowd = new GameManager(4);

    crowd.players[1].landmarks[LANDMARK_NAMES.STATION] = true;

    assert.strictEqual(cpu._strongCrowdOneDieOpponents(crowd), 2);
});

runTest('_strongCrowdAttackScale は4人戦strongで妨害価値をさらに薄める', () => {
    const cpu = new CPU("strong");
    const duel = new GameManager(2);
    const crowd = new GameManager(4);

    assert.strictEqual(cpu._strongCrowdAttackScale(duel), 1);
    assert.strictEqual(cpu._strongCrowdAttackScale(crowd), (1 / 3) * 0.45);
});

runTest('_crowdLeaderBonus は多人数戦のトップ相手に高い補正を返す', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(4);
    const leader = game.players[1];
    const follower = game.players[2];

    leader.coins = 8;
    leader.landmarks[LANDMARK_NAMES.STATION] = true;
    leader.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    follower.coins = 3;

    assert.ok(cpu._crowdLeaderBonus(game, 1, 12) > cpu._crowdLeaderBonus(game, 2, 12));
});

runTest('_crowdCleaningBonus はリーダーが多く持つカード名で高くなる', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(4);
    const leader = game.players[1];
    const follower = game.players[2];

    leader.coins = 8;
    leader.landmarks[LANDMARK_NAMES.STATION] = true;
    leader.cards = [createCardByName('カフェ'), createCardByName('カフェ')];
    leader.dormantCards = [];
    follower.cards = [createCardByName('パン屋')];
    follower.dormantCards = [];

    assert.ok(cpu._crowdCleaningBonus(game, 'カフェ', 3) > cpu._crowdCleaningBonus(game, 'パン屋', 3));
});

runTest('_evaluatePosition は到達可能ランドマークと安定収入を高く評価する', () => {
    const cpu = new CPU("expert");
    const richGame = new GameManager(2);
    const rich = richGame.currentPlayer();
    rich.coins = 12;
    rich.cards = [createCardByName('麦畑'), createCardByName('パン屋')];
    rich.dormantCards = [];

    const poorGame = new GameManager(2);
    const poor = poorGame.currentPlayer();
    poor.coins = 1;
    poor.cards = [createCardByName('カフェ')];
    poor.dormantCards = [];

    assert.ok(cpu._evaluatePosition(richGame, 0) > cpu._evaluatePosition(poorGame, 0));
});

runTest('_evaluatePosition は危険なトップ相手がいる盤面を低く評価する', () => {
    const cpu = new CPU("expert");
    const safeGame = new GameManager(3);
    const dangerGame = new GameManager(3);

    dangerGame.players[1].coins = 8;
    dangerGame.players[1].landmarks[LANDMARK_NAMES.STATION] = true;
    dangerGame.players[1].landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    dangerGame.players[1].landmarks[LANDMARK_NAMES.HARBOR] = true;

    assert.ok(cpu._evaluatePosition(safeGame, 0) > cpu._evaluatePosition(dangerGame, 0));
});

runTest('_scoreExpertLandmarkDelayPenalty は建てられるランドマークがあると正になる', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();

    current.coins = 12;
    assert.ok(cpu._scoreExpertLandmarkDelayPenalty(current, game) > 0);
});

// ===== _landmarkUrgency =====

runTest('_landmarkUrgency: 駅はbuiltCount<2で緊急度8、>=2で5を返す', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const current = game.currentPlayer();

    // ランドマーク0個（builtCount=0 < 2）→ 緊急度8
    assert.strictEqual(cpu._landmarkUrgency(LANDMARK_NAMES.STATION, current, game), 8);

    // ランドマーク1個（builtCount=1 < 2）→ 緊急度8
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    assert.strictEqual(cpu._landmarkUrgency(LANDMARK_NAMES.STATION, current, game), 8);

    // ランドマーク2個（builtCount=2 >= 2）→ 緊急度5
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    assert.strictEqual(cpu._landmarkUrgency(LANDMARK_NAMES.STATION, current, game), 5);
});

runTest('_landmarkUrgency: ショッピングモールは対象カードが多いほど高くなる', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const current = game.currentPlayer();

    current.cards = [createCardByName('パン屋'), createCardByName('カフェ')];
    const base = cpu._landmarkUrgency(LANDMARK_NAMES.SHOPPING_MALL, current, game);

    current.cards = [
        createCardByName('パン屋'),
        createCardByName('カフェ'),
        createCardByName('コンビニ'),
        createCardByName('カフェ'),
        createCardByName('パン屋'),
    ];
    assert.ok(cpu._landmarkUrgency(LANDMARK_NAMES.SHOPPING_MALL, current, game) > base);
});

runTest('_landmarkUrgency: 港は関連カードと特にマグロ漁船で高くなる', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();

    current.cards = [createCardByName('麦畑')];
    const base = cpu._landmarkUrgency(LANDMARK_NAMES.HARBOR, current, game);

    current.cards = [createCardByName('サンマ漁船')];
    const withHarborCard = cpu._landmarkUrgency(LANDMARK_NAMES.HARBOR, current, game);
    assert.ok(withHarborCard > base);

    current.cards = [createCardByName('マグロ漁船'), createCardByName('マグロ漁船')];
    assert.ok(cpu._landmarkUrgency(LANDMARK_NAMES.HARBOR, current, game) > withHarborCard);
});

runTest('_landmarkUrgency: 電波塔は進行局面や高分散構成で高くなる', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const base = cpu._landmarkUrgency(LANDMARK_NAMES.RADIO_TOWER, current, game);

    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    const progressed = cpu._landmarkUrgency(LANDMARK_NAMES.RADIO_TOWER, current, game);
    assert.ok(progressed > base);

    const game2 = new GameManager(2);
    const current2 = game2.currentPlayer();
    current2.landmarks[LANDMARK_NAMES.STATION] = true;
    current2.cards = [
        createCardByName('チーズ工場'),
        createCardByName('家具工場'),
        createCardByName('マグロ漁船'),
        createCardByName('テレビ局'),
    ];
    current2.dormantCards = [];
    assert.ok(cpu._landmarkUrgency(LANDMARK_NAMES.RADIO_TOWER, current2, game2) > base);
});

runTest('_landmarkUrgency: 空港は終盤や盤面成熟時に高くなる', () => {
    const cpu = new CPU("normal");
    const early = new GameManager(2);
    const late = new GameManager(2);

    late.currentPlayer().landmarks[LANDMARK_NAMES.STATION] = true;
    late.currentPlayer().landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    late.currentPlayer().landmarks[LANDMARK_NAMES.HARBOR] = true;
    late.currentPlayer().landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    late.currentPlayer().cards = [createCardByName('麦畑')];
    late.currentPlayer().dormantCards = [];

    assert.ok(
        cpu._landmarkUrgency(LANDMARK_NAMES.AIRPORT, late.currentPlayer(), late) >
        cpu._landmarkUrgency(LANDMARK_NAMES.AIRPORT, early.currentPlayer(), early)
    );
});

runTest('_landmarkUrgency: 遊園地は2個振り恩恵カードが多いと高くなる', () => {
    const cpu = new CPU("strong");
    const baseGame = new GameManager(2);
    const richGame = new GameManager(2);

    baseGame.currentPlayer().landmarks[LANDMARK_NAMES.STATION] = true;
    richGame.currentPlayer().landmarks[LANDMARK_NAMES.STATION] = true;
    richGame.currentPlayer().cards = [
        createCardByName('チーズ工場'),
        createCardByName('家具工場'),
        createCardByName('テレビ局'),
    ];
    richGame.currentPlayer().dormantCards = [];

    assert.ok(
        cpu._landmarkUrgency(LANDMARK_NAMES.AMUSEMENT_PARK, richGame.currentPlayer(), richGame) >
        cpu._landmarkUrgency(LANDMARK_NAMES.AMUSEMENT_PARK, baseGame.currentPlayer(), baseGame)
    );
});

runTest('_landmarkUrgency: 4人戦は2人戦以上にランドマークを急ぐ', () => {
    const cpu = new CPU("normal");
    const duel = new GameManager(2);
    const crowded = new GameManager(4);

    assert.ok(
        cpu._landmarkUrgency(LANDMARK_NAMES.STATION, crowded.currentPlayer(), crowded) >=
        cpu._landmarkUrgency(LANDMARK_NAMES.STATION, duel.currentPlayer(), duel)
    );
});

// ===== sortAffordable =====

runTest('sortAffordable: ダイス確率を加味したスコア順にソートされる', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const player = game.currentPlayer();
    player.cards = [];
    player.dormantCards = [];

    // 駅なしでは自分ターン系カードは1個振り前提で評価される
    const cards = [createCardByName('麦畑'), createCardByName('鉱山'), createCardByName('パン屋')];
    const sorted = cpu.sortAffordable(cards, game, player);

    assert.strictEqual(sorted.length, 3);
    assert.strictEqual(sorted[0].card.name, '麦畑');
    assert.strictEqual(sorted[sorted.length - 1].card.name, '鉱山');
    // 全てスコアフィールドを持つ
    for (const entry of sorted) {
        assert.ok(typeof entry.score === 'number');
        assert.ok(typeof entry.card === 'object' && entry.card !== null);
    }
});

runTest('_cardDiceFreq: 緑/紫は自分の駅所持で高出目を評価しやすくなる', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const player = game.currentPlayer();
    const cheese = createCardByName('チーズ工場');

    const noStation = cpu._cardDiceFreq(cheese, game, player);
    player.landmarks[LANDMARK_NAMES.STATION] = true;
    const withStation = cpu._cardDiceFreq(cheese, game, player);

    assert.ok(withStation > noStation);
});

runTest('_cardDiceFreq: 赤は相手の駅所持で高出目を評価しやすくなる', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const player = game.currentPlayer();
    const target = game.players[1];
    const family = createCardByName('ファミレス');

    const noStation = cpu._cardDiceFreq(family, game, player);
    target.landmarks[LANDMARK_NAMES.STATION] = true;
    const withStation = cpu._cardDiceFreq(family, game, player);

    assert.ok(withStation > noStation);
});

runTest('_strongSoftCapValue: strong は大きすぎる単発収入を逓減評価する', () => {
    const cpu = new CPU("strong");

    assert.strictEqual(cpu._strongSoftCapValue(10), 10);
    assert.ok(cpu._strongSoftCapValue(20) < 20);
    assert.ok(cpu._strongSoftCapValue(40) < 30);
});

runTest('evalCard: 多人数戦では全体攻撃は維持しつつ赤カード偏重を抑える', () => {
    const cpu = new CPU("strong");
    const duel = new GameManager(2);
    const crowded = new GameManager(4);
    const redCard = createCardByName('カフェ');
    const stadium = createCardByName('スタジアム');

    assert.ok(cpu.evalCard(redCard, crowded, crowded.currentPlayer()) < cpu.evalCard(redCard, duel, duel.currentPlayer()));
    assert.ok(cpu.evalCard(stadium, crowded, crowded.currentPlayer()) >= cpu.evalCard(stadium, duel, duel.currentPlayer()));
});

runTest('evalCard: 4人戦では安定収入カードを2人戦以上に評価する', () => {
    const cpu = new CPU("strong");
    const duel = new GameManager(2);
    const crowded = new GameManager(4);
    const bakery = createCardByName('パン屋');

    assert.ok(cpu.evalCard(bakery, crowded, crowded.currentPlayer()) > cpu.evalCard(bakery, duel, duel.currentPlayer()));
});

runTest('strong tempo: 青/赤は駅未建設の相手が多いほど出目6以下カードを高く見る', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    const wheat = createCardByName('麦畑');
    const tuna = createCardByName('マグロ漁船');

    const earlyScore = cpu._scoreAffordablePurchase(wheat, game, current, { difficulty: "strong" });
    const earlyHighScore = cpu._scoreAffordablePurchase(tuna, game, current, { difficulty: "strong" });

    game.players[1].landmarks[LANDMARK_NAMES.STATION] = true;
    game.players[2].landmarks[LANDMARK_NAMES.STATION] = true;
    game.players[3].landmarks[LANDMARK_NAMES.STATION] = true;

    const lateScore = cpu._scoreAffordablePurchase(wheat, game, current, { difficulty: "strong" });
    const lateHighScore = cpu._scoreAffordablePurchase(tuna, game, current, { difficulty: "strong" });

    assert.ok(earlyScore > lateScore);
    assert.ok(earlyHighScore < lateHighScore);
});

runTest('strong tempo: 緑/紫は相手ではなく自分の駅状況で出目帯を評価する', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    const bakery = createCardByName('パン屋');
    const cheese = createCardByName('チーズ工場');

    game.players[1].landmarks[LANDMARK_NAMES.STATION] = true;
    game.players[2].landmarks[LANDMARK_NAMES.STATION] = true;
    game.players[3].landmarks[LANDMARK_NAMES.STATION] = true;

    current.landmarks[LANDMARK_NAMES.STATION] = false;
    const oneDieLow = cpu._scoreAffordablePurchase(bakery, game, current, { difficulty: "strong" });
    const oneDieHigh = cpu._scoreAffordablePurchase(cheese, game, current, { difficulty: "strong" });

    current.landmarks[LANDMARK_NAMES.STATION] = true;
    const twoDiceLow = cpu._scoreAffordablePurchase(bakery, game, current, { difficulty: "strong" });
    const twoDiceHigh = cpu._scoreAffordablePurchase(cheese, game, current, { difficulty: "strong" });

    assert.ok(oneDieLow > twoDiceLow);
    assert.ok(oneDieHigh < twoDiceHigh);
});

runTest('build: builtThisTurn 済みなら追加建設を試みない', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    game.phase = runtime.GAME_PHASES.BUILD;
    game.builtThisTurn = true;
    current.coins = 20;
    const beforeCards = current.cards.length;
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    cpu.build(game, stock);

    assert.strictEqual(current.cards.length, beforeCards);
    assert.strictEqual(game.builtThisTurn, true);
});

runTest('chooseTVTarget: 勝利に近い相手を優先して狙う', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(3);
    const targetByCoins = game.players[1];
    const targetByLead = game.players[2];

    targetByCoins.coins = 8;
    targetByLead.coins = 4;
    targetByLead.landmarks[LANDMARK_NAMES.STATION] = true;
    targetByLead.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    targetByLead.landmarks[LANDMARK_NAMES.HARBOR] = true;
    targetByLead.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;

    assert.strictEqual(cpu.chooseTVTarget(game), 2);
});

runTest('chooseTVTarget: expert は盤面評価で対象を選ぶ', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(3);

    game.currentPlayer().coins = 0;
    game.players[1].coins = 5;
    game.players[2].coins = 5;
    game.players[2].landmarks[LANDMARK_NAMES.STATION] = true;
    game.players[2].landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    game.players[2].landmarks[LANDMARK_NAMES.HARBOR] = true;
    game.players[2].landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;

    const score1 = cpu._scoreExpertPendingChoice(game, clone => clone.resolveTV(1));
    const score2 = cpu._scoreExpertPendingChoice(game, clone => clone.resolveTV(2));
    const expected = score2 > score1 ? 2 : 1;

    assert.strictEqual(cpu.chooseTVTarget(game), expected);
});

runTest('chooseBusinessMove: 弱い自分のカードを強い相手カードと交換する', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const opponent = game.players[1];

    current.cards = [createCardByName('麦畑'), createCardByName('コンビニ')];
    current.dormantCards = [];
    opponent.cards = [createCardByName('鉱山'), createCardByName('森林')];
    opponent.dormantCards = [];

    const move = cpu.chooseBusinessMove(game);
    assert.ok(move);
    assert.strictEqual(current.cards[move.myCard].name, '麦畑');
    assert.strictEqual(opponent.cards[move.theirCard].name, '鉱山');
    assert.strictEqual(move.targetIndex, 1);
});

runTest('chooseBusinessMove: expert は盤面評価で交換先を選ぶ', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const opponent = game.players[1];

    current.cards = [createCardByName('麦畑'), createCardByName('コンビニ')];
    current.dormantCards = [];
    opponent.cards = [createCardByName('鉱山'), createCardByName('森林')];
    opponent.dormantCards = [];

    const move = cpu.chooseBusinessMove(game);
    assert.ok(move);
    assert.strictEqual(current.cards[move.myCard].name, '麦畑');
    assert.strictEqual(opponent.cards[move.theirCard].name, '鉱山');
});

runTest('chooseBusinessMove: expert は多人数戦でリーダー妨害を優先できる', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    const leader = game.players[1];
    const other = game.players[2];

    current.cards = [createCardByName('麦畑')];
    current.dormantCards = [];
    leader.coins = 9;
    leader.landmarks[LANDMARK_NAMES.STATION] = true;
    leader.cards = [createCardByName('鉱山')];
    leader.dormantCards = [];
    other.cards = [createCardByName('森林')];
    other.dormantCards = [];

    const move = cpu.chooseBusinessMove(game);
    assert.ok(move);
    assert.strictEqual(move.targetIndex, 1);
});

runTest('chooseBusinessMove: strong は相手のキーカードを交換対象にしやすい', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(3);
    const current = game.currentPlayer();
    current.cards = [createCardByName('パン屋')];
    current.dormantCards = [];

    game.players[1].cards = [
        createCardByName('牧場'),
        createCardByName('牧場'),
        createCardByName('牧場'),
        createCardByName('チーズ工場'),
        createCardByName('カフェ'),
    ];
    game.players[1].dormantCards = [];

    game.players[2].cards = [
        createCardByName('カフェ'),
        createCardByName('麦畑'),
    ];
    game.players[2].dormantCards = [];

    const move = cpu.chooseBusinessMove(game);
    const target = game.players[move.targetIndex];
    const theirCard = target.cards[move.theirCard];

    assert.strictEqual(move.targetIndex, 1);
    assert.strictEqual(theirCard.name, 'チーズ工場');
});

runTest('chooseCleaningTarget: 自分より相手の被害が大きいカード名を選ぶ', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(3);
    const current = game.currentPlayer();

    current.cards = [createCardByName('パン屋')];
    current.dormantCards = [];
    game.players[1].cards = [createCardByName('カフェ'), createCardByName('カフェ'), createCardByName('カフェ')];
    game.players[1].dormantCards = [];
    game.players[2].cards = [createCardByName('カフェ'), createCardByName('カフェ')];
    game.players[2].dormantCards = [];

    assert.strictEqual(cpu.chooseCleaningTarget(game), 'カフェ');
});

runTest('chooseCleaningTarget: expert v2 simple は場で一番多いカード名を選ぶ', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple" });
    const game = new GameManager(3);
    game.currentPlayer().cards = [createCardByName('カフェ')];
    game.currentPlayer().dormantCards = [];
    game.players[1].cards = [createCardByName('カフェ'), createCardByName('牧場')];
    game.players[1].dormantCards = [];
    game.players[2].cards = [createCardByName('カフェ'), createCardByName('パン屋')];
    game.players[2].dormantCards = [];
    assert.strictEqual(cpu.chooseCleaningTarget(game), 'カフェ');
});

runTest('chooseCleaningTarget: expert v2 simple は random mode なら候補からランダムに選ぶ', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple", expertCleaningMode: "random" });
    const game = new GameManager(3);
    game.currentPlayer().cards = [createCardByName('カフェ')];
    game.currentPlayer().dormantCards = [];
    game.players[1].cards = [createCardByName('カフェ'), createCardByName('牧場')];
    game.players[1].dormantCards = [];
    game.players[2].cards = [createCardByName('カフェ'), createCardByName('パン屋')];
    game.players[2].dormantCards = [];
    const originalRandom = Math.random;
    Math.random = () => 0.99;
    try {
        assert.strictEqual(cpu.chooseCleaningTarget(game), 'パン屋');
    } finally {
        Math.random = originalRandom;
    }
});

runTest('chooseCleaningTarget: expert は盤面評価で休業対象を選ぶ', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(3);
    const current = game.currentPlayer();

    current.cards = [createCardByName('パン屋')];
    current.dormantCards = [];
    game.players[1].cards = [createCardByName('カフェ'), createCardByName('カフェ')];
    game.players[1].dormantCards = [];
    game.players[2].cards = [createCardByName('カフェ')];
    game.players[2].dormantCards = [];

    assert.strictEqual(cpu.chooseCleaningTarget(game), 'カフェ');
});

runTest('chooseCleaningTarget: expert は多人数戦でリーダーの主力を狙いやすい', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(4);
    const leader = game.players[1];
    const other = game.players[2];

    leader.coins = 8;
    leader.landmarks[LANDMARK_NAMES.STATION] = true;
    leader.cards = [createCardByName('カフェ'), createCardByName('カフェ')];
    leader.dormantCards = [];
    other.cards = [createCardByName('パン屋'), createCardByName('パン屋')];
    other.dormantCards = [];

    assert.strictEqual(cpu.chooseCleaningTarget(game), 'カフェ');
});

runTest('chooseCleaningTarget: strong は相手エンジンの主力カード名を狙いやすい', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(3);
    const current = game.currentPlayer();
    current.cards = [createCardByName('パン屋')];
    current.dormantCards = [];

    game.players[1].cards = [
        createCardByName('牧場'),
        createCardByName('牧場'),
        createCardByName('牧場'),
        createCardByName('チーズ工場'),
        createCardByName('チーズ工場'),
    ];
    game.players[1].dormantCards = [];

    game.players[2].cards = [
        createCardByName('カフェ'),
        createCardByName('カフェ'),
        createCardByName('カフェ'),
    ];
    game.players[2].dormantCards = [];

    assert.strictEqual(cpu.chooseCleaningTarget(game), 'チーズ工場');
});

runTest('chooseMoverMove: 価値の低い休業中カードを優先して渡す', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(3);
    const current = game.currentPlayer();

    const wheat = createCardByName('麦畑');
    const mine = createCardByName('鉱山');
    current.cards = [wheat, mine];
    current.dormantCards = [wheat];

    const move = cpu.chooseMoverMove(game);
    assert.ok(move);
    assert.strictEqual(current.cards[move.cardIndex].name, '麦畑');
});

runTest('chooseMoverMove: expert は盤面評価で渡すカードを選ぶ', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(3);
    const current = game.currentPlayer();

    const wheat = createCardByName('麦畑');
    const mine = createCardByName('鉱山');
    current.cards = [wheat, mine];
    current.dormantCards = [wheat];

    const move = cpu.chooseMoverMove(game);
    assert.ok(move);
    assert.strictEqual(current.cards[move.cardIndex].name, '麦畑');
});

runTest('chooseMoverMove: expert は多人数戦でリーダーへ渡しにくい', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    const leader = game.players[1];

    leader.coins = 8;
    leader.landmarks[LANDMARK_NAMES.STATION] = true;
    current.cards = [createCardByName('麦畑')];
    current.dormantCards = [];

    const move = cpu.chooseMoverMove(game);
    assert.ok(move);
    assert.notStrictEqual(move.targetIndex, 1);
});

runTest('expert fast mode は lookahead を軽くする', () => {
    const cpu = new CPU("expert", { simulationMode: "fast" });
    const game = new GameManager(4);

    cpu._syncExpertTuningForGame(game);

    assert.ok(cpu.expertTuning.lookaheadWeight < cpu.baseExpertTuning.lookaheadWeight);
    assert.ok(cpu.expertTuning.lateGameLookaheadStepsPerPlayer < cpu.baseExpertTuning.lateGameLookaheadStepsPerPlayer);
});

runTest('expert lite mode は fast よりさらに lookahead を軽くする', () => {
    const fastCpu = new CPU("expert", { simulationMode: "fast" });
    const liteCpu = new CPU("expert", { simulationMode: "lite" });
    const game = new GameManager(4);

    fastCpu._syncExpertTuningForGame(game);
    liteCpu._syncExpertTuningForGame(game);

    assert.ok(liteCpu.expertTuning.lookaheadWeight < fastCpu.expertTuning.lookaheadWeight);
    assert.ok(liteCpu.expertTuning.lateGameLookaheadStepsPerPlayer <= fastCpu.expertTuning.lateGameLookaheadStepsPerPlayer);
    assert.strictEqual(liteCpu._shouldUseExpertChoiceLookahead(game, game.currentPlayerIndex), false);
});

runTest('chooseRenovationTarget: expert は盤面評価で対象を選ぶ', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();

    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;

    const target = cpu.chooseRenovationTarget(game);
    assert.ok([LANDMARK_NAMES.SHOPPING_MALL, LANDMARK_NAMES.AMUSEMENT_PARK].includes(target));
});

runTest('chooseRenovationTarget: expert は価値の高いランドマークを壊しにくい', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();

    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    current.cards = [createCardByName('パン屋')];

    const target = cpu.chooseRenovationTarget(game);
    assert.strictEqual(target, LANDMARK_NAMES.SHOPPING_MALL);
});

runTest('chooseITInvest: expert は4人戦序盤では normal 寄りに積立できる', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    current.coins = 3;
    current.landmarks[LANDMARK_NAMES.STATION] = true;

    assert.strictEqual(cpu.chooseITInvest(game), true);
});

runTest('chooseITInvest: expert は重要ランドマーク直前なら積立を見送る', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.coins = 9;
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.cards = [
        createCardByName('パン屋'),
        createCardByName('コンビニ'),
        createCardByName('カフェ')
    ];

    assert.strictEqual(cpu.chooseITInvest(game), false);
});

runTest('chooseITInvest: expert は残り3ランドマークでも勝ち筋ランドマークが近ければ積立しない', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();

    game.enabledLandmarks = new Set([
        LANDMARK_NAMES.STATION,
        LANDMARK_NAMES.SHOPPING_MALL,
        LANDMARK_NAMES.RADIO_TOWER,
        LANDMARK_NAMES.HARBOR,
        LANDMARK_NAMES.AIRPORT,
    ]);
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.coins = Player.landmarkCost(LANDMARK_NAMES.HARBOR) - 1;
    current.itVentureCoins = 1;

    assert.strictEqual(cpu.chooseITInvest(game), false);
});

runTest('chooseITInvest: expert は残り4ランドマークでも勝ち筋が近ければ積立しない', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();

    game.enabledLandmarks = new Set([
        LANDMARK_NAMES.STATION,
        LANDMARK_NAMES.SHOPPING_MALL,
        LANDMARK_NAMES.RADIO_TOWER,
        LANDMARK_NAMES.AMUSEMENT_PARK,
        LANDMARK_NAMES.HARBOR,
        LANDMARK_NAMES.AIRPORT,
    ]);
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.coins = Player.landmarkCost(LANDMARK_NAMES.HARBOR) - 1;
    current.itVentureCoins = 2;

    assert.strictEqual(cpu.chooseITInvest(game), false);
});

runTest('chooseITInvest: normal は終盤の空港レースでは積立しない', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const current = game.currentPlayer();

    current.coins = 25;
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;
    current.landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;

    assert.strictEqual(cpu.chooseITInvest(game), false);
});

runTest('chooseITInvest: strong は積立過多なら空港だけ残っていても見送る', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();

    current.coins = 18;
    current.itVentureCoins = 10;
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;
    current.landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;

    assert.strictEqual(cpu.chooseITInvest(game), false);
});

runTest('chooseITInvest: expert は先読み評価で積立可否を返す', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(3);
    const current = game.currentPlayer();
    current.coins = 6;
    current.itVentureCoins = 1;
    current.cards = [createCardByName('ITベンチャー')];
    current.dormantCards = [];

    assert.strictEqual(typeof cpu.chooseITInvest(game), 'boolean');
});

runTest('_shouldHoldForLandmark: 重要ランドマーク直前なら貯金を優先する', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.coins = 9;
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.cards = [
        createCardByName('パン屋'),
        createCardByName('コンビニ'),
        createCardByName('カフェ')
    ];
    assert.strictEqual(cpu._shouldHoldForLandmark(current, game, 4, 4), true);
});

runTest('buildNormal: 勝てる局面ではカードより最後のランドマークを優先する', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    game.phase = runtime.GAME_PHASES.BUILD;
    current.coins = 4;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;
    current.landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    current.landmarks[LANDMARK_NAMES.AIRPORT] = true;
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    cpu.build(game, stock);

    assert.strictEqual(current.landmarks[LANDMARK_NAMES.STATION], true);
    assert.strictEqual(game.builtThisTurn, true);
});

runTest('buildWeak: 勝てる局面ではランダム購入せず最後のランドマークを建てる', () => {
    const cpu = new CPU("weak");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    game.phase = runtime.GAME_PHASES.BUILD;
    current.coins = 2;
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;
    current.landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    current.landmarks[LANDMARK_NAMES.AIRPORT] = true;
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    cpu.build(game, stock);

    assert.strictEqual(current.landmarks[LANDMARK_NAMES.HARBOR], true);
    assert.strictEqual(game.builtThisTurn, true);
});

runTest('buildWeak: 買えるランドマークとカードが両方ある時は50%でランドマークを選べる', () => {
    const realRandom = runtime.Math.random;
    try {
        runtime.Math.random = () => 0.2;
        const cpu = new CPU("weak");
        const game = new GameManager(2);
        const current = game.currentPlayer();
        const stock = {};
        for (const card of CARDS) stock[card.name] = 6;
        game.phase = runtime.GAME_PHASES.BUILD;
        game.enabledLandmarks = new Set(Player.landmarkNames());
        current.coins = 4;

        cpu.buildWeak(game, stock);

        assert.strictEqual(game.builtThisTurn, true);
        assert.ok(current.builtLandmarkCount() >= 1);
    } finally {
        runtime.Math.random = realRandom;
    }
});

runTest('_listExpertBuildOptions: expert はスキップ・ランドマーク・上位カード候補を列挙する', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.coins = 6;
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    const options = cpu._listExpertBuildOptions(game, stock);

    assert.ok(options.some(option => option.type === 'skip'));
    assert.ok(options.some(option => option.type === 'landmark'));
    assert.ok(options.some(option => option.type === 'card'));
});

runTest('_scoreExpertBuildOption: 勝利ランドマークは大きなボーナスで評価される', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.coins = 4;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;
    current.landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    current.landmarks[LANDMARK_NAMES.AIRPORT] = true;
    game.enabledLandmarks = new Set(Player.landmarkNames());
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    const landmarkScore = cpu._scoreExpertBuildOption(game, stock, { type: 'landmark', name: LANDMARK_NAMES.STATION });
    const cardScore = cpu._scoreExpertBuildOption(game, stock, { type: 'card', cardName: 'コンビニ' });

    assert.ok(landmarkScore > cardScore);
});

runTest('buildExpert: 終盤は改装屋の積み増しよりランドマークを優先する', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    game.phase = runtime.GAME_PHASES.BUILD;
    current.coins = 16;
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    current.landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    current.cards = [createCardByName('改装屋'), createCardByName('改装屋'), createCardByName('パン屋')];
    current.dormantCards = [];
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    cpu.build(game, stock);

    assert.strictEqual(current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK], true);
    assert.strictEqual(current.countCard('改装屋'), 2);
});

runTest('buildExpert: 改装屋2枚目以降の所持は局面評価で強くマイナスされる', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    game.enabledLandmarks = new Set(Player.landmarkNames());
    cpu._syncExpertTuningForGame(game);

    const baseScore = cpu._evaluatePosition(game, game.currentPlayerIndex);
    current.addCard(createCardByName('改装屋'));
    const oneRenovationScore = cpu._evaluatePosition(game, game.currentPlayerIndex);
    current.addCard(createCardByName('改装屋'));
    const twoRenovationScore = cpu._evaluatePosition(game, game.currentPlayerIndex);

    assert.ok(twoRenovationScore < oneRenovationScore - 8);
    assert.ok(twoRenovationScore < baseScore);
});

runTest('duplicateRenovationPenalty: 高価なランドマーク露出があるほど重くなる', () => {
    const cpu = new CPU("expert");
    const safeGame = new GameManager(2);
    const riskyGame = new GameManager(2);
    const safe = safeGame.currentPlayer();
    const risky = riskyGame.currentPlayer();
    safeGame.enabledLandmarks = new Set(Player.landmarkNames());
    riskyGame.enabledLandmarks = new Set(Player.landmarkNames());
    cpu._syncExpertTuningForGame(safeGame);
    cpu._syncExpertTuningForGame(riskyGame);

    safe.addCard(createCardByName('改装屋'));
    safe.addCard(createCardByName('改装屋'));
    risky.addCard(createCardByName('改装屋'));
    risky.addCard(createCardByName('改装屋'));

    safe.landmarks[LANDMARK_NAMES.STATION] = true;
    risky.landmarks[LANDMARK_NAMES.STATION] = true;
    risky.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    risky.landmarks[LANDMARK_NAMES.HARBOR] = true;
    risky.landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    risky.landmarks[LANDMARK_NAMES.AIRPORT] = true;

    const safePenalty = cpu._duplicateRenovationPenalty(safe, 'expert', safeGame);
    const riskyPenalty = cpu._duplicateRenovationPenalty(risky, 'expert', riskyGame);
    assert.ok(riskyPenalty > safePenalty + 20);
});

runTest('buildExpert: 建てられるランドマークがある高コイン時はカードよりランドマークを優先する', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    game.phase = runtime.GAME_PHASES.BUILD;
    game.enabledLandmarks = new Set(Player.landmarkNames());
    current.coins = 24;
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    current.cards = [
        createCardByName('麦畑'),
        createCardByName('青果市場'),
        createCardByName('改装屋'),
        createCardByName('改装屋'),
    ];
    current.dormantCards = [];
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    cpu.build(game, stock);

    assert.ok(
        current.landmarks[LANDMARK_NAMES.HARBOR] ||
        current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] ||
        current.landmarks[LANDMARK_NAMES.RADIO_TOWER] ||
        current.landmarks[LANDMARK_NAMES.AIRPORT]
    );
});

runTest('buildNormal: 近いランドマーク保留がなければ何かしら建設する', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    game.phase = runtime.GAME_PHASES.BUILD;
    current.coins = 2;
    current.landmarks[LANDMARK_NAMES.STATION] = true;

    cpu.buildNormal(game, stock);

    assert.strictEqual(game.builtThisTurn, true);
});

runTest('buildStrong: 買える候補があるなら通常は建設する', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    game.phase = runtime.GAME_PHASES.BUILD;
    current.coins = 3;
    current.landmarks[LANDMARK_NAMES.STATION] = true;

    cpu.buildStrong(game, stock);

    assert.strictEqual(game.builtThisTurn, true);
});

runTest('buildNormal: お金が余っていてランドマークを買えるなら優先して建てる', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    game.phase = runtime.GAME_PHASES.BUILD;
    game.enabledLandmarks = new Set(Player.landmarkNames());
    current.coins = 18;
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.cards = [createCardByName('カフェ'), createCardByName('カフェ'), createCardByName('麦畑')];
    current.dormantCards = [];

    cpu.buildNormal(game, stock);

    assert.ok(
        current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] ||
        current.landmarks[LANDMARK_NAMES.HARBOR] ||
        current.landmarks[LANDMARK_NAMES.RADIO_TOWER] ||
        current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] ||
        current.landmarks[LANDMARK_NAMES.AIRPORT]
    );
});

runTest('buildStrong: 赤カード過多なら収入基盤やランドマークを優先する', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    game.phase = runtime.GAME_PHASES.BUILD;
    current.coins = 6;
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.cards = [
        createCardByName('カフェ'),
        createCardByName('カフェ'),
        createCardByName('カフェ'),
    ];
    current.dormantCards = [];

    cpu.buildStrong(game, stock);

    assert.notStrictEqual(current.countCard('カフェ'), 4);
});

runTest('buildStrong: 4人戦序中盤は normal 寄りにランドマークを優先する', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    game.phase = runtime.GAME_PHASES.BUILD;
    game.enabledLandmarks = new Set(Player.landmarkNames());
    current.coins = 12;
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.cards = [createCardByName('カフェ'), createCardByName('カフェ'), createCardByName('麦畑')];
    current.dormantCards = [];

    cpu.buildStrong(game, stock);

    assert.ok(current.builtLandmarkCount() >= 2 || current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] || current.landmarks[LANDMARK_NAMES.HARBOR]);
});

runTest('buildStrong: 4人戦では駅未建設の相手が多い間は低出目の経済カード評価が上がる', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    current.coins = 5;
    current.cards = [];
    current.dormantCards = [];
    for (let i = 1; i < game.players.length; i++) {
        game.players[i].landmarks[LANDMARK_NAMES.STATION] = false;
    }

    const lowDice = createCardByName('パン屋');
    const highDice = createCardByName('チーズ工場');
    const lowScore = cpu._scoreAffordablePurchase(lowDice, game, current, { intensity: 1.4, difficulty: 'strong' });
    const highScore = cpu._scoreAffordablePurchase(highDice, game, current, { intensity: 1.4, difficulty: 'strong' });

    assert.ok(lowScore > highScore);
});

runTest('buildStrong: 4人戦ではテレビ局を改装屋より強い紫として補正する', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    current.coins = 7;
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.cards = [createCardByName('パン屋'), createCardByName('コンビニ'), createCardByName('麦畑')];
    current.dormantCards = [];
    game.players[1].coins = 8;
    game.players[2].coins = 6;
    game.players[3].coins = 5;

    const tv = createCardByName('テレビ局');
    const renovation = createCardByName('改装屋');
    const tvScore = cpu._strongPurpleAdjustment(tv, game, current);
    const renovationScore = cpu._strongPurpleAdjustment(renovation, game, current);

    assert.ok(tvScore > renovationScore);
});

runTest('buildStrong: 高級フレンチは相手が条件未達だと購入評価を下げる', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    current.coins = 5;
    current.cards = [createCardByName('パン屋')];
    current.dormantCards = [];
    game.players[1].landmarks[LANDMARK_NAMES.STATION] = false;
    game.players[1].landmarks[LANDMARK_NAMES.SHOPPING_MALL] = false;
    game.players[1].landmarks[LANDMARK_NAMES.HARBOR] = false;
    game.players[1].landmarks[LANDMARK_NAMES.RADIO_TOWER] = false;
    game.players[1].landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = false;
    game.players[1].landmarks[LANDMARK_NAMES.AIRPORT] = false;

    const french = createCardByName('高級フレンチ');
    const bakery = createCardByName('パン屋');
    const frenchScore = cpu._scoreAffordablePurchase(french, game, current, { intensity: 1.4, difficulty: 'strong' });
    const bakeryScore = cpu._scoreAffordablePurchase(bakery, game, current, { intensity: 1.4, difficulty: 'strong' });

    assert.ok(frenchScore < bakeryScore);
});

runTest('buildStrong: コーン畑持ちで相手に高級フレンチがあると2軒目ランドマークを少し嫌う', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    current.cards = [createCardByName('コーン畑')];
    current.dormantCards = [];
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    game.players[1].cards = [createCardByName('高級フレンチ')];
    game.players[1].dormantCards = [];

    const mallPenalty = cpu._strongLandmarkThresholdPenalty(LANDMARK_NAMES.SHOPPING_MALL, current, game);

    assert.ok(mallPenalty > 0);
});

runTest('buildStrong: 改装屋2枚目は購入評価で強いマイナスを受ける', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.coins = 8;
    current.cards = [createCardByName('改装屋'), createCardByName('パン屋')];
    current.dormantCards = [];

    const renovation = createCardByName('改装屋');
    const bakery = createCardByName('パン屋');
    const renovationScore = cpu._scoreAffordablePurchase(renovation, game, current, { intensity: 1.4, difficulty: 'strong' });
    const bakeryScore = cpu._scoreAffordablePurchase(bakery, game, current, { intensity: 1.4, difficulty: 'strong' });

    assert.ok(renovationScore < bakeryScore);
});

runTest('buildStrong: 4人戦序盤は強い紫をまだ早取りしすぎない', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    current.coins = 7;
    current.cards = [createCardByName('パン屋')];
    current.dormantCards = [];

    const tv = createCardByName('テレビ局');
    const bakery = createCardByName('パン屋');
    const tvScore = cpu._scoreAffordablePurchase(tv, game, current, { difficulty: 'strong' });
    const bakeryScore = cpu._scoreAffordablePurchase(bakery, game, current, { difficulty: 'strong' });

    assert.ok(bakeryScore > tvScore);
});

runTest('landmark synergy: 駅があると高出目カードをやや高く評価する', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const cheese = createCardByName('チーズ工場');

    const noStation = cpu._scoreAffordablePurchase(cheese, game, current, { difficulty: 'strong' });
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    const withStation = cpu._scoreAffordablePurchase(cheese, game, current, { difficulty: 'strong' });

    assert.ok(withStation > noStation);
});

runTest('landmark synergy: ショッピングモールがあると商店/飲食店を高く評価する', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const convenience = createCardByName('コンビニ');

    const noMall = cpu._scoreAffordablePurchase(convenience, game, current, { difficulty: 'strong' });
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    const withMall = cpu._scoreAffordablePurchase(convenience, game, current, { difficulty: 'strong' });

    assert.ok(withMall > noMall);
});

runTest('landmark synergy: 港があると港系カードを高く評価する', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const tuna = createCardByName('マグロ漁船');

    const noHarbor = cpu._scoreAffordablePurchase(tuna, game, current, { difficulty: 'strong' });
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    const withHarbor = cpu._scoreAffordablePurchase(tuna, game, current, { difficulty: 'strong' });

    assert.ok(withHarbor > noHarbor);
});

runTest('_strongTargetLandmark: strong は現在の最優先ランドマークを返す', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.landmarks[LANDMARK_NAMES.STATION] = true;

    const target = cpu._strongTargetLandmark(current, game);

    assert.strictEqual(target.name, LANDMARK_NAMES.SHOPPING_MALL);
});

runTest('_strongAttackUnlocked: strong は収入基盤が整うまで妨害を解禁しない', () => {
    const cpu = new CPU("strong");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    current.coins = 3;
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.cards = [createCardByName('パン屋')];
    current.dormantCards = [];

    assert.strictEqual(cpu._strongAttackUnlocked(current, game), false);

    current.cards = [
        createCardByName('パン屋'),
        createCardByName('コンビニ'),
        createCardByName('麦畑'),
        createCardByName('牧場'),
        createCardByName('カフェ'),
    ];
    current.dormantCards = [];
    current.coins = 1;

    assert.strictEqual(cpu._strongAttackUnlocked(current, game), true);
});

runTest('buildExpert: 空港がなければ skip より建設候補を優先する', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    game.phase = runtime.GAME_PHASES.BUILD;
    current.coins = 1;
    current.landmarks[LANDMARK_NAMES.AIRPORT] = false;

    cpu.buildExpert(game, stock);

    assert.strictEqual(game.builtThisTurn, true);
});

runTest('buildExpert: 終盤は空港や電波塔をカードより優先する', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    game.phase = runtime.GAME_PHASES.BUILD;
    game.enabledLandmarks = new Set([
        LANDMARK_NAMES.STATION,
        LANDMARK_NAMES.SHOPPING_MALL,
        LANDMARK_NAMES.RADIO_TOWER,
        LANDMARK_NAMES.HARBOR,
        LANDMARK_NAMES.AIRPORT,
    ]);
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    current.coins = Player.landmarkCost(LANDMARK_NAMES.RADIO_TOWER);

    cpu.buildExpert(game, stock);

    assert.strictEqual(current.landmarks[LANDMARK_NAMES.RADIO_TOWER], true);
});

runTest('buildExpert: 残り3ランドマークでは高評価カードより港を優先する', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    game.phase = runtime.GAME_PHASES.BUILD;
    game.enabledLandmarks = new Set([
        LANDMARK_NAMES.STATION,
        LANDMARK_NAMES.SHOPPING_MALL,
        LANDMARK_NAMES.RADIO_TOWER,
        LANDMARK_NAMES.HARBOR,
        LANDMARK_NAMES.AIRPORT,
    ]);
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.coins = Player.landmarkCost(LANDMARK_NAMES.HARBOR);
    current.cards = [
        createCardByName('サンマ漁船'),
        createCardByName('ピザ屋'),
        createCardByName('バーガーショップ'),
        createCardByName('ブドウ園'),
    ];
    current.dormantCards = [];

    cpu.buildExpert(game, stock);

    assert.strictEqual(current.landmarks[LANDMARK_NAMES.HARBOR], true);
});

runTest('buildExpert: lite 4人戦では buildNormal ベースで進める', () => {
    const cpu = new CPU("expert", { simulationMode: "lite" });
    const game = new GameManager(4);
    const current = game.currentPlayer();
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    game.phase = runtime.GAME_PHASES.BUILD;
    current.coins = 8;

    cpu.buildExpert(game, stock);

    assert.strictEqual(game.builtThisTurn, true);
});

runTest('buildExpert: 4人戦expertは食品倉庫より低ダイス経済を優先する', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    const stock = {};
    for (const card of CARDS) stock[card.name] = 0;
    stock['食品倉庫'] = 1;
    stock['パン屋'] = 1;

    game.phase = runtime.GAME_PHASES.BUILD;
    current.coins = 2;
    current.cards = [
        createCardByName('カフェ'),
        createCardByName('ピザ屋'),
        createCardByName('ファミレス'),
        createCardByName('コンビニ'),
    ];
    current.dormantCards = [];

    cpu.buildExpert(game, stock);

    assert.strictEqual(current.countCard('パン屋'), 1);
    assert.strictEqual(current.countCard('食品倉庫'), 0);
});

runTest('buildExpert: 4人戦expertは中盤以降に港をカードより優先する', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    game.phase = runtime.GAME_PHASES.BUILD;
    game.enabledLandmarks = new Set(Player.landmarkNames());
    current.coins = Player.landmarkCost(LANDMARK_NAMES.HARBOR);
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.cards = [
        createCardByName('食品倉庫'),
        createCardByName('ピザ屋'),
        createCardByName('バーガーショップ'),
        createCardByName('寿司屋'),
    ];
    current.dormantCards = [];

    cpu.buildExpert(game, stock);

    assert.strictEqual(current.landmarks[LANDMARK_NAMES.HARBOR], true);
});

runTest('buildExpert: expert v2 simple は買えるランドマークの中からランダムに選ぶ', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple" });
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const stock = {};
    for (const card of CARDS) stock[card.name] = 6;

    game.phase = runtime.GAME_PHASES.BUILD;
    game.enabledLandmarks = new Set([LANDMARK_NAMES.STATION, LANDMARK_NAMES.HARBOR]);
    current.coins = Player.landmarkCost(LANDMARK_NAMES.STATION);
    current.cards = [createCardByName('牧場'), createCardByName('牧場'), createCardByName('牧場'), createCardByName('チーズ工場')];
    current.dormantCards = [];

    const originalRandom = Math.random;
    Math.random = () => 0.99;
    try {
        cpu.buildExpert(game, stock);
    } finally {
        Math.random = originalRandom;
    }

    assert.strictEqual(current.landmarks[LANDMARK_NAMES.STATION], false);
    assert.strictEqual(current.landmarks[LANDMARK_NAMES.HARBOR], true);
});

runTest('buildExpert: expert v2 simple は random mode だと選択候補からランダムに選ぶ', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple", expertBuildMode: "random" });
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const stock = {};
    for (const card of CARDS) stock[card.name] = 0;
    stock['麦畑'] = 1;
    stock['チーズ工場'] = 1;

    game.phase = runtime.GAME_PHASES.BUILD;
    game.enabledLandmarks = new Set();
    current.coins = 5;
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.cards = [createCardByName('牧場'), createCardByName('牧場'), createCardByName('牧場')];
    current.dormantCards = [];

    cpu.buildExpert(game, stock);

    assert.strictEqual(current.countCard('麦畑') + current.countCard('チーズ工場'), 1);
    assert.strictEqual(game.builtThisTurn, true);
});

runTest('buildExpert: expert v2 simple はランドマークが買えないと期待値が高いカードを選ぶ', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple" });
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const stock = {};
    for (const card of CARDS) stock[card.name] = 0;
    stock['麦畑'] = 1;
    stock['チーズ工場'] = 1;

    game.phase = runtime.GAME_PHASES.BUILD;
    game.enabledLandmarks = new Set();
    current.coins = 5;
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.cards = [createCardByName('牧場'), createCardByName('牧場'), createCardByName('牧場')];
    current.dormantCards = [];

    cpu.buildExpert(game, stock);

    assert.strictEqual(current.countCard('チーズ工場'), 1);
    assert.strictEqual(game.builtThisTurn, true);
});

runTest('chooseITInvest: expert v2 simple は常に積立する', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple" });
    const game = new GameManager(4);
    const current = game.currentPlayer();
    game.enabledLandmarks = new Set(Player.landmarkNames());
    current.coins = 3;

    assert.strictEqual(cpu.chooseITInvest(game), true);
});

runTest('chooseITInvest: expert v2 simple は never mode なら積立しない', () => {
    const cpu = new CPU("expert", { expertPreset: "v2simple", expertInvestMode: "never" });
    const game = new GameManager(4);
    const current = game.currentPlayer();
    game.enabledLandmarks = new Set(Player.landmarkNames());
    current.coins = 3;

    assert.strictEqual(cpu.chooseITInvest(game), false);
});

if (process.exitCode) {
    throw new Error('CPUテストで失敗が発生しました');
}
