const assert = require('assert');
const { CPUEvaluation } = require('../js/cpuEvaluation');
const { runTest } = require('./helpers/test-utils');
const { loadCPURuntime } = require('./helpers/runtime-loaders');

runTest('CPU evaluation は1個振りの各有効出目を同じ重みで数える', () => {
    assert.strictEqual(CPUEvaluation.singleDiceFrequency([1, 2, 6]), 3);
    assert.strictEqual(CPUEvaluation.singleDiceFrequency([0, 7, 12]), 0);
    assert.strictEqual(CPUEvaluation.singleDiceFrequency([]), 0);
});

runTest('CPU evaluation は2個振りの36通り分布を維持する', () => {
    assert.strictEqual(CPUEvaluation.doubleDiceFrequency([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 36);
    assert.strictEqual(CPUEvaluation.doubleDiceFrequency([7]), 6);
    assert.strictEqual(CPUEvaluation.doubleDiceFrequency([1, 13, 14]), 0);
});

runTest('CPU本体の既存頻度methodはpure evaluationへ同値委譲する', () => {
    const { CPU } = loadCPURuntime();
    const cpu = new CPU('expert');
    const diceNums = [2, 6, 7, 8, 12];
    assert.strictEqual(cpu._singleDiceFreq(diceNums), CPUEvaluation.singleDiceFrequency(diceNums));
    assert.strictEqual(cpu._doubleDiceFreq(diceNums), CPUEvaluation.doubleDiceFrequency(diceNums));
});

runTest('CPU evaluation はstrong soft capの既存区分を維持する', () => {
    assert.strictEqual(CPUEvaluation.strongSoftCapValue(12, 'strong'), 12);
    assert.strictEqual(CPUEvaluation.strongSoftCapValue(20, 'strong'), 16);
    assert.strictEqual(CPUEvaluation.strongSoftCapValue(30, 'strong'), 19);
    assert.strictEqual(CPUEvaluation.strongSoftCapValue(34, 'strong'), 21);
    assert.strictEqual(CPUEvaluation.strongSoftCapValue(-34, 'strong'), -21);
    assert.strictEqual(CPUEvaluation.strongSoftCapValue(34, 'expert'), 34);
});

runTest('CPU evaluation は人数別の相手希釈率を維持する', () => {
    assert.strictEqual(CPUEvaluation.opponentDilutionFactor(1), 1);
    assert.strictEqual(CPUEvaluation.opponentDilutionFactor(2), 1);
    assert.strictEqual(CPUEvaluation.opponentDilutionFactor(4), 1 / 3);
});

runTest('CPU evaluation はランドマーク進捗を注入costだけで集計する', () => {
    const costs = { station: 5, mall: 2, airport: 10 };
    const landmarkCost = name => costs[name];
    const player = {
        coins: 8,
        landmarks: { station: false, mall: true, airport: false },
    };

    assert.strictEqual(
        CPUEvaluation.coinsTowardsNextLandmark(player, Object.keys(costs), landmarkCost),
        3
    );
    assert.strictEqual(
        CPUEvaluation.countReachableLandmarks(player, Object.keys(costs), landmarkCost),
        1
    );
    player.landmarks.station = true;
    player.landmarks.airport = true;
    assert.strictEqual(
        CPUEvaluation.coinsTowardsNextLandmark(player, Object.keys(costs), landmarkCost),
        0
    );
});

runTest('CPU本体の評価primitive wrapperはpure evaluationへ同値委譲する', () => {
    const { CPU, Player } = loadCPURuntime();
    const cpu = new CPU('strong');
    const player = new Player('評価対象');
    player.coins = 12;
    const landmarkNames = Player.landmarkNames();

    assert.strictEqual(cpu._strongSoftCapValue(34), CPUEvaluation.strongSoftCapValue(34, 'strong'));
    assert.strictEqual(cpu._opponentDilutionFactor({ players: [{}, {}, {}, {}] }), CPUEvaluation.opponentDilutionFactor(4));
    assert.strictEqual(cpu._coinsTowardsNextLandmark(player), CPUEvaluation.coinsTowardsNextLandmark(player, landmarkNames, Player.landmarkCost));
    assert.strictEqual(cpu._countReachableLandmarks(player, landmarkNames), CPUEvaluation.countReachableLandmarks(player, landmarkNames, Player.landmarkCost));
});

runTest('CPU evaluation はbuild option同一性をtypeと安定名で判定する', () => {
    assert.strictEqual(
        CPUEvaluation.sameBuildOption(
            { type: 'landmark', name: 'station' },
            { type: 'landmark', name: 'station' }
        ),
        true
    );
    assert.strictEqual(
        CPUEvaluation.sameBuildOption(
            { type: 'card', card: { name: 'ranch' } },
            { type: 'card', card: { name: 'ranch' } }
        ),
        true
    );
    assert.strictEqual(CPUEvaluation.sameBuildOption({ type: 'skip' }, { type: 'skip' }), undefined);
});

runTest('CPU evaluation はcombo payoff候補と限界収入を注入定数で算出する', () => {
    const categories = { LIVESTOCK: 'livestock', FARM: 'farm', RESTAURANT: 'restaurant' };
    const effects = {
        CHEESE: 'cheese',
        FURNITURE: 'furniture',
        MARKET: 'market',
        FLOWER: 'flower',
        WINERY: 'winery',
        FOODWAREHOUSE: 'food',
        DRINKFACTORY: 'drink',
    };
    const ranch = { name: '牧場', category: categories.LIVESTOCK };
    assert.deepStrictEqual(
        CPUEvaluation.futurePayoffCardNames(ranch, 'unlock', categories),
        ['チーズ工場']
    );
    assert.strictEqual(
        CPUEvaluation.marginalComboIncome(ranch, { effect: effects.CHEESE, income: 3 }, categories, effects),
        3
    );
    assert.strictEqual(
        CPUEvaluation.marginalComboIncome(ranch, { effect: effects.MARKET, income: 2 }, categories, effects),
        0
    );
});

runTest('CPU本体のcombo scoring wrapperはpure evaluationへ完全委譲する', () => {
    const { CPU, CARD_CATEGORIES, CARD_EFFECTS, createCardByName } = loadCPURuntime();
    const cpu = new CPU('expert', { expertPreset: 'v2simple' });
    const ranch = createCardByName('牧場');
    const cheese = createCardByName('チーズ工場');
    assert.deepStrictEqual(
        Array.from(cpu._expertV2SimpleFuturePayoffCards(ranch, 'unlock')),
        CPUEvaluation.futurePayoffCardNames(ranch, 'unlock', CARD_CATEGORIES)
    );
    assert.strictEqual(
        cpu._expertV2SimpleMarginalComboIncome(ranch, cheese),
        CPUEvaluation.marginalComboIncome(ranch, cheese, CARD_CATEGORIES, CARD_EFFECTS)
    );
});

runTest('CPU evaluation はlandmark比較中の危険カード減点を維持する', () => {
    const effects = { BUSINESS: 'business', RENOVATION: 'renovation', LOAN: 'loan' };
    assert.strictEqual(
        CPUEvaluation.landmarkCardPenalty(
            true,
            'riskySpecials',
            { type: 'card', card: { effect: effects.RENOVATION } },
            effects,
            () => 4
        ),
        12
    );
    assert.strictEqual(
        CPUEvaluation.landmarkCardPenalty(false, 'riskySpecials', null, effects, () => {
            throw new Error('remaining count must stay lazy');
        }),
        0
    );
});

runTest('CPU evaluation は終盤の基本カード重複減点を維持する', () => {
    const current = {
        landmarks: { mall: false },
        countCard: () => 3,
    };
    assert.strictEqual(
        CPUEvaluation.lateBasicDuplicatePenalty(
            true,
            4,
            current,
            { type: 'card', card: { name: 'コンビニ' } },
            0.2,
            'mall',
            () => 4
        ),
        0.75
    );
    assert.strictEqual(
        CPUEvaluation.lateBasicDuplicatePenalty(
            true,
            3,
            current,
            { type: 'card', card: { name: 'コンビニ' } },
            0.2,
            'mall',
            () => {
                throw new Error('remaining count must stay lazy');
            }
        ),
        0
    );
});

runTest('CPU本体のv2simple penalty wrapperはpure evaluation結果を維持する', () => {
    const { CPU, GameManager, createCardByName } = loadCPURuntime();
    const cpu = new CPU('expert', {
        expertPreset: 'v2simple',
        expertLandmarkCardPenaltyMode: 'riskySpecials',
    });
    const game = new GameManager(4);
    const current = game.currentPlayer();
    current.cards.push(createCardByName('コンビニ'), createCardByName('コンビニ'));
    current.landmarks['駅'] = true;
    current.landmarks['港'] = true;
    const option = { type: 'card', card: createCardByName('コンビニ') };
    assert.strictEqual(cpu._expertV2SimpleLateBasicDuplicatePenalty(game, option, 0.2), 0.45);

    const renovation = { type: 'card', card: createCardByName('改装屋') };
    assert.strictEqual(cpu._expertV2SimpleLandmarkCardPenalty(game, renovation, true), 12);
});
