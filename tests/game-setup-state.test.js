'use strict';

const assert = require('assert');
const GameSetupState = require('../js/gameSetupState');
const { runTest } = require('./helpers/test-utils');

runTest('game setup stateは既存初期値をdetached snapshotへ投影する', () => {
    const controller = GameSetupState.createController();
    assert.deepStrictEqual(controller.snapshot(), {
        selectedCount: 2,
        playerSettings: [],
        cpuSpeed: 1500,
    });
    assert.ok(Object.isFrozen(controller.snapshot()));
    assert.ok(Object.isFrozen(controller.snapshot().playerSettings));
});

runTest('game setup stateは設定配列の互換in-place更新と置換を保持する', () => {
    const controller = GameSetupState.createController();
    controller.read('playerSettings').push({ type: 'human' });
    assert.deepStrictEqual(controller.snapshot().playerSettings, [{ type: 'human' }]);
    const replacement = [{ type: 'cpu', difficulty: 'strong' }];
    assert.strictEqual(controller.write('playerSettings', replacement), true);
    replacement.push({ type: 'human' });
    assert.deepStrictEqual(controller.snapshot().playerSettings, [{ type: 'cpu', difficulty: 'strong' }]);
});

runTest('game setup compatibility globalsは単一controllerへ双方向投影する', () => {
    const controller = GameSetupState.createController();
    const root = {};
    assert.strictEqual(controller.bindGlobals(root), true);
    root.selectedCount = 4;
    root.cpuSpeed = 600;
    root.playerSettings = [{ type: 'human' }];
    root.playerSettings[0] = { type: 'cpu', difficulty: 'normal' };

    assert.deepStrictEqual(controller.snapshot(), {
        selectedCount: 4,
        playerSettings: [{ type: 'cpu', difficulty: 'normal' }],
        cpuSpeed: 600,
    });
    assert.strictEqual(Object.keys(root).includes('selectedCount'), false);
});
