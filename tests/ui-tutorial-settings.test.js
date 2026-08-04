'use strict';

const assert = require('assert');
const UiTutorialSettings = require('../js/uiTutorialSettings');
const { runTest } = require('./helpers/test-utils');

runTest('tutorial settingsはenabledとlevelを既存storage形式へ正規化する', () => {
    const enabled = UiTutorialSettings.planEnabledChange(1);
    assert.deepStrictEqual(enabled, {
        type: UiTutorialSettings.CHANGE_TYPES.ENABLED,
        enabled: true,
        storageKey: 'tutorialEnabled',
        storageValue: 'true',
    });
    assert.strictEqual(Object.isFrozen(enabled), true);

    assert.deepStrictEqual(UiTutorialSettings.planLevelChange('advanced'), {
        type: UiTutorialSettings.CHANGE_TYPES.LEVEL,
        level: 'advanced',
        storageKey: 'tutorialLevel',
        storageValue: 'advanced',
    });
    assert.strictEqual(UiTutorialSettings.planLevelChange('invalid').level, 'beginner');
    assert.strictEqual(UiTutorialSettings.planLevelCycle('beginner').level, 'advanced');
    assert.strictEqual(UiTutorialSettings.planLevelCycle('advanced').level, 'beginner');
});

runTest('tutorial settings runtimeはstate、保存、control、描画の既存順を維持する', () => {
    const calls = [];
    const plan = UiTutorialSettings.planEnabledChange(false);
    UiTutorialSettings.executeChange(plan, {
        setEnabled: value => calls.push(['state', value]),
        persist: (key, value) => calls.push(['persist', key, value]),
        syncControls: () => calls.push(['sync']),
        renderTutorial: () => calls.push(['render']),
    });

    assert.deepStrictEqual(calls, [
        ['state', false],
        ['persist', 'tutorialEnabled', 'false'],
        ['sync'],
        ['render'],
    ]);
});

runTest('tutorial settings runtimeはlevel setterを選び依存不足をeffect前に拒否する', () => {
    const levelCalls = [];
    UiTutorialSettings.executeChange(UiTutorialSettings.planLevelChange('advanced'), {
        setLevel: value => levelCalls.push(['level', value]),
        persist: (key, value) => levelCalls.push(['persist', key, value]),
        syncControls: () => levelCalls.push(['sync']),
        renderTutorial: () => levelCalls.push(['render']),
    });
    assert.deepStrictEqual(levelCalls[0], ['level', 'advanced']);

    const rejectedCalls = [];
    assert.throws(() => UiTutorialSettings.executeChange(
        UiTutorialSettings.planEnabledChange(true),
        {
            setEnabled: value => rejectedCalls.push(['state', value]),
            persist: (key, value) => rejectedCalls.push(['persist', key, value]),
            syncControls: () => rejectedCalls.push(['sync']),
        }
    ), /renderTutorial must be a function/);
    assert.deepStrictEqual(rejectedCalls, []);
});

runTest('tutorial settings controllerは値を正規化してfrozen snapshotへ投影する', () => {
    const controller = UiTutorialSettings.createController({
        tutorialEnabled: 0,
        tutorialLevel: 'advanced',
    });
    assert.deepStrictEqual(controller.snapshot(), {
        tutorialEnabled: false,
        tutorialLevel: 'advanced',
    });
    assert.ok(Object.isFrozen(controller.snapshot()));
    controller.setEnabled('yes');
    controller.setLevel('invalid');
    assert.deepStrictEqual(controller.snapshot(), {
        tutorialEnabled: true,
        tutorialLevel: 'beginner',
    });
});

runTest('tutorial settings compatibility globalsは既存値を保持して単一controllerへ投影する', () => {
    const root = { tutorialEnabled: false, tutorialLevel: 'advanced' };
    const controller = UiTutorialSettings.createController(root);
    assert.strictEqual(controller.bindGlobals(root), true);
    assert.strictEqual(root.tutorialEnabled, false);
    assert.strictEqual(root.tutorialLevel, 'advanced');
    root.tutorialEnabled = true;
    root.tutorialLevel = 'invalid';
    assert.deepStrictEqual(controller.snapshot(), {
        tutorialEnabled: true,
        tutorialLevel: 'beginner',
    });
    assert.strictEqual(Object.keys(root).includes('tutorialEnabled'), false);
});

runTest('tutorial settings compatibility globalsは製品向けread-only投影を選べる', () => {
    const controller = UiTutorialSettings.createController({
        tutorialEnabled: false,
        tutorialLevel: 'advanced',
    });
    const root = {};
    assert.strictEqual(controller.bindGlobals(root, { writable: false }), true);
    assert.strictEqual(Object.getOwnPropertyDescriptor(root, 'tutorialEnabled').set, undefined);
    assert.strictEqual(Object.getOwnPropertyDescriptor(root, 'tutorialLevel').set, undefined);
    controller.setEnabled(true);
    controller.setLevel('beginner');
    assert.strictEqual(root.tutorialEnabled, true);
    assert.strictEqual(root.tutorialLevel, 'beginner');
});
