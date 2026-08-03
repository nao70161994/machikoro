'use strict';

const UiTutorialSettings = (() => {
    const CHANGE_TYPES = Object.freeze({
        ENABLED: 'enabled',
        LEVEL: 'level',
    });

    function requiredFunction(name, candidate) {
        if (typeof candidate !== 'function') throw new TypeError(`${name} must be a function`);
        return candidate;
    }

    function normalizeLevel(level) {
        return level === 'advanced' ? 'advanced' : 'beginner';
    }

    function planEnabledChange(enabled) {
        const nextEnabled = !!enabled;
        return Object.freeze({
            type: CHANGE_TYPES.ENABLED,
            enabled: nextEnabled,
            storageKey: 'tutorialEnabled',
            storageValue: nextEnabled ? 'true' : 'false',
        });
    }

    function planLevelChange(level) {
        const nextLevel = normalizeLevel(level);
        return Object.freeze({
            type: CHANGE_TYPES.LEVEL,
            level: nextLevel,
            storageKey: 'tutorialLevel',
            storageValue: nextLevel,
        });
    }

    function planLevelCycle(currentLevel) {
        return planLevelChange(currentLevel === 'beginner' ? 'advanced' : 'beginner');
    }

    function executeChange(plan, effects) {
        const applyState = plan.type === CHANGE_TYPES.ENABLED
            ? requiredFunction('setEnabled', effects?.setEnabled)
            : requiredFunction('setLevel', effects?.setLevel);
        const persist = requiredFunction('persist', effects?.persist);
        const syncControls = requiredFunction('syncControls', effects?.syncControls);
        const renderTutorial = requiredFunction('renderTutorial', effects?.renderTutorial);

        if (plan.type === CHANGE_TYPES.ENABLED) applyState(plan.enabled);
        else applyState(plan.level);
        persist(plan.storageKey, plan.storageValue);
        syncControls();
        renderTutorial();
    }

    return Object.freeze({
        CHANGE_TYPES,
        executeChange,
        normalizeLevel,
        planEnabledChange,
        planLevelChange,
        planLevelCycle,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiTutorialSettings;
if (typeof window !== 'undefined') window.UiTutorialSettings = UiTutorialSettings;
if (typeof globalThis !== 'undefined') globalThis.UiTutorialSettings = UiTutorialSettings;
