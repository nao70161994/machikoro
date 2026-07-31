'use strict';

function selectRestoreSource(payload = {}, canonicalRecord = null, options = {}) {
    const effectiveCanonicalRecord = options.approvedHostless === true ? null : canonicalRecord;
    if (!effectiveCanonicalRecord) {
        return Object.freeze({
            canonicalRecord: null,
            gameStartPayload: payload.gameStartPayload,
            stateSnapshot: payload.stateSnapshot,
            actionLog: payload.actionLog,
        });
    }
    return Object.freeze({
        canonicalRecord: effectiveCanonicalRecord,
        gameStartPayload: effectiveCanonicalRecord.gameStartPayload || payload.gameStartPayload,
        stateSnapshot: effectiveCanonicalRecord.stateSnapshot || null,
        actionLog: Array.isArray(effectiveCanonicalRecord.actionLog)
            ? effectiveCanonicalRecord.actionLog
            : [],
    });
}

function decideExistingRoomRestore(input = {}) {
    if (input.incomingCanReplace === true) {
        return Object.freeze({ action: 'replace', reason: '' });
    }
    if (input.existingHostRestoreAuthenticated === true && input.incomingRestoreNewer === true) {
        return Object.freeze({ action: 'reject', reason: 'corrupt-newer-restore' });
    }
    return Object.freeze({ action: 'rejoin', reason: '' });
}

module.exports = Object.freeze({
    selectRestoreSource,
    decideExistingRoomRestore,
});
