const assert = require('assert');
const { CPUEvaluation } = require('../js/cpuEvaluation');
const { runTest } = require('./helpers/test-utils');
const { loadCPURuntime } = require('./helpers/runtime-loaders');

runTest('CPU evaluation は受取カード価値のeffect dispatchと算術順をpureに維持する', () => {
    const effects = { LOAN: 'loan', RENOVATION: 'renovation', BUSINESS: 'business' };
    const calls = [];
    const options = {
        loanValue: () => { calls.push('loan'); return -4; },
        renovationValue: () => { calls.push('renovation'); return 3; },
        specialEffectBaseValues: { business: 3.5 },
        baseValue: () => { calls.push('base'); return 4; },
        softCap: value => { calls.push(['cap', value]); return value - 1; },
        diceFrequency: () => { calls.push('dice'); return 2; },
    };

    assert.strictEqual(CPUEvaluation.receivedCardValue({ effect: 'loan' }, effects, options), -4);
    assert.deepStrictEqual(calls, ['loan']);
    calls.length = 0;
    assert.strictEqual(CPUEvaluation.receivedCardValue({
        effect: 'business', cost: 2,
    }, effects, options), 7.8);
    assert.deepStrictEqual(calls, [['cap', 3.5], 'dice']);
    calls.length = 0;
    assert.strictEqual(CPUEvaluation.receivedCardValue({
        effect: 'normal', cost: 1,
    }, effects, options), 7.4);
    assert.deepStrictEqual(calls, ['base', ['cap', 4], 'dice']);
});

runTest('CPU evaluation は所有カードの休業・色・依存補正を同じ加算順で適用する', () => {
    assert.strictEqual(CPUEvaluation.ownedCardValue(10, { color: 'red' }, {
        dormant: true,
        purpleBonus: 2,
        dependencyValue: 4,
    }), 9);
    assert.strictEqual(CPUEvaluation.ownedCardValue(10, { color: 'purple' }, {
        dormant: false,
        purpleBonus: 2,
        dependencyValue: 4,
    }), 16);
});

runTest('CPU evaluation は進行収入カードの色・休業・特殊effect契約を判定する', () => {
    const effects = {
        LOAN: 'loan',
        RENOVATION: 'renovation',
        ITSTARTUP: 'itstartup',
        PARK: 'park',
        BUSINESS: 'business',
        CLEANING: 'cleaning',
        MOVER: 'mover',
    };
    const dormant = new Set();
    const player = { isDormant: card => dormant.has(card) };
    const blue = { color: 'blue', effect: 'normal' };
    const green = { color: 'green', effect: 'normal' };
    const red = { color: 'red', effect: 'normal' };
    const loan = { color: 'green', effect: effects.LOAN };

    assert.strictEqual(CPUEvaluation.isProgressIncomeCard(blue, player, effects), true);
    assert.strictEqual(CPUEvaluation.isProgressIncomeCard(green, player, effects), true);
    assert.strictEqual(CPUEvaluation.isProgressIncomeCard(red, player, effects), false);
    assert.strictEqual(CPUEvaluation.isProgressIncomeCard(loan, player, effects), false);
    dormant.add(blue);
    assert.strictEqual(CPUEvaluation.isProgressIncomeCard(blue, player, effects), false);
    assert.strictEqual(CPUEvaluation.isProgressIncomeCard(null, player, effects), false);
    assert.strictEqual(CPUEvaluation.isProgressIncomeCard(green, null, effects), false);
});

runTest('CPU evaluation は進行収入を入力順でpureに集計する', () => {
    const cards = [{ id: 'first' }, { id: 'excluded' }, { id: 'last' }];
    const visited = [];
    const valued = [];
    const total = CPUEvaluation.progressIncomeTotal(
        cards,
        card => {
            visited.push(card.id);
            return card.id !== 'excluded';
        },
        card => {
            valued.push(card.id);
            return card.id === 'first' ? 2 : 5;
        }
    );

    assert.strictEqual(total, 7);
    assert.deepStrictEqual(visited, ['first', 'excluded', 'last']);
    assert.deepStrictEqual(valued, ['first', 'last']);
    assert.deepStrictEqual(cards.map(card => card.id), ['first', 'excluded', 'last']);
});

runTest('CPU evaluation はランドマーク候補の最高scoreと低cost tie-breakをpureに選ぶ', () => {
    const first = { name: 'first', score: 8, cost: 6 };
    const cheaperTie = { name: 'cheaper', score: 8, cost: 4 };
    const sameTie = { name: 'same', score: 8, cost: 4 };
    const candidates = [first, cheaperTie, sameTie, { name: 'low', score: 7, cost: 1 }];
    const snapshot = candidates.map(candidate => ({ ...candidate }));
    assert.strictEqual(CPUEvaluation.bestLandmarkCandidate(candidates), cheaperTie);
    assert.deepStrictEqual(candidates, snapshot);
    assert.strictEqual(CPUEvaluation.bestLandmarkCandidate([]), null);
});

runTest('CPU本体のランドマーク候補wrapperは既存score式と順序を維持する', () => {
    const { CPU, GameManager, Player } = loadCPURuntime();
    const cpu = new CPU('strong');
    const game = new GameManager(2);
    const current = game.currentPlayer();
    current.coins = 100;
    const names = Player.landmarkNames().filter(name => game.enabledLandmarks.has(name));
    const urgency = new Map(names.map((name, index) => [name, index + 1]));
    cpu._landmarkUrgency = name => urgency.get(name);
    cpu._strongLandmarkThresholdPenalty = () => 0;
    const expected = CPUEvaluation.bestLandmarkCandidate(names.map(name => {
        const cost = Player.landmarkCost(name);
        return {
            name,
            cost,
            urgency: urgency.get(name),
            score: urgency.get(name) * 2.2 + Math.max(0, current.coins - cost - 3) * 0.08,
        };
    }));
    const actual = cpu._bestAffordableLandmark(current, game, 3);
    assert.deepStrictEqual(
        [actual.name, actual.cost, actual.urgency, actual.score],
        [expected.name, expected.cost, expected.urgency, expected.score]
    );
});

runTest('CPU evaluation は購入候補をscore降順かつ同点入力順でpureに並べる', () => {
    const cards = [{ id: 'first' }, { id: 'best' }, { id: 'tie' }];
    const values = { first: 4, best: 9, tie: 4 };
    const visited = [];
    const ranked = CPUEvaluation.rankCards(cards, card => {
        visited.push(card.id);
        return values[card.id];
    });
    assert.deepStrictEqual(visited, ['first', 'best', 'tie']);
    assert.deepStrictEqual(ranked.map(entry => [entry.card.id, entry.score]), [
        ['best', 9],
        ['first', 4],
        ['tie', 4],
    ]);
    assert.deepStrictEqual(cards.map(card => card.id), ['first', 'best', 'tie']);
    assert.ok(ranked[0].card === cards[1]);
});

runTest('CPU evaluation は購入scoreを既存順で合成しdifficulty外factをlazyに保つ', () => {
    const calls = [];
    const value = (name, amount) => () => { calls.push(name); return amount; };
    const score = CPUEvaluation.affordablePurchaseScore({
        difficulty: 'strong',
        cost: 4,
        cardValue: value('card', 8),
        tempoBonus: value('tempo', 2),
        diceFrequency: value('dice', 3),
        synergyBonus: value('synergy', 1),
        spamPenalty: value('spam', 2),
        balancePenalty: value('balance', 3),
        conditionalAdjustment: value('conditional', 4),
        renovation: true,
        renovationOwned: value('owned', 1),
        duplicateRenovationPenalty: owned => { calls.push(['duplicate', owned]); return 5; },
        rolePressure: value('role', 6),
        safetyAdjustment: value('safety', 100),
        crowd: true,
        crowdScore: current => { calls.push(['crowd', current]); return current + 7; },
    });
    assert.strictEqual(score, 35.2);
    assert.deepStrictEqual(calls, [
        'card', 'tempo', 'dice', 'synergy', 'spam', 'balance', 'conditional',
        'owned', ['duplicate', 1], 'role', ['crowd', 28.2],
    ]);

    calls.length = 0;
    assert.strictEqual(CPUEvaluation.affordablePurchaseScore({
        difficulty: 'normal',
        cost: 2,
        cardValue: value('card', 6),
        tempoBonus: value('tempo', 0),
        diceFrequency: value('dice', 2),
        synergyBonus: value('synergy', 1),
        spamPenalty: value('spam', 2),
        balancePenalty: value('balance', 1),
        conditionalAdjustment: value('conditional', 100),
        renovation: true,
        renovationOwned: value('owned', 2),
        duplicateRenovationPenalty: () => { calls.push('duplicate'); return 100; },
        rolePressure: value('role', 100),
        safetyAdjustment: value('safety', 3),
        crowd: value('crowd-fact', true),
        crowdScore: () => { calls.push('crowd'); return 100; },
    }), 7);
    assert.deepStrictEqual(calls, ['card', 'tempo', 'dice', 'synergy', 'spam', 'balance', 'safety']);
});

runTest('CPU本体の購入score wrapperはpure evaluationと既存callback順を維持する', () => {
    const { CPU } = loadCPURuntime();
    const cpu = new CPU('strong');
    const calls = [];
    const card = { cost: 4, effect: 'renovation' };
    const player = { countCard: () => { calls.push('owned'); return 1; } };
    const game = { players: [{}, {}, {}, {}] };
    cpu.evalCard = () => { calls.push('card'); return 8; };
    cpu._strongTempoValueBonus = () => { calls.push('tempo'); return 2; };
    cpu._cardDiceFreq = () => { calls.push('dice'); return 3; };
    cpu._landmarkCardSynergyBonus = () => { calls.push('synergy'); return 1; };
    cpu._cardSpamPenalty = () => { calls.push('spam'); return 2; };
    cpu._economyBalancePenalty = () => { calls.push('balance'); return 3; };
    cpu._strongConditionalCardAdjustment = () => { calls.push('conditional'); return 4; };
    cpu._duplicateRenovationPenalty = () => { calls.push('duplicate'); return 5; };
    cpu._strongRolePressure = () => { calls.push('role'); return 6; };
    cpu._strongCrowdPurchaseScore = score => { calls.push(['crowd', score]); return score + 7; };
    assert.strictEqual(cpu._scoreAffordablePurchase(card, game, player, {
        intensity: 1.4,
        difficulty: 'strong',
    }), 35.2);
    assert.deepStrictEqual(calls, [
        'card', 'tempo', 'dice', 'synergy', 'spam', 'balance', 'conditional',
        'owned', 'duplicate', 'role', ['crowd', 28.2],
    ]);
});

runTest('CPU本体の購入候補ranking wrapperはpure evaluationへ同値委譲する', () => {
    const { CPU } = loadCPURuntime();
    const cpu = new CPU('strong');
    const cards = [{ id: 'low' }, { id: 'high' }];
    const game = { marker: 'game' };
    const player = { marker: 'player' };
    const baseCalls = [];
    cpu._baseCardEfficiency = (card, currentGame, currentPlayer) => {
        baseCalls.push([card.id, currentGame, currentPlayer]);
        return card.id === 'high' ? 8 : 2;
    };
    assert.deepStrictEqual(cpu.sortAffordable(cards, game, player).map(entry => entry.card.id), ['high', 'low']);
    assert.ok(baseCalls.every(call => call[1] === game && call[2] === player));

    const purchaseCalls = [];
    cpu._scoreAffordablePurchase = (card, currentGame, currentPlayer, options) => {
        purchaseCalls.push([card.id, currentGame, currentPlayer, options]);
        return card.id === 'high' ? 6 : 1;
    };
    assert.deepStrictEqual(
        cpu._sortAffordableForDifficulty(cards, game, player, 'strong').map(entry => entry.card.id),
        ['high', 'low']
    );
    assert.deepStrictEqual(purchaseCalls.map(call => [
        call[3].intensity,
        call[3].difficulty,
    ]), [
        [1.4, 'strong'],
        [1.4, 'strong'],
    ]);
});

