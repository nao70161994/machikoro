'use strict';

const OnlineRestoreRank = Object.freeze({
    serverActionSeq(gameStartPayload, stateSnapshot, actionLog) {
        const logSeq = (actionLog || []).reduce(
            (max, entry) => Number.isInteger(entry.seq) ? Math.max(max, entry.seq) : max,
            0
        );
        return Math.max(
            Number.isInteger(gameStartPayload && gameStartPayload.actionSeq)
                ? gameStartPayload.actionSeq
                : 0,
            Number.isInteger(stateSnapshot && stateSnapshot.actionSeq)
                ? stateSnapshot.actionSeq
                : 0,
            logSeq
        );
    },

    isRankAction(entry, actionRegistry) {
        return !!(entry &&
            typeof entry.action === 'string' &&
            actionRegistry &&
            actionRegistry[entry.action]);
    },

    replaySeq(stateSnapshot, actionLog, actionRegistry) {
        const snapshotSeq = Number.isInteger(stateSnapshot && stateSnapshot.actionSeq)
            ? stateSnapshot.actionSeq
            : 0;
        const replayedActionCount = Array.isArray(actionLog)
            ? actionLog.filter(entry => OnlineRestoreRank.isRankAction(entry, actionRegistry)).length
            : 0;
        return snapshotSeq + replayedActionCount;
    },

    build(gameStartPayload, stateSnapshot, actionLog, actionRegistry) {
        return {
            hostEpoch: Number.isInteger(gameStartPayload && gameStartPayload.hostEpoch)
                ? gameStartPayload.hostEpoch
                : 0,
            actionSeq: OnlineRestoreRank.replaySeq(
                stateSnapshot || null,
                actionLog || [],
                actionRegistry
            ),
        };
    },

    isNewer(localRank, serverRank) {
        return localRank.hostEpoch > serverRank.hostEpoch ||
            (localRank.hostEpoch === serverRank.hostEpoch &&
                localRank.actionSeq > serverRank.actionSeq);
    },
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineRestoreRank };
}
