'use strict';

const ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION = 1;
const onlinePayloadRestoreMetadata = /** @type {any} */ (globalThis).OnlineRestoreMetadata ||
    (typeof require === 'function' ? require('./onlineRestoreMetadata') : null);
const ONLINE_HOSTLESS_RESTORE_MAX_ATTEMPTS = onlinePayloadRestoreMetadata.hostlessRestoreMaxAttempts;
const ONLINE_HOSTLESS_RESTORE_EVENTS = Object.freeze({
    REQUEST: 'requestHostlessRestore',
    COLLECT: 'hostlessRestoreCollect',
    CANDIDATE: 'submitHostlessRestoreCandidate',
    CONFIRMATION: 'hostlessRestoreConfirmation',
    CONFIRM: 'confirmHostlessRestore',
    STATUS: 'hostlessRestoreStatus',
    APPROVED: 'hostlessRestoreApproved',
});
const ONLINE_HOSTLESS_RESTORE_STATUS_MESSAGES = Object.freeze({
    disabled: 'このサーバーでは参加者データからの復元が一時停止されています。',
    'unsupported-client': '旧バージョンの参加者が含まれるため、元のホストによる復元を待ちます。',
    'original-host': '元のホストによる通常復元を続けます。',
    'host-restored': '元のホストが復元しました。再接続します。',
    'generation-mismatch': '復元候補の世代が一致しません。保存データを残して再試行してください。',
    'insufficient-candidates': '一致確認に必要な参加者が足りません。保存データを残して再試行してください。',
    'candidate-mismatch': '参加者間の復元候補が一致しません。多数決では復元しません。',
    'completed-game': 'この対局は完了済みのため復元しません。',
    'attempt-limit': '参加者データからの復元回数が上限に達しました。',
    'confirmation-exhausted': '復元を承認できる参加者がいませんでした。',
    'retention-timeout': '復元候補の確認時間を超過しました。',
    'restore-failed': '参加者データからの復元に失敗しました。',
});

function hostlessHumanIndices(gameStartPayload) {
    const names = Array.isArray(gameStartPayload?.playerNames) ? gameStartPayload.playerNames : [];
    const settings = Array.isArray(gameStartPayload?.playerSettings) ? gameStartPayload.playerSettings : [];
    if (settings.length === 0) return names.map((_, index) => index);
    return names.map((_, index) => settings[index]?.type === 'cpu' ? null : index).filter(Number.isInteger);
}

function supportsHostlessRestore(bundle, identity) {
    const gameStartPayload = bundle?.gameStartPayload;
    const capabilities = gameStartPayload?.hostlessRestoreCapabilities;
    if (!gameStartPayload || !Array.isArray(capabilities) ||
            capabilities.length !== gameStartPayload.playerNames?.length) return false;
    if (!Number.isInteger(identity?.playerIndex) ||
            identity.playerIndex === gameStartPayload.hostPlayerIndex) return false;
    const generation = gameStartPayload.hostlessRestoreGeneration;
    const attemptCount = gameStartPayload.hostlessRestoreCount;
    if (generation != null && !onlinePayloadRestoreMetadata.isNonnegativeSafeInteger(generation)) return false;
    if (attemptCount != null &&
            (!onlinePayloadRestoreMetadata.isNonnegativeSafeInteger(attemptCount) ||
            attemptCount > ONLINE_HOSTLESS_RESTORE_MAX_ATTEMPTS)) return false;
    if (onlinePayloadRestoreMetadata.normalizeCounter(
        attemptCount,
        ONLINE_HOSTLESS_RESTORE_MAX_ATTEMPTS
    ) >= ONLINE_HOSTLESS_RESTORE_MAX_ATTEMPTS) return false;
    return hostlessHumanIndices(gameStartPayload)
        .every(index => capabilities[index] === ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION);
}

function hostlessIdentityFields(bundle, identity) {
    return {
        roomId: identity.roomId,
        gameStartPayload: bundle.gameStartPayload,
        playerIndex: identity.playerIndex,
        playerName: identity.playerName,
        reconnectToken: identity.reconnectToken,
        capabilityVersion: ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION,
    };
}

