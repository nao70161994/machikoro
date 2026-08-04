'use strict';

const UiWatchdogReporting = (() => {
    function execute(context = {}, effects = {}) {
        const required = [
            'markCheckpoint',
            'recover',
            'serialize',
            'store',
            'buildStack',
            'report',
        ];
        if (required.some(name => typeof effects[name] !== 'function')) {
            return Object.freeze({ ok: false, reason: 'invalid-effects', payload: null });
        }
        const payload = {
            freezeKind: context.freezeKind,
            stagnantMs: context.stagnantMs,
            snapshot: context.snapshot,
            interactabilityIssues: context.interactabilityIssues,
        };
        effects.markCheckpoint('freeze-watchdog-report', payload);
        const recovered = effects.recover(context.snapshot);
        payload.recovery = { attempted: true, success: !!recovered };
        effects.store('machikoroFreezeSnapshot', effects.serialize(payload));
        effects.report({
            source: 'freeze-watchdog',
            phase: context.snapshot && context.snapshot.phase,
            message: context.freezeKind + ' after ' + context.stagnantMs + 'ms',
            stack: effects.buildStack(payload),
        });
        return Object.freeze({ ok: true, reason: 'reported', payload });
    }

    return Object.freeze({ execute });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiWatchdogReporting;
if (typeof window !== 'undefined') Object.assign(window, { UiWatchdogReporting });
if (typeof globalThis !== 'undefined') globalThis.UiWatchdogReporting = UiWatchdogReporting;
