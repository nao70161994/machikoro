'use strict';

const OnlineClientEffects = (() => {
    const requiredEffects = Object.freeze([
        'invalidateCpuSchedule',
        'render',
        'scheduleCpu',
        'showNotice',
        'updateResumeButton',
    ]);
    const optionalEffects = Object.freeze([
        'notifyLifecycleStart',
        'resetUiLocks',
    ]);

    function create(effects = {}) {
        for (const name of requiredEffects) {
            if (typeof effects[name] !== 'function') {
                throw new TypeError(`${name} effect is required`);
            }
        }
        for (const name of optionalEffects) {
            if (effects[name] !== undefined && typeof effects[name] !== 'function') {
                throw new TypeError(`${name} effect must be a function`);
            }
        }

        function runOptional(name, ...args) {
            if (typeof effects[name] !== 'function') return false;
            effects[name](...args);
            return true;
        }

        return Object.freeze({
            invalidateCpuSchedule: (...args) => effects.invalidateCpuSchedule(...args),
            notifyLifecycleStart: (...args) => runOptional('notifyLifecycleStart', ...args),
            render: (...args) => effects.render(...args),
            resetUiLocks: (...args) => runOptional('resetUiLocks', ...args),
            scheduleCpu: (...args) => effects.scheduleCpu(...args),
            showNotice: (...args) => effects.showNotice(...args),
            supportsResetUiLocks: () => typeof effects.resetUiLocks === 'function',
            updateResumeButton: (...args) => effects.updateResumeButton(...args),
        });
    }

    function createFromResolver(resolveEffect) {
        if (typeof resolveEffect !== 'function') throw new TypeError('resolveEffect is required');
        const required = Object.fromEntries(requiredEffects.map(name => [name, (...args) => {
            const effect = resolveEffect(name);
            if (typeof effect !== 'function') throw new TypeError(`${name} effect is unavailable`);
            return effect(...args);
        }]));
        function runOptional(name, ...args) {
            const effect = resolveEffect(name);
            if (typeof effect !== 'function') return false;
            effect(...args);
            return true;
        }
        return Object.freeze({
            ...required,
            notifyLifecycleStart: (...args) => runOptional('notifyLifecycleStart', ...args),
            resetUiLocks: (...args) => runOptional('resetUiLocks', ...args),
            supportsResetUiLocks: () => typeof resolveEffect('resetUiLocks') === 'function',
        });
    }

    return Object.freeze({ create, createFromResolver, optionalEffects, requiredEffects });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineClientEffects;
if (typeof window !== 'undefined') window.OnlineClientEffects = OnlineClientEffects;
if (typeof globalThis !== 'undefined') globalThis.OnlineClientEffects = OnlineClientEffects;