function normalizeOnlineSession(session) {
    if (!session || typeof session !== 'object') return null;
    const roomId = typeof session.roomId === 'string' ? session.roomId.trim().toUpperCase() : '';
    const playerName = typeof session.playerName === 'string' ? session.playerName.trim() : '';
    const reconnectToken = typeof session.reconnectToken === 'string' ? session.reconnectToken.trim() : '';
    if (
        roomId === '' ||
        !Number.isInteger(session.playerIndex) ||
        session.playerIndex < 0 ||
        playerName === '' ||
        reconnectToken === ''
    ) {
        return null;
    }
    return Object.assign({}, session, { roomId, playerName, reconnectToken });
}

function normalizeOnlineActionLog(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(entry => entry && typeof entry.action === 'string')
        .map(entry => {
            const normalized = { action: entry.action, data: entry.data || {} };
            if (Number.isInteger(entry.playerIndex)) normalized.playerIndex = entry.playerIndex;
            if (Number.isInteger(entry.seq)) normalized.seq = entry.seq;
            if (typeof entry.clientActionId === 'string') normalized.clientActionId = entry.clientActionId;
            if (entry.restoreActionAudit && typeof entry.restoreActionAudit === 'object') normalized.restoreActionAudit = entry.restoreActionAudit;
            return normalized;
        });
}

function buildPendingOutboundAction(action, data, playerIndex, roomId, seq, clientActionId) {
    return { action, data, playerIndex, roomId, seq, clientActionId };
}

function normalizePendingOutboundAction(entry, options = {}) {
    const isKnownAction = options.isKnownAction || (() => false);
    const normalizeRoomId = options.normalizeRoomId || (() => '');
    if (!entry || !isKnownAction(entry.action)) return null;
    const normalized = { action: entry.action, data: entry.data || {} };
    if (Number.isInteger(entry.playerIndex)) normalized.playerIndex = entry.playerIndex;
    const normalizedRoomId = normalizeRoomId(entry.roomId);
    if (normalizedRoomId) normalized.roomId = normalizedRoomId;
    if (Number.isInteger(entry.seq)) normalized.seq = entry.seq;
    if (typeof entry.clientActionId === 'string') normalized.clientActionId = entry.clientActionId;
    return normalized;
}

function pendingBelongsToSession(entry, currentRoomId, options = {}) {
    if (!entry) return true;
    const normalizeRoomId = options.normalizeRoomId || (() => '');
    const normalizedCurrentRoomId = normalizeRoomId(currentRoomId);
    const entryRoomId = normalizeRoomId(entry.roomId);
    if (!entryRoomId) {
        if (options.requireExplicitRoomId) return false;
        return !options.requireRoomId || !normalizedCurrentRoomId || Number.isInteger(entry.seq);
    }
    if (!normalizedCurrentRoomId) return false;
    return entryRoomId === normalizedCurrentRoomId;
}

function appendPendingForRestore(actionLog, pending, options = {}) {
    if (!pending) return actionLog;
    if (!pendingBelongsToSession(pending, options.currentRoomId, {
        normalizeRoomId: options.normalizeRoomId,
        requireRoomId: true,
    })) return actionLog;
    if (!actionLog.some(entry => sameOnlineActionEntry(entry, pending))) {
        actionLog.push(pending);
    }
    return actionLog;
}

function canResendPendingOutboundAction(pending, state = {}) {
    if (!pendingBelongsToSession(pending, state.currentRoomId, {
        normalizeRoomId: state.normalizeRoomId,
        requireRoomId: true,
    })) return false;
    const game = state.game;
    if (!pending || !game || !Number.isInteger(state.originalPlayerIndex)) return false;
    if (Number.isInteger(pending.playerIndex) && pending.playerIndex >= 0 &&
            pending.playerIndex !== state.originalPlayerIndex) return false;
    if (!Number.isInteger(state.playerIndex) || state.playerIndex < 0) return false;
    const currentIndex = game.currentPlayerIndex;
    if (!Number.isInteger(currentIndex) || currentIndex < 0 ||
            !Array.isArray(game.players) || currentIndex >= game.players.length) return false;
    if (Array.isArray(state.cpuPlayers) && state.cpuPlayers[currentIndex]) return !!state.isRoomHost;
    return currentIndex === state.playerIndex;
}

