'use strict';

const GameSelectionState = (() => {
    function selectedValues(value) {
        return value == null ? [] : Array.from(new Set(value));
    }

    function createController(initial = {}) {
        let enabledCardNames = selectedValues(initial.enabledCards);
        let enabledLandmarkNames = selectedValues(initial.enabledLandmarks);
        let marketRule = typeof MarketSupply !== 'undefined'
            ? MarketSupply.normalizeMode(initial.marketRule)
            : (initial.marketRule === 'ten-type' ? 'ten-type' : 'standard');

        function snapshot() {
            return Object.freeze({
                enabledCards: Object.freeze(enabledCardNames.slice()),
                enabledLandmarks: Object.freeze(enabledLandmarkNames.slice()),
                marketRule,
            });
        }

        function cards() {
            return new Set(enabledCardNames);
        }

        function landmarks() {
            return new Set(enabledLandmarkNames);
        }

        function replaceCards(values) {
            enabledCardNames = selectedValues(values);
            return snapshot();
        }

        function replaceLandmarks(values) {
            enabledLandmarkNames = selectedValues(values);
            return snapshot();
        }

        function replaceMarketRule(value) {
            marketRule = typeof MarketSupply !== 'undefined'
                ? MarketSupply.normalizeMode(value)
                : (value === 'ten-type' ? 'ten-type' : 'standard');
            return snapshot();
        }

        return Object.freeze({ snapshot, cards, landmarks, replaceCards, replaceLandmarks, replaceMarketRule });
    }

    const runtime = createController({
        enabledCards: typeof CARDS !== 'undefined' ? CARDS.map(card => card.name) : [],
        enabledLandmarks: typeof Player !== 'undefined' ? Player.landmarkNames() : [],
        marketRule: 'standard',
    });

    return Object.freeze({ createController, runtime });
})();

function getEnabledCardSelection() {
    return GameSelectionState.runtime.cards();
}

function getEnabledLandmarkSelection() {
    return GameSelectionState.runtime.landmarks();
}

function replaceEnabledCardSelection(values) {
    GameSelectionState.runtime.replaceCards(values);
    return getEnabledCardSelection();
}

function replaceEnabledLandmarkSelection(values) {
    GameSelectionState.runtime.replaceLandmarks(values);
    return getEnabledLandmarkSelection();
}

function replaceMarketRuleSelection(value) {
    GameSelectionState.runtime.replaceMarketRule(value);
    return GameSelectionState.runtime.snapshot().marketRule;
}

if (typeof module !== 'undefined' && module.exports) module.exports = GameSelectionState;
if (typeof window !== 'undefined') Object.assign(window, { GameSelectionState });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, {
    GameSelectionState,
    replaceMarketRuleSelection,
});