runTest('CPU evaluation は自手番収入を既存順序と休業規則のまま集計する', () => {
    const dormant = { id: 'dormant', diceNums: [6] };
    const active = { id: 'active', diceNums: [6] };
    const loss = { id: 'loss', diceNums: [6] };
    const otherRoll = { id: 'other', diceNums: [5] };
    const visited = [];
    const valueById = { dormant: 20, active: 4, loss: -3, other: 99 };
    const income = CPUEvaluation.ownRollIncome(
        [dormant, active, loss, otherRoll, null],
        6,
        null,
        card => card === dormant,
        card => {
            visited.push(card.id);
            return valueById[card.id];
        }
    );
    assert.strictEqual(income, 4);
    assert.deepStrictEqual(visited, ['active', 'loss']);

    const candidate = { id: 'candidate', diceNums: [6] };
    visited.length = 0;
    valueById.candidate = 7;
    assert.strictEqual(CPUEvaluation.ownRollIncome(
        [dormant, active],
        6,
        candidate,
        () => true,
        card => {
            visited.push(card.id);
            return valueById[card.id];
        }
    ), 31);
    assert.deepStrictEqual(visited, ['dormant', 'active', 'candidate']);
});

runTest('CPU本体の自手番収入wrapperはpure evaluationへ同値委譲する', () => {
    const { CPU } = loadCPURuntime();
    const cpu = new CPU('expert');
    const active = { id: 'active', diceNums: [4] };
    const dormant = { id: 'dormant', diceNums: [4] };
    const player = {
        cards: [active, dormant],
        isDormant: card => card === dormant,
    };
    const game = { players: [player] };
    const calls = [];
    cpu._cardActivationValue = (card, currentGame, owner, roller, dice) => {
        calls.push([card.id, currentGame, owner, roller, dice]);
        return card === active ? 5 : 9;
    };
    assert.strictEqual(cpu._estimateOwnRollIncome(game, player, 4), 5);
    assert.deepStrictEqual(calls.map(call => call[0]), ['active']);
    assert.ok(calls.every(call => call[1] === game && call[2] === player && call[3] === player && call[4] === 4));
    assert.strictEqual(cpu._estimateOwnRollIncome(null, player, 4), 0);
});

runTest('CPU evaluation はchoice outcomeを入力順のまま重み付き集計する', () => {
    const visited = [];
    const outcomes = [
        { id: 'first', weight: 2, score: 10 },
        { id: 'second', weight: 1, score: 4 },
    ];
    assert.strictEqual(CPUEvaluation.expectedOutcomeValue(outcomes, outcome => {
        visited.push(outcome.id);
        return outcome.score;
    }), 8);
    assert.deepStrictEqual(visited, ['first', 'second']);
    assert.strictEqual(CPUEvaluation.expectedOutcomeValue([], () => 99), -Infinity);
    assert.strictEqual(CPUEvaluation.expectedOutcomeValue([{ weight: 0 }], () => 99), -Infinity);
});

runTest('CPU本体のexpert/strong choice集計wrapperはpure evaluationと一致する', () => {
    const { CPU } = loadCPURuntime();
    const cpu = new CPU('expert');
    cpu._profileMeasure = (_label, fn) => fn();
    cpu._cloneGame = game => ({ value: game.value });
    cpu._scoreExpertChoiceState = (clone, focusIndex) => clone.value + focusIndex;
    cpu._scoreStrongChoiceState = (clone, focusIndex) => clone.value * 2 - focusIndex;
    const outcomes = [{ weight: 1, delta: 2 }, { weight: 3, delta: 6 }];
    const apply = (clone, outcome) => { clone.value += outcome.delta; };
    const game = { value: 5 };
    assert.strictEqual(cpu._expectedExpertChoiceValue(game, 2, outcomes, apply), 12);
    assert.strictEqual(cpu._expectedStrongChoiceValue(game, 2, outcomes, apply), 18);
    assert.deepStrictEqual(game, { value: 5 });
});

runTest('CPU evaluation はランドマーク優先度の既存分岐とbiasをpureに維持する', () => {
    const names = {
        STATION: 'station', SHOPPING_MALL: 'mall', HARBOR: 'harbor',
        RADIO_TOWER: 'tower', AMUSEMENT_PARK: 'park', AIRPORT: 'airport',
    };
    const base = {
        builtCount: 1, opponentMaxBuilt: 0, mallCategoryCardCount: 0,
        hasHarborCard: false, hasStation: false, isExpert: false, stableIncome: 0,
        strongUrgencyBonus: 0, airportBias: 1.5, landmarkBias: 2,
    };
    assert.strictEqual(CPUEvaluation.landmarkUrgency(names.STATION, base, names), 16);
    assert.strictEqual(CPUEvaluation.landmarkUrgency(names.SHOPPING_MALL, { ...base, mallCategoryCardCount: 3 }, names), 16);
    assert.strictEqual(CPUEvaluation.landmarkUrgency(names.HARBOR, { ...base, hasHarborCard: true }, names), 14);
    assert.strictEqual(CPUEvaluation.landmarkUrgency(names.RADIO_TOWER, {
        ...base, builtCount: 2, opponentMaxBuilt: 3, isExpert: true,
    }, names), 12);
    assert.strictEqual(CPUEvaluation.landmarkUrgency(names.AMUSEMENT_PARK, { ...base, hasStation: true }, names), 10);
    assert.strictEqual(CPUEvaluation.landmarkUrgency(names.AIRPORT, {
        ...base, builtCount: 2, isExpert: true, stableIncome: 8, strongUrgencyBonus: 1,
    }, names), 6);
});

runTest('CPUランドマーク優先度wrapperはpure evaluationへ完全委譲する', () => {
    const { CPU, GameManager, LANDMARK_NAMES, CARD_CATEGORIES, CARD_EFFECTS } = loadCPURuntime();
    const cpu = new CPU('expert');
    const game = new GameManager(4);
    const current = game.currentPlayer();
    current.cards.push({ name: 'shop', category: CARD_CATEGORIES.SHOP, effect: CARD_EFFECTS.HARBOR });
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    cpu._estimateStableIncome = () => 9;
    cpu._strongLandmarkUrgencyBonus = () => 2;
    cpu._playerCountProfile = () => ({ airportBias: 1.25, landmarkBias: 1.5 });
    const builtCount = current.builtLandmarkCount();
    const opponentMaxBuilt = Math.max(0, ...game.players.slice(1).map(player => player.builtLandmarkCount()));
    const expected = CPUEvaluation.landmarkUrgency(LANDMARK_NAMES.AIRPORT, {
        builtCount,
        opponentMaxBuilt,
        mallCategoryCardCount: 1,
        hasHarborCard: true,
        hasStation: true,
        isExpert: true,
        stableIncome: 0,
        strongUrgencyBonus: 2,
        airportBias: 1.25,
        landmarkBias: 1.5,
    }, LANDMARK_NAMES);
    assert.strictEqual(cpu._landmarkUrgency(LANDMARK_NAMES.AIRPORT, current, game), expected);
});

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

runTest('CPU evaluation は勝利距離の通常・多人数数式をpureに維持する', () => {
    const features = {
        remainingLandmarks: [
            { name: 'station', cost: 4, urgency: 2 },
            { name: 'airport', cost: 10, urgency: 5 },
        ],
        playerCoins: 3,
        turnValue: 6,
        reachable: 0,
        progressIncome: 4,
        crowdFocus: false,
    };
    assert.strictEqual(CPUEvaluation.estimateWinDistance(features), 4.771);
    assert.strictEqual(CPUEvaluation.estimateWinDistance({
        ...features,
        crowdFocus: true,
    }), 4.731);
    assert.strictEqual(CPUEvaluation.estimateWinDistance({
        ...features,
        remainingLandmarks: [],
    }), 0);
});

runTest('CPU本体の勝利距離wrapperはpure evaluationへ同値委譲する', () => {
    const { CPU, GameManager, LANDMARK_NAMES, Player } = loadCPURuntime();
    const cpu = new CPU('expert', {
        expertBehaviorFlags: { crowdWinDistanceFocus: true },
    });
    const game = new GameManager(4);
    const player = game.players[0];
    player.coins = 3;
    player.landmarks[LANDMARK_NAMES.STATION] = true;
    const playerIndex = 0;
    const remaining = [...game.enabledLandmarks]
        .filter(name => !player.landmarks[name])
        .map(name => ({
            name,
            cost: Player.landmarkCost(name),
            urgency: cpu._landmarkUrgency(name, player, game),
        }));
    const expected = CPUEvaluation.estimateWinDistance({
        remainingLandmarks: remaining,
        playerCoins: player.coins,
        turnValue: cpu._estimatePlayerTurnValue(game, playerIndex),
        reachable: remaining.filter(entry => player.coins >= entry.cost).length,
        progressIncome: cpu._estimateProgressIncome(game, player),
        crowdFocus: true,
    });
    assert.strictEqual(cpu._estimateWinDistanceUncached(player, game, playerIndex), expected);
});

runTest('CPU evaluation は相手脅威度の重み付き数式をpureに維持する', () => {
    assert.strictEqual(CPUEvaluation.estimateOpponentThreat({
        coins: 5,
        turnValue: 4,
        landmarkProgress: 2,
        builtLandmarkCount: 1,
        reachableLandmarks: 1,
        winDistance: 7,
    }), 53.6);
});

runTest('CPU本体の相手脅威度wrapperはpure evaluationへ同値委譲する', () => {
    const { CPU, GameManager } = loadCPURuntime();
    const cpu = new CPU('expert');
    const game = new GameManager(4);
    const opponent = game.players[1];
    opponent.coins = 5;
    const enabledLandmarks = [...game.enabledLandmarks];
    const expected = CPUEvaluation.estimateOpponentThreat({
        coins: opponent.coins,
        turnValue: cpu._estimatePlayerTurnValue(game, 1),
        landmarkProgress: enabledLandmarks.filter(name => opponent.landmarks[name]).length,
        builtLandmarkCount: opponent.builtLandmarkCount(),
        reachableLandmarks: cpu._countReachableLandmarks(opponent, enabledLandmarks),
        winDistance: cpu._estimateWinDistance(opponent, game),
    });
    assert.strictEqual(cpu._estimateOpponentThreatUncached(opponent, game, 1), expected);
});

runTest('CPU evaluation は盤面featureの最終score合成順をpureに維持する', () => {
    const score = CPUEvaluation.evaluatePositionScore({
        coins: 10,
        turnValue: 5,
        landmarkProgress: 2,
        builtLandmarkCount: 1,
        reachableLandmarks: 1,
        stableIncome: 3,
        winDistance: 4,
        redPressure: 2,
        remainingLandmarkCount: 1,
        lowValueSpam: 4,
        duplicateRenovationPenalty: 3,
        airportIdleBonus: true,
        opponentThreats: [10, 20],
    }, {
        coinWeight: 0.5,
        turnWeight: 2,
        landmarkWeight: 10,
        builtLandmarkWeight: 5,
        landmarkReachWeight: 4,
        stableIncomeWeight: 1,
        redPressureWeight: 0.5,
        lateCoinWeight: 0.2,
        lateProgressBonus: 1,
        finalCoinWeight: 0.3,
        lowValueSpamThreshold: 2,
        lowValueSpamPenalty: 2,
        leaderThreatWeight: 0.1,
    });
    assert.ok(Math.abs(score - 18.8) < 1e-9);
});

