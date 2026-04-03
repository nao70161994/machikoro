const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadGameRuntime() {
    const context = { console };
    vm.createContext(context);
    for (const file of ['js/Card.js', 'js/Player.js', 'js/GameManager.js']) {
        const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        vm.runInContext(source, context, { filename: file });
    }
    vm.runInContext(
        'this.GameManager = GameManager; this.createCardByName = createCardByName; this.CARDS = CARDS; this.LOG_TYPES = LOG_TYPES;',
        context
    );
    return context;
}

const runtime = loadGameRuntime();
const GameManager = runtime.GameManager;
const createCardByName = runtime.createCardByName;

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

runTest('rollDice後にフェーズが適切に遷移する', () => {
    const normalGame = new GameManager(2);
    normalGame.rollDice(1);
    assert.strictEqual(normalGame.phase, 'build');

    const stationGame = new GameManager(2);
    stationGame.currentPlayer().landmarks['駅'] = true;
    stationGame.rollDice();
    assert.strictEqual(stationGame.phase, 'selectDice');
    stationGame.selectDiceCount(false, 1);
    assert.strictEqual(stationGame.phase, 'build');
});

runTest('改装屋のpendingRenovationがランドマーク状況に応じて変化する', () => {
    const pendingGame = new GameManager(2);
    pendingGame.currentPlayer().addCard(createCardByName('改装屋'));
    pendingGame.currentPlayer().landmarks['駅'] = true;
    pendingGame.rollDice();
    pendingGame.selectDiceCount(false, 4);
    assert.strictEqual(pendingGame.pendingRenovation, 1);
    assert.strictEqual(pendingGame.phase, 'pending');

    const skipGame = new GameManager(2);
    skipGame.currentPlayer().addCard(createCardByName('改装屋'));
    skipGame.rollDice(4);
    assert.strictEqual(skipGame.pendingRenovation, 0);
    assert.strictEqual(skipGame.phase, 'build');
});

runTest('buildCardが所持金不足と紫カード重複を拒否する', () => {
    const poorGame = new GameManager(2);
    poorGame.currentPlayer().coins = 5;
    assert.strictEqual(poorGame.buildCard(createCardByName('鉱山')), false);
    assert.strictEqual(poorGame.currentPlayer().coins, 5);

    const duplicateGame = new GameManager(2);
    duplicateGame.currentPlayer().coins = 20;
    duplicateGame.currentPlayer().addCard(createCardByName('スタジアム'));
    assert.strictEqual(duplicateGame.buildCard(createCardByName('スタジアム')), false);
    assert.strictEqual(duplicateGame.currentPlayer().coins, 20);
});

runTest('nextTurnでpendingRenovationがリセットされる', () => {
    const game = new GameManager(2);
    game.phase = 'build';
    game.pendingRenovation = 2;
    game.nextTurn();
    assert.strictEqual(game.pendingRenovation, 0);
    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.strictEqual(game.phase, 'roll');
});

runTest('引越し屋とビジネスセンターがカード単位で休業状態を引き継ぐ', () => {
    const moverGame = new GameManager(2);
    const moverCard = createCardByName('引越し屋');
    const cafeA = createCardByName('カフェ');
    const cafeB = createCardByName('カフェ');
    moverGame.currentPlayer().cards = [cafeA, cafeB, moverCard];
    moverGame.currentPlayer().dormantCards = [];
    moverGame.players[1].cards = [];
    moverGame.players[1].dormantCards = [];
    moverGame.currentPlayer().makeDormant(cafeB);
    moverGame.resolveMover(1, 1);
    assert.strictEqual(moverGame.players[1].cards.length, 1);
    assert.strictEqual(moverGame.players[1].cards[0], cafeB);
    assert.strictEqual(moverGame.players[1].isDormant(cafeB), true);
    assert.strictEqual(moverGame.currentPlayer().cards.includes(cafeB), false);

    const businessGame = new GameManager(2);
    const bakeryA = createCardByName('パン屋');
    const bakeryB = createCardByName('パン屋');
    const forest = createCardByName('森林');
    businessGame.currentPlayer().cards = [bakeryA, bakeryB];
    businessGame.players[1].cards = [forest];
    businessGame.currentPlayer().dormantCards = [];
    businessGame.players[1].dormantCards = [];
    businessGame.currentPlayer().makeDormant(bakeryB);
    businessGame.resolveBusiness(1, 1, 0);
    assert.strictEqual(businessGame.players[1].cards.includes(bakeryB), true);
    assert.strictEqual(businessGame.players[1].isDormant(bakeryB), true);
    assert.strictEqual(businessGame.currentPlayer().cards.some(c => c.name === '森林'), true);
});

