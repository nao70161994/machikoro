'use strict';

const assert = require('assert');
const GameEngineDeterminism = require('../js/gameEngineDeterminism');
const { runTest } = require('./helpers/test-utils');

function snapshot(options = {}) {
    return {
        players: [{
            landmarks: Object.assign({ 駅: false }, options.landmarks),
        }],
        currentPlayerIndex: 0,
        pendingTunaDice: options.pendingTunaDice,
    };
}

runTest('Engine determinism policyは確定済みdice payloadだけをshadow可能にする', () => {
    assert.strictEqual(GameEngineDeterminism.isResolved({
        action: 'rollDice',
        data: { forceDice: 4, tunaDice: [2, 5] },
        snapshot: snapshot(),
        stationName: '駅',
    }), true);
    assert.strictEqual(GameEngineDeterminism.isResolved({
        action: 'rollDice',
        data: { forceDice: null, tunaDice: null },
        snapshot: snapshot(),
        stationName: '駅',
    }), false);
    assert.strictEqual(GameEngineDeterminism.isResolved({
        action: 'rollDice',
        data: { forceDice: null, tunaDice: null },
        snapshot: snapshot({ landmarks: { 駅: true } }),
        stationName: '駅',
    }), true);
    assert.strictEqual(GameEngineDeterminism.isResolved({
        action: 'selectDice',
        data: { useTwo: true, d1: 2, d2: 6, tunaDice: [3, 4] },
        snapshot: snapshot(),
    }), true);
    assert.strictEqual(GameEngineDeterminism.isResolved({
        action: 'selectDice',
        data: { useTwo: true, d1: 2, d2: null, tunaDice: [3, 4] },
        snapshot: snapshot(),
    }), false);
    assert.strictEqual(GameEngineDeterminism.isResolved({
        action: 'rerollDice',
        data: { forceDice: 3, tunaDice: null },
        snapshot: snapshot(),
    }), false);
});

runTest('Engine determinism policyは遅延incomeのtuna dice解決済み状態を要求する', () => {
    for (const action of ['skipReroll', 'resolveHarbor']) {
        assert.strictEqual(GameEngineDeterminism.isResolved({
            action,
            data: {},
            snapshot: snapshot({ pendingTunaDice: [1, 6] }),
        }), true, action);
        assert.strictEqual(GameEngineDeterminism.isResolved({
            action,
            data: {},
            snapshot: snapshot({ pendingTunaDice: null }),
        }), false, action);
    }
});

runTest('Engine determinism policyは非乱数handled actionを許可し未知actionを拒否する', () => {
    for (const action of [
        'resolveTV', 'resolveBusiness', 'resolveCleaning', 'resolveMover',
        'resolveRenovation', 'resolveIT', 'buildCard', 'buildLandmark',
        'undoBuild', 'nextTurn',
    ]) {
        assert.strictEqual(GameEngineDeterminism.isResolved({
            action,
            data: {},
            snapshot: snapshot(),
        }), true, action);
    }
    assert.strictEqual(GameEngineDeterminism.isResolved({
        action: 'unknown',
        data: {},
        snapshot: snapshot(),
    }), false);
});
