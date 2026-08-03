'use strict';

const OnlineActionSequence = Object.freeze({
    maxLogSeq(actionLog, initialValue = 0) {
        return (actionLog || []).reduce(
            (max, entry) => Number.isInteger(entry && entry.seq) ? Math.max(max, entry.seq) : max,
            initialValue
        );
    },

    current(memorySeq, gameStartPayload, stateSnapshot, actionLog) {
        return Math.max(
            memorySeq,
            Number.isInteger(gameStartPayload && gameStartPayload.actionSeq)
                ? gameStartPayload.actionSeq
                : 0,
            Number.isInteger(stateSnapshot && stateSnapshot.actionSeq)
                ? stateSnapshot.actionSeq
                : 0,
            OnlineActionSequence.maxLogSeq(actionLog)
        );
    },

    lastApplied(memorySeq, stateSnapshot, actionLog) {
        const snapshotSeq = Number.isInteger(stateSnapshot && stateSnapshot.actionSeq)
            ? stateSnapshot.actionSeq
            : 0;
        return Math.max(
            memorySeq,
            OnlineActionSequence.maxLogSeq(actionLog, snapshotSeq)
        );
    },

    next(currentSeq) {
        return currentSeq + 1;
    },
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineActionSequence };
}
