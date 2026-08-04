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

    const stateFields = Object.freeze(['tutorialEnabled', 'tutorialLevel']);

    function createController(initial = {}) {
        const state = {
            tutorialEnabled: Object.prototype.hasOwnProperty.call(initial, 'tutorialEnabled')
                ? !!initial.tutorialEnabled
                : true,
            tutorialLevel: normalizeLevel(initial.tutorialLevel),
        };

        function snapshot() {
            return Object.freeze({
                tutorialEnabled: state.tutorialEnabled,
                tutorialLevel: state.tutorialLevel,
            });
        }

        function setEnabled(value) {
            state.tutorialEnabled = !!value;
            return snapshot();
        }

        function setLevel(value) {
            state.tutorialLevel = normalizeLevel(value);
            return snapshot();
        }

        function replace(values = {}) {
            if (Object.prototype.hasOwnProperty.call(values, 'tutorialEnabled')) {
                state.tutorialEnabled = !!values.tutorialEnabled;
            }
            if (Object.prototype.hasOwnProperty.call(values, 'tutorialLevel')) {
                state.tutorialLevel = normalizeLevel(values.tutorialLevel);
            }
            return snapshot();
        }

        function bindGlobals(root, options = {}) {
            if (!root || (typeof root !== 'object' && typeof root !== 'function')) return false;
            const writable = options.writable !== false;
            Object.defineProperties(root, {
                tutorialEnabled: {
                    configurable: true,
                    enumerable: false,
                    get: () => state.tutorialEnabled,
                    set: writable ? value => { setEnabled(value); } : undefined,
                },
                tutorialLevel: {
                    configurable: true,
                    enumerable: false,
                    get: () => state.tutorialLevel,
                    set: writable ? value => { setLevel(value); } : undefined,
                },
            });
            return true;
        }

        return Object.freeze({ snapshot, setEnabled, setLevel, replace, bindGlobals });
    }

    function currentGlobals(root) {
        if (!root || (typeof root !== 'object' && typeof root !== 'function')) return {};
        return Object.fromEntries(stateFields
            .filter(field => typeof root[field] !== 'undefined')
            .map(field => [field, root[field]]));
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

    const root = typeof globalThis !== 'undefined' ? globalThis : null;
    const browserRoot = typeof window !== 'undefined' ? window : null;
    const runtime = createController(currentGlobals(root));
    if (root) runtime.bindGlobals(root, { writable: !browserRoot || browserRoot !== root });

    return Object.freeze({
        CHANGE_TYPES,
        stateFields,
        createController,
        runtime,
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
