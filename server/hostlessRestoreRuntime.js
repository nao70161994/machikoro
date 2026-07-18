'use strict';

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
    const requesters = new Map();

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
        const validation = gateway.validateRequest(payload);
        if (!validation.ok) {
            socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, { reason: validation.reason });
            return validation;
        }
        if (hasRoom(validation.roomId)) {
            socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, {
                roomId: validation.roomId,
                reason: 'host-restored',
            });
            return { ok: false, reason: 'host-restored' };
        }
        const existing = coordinator.inspect(validation.roomId);
        if (existing && (existing.generation !== validation.generation ||
                existing.attemptCount !== validation.attemptCount)) {
            socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, {
                roomId: validation.roomId,
                reason: 'generation-mismatch',
            });
            return { ok: false, reason: 'generation-mismatch' };
        }
        if (!existing) {
            const started = coordinator.start({
                roomId: validation.roomId,
                generation: validation.generation,
                attemptCount: validation.attemptCount,
                enabled,
            });
            if (!started.ok) {
                socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, {
                    roomId: validation.roomId,
                    reason: started.reason,
                });
                return started;
            }
        }
        requesterMap(validation.roomId).set(validation.playerIndex, {
            socketId: socket.id,
            playerIndex: validation.playerIndex,
            generation: validation.generation,
            attemptCount: validation.attemptCount,
        });
        socket.hostlessRestoreRoomId = validation.roomId;
        socket.hostlessRestorePlayerIndex = validation.playerIndex;
        socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, {
            roomId: validation.roomId,
            generation: validation.generation,
            stage: coordinator.inspect(validation.roomId)?.stage || '',
            reason: 'waiting-for-host',
        });
        return { ok: true };
    }

    function submit(socket, payload) {
        const prepared = gateway.prepareCandidate(socket, payload);
        if (!prepared.ok) {
            socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, { reason: prepared.reason });
            return prepared;
        }
        const session = coordinator.inspect(prepared.roomId);
        if (!session || session.stage !== 'collecting') {
            return { ok: false, reason: 'not-collecting' };
        }
        if (session.generation !== prepared.candidate.generation ||
                session.attemptCount !== prepared.attemptCount) {
            socket.emit(HOSTLESS_RESTORE_EVENTS.STATUS, {
                roomId: prepared.roomId,
                reason: 'generation-mismatch',
            });
            return { ok: false, reason: 'generation-mismatch' };
        }
        const requester = requesters.get(prepared.roomId)?.get(prepared.candidate.playerIndex);
        if (!requester || requester.socketId !== socket.id) {
            return { ok: false, reason: 'requester-mismatch' };
        }
        return coordinator.submitCandidate(prepared.roomId, prepared.candidate);
    }

    function confirm(socket, payload = {}) {
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
        const approval = approveCandidate(socket, result.candidate.payload, {
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
        const roomId = socket?.hostlessRestoreRoomId;
        const playerIndex = socket?.hostlessRestorePlayerIndex;
        if (!roomId || !Number.isInteger(playerIndex)) return false;
        const map = requesters.get(roomId);
        const requester = map?.get(playerIndex);
        if (requester?.socketId === socket.id) map.delete(playerIndex);
        coordinator.confirmationOwnerDisconnected(roomId, playerIndex);
        if (map && map.size === 0 && !coordinator.inspect(roomId)) requesters.delete(roomId);
        return true;
    }

    function hostRestored(roomId) {
        const stopped = coordinator.hostRestored(roomId);
        requesters.delete(typeof roomId === 'string' ? roomId.trim().toUpperCase() : '');
        return stopped;
    }

    function registerSocket(socket) {
        socket.on(HOSTLESS_RESTORE_EVENTS.REQUEST, payload => request(socket, payload));
        socket.on(HOSTLESS_RESTORE_EVENTS.CANDIDATE, payload => submit(socket, payload));
        socket.on(HOSTLESS_RESTORE_EVENTS.CONFIRM, payload => confirm(socket, payload));
    }

    function inspect(roomId) {
        const normalized = typeof roomId === 'string' ? roomId.trim().toUpperCase() : '';
        return {
            coordinator: coordinator.inspect(normalized),
            requesterCount: requesters.get(normalized)?.size || 0,
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