const INCOMING_GAME_ACTION_DECISIONS = Object.freeze({
    NO_GAME: 'no-game',
    DUPLICATE: 'duplicate',
    GAP: 'gap',
    APPLY: 'apply',
});

function planIncomingGameAction(hasGame, seq, lastAppliedSeq) {
    /** @type {string} */
    let decision = INCOMING_GAME_ACTION_DECISIONS.APPLY;
    if (hasGame !== true) {
        decision = INCOMING_GAME_ACTION_DECISIONS.NO_GAME;
    } else if (Number.isInteger(seq) && seq <= lastAppliedSeq) {
        decision = INCOMING_GAME_ACTION_DECISIONS.DUPLICATE;
    } else if (Number.isInteger(seq) && seq !== lastAppliedSeq + 1) {
        decision = INCOMING_GAME_ACTION_DECISIONS.GAP;
    }
    return Object.freeze({ decision });
}

function selectIncomingGameActionPlan(hasGame, seq, lastAppliedSeq, legacyPlan, options = {}) {
    const purePlan = planIncomingGameAction(hasGame, seq, lastAppliedSeq);
    const matched = !!legacyPlan && purePlan.decision === legacyPlan.decision;
    const enabled = options.authorityEnabled === true;
    const usePure = enabled && matched;
    return Object.freeze({
        plan: usePure ? purePlan : legacyPlan,
        source: usePure ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        matched,
        fallbackReason: matched ? '' : 'incoming-action-plan-mismatch',
    });
}

function planOnlineRestoreAbort(generation, currentGeneration, statusMessage, queuedEvents = null) {
    return Object.freeze({
        abort: generation === currentGeneration,
        statusMessage,
        queuedEvents: Array.isArray(queuedEvents) ? queuedEvents : [],
    });
}

function restoreAbortPlansMatch(planned, legacy) {
    return !!planned && !!legacy && planned.abort === legacy.abort &&
        planned.statusMessage === legacy.statusMessage &&
        planned.queuedEvents === legacy.queuedEvents;
}

function selectOnlineRestoreAbortPlan(
    generation,
    currentGeneration,
    statusMessage,
    queuedEvents,
    legacyPlan,
    options = {}
) {
    const planned = planOnlineRestoreAbort(
        generation,
        currentGeneration,
        statusMessage,
        queuedEvents
    );
    const matched = restoreAbortPlansMatch(planned, legacyPlan);
    const enabled = options.abortPlanAuthorityEnabled === true;
    const usePure = enabled && matched;
    return Object.freeze({
        plan: usePure ? planned : legacyPlan,
        source: usePure ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        matched,
        fallbackReason: matched ? '' : 'abort-plan-mismatch',
    });
}

function planOnlineRestoreEventFlush(queue, generation, restoredThroughSeq) {
    const events = Array.isArray(queue) ? queue : [];
    const plan = [];
    for (let index = 0; index < events.length; index++) {
        const event = events[index];
        if (!event || event.generation !== generation) continue;
        if (Number.isInteger(event.payload?.seq) && event.payload.seq <= restoredThroughSeq) continue;
        plan.push(Object.freeze({ event, index }));
    }
    return Object.freeze(plan);
}

function restoreEventFlushPlansMatch(planned, legacy) {
    if (!Array.isArray(planned) || !Array.isArray(legacy) || planned.length !== legacy.length) return false;
    return planned.every((entry, index) =>
        Number.isInteger(entry?.index) && entry.index === legacy[index]?.index &&
        entry.event === legacy[index]?.event
    );
}

function selectOnlineRestoreEventFlushPlan(queue, generation, restoredThroughSeq, legacyPlan, options = {}) {
    const planned = planOnlineRestoreEventFlush(queue, generation, restoredThroughSeq);
    const legacy = Object.freeze((Array.isArray(legacyPlan) ? legacyPlan : []).map(entry =>
        Object.freeze({ event: entry?.event, index: entry?.index })
    ));
    const matched = restoreEventFlushPlansMatch(planned, legacy);
    const enabled = options.queuePlanAuthorityEnabled === true;
    const usePurePlan = enabled && matched;
    return Object.freeze({
        plan: usePurePlan ? planned : legacy,
        source: usePurePlan ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        matched,
        fallbackReason: matched ? '' : 'plan-mismatch',
    });
}

