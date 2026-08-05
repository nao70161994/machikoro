const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CPUBuildScoring } = require('../js/cpuBuildScoring');
const { runTest } = require('./helpers/test-utils');

global.LANDMARK_NAMES = Object.freeze({ STATION: 'station', AIRPORT: 'airport', RADIO_TOWER: 'radio' });
global.Player = { landmarkCost: () => 0 };
global.GAME_PHASES = Object.freeze({ BUILD: 'build' });

runTest('CPU build scoring はexpert-v2-simple breakdownの評価順と算術を維持する', () => {
    const calls = [];
    const originalPlayer = { landmarks: {} };
    const clonePlayer = { coins: 10, landmarks: {}, cards: [] };
    const game = { currentPlayer: () => originalPlayer };
    const clone = { currentPlayer: () => clonePlayer };
    const card = { name: 'test', cost: 2 };
    const cpu = {
        _cloneGame: value => { calls.push(['clone', value]); return clone; },
        _cardByName: name => { calls.push(['card', name]); return card; },
        _expectedDiceScoreWithHarbor(value, useTwo) {
            calls.push(['dice', value === clone ? 'clone' : 'game', useTwo]);
            return value === clone ? 5 : 3;
        },
        _expertV2SimpleComboUnlockBonus: () => { calls.push('combo'); return 1; },
        _expertV2SimpleBuildTempoBonus: () => { calls.push('tempo'); return 2; },
        _expertV2SimpleRedOpponentTurnBonus: () => { calls.push('red'); return 3; },
        _expertV2SimpleLateBasicDuplicatePenalty: () => { calls.push('duplicate'); return 4; },
        _expertV2SimpleRenovationRiskPenalty: () => { calls.push('renovation'); return 5; },
    };

    assert.deepStrictEqual(
        CPUBuildScoring._scoreExpertV2SimpleBuildOptionBreakdown(cpu, game, { type: 'card', card }, {}),
        {
            baseEv: 5,
            deltaEv: 2,
            comboUnlockBonus: 1,
            tempoBonus: 2,
            redOpponentTurnBonus: 3,
            lateBasicDuplicatePenalty: 4,
            renovationRiskPenalty: 5,
            total: 2,
        }
    );
    assert.strictEqual(clonePlayer.coins, 8);
    assert.deepStrictEqual(clonePlayer.cards, [card]);
    assert.deepStrictEqual(calls, [
        ['clone', game], ['card', 'test'], ['dice', 'clone', false], ['dice', 'game', false],
        'combo', 'tempo', 'red', 'duplicate', 'renovation',
    ]);
});

runTest('CPU build scoring は不正なexpert/strong buildを-Infinityで拒否する', () => {
    const clone = {
        phase: 'roll',
        players: [{}],
        currentPlayer: () => ({}),
        buildLandmark: () => false,
    };
    const cpu = {
        expertTuning: {},
        _profileMeasure: (label, score) => score(),
        _estimateWinDistance: () => 0,
        _listExpertBuildOptions: () => [],
        _cloneGame: () => clone,
    };
    const game = { currentPlayerIndex: 0, players: [{}] };
    const action = { type: 'landmark', name: 'invalid' };

    assert.strictEqual(CPUBuildScoring._scoreExpertBuildOption(cpu, game, {}, action), -Infinity);
    assert.strictEqual(CPUBuildScoring._scoreStrongBuildOption(cpu, game, {}, action), -Infinity);
    assert.strictEqual(clone.phase, 'build');
});

runTest('CPU.jsのbuild scoring APIは専用境界へ委譲する', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/CPU.js'), 'utf8');
    const contracts = [
        ['_scoreExpertV2SimpleBuildOptionBreakdown', 'game, option, shopStock = null', 'game, option, shopStock'],
        ['_scoreExpertBuildOption', 'game, shopStock, action, context = null', 'game, shopStock, action, context'],
        ['_scoreExpertEndgameBuildFocus', 'game, clone, playerIndex, action, beforeDistance = null', 'game, clone, playerIndex, action, beforeDistance'],
        ['_scoreStrongBuildOption', 'game, shopStock, action', 'game, shopStock, action'],
    ];
    for (const [name, signature, call] of contracts) {
        assert.ok(source.includes(`${name}(${signature}) {\n        return CPUBuildScoring.${name}(this, ${call});\n    }`));
    }
});
