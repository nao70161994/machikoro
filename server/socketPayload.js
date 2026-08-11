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
        let count = 0;
        const pending = [value];
        while (pending.length > 0) {
            const current = pending.pop();
            if (typeof current === 'string') count++;
            else if (Array.isArray(current)) {
                for (const item of current) pending.push(item);
            }
        }
        return count;
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

        const stats = { stringChars: 0, playerCardRefs: 0, totalNodes: 0 };
        const visit = (value, key = '', depth = 0, countAsPlayerCard = false) => {
            stats.totalNodes++;
            if (stats.totalNodes > limits.maxTotalNodes) return false;
            if (depth > 20) return false;
            if (typeof value === 'string') {
                if (value.length > limits.maxStringLength) return false;
                stats.stringChars += value.length;
                if (countAsPlayerCard) stats.playerCardRefs++;
                return stats.stringChars <= limits.maxTotalStringChars &&
                    stats.playerCardRefs <= limits.maxPlayerCardRefs;
            }
            if (Array.isArray(value)) {
                const childIsPlayerCard = countAsPlayerCard || key === 'cards' || key === 'playerCardNames';
                for (const item of value) {
                    if (!visit(item, key, depth + 1, childIsPlayerCard)) return false;
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
                totalNodes: stats.totalNodes,
            };
        }
        return {
            ok: true,
            jsonBytes,
            actionLogEntries: Array.isArray(payload.actionLog) ? payload.actionLog.length : 0,
            playerCardRefs: stats.playerCardRefs,
            totalNodes: stats.totalNodes,
        };
    }

    return Object.freeze({
        countNestedStrings,
        validateSocketPayloadLimits,
        validateRestorePayloadLimits,
    });
}

function makeSocketPayloadGateway(options = {}) {
    if (typeof options.validateSocketPayloadLimits !== 'function') {
        throw new TypeError('validateSocketPayloadLimits must be a function');
    }
    const validateSocketPayloadLimits = options.validateSocketPayloadLimits;
    const appErrorEvent = options.appErrorEvent || 'appError';
    const invalidMessage = options.invalidMessage || '無効なリクエストです';

    function emitAppError(socket, message) {
        socket.emit(appErrorEvent, message);
    }

    function requirePlainSocketPayload(socket, payload) {
        const validation = validateSocketPayloadLimits(payload);
        if (validation.ok) return true;
        emitAppError(socket, invalidMessage);
        return false;
    }

    return Object.freeze({
        emitAppError,
        requirePlainSocketPayload,
    });
}

module.exports = {
    makeSocketPayloadValidation,
    makeSocketPayloadGateway,
};