function sameOnlineActionEntry(a, b) {
    if (!a || !b) return false;
    if (a.clientActionId || b.clientActionId) return a.clientActionId === b.clientActionId;
    return a.action === b.action &&
        a.playerIndex === b.playerIndex &&
        JSON.stringify(a.data || {}) === JSON.stringify(b.data || {});
}

function acceptedClientActionMatchesPending(ref, pending) {
    return !!(ref && pending && typeof ref.clientActionId === 'string' &&
        ref.clientActionId === pending.clientActionId &&
        Number.isInteger(ref.playerIndex) && ref.playerIndex === pending.playerIndex);
}

const PENDING_RECONCILIATION_REASONS = Object.freeze({
    NO_PENDING: 'no-pending',
    REPLAY_LOG: 'replay-log',
    SNAPSHOT_COMPACTED: 'snapshot-compacted',
    ACCEPTED_CLIENT_ACTION: 'accepted-client-action',
    UNACCEPTED: 'unaccepted',
});

function planPendingReconciliation(pending, replayActionLog, stateSnapshot, acceptedClientActions) {
    /** @type {string} */
    let reason = PENDING_RECONCILIATION_REASONS.UNACCEPTED;
    if (!pending) {
        reason = PENDING_RECONCILIATION_REASONS.NO_PENDING;
    } else if (Array.isArray(replayActionLog) &&
            replayActionLog.some(entry => sameOnlineActionEntry(entry, pending))) {
        reason = PENDING_RECONCILIATION_REASONS.REPLAY_LOG;
    } else if (typeof pending.clientActionId !== 'string' &&
            Number.isInteger(pending.seq) &&
            Number.isInteger(stateSnapshot?.actionSeq) &&
            stateSnapshot.actionSeq >= pending.seq) {
        reason = PENDING_RECONCILIATION_REASONS.SNAPSHOT_COMPACTED;
    } else if (Array.isArray(acceptedClientActions) &&
            acceptedClientActions.some(ref => acceptedClientActionMatchesPending(ref, pending))) {
        reason = PENDING_RECONCILIATION_REASONS.ACCEPTED_CLIENT_ACTION;
    }
    return Object.freeze({
        accepted: reason !== PENDING_RECONCILIATION_REASONS.UNACCEPTED,
        reason,
    });
}

function pendingReconciliationPlansMatch(planned, legacy) {
    return !!planned && !!legacy && planned.accepted === legacy.accepted &&
        planned.reason === legacy.reason;
}

function selectPendingReconciliationPlan(
    pending,
    replayActionLog,
    stateSnapshot,
    acceptedClientActions,
    legacyPlan,
    options = {}
) {
    const purePlan = planPendingReconciliation(
        pending,
        replayActionLog,
        stateSnapshot,
        acceptedClientActions
    );
    const matched = pendingReconciliationPlansMatch(purePlan, legacyPlan);
    const enabled = options.authorityEnabled === true;
    const usePure = enabled && matched;
    return Object.freeze({
        plan: usePure ? purePlan : legacyPlan,
        source: usePure ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        matched,
        fallbackReason: matched ? '' : 'pending-reconciliation-plan-mismatch',
    });
}

const REJOIN_ACTION_LOG_REASONS = Object.freeze({
    STORED_UNSIGNED_FULL_LOG: 'stored-unsigned-full-log',
    SERVER_UNSIGNED_FULL_LOG: 'server-unsigned-full-log',
    MERGED_UNSIGNED_FULL_LOG: 'merged-unsigned-full-log',
    INCOMPLETE_UNSIGNED_HISTORY: 'incomplete-unsigned-history',
    SERVER_REPLAY_LOG: 'server-replay-log',
});

function continuousActionLogThrough(actionLog, targetSeq) {
    if (!Array.isArray(actionLog) || targetSeq < 1 || actionLog.length !== targetSeq) return false;
    return actionLog.every((entry, index) => entry && entry.seq === index + 1);
}

