'use strict';

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(name + ' must be a function');
    return value;
}

/**
 * Creates privacy-safe hostless restore diagnostic projections.
 * @param {{hashRoomId?: function(string): string}=} dependencies
 * @returns {{
 *   hostlessRestoreRoomLogId: function(unknown): string,
 *   hostlessRestoreDiagnostic: function(Object=): Object
 * }}
 */
function makeHostlessRestoreDiagnostics(dependencies = {}) {
    const hashRoomId = requireFunction(dependencies.hashRoomId, 'hashRoomId');

    function hostlessRestoreRoomLogId(roomId) {
        if (typeof roomId !== 'string' || !roomId) return '-';
        return String(hashRoomId(roomId)).slice(0, 12);
    }

    function hostlessRestoreDiagnostic(event = {}) {
        const rank = event.rank && typeof event.rank === 'object'
            ? {
                hostEpoch: Number.isInteger(event.rank.hostEpoch) ? event.rank.hostEpoch : 0,
                actionSeq: Number.isInteger(event.rank.actionSeq) ? event.rank.actionSeq : 0,
            }
            : null;
        return Object.freeze({
            event: typeof event.type === 'string' ? event.type : 'unknown',
            roomHash: hostlessRestoreRoomLogId(event.roomId),
            generation: Number.isInteger(event.generation) ? event.generation : 0,
            stage: typeof event.stage === 'string' ? event.stage : '',
            candidateCount: Number.isInteger(event.candidateCount) ? event.candidateCount : 0,
            rank,
            reason: typeof event.reason === 'string' ? event.reason : '',
        });
    }

    return Object.freeze({
        hostlessRestoreRoomLogId,
        hostlessRestoreDiagnostic,
    });
}

module.exports = makeHostlessRestoreDiagnostics;
