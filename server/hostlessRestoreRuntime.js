'use strict';

const {
    HOSTLESS_RESTORE_LIMITS,
    HOSTLESS_RESTORE_STATUS_REASONS,
} = require('./hostlessRestoreCandidate');

const HOSTLESS_RESTORE_EVENTS = Object.freeze({
    REQUEST: 'requestHostlessRestore',
    COLLECT: 'hostlessRestoreCollect',
    CANDIDATE: 'submitHostlessRestoreCandidate',
    CONFIRMATION: 'hostlessRestoreConfirmation',
    CONFIRM: 'confirmHostlessRestore',
    STATUS: 'hostlessRestoreStatus',
    APPROVED: 'hostlessRestoreApproved',
});

const HOSTLESS_RESTORE_FALSE_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);

function hostlessRestoreEnabled(env = process.env) {
    const value = String(env.HOSTLESS_RESTORE_ENABLED ?? '').trim().toLowerCase();
    return !HOSTLESS_RESTORE_FALSE_VALUES.has(value);
}

function createHostlessRestoreRuntime(options = {}) {
    const {
        io,
        coordinator,
        gateway,
        hasRoom,
        approveCandidate,
    } = options;
    const enabled = options.enabled !== false;
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const validateControlPayload = typeof options.validateControlPayload === 'function'
        ? options.validateControlPayload
        : payload => ({ ok: !!payload && typeof payload === 'object' && !Array.isArray(payload) });
    const startRateKeyForSocket = typeof options.startRateKeyForSocket === 'function'
        ? options.startRateKeyForSocket
        : () => null;
    const canStartForRateKey = typeof options.canStartForRateKey === 'function'
        ? options.canStartForRateKey
        : () => true;
    const markStartForRateKey = typeof options.markStartForRateKey === 'function'
        ? options.markStartForRateKey
        : () => {};
    const requesters = new Map();

    function normalizeRoomId(roomId) {
        return typeof roomId === 'string' ? roomId.trim().toUpperCase() : '';
    }

    function requesterMap(roomId) {
        let map = requesters.get(roomId);
        if (!map) {
            map = new Map();
            requesters.set(roomId, map);
        }
        return map;
    }

    function socketById(socketId) {
        return socketId && io?.sockets?.sockets?.get(socketId) || null;
    }

    function emitToRequester(requester, eventName, payload) {
        const socket = socketById(requester?.socketId);
        if (socket) socket.emit(eventName, payload);
    }

    function notifyRoomRequesters(roomId, eventName, payload) {
        const map = requesters.get(roomId);
        if (!map) return;
        for (const requester of map.values()) emitToRequester(requester, eventName, payload);
    }

    function activeRequesterCount(roomId) {
        const map = requesters.get(roomId);
        if (!map) return 0;
        return Array.from(map.values()).filter(requester => requester.socketId).length;
    }

    function releaseSocketRequester(socket, nextRoomId = '', nextPlayerIndex = null) {
        const roomId = normalizeRoomId(socket?.hostlessRestoreRoomId);
        const playerIndex = socket?.hostlessRestorePlayerIndex;
        if (!roomId || !Number.isInteger(playerIndex) ||
                (roomId === nextRoomId && playerIndex === nextPlayerIndex)) return false;
        const map = requesters.get(roomId);
        const requester = map?.get(playerIndex);
        if (requester?.socketId === socket.id) {
            requester.socketId = '';
            coordinator.confirmationOwnerDisconnected(roomId, playerIndex);
            if (roomId !== nextRoomId && activeRequesterCount(roomId) === 0) {
                coordinator.cancel(roomId);
            }
        }
        socket.hostlessRestoreRoomId = '';
        socket.hostlessRestorePlayerIndex = null;
        return true;
    }

    function publicStatus(event) {
        return {
            roomId: event.roomId,
            generation: event.generation,
            stage: event.stage,
            reason: event.reason || '',
            candidateCount: Number.isInteger(event.candidateCount) ? event.candidateCount : 0,
            timeoutMs: Number.isInteger(event.timeoutMs) ? event.timeoutMs : 0,
        };
    }

    function handleCoordinatorEvent(event) {
        if (!event || !event.roomId) return;
        if (event.type === 'collection-started') {
            notifyRoomRequesters(event.roomId, HOSTLESS_RESTORE_EVENTS.COLLECT, {
                roomId: event.roomId,
                generation: event.generation,
                timeoutMs: event.timeoutMs,
            });
            return;
        }
        if (event.type === 'confirmation-requested') {
            const requester = requesters.get(event.roomId)?.get(event.playerIndex);
            emitToRequester(requester, HOSTLESS_RESTORE_EVENTS.CONFIRMATION, {
                roomId: event.roomId,
                generation: event.generation,
                timeoutMs: event.timeoutMs,
                candidateCount: event.candidateCount || 0,
            });
            notifyRoomRequesters(event.roomId, HOSTLESS_RESTORE_EVENTS.STATUS, publicStatus(event));
            return;
        }
        if (event.type === 'terminal') {
            notifyRoomRequesters(event.roomId, HOSTLESS_RESTORE_EVENTS.STATUS, publicStatus(event));
            requesters.delete(event.roomId);
            return;
        }
        if (event.type === 'quorum-ready') {
            notifyRoomRequesters(event.roomId, HOSTLESS_RESTORE_EVENTS.STATUS, publicStatus(event));
        }
    }

    function request(socket, payload) {
        if (!enabled) {
            socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, { reason: 'disabled' });
            return { ok: false, reason: 'disabled' };
        }
        if (!validateControlPayload(payload).ok) {
            socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, { reason: 'invalid-payload' });
            return { ok: false, reason: 'invalid-payload' };
        }
        const validation = gateway.validateRequest(payload);
        if (!validation.ok) {
            socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, { reason: validation.reason });
            return validation;
        }
        const roomId = normalizeRoomId(validation.roomId);
        if (!roomId) {
            socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, { reason: 'room-id' });
            return { ok: false, reason: 'room-id' };
        }
        if (hasRoom(roomId)) {
            socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, {
                roomId,
                reason: HOSTLESS_RESTORE_STATUS_REASONS.HOST_RESTORED,
            });
            return { ok: false, reason: HOSTLESS_RESTORE_STATUS_REASONS.HOST_RESTORED };
        }
        const existing = coordinator.inspect(roomId);
        if (existing && (existing.generation !== validation.generation ||
                existing.attemptCount !== validation.attemptCount)) {
            socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, {
                roomId,
                reason: 'generation-mismatch',
            });
            return { ok: false, reason: 'generation-mismatch' };
        }
        let startRateKey = null;
        if (!existing) {
            startRateKey = startRateKeyForSocket(socket);
            if (!canStartForRateKey(startRateKey, now())) {
                socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, {
                    roomId,
                    reason: HOSTLESS_RESTORE_STATUS_REASONS.START_RATE_LIMIT,
                });
                return { ok: false, reason: HOSTLESS_RESTORE_STATUS_REASONS.START_RATE_LIMIT };
            }
        }
        releaseSocketRequester(socket, roomId, validation.playerIndex);
        if (!existing) {
            const started = coordinator.start({
                roomId,
                generation: validation.generation,
                attemptCount: validation.attemptCount,
                enabled,
            });
            if (!started.ok) {
                socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, {
                    roomId,
                    reason: started.reason,
                });
                return started;
            }
            markStartForRateKey(startRateKey, now());
        }
        const roomRequesters = requesterMap(roomId);
        const previousRequester = roomRequesters.get(validation.playerIndex);
        roomRequesters.set(validation.playerIndex, {
            socketId: socket.id,
            playerIndex: validation.playerIndex,
            generation: validation.generation,
            attemptCount: validation.attemptCount,
            candidateSubmittedAt: Number.isFinite(previousRequester?.candidateSubmittedAt)
                ? previousRequester.candidateSubmittedAt
                : undefined,
        });
        socket.hostlessRestoreRoomId = roomId;
        socket.hostlessRestorePlayerIndex = validation.playerIndex;
        const currentSession = coordinator.inspect(roomId);
        socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, {
            roomId,
            generation: validation.generation,
            stage: currentSession?.stage || '',
            reason: HOSTLESS_RESTORE_STATUS_REASONS.WAITING_FOR_HOST,
        });
        if (currentSession?.stage === 'collecting') {
            socket.emit(HOSTLESS_RESTORE_EVENTS.COLLECT, {
                roomId,
                generation: validation.generation,
                timeoutMs: 0,
            });
        }
        return { ok: true };
    }

    function submit(socket, payload) {
        if (!enabled) return { ok: false, reason: 'disabled' };
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return { ok: false, reason: 'invalid-payload' };
        }
        const roomId = typeof payload.roomId === 'string' ? payload.roomId.trim().toUpperCase() : '';
        const playerIndex = socket?.hostlessRestorePlayerIndex;
        const requester = requesters.get(roomId)?.get(playerIndex);
        if (!requester || requester.socketId !== socket.id ||
                socket.hostlessRestoreRoomId !== roomId) {
            return { ok: false, reason: 'requester-mismatch' };
        }
        const session = coordinator.inspect(roomId);
        if (!session || session.stage !== 'collecting') {
            return { ok: false, reason: 'not-collecting' };
        }
        if (!Number.isInteger(payload.generation) || payload.generation < 0 ||
                !Number.isInteger(payload.attemptCount) || payload.attemptCount < 0) {
            return { ok: false, reason: 'invalid-payload' };
        }
        const generation = payload.generation;
        const attemptCount = payload.attemptCount;
        if (session.generation !== generation || session.attemptCount !== attemptCount) {
            socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, { roomId, reason: 'generation-mismatch' });
            return { ok: false, reason: 'generation-mismatch' };
        }
        const submittedAt = now();
        if (Number.isFinite(requester.candidateSubmittedAt) &&
                submittedAt - requester.candidateSubmittedAt < HOSTLESS_RESTORE_LIMITS.candidateCooldownMs) {
            return { ok: false, reason: 'candidate-rate-limit' };
        }
        requester.candidateSubmittedAt = submittedAt;
        const prepared = gateway.prepareCandidate(socket, payload);
        if (!prepared.ok) {
            socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, { reason: prepared.reason });
            return prepared;
        }
        if (session.generation !== prepared.candidate.generation ||
                session.attemptCount !== prepared.attemptCount) {
            socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, {
                roomId: prepared.roomId,
                reason: 'generation-mismatch',
            });
            return { ok: false, reason: 'generation-mismatch' };
        }
        const preparedRoomId = normalizeRoomId(prepared.roomId);
        if (preparedRoomId !== roomId || prepared.candidate.playerIndex !== playerIndex) {
            return { ok: false, reason: 'requester-mismatch' };
        }
        return coordinator.submitCandidate(preparedRoomId, prepared.candidate);
    }

    function confirm(socket, payload = {}) {
        if (!enabled) return { ok: false, reason: 'disabled' };
        if (!validateControlPayload(payload).ok) {
            return { ok: false, reason: 'invalid-payload' };
        }
        const roomId = typeof payload.roomId === 'string' ? payload.roomId.trim().toUpperCase() : '';
        const requester = requesters.get(roomId)?.get(socket.hostlessRestorePlayerIndex);
        if (!requester || requester.socketId !== socket.id) {
            return { ok: false, reason: 'requester-mismatch' };
        }
        const result = coordinator.respondToConfirmation(
            roomId,
            requester.playerIndex,
            payload.approved === true
        );
        if (!result.ok || !result.approved) return result;
        const approvalPayload = Object.assign({}, result.candidate.payload, { roomId });
        const approval = approveCandidate(socket, approvalPayload, {
            generation: result.generation,
            attemptCount: result.candidate.payload.gameStartPayload.hostlessRestoreCount || 0,
            candidateCount: result.candidateCount,
            canonicalHash: result.candidate.canonicalHash,
            rank: result.candidate.rank,
        });
        if (!approval?.ok) {
            const status = {
                roomId,
                reason: approval?.reason || 'restore-failed',
            };
            notifyRoomRequesters(roomId, HOSTLESS_RESTORE_EVENTS.STATUS, status);
            requesters.delete(roomId);
            return { ok: false, reason: approval?.reason || 'restore-failed' };
        }
        notifyRoomRequesters(roomId, HOSTLESS_RESTORE_EVENTS.APPROVED, {
            roomId,
            generation: result.generation + 1,
            hostPlayerIndex: requester.playerIndex,
            provisional: true,
        });
        requesters.delete(roomId);
        return { ok: true, approved: true };
    }

    function disconnect(socket) {
        return releaseSocketRequester(socket);
    }

    function hostRestored(roomId) {
        const stopped = coordinator.hostRestored(roomId);
        requesters.delete(typeof roomId === 'string' ? roomId.trim().toUpperCase() : '');
        return stopped;
    }

    function registerSocket(socket) {
        const safe = handler => payload => {
            try {
                return handler(socket, payload);
            } catch (_error) {
                socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, { reason: 'invalid-request' });
                return { ok: false, reason: 'invalid-request' };
            }
        };
        socket.on(HOSTLESS_RESTORE_EVENTS.REQUEST, safe(request));
        socket.on(HOSTLESS_RESTORE_EVENTS.CANDIDATE, safe(submit));
        socket.on(HOSTLESS_RESTORE_EVENTS.CONFIRM, safe(confirm));
    }

    function inspect(roomId) {
        const normalized = normalizeRoomId(roomId);
        const roomRequesters = requesters.get(normalized);
        return {
            coordinator: coordinator.inspect(normalized),
            requesterCount: roomRequesters
                ? Array.from(roomRequesters.values()).filter(requester => requester.socketId).length
                : 0,
        };
    }

    return Object.freeze({
        events: HOSTLESS_RESTORE_EVENTS,
        registerSocket,
        request,
        submit,
        confirm,
        disconnect,
        hostRestored,
        handleCoordinatorEvent,
        inspect,
    });
}

module.exports = Object.freeze({
    HOSTLESS_RESTORE_EVENTS,
    hostlessRestoreEnabled,
    createHostlessRestoreRuntime,
});
