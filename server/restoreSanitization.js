'use strict';

module.exports = function makeRestoreSanitization(options = {}) {
    const {
        isPlainObject,
        gameActionRegistry,
        canonicalizeActionData,
        normalizeClientActionId,
        validateRestoreAuditRecord,
        isVerifiedRestoreActionAudit,
    } = options;

    function restoreSnapshotActionSeq(stateSnapshot) {
        return isPlainObject(stateSnapshot) &&
            Number.isInteger(stateSnapshot.actionSeq) &&
            stateSnapshot.actionSeq >= 0
            ? stateSnapshot.actionSeq
            : 0;
    }

    function sanitizeRestoreActionLogEntry(entry, roomId, snapshotSeq) {
        if (!entry || typeof entry.action !== 'string') return { skip: true };
        if (typeof entry.roomId === 'string' && entry.roomId !== roomId) return { invalid: true };
        if (Number.isInteger(entry.seq)) {
            if (entry.seq <= snapshotSeq) return { skip: true };
        } else if (snapshotSeq > 0) {
            return { skip: true };
        }
        if (!gameActionRegistry[entry.action]) return { invalid: true };
        const normalized = {
            action: entry.action,
            data: canonicalizeActionData(entry.action, entry.data || {}),
        };
        if (Number.isInteger(entry.playerIndex)) normalized.playerIndex = entry.playerIndex;
        if (Number.isInteger(entry.seq)) normalized.seq = entry.seq;
        const safeClientActionId = normalizeClientActionId(entry.clientActionId);
        if (safeClientActionId) normalized.clientActionId = safeClientActionId;
        const auditValidation = validateRestoreAuditRecord(entry.restoreActionAudit, { roomId });
        if (!auditValidation.ok) return { invalid: true };
        if (auditValidation.record && auditValidation.record.signed) {
            normalized.restoreActionAudit = auditValidation.record;
        }
        return { entry: normalized };
    }

    function sanitizeRestoreActionLog(actionLog, roomId, stateSnapshot, options = {}) {
        if (!Array.isArray(actionLog)) return [];
        const snapshotSeq = restoreSnapshotActionSeq(stateSnapshot);
        const requireSignedActionAudit = options.requireSignedActionAudit === true;
        let lastSeq = snapshotSeq;
        const sanitized = [];
        for (const entry of actionLog) {
            const result = sanitizeRestoreActionLogEntry(entry, roomId, snapshotSeq);
            if (result.invalid) return null;
            if (!result.entry) continue;
            if (!Number.isInteger(result.entry.seq) || result.entry.seq !== lastSeq + 1) return null;
            if (requireSignedActionAudit && !isVerifiedRestoreActionAudit(roomId, result.entry)) return null;
            lastSeq = result.entry.seq;
            sanitized.push(result.entry);
        }
        return sanitized;
    }

    return Object.freeze({ restoreSnapshotActionSeq, sanitizeRestoreActionLogEntry, sanitizeRestoreActionLog });
};
