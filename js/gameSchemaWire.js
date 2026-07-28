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

const GameSchemaWire = Object.freeze({
    failureReasons: GAME_SCHEMA_WIRE_FAILURES,
    encodeAction,
    decodeAction,
});

if (typeof module !== 'undefined' && module.exports) module.exports = GameSchemaWire;
if (typeof window !== 'undefined') window.GameSchemaWire = GameSchemaWire;
if (typeof globalThis !== 'undefined') globalThis.GameSchemaWire = GameSchemaWire;
