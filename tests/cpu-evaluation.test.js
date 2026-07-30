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

runTest('CPU evaluation はランドマーク不足額とTV妨害価値をpureに計算する', () => {
    const costs = { station: 5, airport: 10 };
    const landmarkCost = name => costs[name];
    const target = {
        coins: 5,
        landmarks: { station: false, airport: false },
    };

    assert.strictEqual(
        CPUEvaluation.closestLandmarkShortfall(target, Object.keys(costs), landmarkCost),
        0
    );
    assert.strictEqual(
        CPUEvaluation.tvLandmarkDenialValue(target, 2, Object.keys(costs), landmarkCost, true),
        11
    );
    target.coins = 4;
    assert.strictEqual(
        CPUEvaluation.tvLandmarkDenialValue(target, 1, Object.keys(costs), landmarkCost, true),
        4.5
    );
    target.coins = 2;
    assert.strictEqual(
        CPUEvaluation.tvLandmarkDenialValue(target, 2, Object.keys(costs), landmarkCost, true),
        3.6
    );
    assert.strictEqual(
        CPUEvaluation.tvLandmarkDenialValue(target, 2, Object.keys(costs), landmarkCost, false),
        0
    );
    target.landmarks.station = true;
    target.landmarks.airport = true;
    assert.strictEqual(
        CPUEvaluation.closestLandmarkShortfall(target, Object.keys(costs), landmarkCost),
        0
    );
    assert.strictEqual(
        CPUEvaluation.tvLandmarkDenialValue(target, 2, Object.keys(costs), landmarkCost, true),
        0
    );
});

