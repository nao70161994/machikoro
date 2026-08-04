'use strict';

const GameEngineAuthorityApi = typeof module !== 'undefined' && module.exports
    ? require('./gameEngineAuthority')
    : globalThis.GameEngineAuthority;

const GameEngineClientShadow = (() => {
    function stableStringify(value) {
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
        const keys = Object.keys(value).sort();
        return '{' + keys.map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
    }

    function equalSnapshots(left, right) {
        try {
            return stableStringify(left) === stableStringify(right);
        } catch (_) {
            return false;
        }
    }

    function createOutcomeController(initialOutcome = null) {
        let outcome = initialOutcome;

        return Object.freeze({
            get() {
                return outcome;
            },
            set(value) {
                outcome = value;
                return outcome;
            },
            reset() {
                outcome = null;
                return outcome;
            },
        });
    }

    function prepare(options) {
        if (!options || options.enabled !== true) return null;
        let transition;
        try {
            transition = typeof options.transition === 'function'
                ? options.transition(options.snapshot, options.action, options.data)
                : Object.freeze({ ok: false, reason: 'transition-unavailable', snapshot: null });
        } catch (_) {
            transition = Object.freeze({ ok: false, reason: 'transition-threw', snapshot: null });
        }
        return Object.freeze({
            action: options.action || '',
            transition,
        });
    }

    function comparisonReport(prepared, liveSnapshot) {
        const transition = prepared && prepared.transition;
        if (!transition || transition.ok !== true || !transition.snapshot) {
            return Object.freeze({
                status: 'transition-error',
                action: prepared && prepared.action || '',
                reason: transition && transition.reason || 'transition-unavailable',
            });
        }
        return Object.freeze({
            status: equalSnapshots(transition.snapshot, liveSnapshot) ? 'matched' : 'mismatch',
            action: prepared.action,
            reason: '',
        });
    }

    function finish(options) {
        const prepared = options && options.prepared;
        if (!prepared) return null;
        const report = comparisonReport(prepared, options.liveSnapshot);
        const authority = GameEngineAuthorityApi.create({
            enabled: options.authorityEnabled === true,
        });
        let decision = authority.select(prepared.transition, report);
        if (decision.authority === 'pure-transition') {
            let adopted = false;
            try {
                adopted = typeof options.adoptSnapshot === 'function' &&
                    options.adoptSnapshot(prepared.transition.snapshot) === true;
            } catch (_) {
                adopted = false;
            }
            if (!adopted) {
                decision = Object.freeze({ authority: 'mutable', reason: 'adoption-failed' });
            }
        }
        return Object.freeze({ report, authority: decision });
    }

    return Object.freeze({ equalSnapshots, createOutcomeController, prepare, finish });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameEngineClientShadow;
if (typeof window !== 'undefined') window.GameEngineClientShadow = GameEngineClientShadow;
if (typeof globalThis !== 'undefined') globalThis.GameEngineClientShadow = GameEngineClientShadow;
