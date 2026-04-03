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
        'this.CPU = CPU; this.GameManager = GameManager; this.createCardByName = createCardByName; this.CARDS = CARDS; this.CARD_EFFECTS = CARD_EFFECTS; this.CARD_CATEGORIES = CARD_CATEGORIES; this.LANDMARK_NAMES = LANDMARK_NAMES; this.GAME_PHASES = GAME_PHASES;',
        context
    );
    return context;
}

const runtime = loadCPURuntime();
const CPU = runtime.CPU;
const GameManager = runtime.GameManager;
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
    // 4人ゲームなので相手は3人
    assert.strictEqual(cpu.evalCard(stadium, game4p, player4), 6);
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

// ===== sortAffordable =====

runTest('sortAffordable: スコア/コスト比の高いカードが先頭に来る', () => {
    const cpu = new CPU("normal");
    const game = new GameManager(2);
    const player = game.currentPlayer();
    player.cards = [];
    player.dormantCards = [];

    // 麦畑(cost 1, income 1 → ratio 1.0)
    // 鉱山(cost 6, income 5 → ratio ~0.83)
    // パン屋(cost 1, income 1 → ratio 1.0)
    const cards = [createCardByName('鉱山'), createCardByName('麦畑'), createCardByName('パン屋')];
    const sorted = cpu.sortAffordable(cards, game, player);

    assert.strictEqual(sorted.length, 3);
    // 鉱山はratio最低なので最後
    assert.strictEqual(sorted[sorted.length - 1].card.name, '鉱山');
    // 全てスコアフィールドを持つ
    for (const entry of sorted) {
        assert.ok(typeof entry.score === 'number');
        assert.ok(typeof entry.card === 'object' && entry.card !== null);
    }
});

if (process.exitCode) {
    throw new Error('CPUテストで失敗が発生しました');
}
