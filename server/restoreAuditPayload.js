'use strict';

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(name + ' must be a function');
    return value;
}

/**
 * Creates pure payload builders used by restore signing and verification.
 * Signing policy, key selection, and verification order remain with the caller.
 * @param {Object} dependencies
 * @returns {{
 *   buildRestoreSnapshotAuditPayload: function(Object, Object): Object|null,
 *   buildRestoreActionAuditPayload: function(Object): Object|null
 * }}
 */
function makeRestoreAuditPayload(dependencies = {}) {
    const normalizePlayerSettings = requireFunction(
        dependencies.normalizePlayerSettings,
        'normalizePlayerSettings'
    );
    const canonicalizeActionData = requireFunction(
        dependencies.canonicalizeActionData,
        'canonicalizeActionData'
    );
    const normalizeClientActionId = requireFunction(
        dependencies.normalizeClientActionId,
        'normalizeClientActionId'
    );

    function buildRestoreSnapshotAuditPayload(gameStartPayload, stateSnapshot) {
        if (!stateSnapshot || !gameStartPayload) return null;
        const playerCount = Array.isArray(gameStartPayload.playerNames)
            ? gameStartPayload.playerNames.length
            : 0;
        const normalizedGameStartPayload = Object.assign({}, gameStartPayload, {
            playerSettings: normalizePlayerSettings(
                gameStartPayload.playerSettings,
                playerCount
            ),
        });
        return {
            gameStartPayload: normalizedGameStartPayload,
            stateSnapshot,
        };
    }

    function buildRestoreActionAuditPayload(actionEntry) {
        if (!actionEntry || typeof actionEntry.action !== 'string') return null;
        if (!Number.isInteger(actionEntry.playerIndex) || !Number.isInteger(actionEntry.seq)) {
            return null;
        }
        const payload = {
            action: actionEntry.action,
            data: canonicalizeActionData(actionEntry.action, actionEntry.data || {}),
            playerIndex: actionEntry.playerIndex,
            seq: actionEntry.seq,
        };
        const safeClientActionId = normalizeClientActionId(actionEntry.clientActionId);
        if (safeClientActionId) payload.clientActionId = safeClientActionId;
        return payload;
    }

    return Object.freeze({
        buildRestoreSnapshotAuditPayload,
        buildRestoreActionAuditPayload,
    });
}

module.exports = makeRestoreAuditPayload;
