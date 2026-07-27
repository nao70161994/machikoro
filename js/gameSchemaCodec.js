'use strict';

const GameSchemaCodecActionContract = typeof module !== 'undefined' && module.exports
    ? require('./actionContract')
    : globalThis.GameActionContract;
const GameSchemaCodecSnapshot = typeof module !== 'undefined' && module.exports
    ? require('./gameSnapshot')
    : globalThis.GameSnapshot;
const GameSchemaCodecNegotiation = typeof module !== 'undefined' && module.exports
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
    if (!GameSchemaCodecNegotiation || !GameSchemaCodecNegotiation.supportsSelection(
        GameSchemaCodecNegotiation.capabilities, selection
    )) return null;
    return selection[field];
}

function encodeAction(selection, action, data = {}) {
    const version = selectedVersion(selection, 'actionVersion');
    if (version == null) return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_SELECTION);
    const envelope = GameSchemaCodecActionContract.createActionEnvelope(action, data);
    if (!envelope) return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_ACTION);
    if (version === GameSchemaCodecActionContract.legacySchemaVersion) {
        return result(true, '', { action: envelope.action, data: envelope.data });
    }
    if (version === GameSchemaCodecActionContract.schemaVersion) return result(true, '', envelope);
    return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_SELECTION);
}

function decodeAction(selection, value) {
    const version = selectedVersion(selection, 'actionVersion');
    if (version == null) return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_SELECTION);
    const decoded = GameSchemaCodecActionContract.readActionEnvelope(value);
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
    if (version === GameSchemaCodecSnapshot.legacyVersion) return result(true, '', snapshot);
    if (version === GameSchemaCodecSnapshot.schemaVersion) {
        return result(true, '', GameSchemaCodecSnapshot.createSnapshotEnvelope(snapshot));
    }
    return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_SELECTION);
}

function decodeSnapshot(selection, value) {
    const version = selectedVersion(selection, 'snapshotVersion');
    if (version == null) return result(false, GAME_SCHEMA_CODEC_FAILURES.INVALID_SELECTION);
    const decoded = GameSchemaCodecSnapshot.readSnapshotEnvelope(value);
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