runTest('清掃業は同名カードを全て休業にする', () => {
    const game = new GameManager(2);
    const cafeA = createCardByName('カフェ');
    const cafeB = createCardByName('カフェ');
    const family = createCardByName('ファミレス');
    game.currentPlayer().cards = [cafeA, family];
    game.currentPlayer().dormantCards = [];
    game.players[1].cards = [cafeB];
    game.players[1].dormantCards = [];

    game.resolveCleaning('カフェ');

    assert.strictEqual(game.currentPlayer().isDormant(cafeA), true);
    assert.strictEqual(game.players[1].isDormant(cafeB), true);
    assert.strictEqual(game.currentPlayer().isDormant(family), false);
});

runTest('ワイナリーは発動したカードだけ休業する', () => {
    const game = new GameManager(2);
    const grape = createCardByName('ブドウ園');
    const wineryA = createCardByName('ワイナリー');
    const wineryB = createCardByName('ワイナリー');
    game.currentPlayer().cards = [grape, wineryA, wineryB];
    game.currentPlayer().dormantCards = [];
    game.currentPlayer().makeDormant(wineryA);

    game.rollDice(9);

    assert.strictEqual(game.currentPlayer().isDormant(wineryA), false);
    assert.strictEqual(game.currentPlayer().isDormant(wineryB), true);
});

runTest('遊園地はサイコロを振った時点で所持していないと発動しない', () => {
    const game = new GameManager(2);
    game.phase = 'build';
    game.lastDice1 = 3;
    game.lastDice2 = 3;
    game.hadAmusementParkAtRoll = false;
    game.currentPlayer().landmarks['遊園地'] = true;

    game.nextTurn();

    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.strictEqual(game.phase, 'roll');
});

runTest('有効なランドマークだけ建てれば勝利になる', () => {
    const game = new GameManager(2);
    game.enabledLandmarks = new Set(['駅', 'ショッピングモール']);
    game.currentPlayer().landmarks['駅'] = true;
    assert.strictEqual(game.checkWinner(), null);

    game.currentPlayer().landmarks['ショッピングモール'] = true;
    assert.strictEqual(game.checkWinner(), game.currentPlayer());
});

runTest('テレビ局はresolveTVで指定プレイヤーから最大5コイン奪う', () => {
    const game = new GameManager(2);
    game.pendingTV = 1;
    game.phase = 'pending';
    game.players[1].coins = 10;
    const prevMyCoins = game.currentPlayer().coins;

    game.resolveTV(1);

    assert.strictEqual(game.currentPlayer().coins, prevMyCoins + 5);
    assert.strictEqual(game.players[1].coins, 5);
    assert.strictEqual(game.pendingTV, 0);

    // 相手コインが少ない場合は持っている分だけ奪う
    const game2 = new GameManager(2);
    game2.pendingTV = 1;
    game2.phase = 'pending';
    game2.players[1].coins = 3;
    const prev2 = game2.currentPlayer().coins;
    game2.resolveTV(1);
    assert.strictEqual(game2.currentPlayer().coins, prev2 + 3);
    assert.strictEqual(game2.players[1].coins, 0);
});

runTest('ITベンチャーはresolveIT(true)で積立、false でスキップ', () => {
    // resolveIT は _doNextTurn() を呼ぶのでターンが移る → players[0] で直接確認
    const game = new GameManager(2);
    game.pendingIT = true;
    const p0 = game.players[0];
    p0.coins = 5;
    p0.itVentureCoins = 2;

    game.resolveIT(true);

    assert.strictEqual(p0.coins, 4);           // 5 - 1
    assert.strictEqual(p0.itVentureCoins, 3);  // 2 + 1
    assert.strictEqual(game.currentPlayerIndex, 1); // ターンが次へ

    const game2 = new GameManager(2);
    game2.pendingIT = true;
    const p0b = game2.players[0];
    p0b.coins = 5;
    p0b.itVentureCoins = 1;

    game2.resolveIT(false);

    assert.strictEqual(p0b.coins, 5);          // 変化なし
    assert.strictEqual(p0b.itVentureCoins, 1); // 変化なし
});

