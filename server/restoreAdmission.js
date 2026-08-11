'use strict';

function makeRestoreAdmission({
    isPlainObject,
    validateRestorePayloadLimits,
    isValidRoomId,
    hasOwnRoom,
    loadRoomCanonicalStateRecord,
    selectRestoreSource,
    validateRestoreAuditRecord,
    isVerifiedClientRestoreSnapshot,
    isValidGameStartPayload,
    hasInvalidOnlineRlModelSettings,
    normalizePlayerSettings,
    getExpectedReconnectTokenHash,
    hashReconnectToken,
    isValidRestoreReconnectTokenHashes,
    buildRestoredHumanPlayers,
    sanitizeRestoreActionLog,
    restoreAuditSecret,
    canReplaceRestoredRoom,
    isIncomingRestoreNewer,
    decideExistingRoomRestore,
}) {
    const dependencies = {
        isPlainObject,
        validateRestorePayloadLimits,
        isValidRoomId,
        hasOwnRoom,
        loadRoomCanonicalStateRecord,
        selectRestoreSource,
        validateRestoreAuditRecord,
        isVerifiedClientRestoreSnapshot,
        isValidGameStartPayload,
        hasInvalidOnlineRlModelSettings,
        normalizePlayerSettings,
        getExpectedReconnectTokenHash,
        hashReconnectToken,
        isValidRestoreReconnectTokenHashes,
        buildRestoredHumanPlayers,
    };
    for (const [name, dependency] of Object.entries(dependencies)) {
        if (typeof dependency !== 'function') throw new TypeError(`${name} must be a function`);
    }

    function reject(errorMessage, result) {
        return Object.freeze({ ok: false, errorMessage, result });
    }

    function planRestoreAdmission(payload = {}, options = {}) {
        const approvedHostless = options.approvedHostless === true;
        if (!isPlainObject(payload)) return reject('復元データが不完全です');
        if (!validateRestorePayloadLimits(payload).ok) return reject('復元データが大きすぎます');
        const { roomId, playerIndex, playerName, reconnectToken } = payload;
        if (!roomId || !payload.gameStartPayload || !reconnectToken) return reject('復元データが不完全です');
        if (!isValidRoomId(roomId)) return reject('復元データが不完全です');
        if (approvedHostless && hasOwnRoom(roomId)) {
            return reject('同じルームIDが既に使用されています', { ok: false, reason: 'room-exists' });
        }

        const loadedCanonicalRecord = approvedHostless ? null : loadRoomCanonicalStateRecord(roomId);
        const restoreSource = selectRestoreSource(payload, loadedCanonicalRecord, { approvedHostless });
        const { canonicalRecord, gameStartPayload, stateSnapshot, actionLog } = restoreSource;
        const restoreAuditValidation = approvedHostless
            ? { ok: true }
            : validateRestoreAuditRecord(payload.restoreAudit, { roomId });
        if (!restoreAuditValidation.ok) return reject('復元署名メタデータが無効です');
        const clientSnapshotTrusted = approvedHostless || !!canonicalRecord ||
            (stateSnapshot && isVerifiedClientRestoreSnapshot(roomId, gameStartPayload, stateSnapshot, payload.restoreAudit));

        return Object.freeze({
            ok: true,
            approvedHostless,
            roomId,
            playerIndex,
            playerName,
            reconnectToken,
            canonicalRecord,
            gameStartPayload,
            stateSnapshot,
            actionLog,
            clientSnapshotTrusted,
            replayStateSnapshot: clientSnapshotTrusted ? stateSnapshot : null,
        });
    }

    function planRestoreGameStartAdmission(gameStartPayload) {
        if (!Array.isArray(gameStartPayload.playerNames)) return reject('復元データが不完全です');
        const playerNames = gameStartPayload.playerNames;
        if (!isValidGameStartPayload(gameStartPayload, playerNames.length)) {
            return reject('復元データが不完全です');
        }
        if (hasInvalidOnlineRlModelSettings(gameStartPayload.playerSettings)) {
            return reject('RLモデルIDが無効です');
        }
        return Object.freeze({
            ok: true,
            playerNames,
            playerSettings: normalizePlayerSettings(gameStartPayload.playerSettings, playerNames.length),
        });
    }

    function planRestoreIdentityAdmission(input) {
        const {
            gameStartPayload,
            playerNames,
            playerIndex,
            playerName,
            reconnectToken,
            approvedHostless,
            socketId,
        } = input;
        if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= playerNames.length) {
            return reject('復元データが不完全です');
        }
        const expectedReconnectTokenHash = getExpectedReconnectTokenHash(
            { players: [], gameStartPayload },
            playerIndex,
            playerName
        );
        if (!expectedReconnectTokenHash || hashReconnectToken(reconnectToken) !== expectedReconnectTokenHash) {
            return reject('INVALID_TOKEN');
        }
        if (!approvedHostless &&
            (!Number.isInteger(gameStartPayload.hostPlayerIndex) || gameStartPayload.hostPlayerIndex !== playerIndex)) {
            return reject('復元は元のホストのみ実行できます');
        }
        if (!isValidRestoreReconnectTokenHashes(gameStartPayload)) {
            return reject('復元データが不完全です');
        }
        return Object.freeze({
            ok: true,
            restoredPlayers: buildRestoredHumanPlayers(gameStartPayload, playerIndex, socketId),
        });
    }

    function planExistingRoomRestoreAdmission(input = {}) {
        const {
            room,
            roomId,
            playerIndex,
            playerName,
            reconnectToken,
            actionLog,
            replayStateSnapshot,
            canonicalRecord,
            gameStartPayload,
            clientSnapshotTrusted,
        } = input;
        if (!room.started) return reject('同じルームIDが既に使用されています');
        const existingReconnectTokenHash = getExpectedReconnectTokenHash(
            room,
            playerIndex,
            playerName
        );
        if (!Number.isInteger(playerIndex) || !existingReconnectTokenHash ||
                hashReconnectToken(reconnectToken) !== existingReconnectTokenHash) {
            return reject('INVALID_TOKEN');
        }
        const existingHostRestoreAuthenticated = room.hostPlayerIndex === playerIndex;
        const rawSanitizedActionLog = sanitizeRestoreActionLog(
            actionLog,
            roomId,
            replayStateSnapshot,
            { requireSignedActionAudit: !!restoreAuditSecret() && !canonicalRecord }
        );
        const sanitizedActionLog = rawSanitizedActionLog || [];
        const incomingRestoreLogValid = rawSanitizedActionLog !== null;
        const incomingCanReplace = incomingRestoreLogValid &&
            isValidGameStartPayload(
                gameStartPayload,
                Array.isArray(gameStartPayload.playerNames) ? gameStartPayload.playerNames.length : 0
            ) &&
            !hasInvalidOnlineRlModelSettings(gameStartPayload.playerSettings) &&
            existingHostRestoreAuthenticated &&
            clientSnapshotTrusted &&
            canReplaceRestoredRoom(
                room,
                playerIndex,
                gameStartPayload,
                replayStateSnapshot,
                sanitizedActionLog
            );
        const incomingRestoreNewer = !incomingCanReplace && existingHostRestoreAuthenticated &&
            isIncomingRestoreNewer(
                room,
                gameStartPayload,
                replayStateSnapshot,
                sanitizedActionLog
            );
        const decision = decideExistingRoomRestore({
            incomingCanReplace,
            existingHostRestoreAuthenticated: !!existingHostRestoreAuthenticated,
            incomingRestoreNewer: !!incomingRestoreNewer,
        });
        if (decision.action === 'replace') {
            return Object.freeze({ ok: true, action: 'replace' });
        }
        if (decision.action === 'reject') {
            return reject('復元データが壊れています');
        }
        return Object.freeze({ ok: true, action: 'rejoin' });
    }

    return Object.freeze({
        planRestoreAdmission,
        planRestoreGameStartAdmission,
        planRestoreIdentityAdmission,
        planExistingRoomRestoreAdmission,
    });
}

module.exports = makeRestoreAdmission;
