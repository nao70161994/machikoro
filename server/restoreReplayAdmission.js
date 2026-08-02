'use strict';

function makeRestoreReplayAdmission({
    sanitizeRestoreActionLog,
    restoreAuditSecret,
    restorePayloadRank,
}) {
    const dependencies = {
        sanitizeRestoreActionLog,
        restoreAuditSecret,
        restorePayloadRank,
    };
    for (const [name, dependency] of Object.entries(dependencies)) {
        if (typeof dependency !== 'function') throw new TypeError(`${name} must be a function`);
    }

    function reject() {
        return Object.freeze({
            ok: false,
            errorMessage: '復元データが壊れています',
        });
    }

    function planRestoreReplayAdmission(input) {
        const {
            actionLog,
            roomId,
            replayStateSnapshot,
            canonicalRecord,
            clientSnapshotTrusted,
            stateSnapshot,
            gameStartPayload,
        } = input;
        const sanitizedActionLog = sanitizeRestoreActionLog(actionLog, roomId, replayStateSnapshot, {
            requireSignedActionAudit: !!restoreAuditSecret() && !canonicalRecord,
        });
        if (!sanitizedActionLog) return reject();
        if (!canonicalRecord && !clientSnapshotTrusted && sanitizedActionLog.length === 0) return reject();
        if (!canonicalRecord && !stateSnapshot && sanitizedActionLog.length === 0) return reject();

        const restoredRank = canonicalRecord
            ? {
                hostEpoch: Number.isInteger(canonicalRecord.hostEpoch) ? canonicalRecord.hostEpoch : 0,
                actionSeq: Number.isInteger(canonicalRecord.actionSeq)
                    ? canonicalRecord.actionSeq
                    : restorePayloadRank(gameStartPayload, replayStateSnapshot, sanitizedActionLog).actionSeq,
            }
            : restorePayloadRank(gameStartPayload, replayStateSnapshot, sanitizedActionLog);
        return Object.freeze({
            ok: true,
            sanitizedActionLog,
            restoredRank,
        });
    }

    return Object.freeze({ planRestoreReplayAdmission });
}

module.exports = makeRestoreReplayAdmission;
