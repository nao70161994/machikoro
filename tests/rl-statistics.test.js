'use strict';

const assert = require('assert');
const {
    buildPowerAnalysis,
    groupMatchLogBySeed,
    inverseStandardNormal,
    pairedBlockBootstrap,
    requiredDecisiveGames
} = require('../scripts/rl-statistics');

function entry(seed, winnerDifficulty) {
    return { seed, winnerDifficulty };
}

const grouped = groupMatchLogBySeed([
    entry(12, 'candidate'),
    entry(11, 'baseline'),
    entry(12, 'baseline'),
    { winnerDifficulty: 'candidate' }
]);
assert.deepStrictEqual(grouped.map(block => block.seed), [11, 12]);
assert.strictEqual(grouped[1].entries.length, 2);

assert.ok(Math.abs(inverseStandardNormal(0.975) - 1.959963984540054) < 0.00001);
assert.strictEqual(requiredDecisiveGames(0), null);
assert.ok(requiredDecisiveGames(0.05) > requiredDecisiveGames(0.1));

const matchLog = [];
for (let seed = 1; seed <= 12; seed += 1) {
    matchLog.push(entry(seed, 'candidate'));
    matchLog.push(entry(seed, seed <= 9 ? 'candidate' : 'baseline'));
}
const bootstrap = pairedBlockBootstrap(matchLog, 'candidate', 'baseline', {
    iterations: 1000,
    seed: 41
});
assert.strictEqual(bootstrap.valid, true);
assert.strictEqual(bootstrap.blockCount, 12);
assert.strictEqual(bootstrap.games, 24);
assert.strictEqual(bootstrap.observed.candidateWins, 21);
assert.strictEqual(bootstrap.observed.baselineWins, 3);
assert.ok(bootstrap.confidenceInterval.lower > 0.5);
assert.strictEqual(bootstrap.statisticallyAboveHalf, true);
assert.deepStrictEqual(
    pairedBlockBootstrap(matchLog, 'candidate', 'baseline', { iterations: 1000, seed: 41 }),
    bootstrap,
    'bootstrap output must be deterministic for a fixed seed'
);

const insufficient = pairedBlockBootstrap([entry(1, 'candidate')], 'candidate', 'baseline');
assert.strictEqual(insufficient.valid, false);
assert.strictEqual(insufficient.confidenceInterval, null);

const power = buildPowerAnalysis(58, 42);
assert.strictEqual(power.decisiveGames, 100);
assert.ok(Math.abs(power.observedDelta - 0.08) < Number.EPSILON);
assert.ok(power.requiredDecisiveGames > 100);

console.log('RL paired block bootstrap and power analysis tests passed.');
