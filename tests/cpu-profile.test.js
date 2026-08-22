const assert = require('assert');
const { CPUProfile } = require('../js/cpuProfile');
const { simulateGame } = require('../scripts/selfplay');

assert.strictEqual(CPUProfile.finiteOption({ value: 0.25 }, 'value', 9), 0.25);
assert.strictEqual(CPUProfile.finiteOption({ value: Infinity }, 'value', 9), 9);
assert.strictEqual(CPUProfile.largeCrowdMode(7, 'normal'), 'native');
assert.strictEqual(CPUProfile.largeCrowdMode(8, 'normal'), 'normal');
assert.strictEqual(CPUProfile.expertUsesStrongCrowdPolicy(3), false);
assert.strictEqual(CPUProfile.expertUsesStrongCrowdPolicy(4), true);
assert.strictEqual(CPUProfile.expertUsesStrongCrowdPolicy(5), true);
assert.strictEqual(CPUProfile.expertUsesStrongCrowdPolicy(6), false);
assert.strictEqual(CPUProfile.strongUsesNormalTrioPolicy(2), false);
assert.strictEqual(CPUProfile.strongUsesNormalTrioPolicy(3), true);
assert.strictEqual(CPUProfile.strongUsesNormalTrioPolicy(4), false);
assert.strictEqual(CPUProfile.expertProfileName(2), 'duel');
assert.strictEqual(CPUProfile.expertProfileName(3), 'trio');
assert.strictEqual(CPUProfile.expertProfileName(4), 'crowd');
assert.strictEqual(CPUProfile.expertProfileName(8), 'largeCrowd');
assert.strictEqual(CPUProfile.expertProfileName(null), 'crowd');
assert.strictEqual(CPUProfile.playerCountProfileName(7), 'crowd');
assert.strictEqual(CPUProfile.playerCountProfileName(8), 'largeCrowd');
assert.deepStrictEqual(CPUProfile.playerCountProfile(4), {
    landmarkBias: 1.12,
    blueFactor: 1.28,
    redFactor: 0.92,
    greenFactor: 1.18,
    purpleFactor: 0.82,
    massAttackFactor: 0.95,
    airportBias: 0.9,
});
assert.deepStrictEqual(CPUProfile.playerCountProfile(10, {
    largeCrowd: { redFactor: 1.25, airportBias: 1.1 },
}), {
    landmarkBias: 1.12,
    blueFactor: 1.28,
    redFactor: 1.25,
    greenFactor: 1.18,
    purpleFactor: 0.82,
    massAttackFactor: 0.95,
    airportBias: 1.1,
});

const traceEntries = [];
const result = simulateGame({
    difficulties: ['expert', 'strong'],
    seed: 17,
    maxSteps: 1500,
    expertPurpose: 'live',
    expertPreset: 'v2simple',
    lite: true,
    traceEntries,
});
assert.deepStrictEqual({
    winner: result.winner,
    turns: result.turns,
    exhausted: result.exhausted,
    actions: traceEntries.slice(0, 12).map(entry => entry.chosenAction && entry.chosenAction.label),
}, {
    winner: 0,
    turns: 42,
    exhausted: false,
    actions: ['ROLL1', 'BUY_LM:駅', 'ROLL1', 'BUY_CARD:貸金業', 'ROLL1', 'ROLL1',
        'BUY_CARD:パン屋', 'ROLL1', 'BUY_LM:駅', 'ROLL1', 'ROLL1', 'BUY_CARD:雑貨屋'],
});

console.log('cpu profile tests passed');
