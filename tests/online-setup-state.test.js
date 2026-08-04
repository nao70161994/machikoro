'use strict';

const assert = require('assert');
const OnlineSetupState = require('../js/onlineSetupState');
const { runTest } = require('./helpers/test-utils');

runTest('online setup stateは既存初期値とdetached snapshotを保持する', () => {
    const controller = OnlineSetupState.createController();
    const state = controller.snapshot();
    assert.deepStrictEqual(state, { selectedCount: 2, playerSettings: [], cpuSpeed: 1500 });
    assert.ok(Object.isFrozen(state));
    assert.ok(Object.isFrozen(state.playerSettings));
});

runTest('online setup stateは人数を2〜10へ既存どおりclampする', () => {
    const controller = OnlineSetupState.createController({ selectedCount: 2 });
    assert.strictEqual(controller.changeCount(-1).selectedCount, 2);
    assert.strictEqual(controller.changeCount(20).selectedCount, 10);
    assert.strictEqual(controller.changeCount(-3).selectedCount, 7);
    assert.strictEqual(controller.setSelectedCount(4).selectedCount, 4);
});

runTest('online setup stateは設定配列とCPU速度を一つのownerで更新する', () => {
    const input = [{ type: 'human', difficulty: 'normal' }];
    const controller = OnlineSetupState.createController({ playerSettings: input });
    input.push({ type: 'cpu', difficulty: 'strong' });
    assert.strictEqual(controller.snapshot().playerSettings.length, 1);
    controller.updateSetting(1, { type: 'cpu', difficulty: 'strong' });
    controller.setCpuSpeed(600);
    assert.deepStrictEqual(controller.snapshot(), {
        selectedCount: 2,
        playerSettings: [
            { type: 'human', difficulty: 'normal' },
            { type: 'cpu', difficulty: 'strong' },
        ],
        cpuSpeed: 600,
    });
});
