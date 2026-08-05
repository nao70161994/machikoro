'use strict';

const GameEngineAuthority = (() => {
    function select(enabled, transition, parityReport) {
        if (!enabled) {
            return Object.freeze({ authority: 'mutable', reason: 'disabled' });
        }
        if (!transition || transition.ok !== true || !transition.snapshot) {
            return Object.freeze({
                authority: 'mutable',
                reason: transition && transition.reason || 'transition-unavailable',
            });
        }
        if (!parityReport || parityReport.status !== 'matched') {
            return Object.freeze({
                authority: 'mutable',
                reason: parityReport && parityReport.status || 'parity-unavailable',
            });
        }
        return Object.freeze({ authority: 'pure-transition', reason: '' });
    }

    function selectPrepared(enabled, transition) {
        if (!enabled) {
            return Object.freeze({ authority: 'mutable', reason: 'disabled' });
        }
        if (!transition || transition.ok !== true || !transition.snapshot) {
            return Object.freeze({
                authority: 'mutable',
                reason: transition && transition.reason || 'transition-unavailable',
            });
        }
        return Object.freeze({ authority: 'pure-transition', reason: '' });
    }

    function create(options = {}) {
        const enabled = options.enabled === true;
        return Object.freeze({
            enabled,
            select(transition, parityReport) {
                return select(enabled, transition, parityReport);
            },
            selectPrepared(transition) {
                return selectPrepared(enabled, transition);
            },
        });
    }

    return Object.freeze({ create, select, selectPrepared });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameEngineAuthority;
if (typeof window !== 'undefined') window.GameEngineAuthority = GameEngineAuthority;
if (typeof globalThis !== 'undefined') globalThis.GameEngineAuthority = GameEngineAuthority;
