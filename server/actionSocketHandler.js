'use strict';

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
        makeUndoStateFromMirror,
        nextRoomActionSeq,
        gameSchemaShadow,
        decodeGameSchemaAction = (_room, payload) => ({ ok: true, value: payload }),
        encodeGameSchemaAction = (_room, payload) => ({ ok: true, value: payload }),
        buildRestoreActionAudit,
        applyAcceptedActionToRoomCanonicalMirror,
        rememberAcceptedClientAction,
        compactRoomActionLog,
        attachCompactedRestoreSnapshotToAction,
        markRoomCanonicalMirrorCurrent,
        persistRoomCanonicalState,
    } = dependencies;
    const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now;
    const logError = typeof dependencies.logError === 'function' ? dependencies.logError : console.error;
    const logWarn = typeof dependencies.logWarn === 'function' ? dependencies.logWarn : console.warn;

    socket.on('gameAction', payload => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        const roomId = socket.roomId;
        if (!roomId) return;
        const room = rooms[roomId];
        if (!room || !room.started) return;
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
        let safeData = canonicalizeActionData(action, validation.data);
        if (action === 'buildCard' || action === 'buildLandmark') {
            room.lastUndoState = makeUndoStateFromMirror(validation.mirror.game, validation.mirror.shopStock);
        } else if (action === 'undoBuild') {
            safeData = { state: room.lastUndoState || validation.mirror.lastUndoState };
            room.lastUndoState = null;
        } else if (action === 'nextTurn') {
            room.lastUndoState = null;
        }
        const actionSeq = nextRoomActionSeq(room);
        const actionEntry = { action, data: safeData, playerIndex: socket.playerIndex, seq: actionSeq };
        if (safeClientActionId) actionEntry.clientActionId = safeClientActionId;
        const wirePreflight = encodeGameSchemaAction(room, actionEntry);
        if (!wirePreflight.ok) {
            emitAppError(socket, '無効な操作です');
            return;
        }
        const schemaShadowTransition = gameSchemaShadow.prepare(room, validation.mirror, actionEntry);
        const restoreActionAudit = buildRestoreActionAudit(roomId, actionEntry);
        if (restoreActionAudit) actionEntry.restoreActionAudit = restoreActionAudit;
        if (!applyAcceptedActionToRoomCanonicalMirror(room, validation.mirror, actionEntry)) {
            emitAppError(socket, '無効な操作です');
            return;
        }
        room.lastUndoState = room.canonicalMirror?.lastUndoState || null;
        const schemaShadowReport = gameSchemaShadow.compare(room.canonicalMirror, actionEntry, schemaShadowTransition);
        if (schemaShadowReport) {
            room.lastGameSchemaShadow = schemaShadowReport;
            if (schemaShadowReport.status !== 'matched') {
                logWarn('game schema shadow mismatch', { roomId, ...schemaShadowReport });
            }
        }
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

module.exports = Object.freeze({ registerActionSocketHandler });
