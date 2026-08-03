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
