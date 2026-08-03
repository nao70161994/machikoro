'use strict';

const GameBuildPolicy = (() => {
    const reasons = Object.freeze({
        WRONG_PHASE: 'wrong-phase',
        ALREADY_BUILT: 'already-built',
        INVALID_CARD: 'invalid-card',
        INSUFFICIENT_COINS: 'insufficient-coins',
        DUPLICATE_MAJOR: 'duplicate-major',
        UNKNOWN_LANDMARK: 'unknown-landmark',
        DISABLED_LANDMARK: 'disabled-landmark',
        LANDMARK_ALREADY_BUILT: 'landmark-already-built',
    });

    function result(ok, reason = '') {
        return Object.freeze({ ok, reason });
    }

    function readFact(value) {
        return typeof value === 'function' ? value() : value;
    }

    function planCardBuild(facts = {}) {
        if (readFact(facts.phase) !== readFact(facts.buildPhase)) return result(false, reasons.WRONG_PHASE);
        if (readFact(facts.builtThisTurn)) return result(false, reasons.ALREADY_BUILT);
        if (!readFact(facts.cardValid)) return result(false, reasons.INVALID_CARD);
        if (readFact(facts.coins) < readFact(facts.cost)) return result(false, reasons.INSUFFICIENT_COINS);
        if (readFact(facts.isMajor) && readFact(facts.ownsMajor)) return result(false, reasons.DUPLICATE_MAJOR);
        return result(true);
    }

    function planLandmarkBuild(facts = {}) {
        if (readFact(facts.phase) !== readFact(facts.buildPhase)) return result(false, reasons.WRONG_PHASE);
        if (readFact(facts.builtThisTurn)) return result(false, reasons.ALREADY_BUILT);
        const cost = readFact(facts.cost);
        if (!readFact(facts.knownLandmark)) return result(false, reasons.UNKNOWN_LANDMARK);
        if (!readFact(facts.enabledLandmark)) return result(false, reasons.DISABLED_LANDMARK);
        if (readFact(facts.coins) < cost) return result(false, reasons.INSUFFICIENT_COINS);
        if (readFact(facts.landmarkBuilt)) return result(false, reasons.LANDMARK_ALREADY_BUILT);
        return result(true);
    }

    return Object.freeze({ reasons, planCardBuild, planLandmarkBuild });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameBuildPolicy;
if (typeof window !== 'undefined') window.GameBuildPolicy = GameBuildPolicy;
if (typeof globalThis !== 'undefined') globalThis.GameBuildPolicy = GameBuildPolicy;
