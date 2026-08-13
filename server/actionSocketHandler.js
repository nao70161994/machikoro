'use strict';

function buildAcceptedActionEntry(input = {}) {
    const actionEntry = {
        action: input.action,
        data: input.action === 'undoBuild'
            ? { state: input.undoState }
            : input.canonicalData,
        playerIndex: input.playerIndex,
        seq: input.seq,
    };
    if (input.clientActionId) actionEntry.clientActionId = input.clientActionId;
    if (Number.isSafeInteger(input.gameGeneration) && input.gameGeneration > 0) {
        actionEntry.gameGeneration = input.gameGeneration;
    }
    return actionEntry;
}

function registerActionSocketHandler(socket, dependencies) {
    const {
        requirePlainSocketPayload,
        rooms,
        isActiveRoomSocket,
        emitAppError,
        normalizeClientActionId,
        findAcceptedClientAction,
        validateGameAction,
        canonicalizeActionData,
        planNextRoomActionSeq,
        commitRoomActionSeq,
        gameSchemaShadow,
        decodeGameSchemaAction = (_room, payload) => ({ ok: true, value: payload }),
        encodeGameSchemaAction = (_room, payload) => ({ ok: true, value: payload }),
        buildRestoreActionAudit,
        applyAcceptedActionToRoomCanonicalMirror,
        resetRoomCanonicalMirror,
        rememberAcceptedClientAction,
        compactRoomActionLog,
        attachCompactedRestoreSnapshotToAction,
        markRoomCanonicalMirrorCurrent,
        persistRoomCanonicalState,
    } = dependencies;
    const gameEngineAuthority = dependencies.gameEngineAuthority || Object.freeze({ enabled: false });
    const adoptTransitionSnapshotToRoomMirror =
        typeof dependencies.adoptTransitionSnapshotToRoomMirror === 'function'
            ? dependencies.adoptTransitionSnapshotToRoomMirror
            : () => false;
    const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now;
    const logError = typeof dependencies.logError === 'function' ? dependencies.logError : console.error;
    const logWarn = typeof dependencies.logWarn === 'function' ? dependencies.logWarn : console.warn;

    socket.on('gameAction', payload => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        const roomId = socket.roomId;
        if (!roomId) return;
        const room = rooms[roomId];
        if (!room) {
            emitAppError(socket, 'ROOM_NOT_FOUND');
            return;
        }
        if (!room.started) return;
        if (!isActiveRoomSocket(room, socket)) {
            emitAppError(socket, 'INVALID_SESSION');
            return;
        }
        const decodedWire = decodeGameSchemaAction(room, payload);
        if (!decodedWire.ok) {
            emitAppError(socket, '無効な操作です');
            return;
        }
        const { action, data, clientActionId } = decodedWire.value;
        const roomGeneration = Number.isSafeInteger(room.gameGeneration) && room.gameGeneration >= 0
            ? room.gameGeneration : 0;
        const payloadGeneration = decodedWire.value.gameGeneration;
        if ((roomGeneration > 0 && payloadGeneration !== roomGeneration) ||
                (payloadGeneration != null && payloadGeneration !== roomGeneration)) {
            emitAppError(socket, 'STALE_GAME_GENERATION');
            return;
        }
        const safeClientActionId = normalizeClientActionId(clientActionId);
        const acceptedAction = findAcceptedClientAction(room, safeClientActionId, socket.playerIndex);
        if (acceptedAction) {
            const acceptedWire = encodeGameSchemaAction(room, acceptedAction);
            if (!acceptedWire.ok) {
                emitAppError(socket, '無効な操作です');
                return;
            }
            socket.emit('actionAccepted', acceptedWire.value);
            return;
        }
        let validation;
        try {
            validation = validateGameAction(room, socket, action, data);
        } catch (error) {
            logError('validateGameAction error:', error);
            emitAppError(socket, '無効な操作です');
            return;
        }
        if (!validation.ok) {
            emitAppError(socket, '無効な操作です');
            return;
        }
        const canonicalData = canonicalizeActionData(action, validation.data);
        const actionSeq = planNextRoomActionSeq(room);
        const actionEntry = buildAcceptedActionEntry({
            action,
            canonicalData,
            undoState: room.lastUndoState || validation.mirror.lastUndoState,
            playerIndex: socket.playerIndex,
            seq: actionSeq,
            clientActionId: safeClientActionId,
            gameGeneration: roomGeneration,
        });
        const wirePreflight = encodeGameSchemaAction(room, actionEntry);
        if (!wirePreflight.ok) {
            emitAppError(socket, '無効な操作です');
            return;
        }
        const schemaShadowTransition = gameSchemaShadow.prepare(room, validation.mirror, actionEntry);
        const restoreActionAudit = buildRestoreActionAudit(roomId, actionEntry);
        if (restoreActionAudit) actionEntry.restoreActionAudit = restoreActionAudit;
        let applied = false;
        try {
            applied = applyAcceptedActionToRoomCanonicalMirror(room, validation.mirror, actionEntry);
        } catch (error) {
            logError('applyAcceptedActionToRoomCanonicalMirror error:', error);
        }
        if (!applied) {
            resetRoomCanonicalMirror(room);
            emitAppError(socket, '無効な操作です');
            return;
        }
        if (!commitRoomActionSeq(room, actionSeq)) {
            resetRoomCanonicalMirror(room);
            emitAppError(socket, '無効な操作です');
            return;
        }
        const schemaShadowReport = gameSchemaShadow.compare(room.canonicalMirror, actionEntry, schemaShadowTransition);
        if (schemaShadowReport) {
            room.lastGameSchemaShadow = schemaShadowReport;
            if (schemaShadowReport.status !== 'matched') {
                logWarn('game schema shadow mismatch', { roomId, ...schemaShadowReport });
            }
        }
        if (gameEngineAuthority.enabled === true &&
                typeof gameEngineAuthority.select === 'function') {
            let authorityDecision = gameEngineAuthority.select(
                schemaShadowTransition,
                schemaShadowReport
            );
            if (authorityDecision.authority === 'pure-transition' &&
                    !adoptTransitionSnapshotToRoomMirror(
                        room,
                        schemaShadowTransition
                    )) {
                authorityDecision = Object.freeze({
                    authority: 'mutable',
                    reason: 'adoption-failed',
                });
                logWarn('pure game engine authority fallback', { roomId, ...authorityDecision });
            }
            room.lastGameEngineAuthority = authorityDecision;
        }
        room.lastUndoState = room.canonicalMirror?.lastUndoState || null;
        rememberAcceptedClientAction(room, actionEntry);
        if (room.actionLog) {
            room.actionLog.push(actionEntry);
            const actionLogLengthBeforeCompact = room.actionLog.length;
            compactRoomActionLog(room);
            attachCompactedRestoreSnapshotToAction(roomId, room, actionEntry, actionLogLengthBeforeCompact);
            markRoomCanonicalMirrorCurrent(room);
            room.lastTouchedAt = now();
            persistRoomCanonicalState(roomId, room, 'accepted-action');
        }
        const emittedWire = encodeGameSchemaAction(room, actionEntry);
        if (!emittedWire.ok) {
            logError('encodeGameSchemaAction error:', emittedWire.reason, emittedWire.codecReason || '');
            return;
        }
        socket.to(roomId).emit('gameAction', emittedWire.value);
        socket.emit('actionAccepted', emittedWire.value);
    });
}

module.exports = Object.freeze({ buildAcceptedActionEntry, registerActionSocketHandler });
