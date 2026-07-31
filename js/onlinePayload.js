'use strict';

const ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION = 1;
const ONLINE_HOSTLESS_RESTORE_MAX_ATTEMPTS = 3;
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
    if ((gameStartPayload.hostlessRestoreCount || 0) >= ONLINE_HOSTLESS_RESTORE_MAX_ATTEMPTS) return false;
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
    shouldClearPendingForAcceptedAction,
    withGameSchemaCapabilities,
    buildRejoin(session, clientVersion, gameSchemaCapabilities = null) {
        const payload = {
            roomId: session && session.roomId,
            playerIndex: session && session.playerIndex,
            playerName: session && session.playerName,
            reconnectToken: session && session.reconnectToken,
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