function continuousActionLogPrefix(actionLog, targetSeq) {
    return Array.isArray(actionLog) && actionLog.length > 0 && actionLog.length < targetSeq &&
        actionLog.every((entry, index) => entry && entry.seq === index + 1);
}

function mergeContinuousActionLogs(actionLogs, targetSeq) {
    if (targetSeq < 1) return null;
    const bySeq = new Map();
    for (const actionLog of actionLogs) {
        if (!Array.isArray(actionLog)) continue;
        for (const entry of actionLog) {
            if (entry && Number.isInteger(entry.seq) && entry.seq > 0 && entry.seq <= targetSeq) {
                bySeq.set(entry.seq, entry);
            }
        }
    }
    const merged = [];
    for (let seq = 1; seq <= targetSeq; seq++) {
        if (!bySeq.has(seq)) return null;
        merged.push(bySeq.get(seq));
    }
    return merged;
}

function planRejoinActionLogPersistence(
    stateSnapshot,
    restoreAudit,
    storedActionLog,
    replayActionLog,
    serverFullActionLog
) {
    if (!stateSnapshot || restoreAudit) {
        return Object.freeze({
            actionLog: replayActionLog,
            reason: REJOIN_ACTION_LOG_REASONS.SERVER_REPLAY_LOG,
        });
    }
    const snapshotSeq = Number.isInteger(stateSnapshot.actionSeq) ? stateSnapshot.actionSeq : 0;
    const serverLogs = [serverFullActionLog, replayActionLog];
    const targetSeq = serverLogs.reduce((highest, actionLog) => {
        if (!Array.isArray(actionLog)) return highest;
        return actionLog.reduce((current, entry) =>
            Number.isInteger(entry?.seq) ? Math.max(current, entry.seq) : current, highest);
    }, snapshotSeq);
    const actionLogs = [storedActionLog, serverFullActionLog, replayActionLog];
    if (continuousActionLogThrough(serverFullActionLog, targetSeq)) {
        return Object.freeze({
            actionLog: serverFullActionLog,
            reason: REJOIN_ACTION_LOG_REASONS.SERVER_UNSIGNED_FULL_LOG,
        });
    }
    if (continuousActionLogThrough(storedActionLog, targetSeq)) {
        return Object.freeze({
            actionLog: storedActionLog,
            reason: REJOIN_ACTION_LOG_REASONS.STORED_UNSIGNED_FULL_LOG,
        });
    }
    if (continuousActionLogThrough(replayActionLog, targetSeq)) {
        return Object.freeze({
            actionLog: replayActionLog,
            reason: REJOIN_ACTION_LOG_REASONS.SERVER_REPLAY_LOG,
        });
    }
    const merged = mergeContinuousActionLogs(actionLogs, targetSeq);
    if (!merged && targetSeq > 0) {
        const fallback = continuousActionLogPrefix(storedActionLog, targetSeq)
            ? storedActionLog
            : replayActionLog;
        return Object.freeze({
            actionLog: fallback,
            persistBundle: false,
            reason: REJOIN_ACTION_LOG_REASONS.INCOMPLETE_UNSIGNED_HISTORY,
        });
    }
    return Object.freeze({
        actionLog: merged || replayActionLog,
        reason: merged
            ? REJOIN_ACTION_LOG_REASONS.MERGED_UNSIGNED_FULL_LOG
            : REJOIN_ACTION_LOG_REASONS.SERVER_REPLAY_LOG,
    });
}

function rejoinActionLogPersistencePlansMatch(planned, legacy) {
    return !!planned && !!legacy && planned.actionLog === legacy.actionLog &&
        planned.reason === legacy.reason;
}

function selectRejoinActionLogPersistencePlan(
    stateSnapshot,
    restoreAudit,
    storedActionLog,
    replayActionLog,
    legacyPlan,
    options = {},
    serverFullActionLog
) {
    const purePlan = planRejoinActionLogPersistence(
        stateSnapshot,
        restoreAudit,
        storedActionLog,
        replayActionLog,
        serverFullActionLog
    );
    const matched = rejoinActionLogPersistencePlansMatch(purePlan, legacyPlan);
    const enabled = options.authorityEnabled === true;
    const usePure = enabled && matched;
    return Object.freeze({
        plan: usePure ? purePlan : legacyPlan,
        source: usePure ? 'pure-plan' : (enabled ? 'legacy-fallback' : 'legacy'),
        matched,
        fallbackReason: matched ? '' : 'rejoin-action-log-plan-mismatch',
    });
}

