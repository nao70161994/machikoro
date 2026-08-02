'use strict';

const GameEngineDeterminismApi = typeof module !== 'undefined' && module.exports
    ? require('./gameEngine')
    : globalThis.GameEngine;

const GameEngineDeterminism = (() => {
    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function isDie(value) {
        return Number.isInteger(value) && value >= 1 && value <= 6;
    }

    function isResolvedTunaDice(value) {
        return Array.isArray(value) &&
            value.length === 2 &&
            value.every(isDie);
    }

    function currentPlayerSnapshot(snapshot) {
        if (!isPlainObject(snapshot) || !Array.isArray(snapshot.players)) return null;
        const index = Number.isInteger(snapshot.currentPlayerIndex)
            ? snapshot.currentPlayerIndex
            : 0;
        return snapshot.players[index] || null;
    }

    function hasCurrentLandmark(snapshot, landmarkName) {
        const player = currentPlayerSnapshot(snapshot);
        return !!player &&
            isPlainObject(player.landmarks) &&
            player.landmarks[landmarkName] === true;
    }

    function isHandledAction(action) {
        return !!GameEngineDeterminismApi &&
            Array.isArray(GameEngineDeterminismApi.handledActions) &&
            GameEngineDeterminismApi.handledActions.includes(action);
    }

    function isResolved(request) {
        if (!request || !isHandledAction(request.action) || !isPlainObject(request.data)) {
            return false;
        }
        const { action, data, snapshot } = request;
        if (action === 'rollDice') {
            if (data.forceDice == null) {
                return typeof request.stationName === 'string' &&
                    hasCurrentLandmark(snapshot, request.stationName) &&
                    (data.tunaDice == null || isResolvedTunaDice(data.tunaDice));
            }
            return isDie(data.forceDice) && isResolvedTunaDice(data.tunaDice);
        }
        if (action === 'selectDice') {
            return typeof data.useTwo === 'boolean' &&
                isDie(data.d1) &&
                (!data.useTwo || isDie(data.d2)) &&
                isResolvedTunaDice(data.tunaDice);
        }
        if (action === 'rerollDice') {
            return isDie(data.forceDice) && isResolvedTunaDice(data.tunaDice);
        }
        if (action === 'skipReroll' || action === 'resolveHarbor') {
            return isResolvedTunaDice(snapshot && snapshot.pendingTunaDice);
        }
        return true;
    }

    return Object.freeze({ isResolved, isResolvedTunaDice });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameEngineDeterminism;
if (typeof window !== 'undefined') window.GameEngineDeterminism = GameEngineDeterminism;
if (typeof globalThis !== 'undefined') globalThis.GameEngineDeterminism = GameEngineDeterminism;
