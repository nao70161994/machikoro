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

    return Object.freeze({ planRestoreAdmission, planRestoreGameStartAdmission });
}

module.exports = makeRestoreAdmission;