runTest('CPU本体の盤面評価wrapperはpure evaluationへ同値委譲する', () => {
    const { CPU, GameManager, LANDMARK_NAMES } = loadCPURuntime();
    const cpu = new CPU('expert');
    const game = new GameManager(4);
    const playerIndex = 0;
    const player = game.players[playerIndex];
    player.coins = 6;
    const enabledLandmarks = [...game.enabledLandmarks];
    const opponentThreats = game.players
        .filter((_, index) => index !== playerIndex)
        .map(opponent => cpu._estimateOpponentThreat(opponent, game));
    const expected = CPUEvaluation.evaluatePositionScore({
        coins: player.coins,
        turnValue: cpu._estimatePlayerTurnValue(game, playerIndex),
        landmarkProgress: enabledLandmarks.filter(name => player.landmarks[name]).length,
        builtLandmarkCount: player.builtLandmarkCount(),
        reachableLandmarks: cpu._countReachableLandmarks(player, enabledLandmarks),
        stableIncome: cpu._estimateStableIncome(game, player),
        winDistance: cpu._estimateWinDistance(player, game),
        redPressure: cpu._estimateRedPressure(game, playerIndex),
        remainingLandmarkCount: enabledLandmarks.filter(name => !player.landmarks[name]).length,
        lowValueSpam: player.countCard('改装屋') + player.countCard('貸金業') + player.countCard('雑貨屋'),
        duplicateRenovationPenalty: cpu._duplicateRenovationPenalty(player, 'expert', game),
        airportIdleBonus: Boolean(
            player.landmarks[LANDMARK_NAMES.AIRPORT] &&
            !game.builtThisTurn &&
            game.currentPlayerIndex === playerIndex
        ),
        opponentThreats,
    }, cpu.expertTuning);
    assert.strictEqual(cpu._evaluatePosition(game, playerIndex), expected);
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

runTest('CPU evaluation はexpertロール収入上限と超過ペナルティをpureに計算する', () => {
    const costs = { station: 4, airport: 30 };
    const landmarkCost = name => costs[name];
    const player = {
        landmarks: { station: false, airport: false },
    };

    assert.strictEqual(
        CPUEvaluation.expertRollIncomeCap(player, Object.keys(costs), landmarkCost),
        30
    );
    assert.strictEqual(
        CPUEvaluation.expertRollCapPenalty([
            { before: 30, after: 32 },
            { before: 29, after: 33 },
            { before: 10, after: 9 },
        ], 30, 'expert'),
        10.2
    );
    assert.strictEqual(
        CPUEvaluation.expertRollCapPenalty([{ before: 30, after: 40 }], 30, 'strong'),
        0
    );
    player.landmarks.station = true;
    player.landmarks.airport = true;
    assert.strictEqual(
        CPUEvaluation.expertRollIncomeCap(player, Object.keys(costs), landmarkCost),
        Infinity
    );
});

runTest('CPU本体のexpertロール上限wrapperはpure evaluationへ同値委譲する', () => {
    const { CPU, GameManager, LANDMARK_NAMES, Player } = loadCPURuntime();
    const cpu = new CPU('expert');
    const game = new GameManager(2);
    game.enabledLandmarks = new Set([LANDMARK_NAMES.STATION]);
    const player = game.players[0];
    const cap = Player.landmarkCost(LANDMARK_NAMES.STATION);
    const card = { diceNums: [1, 2] };
    const incomeByDice = {
        1: { before: cap, after: cap + 2 },
        2: { before: cap - 1, after: cap + 2 },
    };
    cpu._estimateOwnRollIncome = (currentGame, currentPlayer, dice, candidateCard) => {
        assert.strictEqual(currentGame, game);
        assert.strictEqual(currentPlayer, player);
        return candidateCard ? incomeByDice[dice].after : incomeByDice[dice].before;
    };

    assert.strictEqual(
        cpu._expertRollIncomeCap(player, game),
        CPUEvaluation.expertRollIncomeCap(player, game.enabledLandmarks, Player.landmarkCost)
    );
    assert.strictEqual(
        cpu._scoreExpertRollCapPenalty(card, game, player),
        CPUEvaluation.expertRollCapPenalty(Object.values(incomeByDice), cap, 'expert')
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

runTest('CPU evaluation は4人expert候補の既存補正を数値featureだけで評価する', () => {
    const base = {
        difficulty: 'expert', playerCount: 4, remainingLandmarks: 5,
        lowDice: true, highDice: false, color: 'green', cost: 2,
        name: 'パン屋', category: 'shop', restaurantCategory: 'restaurant',
        flags: { lowDiceEngineBoost: true, redRestaurantSuppression: true, purpleShortlistDelay: true },
    };
    assert.ok(Math.abs(CPUEvaluation.expertCrowdCardCandidateAdjustment(base) - 2.8) < 1e-12);
    assert.strictEqual(CPUEvaluation.expertCrowdCardCandidateAdjustment({
        ...base, lowDice: false, highDice: true, color: 'red', name: '会員制BAR',
        category: 'restaurant',
    }), -4.2);
    assert.strictEqual(CPUEvaluation.expertCrowdCardCandidateAdjustment({
        ...base, name: 'テレビ局', color: 'purple', lowDice: false,
    }), -3.2);
    assert.strictEqual(CPUEvaluation.expertCrowdCardCandidateAdjustment({
        ...base, remainingLandmarks: 4, name: '食品倉庫', lowDice: false,
    }), -6.3);
    assert.strictEqual(CPUEvaluation.expertCrowdCardCandidateAdjustment({
        ...base, difficulty: 'strong', flags: null,
    }), 0);
    assert.strictEqual(CPUEvaluation.expertCrowdCardCandidateAdjustment(null), 0);
});

runTest('CPU本体の4人expert候補wrapperはpure補正とdifficulty短絡を維持する', () => {
    const { CPU, GameManager, createCardByName, CARD_CATEGORIES } = loadCPURuntime();
    const cpu = new CPU('expert', {
        expertBehaviorFlags: {
            crowdLowDiceEngineBoost: true,
            crowdRedRestaurantSuppression: true,
            crowdPurpleShortlistDelay: true,
        },
    });
    const game = new GameManager(4);
    const player = game.currentPlayer();
    const card = createCardByName('パン屋');
    cpu._baseCardEfficiency = () => 10;
    cpu._scoreExpertRollCapPenalty = () => 1;
    const remainingLandmarks = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
    const expected = 9 + CPUEvaluation.expertCrowdCardCandidateAdjustment({
        difficulty: 'expert',
        playerCount: 4,
        remainingLandmarks,
        lowDice: true,
        highDice: false,
        color: card.color,
        cost: card.cost,
        name: card.name,
        category: card.category,
        restaurantCategory: CARD_CATEGORIES.RESTAURANT,
        flags: {
            lowDiceEngineBoost: true,
            redRestaurantSuppression: true,
            purpleShortlistDelay: true,
        },
    });
    assert.strictEqual(cpu._scoreExpertCardCandidate(card, game, player), expected);

    const normal = new CPU('normal');
    normal._baseCardEfficiency = () => 7;
    normal._scoreExpertRollCapPenalty = () => 2;
    normal._expertFlagEnabled = () => { throw new Error('difficulty gate must stay lazy'); };
    assert.strictEqual(normal._scoreExpertCardCandidate(card, game, player), 5);
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

runTest('CPU evaluation はexpertランドマーク効果bonusを数値featureだけで評価する', () => {
    const names = {
        STATION: 'station', SHOPPING_MALL: 'mall', HARBOR: 'harbor',
        RADIO_TOWER: 'radio', AMUSEMENT_PARK: 'park', AIRPORT: 'airport',
    };
    const base = {
        remainingLandmarkCount: 5,
        hasStation: false,
        mallTargetCardCount: 0,
        harborCardCount: 0,
        harborBaseBonus: 1.5,
        rollDelta: 2,
        rollSwing: 0,
    };
    assert.strictEqual(CPUEvaluation.expertLandmarkEffectBonus(names.STATION, base, names), 8);
    assert.strictEqual(CPUEvaluation.expertLandmarkEffectBonus(names.STATION, {
        ...base, hasStation: true,
    }, names), 0);
    assert.strictEqual(CPUEvaluation.expertLandmarkEffectBonus(names.SHOPPING_MALL, {
        ...base, mallTargetCardCount: 10,
    }, names), 5.6);
    assert.strictEqual(CPUEvaluation.expertLandmarkEffectBonus(names.HARBOR, {
        ...base, harborCardCount: 3,
    }, names), 9.5);
    assert.strictEqual(CPUEvaluation.expertLandmarkEffectBonus(names.RADIO_TOWER, {
        ...base, rollSwing: 7,
    }, names), 8.1);
    assert.strictEqual(CPUEvaluation.expertLandmarkEffectBonus(names.AMUSEMENT_PARK, {
        ...base, hasStation: true,
    }, names), 3.6);
    assert.strictEqual(CPUEvaluation.expertLandmarkEffectBonus(names.AMUSEMENT_PARK, base, names), 1);
    assert.strictEqual(CPUEvaluation.expertLandmarkEffectBonus(names.AIRPORT, {
        ...base, remainingLandmarkCount: 2,
    }, names), 4);
    assert.strictEqual(CPUEvaluation.expertLandmarkEffectBonus('unknown', base, names), 0);
    assert.strictEqual(CPUEvaluation.expertLandmarkEffectBonus(names.STATION, null, names), 0);
});

runTest('CPU本体のexpertランドマーク効果bonus wrapperは必要な期待値だけ評価してpure計算へ委譲する', () => {
    const { CPU, GameManager, LANDMARK_NAMES } = loadCPURuntime();
    const cpu = new CPU('expert');
    const game = new GameManager(4);
    const current = game.currentPlayer();
    cpu._remainingEnabledLandmarks = () => ['a', 'b'];
    const expectedCalls = [];
    cpu._expectedDiceScoreWithHarbor = (_game, useTwo) => {
        expectedCalls.push(useTwo);
        return useTwo ? 10 : 4;
    };
    const actual = cpu._expertV2SimpleLandmarkEffectBonus(game, LANDMARK_NAMES.RADIO_TOWER, 1);
    const expected = CPUEvaluation.expertLandmarkEffectBonus(LANDMARK_NAMES.RADIO_TOWER, {
        remainingLandmarkCount: 2,
        hasStation: !!current.landmarks[LANDMARK_NAMES.STATION],
        mallTargetCardCount: 0,
        harborCardCount: 0,
        harborBaseBonus: cpu.expertHarborLandmarkBaseBonus,
        rollDelta: 1,
        rollSwing: 6,
    }, LANDMARK_NAMES);
    assert.strictEqual(actual, expected);
    assert.deepStrictEqual(expectedCalls, [true, false]);

    expectedCalls.length = 0;
    cpu._expertV2SimpleLandmarkEffectBonus(game, LANDMARK_NAMES.HARBOR, 1);
    assert.deepStrictEqual(expectedCalls, []);
});

runTest('CPU evaluation はnormal安全補正を数値featureだけで評価する', () => {
    const effects = { LOAN: 'loan', RENOVATION: 'renovation' };
    const base = {
        effect: '', color: 'blue', cost: 2, coins: 3,
        builtLandmarkCount: 1, stableIncome: 4, redCardCount: 0,
    };
    assert.strictEqual(CPUEvaluation.normalSafetyAdjustment(base, effects), 0.35);
    assert.strictEqual(CPUEvaluation.normalSafetyAdjustment({
        ...base, effect: effects.LOAN, color: 'red', coins: 8, redCardCount: 2,
    }, effects), -2.2);
    assert.ok(Math.abs(CPUEvaluation.normalSafetyAdjustment({
        ...base, effect: effects.RENOVATION, color: 'purple', cost: 6,
        builtLandmarkCount: 0, stableIncome: 5,
    }, effects) + 2.9) < 1e-12);
    assert.strictEqual(CPUEvaluation.normalSafetyAdjustment(null, effects), 0);
});

runTest('CPU本体のnormal安全補正wrapperはpure evaluationへ完全委譲する', () => {
    const { CPU, GameManager, createCardByName, CARD_EFFECTS } = loadCPURuntime();
    const cpu = new CPU('normal');
    const game = new GameManager(3);
    const current = game.currentPlayer();
    const card = createCardByName('貸金業');
    current.coins = 9;
    current.cards.push(
        { name: 'red-a', color: 'red' },
        { name: 'red-b', color: 'red' }
    );
    cpu._estimateStableIncome = () => 4;
    assert.strictEqual(cpu._normalSafetyAdjustment(card, game, current),
        CPUEvaluation.normalSafetyAdjustment({
            effect: card.effect,
            color: card.color,
            cost: card.cost,
            coins: current.coins,
            builtLandmarkCount: current.builtLandmarkCount(),
            stableIncome: 4,
            redCardCount: 2,
        }, CARD_EFFECTS));
});

runTest('CPU evaluation は重複改装リスクを数値featureだけで評価する', () => {
    assert.strictEqual(CPUEvaluation.duplicateRenovationPenalty(null), 0);
    assert.strictEqual(CPUEvaluation.duplicateRenovationPenalty({
        extraCopies: 0, difficulty: 'expert', includeBoardRisk: true,
        exposedValue: 100, premiumExposure: 4,
    }), 0);
    assert.strictEqual(CPUEvaluation.duplicateRenovationPenalty({
        extraCopies: 2, difficulty: 'normal', includeBoardRisk: false,
        exposedValue: 100, premiumExposure: 4,
    }), 8);
    assert.strictEqual(CPUEvaluation.duplicateRenovationPenalty({
        extraCopies: 2, difficulty: 'strong', includeBoardRisk: true,
        exposedValue: 17, premiumExposure: 2,
    }), 36.65);
    assert.ok(Math.abs(CPUEvaluation.duplicateRenovationPenalty({
        extraCopies: 2, difficulty: 'expert', includeBoardRisk: true,
        exposedValue: 17, premiumExposure: 2,
    }) - 69.3) < 1e-12);
});

runTest('CPU本体の重複改装risk wrapperは短絡順と既存評価値を維持する', () => {
    const { CPU, GameManager, createCardByName, LANDMARK_NAMES } = loadCPURuntime();
    const cpu = new CPU('expert');
    const game = new GameManager(3);
    const player = game.currentPlayer();
    player.cards.push(createCardByName('改装屋'), createCardByName('改装屋'), createCardByName('改装屋'));
    player.landmarks[LANDMARK_NAMES.STATION] = true;
    player.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    player.landmarks[LANDMARK_NAMES.HARBOR] = true;
    const values = {
        [LANDMARK_NAMES.STATION]: 4,
        [LANDMARK_NAMES.SHOPPING_MALL]: 10,
        [LANDMARK_NAMES.HARBOR]: 7,
    };
    const calls = [];
    cpu._builtLandmarkValue = name => {
        calls.push(name);
        return values[name] || 0;
    };

    assert.ok(Math.abs(cpu._duplicateRenovationPenalty(player, 'expert', game) - 69.3) < 1e-12);
    assert.deepStrictEqual(calls, [
        LANDMARK_NAMES.STATION,
        LANDMARK_NAMES.SHOPPING_MALL,
        LANDMARK_NAMES.HARBOR,
    ]);

    calls.length = 0;
    player.cards = player.cards.filter(card => card.name !== '改装屋');
    assert.strictEqual(cpu._duplicateRenovationPenalty(player, 'expert', game), 0);
    assert.deepStrictEqual(calls, []);
});

runTest('CPU evaluation はstrong色役割補正を数値featureだけで評価する', () => {
    const base = {
        color: 'blue', blueCardCount: 0, greenCardCount: 2,
        redCardCount: 0, purpleCardCount: 0, opponentHasEightCoins: false,
        isEndgameMode: false, playerCount: 4, purpleAdjustment: 0.25,
    };
    assert.strictEqual(CPUEvaluation.strongRolePressure(base), 1.65);
    assert.ok(Math.abs(CPUEvaluation.strongRolePressure({
        ...base, color: 'green', greenCardCount: 1, isEndgameMode: true,
        purpleAdjustment: -0.2,
    }) - 2.2) < 1e-12);
    assert.ok(Math.abs(CPUEvaluation.strongRolePressure({
        ...base, color: 'red', opponentHasEightCoins: true, purpleAdjustment: 0.3,
    }) + 1.3) < 1e-12);
    assert.strictEqual(CPUEvaluation.strongRolePressure({
        ...base, color: 'purple', purpleCardCount: 1, purpleAdjustment: 0.4,
    }), -2.8000000000000003);
    assert.strictEqual(CPUEvaluation.strongRolePressure(null), 0);
});

runTest('CPU本体のstrong色役割補正wrapperは短絡順を保ってpure evaluationへ委譲する', () => {
    const { CPU, GameManager, createCardByName } = loadCPURuntime();
    const cpu = new CPU('strong');
    const game = new GameManager(4);
    const current = game.currentPlayer();
    const card = createCardByName('パン屋');
    current.cards.push({ name: 'blue-a', color: 'blue' });
    let endgameCalls = 0;
    cpu._isEndgameMode = () => { endgameCalls += 1; return true; };
    cpu._strongPurpleAdjustment = () => 0.6;
    const expected = CPUEvaluation.strongRolePressure({
        color: card.color,
        blueCardCount: 1,
        greenCardCount: 1,
        redCardCount: 0,
        purpleCardCount: 0,
        opponentHasEightCoins: false,
        isEndgameMode: true,
        playerCount: 4,
        purpleAdjustment: 0.6,
    });
    assert.strictEqual(cpu._strongRolePressure(card, game, current), expected);
    assert.strictEqual(endgameCalls, 1);

    const redCard = { color: 'red' };
    cpu._strongRolePressure(redCard, game, current);
    assert.strictEqual(endgameCalls, 1);
});

runTest('CPU evaluation はCleaning価値特徴量を既存走査順でfrozen投影する', () => {
    const calls = [];
    const selfCard = { id: 'self', name: 'パン屋' };
    const otherCard = { id: 'other', name: 'パン屋' };
    const skippedCard = { id: 'skip', name: 'コンビニ' };
    const dormantCard = { id: 'dormant', name: 'パン屋' };
    const current = { id: 'current', cards: [selfCard, skippedCard] };
    const opponent = { id: 'opponent', cards: [otherCard, dormantCard] };
    const features = CPUEvaluation.expertV2SimpleCleaningFeatures(
        'パン屋',
        current,
        [current, opponent],
        {
            minorCards(player) {
                calls.push('cards:' + player.id);
                return player.cards;
            },
            isDormant(player, card) {
                calls.push('dormant:' + player.id + ':' + card.id);
                return card === dormantCard;
            },
            ownedCardValue(card, player) {
                calls.push('value:' + player.id + ':' + card.id);
                return card === selfCard ? 0.1 : 4;
            },
        }
    );

    assert.deepStrictEqual(features, { opponentValue: 4, selfValue: 0.2 });
    assert.ok(Object.isFrozen(features));
    assert.strictEqual(CPUEvaluation.expertV2SimpleCleaningScore(features), 3.76);
    assert.deepStrictEqual(calls, [
        'cards:current', 'dormant:current:self', 'value:current:self',
        'cards:opponent', 'dormant:opponent:other', 'value:opponent:other',
        'dormant:opponent:dormant',
    ]);
});

runTest('CPU本体のCleaning価値wrapperはpure featureと既存callback順を維持する', () => {
    const { CPU } = loadCPURuntime();
    const cpu = new CPU('expert');
    const calls = [];
    const selfCard = { id: 'self', name: 'パン屋' };
    const otherCard = { id: 'other', name: 'パン屋' };
    const current = {
        getMinorCards() { calls.push('cards:self'); return [selfCard]; },
        isDormant(card) { calls.push('dormant:self:' + card.id); return false; },
    };
    const opponent = {
        getMinorCards() { calls.push('cards:other'); return [otherCard]; },
        isDormant(card) { calls.push('dormant:other:' + card.id); return false; },
    };
    const game = {
        players: [current, opponent],
        currentPlayer() { calls.push('current'); return current; },
    };
    cpu._ownedCardValue = (card, runtime, player) => {
        calls.push('value:' + (player === current ? 'self' : 'other') + ':' + card.id);
        assert.strictEqual(runtime, game);
        return player === current ? 2 : 5;
    };

    assert.strictEqual(cpu._scoreExpertV2SimpleCleaningValue(game, 'パン屋'), 2.6);
    assert.deepStrictEqual(calls, [
        'current', 'cards:self', 'dormant:self:self', 'value:self:self',
        'cards:other', 'dormant:other:other', 'value:other:other',
    ]);
});

runTest('CPU evaluation はstrongランドマーク閾値特徴量を既存読取順でfrozen投影する', () => {
    const effects = { FRENCHR: 'french', MEMBERBAR: 'member' };
    const calls = [];
    const current = {
        cards: [],
        builtLandmarkCount() { calls.push('built'); return 1; },
        countCard(name) { calls.push('count:' + name); return name === 'コーン畑' ? 1 : 2; },
    };
    const opponent = {
        cards: [
            { id: 'french', effect: effects.FRENCHR },
            { id: 'dormant-member', effect: effects.MEMBERBAR, dormant: true },
        ],
        isDormant(card) { calls.push('dormant:' + card.id); return !!card.dormant; },
    };
    const game = { players: [current, opponent] };
    const features = CPUEvaluation.strongLandmarkThresholdFeatures('mall', current, game, {
        difficulty: 'strong',
        effects,
        remainingEnabledLandmarks(player, runtime) {
            calls.push(player === current && runtime === game ? 'remaining' : 'wrong');
            return ['mall', 'harbor', 'airport'];
        },
    });

    assert.deepStrictEqual(features, {
        difficulty: 'strong',
        hasName: true,
        nextBuiltCount: 2,
        progressCardCount: 3,
        opponentConditionalCards: [{ french: 1, memberBar: 0 }],
        remainingLandmarkCount: 3,
    });
    assert.ok(Object.isFrozen(features));
    assert.ok(Object.isFrozen(features.opponentConditionalCards));
    assert.ok(Object.isFrozen(features.opponentConditionalCards[0]));
    assert.deepStrictEqual(calls, [
        'dormant:french', 'dormant:dormant-member',
        'dormant:french', 'dormant:dormant-member',
        'built', 'count:コーン畑', 'count:雑貨屋', 'remaining',
    ]);
});

runTest('CPU evaluation はstrong条件付き赤カード圧力を数値featureだけで評価する', () => {
    const effects = { FRENCHR: 'french', MEMBERBAR: 'member' };

    assert.strictEqual(
        CPUEvaluation.strongConditionalCardAdjustment(
            effects.FRENCHR, [1, 2, 3], 'strong', effects
        ),
        3.2
    );
    assert.strictEqual(
        CPUEvaluation.strongConditionalCardAdjustment(
            effects.MEMBERBAR, [1, 2], 'strong', effects
        ),
        -1.2
    );
    assert.strictEqual(
        CPUEvaluation.strongConditionalCardAdjustment(
            effects.MEMBERBAR, [0, 1], 'strong', effects
        ),
        -3.6
    );
    assert.strictEqual(
        CPUEvaluation.strongConditionalCardAdjustment(
            effects.FRENCHR, [2], 'expert', effects
        ),
        0
    );
    assert.ok(Math.abs(
        CPUEvaluation.strongLandmarkThresholdPenalty({
            difficulty: 'strong',
            hasName: true,
            nextBuiltCount: 2,
            progressCardCount: 2,
            opponentConditionalCards: [{ french: 2, memberBar: 1 }],
            remainingLandmarkCount: 2,
        }) - 3.36
    ) < 1e-12);
    assert.strictEqual(
        CPUEvaluation.strongLandmarkThresholdPenalty({
            difficulty: 'strong',
            hasName: true,
            nextBuiltCount: 3,
            progressCardCount: 0,
            opponentConditionalCards: [{ french: 1, memberBar: 2 }],
            remainingLandmarkCount: 3,
        }),
        6.6
    );
});

runTest('CPU evaluation はstrong出目テンポとランドマーク相乗を数値featureで評価する', () => {
    assert.strictEqual(CPUEvaluation.strongTempoValueBonus({
        difficulty: 'strong', color: 'blue', lowDice: true, highDice: false,
        oneDieOpponentCount: 2, selfOneDie: false, playerCount: 3,
    }), 0.7);
    assert.ok(Math.abs(CPUEvaluation.strongTempoValueBonus({
        difficulty: 'strong', color: 'red', lowDice: false, highDice: true,
        oneDieOpponentCount: 3, selfOneDie: false, playerCount: 4,
    }) + 1.5) < 1e-12);
    assert.strictEqual(CPUEvaluation.strongTempoValueBonus({
        difficulty: 'strong', color: 'green', lowDice: true, highDice: false,
        oneDieOpponentCount: 0, selfOneDie: true, playerCount: 2,
    }), 0.9);
    assert.strictEqual(CPUEvaluation.strongTempoValueBonus({ difficulty: 'expert' }), 0);

    assert.strictEqual(CPUEvaluation.landmarkCardSynergyBonus({
        hasStation: true, hasMall: false, hasHarbor: false, hasTower: true,
        hasPark: true, hasAirport: false, lowDice: false, highDice: true,
        mallCategory: false, harborEffect: false, cost: 5,
    }), 1.75);
    assert.strictEqual(CPUEvaluation.landmarkCardSynergyBonus({
        hasStation: false, hasMall: true, hasHarbor: true, hasTower: false,
        hasPark: false, hasAirport: false, lowDice: false, highDice: true,
        mallCategory: true, harborEffect: true, cost: 5,
    }), 2.1);
    assert.strictEqual(CPUEvaluation.landmarkCardSynergyBonus({
        hasStation: false, hasMall: false, hasHarbor: false, hasTower: false,
        hasPark: false, hasAirport: true, lowDice: true, highDice: false,
        mallCategory: false, harborEffect: false, cost: 3,
    }), -0.5);
});

runTest('CPU evaluation はstrong多人数戦の攻撃希釈と妨害解禁をpureに判定する', () => {
    assert.strictEqual(CPUEvaluation.strongCrowdAttackScale(1 / 3, true), (1 / 3) * 0.45);
    assert.strictEqual(CPUEvaluation.strongCrowdAttackScale(1 / 3, false), 1 / 3);
    assert.strictEqual(CPUEvaluation.strongCrowdDisruptionReady(9, 2), false);
    assert.strictEqual(CPUEvaluation.strongCrowdDisruptionReady(10, 2), true);
    assert.strictEqual(CPUEvaluation.strongCrowdDisruptionReady(4, 3), true);
});

runTest('CPU本体のstrong多人数戦policy wrapperはpure evaluationへ同値委譲する', () => {
    const { CPU, GameManager } = loadCPURuntime();
    const cpu = new CPU('strong');
    const game = new GameManager(4);
    const player = game.currentPlayer();
    const opponentScale = cpu._opponentDilutionFactor(game);
    const stableIncome = cpu._estimateStableIncome(game, player);
    const builtCount = player.builtLandmarkCount();

    assert.strictEqual(
        cpu._strongCrowdAttackScale(game),
        CPUEvaluation.strongCrowdAttackScale(opponentScale, true)
    );
    assert.strictEqual(
        cpu._strongCrowdDisruptionReady(game, player),
        CPUEvaluation.strongCrowdDisruptionReady(stableIncome, builtCount)
    );
    assert.strictEqual(cpu._strongCrowdDisruptionReady(game, null), true);
});

runTest('CPU evaluation はstrong紫カード補正と購入準備をpureに判定する', () => {
    assert.strictEqual(CPUEvaluation.strongPurpleAdjustment({
        stadium: true, tv: false, business: false, renovation: false,
        itStartup: false, loan: false, crowd: true, stableIncome: 0,
    }), 3.4);
    assert.strictEqual(CPUEvaluation.strongPurpleAdjustment({
        stadium: false, tv: true, business: false, renovation: false,
        itStartup: false, loan: false, crowd: false, stableIncome: 0,
    }), 1.6);
    assert.strictEqual(CPUEvaluation.strongPurpleAdjustment({
        stadium: false, tv: false, business: false, renovation: true,
        itStartup: true, loan: true, crowd: true, stableIncome: 6,
    }), -5.8);
    assert.strictEqual(CPUEvaluation.strongPremiumPurpleReady(10, 2, 4), true);
    assert.strictEqual(CPUEvaluation.strongPremiumPurpleReady(5, 3, 4), true);
    assert.strictEqual(CPUEvaluation.strongPremiumPurpleReady(5, 1, 2), true);
    assert.strictEqual(CPUEvaluation.strongPremiumPurpleReady(9, 2, 3), false);
});

runTest('CPU evaluation はstrong多人数購入補正を同じ加算順でpureに適用する', () => {
    const base = {
        blue: false, green: false, red: false, purple: false,
        premiumPurple: false, premiumPurpleReady: true,
        stableIncome: 10, remainingLandmarkCount: 2, oneDieOpponentCount: 0,
        lowDice: false, highDice: false, itStartup: false, cost: 4,
        hasStation: true, hasMall: true, convenienceStore: false, bakery: false,
    };
    assert.strictEqual(CPUEvaluation.strongCrowdPurchaseScore(10, {
        ...base, green: true, stableIncome: 7, oneDieOpponentCount: 2,
        lowDice: true, cost: 3, hasStation: false,
    }), 15.299999999999999);
    assert.strictEqual(CPUEvaluation.strongCrowdPurchaseScore(10, {
        ...base, red: true, stableIncome: 9, oneDieOpponentCount: 2, highDice: true,
    }), 4.700000000000001);
    assert.strictEqual(CPUEvaluation.strongCrowdPurchaseScore(10, {
        ...base, purple: true, stableIncome: 9, remainingLandmarkCount: 3,
        oneDieOpponentCount: 2, highDice: true, itStartup: true,
    }), 2.2000000000000006);
    assert.strictEqual(CPUEvaluation.strongCrowdPurchaseScore(10, {
        ...base, purple: true, premiumPurple: true, premiumPurpleReady: false,
    }), 6.8);
    assert.strictEqual(CPUEvaluation.strongCrowdPurchaseScore(10, {
        ...base, blue: true, lowDice: true, cost: 2,
    }), 12.200000000000001);
    assert.strictEqual(CPUEvaluation.strongCrowdPurchaseScore(10, {
        ...base, convenienceStore: true, bakery: true, hasStation: false, hasMall: false,
    }), 11.1);
    assert.strictEqual(CPUEvaluation.strongCrowdPurchaseScore(10, null), 10);
});

runTest('CPU本体のstrong多人数購入wrapperはfeature adapterからpure policyへ委譲する', () => {
    const { CPU, GameManager, createCardByName, CARD_EFFECTS, LANDMARK_NAMES } = loadCPURuntime();
    const cpu = new CPU('strong');
    const game = new GameManager(4);
    const player = game.currentPlayer();
    const card = createCardByName('パン屋');
    game.players[1].landmarks[LANDMARK_NAMES.STATION] = true;
    const stableIncome = cpu._estimateStableIncome(game, player);
    const remainingLandmarkCount = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
    const oneDieOpponentCount = cpu._strongCrowdOneDieOpponents(game, player);
    const lowDice = Math.max(...card.diceNums) <= 6;
    const highDice = Math.min(...card.diceNums) >= 7;
    const premiumPurple = [CARD_EFFECTS.STADIUM, CARD_EFFECTS.TV, CARD_EFFECTS.BUSINESS].includes(card.effect);
    const startScore = 3.25;

    assert.strictEqual(cpu._strongCrowdPurchaseScore(startScore, card, game, player), CPUEvaluation.strongCrowdPurchaseScore(startScore, {
        blue: false, green: true, red: false, purple: false,
        premiumPurple, premiumPurpleReady: true,
        stableIncome, remainingLandmarkCount, oneDieOpponentCount,
        lowDice, highDice, itStartup: card.effect === CARD_EFFECTS.ITSTARTUP,
        cost: card.cost,
        hasStation: !!player.landmarks[LANDMARK_NAMES.STATION],
        hasMall: !!player.landmarks[LANDMARK_NAMES.SHOPPING_MALL],
        convenienceStore: false, bakery: true,
    }));
});

runTest('CPU evaluation はstrongランドマーク特徴量を盤面からfrozen projectionする', () => {
    const { CARD_CATEGORIES, CARD_EFFECTS, LANDMARK_NAMES } = loadCPURuntime();
    const current = {
        cards: [
            { name: 'マグロ漁船', category: CARD_CATEGORIES.PRIMARY, effect: CARD_EFFECTS.TUNA, cost: 5, diceNums: [12, 13, 14] },
            { name: 'マグロ漁船', category: CARD_CATEGORIES.PRIMARY, effect: CARD_EFFECTS.TUNA, cost: 5, diceNums: [12, 13, 14] },
            { name: 'cheap-shop', category: CARD_CATEGORIES.SHOP, effect: CARD_EFFECTS.NORMAL, cost: 2, diceNums: [3] },
        ],
        landmarks: { [LANDMARK_NAMES.STATION]: true },
        countCard(cardName) {
            return this.cards.filter(card => card.name === cardName).length;
        },
    };
    const game = { players: [current, {}, {}, {}] };
    const features = CPUEvaluation.strongLandmarkUrgencyFeatures(
        LANDMARK_NAMES.HARBOR,
        current,
        game,
        {
            landmarkNames: LANDMARK_NAMES,
            categories: CARD_CATEGORIES,
            effects: CARD_EFFECTS,
            estimateStableIncome: () => 7.5,
        }
    );
    assert.ok(Object.isFrozen(features));
    assert.deepStrictEqual(features, {
        station: false,
        mall: false,
        harbor: true,
        tower: false,
        park: false,
        airport: false,
        crowd: true,
        stableIncome: 7.5,
        shopRestaurantCardCount: 1,
        harborCardCount: 2,
        highVarianceCardCount: 2,
        cheapEngineCardCount: 1,
        tunaBoatLevel: 2,
        hasStation: true,
    });
});

runTest('CPU evaluation はstrongランドマーク優先度の全分岐をpureに判定する', () => {
    const base = {
        station: false, mall: false, harbor: false, tower: false, park: false, airport: false,
        crowd: false, stableIncome: 0, shopRestaurantCardCount: 0, harborCardCount: 0,
        highVarianceCardCount: 0, cheapEngineCardCount: 4, tunaBoatLevel: 0, hasStation: false,
    };
    assert.strictEqual(CPUEvaluation.strongLandmarkUrgencyBonus({ ...base, station: true, crowd: true }), 2);
    assert.strictEqual(CPUEvaluation.strongLandmarkUrgencyBonus({ ...base, station: true, highVarianceCardCount: 2 }), 2);
    assert.strictEqual(CPUEvaluation.strongLandmarkUrgencyBonus({ ...base, mall: true, crowd: true, shopRestaurantCardCount: 4 }), 2);
    assert.strictEqual(CPUEvaluation.strongLandmarkUrgencyBonus({ ...base, mall: true, shopRestaurantCardCount: 5 }), 1);
    assert.strictEqual(CPUEvaluation.strongLandmarkUrgencyBonus({
        ...base, harbor: true, crowd: true, tunaBoatLevel: 2, harborCardCount: 3,
    }), 4);
    assert.strictEqual(CPUEvaluation.strongLandmarkUrgencyBonus({
        ...base, tower: true, hasStation: true, highVarianceCardCount: 4,
    }), 3);
    assert.strictEqual(CPUEvaluation.strongLandmarkUrgencyBonus({
        ...base, park: true, hasStation: true, highVarianceCardCount: 1,
    }), 1);
    assert.strictEqual(CPUEvaluation.strongLandmarkUrgencyBonus({ ...base, park: true }), 0);
    assert.strictEqual(CPUEvaluation.strongLandmarkUrgencyBonus({
        ...base, airport: true, stableIncome: 8, cheapEngineCardCount: 3,
    }), 2);
    assert.strictEqual(CPUEvaluation.strongLandmarkUrgencyBonus(base), 0);
});

runTest('CPU本体のstrongランドマーク優先度wrapperはpure policyへ委譲する', () => {
    const { CPU, GameManager, createCardByName, CARD_CATEGORIES, CARD_EFFECTS, LANDMARK_NAMES } = loadCPURuntime();
    const cpu = new CPU('strong');
    const game = new GameManager(4);
    const current = game.currentPlayer();
    current.cards.push(createCardByName('マグロ漁船'), createCardByName('マグロ漁船'));
    const name = LANDMARK_NAMES.HARBOR;
    const features = CPUEvaluation.strongLandmarkUrgencyFeatures(name, current, game, {
        landmarkNames: LANDMARK_NAMES,
        categories: CARD_CATEGORIES,
        effects: CARD_EFFECTS,
        estimateStableIncome: (runtime, player) => cpu._estimateStableIncome(runtime, player),
    });

    assert.strictEqual(
        cpu._strongLandmarkUrgencyBonus(name, current, game),
        CPUEvaluation.strongLandmarkUrgencyBonus(features)
    );
});

runTest('CPU本体のstrong紫カードwrapperはfeature adapterからpure policyへ委譲する', () => {
    const { CPU, GameManager, createCardByName } = loadCPURuntime();
    const cpu = new CPU('strong');
    const game = new GameManager(4);
    const current = game.currentPlayer();
    const tv = createCardByName('テレビ局');
    const stableIncome = cpu._estimateStableIncome(game, current);

    assert.strictEqual(cpu._strongPurpleAdjustment(tv, game, current), CPUEvaluation.strongPurpleAdjustment({
        stadium: false, tv: true, business: false, renovation: false,
        itStartup: false, loan: false, crowd: true, stableIncome,
    }));
    assert.strictEqual(cpu._strongPremiumPurpleReady(tv, game, current), CPUEvaluation.strongPremiumPurpleReady(
        stableIncome,
        current.builtLandmarkCount(),
        [...game.enabledLandmarks].filter(name => !current.landmarks[name]).length
    ));
});

runTest('CPU本体のtempo/synergy wrapperはfeature adapterからpure policyへ委譲する', () => {
    const {
        CPU, GameManager, createCardByName, CARD_CATEGORIES, CARD_EFFECTS, LANDMARK_NAMES,
    } = loadCPURuntime();
    const cpu = new CPU('strong');
    const game = new GameManager(4);
    const current = game.currentPlayer();
    const card = createCardByName('寿司屋');
    current.landmarks[LANDMARK_NAMES.HARBOR] = true;
    game.players[1].landmarks[LANDMARK_NAMES.STATION] = true;
    const lowDice = Math.max(...card.diceNums) <= 6;
    const highDice = Math.min(...card.diceNums) >= 7;

    assert.strictEqual(cpu._strongTempoValueBonus(card, game, current), CPUEvaluation.strongTempoValueBonus({
        difficulty: 'strong', color: card.color, lowDice, highDice,
        oneDieOpponentCount: game.players.filter(player =>
            player !== current && !player.landmarks[LANDMARK_NAMES.STATION]
        ).length,
        selfOneDie: !current.landmarks[LANDMARK_NAMES.STATION],
        playerCount: game.players.length,
    }));
    assert.strictEqual(cpu._landmarkCardSynergyBonus(card, game, current), CPUEvaluation.landmarkCardSynergyBonus({
        hasStation: !!current.landmarks[LANDMARK_NAMES.STATION],
        hasMall: !!current.landmarks[LANDMARK_NAMES.SHOPPING_MALL],
        hasHarbor: !!current.landmarks[LANDMARK_NAMES.HARBOR],
        hasTower: !!current.landmarks[LANDMARK_NAMES.RADIO_TOWER],
        hasPark: !!current.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK],
        hasAirport: !!current.landmarks[LANDMARK_NAMES.AIRPORT],
        lowDice, highDice,
        mallCategory: card.category === CARD_CATEGORIES.RESTAURANT || card.category === CARD_CATEGORIES.SHOP,
        harborEffect: [CARD_EFFECTS.HARBOR, CARD_EFFECTS.HARBOR_RED, CARD_EFFECTS.TUNA].includes(card.effect),
        cost: card.cost,
    }));
});

runTest('CPU本体のstrong条件付き赤wrapperはfeature adapterからpure policyへ委譲する', () => {
    const {
        CPU, GameManager, createCardByName, CARD_EFFECTS, LANDMARK_NAMES,
    } = loadCPURuntime();
    const cpu = new CPU('strong');
    const game = new GameManager(3);
    const current = game.currentPlayer();
    current.cards.push(createCardByName('コーン畑'));
    current.landmarks[LANDMARK_NAMES.STATION] = true;
    game.players[1].landmarks[LANDMARK_NAMES.STATION] = true;
    game.players[1].landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    game.players[1].cards.push(createCardByName('高級フレンチ'));
    const french = createCardByName('高級フレンチ');
    const opponentBuiltCounts = game.players
        .filter(player => player !== current)
        .map(player => player.builtLandmarkCount());

    assert.strictEqual(
        cpu._strongConditionalCardAdjustment(french, game, current),
        CPUEvaluation.strongConditionalCardAdjustment(
            french.effect, opponentBuiltCounts, 'strong', CARD_EFFECTS
        )
    );
    assert.strictEqual(
        cpu._strongLandmarkThresholdPenalty(LANDMARK_NAMES.SHOPPING_MALL, current, game),
        CPUEvaluation.strongLandmarkThresholdPenalty(
            CPUEvaluation.strongLandmarkThresholdFeatures(
                LANDMARK_NAMES.SHOPPING_MALL,
                current,
                game,
                {
                    difficulty: 'strong',
                    effects: CARD_EFFECTS,
                    remainingEnabledLandmarks: (player, runtime) => cpu._remainingEnabledLandmarks(player, runtime),
                }
            )
        )
    );
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

runTest('CPU evaluation は自己収入をカード効果ごとのpure値へ投影する', () => {
    const {
        CPU, GameManager, createCardByName, CARD_CATEGORIES, CARD_EFFECTS, LANDMARK_NAMES,
    } = loadCPURuntime();
    const cpu = new CPU('expert');
    const game = new GameManager(3);
    const owner = game.currentPlayer();
    const opponent = game.players[1];
    const other = game.players[2];
    opponent.coins = 12;
    other.coins = 3;
    opponent.cards.push(createCardByName('カフェ'), createCardByName('コンビニ'));
    const evaluate = card => CPUEvaluation.cardSelfIncomeValue(
        card, game, owner, owner,
        CARD_EFFECTS, CARD_CATEGORIES, LANDMARK_NAMES,
        GameManager.calcCardIncome
    );

    assert.strictEqual(CPUEvaluation.cardSelfIncomeValue(
        createCardByName('パン屋'), game, owner, opponent,
        CARD_EFFECTS, CARD_CATEGORIES, LANDMARK_NAMES, GameManager.calcCardIncome
    ), 0);
    assert.strictEqual(evaluate(createCardByName('麦畑')), 1);
    assert.strictEqual(evaluate(createCardByName('カフェ')), 0);
    assert.strictEqual(evaluate(createCardByName('スタジアム')), 4);
    assert.strictEqual(evaluate(createCardByName('テレビ局')), 5);
    assert.strictEqual(evaluate(createCardByName('出版社')), 4);
    assert.strictEqual(evaluate(createCardByName('税務署')), 6);
    owner.itVentureCoins = 2;
    assert.strictEqual(evaluate(createCardByName('ITベンチャー')), 4);
    assert.strictEqual(evaluate(createCardByName('公園')), 0);
    owner.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
    assert.strictEqual(evaluate(createCardByName('パン屋')), 2);

    const cards = ['麦畑', 'チーズ工場', 'スタジアム', 'テレビ局', '出版社', '税務署', 'ITベンチャー', '公園', 'パン屋'];
    for (const name of cards) {
        const card = createCardByName(name);
        assert.strictEqual(cpu._cardSelfIncomeValue(card, game, owner, owner, 6), evaluate(card), name);
    }
});

runTest('CPU evaluation はcard activationのeffect dispatchと依存呼出をpureに維持する', () => {
    const effects = {
        HARBOR: 'harbor', TUNA: 'tuna', CORNFIELD: 'cornfield', HARBOR_RED: 'harborRed',
        FRENCHR: 'french', MEMBERBAR: 'member', CHEESE: 'cheese', FURNITURE: 'furniture',
        FLOWER: 'flower', MARKET: 'market', FOODWAREHOUSE: 'food', DRINKFACTORY: 'drink',
        WINERY: 'winery', FEWLANDMARK: 'few', STADIUM: 'stadium', TV: 'tv',
        PUBLISHER: 'publisher', TAXOFFICE: 'tax', LOAN: 'loan', BUSINESS: 'business',
        CLEANING: 'cleaning', MOVER: 'mover', RENOVATION: 'renovation', ITSTARTUP: 'it', PARK: 'park',
    };
    const owner = {
        cards: [], coins: 3, landmarks: { harborName: true, mallName: true },
        isDormant: () => false,
    };
    const roller = { coins: 4, landmarks: {}, builtLandmarkCount: () => 3 };
    const game = { players: [owner, roller] };
    const calls = [];
    const options = {
        effects,
        categories: { RESTAURANT: 'restaurant', SHOP: 'shop' },
        landmarkNames: { HARBOR: 'harborName', SHOPPING_MALL: 'mallName' },
        capValue: value => { calls.push(['cap', value]); return value * 2; },
        calcCardIncome: () => 7,
        estimateTvValue: () => 8,
        estimatePublisherValue: () => 9,
        estimateTaxOfficeValue: () => 10,
        estimateBusinessValue: () => 11,
        estimateCleaningValue: () => 12,
        estimateMoverValue: () => 13,
        estimateRenovationValue: (_game, _owner, ordinal) => 13 + ordinal,
        estimateItStartupValue: () => 15,
        estimateParkValue: () => 16,
    };
    const card = (color, effect, income = 1, category = '') => ({ color, effect, income, category, name: effect });

    assert.strictEqual(CPUEvaluation.cardActivationValue(card('red', 'normal', 2, 'restaurant'), game, owner, roller, 3, options), 6);
    assert.strictEqual(CPUEvaluation.cardActivationValue(card('red', effects.MEMBERBAR, 5), game, owner, roller, 3, options), 8);
    assert.strictEqual(CPUEvaluation.cardActivationValue(card('green', effects.TV), game, owner, owner, 6, options), 16);
    assert.strictEqual(CPUEvaluation.cardActivationValue(card('green', effects.LOAN), game, owner, owner, 5, options), -2);
    const renovation = card('green', effects.RENOVATION);
    owner.cards.push(renovation, renovation);
    assert.strictEqual(CPUEvaluation.cardActivationValue(renovation, game, owner, owner, 6, options), 28);
    assert.strictEqual(CPUEvaluation.cardActivationValue(card('blue', effects.CORNFIELD), game, owner, owner, 3, options), 14);
    assert.ok(calls.length >= 5);
});

runTest('CPU evaluation はcard purchase valueのeffect倍率とcallbackをpureに合成する', () => {
    const effects = {
        CHEESE: 'cheese', FURNITURE: 'furniture', FLOWER: 'flower', MARKET: 'market',
        FOODWAREHOUSE: 'food', DRINKFACTORY: 'drink', WINERY: 'winery', FEWLANDMARK: 'few',
        CORNFIELD: 'cornfield', STADIUM: 'stadium', TV: 'tv', PUBLISHER: 'publisher',
        TAXOFFICE: 'tax', HARBOR: 'harbor', HARBOR_RED: 'harborRed', TUNA: 'tuna',
        FRENCHR: 'french', MEMBERBAR: 'member', LOAN: 'loan', ITSTARTUP: 'it',
        RENOVATION: 'renovation', CLEANING: 'cleaning', MOVER: 'mover', BUSINESS: 'business', PARK: 'park',
    };
    const player = {
        coins: 4,
        landmarks: { harborName: false },
        countCard: name => name === 'renovationName' ? 2 : 0,
    };
    const game = { players: [player, {}, {}] };
    const profile = { blueFactor: 2, redFactor: 3, greenFactor: 4, purpleFactor: 5, massAttackFactor: 6 };
    const options = {
        effects,
        landmarkNames: { HARBOR: 'harborName' },
        calcCardIncome: () => 7,
        estimateTvValue: () => 8,
        estimatePublisherValue: () => 9,
        estimateTaxOfficeValue: () => 10,
        estimateConditionalRedValue: () => 11,
        estimateItStartupValue: (_game, _player, assumeInvest) => assumeInvest ? 12 : -1,
        estimateRenovationValue: (_game, _player, ordinal) => 10 + ordinal,
        estimateCleaningValue: () => 14,
        estimateMoverValue: () => 15,
        estimateBusinessValue: () => 16,
        renovationCardName: 'renovationName',
    };
    const value = (effect, color = 'green', income = 2) => CPUEvaluation.cardPurchaseValue(
        { effect, color, income }, game, player, profile, options
    );

    assert.strictEqual(value(effects.CHEESE), 28);
    assert.strictEqual(value(effects.STADIUM), 36);
    assert.strictEqual(value(effects.TV), 40);
    assert.strictEqual(value(effects.HARBOR, 'blue', 5), 4);
    assert.strictEqual(value(effects.LOAN), 14);
    assert.strictEqual(value(effects.ITSTARTUP), 72);
    assert.strictEqual(value(effects.RENOVATION), 52);
    assert.strictEqual(value(effects.BUSINESS), 16);
    game.players.pop();
    assert.strictEqual(value(effects.BUSINESS), 18.4);
    assert.strictEqual(value(effects.PARK), 0);
    assert.strictEqual(value('normal', 'purple', 3), 15);
});

runTest('CPU evaluation はweighted dice期待値と港代替scoreの呼出順をpureに固定する', () => {
    const outcomes = [
        { total: 1, weight: 1 },
        { total: 10, weight: 2 },
        { total: 12, weight: 1 },
    ];
    const calls = [];
    const score = CPUEvaluation.expectedDiceScore(
        outcomes,
        dice => { calls.push(['base', dice]); return dice; },
        {
            alternateMinDice: 10,
            alternateScoreForDice: dice => { calls.push(['alternate', dice]); return dice + 3; },
        }
    );
    assert.strictEqual(score, 10.5);
    assert.deepStrictEqual(calls, [
        ['base', 1],
        ['base', 10], ['alternate', 10],
        ['base', 12], ['alternate', 12],
    ]);
    assert.strictEqual(CPUEvaluation.expectedDiceScore([], () => 99), 0);
    assert.strictEqual(CPUEvaluation.expectedDiceScore(null, () => 99), 0);
});

runTest('CPU evaluation は1個・2個振りの期待値とdice読出順をpureに固定する', () => {
    const calls = [];
    const scores = CPUEvaluation.turnScorePair(true, dice => {
        calls.push(dice);
        return dice;
    });
    assert.deepStrictEqual(scores, { one: 3.5, two: 7 });
    assert.deepStrictEqual(calls, [1, 2, 3, 4, 5, 6, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    const oneDieCalls = [];
    assert.deepStrictEqual(
        CPUEvaluation.turnScorePair(false, dice => { oneDieCalls.push(dice); return 2; }),
        { one: 2, two: -Infinity }
    );
    assert.deepStrictEqual(oneDieCalls, [1, 2, 3, 4, 5, 6]);
});


runTest('CPU evaluation はexpert収入capの全modeを同じ算術でpureに評価する', () => {
    const facts = { remainingLandmarkCosts: [4, 10, 16], coins: 7 };
    const expected = {
        hard30: 30,
        hard40: 40,
        hard50: 50,
        soft30: 45,
        soft40: 50,
        soft50: 55,
        landmarkTotalHard: 30,
        landmarkTotalSoft25: 37.5,
        landmarkTotalSoft50: 45,
        landmarkNeedHard: 23,
        landmarkNeedSoft25: 32.25,
        landmarkNeedSoft50: 41.5,
        landmarkMaxHard: 16,
        landmarkMaxSoft25: 27,
        landmarkMaxSoft50: 38,
        landmarkMaxNeedHard: 9,
        landmarkMaxNeedSoft25: 21.75,
        landmarkMaxNeedSoft50: 34.5,
        none: 60,
        unknown: 60,
    };
    for (const [mode, result] of Object.entries(expected)) {
        assert.strictEqual(CPUEvaluation.expertPositiveIncomeCap(60, mode, facts), result, mode);
    }
    assert.deepStrictEqual(facts.remainingLandmarkCosts, [4, 10, 16]);
});

runTest('CPU evaluation のexpert収入capはmodeごとに必要なfactだけを読む', () => {
    const calls = [];
    const facts = {
        remainingLandmarkCosts() { calls.push('costs'); return [4, 10]; },
        coins() { calls.push('coins'); return 3; },
    };
    assert.strictEqual(CPUEvaluation.expertPositiveIncomeCap(80, 'hard30', facts), 30);
    assert.deepStrictEqual(calls, []);
    assert.strictEqual(CPUEvaluation.expertPositiveIncomeCap(80, 'landmarkTotalHard', facts), 14);
    assert.deepStrictEqual(calls, ['costs']);
    calls.length = 0;
    assert.strictEqual(CPUEvaluation.expertPositiveIncomeCap(80, 'landmarkMaxNeedHard', facts), 7);
    assert.deepStrictEqual(calls, ['costs', 'coins']);
});

runTest('CPU wrapperはv2simple時だけexpert収入capへlandmark factを渡す', () => {
    const { CPU, Player } = loadCPURuntime();
    const player = new Player('CPU');
    player.coins = 7;
    player.landmarks['駅'] = true;
    const game = { enabledLandmarks: new Set(['駅', 'ショッピングモール']), players: [player] };
    const cpu = new CPU('expert', { expertPreset: 'v2simple' });
    cpu.expertIncomeCapMode = 'landmarkNeedHard';
    assert.strictEqual(cpu._expertV2CappedPositiveIncome(game, player, 99), 3);

    const normal = new CPU('normal');
    assert.strictEqual(normal._expertV2CappedPositiveIncome(null, null, 99), 99);
});

runTest('CPU evaluation はexpert card penalty表の既存分岐と値をpureに固定する', () => {
    const score = (cardName, copies, remainingLandmarks, playerCount = 4, built = 1) =>
        CPUEvaluation.expertCardPenalty({
            cardName, copies, remainingLandmarks, playerCount, builtLandmarkCount: built,
        });
    assert.strictEqual(score('スタジアム', 2, 5), 15);
    assert.strictEqual(score('公園', 2, 5), 12);
    assert.strictEqual(score('改装屋', 1, 2, 2, 0), 23);
    assert.strictEqual(score('改装屋', 2, 2, 2, 1), 34);
    assert.strictEqual(score('貸金業', 2, 3), 20);
    assert.strictEqual(score('貸金業', 3, 5), 17);
    assert.strictEqual(score('食品倉庫', 2, 4), 16);
    assert.strictEqual(score('ピザ屋', 2, 4), 12);
    assert.strictEqual(score('ブドウ園', 2, 4), 10);
    assert.strictEqual(score('寿司屋', 2, 4), 10);
    assert.strictEqual(score('雑貨屋', 3, 2), 14);
    assert.strictEqual(score('雑貨屋', 2, 2), 0);
    assert.strictEqual(score('麦畑', 5, 1), 0);
});

runTest('CPU evaluation のexpert card penaltyは改装屋以外でlandmark countを読まない', () => {
    let reads = 0;
    const facts = {
        cardName: 'スタジアム',
        copies: 1,
        remainingLandmarks: 5,
        playerCount: 4,
        builtLandmarkCount() { reads++; return 0; },
    };
    assert.strictEqual(CPUEvaluation.expertCardPenalty(facts), 12);
    assert.strictEqual(reads, 0);
    assert.strictEqual(CPUEvaluation.expertCardPenalty({ ...facts, cardName: '改装屋' }), 23);
    assert.strictEqual(reads, 1);
});

runTest('CPU evaluation はexpert 4人戦のnormal寄せ条件をpureに固定する', () => {
    const current = { id: 'current' };
    const evaluate = (overrides = {}) => CPUEvaluation.expertCrowdNormalPlan({
        difficulty: 'expert',
        playerCount: 4,
        currentPlayer: current,
        remainingLandmarkCount: () => 2,
        stableIncome: () => 12,
        ...overrides,
    });
    assert.strictEqual(evaluate(), true);
    assert.strictEqual(evaluate({ remainingLandmarkCount: () => 1 }), false);
    assert.strictEqual(evaluate({ remainingLandmarkCount: () => 1, stableIncome: () => 9 }), true);
    assert.strictEqual(evaluate({ difficulty: 'strong' }), false);
    assert.strictEqual(evaluate({ playerCount: 3 }), false);
    assert.strictEqual(evaluate({ currentPlayer: null }), false);
});

runTest('CPU evaluation のexpert normal寄せ判定は既存fact順と短絡を維持する', () => {
    const trace = [];
    const result = CPUEvaluation.expertCrowdNormalPlan({
        difficulty: 'expert',
        playerCount() { trace.push('count'); return 4; },
        currentPlayer() { trace.push('current'); return { id: 1 }; },
        remainingLandmarkCount(current) { trace.push(['remaining', current.id]); return 3; },
        stableIncome(current) { trace.push(['income', current.id]); return 20; },
    });
    assert.strictEqual(result, true);
    assert.deepStrictEqual(trace, ['count', 'current', ['remaining', 1], ['income', 1]]);

    trace.length = 0;
    assert.strictEqual(CPUEvaluation.expertCrowdNormalPlan({
        difficulty: 'normal',
        playerCount() { throw new Error('must stay lazy'); },
    }), false);
    assert.deepStrictEqual(trace, []);
});

runTest('CPU evaluation はexpert自己レース優先時の妨害倍率表をpureに固定する', () => {
    const evaluate = (overrides = {}) => CPUEvaluation.expertDisruptionScale({
        gameAvailable: true,
        difficulty: 'expert',
        selfRacePriority: true,
        focusIndex: null,
        currentPlayerIndex: 2,
        myDistance: () => 5,
        bestOpponentDistance: () => 6,
        remainingLandmarkCount: () => 2,
        ...overrides,
    });
    assert.strictEqual(evaluate(), 0.3);
    assert.strictEqual(evaluate({ remainingLandmarkCount: () => 3 }), 0.5);
    assert.strictEqual(evaluate({ myDistance: () => 5.75 }), 0.5);
    assert.strictEqual(evaluate({ myDistance: () => 5.75, remainingLandmarkCount: () => 3 }), 0.75);
    assert.strictEqual(evaluate({ myDistance: () => 7 }), 1);
    assert.strictEqual(evaluate({ difficulty: 'strong' }), 1);
    assert.strictEqual(evaluate({ selfRacePriority: false }), 1);
    assert.strictEqual(evaluate({ gameAvailable: false }), 1);
});

runTest('CPU evaluation の妨害倍率はplayer選択と既存fact短絡順を維持する', () => {
    const trace = [];
    const result = CPUEvaluation.expertDisruptionScale({
        gameAvailable: true,
        difficulty: 'expert',
        selfRacePriority() { trace.push('flag'); return true; },
        focusIndex: 3,
        currentPlayerIndex: 1,
        myDistance(index) { trace.push(['mine', index]); return 8; },
        bestOpponentDistance(index) { trace.push(['opponent', index]); return 7; },
        remainingLandmarkCount() { throw new Error('remaining must stay lazy'); },
    });
    assert.strictEqual(result, 1);
    assert.deepStrictEqual(trace, ['flag', ['mine', 3], ['opponent', 3]]);

    assert.strictEqual(CPUEvaluation.expertDisruptionScale({
        gameAvailable: false,
        difficulty: 'expert',
        selfRacePriority() { throw new Error('flag must stay lazy'); },
    }), 1);
});

runTest('CPU evaluation はlookahead終端scoreをpureに既存順で合成する', () => {
    const score = CPUEvaluation.lookaheadTerminalHeuristic({
        focusIndex: 1,
        playerCount: 3,
        focusDistance: 5,
        bestOpponentDistance: 7,
        raceFocus: true,
        remainingLandmarkCount: 2,
        reachableLandmarkCount: 1,
        threatBalance: true,
        threatForPlayer: index => index === 0 ? 10 : 20,
        distanceForPlayer: index => index === 0 ? 8 : 12,
    });
    assert.strictEqual(score, 9 + 17.6 + 6 - 7.2 - 0.6 - 2.4 - 1.2);
    assert.strictEqual(CPUEvaluation.lookaheadTerminalHeuristic({
        focusIndex: 0,
        playerCount: 1,
        focusDistance: 8,
        bestOpponentDistance: 6,
        raceFocus: false,
        threatBalance: false,
    }), -9);
});

runTest('CPU evaluation のlookahead終端scoreはflag別factと相手順をlazyに保つ', () => {
    const trace = [];
    const result = CPUEvaluation.lookaheadTerminalHeuristic({
        focusIndex: 1,
        playerCount: 3,
        focusDistance() { trace.push('focus-distance'); return 6; },
        bestOpponentDistance() { trace.push('best-distance'); return 6; },
        raceFocus() { trace.push('race-flag'); return false; },
        remainingLandmarkCount() { throw new Error('remaining must stay lazy'); },
        reachableLandmarkCount() { throw new Error('reachable must stay lazy'); },
        threatBalance() { trace.push('threat-flag'); return true; },
        threatForPlayer(index) { trace.push(['threat', index]); return 0; },
        distanceForPlayer(index) { trace.push(['distance', index]); return 14; },
    });
    assert.strictEqual(result, 0);
    assert.deepStrictEqual(trace, [
        'focus-distance', 'best-distance', 'race-flag', 'threat-flag',
        ['threat', 0], ['distance', 0], ['threat', 2], ['distance', 2],
    ]);
});

runTest('CPU evaluation はexpert choice scoreへlookaheadを既存上限で加算する', () => {
    assert.strictEqual(CPUEvaluation.expertChoiceScore({
        positionScore: 10,
        hasWinner: false,
        shouldUseLookahead: true,
        lookaheadScore: 8,
        lookaheadWeight: 0.4,
    }), 11.6);
    assert.strictEqual(CPUEvaluation.expertChoiceScore({
        positionScore: 10,
        hasWinner: false,
        shouldUseLookahead: true,
        lookaheadScore: 8,
        lookaheadWeight: 2,
    }), 12.8);
    assert.strictEqual(CPUEvaluation.expertChoiceScore({
        positionScore: 10,
        hasWinner: false,
        shouldUseLookahead: false,
        lookaheadScore: 8,
        lookaheadWeight: 2,
    }), 10);
});

runTest('CPU evaluation のexpert choice scoreは勝者確定時にlookahead factを読まない', () => {
    const trace = [];
    const score = CPUEvaluation.expertChoiceScore({
        positionScore() { trace.push('position'); return 4; },
        hasWinner() { trace.push('winner'); return true; },
        shouldUseLookahead() { throw new Error('gate must stay lazy'); },
        lookaheadScore() { throw new Error('lookahead must stay lazy'); },
        lookaheadWeight: 1,
    });
    assert.strictEqual(score, 4);
    assert.deepStrictEqual(trace, ['position', 'winner']);
});

runTest('CPU evaluationは多人数leaderとcleaning bonusを既存比率でpureに集計する', () => {
    const threats = [0, 8, 4, 2];
    assert.strictEqual(CPUEvaluation.crowdLeaderBonus({
        gameAvailable: true,
        playerCount: 4,
        currentPlayerIndex: 0,
        targetIndex: 2,
        weight: 12,
        playerExists: index => index >= 0 && index < 4,
        threatForPlayer: index => threats[index],
    }), 6);
    assert.strictEqual(CPUEvaluation.crowdCleaningBonus({
        gameAvailable: true,
        playerCount: 4,
        currentPlayerIndex: 0,
        weight: 3,
        threatForPlayer: index => threats[index],
        matchingActiveCardCount: index => [0, 2, 1, 0][index],
    }), 7.5);
});

runTest('CPU evaluationの多人数bonusは既存の二段走査と短絡順を維持する', () => {
    const trace = [];
    assert.strictEqual(CPUEvaluation.crowdLeaderBonus({
        gameAvailable: true,
        playerCount: 4,
        currentPlayerIndex: 0,
        targetIndex: 2,
        weight: 1,
        playerExists(index) { trace.push(['exists', index]); return true; },
        threatForPlayer(index) { trace.push(['threat', index]); return [0, 8, 4, 2][index]; },
    }), 0.5);
    assert.deepStrictEqual(trace, [
        ['threat', 1], ['threat', 2], ['threat', 3], ['exists', 2], ['threat', 2],
    ]);

    trace.length = 0;
    assert.strictEqual(CPUEvaluation.crowdCleaningBonus({
        gameAvailable: true,
        playerCount: 4,
        currentPlayerIndex: 0,
        weight: 1,
        threatForPlayer(index) { trace.push(['threat', index]); return [0, 8, 4, 2][index]; },
        matchingActiveCardCount(index) { trace.push(['matching', index]); return 1; },
    }), 1.75);
    assert.deepStrictEqual(trace, [
        ['threat', 1], ['threat', 2], ['threat', 3],
        ['threat', 1], ['matching', 1],
        ['threat', 2], ['matching', 2],
        ['threat', 3], ['matching', 3],
    ]);
});

runTest('CPU evaluationはstrong choice scoreの既存係数をpureに合成する', () => {
    const composed = CPUEvaluation.strongChoiceScore({
        purchasePlanValue: 12,
        turnValue: 8,
        coins: 10,
        builtLandmarkCount: 2,
        landmarkPressure: 6,
        winDistance: 4,
        redPressure: 5,
        duplicateRenovationPenalty: 3,
    });
    assert.ok(Math.abs(composed - 20) < 1e-9);
    assert.strictEqual(CPUEvaluation.strongChoiceScore({
        purchasePlanValue: 0,
        turnValue: 0,
        coins: 0,
        builtLandmarkCount: 0,
        landmarkPressure: 0,
        winDistance: 0,
        redPressure: 0,
        duplicateRenovationPenalty: 0,
    }), 0);
});

runTest('CPU evaluationは購入計画でカード・ランドマーク・0の最大値をpureに選ぶ', () => {
    assert.strictEqual(CPUEvaluation.purchasePlanValue({
        bestCardScore: 8,
        bestLandmark: { urgency: 2, cost: 10 },
        coins: 15,
    }), 8);
    assert.strictEqual(CPUEvaluation.purchasePlanValue({
        bestCardScore: 4,
        bestLandmark: { urgency: 3, cost: 10 },
        coins: 15,
    }), 7.6);
    assert.strictEqual(CPUEvaluation.purchasePlanValue({
        bestCardScore: -Infinity,
        bestLandmark: null,
        coins: 2,
    }), 0);
});

runTest('CPU evaluationは最強TV対象scoreの妨害係数をpureに合成する', () => {
    assert.strictEqual(CPUEvaluation.v2SimpleTvTargetScore({
        beforeShortfall: 0,
        coins: 10,
        steal: 5,
        builtLandmarkCount: 2,
        remainingLandmarkCosts: [10, 20],
    }), 32);
    assert.ok(Math.abs(CPUEvaluation.v2SimpleTvTargetScore({
        beforeShortfall: 2,
        coins: 8,
        steal: 2,
        builtLandmarkCount: 0,
        remainingLandmarkCosts: [10],
    }) - 10.4) < 1e-9);
    assert.ok(Math.abs(CPUEvaluation.v2SimpleTvTargetScore({
        beforeShortfall: 0,
        coins: 3,
        steal: 3,
        builtLandmarkCount: 1,
        remainingLandmarkCosts: [],
    }) - 9.1) < 1e-9);
});

runTest('CPU evaluationの購入計画はランドマーク不足coinを負値にしない', () => {
    assert.strictEqual(CPUEvaluation.purchasePlanValue({
        bestCardScore: 0,
        bestLandmark: { urgency: 2, cost: 10 },
        coins: 3,
    }), 4.8);
});

runTest('CPU evaluationはランドマーク直前の貯金判断をpureに選ぶ', () => {
    const names = ['駅', '港', '空港'];
    const enabled = new Set(names);
    const built = new Set(['駅']);
    const costs = { 駅: 4, 港: 10, 空港: 30 };
    const urgencies = { 駅: 9, 港: 7, 空港: 8 };

    assert.strictEqual(CPUEvaluation.shouldHoldForLandmark(names, {
        isEnabled: name => enabled.has(name),
        isBuilt: name => built.has(name),
        costOf: name => costs[name],
        urgencyOf: name => urgencies[name],
        coins: 8,
        bestCardScore: 4,
        maxShortfall: 4,
    }), true);
    assert.strictEqual(CPUEvaluation.shouldHoldForLandmark(names, {
        isEnabled: name => enabled.has(name),
        isBuilt: name => built.has(name),
        costOf: name => costs[name],
        urgencyOf: name => urgencies[name],
        coins: 8,
        bestCardScore: 7,
        maxShortfall: 4,
    }), false);
});

runTest('CPU evaluationの貯金判断は不適格候補のurgencyを読まない', () => {
    const reads = [];
    const result = CPUEvaluation.shouldHoldForLandmark(['建設済み', '遠い', '対象'], {
        isEnabled: name => { reads.push(`enabled:${name}`); return true; },
        isBuilt: name => { reads.push(`built:${name}`); return name === '建設済み'; },
        costOf: name => { reads.push(`cost:${name}`); return name === '遠い' ? 20 : 10; },
        urgencyOf: name => { reads.push(`urgency:${name}`); return 8; },
        coins: 8,
        bestCardScore: 1,
        maxShortfall: 4,
    });

    assert.strictEqual(result, true);
    assert.deepStrictEqual(reads, [
        'enabled:建設済み', 'built:建設済み',
        'enabled:遠い', 'built:遠い', 'cost:遠い',
        'enabled:対象', 'built:対象', 'cost:対象', 'urgency:対象',
    ]);
});