runTest('電波塔rerollDiceはlogをリセットしてphaseをrollに戻す', () => {
    const game = new GameManager(2);
    game.currentPlayer().landmarks['電波塔'] = true;
    game.rollDice(3);
    assert.strictEqual(game.phase, 'rerollConfirm');
    const logBeforeReroll = [...game.log];
    assert.ok(logBeforeReroll.length > 0);

    game.rerollDice(5);

    // rerollDice内でlog=[]→addLogするのでログがリセットされ新エントリのみになる
    assert.ok(!game.log.includes(logBeforeReroll[0]));
    assert.ok(game.log.some(e => e.message.startsWith('📡')));
});

runTest('nextTurnでgame.logがリセットされ新ターンのエントリになる', () => {
    const game = new GameManager(2);
    game.rollDice(1);
    game.phase = 'build';
    const prevLog = [...game.log];
    assert.ok(prevLog.length > 0);

    game.nextTurn();

    assert.ok(!game.log.some(e => prevLog.includes(e) && !e.message.startsWith('👤')));
    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.ok(game.log.some(e => e.message.startsWith('👤')));
});

runTest('CARDSを色順→ダイス出目順にソートできる', () => {
    const COLOR_ORDER = { blue: 0, green: 1, red: 2, purple: 3 };
    const sorted = [...runtime.CARDS].sort((a, b) => {
        const cd = (COLOR_ORDER[a.color] ?? 9) - (COLOR_ORDER[b.color] ?? 9);
        if (cd !== 0) return cd;
        return Math.min(...a.diceNums) - Math.min(...b.diceNums);
    });
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1], cur = sorted[i];
        const po = COLOR_ORDER[prev.color] ?? 9;
        const co = COLOR_ORDER[cur.color] ?? 9;
        assert.ok(po <= co, `色順が正しくない: ${prev.name}(${prev.color}) > ${cur.name}(${cur.color})`);
        if (po === co) {
            assert.ok(
                Math.min(...prev.diceNums) <= Math.min(...cur.diceNums),
                `同色内のダイス順が正しくない: ${prev.name} > ${cur.name}`
            );
        }
    }
});

runTest('駅あり rollDice → selectDice → selectDiceCount でフェーズが進む', () => {
    const game = new GameManager(2);
    game.currentPlayer().landmarks['駅'] = true;

    game.rollDice();
    assert.strictEqual(game.phase, 'selectDice');

    game.selectDiceCount(false, 3);
    assert.strictEqual(game.phase, 'build');
    assert.strictEqual(game.lastDiceResult, 3);

    // 2個振りも同様に進む
    const game2 = new GameManager(2);
    game2.currentPlayer().landmarks['駅'] = true;
    game2.rollDice();
    game2.selectDiceCount(true, 2, 4);
    assert.strictEqual(game2.lastDiceResult, 6);
    assert.strictEqual(game2.phase, 'build');
});

runTest('駅+電波塔 selectDiceCount → rerollConfirm → rerollDice でフェーズが進む', () => {
    const game = new GameManager(2);
    game.currentPlayer().landmarks['駅'] = true;
    game.currentPlayer().landmarks['電波塔'] = true;

    game.rollDice();
    assert.strictEqual(game.phase, 'selectDice');

    game.selectDiceCount(false, 3);
    assert.strictEqual(game.phase, 'rerollConfirm');
    assert.strictEqual(game.lastDiceResult, 3);

    // rerollDice → rollDice → 駅あり → selectDice に戻る（usedReroll=true）
    game.rerollDice();
    assert.strictEqual(game.phase, 'selectDice');
    assert.strictEqual(game.usedReroll, true);

    // 2回目のselectDiceCount: usedReroll=true なので電波塔が発動せずbuildへ
    game.selectDiceCount(false, 5);
    assert.strictEqual(game.phase, 'build');
    assert.strictEqual(game.lastDiceResult, 5);
});

