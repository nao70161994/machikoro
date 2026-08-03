const assert = require('assert');
const { CPULegalMoves } = require('../js/cpuLegalMoves');
const { loadCPURuntime } = require('./helpers/runtime-loaders');
const { makeCpuDecisionFixtures } = require('./helpers/cpu-decision-fixtures');
const { runTest } = require('./helpers/test-utils');

runTest('CPU legal movesはlandmark有効化・建設済み・価格を既存順で絞る', () => {
    const player = {
        coins: 8,
        landmarks: { station: false, mall: true, airport: false },
    };
    const names = ['station', 'mall', 'airport'];
    const costs = { station: 4, mall: 10, airport: 30 };
    assert.deepStrictEqual(
        CPULegalMoves.affordableLandmarkNames(
            player,
            new Set(['station', 'mall']),
            names,
            name => costs[name]
        ),
        ['station']
    );
    assert.deepStrictEqual(
        CPULegalMoves.affordableLandmarkNames(player, null, names, name => costs[name], false),
        []
    );
});

runTest('CPU legal movesは在庫・価格・紫重複を既存順で絞る', () => {
    const cards = [
        { name: 'cheap', cost: 2, color: 'blue' },
        { name: 'empty', cost: 1, color: 'green' },
        { name: 'expensive', cost: 9, color: 'red' },
        { name: 'unique', cost: 4, color: 'purple' },
    ];
    const player = {
        coins: 5,
        countCardIncludingDormant(name) {
            return name === 'unique' ? 1 : 0;
        },
    };
    assert.deepStrictEqual(
        CPULegalMoves.affordableCards(player, { cheap: 2, empty: 0, expensive: 3, unique: 1 }, cards),
        [cards[0]]
    );
});

runTest('CPU legal move wrapperは代表fixtureでpure helperと完全一致する', () => {
    const runtime = loadCPURuntime();
    const fixtures = makeCpuDecisionFixtures(runtime).filter(fixture => fixture.decision === 'build');
    fixtures.forEach(fixture => {
        const current = fixture.game.currentPlayer();
        const cpu = new runtime.CPU('expert', { expertPreset: 'v2simple', simulationMode: 'lite' });
        const landmarkNames = Array.from(CPULegalMoves.affordableLandmarkNames(
            current,
            fixture.game.enabledLandmarks,
            runtime.Player.landmarkNames(),
            runtime.Player.landmarkCost,
            true
        ));
        const cardNames = Array.from(
            CPULegalMoves.affordableCards(current, fixture.shopStock, runtime.CARDS),
            card => card.name
        );
        assert.deepStrictEqual(
            Array.from(cpu._listExpertV2SimpleAffordableLandmarks(current, fixture.game), option => option.name),
            landmarkNames
        );
        assert.deepStrictEqual(
            Array.from(cpu._listExpertV2SimpleAffordableCards(current, fixture.shopStock), option => option.card.name),
            cardNames
        );
    });
});

runTest('CPU legal movesは妨害対象を脅威・コイン順で並べ4人以上のpruningを固定する', () => {
    const players = [
        { name: 'self', coins: 3, threat: 99 },
        { name: 'low', coins: 8, threat: 2 },
        { name: 'rich-tie', coins: 12, threat: 5 },
        { name: 'poor-tie', coins: 4, threat: 5 },
    ];
    assert.deepStrictEqual(
        CPULegalMoves.disruptionTargetIndexes(players, 0, player => player.threat, false),
        [2, 3, 1]
    );
    assert.deepStrictEqual(
        CPULegalMoves.disruptionTargetIndexes(players, 0, player => player.threat, true),
        [2, 3]
    );
    assert.deepStrictEqual(CPULegalMoves.disruptionTargetIndexes(null, 0, () => 0, true), []);
});

runTest('CPU legal movesは清掃候補の初出順と評価上位3件を固定する', () => {
    const players = [
        { cards: [{ name: 'B', value: 2 }, { name: 'A', value: 1 }] },
        { cards: [{ name: 'C', value: 5 }, { name: 'A', value: 4 }, { name: 'D', value: 5 }] },
    ];
    const activeCards = player => player.cards;
    const cardValue = card => card.value;
    assert.deepStrictEqual(
        CPULegalMoves.disruptionCleaningNames(players, activeCards, cardValue, false),
        ['B', 'A', 'C', 'D']
    );
    assert.deepStrictEqual(
        CPULegalMoves.disruptionCleaningNames(players, activeCards, cardValue, true),
        ['A', 'C', 'D']
    );
    assert.deepStrictEqual(CPULegalMoves.disruptionCleaningNames(null, activeCards, cardValue, true), []);
});

runTest('CPU disruption candidate wrapperはpure helperと同じ順序を返す', () => {
    const runtime = loadCPURuntime();
    const cards = [
        { name: 'B', value: 2 },
        { name: 'A', value: 1 },
        { name: 'C', value: 5 },
        { name: 'D', value: 5 },
    ];
    const players = [
        { coins: 3, threat: 99, cards: [cards[0], cards[1]], getMinorCards() { return this.cards; }, isDormant() { return false; } },
        { coins: 8, threat: 2, cards: [cards[2]], getMinorCards() { return this.cards; }, isDormant() { return false; } },
        { coins: 12, threat: 5, cards: [cards[1]], getMinorCards() { return this.cards; }, isDormant() { return false; } },
        { coins: 4, threat: 5, cards: [cards[3]], getMinorCards() { return this.cards; }, isDormant() { return false; } },
    ];
    const game = { players };
    const cpu = new runtime.CPU('expert');
    cpu._expertFlagEnabled = name => name === 'disruptionCandidatePruning';
    cpu._estimateOpponentThreat = player => player.threat;
    cpu._ownedCardValue = card => card.value;
    assert.deepStrictEqual(Array.from(cpu._expertCandidateTargetIndexes(game, 0)), [2, 3]);
    assert.deepStrictEqual(Array.from(cpu._expertCandidateCleaningNames(game)), ['C', 'D', 'A']);
});
