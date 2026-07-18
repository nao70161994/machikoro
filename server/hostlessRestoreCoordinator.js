'use strict';

const {
    HOSTLESS_RESTORE_LIMITS,
    HOSTLESS_RESTORE_RESULTS,
    evaluateCandidateQuorum,
    nextConfirmationPlayerIndex,
} = require('./hostlessRestoreCandidate');

const HOSTLESS_RESTORE_STAGES = Object.freeze({
    HOST_GRACE: 'host-grace',
    COLLECTING: 'collecting',
    CONFIRMING: 'confirming',
});

const HOSTLESS_RESTORE_TERMINAL_REASONS = Object.freeze({
    HOST_RESTORED: 'host-restored',
    DISABLED: 'disabled',
    RETENTION_TIMEOUT: 'retention-timeout',
    CONFIRMATION_EXHAUSTED: 'confirmation-exhausted',
    CANCELLED: 'cancelled',
});

function createHostlessRestoreCoordinator(options = {}) {
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const schedule = typeof options.setTimeout === 'function' ? options.setTimeout : setTimeout;
    const unschedule = typeof options.clearTimeout === 'function' ? options.clearTimeout : clearTimeout;
    const emit = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    const limits = Object.assign({}, HOSTLESS_RESTORE_LIMITS, options.limits || {});
    const sessions = new Map();

    function emitEvent(type, session, details = {}) {
        emit(Object.assign({
            type,
            roomId: session.roomId,
            generation: session.generation,
            stage: session.stage,
        }, details));
    }

    function clearTimer(session, name) {
        if (!session.timers[name]) return;
        unschedule(session.timers[name]);
        session.timers[name] = null;
    }

    function clearTimers(session) {
        for (const name of Object.keys(session.timers)) clearTimer(session, name);
    }

    function finish(session, reason, details = {}) {
        if (!session || sessions.get(session.roomId) !== session) return false;
        clearTimers(session);
        sessions.delete(session.roomId);
        session.candidates.length = 0;
        emitEvent('terminal', session, Object.assign({ reason }, details));
        return true;
    }

    function arm(session, name, delay, callback) {
        clearTimer(session, name);
        session.timers[name] = schedule(() => {
            session.timers[name] = null;
            if (sessions.get(session.roomId) !== session) return;
            callback();
        }, delay);
    }

    function moveConfirmation(session, reason) {
        clearTimer(session, 'confirmation');
        if (Number.isInteger(session.confirmationPlayerIndex)) {
            session.excludedConfirmationPlayers.push(session.confirmationPlayerIndex);
        }
        const nextPlayerIndex = nextConfirmationPlayerIndex(
            session.quorum.confirmationOrder,
            session.excludedConfirmationPlayers
        );
        if (nextPlayerIndex === null) {
            finish(session, HOSTLESS_RESTORE_TERMINAL_REASONS.CONFIRMATION_EXHAUSTED, {
                confirmationReason: reason,
            });
            return false;
        }
        session.confirmationPlayerIndex = nextPlayerIndex;
        emitEvent('confirmation-requested', session, {
            playerIndex: nextPlayerIndex,
            timeoutMs: limits.confirmationMs,
            reason,
        });
        arm(session, 'confirmation', limits.confirmationMs, () => moveConfirmation(session, 'timeout'));
        return true;
    }

    function finalizeCollection(session) {
        if (!session || session.stage !== HOSTLESS_RESTORE_STAGES.COLLECTING) return null;
        clearTimer(session, 'collection');
        const quorum = evaluateCandidateQuorum(session.candidates, {
            attemptCount: session.attemptCount,
            maxAttempts: limits.maxAttempts,
            minDistinctHumans: limits.minDistinctHumans,
        });
        if (quorum.status !== HOSTLESS_RESTORE_RESULTS.READY) {
            finish(session, quorum.status, { candidateCount: quorum.candidates.length });
            return quorum;
        }
        session.stage = HOSTLESS_RESTORE_STAGES.CONFIRMING;
        session.quorum = quorum;
        session.excludedConfirmationPlayers = [];
        session.confirmationPlayerIndex = null;
        emitEvent('quorum-ready', session, {
            candidateCount: quorum.candidates.length,
            canonicalHash: quorum.canonicalHash,
            rank: quorum.rank,
        });
        moveConfirmation(session, 'quorum-ready');
        return quorum;
    }

    function beginCollection(session) {
        if (!session || sessions.get(session.roomId) !== session) return false;
        session.stage = HOSTLESS_RESTORE_STAGES.COLLECTING;
        session.collectionStartedAt = now();
        session.candidates.length = 0;
        emitEvent('collection-started', session, {
            timeoutMs: limits.collectionMs,
            retentionMs: limits.retentionMs,
        });
        arm(session, 'collection', limits.collectionMs, () => finalizeCollection(session));
        arm(session, 'retention', limits.retentionMs, () => {
            finish(session, HOSTLESS_RESTORE_TERMINAL_REASONS.RETENTION_TIMEOUT);
        });
        return true;
    }

    function start(input = {}) {
        const roomId = typeof input.roomId === 'string' ? input.roomId.trim().toUpperCase() : '';
        if (!roomId) return { ok: false, reason: 'room-id' };
        if (input.enabled === false) return { ok: false, reason: HOSTLESS_RESTORE_TERMINAL_REASONS.DISABLED };
        if (sessions.has(roomId)) return { ok: false, reason: 'already-started' };
        const attemptCount = Number.isInteger(input.attemptCount) && input.attemptCount >= 0
            ? input.attemptCount
            : 0;
        if (attemptCount >= limits.maxAttempts) {
            return { ok: false, reason: HOSTLESS_RESTORE_RESULTS.ATTEMPT_LIMIT };
        }
        const session = {
            roomId,
            generation: Number.isInteger(input.generation) && input.generation >= 0
                ? input.generation
                : 0,
            attemptCount,
            stage: HOSTLESS_RESTORE_STAGES.HOST_GRACE,
            startedAt: now(),
            collectionStartedAt: null,
            candidates: [],
            quorum: null,
            confirmationPlayerIndex: null,
            excludedConfirmationPlayers: [],
            timers: { grace: null, collection: null, confirmation: null, retention: null },
        };
        sessions.set(roomId, session);
        emitEvent('host-grace-started', session, { timeoutMs: limits.hostGraceMs });
        arm(session, 'grace', limits.hostGraceMs, () => beginCollection(session));
        return { ok: true, roomId, generation: session.generation };
    }

    function submitCandidate(roomId, candidate) {
        const normalizedRoomId = typeof roomId === 'string' ? roomId.trim().toUpperCase() : '';
        const session = sessions.get(normalizedRoomId);
        if (!session) return { ok: false, reason: 'not-collecting' };
        if (session.stage !== HOSTLESS_RESTORE_STAGES.COLLECTING) {
            return { ok: false, reason: session.stage };
        }
        session.candidates.push(candidate);
        emitEvent('candidate-received', session, {
            playerIndex: Number.isInteger(candidate?.playerIndex) ? candidate.playerIndex : null,
            candidateCount: session.candidates.length,
        });
        return { ok: true };
    }

    function respondToConfirmation(roomId, playerIndex, approved) {
        const normalizedRoomId = typeof roomId === 'string' ? roomId.trim().toUpperCase() : '';
        const session = sessions.get(normalizedRoomId);
        if (!session || session.stage !== HOSTLESS_RESTORE_STAGES.CONFIRMING) {
            return { ok: false, reason: 'not-confirming' };
        }
        if (session.confirmationPlayerIndex !== playerIndex) {
            return { ok: false, reason: 'not-confirmation-owner' };
        }
        if (approved !== true) {
            moveConfirmation(session, 'rejected');
            return { ok: true, approved: false };
        }
        const selected = session.quorum.candidates.find(candidate => candidate.playerIndex === playerIndex);
        if (!selected) {
            moveConfirmation(session, 'candidate-missing');
            return { ok: false, reason: 'candidate-missing' };
        }
        const result = {
            ok: true,
            approved: true,
            roomId: session.roomId,
            generation: session.generation,
            playerIndex,
            candidate: selected,
            candidateCount: session.quorum.candidates.length,
        };
        clearTimers(session);
        sessions.delete(session.roomId);
        session.candidates.length = 0;
        emitEvent('approved', session, {
            playerIndex,
            candidateCount: result.candidateCount,
            canonicalHash: session.quorum.canonicalHash,
            rank: session.quorum.rank,
        });
        return result;
    }

    function hostRestored(roomId) {
        const session = sessions.get(typeof roomId === 'string' ? roomId.trim().toUpperCase() : '');
        return finish(session, HOSTLESS_RESTORE_TERMINAL_REASONS.HOST_RESTORED);
    }

    function cancel(roomId, reason = HOSTLESS_RESTORE_TERMINAL_REASONS.CANCELLED) {
        const session = sessions.get(typeof roomId === 'string' ? roomId.trim().toUpperCase() : '');
        return finish(session, reason);
    }

    function confirmationOwnerDisconnected(roomId, playerIndex) {
        const session = sessions.get(typeof roomId === 'string' ? roomId.trim().toUpperCase() : '');
        if (!session || session.stage !== HOSTLESS_RESTORE_STAGES.CONFIRMING ||
                session.confirmationPlayerIndex !== playerIndex) return false;
        return moveConfirmation(session, 'disconnected');
    }

    function inspect(roomId) {
        const session = sessions.get(typeof roomId === 'string' ? roomId.trim().toUpperCase() : '');
        if (!session) return null;
        return Object.freeze({
            roomId: session.roomId,
            generation: session.generation,
            attemptCount: session.attemptCount,
            stage: session.stage,
            candidateCount: session.candidates.length,
            confirmationPlayerIndex: session.confirmationPlayerIndex,
            startedAt: session.startedAt,
            collectionStartedAt: session.collectionStartedAt,
        });
    }

    return Object.freeze({
        start,
        beginCollection: roomId => beginCollection(sessions.get(typeof roomId === 'string' ? roomId.trim().toUpperCase() : '')),
        submitCandidate,
        finalizeCollection: roomId => finalizeCollection(sessions.get(typeof roomId === 'string' ? roomId.trim().toUpperCase() : '')),
        respondToConfirmation,
        confirmationOwnerDisconnected,
        hostRestored,
        cancel,
        inspect,
    });
}

module.exports = Object.freeze({
    HOSTLESS_RESTORE_STAGES,
    HOSTLESS_RESTORE_TERMINAL_REASONS,
    createHostlessRestoreCoordinator,
});
