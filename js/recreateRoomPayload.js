'use strict';

const RecreateRoomPayload = (() => {
    const RECREATE_ROOM_LEGACY_SCHEMA_VERSION = 0;
    const RECREATE_ROOM_SCHEMA_VERSION = 1;
    const RECREATE_ROOM_PAYLOAD_FAILURES = Object.freeze({
    INVALID_PAYLOAD: 'invalid-payload',
    UNKNOWN_SCHEMA_VERSION: 'unknown-schema-version',
    });

    function result(ok, reason, value = null, schemaVersion = null) {
    return Object.freeze({ ok, reason, value, schemaVersion });
    }

    function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
    }

    function encode(enabled, payload) {
    if (enabled !== true) {
        return result(true, '', payload, RECREATE_ROOM_LEGACY_SCHEMA_VERSION);
    }
    if (!isPlainObject(payload)) {
        return result(false, RECREATE_ROOM_PAYLOAD_FAILURES.INVALID_PAYLOAD);
    }
    return result(true, '', Object.freeze({
        schemaVersion: RECREATE_ROOM_SCHEMA_VERSION,
        recreateRoom: payload,
    }), RECREATE_ROOM_SCHEMA_VERSION);
    }

    function decode(enabled, value) {
    if (enabled !== true) {
        return result(true, '', value, RECREATE_ROOM_LEGACY_SCHEMA_VERSION);
    }
    if (!isPlainObject(value)) {
        return result(false, RECREATE_ROOM_PAYLOAD_FAILURES.INVALID_PAYLOAD);
    }
    if (!Object.prototype.hasOwnProperty.call(value, 'schemaVersion')) {
        return result(true, '', value, RECREATE_ROOM_LEGACY_SCHEMA_VERSION);
    }
    if (value.schemaVersion !== RECREATE_ROOM_SCHEMA_VERSION) {
        return result(false, RECREATE_ROOM_PAYLOAD_FAILURES.UNKNOWN_SCHEMA_VERSION);
    }
    const keys = Object.keys(value);
    if (keys.length !== 2 || !keys.includes('recreateRoom') || !isPlainObject(value.recreateRoom)) {
        return result(false, RECREATE_ROOM_PAYLOAD_FAILURES.INVALID_PAYLOAD);
    }
    return result(true, '', value.recreateRoom, RECREATE_ROOM_SCHEMA_VERSION);
    }

    return Object.freeze({
    legacySchemaVersion: RECREATE_ROOM_LEGACY_SCHEMA_VERSION,
    schemaVersion: RECREATE_ROOM_SCHEMA_VERSION,
    failureReasons: RECREATE_ROOM_PAYLOAD_FAILURES,
    encode,
    decode,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RecreateRoomPayload;
if (typeof window !== 'undefined') window.RecreateRoomPayload = RecreateRoomPayload;
if (typeof globalThis !== 'undefined') globalThis.RecreateRoomPayload = RecreateRoomPayload;
