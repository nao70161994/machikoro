'use strict';

const assert = require('assert');
const benchmark = require('../scripts/benchmark-local-engine-shadow');
const { loadRuntime } = require('../scripts/selfplay');
const { runTest } = require('./helpers/test-utils');

runTest('local engine shadow benchmarkは引数範囲を検証する', () => {
    assert.deepStrictEqual(benchmark.parseArgs(['--samples', '24', '--json']), {
        samples: 24,
        json: true,
    });
    assert.throws(() => benchmark.parseArgs(['--samples', '2']), /between 10 and 10000/);
    assert.throws(() => benchmark.parseArgs(['--unexpected']), /unknown argument/);
});

runTest('local engine shadow benchmarkはself-play状態を捕捉しログ複製量を比較する', () => {
    const runtime = loadRuntime({ includeRL: false });
    const scenario = benchmark.captureGameplayState(runtime, 2, 4, 7);
    assert.strictEqual(scenario.game.phase, runtime.GAME_PHASES.BUILD);
    assert.strictEqual(scenario.game.checkWinner(), null);
    const production = benchmark.measure(runtime, scenario, 0, 10);
    const unbounded = benchmark.measure(runtime, scenario, Number.MAX_SAFE_INTEGER, 10);
    assert.strictEqual(production.sourceLogEntries, scenario.game.log.length);
    assert.strictEqual(production.sourceSnapshotLogEntries, 0);
    assert.strictEqual(unbounded.sourceSnapshotLogEntries, scenario.game.log.length);
    assert.strictEqual(production.resultLogEntries, unbounded.resultLogEntries);
    assert.ok(production.sourceSnapshotBytes <= unbounded.sourceSnapshotBytes);
    assert.ok(production.meanMs >= 0);
    assert.ok(Number.isInteger(production.maxPostTransitionHeapDeltaBytes));

    const currentPlayer = scenario.game.currentPlayer();
    const itStartup = runtime.createCardByName('ITベンチャー');
    currentPlayer.addCard(itStartup);
    assert.strictEqual(
        benchmark.productionNextTurnLogLimit(runtime, scenario.game),
        Number.MAX_SAFE_INTEGER
    );
    currentPlayer.makeDormant(itStartup);
    assert.strictEqual(benchmark.productionNextTurnLogLimit(runtime, scenario.game), 0);
});
