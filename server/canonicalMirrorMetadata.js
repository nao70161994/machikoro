'use strict';

const crypto = require('crypto');

module.exports = function makeCanonicalMirrorMetadata(options = {}) {
    const { serializeMirrorState, restorePayloadRank } = options;

    function stableHashStringify(value) {
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) {
            return '[' + value.map(stableHashStringify).join(',') + ']';
        }
        const keys = Object.keys(value).sort();
        return '{' + keys.map(key => JSON.stringify(key) + ':' + stableHashStringify(value[key])).join(',') + '}';
    }

    function stableStateHash(value) {
        return crypto.createHash('sha256').update(stableHashStringify(value)).digest('hex').slice(0, 16);
    }

    function canonicalMirrorStateHash(mirror) {
        if (!mirror || !mirror.game) return null;
        const state = serializeMirrorState(mirror.game, mirror.shopStock, mirror.lastUndoState || null, 0);
        return stableStateHash(state);
    }

    function roomCanonicalMirrorMarker(room) {
        return {
            actionSeq: restorePayloadRank(room.gameStartPayload, room.stateSnapshot, room.actionLog).actionSeq,
            actionLogLength: Array.isArray(room.actionLog) ? room.actionLog.length : 0,
        };
    }

    return Object.freeze({
        stableHashStringify,
        stableStateHash,
        canonicalMirrorStateHash,
        roomCanonicalMirrorMarker,
    });
};
