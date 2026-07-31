'use strict';

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

/**
 * @param {Record<string, *>} env
 * @returns {boolean}
 */
function gameEngineTransitionAuthorityEnabled(env = {}) {
    return ENABLED_VALUES.has(
        String(env.GAME_ENGINE_TRANSITION_AUTHORITY_ENABLED || '').trim().toLowerCase()
    );
}

/**
 * @param {{enabled?: boolean}} options
 * @returns {{enabled: boolean, select: (transition: Object|null, parityReport: Object|null) => Readonly<{authority: string, reason: string}>}}
 */
function makeGameEngineTransitionAuthority(options = {}) {
    const enabled = options.enabled === true;

    function select(transition, parityReport) {
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

    return Object.freeze({ enabled, select });
}

module.exports = Object.freeze({
    gameEngineTransitionAuthorityEnabled,
    makeGameEngineTransitionAuthority,
});
