'use strict';

const CANONICAL_ACTION_PAYLOAD_KEYS = Object.freeze({
    rollDice: Object.freeze(['forceDice', 'tunaDice']),
    selectDice: Object.freeze(['useTwo', 'diceCount', 'd1', 'd2', 'tunaDice']),
    rerollDice: Object.freeze(['forceDice', 'tunaDice']),
    skipReroll: Object.freeze([]),
    resolveHarbor: Object.freeze(['useBonus']),
    resolveTV: Object.freeze(['targetIndex']),
    resolveBusiness: Object.freeze(['myCard', 'targetIndex', 'theirCard']),
    resolveCleaning: Object.freeze(['cardName']),
    resolveMover: Object.freeze(['cardName', 'targetIndex']),
    resolveRenovation: Object.freeze(['landmarkName']),
    resolveIT: Object.freeze(['doSave']),
    buildCard: Object.freeze(['cardName']),
    buildLandmark: Object.freeze(['name']),
    undoBuild: Object.freeze([]),
    nextTurn: Object.freeze([]),
});

function makeActionPayload({ isPlainObject }) {
    function pickCanonicalPayloadKeys(data, keys) {
        const result = {};
        for (const key of keys) {
            result[key] = data[key];
        }
        return result;
    }

    function canonicalizeActionData(action, data) {
        if (!isPlainObject(data)) return {};
        if (action === 'resolveMover' && Number.isInteger(data.cardIndex)) {
            return { cardIndex: data.cardIndex, targetIndex: data.targetIndex };
        }
        return pickCanonicalPayloadKeys(data, CANONICAL_ACTION_PAYLOAD_KEYS[action] || []);
    }

    function normalizeClientActionId(clientActionId) {
        if (typeof clientActionId !== 'string') return '';
        return /^[A-Za-z0-9:_-]{1,120}$/.test(clientActionId) ? clientActionId : '';
    }

    return {
        CANONICAL_ACTION_PAYLOAD_KEYS,
        pickCanonicalPayloadKeys,
        canonicalizeActionData,
        normalizeClientActionId,
    };
}

module.exports = makeActionPayload;
