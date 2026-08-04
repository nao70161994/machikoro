'use strict';

const GameSelectionState = (() => {
    function selectedValues(value) {
        return value == null ? [] : Array.from(new Set(value));
    }

    function createController(initial = {}) {
        let enabledCardNames = selectedValues(initial.enabledCards);
        let enabledLandmarkNames = selectedValues(initial.enabledLandmarks);

        function snapshot() {
            return Object.freeze({
                enabledCards: Object.freeze(enabledCardNames.slice()),
                enabledLandmarks: Object.freeze(enabledLandmarkNames.slice()),
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

        return Object.freeze({ snapshot, cards, landmarks, replaceCards, replaceLandmarks });
    }

    const runtime = createController({
        enabledCards: typeof CARDS !== 'undefined' ? CARDS.map(card => card.name) : [],
        enabledLandmarks: typeof Player !== 'undefined' ? Player.landmarkNames() : [],
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

if (typeof module !== 'undefined' && module.exports) module.exports = GameSelectionState;
if (typeof window !== 'undefined') Object.assign(window, { GameSelectionState });
if (typeof globalThis !== 'undefined') globalThis.GameSelectionState = GameSelectionState;
