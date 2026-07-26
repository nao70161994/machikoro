'use strict';

const GameActionContract = require('../js/actionContract');
const CANONICAL_ACTION_PAYLOAD_KEYS = GameActionContract.canonicalPayloadKeys;

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
