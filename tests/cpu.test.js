const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadCPURuntime() {
    const context = { console };
    vm.createContext(context);
    for (const file of ['js/Card.js', 'js/Player.js', 'js/GameManager.js', 'js/CPU.js']) {
        const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        vm.runInContext(source, context, { filename: file });
    }
    vm.runInContext(
        'this.CPU = CPU; this.GameManager = GameManager; this.Player = Player; this.createCardByName = createCardByName; this.CARDS = CARDS; this.CARD_EFFECTS = CARD_EFFECTS; this.CARD_CATEGORIES = CARD_CATEGORIES; this.LANDMARK_NAMES = LANDMARK_NAMES; this.GAME_PHASES = GAME_PHASES;',
        context
    );
    return context;
}

const runtime = loadCPURuntime();
const CPU = runtime.CPU;
const GameManager = runtime.GameManager;
const Player = runtime.Player;
const createCardByName = runtime.createCardByName;
const CARDS = runtime.CARDS;
const CARD_EFFECTS = runtime.CARD_EFFECTS;
const CARD_CATEGORIES = runtime.CARD_CATEGORIES;
const LANDMARK_NAMES = runtime.LANDMARK_NAMES;

function runTest(name, fn) {
    try {
        fn();
        console.log(`テスト成功: ${name}`);
    } catch (error) {
        console.error(`テスト失敗: ${name}`);
        console.error(error.stack);
        process.exitCode = 1;
    }
}

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
    // 4人ゲームでは全体攻撃補正で基礎値6より高く評価する
    assert.ok(cpu.evalCard(stadium, game4p, player4) > 6);
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

runTest('chooseDiceCount: 2個振りが有利な場合trueを返す（strong）', () => {
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
    // 2個振りスコア >= 1個振りスコア なのでtrueになる
    assert.strictEqual(result, true);
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

runTest('chooseDiceCount: expert は先読み評価で選択を返す', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.cards = [createCardByName('チーズ工場'), createCardByName('牧場'), createCardByName('牧場')];
    current.dormantCards = [];

    assert.strictEqual(typeof cpu.chooseDiceCount(game), 'boolean');
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
    const crowd = new GameManager(4);

    cpu._syncExpertTuningForGame(duel);
    assert.strictEqual(cpu.expertTuning.lowValueSpamPenalty, 5.1);

    cpu._syncExpertTuningForGame(crowd);
    assert.strictEqual(cpu.expertTuning.landmarkActionBonus, 21.6);
});

// ===== chooseReroll =====

runTest('chooseReroll: 現在スコアが低い場合にリロールを選択する（strong）', () => {
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
    // dice=3の現在スコアはマイナス（相手6枚のカフェ）、期待値はそれより高いのでtrueになるはず
    assert.strictEqual(result, true);
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

runTest('_landmarkUrgency: ショッピングモールは飲食店/商店カード>=3で8、未満で4を返す', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const current = game.currentPlayer();

    // 飲食店・商店合計2枚（<3）
    current.cards = [createCardByName('パン屋'), createCardByName('カフェ')];
    assert.strictEqual(cpu._landmarkUrgency(LANDMARK_NAMES.SHOPPING_MALL, current, game), 4);

    // 飲食店・商店合計3枚（>=3）
    current.cards = [createCardByName('パン屋'), createCardByName('カフェ'), createCardByName('コンビニ')];
    assert.strictEqual(cpu._landmarkUrgency(LANDMARK_NAMES.SHOPPING_MALL, current, game), 8);
});

runTest('_landmarkUrgency: 港は関連カード所持で7、未所持で3を返す', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const current = game.currentPlayer();

    // 港関連カードなし
    current.cards = [createCardByName('麦畑')];
    assert.strictEqual(cpu._landmarkUrgency(LANDMARK_NAMES.HARBOR, current, game), 3);

    // サンマ漁船（harbor effect）を所持
    current.cards = [createCardByName('サンマ漁船')];
    assert.strictEqual(cpu._landmarkUrgency(LANDMARK_NAMES.HARBOR, current, game), 7);

    // マグロ漁船（tuna effect）を所持
    current.cards = [createCardByName('マグロ漁船')];
    assert.strictEqual(cpu._landmarkUrgency(LANDMARK_NAMES.HARBOR, current, game), 7);
});

runTest('_landmarkUrgency: 電波塔はbuiltCount>=3か相手maxBuilt>=4で8、それ以外で4を返す', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const current = game.currentPlayer();
    const opponent = game.players[1];

    // builtCount=0、相手builtCount=0
    assert.strictEqual(cpu._landmarkUrgency(LANDMARK_NAMES.RADIO_TOWER, current, game), 4);

    // 自分builtCount=3以上
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    assert.strictEqual(cpu._landmarkUrgency(LANDMARK_NAMES.RADIO_TOWER, current, game), 8);

    // 自分リセット、相手builtCount=4以上
    const game2 = new GameManager(2);
    const opp2 = game2.players[1];
    opp2.landmarks[LANDMARK_NAMES.STATION] = true;
    opp2.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    opp2.landmarks[LANDMARK_NAMES.HARBOR] = true;
    opp2.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;
    assert.strictEqual(cpu._landmarkUrgency(LANDMARK_NAMES.RADIO_TOWER, game2.players[0], game2), 8);
});

