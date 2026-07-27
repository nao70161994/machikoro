'use strict';

const GameActionContractApi = typeof module !== 'undefined' && module.exports
    ? require('./actionContract')
    : globalThis.GameActionContract;
const GameSnapshotApi = typeof module !== 'undefined' && module.exports
    ? require('./gameSnapshot')
    : globalThis.GameSnapshot;
const GameSchemaNegotiationApi = typeof module !== 'undefined' && module.exports
    ? require('./gameSchemaNegotiation')
    : globalThis.GameSchemaNegotiation;

const GAME_SCHEMA_CODEC_FAILURES = Object.freeze({
    INVALID_SELECTION: 'invalid-selection',
    INVALID_ACTION: 'invalid-action',
    INVALID_SNAPSHOT: 'invalid-snapshot',
    VERSION_MISMATCH: 'version-mismatch',
});

function result(ok, reason, value = null) {
    return Object.freeze({ ok, reason, value });
}

function selectedVersion(selection, field) {
    if (selection == null) return 0;
    if (!GameSchemaNegotiationApi || !GameSchemaNegotiationApi.supportsSelection(
        GameSchemaNegotiationApi.capabilities, selection
    )) return null;
    return selection[field];
}

function encodeAction(selection, action, data = {}) {
    const version = selectedVersion(selection, 'actionVersion');
    if (version == null) return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_SELECTION);
    const envelope = GameActionContractApi.createActionEnvelope(action, data);
    if (!envelope) return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_ACTION);
    if (version === GameActionContractApi.legacySchemaVersion) {
        return result(true, '', { action: envelope.action, data: envelope.data });
    }
    if (version === GameActionContractApi.schemaVersion) return result(true, '', envelope);
    return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_SELECTION);
}

function decodeAction(selection, value) {
    const version = selectedVersion(selection, 'actionVersion');
    if (version == null) return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_SELECTION);
    const decoded = GameActionContractApi.readActionEnvelope(value);
    if (!decoded.ok) return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_ACTION);
    if (decoded.schemaVersion !== version) return result(false, GAME_SCHEMA_CODEC_FAILURES.VERSION_MISMATCH);
    return result(true, '', { action: decoded.action, data: decoded.data });
}

function encodeSnapshot(selection, snapshot) {
    const version = selectedVersion(selection, 'snapshotVersion');
    if (version == null) return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_SELECTION);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_SNAPSHOT);
    }
    if (version === GameSnapshotApi.legacyVersion) return result(true, '', snapshot);
    if (version === GameSnapshotApi.schemaVersion) {
        return result(true, '', GameSnapshotApi.createSnapshotEnvelope(snapshot));
    }
    return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_SELECTION);
}

function decodeSnapshot(selection, value) {
    const version = selectedVersion(selection, 'snapshotVersion');
    if (version == null) return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_SELECTION);
    const decoded = GameSnapshotApi.readSnapshotEnvelope(value);
    if (!decoded.ok) return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_SNAPSHOT);
    if (decoded.schemaVersion !== version) return result(false, GAME_SCHEMA_CODEC_FAILURES.VERSION_MISMATCH);
    return result(true, '', decoded.snapshot);
}

const GameSchemaCodec = Object.freeze({
    failureReasons: GAME_SCHEMA_CODEC_FAILURES,
    encodeAction,
    decodeAction,
    encodeSnapshot,
    decodeSnapshot,
});

if (typeof module !== 'undefined' && module.exports) module.exports = GameSchemaCodec;
if (typeof window !== 'undefined') window.GameSchemaCodec = GameSchemaCodec;
if (typeof globalThis !== 'undefined') globalThis.GameSchemaCodec = GameSchemaCodec;
