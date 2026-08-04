'use strict';

const LocalSaveRuntime = (() => {
    const DECISIONS = Object.freeze({
        NO_GAME: 'no-game',
        ONLINE: 'online',
        WINNER: 'winner',
        SAVE: 'save',
    });

    function admission(facts = {}) {
        if (facts.hasGame !== true) return DECISIONS.NO_GAME;
        if (facts.isOnline === true) return DECISIONS.ONLINE;
        const hasWinner = typeof facts.hasWinner === 'function'
            ? facts.hasWinner()
            : facts.hasWinner;
        return hasWinner === true ? DECISIONS.WINNER : DECISIONS.SAVE;
    }

    function execute(effects = {}) {
        try {
            const state = effects.serialize();
            effects.save(state);
            return Object.freeze({ saved: true, reason: DECISIONS.SAVE });
        } catch (error) {
            return Object.freeze({ saved: false, reason: 'save-failed' });
        }
    }

    return Object.freeze({ DECISIONS, admission, execute });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalSaveRuntime;
if (typeof window !== 'undefined') Object.assign(window, { LocalSaveRuntime });
if (typeof globalThis !== 'undefined') globalThis.LocalSaveRuntime = LocalSaveRuntime;