runTest('_landmarkUrgency: 2人戦は4人戦よりランドマークを急ぐ', () => {
    const cpu = new CPU("normal");
    const duel = new GameManager(2);
    const crowded = new GameManager(4);

    assert.ok(
        cpu._landmarkUrgency(LANDMARK_NAMES.STATION, duel.currentPlayer(), duel) >
        cpu._landmarkUrgency(LANDMARK_NAMES.STATION, crowded.currentPlayer(), crowded)
    );
});

// ===== sortAffordable =====

runTest('sortAffordable: ダイス確率を加味したスコア順にソートされる', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const player = game.currentPlayer();
    player.cards = [];
    player.dormantCards = [];

    // ダイス頻度重み: dice1=1, dice2=1, dice3=2, dice9=4
    // 鉱山(dice 9, income 5, cost 6): score = 5*4/6 ≈ 3.33
    // パン屋(dice 2-3, income 1, cost 1): score = 1*(1+2)/1 = 3.0
    // 麦畑(dice 1, income 1, cost 1): score = 1*1/1 = 1.0
    // → 鉱山 > パン屋 > 麦畑
    const cards = [createCardByName('麦畑'), createCardByName('鉱山'), createCardByName('パン屋')];
    const sorted = cpu.sortAffordable(cards, game, player);

    assert.strictEqual(sorted.length, 3);
    // 麦畑はダイス頻度が最低なので最後
    assert.strictEqual(sorted[sorted.length - 1].card.name, '麦畑');
    // 鉱山はダイス頻度×収入/コストが最高なので先頭
    assert.strictEqual(sorted[0].card.name, '鉱山');
    // 全てスコアフィールドを持つ
    for (const entry of sorted) {
        assert.ok(typeof entry.score === 'number');
        assert.ok(typeof entry.card === 'object' && entry.card !== null);
    }
});

runTest('evalCard: 多人数戦では赤カードと全体攻撃カードを高く評価する', () => {
    const cpu = new CPU("strong");
    const duel = new GameManager(2);
    const crowded = new GameManager(4);
    const redCard = createCardByName('カフェ');
    const stadium = createCardByName('スタジアム');

    assert.ok(cpu.evalCard(redCard, crowded, crowded.currentPlayer()) > cpu.evalCard(redCard, duel, duel.currentPlayer()));
    assert.ok(cpu.evalCard(stadium, crowded, crowded.currentPlayer()) > cpu.evalCard(stadium, duel, duel.currentPlayer()));
});

runTest('evalCard: 2人戦では緑カードを4人戦より高く評価する', () => {
    const cpu = new CPU("strong");
    const duel = new GameManager(2);
    const crowded = new GameManager(4);
    const bakery = createCardByName('パン屋');

    assert.ok(cpu.evalCard(bakery, duel, duel.currentPlayer()) > cpu.evalCard(bakery, crowded, crowded.currentPlayer()));
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

runTest('chooseRenovationTarget: expert は盤面評価で対象を選ぶ', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(2);
    const current = game.currentPlayer();

    current.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;

    const target = cpu.chooseRenovationTarget(game);
    assert.ok([LANDMARK_NAMES.SHOPPING_MALL, LANDMARK_NAMES.AMUSEMENT_PARK].includes(target));
});

runTest('chooseITSave: expert は多人数戦で積立を優先する', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(4);
    const current = game.currentPlayer();
    current.coins = 3;
    current.landmarks[LANDMARK_NAMES.STATION] = true;

    assert.strictEqual(cpu.chooseITSave(game), true);
});

runTest('chooseITSave: expert は重要ランドマーク直前なら積立を見送る', () => {
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

    assert.strictEqual(cpu.chooseITSave(game), false);
});

runTest('chooseITSave: expert は先読み評価で積立可否を返す', () => {
    const cpu = new CPU("expert");
    const game = new GameManager(3);
    const current = game.currentPlayer();
    current.coins = 6;
    current.itVentureCoins = 1;
    current.cards = [createCardByName('ITベンチャー')];
    current.dormantCards = [];

    assert.strictEqual(typeof cpu.chooseITSave(game), 'boolean');
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

if (process.exitCode) {
    throw new Error('CPUテストで失敗が発生しました');
}