runTest('駅+港 2個振り sum≥10 → harborChoice → resolveHarbor でフェーズが進む', () => {
    const game = new GameManager(2);
    game.currentPlayer().landmarks['駅'] = true;
    game.currentPlayer().landmarks['港'] = true;

    game.rollDice();
    game.selectDiceCount(true, 5, 6); // sum=11
    assert.strictEqual(game.phase, 'harborChoice');
    assert.strictEqual(game.lastDiceResult, 11);

    game.resolveHarbor(true);
    assert.strictEqual(game.lastDiceResult, 13);
    assert.strictEqual(game.phase, 'build');

    // +2しない場合
    const game2 = new GameManager(2);
    game2.currentPlayer().landmarks['駅'] = true;
    game2.currentPlayer().landmarks['港'] = true;
    game2.rollDice();
    game2.selectDiceCount(true, 5, 6);
    game2.resolveHarbor(false);
    assert.strictEqual(game2.lastDiceResult, 11);
    assert.strictEqual(game2.phase, 'build');

    // sum<10 では harborChoice に入らない
    const game3 = new GameManager(2);
    game3.currentPlayer().landmarks['駅'] = true;
    game3.currentPlayer().landmarks['港'] = true;
    game3.rollDice();
    game3.selectDiceCount(true, 3, 4); // sum=7
    assert.strictEqual(game3.phase, 'build');
});

runTest('駅+電波塔+港の3段フェーズ遷移が正しく動く', () => {
    const game = new GameManager(2);
    game.currentPlayer().landmarks['駅'] = true;
    game.currentPlayer().landmarks['電波塔'] = true;
    game.currentPlayer().landmarks['港'] = true;

    // roll → selectDice
    game.rollDice();
    assert.strictEqual(game.phase, 'selectDice');

    // selectDice → 2個振り sum=10 → 電波塔があるのでrerollConfirm
    game.selectDiceCount(true, 4, 6);
    assert.strictEqual(game.phase, 'rerollConfirm');

    // skipReroll → 港判定 → harborChoice
    game.skipReroll();
    assert.strictEqual(game.phase, 'harborChoice');
    assert.strictEqual(game.lastDiceResult, 10);

    // harborChoice → +2 → build
    game.resolveHarbor(true);
    assert.strictEqual(game.lastDiceResult, 12);
    assert.strictEqual(game.phase, 'build');
});

runTest('ITベンチャーのnextTurnでpendingITが設定されresolveIT後にターンが進む', () => {
    const game = new GameManager(2);
    game.currentPlayer().addCard(createCardByName('ITベンチャー'));
    game.phase = 'build';

    game.nextTurn();

    assert.strictEqual(game.pendingIT, true);
    assert.strictEqual(game.currentPlayerIndex, 0); // まだターン変わっていない

    game.resolveIT(false);
    assert.strictEqual(game.pendingIT, false);
    assert.strictEqual(game.currentPlayerIndex, 1);
    assert.strictEqual(game.phase, 'roll');
});

// ===== LOG_TYPES / addLog 構造 =====

runTest('addLogエントリが{type,message}構造を持ちLOG_TYPESの値を使う', () => {
    const LOG_TYPES = runtime.LOG_TYPES;
    assert.ok(LOG_TYPES, 'LOG_TYPESがエクスポートされていない');
    const validTypes = new Set(Object.values(LOG_TYPES));
    const game = new GameManager(2);
    game.rollDice(1); // 🎲ダイス + 麦畑収入(gain)
    assert.ok(game.log.length > 0, 'ログが空');
    for (const entry of game.log) {
        assert.ok(typeof entry === 'object' && entry !== null, `エントリがオブジェクトでない: ${JSON.stringify(entry)}`);
        assert.ok(typeof entry.type === 'string', 'typeが文字列でない');
        assert.ok(typeof entry.message === 'string', 'messageが文字列でない');
        assert.ok(validTypes.has(entry.type), `未知のtype: ${entry.type}`);
    }
    assert.ok(game.log.some(e => e.type === LOG_TYPES.DICE), 'diceタイプがない');
    assert.ok(game.log.some(e => e.type === LOG_TYPES.GAIN), 'gainタイプがない');
});

// ===== processIncome / 収入計算 =====

runTest('青カード（麦畑）がダイス1で全プレイヤーに収入をもたらす', () => {
    const game = new GameManager(2);
    const coins0 = game.players[0].coins;
    const coins1 = game.players[1].coins;
    // 両者が麦畑(dice 1, +1)を初期所持
    game.rollDice(1);
    assert.strictEqual(game.players[0].coins, coins0 + 1);
    assert.strictEqual(game.players[1].coins, coins1 + 1);
});

