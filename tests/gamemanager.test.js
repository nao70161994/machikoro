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
        'this.GameManager = GameManager; this.createCardByName = createCardByName;',
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

if (process.exitCode) {
    throw new Error('GameManagerテストで失敗が発生しました');
}
