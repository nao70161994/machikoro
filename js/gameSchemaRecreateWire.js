'use strict';

const GameSchemaRecreateWire = (() => {
    const recreatePayloadCodec = typeof module !== 'undefined' && module.exports
        ? require('./recreateRoomPayload')
        : globalThis.RecreateRoomPayload;
    const gameSchemaWireCodec = typeof module !== 'undefined' && module.exports
        ? require('./gameSchemaWire')
        : globalThis.GameSchemaWire;

    const FAILURES = Object.freeze({
        INVALID_PAYLOAD: 'invalid-payload',
        RECREATE_CODEC_REJECTED: 'recreate-codec-rejected',
        SNAPSHOT_CODEC_REJECTED: 'snapshot-codec-rejected',
        ACTION_CODEC_REJECTED: 'action-codec-rejected',
    });

    function buildResult(ok, reason, value = null, codecReason = '') {
        return Object.freeze({ ok, reason, value, codecReason });
    }

    function isPayloadObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function selectionFor(payload) {
        return payload && payload.gameStartPayload && payload.gameStartPayload.gameSchema || null;
    }

    function transformActionLog(payload, selection, transform) {
        if (!Object.prototype.hasOwnProperty.call(payload, 'actionLog')) {
            return buildResult(true, '', payload);
        }
        if (!Array.isArray(payload.actionLog)) {
            return buildResult(false, FAILURES.INVALID_PAYLOAD);
        }
        const actionLog = [];
        for (const entry of payload.actionLog) {
            const transformed = transform(true, true, selection, entry);
            if (!transformed.ok) {
                return buildResult(
                    false,
                    FAILURES.ACTION_CODEC_REJECTED,
                    null,
                    transformed.codecReason || transformed.reason
                );
            }
            actionLog.push(transformed.value);
        }
        return buildResult(true, '', Object.assign({}, payload, { actionLog }));
    }

    function transformNested(payload, direction) {
        if (!isPayloadObject(payload)) return buildResult(false, FAILURES.INVALID_PAYLOAD);
        const selection = selectionFor(payload);
        const snapshotTransform = direction === 'encode'
            ? gameSchemaWireCodec.encodeSnapshotField
            : gameSchemaWireCodec.decodeSnapshotField;
        const actionTransform = direction === 'encode'
            ? gameSchemaWireCodec.encodeActionPayload
            : gameSchemaWireCodec.decodeActionPayload;
        const snapshot = snapshotTransform(true, selection, payload);
        if (!snapshot.ok) {
            return buildResult(
                false,
                FAILURES.SNAPSHOT_CODEC_REJECTED,
                null,
                snapshot.codecReason || snapshot.reason
            );
        }
        return transformActionLog(snapshot.value, selection, actionTransform);
    }

    function encode(enabled, payload) {
        if (enabled !== true) return recreatePayloadCodec.encode(false, payload);
        const transformed = transformNested(payload, 'encode');
        if (!transformed.ok) return transformed;
        const encoded = recreatePayloadCodec.encode(true, transformed.value);
        if (!encoded.ok) {
            return buildResult(false, FAILURES.RECREATE_CODEC_REJECTED, null, encoded.reason);
        }
        return buildResult(true, '', encoded.value);
    }

    function decode(enabled, payload) {
        const decoded = recreatePayloadCodec.decode(enabled === true, payload);
        if (!decoded.ok) {
            return buildResult(false, FAILURES.RECREATE_CODEC_REJECTED, null, decoded.reason);
        }
        if (enabled !== true || decoded.schemaVersion === recreatePayloadCodec.legacySchemaVersion) {
            return buildResult(true, '', decoded.value);
        }
        return transformNested(decoded.value, 'decode');
    }

    return Object.freeze({
        failureReasons: FAILURES,
        encode,
        decode,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameSchemaRecreateWire;
if (typeof window !== 'undefined') window.GameSchemaRecreateWire = GameSchemaRecreateWire;
if (typeof globalThis !== 'undefined') globalThis.GameSchemaRecreateWire = GameSchemaRecreateWire;