function withGameSchemaCapabilities(payload, capabilities) {
    if (!capabilities) return payload;
    return Object.assign({}, payload, { gameSchemaCapabilities: capabilities });
}

function shouldClearPendingForAcceptedAction(accepted, pending) {
    if (!pending) return false;
    if (typeof pending.clientActionId === 'string') {
        return typeof accepted?.clientActionId === 'string' && sameOnlineActionEntry(accepted, pending);
    }
    return sameOnlineActionEntry(accepted, pending);
}

const OnlinePayload = Object.freeze({
    normalizeSession: normalizeOnlineSession,
    normalizeActionLog: normalizeOnlineActionLog,
    buildPendingOutboundAction,
    normalizePendingOutboundAction,
    incomingGameActionDecisions: INCOMING_GAME_ACTION_DECISIONS,
    planIncomingGameAction,
    selectIncomingGameActionPlan,
    planRestoreAbort: planOnlineRestoreAbort,
    selectRestoreAbortPlan: selectOnlineRestoreAbortPlan,
    planRestoreEventFlush: planOnlineRestoreEventFlush,
    selectRestoreEventFlushPlan: selectOnlineRestoreEventFlushPlan,
    sameActionEntry: sameOnlineActionEntry,
    pendingBelongsToSession,
    appendPendingForRestore,
    canResendPendingOutboundAction,
    acceptedClientActionMatchesPending,
    pendingReconciliationReasons: PENDING_RECONCILIATION_REASONS,
    planPendingReconciliation,
    selectPendingReconciliationPlan,
    rejoinActionLogReasons: REJOIN_ACTION_LOG_REASONS,
    planRejoinActionLogPersistence,
    selectRejoinActionLogPersistencePlan,
    shouldClearPendingForAcceptedAction,
    withGameSchemaCapabilities,
    buildRejoin(session, clientVersion, gameSchemaCapabilities = null) {
        const gameGeneration = onlinePayloadRestoreMetadata.normalizeCounter(
            session && session.gameGeneration
        );
        const payload = {
            roomId: session && session.roomId,
            playerIndex: session && session.playerIndex,
            playerName: session && session.playerName,
            reconnectToken: session && session.reconnectToken,
            gameGeneration,
            clientVersion,
            hostlessRestoreVersion: ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION,
        };
        return withGameSchemaCapabilities(payload, gameSchemaCapabilities);
    },
    supportsHostlessRestore,
    buildHostlessRestoreRequest(bundle, identity) {
        if (!supportsHostlessRestore(bundle, identity)) return null;
        return hostlessIdentityFields(bundle, identity);
    },
    buildHostlessRestoreCandidate(bundle, identity) {
        if (!supportsHostlessRestore(bundle, identity)) return null;
        return Object.assign(hostlessIdentityFields(bundle, identity), {
            generation: onlinePayloadRestoreMetadata.normalizeCounter(
                bundle.gameStartPayload.hostlessRestoreGeneration
            ),
            attemptCount: onlinePayloadRestoreMetadata.normalizeCounter(
                bundle.gameStartPayload.hostlessRestoreCount,
                ONLINE_HOSTLESS_RESTORE_MAX_ATTEMPTS
            ),
            stateSnapshot: bundle.stateSnapshot || null,
            actionLog: Array.isArray(bundle.actionLog) ? bundle.actionLog : [],
            restoreAudit: bundle.restoreAudit || null,
        });
    },
    hostlessRestoreStatusMessage(reason) {
        return ONLINE_HOSTLESS_RESTORE_STATUS_MESSAGES[reason] ||
            '参加者データからの復元を完了できませんでした。保存データは削除されていません。';
    },
    hostlessRestoreEvents: ONLINE_HOSTLESS_RESTORE_EVENTS,
    hostlessRestoreVersion: ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        OnlinePayload,
        ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION,
        ONLINE_HOSTLESS_RESTORE_EVENTS,
    };
}
