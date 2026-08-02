'use strict';

/**
 * Computes restore ownership/sequence metadata without mutating the payload.
 * @param {{playerIndex?: number, hostEpoch?: number, actionSeq?: number, approvedHostless?: boolean, hostlessRestoreGeneration?: *, hostlessRestoreCount?: *}} input
 * @returns {{hostPlayerIndex: number|undefined, hostEpoch: number|undefined, actionSeq: number|undefined, applyHostlessMetadata: boolean, hostlessRestoreGeneration: *, hostlessRestoreCount: *}}
 */
function planRestoredRoomMetadata(input = {}) {
    const approvedHostless = input.approvedHostless === true;
    const hostlessRestoreGeneration = input.hostlessRestoreGeneration || 0;
    const hostlessRestoreCount = input.hostlessRestoreCount || 0;
    return Object.freeze({
        hostPlayerIndex: input.playerIndex,
        hostEpoch: approvedHostless ? input.hostEpoch + 1 : input.hostEpoch,
        actionSeq: input.actionSeq,
        applyHostlessMetadata: approvedHostless,
        hostlessRestoreGeneration: approvedHostless
            ? hostlessRestoreGeneration + 1
            : hostlessRestoreGeneration,
        hostlessRestoreCount: approvedHostless
            ? hostlessRestoreCount + 1
            : hostlessRestoreCount,
    });
}

/**
 * Applies a validated restore metadata plan to the existing game-start payload.
 * @param {Object} gameStartPayload
 * @param {Object} metadata
 * @param {{hostlessRestoreGenerationField?: string, hostlessRestoreCountField?: string}} [fields]
 * @returns {Object}
 */
function applyRestoredRoomMetadata(gameStartPayload, metadata, fields = {}) {
    gameStartPayload.hostPlayerIndex = metadata.hostPlayerIndex;
    gameStartPayload.hostEpoch = metadata.hostEpoch;
    gameStartPayload.actionSeq = metadata.actionSeq;
    if (metadata.applyHostlessMetadata) {
        gameStartPayload[fields.hostlessRestoreGenerationField] = metadata.hostlessRestoreGeneration;
        gameStartPayload[fields.hostlessRestoreCountField] = metadata.hostlessRestoreCount;
    }
    return gameStartPayload;
}

const RESTORED_ROOM_ACTIVATION_DECISIONS = Object.freeze({
    INSTALL_NEW: 'install-new',
    REPLACE_EXISTING: 'replace-existing',
    REJECT_EXISTING_HOSTLESS: 'reject-existing-hostless',
});

/**
 * Selects the existing-room activation branch without touching the room map.
 * @param {{roomExists?: boolean, approvedHostless?: boolean}} input
 * @returns {{decision: string, detachExisting: boolean, deleteExisting: boolean, install: boolean}}
 */
function planRestoredRoomActivation(input = {}) {
    const roomExists = input.roomExists === true;
    const approvedHostless = input.approvedHostless === true;
    const reject = roomExists && approvedHostless;
    const replace = roomExists && !approvedHostless;
    return Object.freeze({
        decision: reject
            ? RESTORED_ROOM_ACTIVATION_DECISIONS.REJECT_EXISTING_HOSTLESS
            : (replace
                ? RESTORED_ROOM_ACTIVATION_DECISIONS.REPLACE_EXISTING
                : RESTORED_ROOM_ACTIVATION_DECISIONS.INSTALL_NEW),
        detachExisting: replace,
        deleteExisting: replace,
        install: !reject,
    });
}

function restoredRoomActivationEffectAuthorityEnabled(env = {}) {
    return ['1', 'true'].includes(
        String(env.RESTORED_ROOM_ACTIVATION_EFFECT_AUTHORITY_ENABLED || '').trim().toLowerCase()
    );
}

function executeRestoredRoomActivation(plan = {}, effects = {}) {
    const requiredEffects = [];
    if (plan.detachExisting) requiredEffects.push('detachExisting');
    if (plan.deleteExisting) requiredEffects.push('deleteExisting');
    if (plan.install) requiredEffects.push('install');
    for (const name of requiredEffects) {
        if (typeof effects[name] !== 'function') {
            throw new TypeError(`${name} effect is required`);
        }
    }
    const executed = [];
    for (const name of requiredEffects) {
        effects[name]();
        executed.push(name);
    }
    return Object.freeze(executed);
}

function restoredRoomDeliveryEffectAuthorityEnabled(env = {}) {
    return ['1', 'true'].includes(
        String(env.RESTORED_ROOM_DELIVERY_EFFECT_AUTHORITY_ENABLED || '').trim().toLowerCase()
    );
}

function executeRestoredRoomDelivery(effects = {}) {
    const orderedEffects = [
        'persist',
        'joinSocket',
        'assignSocketRoom',
        'assignSocketPlayer',
        'emitRejoinData',
    ];
    for (const name of orderedEffects) {
        if (typeof effects[name] !== 'function') {
            throw new TypeError(`${name} effect is required`);
        }
    }
    for (const name of orderedEffects) effects[name]();
    return Object.freeze(orderedEffects.slice());
}

