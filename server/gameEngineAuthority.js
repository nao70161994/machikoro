'use strict';

const GameEngineAuthority = require('../js/gameEngineAuthority');

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
    return GameEngineAuthority.create(options);
}

module.exports = Object.freeze({
    gameEngineTransitionAuthorityEnabled,
    makeGameEngineTransitionAuthority,
});