runTest('赤カード（カフェ）は現在プレイヤーから1コイン徴収する', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    const p1 = game.players[1];
    p0.cards = [createCardByName('麦畑')];
    p0.dormantCards = [];
    p1.cards = [createCardByName('カフェ')]; // red, dice 3, income 1
    p1.dormantCards = [];
    p0.coins = 5;
    p1.coins = 0;
    game.rollDice(3);
    assert.strictEqual(p0.coins, 4);
    assert.strictEqual(p1.coins, 1);
    assert.ok(game.log.some(e => e.type === 'lose'));
    // p0のコインが0なら徴収なし
    const game2 = new GameManager(2);
    game2.currentPlayer().cards = [];
    game2.currentPlayer().dormantCards = [];
    game2.players[1].cards = [createCardByName('カフェ')];
    game2.players[1].dormantCards = [];
    game2.currentPlayer().coins = 0;
    game2.players[1].coins = 0;
    game2.rollDice(3);
    assert.strictEqual(game2.players[1].coins, 0);
});

runTest('チーズ工場は牧場枚数×3コインを得る', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.cards = [createCardByName('牧場'), createCardByName('牧場'), createCardByName('チーズ工場')];
    p0.dormantCards = [];
    const coinsBefore = p0.coins;
    game.rollDice(7); // チーズ工場 dice=7
    assert.strictEqual(p0.coins, coinsBefore + 6); // 2牧場 × 3
    // 牧場0枚の場合は収入なし
    const game2 = new GameManager(2);
    const p0b = game2.currentPlayer();
    p0b.cards = [createCardByName('チーズ工場')];
    p0b.dormantCards = [];
    const coinsBefore2 = p0b.coins;
    game2.rollDice(7);
    assert.strictEqual(p0b.coins, coinsBefore2);
});

runTest('ショッピングモール所持で飲食店・商店の緑カードが+1コイン', () => {
    // モールなし: パン屋(飲食店, dice 2-3, income 1) → +1
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.cards = [createCardByName('パン屋')];
    p0.dormantCards = [];
    p0.coins = 0;
    game.rollDice(2);
    assert.strictEqual(p0.coins, 1);
    // モールあり: パン屋 → +2
    const game2 = new GameManager(2);
    const p0b = game2.currentPlayer();
    p0b.cards = [createCardByName('パン屋')];
    p0b.dormantCards = [];
    p0b.landmarks['ショッピングモール'] = true;
    p0b.coins = 0;
    game2.rollDice(2);
    assert.strictEqual(p0b.coins, 2);
});

runTest('貸金業は5か6が出ると枚数×2コイン支払う', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.cards = [createCardByName('貸金業'), createCardByName('貸金業')];
    p0.dormantCards = [];
    p0.coins = 10;
    game.rollDice(5); // 2枚 × 2 = 4コイン支払い
    assert.strictEqual(p0.coins, 6);
    assert.ok(game.log.some(e => e.type === 'lose' && e.message.includes('貸金業')));
    // 5か6以外は支払いなし
    const game2 = new GameManager(2);
    const p0b = game2.currentPlayer();
    p0b.cards = [createCardByName('貸金業')];
    p0b.dormantCards = [];
    p0b.coins = 10;
    game2.rollDice(3);
    assert.strictEqual(p0b.coins, 10);
});

// ===== buildCard / buildLandmark =====

runTest('buildCardが成功するとコインが減りカードが追加される', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.coins = 10;
    const result = game.buildCard(createCardByName('森林')); // cost 3
    assert.strictEqual(result, true);
    assert.strictEqual(p0.coins, 7);
    assert.ok(p0.cards.some(c => c.name === '森林'));
    assert.strictEqual(game.builtThisTurn, true);
    assert.ok(game.log.some(e => e.type === 'build' && e.message.includes('森林')));
    // 貸金業はcost 0で建設後+5コイン付与
    const game2 = new GameManager(2);
    game2.currentPlayer().coins = 10;
    game2.buildCard(createCardByName('貸金業')); // cost 0, +5
    assert.strictEqual(game2.currentPlayer().coins, 15);
});

runTest('buildLandmarkが成功するとコインが減りランドマークが建設される', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.coins = 10;
    const result = game.buildLandmark('駅'); // cost 4
    assert.strictEqual(result, true);
    assert.strictEqual(p0.coins, 6);
    assert.strictEqual(p0.landmarks['駅'], true);
    assert.strictEqual(game.builtThisTurn, true);
    assert.ok(game.log.some(e => e.type === 'build' && e.message.includes('駅')));
    // 二重建設は拒否
    const game2 = new GameManager(2);
    game2.currentPlayer().coins = 20;
    game2.currentPlayer().landmarks['駅'] = true;
    assert.strictEqual(game2.buildLandmark('駅'), false);
});