/**
 * Builds the mutable room shell from already-validated restore inputs.
 * Validation, authority, replay, persistence, socket effects, and mirror ownership
 * deliberately remain with the caller.
 * @param {{sanitizeStateSnapshot?: function(*, number): *, serializeMirrorState?: function(*, *, *, number): *, hostlessRestoreRoomLogId?: function(string): string}} [dependencies]
 * @returns {{buildRestoredRoom: function(Object): Object, buildRestoredMirrorStatePlan: function(Object): Object, planRestoredRoomCompletion: function(Object): Object, planRestoredRoomMetadata: function(Object): Object, applyRestoredRoomMetadata: function(Object, Object, Object): Object, planRestoredRoomActivation: function(Object): Object, executeRestoredRoomActivation: function(Object, Object): ReadonlyArray<string>, activationEffectAuthorityEnabled: function(Object): boolean, executeRestoredRoomDelivery: function(Object): ReadonlyArray<string>, deliveryEffectAuthorityEnabled: function(Object): boolean, activationDecisions: Object}}
 */
function makeRestoredRoom(dependencies = {}) {
    if (typeof dependencies.sanitizeStateSnapshot !== 'function') {
        throw new TypeError('sanitizeStateSnapshot dependency is required');
    }

    function buildRestoredMirrorStatePlan(input = {}) {
        if (typeof dependencies.serializeMirrorState !== 'function') {
            throw new TypeError('serializeMirrorState dependency is required');
        }
        const mirror = input.mirror;
        const lastUndoState = mirror && mirror.lastUndoState || null;
        return {
            canonicalMirror: mirror,
            lastUndoState,
            stateSnapshot: dependencies.serializeMirrorState(
                mirror.game,
                mirror.shopStock,
                lastUndoState,
                input.actionSeq
            ),
            actionLog: [],
        };
    }

    function planRestoredRoomCompletion(input = {}) {
        const approvedHostless = input.approvedHostless === true;
        let logMessage;
        if (approvedHostless) {
            if (typeof dependencies.hostlessRestoreRoomLogId !== 'function') {
                throw new TypeError('hostlessRestoreRoomLogId dependency is required');
            }
            logMessage = `[hostless-restore] roomHash=${dependencies.hostlessRestoreRoomLogId(input.roomId)} ` +
                `candidates=${input.restoredRoom.hostlessRestoreCandidateCount} ` +
                `generation=${input.restoredRoom.hostlessRestoreGeneration} result=approved`;
        } else {
            logMessage = `ルーム復元: ${input.roomId} by ${input.playerName}(${input.playerIndex})`;
        }
        return {
            logMessage,
            result: {
                ok: true,
                roomId: input.roomId,
                provisionalRestore: approvedHostless,
            },
        };
    }

    function buildRestoredRoom(input = {}) {
        const playerNames = Array.isArray(input.playerNames) ? input.playerNames : [];
        return {
            roomId: input.roomId,
            players: input.restoredPlayers,
            playerSettings: input.playerSettings,
            maxPlayers: playerNames.length,
            started: true,
            restored: true,
            hostPlayerIndex: input.playerIndex,
            hostEpoch: input.restoredHostEpoch,
            actionSeq: input.restoredActionSeq,
            enabledCards: input.enabledCards || [],
            enabledLandmarks: input.enabledLandmarks || [],
            cpuSpeed: input.cpuSpeed || 1500,
            gameStartPayload: input.gameStartPayload,
            stateSnapshot: dependencies.sanitizeStateSnapshot(
                input.replayStateSnapshot,
                playerNames.length
            ),
            acceptedClientActions: {},
            actionLog: input.sanitizedActionLog,
            lastUndoState: null,
            lastTouchedAt: input.now,
            provisionalRestore: input.approvedHostless === true,
            hostlessRestoreGeneration: input.hostlessRestoreGeneration || 0,
            hostlessRestoreCount: input.hostlessRestoreCount || 0,
            hostlessRestoreCandidateCount: input.approvedHostless === true &&
                Number.isInteger(input.candidateCount)
                ? input.candidateCount
                : 0,
        };
    }

    return Object.freeze({
        buildRestoredRoom,
        buildRestoredMirrorStatePlan,
        planRestoredRoomCompletion,
        planRestoredRoomMetadata,
        applyRestoredRoomMetadata,
        planRestoredRoomActivation,
        executeRestoredRoomActivation,
        activationEffectAuthorityEnabled: restoredRoomActivationEffectAuthorityEnabled,
        executeRestoredRoomDelivery,
        deliveryEffectAuthorityEnabled: restoredRoomDeliveryEffectAuthorityEnabled,
        activationDecisions: RESTORED_ROOM_ACTIVATION_DECISIONS,
    });
}

module.exports = makeRestoredRoom;
