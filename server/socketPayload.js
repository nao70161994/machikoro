'use strict';

function makeSocketPayloadValidation({ isPlainObject, byteLength, socketLimits, restoreLimits }) {
    function validateSocketPayloadLimits(payload, limits = socketLimits) {
        if (!isPlainObject(payload)) return { ok: false, reason: 'not-object' };
        let jsonBytes = 0;
        try {
            jsonBytes = byteLength(JSON.stringify(payload));
        } catch {
            return { ok: false, reason: 'json' };
        }
        if (jsonBytes > limits.maxJsonBytes) return { ok: false, reason: 'json-size', jsonBytes };
        const stats = { stringChars: 0 };
        const visit = (value, depth = 0) => {
            if (depth > limits.maxDepth) return false;
            if (typeof value === 'string') {
                if (value.length > limits.maxStringLength) return false;
                stats.stringChars += value.length;
                return stats.stringChars <= limits.maxTotalStringChars;
            }
            if (Array.isArray(value)) return value.every(item => visit(item, depth + 1));
            if (isPlainObject(value)) return Object.values(value).every(item => visit(item, depth + 1));
            return true;
        };
        if (!visit(payload)) {
            return { ok: false, reason: 'content-size', stringChars: stats.stringChars };
        }
        return { ok: true, jsonBytes, stringChars: stats.stringChars };
    }

    function countNestedStrings(value) {
        if (typeof value === 'string') return 1;
        if (!Array.isArray(value)) return 0;
        return value.reduce((sum, item) => sum + countNestedStrings(item), 0);
    }

    function validateRestorePayloadLimits(payload, limits = restoreLimits) {
        if (!isPlainObject(payload)) return { ok: false, reason: 'not-object' };
        let jsonBytes = 0;
        try {
            jsonBytes = byteLength(JSON.stringify(payload));
        } catch {
            return { ok: false, reason: 'json' };
        }
        if (jsonBytes > limits.maxJsonBytes) return { ok: false, reason: 'json-size', jsonBytes };
        if (Array.isArray(payload.actionLog) && payload.actionLog.length > limits.maxActionLogEntries) {
            return {
                ok: false,
                reason: 'action-log-length',
                actionLogEntries: payload.actionLog.length,
            };
        }

        const stats = { stringChars: 0, playerCardRefs: 0 };
        const visit = (value, key = '', depth = 0) => {
            if (depth > 20) return false;
            if (typeof value === 'string') {
                if (value.length > limits.maxStringLength) return false;
                stats.stringChars += value.length;
                return stats.stringChars <= limits.maxTotalStringChars;
            }
            if (Array.isArray(value)) {
                if ((key === 'cards' || key === 'playerCardNames') &&
                    value.every(item => typeof item === 'string' || Array.isArray(item))) {
                    stats.playerCardRefs += countNestedStrings(value);
                    if (stats.playerCardRefs > limits.maxPlayerCardRefs) return false;
                }
                for (const item of value) {
                    if (!visit(item, key, depth + 1)) return false;
                }
                return true;
            }
            if (isPlainObject(value)) {
                for (const [childKey, childValue] of Object.entries(value)) {
                    if (!visit(childValue, childKey, depth + 1)) return false;
                }
            }
            return true;
        };

        if (!visit(payload)) {
            return {
                ok: false,
                reason: 'content-size',
                stringChars: stats.stringChars,
                playerCardRefs: stats.playerCardRefs,
            };
        }
        return {
            ok: true,
            jsonBytes,
            actionLogEntries: Array.isArray(payload.actionLog) ? payload.actionLog.length : 0,
            playerCardRefs: stats.playerCardRefs,
        };
    }

    return Object.freeze({
        countNestedStrings,
        validateSocketPayloadLimits,
        validateRestorePayloadLimits,
    });
}

module.exports = { makeSocketPayloadValidation };
