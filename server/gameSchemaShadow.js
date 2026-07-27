'use strict';

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function gameSchemaShadowEnabled(env = {}) {
    return ENABLED_VALUES.has(String(env.GAME_SCHEMA_SHADOW_ENABLED || '').trim().toLowerCase());
}

function makeReport(status, actionEntry, details = {}) {
    return Object.freeze({
        status,
        action: actionEntry && actionEntry.action || '',
        actionSeq: Number.isInteger(actionEntry && actionEntry.seq) ? actionEntry.seq : 0,
        reason: details.reason || '',
        shadowHash: details.shadowHash || null,
        liveHash: details.liveHash || null,
    });
}

function makeGameSchemaShadow(options = {}) {
    const enabled = options.enabled === true;
    const serializeMirrorState = options.serializeMirrorState;
    const transitionMirrorEnvelope = options.transitionMirrorEnvelope;
    const stableStateHash = options.stableStateHash;

    function prepare(room, mirror, actionEntry) {
        if (!enabled || !room || !mirror || !actionEntry) return null;
        const selection = room.gameStartPayload && room.gameStartPayload.gameSchema;
        if (!selection) return null;
        if (typeof serializeMirrorState !== 'function' ||
                typeof transitionMirrorEnvelope !== 'function') {
            return Object.freeze({ ok: false, reason: 'shadow-adapter-missing', snapshot: null });
        }
        try {
            const previousActionSeq = Number.isInteger(actionEntry.seq) && actionEntry.seq > 0
                ? actionEntry.seq - 1 : 0;
            const sourceSnapshot = serializeMirrorState(
                mirror.game, mirror.shopStock, mirror.lastUndoState || null, previousActionSeq
            );
            return transitionMirrorEnvelope({
                selection,
                snapshot: sourceSnapshot,
                action: actionEntry.action,
                data: actionEntry.data,
                actionSeq: actionEntry.seq,
                enabledLandmarks: room.gameStartPayload.enabledLandmarks,
            });
        } catch (_) {
            return Object.freeze({ ok: false, reason: 'shadow-transition-threw', snapshot: null });
        }
    }

    function compare(mirror, actionEntry, transition) {
        if (!transition) return null;
        if (!transition.ok) return makeReport('transition-error', actionEntry, { reason: transition.reason });
        if (typeof serializeMirrorState !== 'function' || typeof stableStateHash !== 'function') {
            return makeReport('transition-error', actionEntry, { reason: 'shadow-adapter-missing' });
        }
        try {
            const liveSnapshot = serializeMirrorState(
                mirror.game, mirror.shopStock, mirror.lastUndoState || null, actionEntry.seq
            );
            const shadowHash = stableStateHash(transition.snapshot);
            const liveHash = stableStateHash(liveSnapshot);
            return makeReport(shadowHash === liveHash ? 'matched' : 'mismatch', actionEntry, {
                shadowHash,
                liveHash,
            });
        } catch (_) {
            return makeReport('transition-error', actionEntry, { reason: 'shadow-compare-threw' });
        }
    }

    return Object.freeze({ enabled, prepare, compare });
}

module.exports = Object.freeze({ gameSchemaShadowEnabled, makeGameSchemaShadow });
