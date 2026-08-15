'use strict';

/**
 * @param {{
 *     isPlainObject: (value: unknown) => boolean,
 *     isValidUndoState: (value: unknown, playerCount: number, createCardByName: (name: string) => unknown) => boolean,
 *     createCardByName: (name: string) => unknown,
 *     cards: ReadonlyArray<{name: string}>,
 *     landmarkNames: () => ReadonlyArray<string>,
 *     sanitizeName: (name: unknown) => string,
 *     isValidGameSchemaMetadata?: (metadata: unknown) => boolean,
 *     maxHostlessRestoreAttempts?: number,
 * }} options
 */
function makeRestoreValidation({
    isPlainObject,
    isValidUndoState,
    createCardByName,
    cards,
    landmarkNames,
    sanitizeName,
    isValidGameSchemaMetadata = () => false,
    maxHostlessRestoreAttempts = 3,
}) {
    function isOptionalNonnegativeSafeInteger(value) {
        return value == null || (Number.isSafeInteger(value) && value >= 0);
    }

    function buildRestoredHumanPlayers(gameStartPayload, reconnectingPlayerIndex, socketId) {
        const playerNames = Array.isArray(gameStartPayload?.playerNames) ? gameStartPayload.playerNames : [];
        const playerSettings = Array.isArray(gameStartPayload?.playerSettings) ? gameStartPayload.playerSettings : [];
        const reconnectTokenHashes = Array.isArray(gameStartPayload?.reconnectTokenHashes) ? gameStartPayload.reconnectTokenHashes : [];
        return playerNames
            .map((name, index) => {
                const setting = playerSettings[index];
                const reconnectTokenHash = reconnectTokenHashes[index];
                if (setting?.type === 'cpu' || !reconnectTokenHash) return null;
                return {
                    id: index === reconnectingPlayerIndex ? socketId : null,
                    index,
                    name,
                    reconnectToken: '',
                    reconnectTokenHash,
                };
            })
            .filter(Boolean);
    }

    function sanitizeClientStateSnapshot(stateSnapshot, playerCount) {
        if (!isPlainObject(stateSnapshot)) return null;
        const sanitized = Object.assign({}, stateSnapshot);
        if (sanitized.undoState != null &&
            !isValidUndoState(sanitized.undoState, playerCount, createCardByName)) {
            sanitized.undoState = null;
        }
        return sanitized;
    }

    function isValidGameStartPayload(payload, playerCount) {
        if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 10) return false;
        if (!Array.isArray(payload.playerNames) ||
            payload.playerNames.length !== playerCount ||
            payload.playerNames.some(name => typeof name !== 'string' || !name || sanitizeName(name) !== name)) return false;
        if (payload.playerSettings != null &&
            (!Array.isArray(payload.playerSettings) ||
            (payload.playerSettings.length !== 0 && payload.playerSettings.length !== playerCount))) return false;
        if (payload.playerOrder != null) {
            if (!Array.isArray(payload.playerOrder) || payload.playerOrder.length !== playerCount) return false;
            const sorted = [...payload.playerOrder].sort((a, b) => a - b);
            for (let i = 0; i < playerCount; i++) {
                if (sorted[i] !== i) return false;
            }
        }
        if (!Number.isInteger(payload.hostPlayerIndex) ||
            payload.hostPlayerIndex < 0 ||
            payload.hostPlayerIndex >= playerCount) return false;
        const knownCards = new Set(cards.map(card => card.name));
        if (payload.enabledCards != null &&
            (!Array.isArray(payload.enabledCards) || payload.enabledCards.some(name => !knownCards.has(name)))) return false;
        if (payload.marketRule != null && payload.marketRule !== 'standard' && payload.marketRule !== 'ten-type') return false;
        if (payload.marketSeed != null &&
            (!Number.isSafeInteger(payload.marketSeed) || payload.marketSeed < 0 || payload.marketSeed > 0xffffffff)) return false;
        if ((payload.marketRule === 'ten-type') !== (payload.marketSeed != null)) return false;
        const knownLandmarks = new Set(landmarkNames());
        if (payload.enabledLandmarks != null &&
            (!Array.isArray(payload.enabledLandmarks) ||
            payload.enabledLandmarks.length === 0 ||
            payload.enabledLandmarks.some(name => !knownLandmarks.has(name)))) return false;
        if (payload.gameSchema != null && !isValidGameSchemaMetadata(payload.gameSchema)) return false;
        if (payload.cpuSpeed != null &&
            (!Number.isInteger(payload.cpuSpeed) || payload.cpuSpeed < 0 || payload.cpuSpeed > 5000)) return false;
        for (const field of ['hostEpoch', 'actionSeq', 'gameGeneration', 'hostlessRestoreGeneration']) {
            if (!isOptionalNonnegativeSafeInteger(payload[field])) return false;
        }
        if (!isOptionalNonnegativeSafeInteger(payload.hostlessRestoreCount) ||
            (payload.hostlessRestoreCount != null &&
                payload.hostlessRestoreCount > maxHostlessRestoreAttempts)) return false;
        return true;
    }

    return {
        buildRestoredHumanPlayers,
        sanitizeClientStateSnapshot,
        isValidGameStartPayload,
    };
}

module.exports = makeRestoreValidation;
