'use strict';

const GameSchemaWireCodec = typeof module !== 'undefined' && module.exports
    ? require('./gameSchemaCodec')
    : globalThis.GameSchemaCodec;

const GAME_SCHEMA_WIRE_FAILURES = Object.freeze({
    INVALID_PAYLOAD: 'invalid-payload',
    CODEC_REJECTED: 'codec-rejected',
});

function result(ok, reason, value = null, codecReason = '') {
    return Object.freeze({ ok, reason, value, codecReason });
}

function isPayloadObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeActionMetadata(source, core) {
    const output = {};
    for (const key of Object.keys(source)) {
        if (key === 'schemaVersion' || key === 'action' || key === 'data') continue;
        output[key] = source[key];
    }
    return Object.assign(output, core);
}

function transformAction(enabled, selection, payload, transform) {
    if (enabled !== true) return result(true, '', payload);
    if (!isPayloadObject(payload)) return result(false, GAME_SCHEMA_WIRE_FAILURES.INVALID_PAYLOAD);
    const transformed = transform(selection, payload);
    if (!transformed.ok) {
        return result(false, GAME_SCHEMA_WIRE_FAILURES.CODEC_REJECTED, null, transformed.reason);
    }
    return result(true, '', mergeActionMetadata(payload, transformed.value));
}

function transformSnapshot(enabled, selection, snapshot, transform) {
    if (enabled !== true || snapshot == null) return result(true, '', snapshot);
    const transformed = transform(selection, snapshot);
    if (!transformed.ok) {
        return result(false, GAME_SCHEMA_WIRE_FAILURES.CODEC_REJECTED, null, transformed.reason);
    }
    return result(true, '', transformed.value);
}

function transformSnapshotField(enabled, selection, payload, transform) {
    if (enabled !== true) return result(true, '', payload);
    if (!isPayloadObject(payload)) return result(false, GAME_SCHEMA_WIRE_FAILURES.INVALID_PAYLOAD);
    if (!Object.prototype.hasOwnProperty.call(payload, 'stateSnapshot') || payload.stateSnapshot == null) {
        return result(true, '', payload);
    }
    const transformed = transformSnapshot(true, selection, payload.stateSnapshot, transform);
    if (!transformed.ok) return transformed;
    return result(true, '', Object.assign({}, payload, { stateSnapshot: transformed.value }));
}

function encodeAction(enabled, selection, payload) {
    return transformAction(enabled, selection, payload, (selected, source) =>
        GameSchemaWireCodec.encodeAction(selected, source.action, source.data)
    );
}

function decodeAction(enabled, selection, payload) {
    return transformAction(enabled, selection, payload, (selected, source) =>
        GameSchemaWireCodec.decodeAction(selected, source)
    );
}

function encodeSnapshot(enabled, selection, snapshot) {
    return transformSnapshot(enabled, selection, snapshot, (selected, source) =>
        GameSchemaWireCodec.encodeSnapshot(selected, source)
    );
}

function decodeSnapshot(enabled, selection, snapshot) {
    return transformSnapshot(enabled, selection, snapshot, (selected, source) =>
        GameSchemaWireCodec.decodeSnapshot(selected, source)
    );
}

function encodeSnapshotField(enabled, selection, payload) {
    return transformSnapshotField(enabled, selection, payload, (selected, source) =>
        GameSchemaWireCodec.encodeSnapshot(selected, source)
    );
}

function decodeSnapshotField(enabled, selection, payload) {
    return transformSnapshotField(enabled, selection, payload, (selected, source) =>
        GameSchemaWireCodec.decodeSnapshot(selected, source)
    );
}

function encodeActionPayload(actionEnabled, snapshotEnabled, selection, payload) {
    const encodedAction = encodeAction(actionEnabled, selection, payload);
    if (!encodedAction.ok) return encodedAction;
    return encodeSnapshotField(snapshotEnabled, selection, encodedAction.value);
}

function decodeActionPayload(actionEnabled, snapshotEnabled, selection, payload) {
    const decodedAction = decodeAction(actionEnabled, selection, payload);
    if (!decodedAction.ok) return decodedAction;
    return decodeSnapshotField(snapshotEnabled, selection, decodedAction.value);
}

const GameSchemaWire = Object.freeze({
    failureReasons: GAME_SCHEMA_WIRE_FAILURES,
    encodeAction,
    decodeAction,
    encodeSnapshot,
    decodeSnapshot,
    encodeSnapshotField,
    decodeSnapshotField,
    encodeActionPayload,
    decodeActionPayload,
});

if (typeof module !== 'undefined' && module.exports) module.exports = GameSchemaWire;
if (typeof window !== 'undefined') window.GameSchemaWire = GameSchemaWire;
if (typeof globalThis !== 'undefined') globalThis.GameSchemaWire = GameSchemaWire;
