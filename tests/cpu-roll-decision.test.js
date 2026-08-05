const assert = require('assert');
const { CPURollDecision } = require('../js/cpuRollDecision');
const { runTest } = require('./helpers/test-utils');

function createNormalCpu(calls) {
    return {
        difficulty: 'normal',
        _profileDecision(label, decide) {
            calls.push(['profile', label]);
            return decide();
        },
        _isExpertV2Simple: () => false,
        _syncExpertTuningForGame: () => calls.push('sync'),
        _expectedDiceScore(game, useTwo) {
            calls.push(['expected', useTwo]);
            return useTwo ? 5.9 : 5;
        },
        _estimateRollScore(game, dice) {
            calls.push(['roll', dice]);
            return dice;
        },
    };
}

runTest('CPU roll decision はnormalの閾値と評価順を維持する', () => {
    const calls = [];
    const cpu = createNormalCpu(calls);
    const game = { lastDiceResult: 4, lastDice2: 0 };

    assert.strictEqual(CPURollDecision.chooseDiceCount(cpu, game), true);
    assert.deepStrictEqual(calls, [
        ['profile', 'chooseDiceCount'],
        'sync',
        ['expected', false],
        ['expected', true],
    ]);

    calls.length = 0;
    assert.strictEqual(CPURollDecision.chooseReroll(cpu, game), false);
    assert.deepStrictEqual(calls, [
        ['profile', 'chooseReroll'],
        'sync',
        ['roll', 4],
        ['expected', false],
    ]);

    calls.length = 0;
    assert.strictEqual(CPURollDecision.chooseHarbor(cpu, game), true);
    assert.deepStrictEqual(calls, [
        ['profile', 'chooseHarbor'],
        'sync',
        ['roll', 4],
        ['roll', 6],
    ]);
});

runTest('CPU roll decision はweak各判断で乱数をちょうど1回ずつ消費する', () => {
    const calls = [];
    const cpu = createNormalCpu(calls);
    cpu.difficulty = 'weak';
    const randomValues = [0.2, 0.8, 0.4];
    const originalRandom = Math.random;
    let randomCalls = 0;
    Math.random = () => randomValues[randomCalls++];
    try {
        assert.strictEqual(CPURollDecision.chooseDiceCount(cpu, {}), true);
        assert.strictEqual(CPURollDecision.chooseReroll(cpu, { lastDiceResult: 7, lastDice2: 0 }), false);
        assert.strictEqual(CPURollDecision.chooseHarbor(cpu, {}), true);
    } finally {
        Math.random = originalRandom;
    }
    assert.strictEqual(randomCalls, 3);
    assert.deepStrictEqual(calls, [
        ['profile', 'chooseDiceCount'], 'sync',
        ['profile', 'chooseReroll'], 'sync',
        ['profile', 'chooseHarbor'], 'sync',
    ]);
});

runTest('CPU.jsのroll判断public APIは専用境界へ委譲する', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/CPU.js'), 'utf8');
    for (const name of ['chooseDiceCount', 'chooseReroll', 'chooseHarbor']) {
        assert.match(source, new RegExp(`${name}\\(game\\) \\{\\s*return CPURollDecision\\.${name}\\(this, game\\);\\s*\\}`));
    }
});
