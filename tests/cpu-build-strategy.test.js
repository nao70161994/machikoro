const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CPUBuildStrategy } = require('../js/cpuBuildStrategy');
const { runTest } = require('./helpers/test-utils');

global.GAME_PHASES = Object.freeze({ BUILD: 'build' });

runTest('CPU build strategy はdifficulty別delegateをselection scope内で実行する', () => {
    for (const difficulty of ['weak', 'normal', 'strong', 'expert']) {
        const calls = [];
        const expected = { action: 'buildCard', data: { cardName: difficulty } };
        const cpu = {
            difficulty,
            _selectedBuildAction: { stale: true },
            _collectingBuildAction: false,
            _syncExpertTuningForGame: game => calls.push(['sync', game]),
        };
        for (const name of ['buildWeak', 'buildNormal', 'buildStrong', 'buildExpert']) {
            cpu[name] = (game, stock) => {
                calls.push([name, game, stock, cpu._collectingBuildAction]);
                cpu._selectedBuildAction = expected;
            };
        }
        const game = { phase: 'build', builtThisTurn: false };
        const stock = { marker: difficulty };

        assert.strictEqual(CPUBuildStrategy.chooseBuildAction(cpu, game, stock), expected);
        assert.deepStrictEqual(calls, [
            ['sync', game],
            [`build${difficulty[0].toUpperCase()}${difficulty.slice(1)}`, game, stock, true],
        ]);
        assert.strictEqual(cpu._collectingBuildAction, false);
    }
});

runTest('CPU build strategy はinvalid stateをdispatchせず選択をclearする', () => {
    const cpu = {
        difficulty: 'normal',
        _selectedBuildAction: { stale: true },
        _collectingBuildAction: false,
        _syncExpertTuningForGame: () => { throw new Error('must not run'); },
    };
    assert.strictEqual(CPUBuildStrategy.chooseBuildAction(cpu, null, {}), null);
    assert.strictEqual(cpu._selectedBuildAction, null);
    assert.strictEqual(CPUBuildStrategy.chooseBuildAction(cpu, { phase: 'roll', builtThisTurn: false }, {}), null);
    assert.strictEqual(cpu._selectedBuildAction, null);
});

runTest('CPU build strategy はstrategy例外後もselection scopeを解除する', () => {
    const cpu = {
        difficulty: 'normal',
        _selectedBuildAction: null,
        _collectingBuildAction: false,
        _syncExpertTuningForGame: () => {},
        buildNormal: () => { throw new Error('boom'); },
    };
    assert.throws(
        () => CPUBuildStrategy.chooseBuildAction(cpu, { phase: 'build', builtThisTurn: false }, {}),
        /boom/
    );
    assert.strictEqual(cpu._collectingBuildAction, false);
});

runTest('CPU build strategy は空のcrowd候補を既存順でno-opにする', () => {
    global.CARDS = [];
    const current = { coins: 0, builtLandmarkCount: () => 0 };
    const calls = [];
    const cpu = {
        _remainingEnabledLandmarks: () => [],
        _shouldExpertForceLandmarkPlan: () => false,
        _maybeBuyLandmark(currentArg, gameArg, reserve, urgency) {
            calls.push([reserve, urgency]);
            return false;
        },
        _bestAffordableLandmark: () => null,
        _sortAffordableForDifficulty: () => [],
    };
    const game = { players: [current] };

    assert.strictEqual(CPUBuildStrategy._buildExpertCrowd(cpu, current, game, {}), false);
    assert.deepStrictEqual(calls, [[1, 7]]);
    calls.length = 0;
    assert.strictEqual(CPUBuildStrategy._buildStrongCrowd(cpu, current, game, {}), false);
    assert.deepStrictEqual(calls, [[1, 6]]);
});

runTest('CPU build strategy はexpert-v2-simple候補なしのtrace順を維持する', () => {
    global.LANDMARK_NAMES = { AIRPORT: 'airport' };
    const trace = [];
    const cpu = {
        expertAirportSkipMode: 'disabled',
        _traceV2Simple: (key, amount) => trace.push(amount === undefined ? key : [key, amount]),
        _listExpertV2SimpleAffordableLandmarks: () => [],
        _listExpertV2SimpleAffordableCards: () => [],
        _buyWinningLandmark: () => false,
    };
    const current = { landmarks: {} };

    assert.strictEqual(CPUBuildStrategy._buildExpertV2Simple(cpu, current, {}, {}), false);
    assert.deepStrictEqual(trace, ['buildCalls', ['buildOptionTotal', 0], 'buildNoop']);
});

runTest('CPU.jsのbuild strategy public APIは専用境界へ委譲する', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/CPU.js'), 'utf8');
    for (const name of ['chooseBuildAction', 'buildWeak', 'buildNormal', 'buildStrong', 'buildExpert']) {
        assert.match(source, new RegExp(`${name}\\(game, shopStock\\) \\{\\s*return CPUBuildStrategy\\.${name}\\(this, game, shopStock\\);\\s*\\}`));
    }
    for (const name of ['_buildExpertCrowd', '_buildStrongCrowd', '_buildExpertV2Simple']) {
        assert.match(source, new RegExp(`${name}\\(current, game, shopStock\\) \\{\\s*return CPUBuildStrategy\\.${name}\\(this, current, game, shopStock\\);\\s*\\}`));
    }
});
