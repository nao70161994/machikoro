'use strict';

const UiRenderRuntime = (() => {
    const branches = Object.freeze({
        NONE: 'none',
        WINNER: 'winner',
        ACTIVE: 'active',
    });
    const requiredEffects = Object.freeze({
        [branches.WINNER]: Object.freeze(['syncTutorialControls', 'renderWinnerState']),
        [branches.ACTIVE]: Object.freeze(['syncTutorialControls', 'renderActiveGameState', 'persistAfterRender']),
    });

    function plan(facts = {}) {
        if (facts.hasGame !== true) {
            return Object.freeze({ branch: branches.NONE, current: null, winner: null });
        }
        if (facts.winner) {
            return Object.freeze({ branch: branches.WINNER, current: facts.current, winner: facts.winner });
        }
        return Object.freeze({ branch: branches.ACTIVE, current: facts.current, winner: null });
    }

    function execute(renderPlan, effects = {}) {
        if (!renderPlan || !Object.values(branches).includes(renderPlan.branch)) {
            throw new TypeError('valid render plan is required');
        }
        if (renderPlan.branch === branches.NONE) return;
        for (const name of requiredEffects[renderPlan.branch]) {
            if (typeof effects[name] !== 'function') {
                throw new TypeError(`${name} effect is required`);
            }
        }

        effects.syncTutorialControls();
        if (renderPlan.branch === branches.WINNER) {
            effects.renderWinnerState(renderPlan.winner);
            return;
        }
        effects.renderActiveGameState(renderPlan.current);
        effects.persistAfterRender();
    }

    return Object.freeze({ branches, requiredEffects, plan, execute });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiRenderRuntime;
if (typeof window !== 'undefined') window.UiRenderRuntime = UiRenderRuntime;
if (typeof globalThis !== 'undefined') globalThis.UiRenderRuntime = UiRenderRuntime;
