const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CPUSimulation } = require('../js/cpuSimulation');
const { CPULegalMoves } = require('../js/cpuLegalMoves');
const { CPULookaheadRuntime } = require('../js/cpuLookaheadRuntime');
const { runTest } = require('./helpers/test-utils');

global.CPUSimulation = CPUSimulation;
global.CPULegalMoves = CPULegalMoves;

runTest('CPU lookahead runtime はseed・CPU生成・step・profile順を維持する', () => {
    const players = [{ id: 0 }, { id: 1 }];
    let steps = 0;
    const game = {
        players,
        currentPlayerIndex: 0,
        turnCount: 3,
        currentPlayer: () => ({ coins: 4 }),
        checkWinner: () => steps >= 1 ? players[1] : null,
    };
    const calls = [];
    const lookaheadCpus = [{ id: 'cpu0' }, { id: 'cpu1' }];
    const rng = () => 0.25;
    const owner = {
        expertTuning: { winLookaheadBonus: 80, loseLookaheadPenalty: 90 },
        _profileMeasure(label, evaluate) { calls.push(['measure', label]); return evaluate(); },
        _createLookaheadCpu(actualGame, focusIndex, index) {
            calls.push(['create', actualGame, focusIndex, index]);
            return lookaheadCpus[index];
        },
        _createPlayoutRng(seed) { calls.push(['seed', seed]); return rng; },
        _runSimulationStep(actualGame, cpu, stock, actualRng) {
            calls.push(['step', actualGame, cpu, stock, actualRng]);
            steps++;
        },
        _profileCount(label, amount) { calls.push(['count', label, amount]); },
        _lookaheadTerminalHeuristic: () => { throw new Error('winner path must not use terminal heuristic'); },
    };
    const stock = { marker: true };

    assert.strictEqual(CPULookaheadRuntime._simulateLookahead(owner, game, stock, 1, 5), 80);
    assert.deepStrictEqual(calls, [
        ['measure', 'expert.simulateLookahead'],
        ['create', game, 1, 0],
        ['create', game, 1, 1],
        ['seed', 157],
        ['step', game, lookaheadCpus[0], stock, rng],
        ['count', 'expert.lookaheadSteps', 1],
    ]);
});

runTest('CPU lookahead runtime はCPU constructorをadapterとして難易度順を保持する', () => {
    const created = [];
    const createCpu = difficulty => { created.push(difficulty); return { difficulty }; };
    const game = { players: [{}, {}, {}, {}] };
    const owner = {
        difficulty: 'expert',
        _expertFlagEnabled: name => name === 'crowdNormalLookaheadOpponents',
    };

    assert.deepStrictEqual(CPULookaheadRuntime._createLookaheadCpu(owner, game, 1, 1, createCpu), { difficulty: 'strong' });
    assert.deepStrictEqual(CPULookaheadRuntime._createLookaheadCpu(owner, game, 1, 2, createCpu), { difficulty: 'normal' });
    assert.deepStrictEqual(created, ['strong', 'normal']);
});

runTest('CPU.jsのlookahead APIはruntime境界へ委譲する', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/CPU.js'), 'utf8');
    assert.ok(source.includes('_simulateLookahead(game, shopStock, focusIndex, maxSteps) {\n        return CPULookaheadRuntime._simulateLookahead(this, game, shopStock, focusIndex, maxSteps);\n    }'));
    assert.ok(source.includes("_createLookaheadCpu(game, focusIndex, playerIndex) {\n        return CPULookaheadRuntime._createLookaheadCpu(this, game, focusIndex, playerIndex, difficulty => new CPU(difficulty));\n    }"));
    assert.ok(source.includes('_lookaheadStrongOpponentSet(game, focusIndex) {\n        return CPULookaheadRuntime._lookaheadStrongOpponentSet(this, game, focusIndex);\n    }'));
});