// ===== ランドマーク効果 =====

runTest('空港効果：建設しないターン終了で+10コイン', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.landmarks['空港'] = true;
    game.phase = 'build';
    game.builtThisTurn = false;
    const coinsBefore = p0.coins;
    game.nextTurn();
    assert.strictEqual(p0.coins, coinsBefore + 10);
    // 建設済みの場合は+10されない
    const game2 = new GameManager(2);
    game2.currentPlayer().landmarks['空港'] = true;
    game2.phase = 'build';
    game2.builtThisTurn = true;
    const coinsBefore2 = game2.players[0].coins;
    game2.nextTurn();
    assert.strictEqual(game2.players[0].coins, coinsBefore2);
});

runTest('遊園地効果：ゾロ目でターン継続しphaseがrollに戻る', () => {
    const game = new GameManager(2);
    game.phase = 'build';
    game.lastDice1 = 4;
    game.lastDice2 = 4;
    game.hadAmusementParkAtRoll = true;
    const ci = game.currentPlayerIndex;
    game.nextTurn();
    assert.strictEqual(game.currentPlayerIndex, ci, 'ゾロ目なのにプレイヤーが変わった');
    assert.strictEqual(game.phase, 'roll');
    assert.ok(game.log.some(e => e.type === 'system' && e.message.includes('遊園地')));
    // ゾロ目でない場合はターンが進む
    const game2 = new GameManager(2);
    game2.phase = 'build';
    game2.lastDice1 = 3;
    game2.lastDice2 = 4;
    game2.hadAmusementParkAtRoll = true;
    game2.nextTurn();
    assert.strictEqual(game2.currentPlayerIndex, 1, 'ターンが進んでいない');
});

// ===== resolveRenovation =====

runTest('resolveRenovationでランドマークを取り壊して+8コインを得る', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    p0.landmarks['駅'] = true;
    game.pendingRenovation = 1;
    game.phase = 'pending';
    p0.coins = 0;
    game.resolveRenovation('駅');
    assert.strictEqual(p0.landmarks['駅'], false);
    assert.strictEqual(p0.coins, 8);
    assert.strictEqual(game.pendingRenovation, 0);
    assert.strictEqual(game.phase, 'build');
    assert.ok(game.log.some(e => e.type === 'build' && e.message.includes('駅')));
    // 未建設ランドマークは拒否してpendingRenovationを減らさない
    const game2 = new GameManager(2);
    game2.pendingRenovation = 1;
    game2.phase = 'pending';
    game2.resolveRenovation('駅');
    assert.strictEqual(game2.pendingRenovation, 1);
    assert.ok(game2.log.some(e => e.type === 'error'));
});

// ===== calcCardIncome =====

runTest('calcCardIncomeがCHEESE・FURNITURE・MARKET・FEWLANDMARKの収入を計算する', () => {
    const game = new GameManager(2);
    const p0 = game.currentPlayer();
    // CHEESE: 牧場2枚 × income3 = 6
    p0.cards = [createCardByName('牧場'), createCardByName('牧場')];
    p0.dormantCards = [];
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('チーズ工場'), p0, game), 6);
    // FURNITURE: (森林1+鉱山1) × income3 = 6
    p0.cards = [createCardByName('森林'), createCardByName('鉱山')];
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('家具工場'), p0, game), 6);
    // MARKET: 農園2枚 × income2 = 4
    p0.cards = [createCardByName('麦畑'), createCardByName('花畑')];
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('青果市場'), p0, game), 4);
    // FEWLANDMARK: ランドマーク0個 → income1
    Object.keys(p0.landmarks).forEach(k => { p0.landmarks[k] = false; });
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('雑貨屋'), p0, game), 1);
    // ランドマーク2個以上 → 0
    p0.landmarks['駅'] = true;
    p0.landmarks['ショッピングモール'] = true;
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('雑貨屋'), p0, game), 0);
    // 休業中のカードはカウントしない
    p0.cards = [createCardByName('牧場'), createCardByName('牧場')];
    p0.dormantCards = [p0.cards[0]];
    assert.strictEqual(GameManager.calcCardIncome(createCardByName('チーズ工場'), p0, game), 3); // 1枚のみ
});

if (process.exitCode) {
    throw new Error('GameManagerテストで失敗が発生しました');
}