runTest('CPU本体のランドマーク妨害wrapperはpure evaluationへ完全委譲する', () => {
    const { CPU, GameManager, LANDMARK_NAMES, Player } = loadCPURuntime();
    const cpu = new CPU('expert', {
        expertBehaviorFlags: { tvLandmarkDenial: true },
    });
    const game = new GameManager(2);
    game.enabledLandmarks = new Set([LANDMARK_NAMES.STATION]);
    const target = game.players[1];
    target.coins = Player.landmarkCost(LANDMARK_NAMES.STATION);
    const amount = Math.min(5, target.coins);

    assert.strictEqual(
        cpu._closestLandmarkShortfall(target, game),
        CPUEvaluation.closestLandmarkShortfall(
            target,
            game.enabledLandmarks,
            Player.landmarkCost
        )
    );
    assert.strictEqual(
        cpu._tvLandmarkDenialValue(target, amount, game),
        CPUEvaluation.tvLandmarkDenialValue(
            target,
            amount,
            game.enabledLandmarks,
            Player.landmarkCost,
            true
        )
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

runTest('CPU evaluation は重複購入と経済バランスの既存減点を維持する', () => {
    assert.strictEqual(CPUEvaluation.cardSpamPenalty({ color: 'red' }, 2, 1), 2);
    assert.strictEqual(CPUEvaluation.cardSpamPenalty({ color: 'purple' }, 2, 1), 3.5);
    assert.strictEqual(CPUEvaluation.cardSpamPenalty({ color: 'blue' }, 0, 2), 0);

    const cards = [
        { color: 'green' },
        { color: 'red' },
        { color: 'red' },
        { color: 'red' },
    ];
    assert.strictEqual(CPUEvaluation.economyBalancePenalty({ color: 'red' }, cards, 1, 0.75), 2.825);
    assert.strictEqual(CPUEvaluation.economyBalancePenalty({ color: 'green' }, cards, 1, 1), -0.4);
    assert.strictEqual(CPUEvaluation.economyBalancePenalty({ color: 'blue' }, cards, 1, 1), -0.25);
});

runTest('CPU本体の重複購入と経済バランスwrapperはpure evaluationへ同値委譲する', () => {
    const { CPU, GameManager, createCardByName } = loadCPURuntime();
    const cpu = new CPU('expert');
    const game = new GameManager(4);
    const player = game.currentPlayer();
    const card = createCardByName('寿司屋');
    player.cards.push(card, createCardByName('寿司屋'));

    assert.strictEqual(
        cpu._cardSpamPenalty(card, player, 0.8),
        CPUEvaluation.cardSpamPenalty(card, player.countCard(card.name), 0.8)
    );
    assert.strictEqual(
        cpu._economyBalancePenalty(card, game, player, 0.8),
        CPUEvaluation.economyBalancePenalty(
            card,
            player.cards,
            0.8,
            cpu._playerCountProfile(game).redFactor
        )
    );
});

runTest('CPU evaluation はカード色と駅所持者から既存の出目頻度を集計する', () => {
    const station = 'station';
    const noStation = { landmarks: { [station]: false } };
    const withStation = { landmarks: { [station]: true } };
    const players = [noStation, withStation, noStation];
    const game = { players };
    const blue = { color: 'blue', diceNums: [2, 7] };
    const red = { color: 'red', diceNums: [2, 7] };
    const green = { color: 'green', diceNums: [2, 7] };

    assert.strictEqual(CPUEvaluation.diceFrequencyForRoller([2, 7], noStation, station), 1);
    assert.strictEqual(CPUEvaluation.diceFrequencyForRoller([2, 7], withStation, station), 7);
    assert.strictEqual(CPUEvaluation.cardDiceFrequency(blue, game, noStation, station), 9);
    assert.strictEqual(CPUEvaluation.cardDiceFrequency(red, game, noStation, station), 8);
    assert.strictEqual(CPUEvaluation.cardDiceFrequency(green, game, withStation, station), 7);
    assert.strictEqual(CPUEvaluation.cardDiceFrequency(null, game, noStation, station), 0);
});

runTest('CPU本体のcard dice frequency wrapperはpure evaluationへ同値委譲する', () => {
    const { CPU, GameManager, createCardByName, LANDMARK_NAMES } = loadCPURuntime();
    const cpu = new CPU('expert');
    const game = new GameManager(3);
    const player = game.players[0];
    game.players[1].landmarks[LANDMARK_NAMES.STATION] = true;
    const card = createCardByName('高級フレンチ');

    assert.strictEqual(
        cpu._diceFreqForRoller(card.diceNums, game.players[1]),
        CPUEvaluation.diceFrequencyForRoller(card.diceNums, game.players[1], LANDMARK_NAMES.STATION)
    );
    assert.strictEqual(
        cpu._cardDiceFreq(card, game, player),
        CPUEvaluation.cardDiceFrequency(card, game, player, LANDMARK_NAMES.STATION)
    );
});

runTest('CPU evaluation は特殊カードのpure価値計算を維持する', () => {
    const categories = { RESTAURANT: 'restaurant', SHOP: 'shop' };
    const effects = { FRENCHR: 'french', MEMBERBAR: 'member' };
    const player = { coins: 2, itVentureCoins: 2 };
    const targetA = {
        coins: 1,
        cards: [{ category: categories.RESTAURANT }, { category: categories.SHOP }],
        isDormant: () => false,
        builtLandmarkCount: () => 2,
    };
    const targetB = {
        coins: 4,
        cards: [{ category: categories.RESTAURANT }, { category: categories.SHOP }],
        isDormant: () => false,
        builtLandmarkCount: () => 3,
    };
    const game = { players: [player, targetA, targetB] };

    assert.strictEqual(CPUEvaluation.publisherValue(game, player, categories), 4.5);
    assert.strictEqual(CPUEvaluation.itStartupValue(game, player), 4.5);
    assert.strictEqual(CPUEvaluation.itStartupValue(game, player, true), 6.75);
    assert.strictEqual(
        CPUEvaluation.conditionalRedValue({ effect: effects.FRENCHR, income: 5 }, game, player, effects),
        10
    );
    assert.strictEqual(CPUEvaluation.loanBurdenValue(3), -7.5);
});

runTest('CPU本体の特殊カード評価wrapperはpure evaluationへ同値委譲する', () => {
    const { CPU, GameManager, createCardByName, CARD_CATEGORIES, CARD_EFFECTS } = loadCPURuntime();
    const cpu = new CPU('expert');
    const game = new GameManager(3);
    const player = game.currentPlayer();
    const target = game.players[1];
    target.coins = 12;
    target.cards.push(createCardByName('カフェ'), createCardByName('コンビニ'));
    target.landmarks['駅'] = true;
    target.landmarks['ショッピングモール'] = true;
    player.itVentureCoins = 2;
    player.coins = 2;
    const french = createCardByName('高級フレンチ');

    assert.strictEqual(
        cpu._estimatePublisherValue(game, player),
        CPUEvaluation.publisherValue(game, player, CARD_CATEGORIES)
    );
    assert.strictEqual(
        cpu._estimateItStartupValue(game, player, true),
        CPUEvaluation.itStartupValue(game, player, true)
    );
    assert.strictEqual(
        cpu._estimateConditionalRedValue(french, game, player),
        CPUEvaluation.conditionalRedValue(french, game, player, CARD_EFFECTS)
    );
    assert.strictEqual(cpu._estimateLoanBurdenValue(player, 2), CPUEvaluation.loanBurdenValue(2));
});

runTest('CPU evaluation はカード依存価値をpureに集計する', () => {
    const {
        CPU, GameManager, createCardByName, CARD_CATEGORIES, CARD_EFFECTS, LANDMARK_NAMES,
    } = loadCPURuntime();
    const cpu = new CPU('expert');
    const game = new GameManager(3);
    const player = game.currentPlayer();
    player.cards.push(
        createCardByName('牧場'),
        createCardByName('牧場'),
        createCardByName('森林'),
        createCardByName('鉱山'),
        createCardByName('花畑'),
        createCardByName('ブドウ園')
    );
    const value = card => CPUEvaluation.cardDependencyValue(
        card, player, game, CARD_CATEGORIES, CARD_EFFECTS, LANDMARK_NAMES.HARBOR
    );

    assert.strictEqual(value(createCardByName('チーズ工場')), 2.8);
    assert.strictEqual(value(createCardByName('家具工場')), 2.4);
    assert.strictEqual(value(createCardByName('フラワーショップ')), 1.3);
    assert.strictEqual(value(createCardByName('ワイナリー')), 1.2);
    assert.strictEqual(value(createCardByName('マグロ漁船')), 0.6);
    player.landmarks[LANDMARK_NAMES.HARBOR] = true;
    assert.strictEqual(value(createCardByName('マグロ漁船')), 2.2);
    assert.strictEqual(
        cpu._cardDependencyValue(createCardByName('チーズ工場'), player, game),
        value(createCardByName('チーズ工場'))
    );
});

runTest('CPU evaluation はlookahead段数と実行gateをpureに維持する', () => {
    assert.strictEqual(CPUEvaluation.expertLookaheadSteps(4, 1, 'build', 'build', 'full', 8), 17);
    assert.strictEqual(CPUEvaluation.expertLookaheadSteps(4, 4, 'roll', 'build', 'lite', 8), 3);
    assert.strictEqual(CPUEvaluation.shouldUseExpertChoiceLookahead(4, 1, 'build', 'build', 'realtime'), false);
    assert.strictEqual(CPUEvaluation.shouldUseExpertChoiceLookahead(3, 1, 'build', 'build', 'realtime'), true);
    assert.strictEqual(CPUEvaluation.shouldUseExpertChoiceLookahead(4, 2, 'build', 'build', 'full'), true);
    assert.strictEqual(CPUEvaluation.shouldUseExpertChoiceLookahead(4, 2, 'roll', 'build', 'full'), false);
});

runTest('CPU本体のlookahead wrapperはpure evaluation結果を維持する', () => {
    const { CPU, GameManager, GAME_PHASES } = loadCPURuntime();
    const cpu = new CPU('expert', { simulationMode: 'fast' });
    const game = new GameManager(4);
    game.phase = GAME_PHASES.BUILD;
    const focusIndex = game.currentPlayerIndex;
    const remaining = [...game.enabledLandmarks].filter(name => !game.players[focusIndex].landmarks[name]).length;

    assert.strictEqual(
        cpu._expertLookaheadSteps(game, focusIndex, 8),
        CPUEvaluation.expertLookaheadSteps(4, remaining, game.phase, GAME_PHASES.BUILD, 'fast', 8)
    );
    assert.strictEqual(
        cpu._shouldUseExpertChoiceLookahead(game, focusIndex),
        CPUEvaluation.shouldUseExpertChoiceLookahead(4, remaining, game.phase, GAME_PHASES.BUILD, 'fast')
    );
});
