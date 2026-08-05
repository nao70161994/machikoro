const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CPUPendingDecision } = require('../js/cpuPendingDecision');
const { runTest } = require('./helpers/test-utils');

function profileCpu(overrides = {}) {
    const calls = [];
    return {
        calls,
        difficulty: 'normal',
        _profileDecision(label, decide) {
            calls.push(['profile', label]);
            return decide();
        },
        _isExpertV2Simple: () => false,
        _syncExpertTuningForGame: () => calls.push('sync'),
        ...overrides,
    };
}

runTest('CPU pending decision はTV通常評価の候補順とfirst-win tieを維持する', () => {
    const current = {};
    const opponent = coins => ({ coins, builtLandmarkCount: () => 1 });
    const game = {
        currentPlayerIndex: 0,
        players: [current, opponent(5), opponent(5)],
        currentPlayer: () => current,
    };
    const cpu = profileCpu({
        _strongCrowdAttackScale: () => 1,
        _strongCrowdDisruptionReady: () => false,
        _coinsTowardsNextLandmark: () => 0,
    });

    assert.strictEqual(CPUPendingDecision.chooseTVTarget(cpu, game), 1);
    assert.deepStrictEqual(cpu.calls, [['profile', 'chooseTVTarget'], 'sync']);
});

runTest('CPU pending decision は取引候補なしを評価副作用なしで返す', () => {
    const cpu = profileCpu();
    const game = {
        currentPlayerIndex: 0,
        currentPlayer: () => ({ getMinorCards: () => [] }),
    };
    assert.strictEqual(CPUPendingDecision.chooseBusinessMove(cpu, game), null);
    assert.deepStrictEqual(cpu.calls, [['profile', 'chooseBusinessMove']]);
});

runTest('CPU pending decision はexpert-v2-simpleの清掃・引越候補順を保持する', () => {
    const first = { name: 'first' };
    const second = { name: 'second' };
    const current = {
        cards: [first, second],
        getMinorCards: () => [first, second],
        isDormant: () => false,
    };
    const opponentA = { getMinorCards: () => [{ name: 'opponent' }], isDormant: () => false };
    const opponentB = { getMinorCards: () => [], isDormant: () => false };
    const choices = [];
    const cpu = profileCpu({
        expertCleaningMode: 'random',
        expertMoverMode: 'random',
        _isExpertV2Simple: () => true,
        _randomChoice(items) {
            choices.push(items.slice());
            return items[items.length - 1];
        },
    });
    const game = { currentPlayerIndex: 0, players: [current, opponentA, opponentB], currentPlayer: () => current };

    assert.strictEqual(CPUPendingDecision.chooseCleaningTarget(cpu, game), 'opponent');
    assert.deepStrictEqual(CPUPendingDecision.chooseMoverMove(cpu, game), { cardIndex: 1, targetIndex: 2 });
    assert.deepStrictEqual(choices[0], ['first', 'second', 'opponent']);
    assert.deepStrictEqual(choices[1], [
        { cardIndex: 0, targetIndex: 1 },
        { cardIndex: 0, targetIndex: 2 },
        { cardIndex: 1, targetIndex: 1 },
        { cardIndex: 1, targetIndex: 2 },
    ]);
});

runTest('CPU pending decision はexpert-v2-simpleのIT traceと判断を維持する', () => {
    const trace = [];
    const cpu = profileCpu({
        _isExpertV2Simple: () => true,
        _traceV2Simple: key => trace.push(key),
        _chooseExpertV2SimpleITInvest: () => true,
    });
    assert.strictEqual(CPUPendingDecision.chooseITInvest(cpu, { currentPlayer: () => ({}) }), true);
    assert.deepStrictEqual(trace, ['itDecisions', 'itTrue']);
});

runTest('CPU.jsのpending判断public APIは専用境界へ委譲する', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/CPU.js'), 'utf8');
    for (const name of [
        'chooseTVTarget',
        'chooseBusinessMove',
        'chooseCleaningTarget',
        'chooseMoverMove',
        'chooseRenovationTarget',
        'chooseITInvest',
    ]) {
        assert.match(source, new RegExp(`${name}\\(game\\) \\{\\s*return CPUPendingDecision\\.${name}\\(this, game\\);\\s*\\}`));
    }
});
