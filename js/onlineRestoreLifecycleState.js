'use strict';

function normalizeRestoreGeneration(value) {
    return Number.isInteger(value) && value >= 0 ? value : 0;
}

function createOnlineRestoreLifecycleController(initialState = {}) {
    let generation = normalizeRestoreGeneration(initialState.generation);
    let inProgress = initialState.inProgress === true;
    let quarantined = initialState.quarantined === true;

    function snapshot() {
        return Object.freeze({ generation, inProgress, quarantined });
    }

    return Object.freeze({
        snapshot,
        incrementGeneration() {
            generation += 1;
            return snapshot();
        },
        startRestore() {
            inProgress = true;
            return snapshot();
        },
        finishRestore() {
            inProgress = false;
            return snapshot();
        },
        quarantine() {
            quarantined = true;
            return snapshot();
        },
        clearQuarantine() {
            quarantined = false;
            return snapshot();
        },
    });
}

const OnlineRestoreLifecycleState = Object.freeze({
    createController: createOnlineRestoreLifecycleController,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineRestoreLifecycleState };
}
