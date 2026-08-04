'use strict';

const OnlineActionSequence = Object.freeze({
    createController: createOnlineActionSequenceController,
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


function createOnlineActionSequenceController(initialValue = 0) {
    let memorySeq = Number.isInteger(initialValue) ? initialValue : 0;

    function snapshot() {
        return memorySeq;
    }

    function reset() {
        memorySeq = 0;
        return memorySeq;
    }

    function replace(value) {
        memorySeq = Number.isInteger(value) ? value : 0;
        return memorySeq;
    }

    function adopt(value) {
        if (Number.isInteger(value)) memorySeq = Math.max(memorySeq, value);
        return memorySeq;
    }

    function current(gameStartPayload, stateSnapshot, actionLog) {
        return OnlineActionSequence.current(
            memorySeq,
            gameStartPayload,
            stateSnapshot,
            actionLog
        );
    }

    function refreshLastApplied(stateSnapshot, actionLog) {
        memorySeq = OnlineActionSequence.lastApplied(memorySeq, stateSnapshot, actionLog);
        return memorySeq;
    }

    return Object.freeze({
        snapshot,
        reset,
        replace,
        adopt,
        current,
        refreshLastApplied,
    });
}


if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineActionSequence };
}
