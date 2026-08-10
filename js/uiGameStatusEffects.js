'use strict';

const UiGameStatusEffects = (() => {
    function createTurnStateController(initialPreviousPlayerIndex = -1,
            initialPreviousTurnCount = -1, initialPreviousPhase = '') {
        let previousPlayerIndex = initialPreviousPlayerIndex;
        let previousTurnCount = initialPreviousTurnCount;
        let previousPhase = initialPreviousPhase;

        function snapshot() {
            return Object.freeze({ previousPlayerIndex, previousTurnCount, previousPhase });
        }

        function set(nextPreviousPlayerIndex, nextPreviousTurnCount = previousTurnCount,
                nextPreviousPhase = previousPhase) {
            previousPlayerIndex = nextPreviousPlayerIndex;
            previousTurnCount = nextPreviousTurnCount;
            previousPhase = nextPreviousPhase;
            return snapshot();
        }

        function reset() {
            previousPlayerIndex = -1;
            previousTurnCount = -1;
            previousPhase = '';
            return snapshot();
        }

        return Object.freeze({ snapshot, set, reset });
    }

    const REQUIRED_EFFECTS = Object.freeze([
        'setStatusText',
        'announceTurn',
        'setPreviousPlayerIndex',
        'setRollDisabled',
        'setSkipButton',
        'hideReroll',
        'updateDiceDisplay',
        'runRenderStep',
        'renderDiceChoose',
        'renderPending',
        'renderTutorial',
        'renderLog',
        'renderPlayers',
        'showCoinAnimation',
        'setPreviousCoins',
        'renderBuildMenu',
        'syncUiInteractabilityAfterRender',
        'schedulePostBuildUiStabilizer',
        'checkAutoSkip',
    ]);

    function execute(view = {}, effects = {}) {
        for (const name of REQUIRED_EFFECTS) {
            if (typeof effects[name] !== 'function') {
                throw new TypeError(`${name} effect is required`);
            }
        }

        effects.setStatusText(view.statusText);
        if (view.turnTransition.announce) {
            effects.announceTurn(
                view.turnTransition.name,
                view.turnTransition.isCpuTurn,
                view.turnTransition.playerIndex
            );
        }
        effects.setPreviousPlayerIndex(
            view.turnTransition.nextPreviousPlayerIndex,
            view.turnTransition.nextPreviousTurnCount,
            view.turnTransition.nextPreviousPhase
        );
        effects.setRollDisabled(view.rollButton.disabled);
        effects.setSkipButton(view.skipButton);
        effects.hideReroll();
        effects.updateDiceDisplay(view.diceValues);

        effects.runRenderStep('renderDiceChoose', effects.renderDiceChoose);
        effects.runRenderStep('renderPending', effects.renderPending);
        effects.runRenderStep('renderTutorial', effects.renderTutorial);
        effects.runRenderStep('renderLog', effects.renderLog);
        effects.runRenderStep('renderPlayers', effects.renderPlayers);
        effects.runRenderStep('coinAnimation', () => {
            view.coinChanges.forEach(change => {
                effects.showCoinAnimation(change.playerIndex, change.diff);
            });
            effects.setPreviousCoins(view.nextCoins.slice());
        });
        effects.runRenderStep('renderBuildMenu', effects.renderBuildMenu);
        effects.runRenderStep('syncUiInteractabilityAfterRender', () => {
            effects.syncUiInteractabilityAfterRender();
            effects.schedulePostBuildUiStabilizer();
        });
        effects.runRenderStep('checkAutoSkip', effects.checkAutoSkip);
    }

    return Object.freeze({ createTurnStateController, REQUIRED_EFFECTS, execute });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiGameStatusEffects;
if (typeof window !== 'undefined') window.UiGameStatusEffects = UiGameStatusEffects;
if (typeof globalThis !== 'undefined') globalThis.UiGameStatusEffects = UiGameStatusEffects;
