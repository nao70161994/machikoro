'use strict';

const onlineRankRestoreMetadata = /** @type {any} */ (globalThis).OnlineRestoreMetadata;

const LOCAL_HOST_RESTORE_OFFER_REASONS = Object.freeze({
    NOT_ORIGINAL_HOST_BUNDLE: 'not-original-host-bundle',
    SERVER_HOST_AUTHORITY: 'server-host-authority',
    NOT_NEWER: 'not-newer',
    OFFER_NEWER_BUNDLE: 'offer-newer-bundle',
});

function planLocalHostRestoreOffer(
    localBundle,
    originalPlayerIndex,
    serverHostPlayerIndex,
    localRank,
    serverRank
) {
    /** @type {string} */
    let reason = LOCAL_HOST_RESTORE_OFFER_REASONS.NOT_ORIGINAL_HOST_BUNDLE;
    const ownsOriginalHostBundle = !!localBundle &&
        localBundle.gameStartPayload?.hostPlayerIndex === originalPlayerIndex;
    if (ownsOriginalHostBundle) {
        const canOffer = serverHostPlayerIndex === originalPlayerIndex ||
            localRank.hostEpoch > serverRank.hostEpoch;
        if (!canOffer) {
            reason = LOCAL_HOST_RESTORE_OFFER_REASONS.SERVER_HOST_AUTHORITY;
        } else if (!OnlineRestoreRank.isNewer(localRank, serverRank)) {
            reason = LOCAL_HOST_RESTORE_OFFER_REASONS.NOT_NEWER;
        } else {
            reason = LOCAL_HOST_RESTORE_OFFER_REASONS.OFFER_NEWER_BUNDLE;
        }
    }
    const offer = reason === LOCAL_HOST_RESTORE_OFFER_REASONS.OFFER_NEWER_BUNDLE;
    return Object.freeze({
        offer,
        bundle: offer ? localBundle : null,
        reason,
    });
}

function localHostRestoreOfferPlansMatch(planned, legacy) {
    return !!planned && !!legacy && planned.offer === legacy.offer &&
        planned.bundle === legacy.bundle && planned.reason === legacy.reason;
}

function selectLocalHostRestoreOfferPlan(
    localBundle,
    originalPlayerIndex,
    serverHostPlayerIndex,
    localRank,
    serverRank,
    legacyPlan,
    options = {}
) {
    const purePlan = planLocalHostRestoreOffer(
        localBundle,
        originalPlayerIndex,
        serverHostPlayerIndex,
        localRank,
        serverRank
    );
    const matched = localHostRestoreOfferPlansMatch(purePlan, legacyPlan);
    const enabled = options.authorityEnabled === true;
    const usePure = enabled && matched;
    return Object.freeze({
        plan: usePure ? purePlan : legacyPlan,
        source: usePure ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        matched,
        fallbackReason: matched ? '' : 'local-host-restore-offer-plan-mismatch',
    });
}

const OnlineRestoreRank = Object.freeze({
    serverActionSeq(gameStartPayload, stateSnapshot, actionLog) {
        const logSeq = (actionLog || []).reduce(
            (max, entry) => onlineRankRestoreMetadata.isNonnegativeSafeInteger(entry?.seq)
                ? Math.max(max, entry.seq)
                : max,
            0
        );
        return Math.max(
            onlineRankRestoreMetadata.normalizeCounter(gameStartPayload?.actionSeq),
            onlineRankRestoreMetadata.normalizeCounter(stateSnapshot?.actionSeq),
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
        const snapshotSeq = onlineRankRestoreMetadata.normalizeCounter(stateSnapshot?.actionSeq);
        const replayedActionCount = Array.isArray(actionLog)
            ? actionLog.filter(entry => OnlineRestoreRank.isRankAction(entry, actionRegistry)).length
            : 0;
        return onlineRankRestoreMetadata.addProgress(snapshotSeq, replayedActionCount);
    },

    build(gameStartPayload, stateSnapshot, actionLog, actionRegistry) {
        return {
            hostEpoch: onlineRankRestoreMetadata.normalizeCounter(gameStartPayload?.hostEpoch),
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

    localHostRestoreOfferReasons: LOCAL_HOST_RESTORE_OFFER_REASONS,
    planLocalHostRestoreOffer,
    selectLocalHostRestoreOfferPlan,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineRestoreRank };
}
