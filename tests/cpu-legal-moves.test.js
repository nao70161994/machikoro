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
