const assert = require('assert');
const { CPUSimulation } = require('../js/cpuSimulation');
const { runTest } = require('./helpers/test-utils');
const { loadCPURuntime } = require('./helpers/runtime-loaders');

runTest('CPU simulation RNG は同じseedから同じ列を生成する', () => {
    const first = CPUSimulation.createPlayoutRng(42);
    const second = CPUSimulation.createPlayoutRng(42);
    const firstValues = Array.from({ length: 8 }, () => first());
    const secondValues = Array.from({ length: 8 }, () => second());

    assert.deepStrictEqual(firstValues, secondValues);
    assert.ok(firstValues.every(value => value >= 0 && value < 1));
});

runTest('CPU simulation RNG はseed 0を既存どおりseed 1へ正規化する', () => {
    const zeroSeed = CPUSimulation.createPlayoutRng(0);
    const oneSeed = CPUSimulation.createPlayoutRng(1);

    assert.deepStrictEqual(
        Array.from({ length: 4 }, () => zeroSeed()),
        Array.from({ length: 4 }, () => oneSeed())
    );
});

runTest('CPU本体のplayout RNG wrapperはpure simulationへ同値委譲する', () => {
    const { CPU } = loadCPURuntime();
    const cpuRng = new CPU('expert')._createPlayoutRng(123);
    const pureRng = CPUSimulation.createPlayoutRng(123);

    assert.deepStrictEqual(
        Array.from({ length: 8 }, () => cpuRng()),
        Array.from({ length: 8 }, () => pureRng())
    );
});

runTest('CPU simulation playoutはwinnerまで既存順でstepを実行する', () => {
    let steps = 0;
    let winnerChecks = 0;
    const game = {
        checkWinner() {
            winnerChecks++;
            return steps >= 3 ? { name: 'winner' } : null;
        },
    };
    const safety = CPUSimulation.runPlayout(game, 10, () => {
        steps++;
    });

    assert.strictEqual(safety, 3);
    assert.strictEqual(steps, 3);
    assert.strictEqual(winnerChecks, 4);
});

runTest('CPU simulation playoutはmaxStepsで停止して追加stepを実行しない', () => {
    let steps = 0;
    const game = { checkWinner: () => null };
    const safety = CPUSimulation.runPlayout(game, 2, () => {
        steps++;
    });

    assert.strictEqual(safety, 2);
    assert.strictEqual(steps, 2);
});

runTest('CPU simulation stepはdice消費順とroll payloadを維持する', () => {
    const phases = {
        ROLL: 'roll',
        SELECT_DICE: 'selectDice',
        REROLL_CONFIRM: 'reroll',
        HARBOR_CHOICE: 'harbor',
        PENDING: 'pending',
        BUILD: 'build',
    };
    const values = [0, 0.2, 0.4];
    const calls = [];
    const game = {
        phase: phases.ROLL,
        rollDice(dice, tunaDice) {
            calls.push({ dice, tunaDice });
        },
    };
    CPUSimulation.runStep(game, {}, {}, () => values.shift(), phases, {});

    assert.deepStrictEqual(calls, [{ dice: 3, tunaDice: [1, 2] }]);
    assert.deepStrictEqual(values, []);
});

runTest('CPU simulation stepはbuild後のpendingITとnextTurn順を維持する', () => {
    const phases = {
        ROLL: 'roll',
        SELECT_DICE: 'selectDice',
        REROLL_CONFIRM: 'reroll',
        HARBOR_CHOICE: 'harbor',
        PENDING: 'pending',
        BUILD: 'build',
    };
    const calls = [];
    const game = {
        phase: phases.BUILD,
        pendingIT: false,
        nextTurn() {
            calls.push('nextTurn');
        },
    };
    const cpu = {
        build(receivedGame, receivedStock) {
            assert.strictEqual(receivedGame, game);
            assert.deepStrictEqual(receivedStock, { wheat: 2 });
            calls.push('build');
        },
    };
    CPUSimulation.runStep(game, cpu, { wheat: 2 }, () => 0, phases, {});

    assert.deepStrictEqual(calls, ['build', 'nextTurn']);
});
