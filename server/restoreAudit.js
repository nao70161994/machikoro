const RESTORE_AUDIT_SCHEMA_VERSION = 1;
const RESTORE_AUDIT_SIGNATURE_ALGORITHMS = Object.freeze({
    UNSIGNED: 'unsigned',
    HMAC_SHA256: 'hmac-sha256',
});
const RESTORE_AUDIT_MAX_STRING_LENGTH = 256;
const RESTORE_AUDIT_HASH_PATTERN = /^[a-f0-9]{16,128}$/i;


function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function restoreAuditPayloadHash(cryptoModule, payload) {
    if (!cryptoModule || !payload) return '';
    return cryptoModule.createHash('sha256').update(stableJson(payload)).digest('hex');
}

function restoreAuditSignature(cryptoModule, secret, roomId, canonicalHash) {
    if (!cryptoModule || typeof secret !== 'string' || !secret || !canonicalHash) return '';
    return cryptoModule
        .createHmac('sha256', secret)
        .update(`${normalizeRestoreAuditRoomId(roomId)}\n${canonicalHash}`)
        .digest('hex');
}

function timingSafeEqualHex(cryptoModule, a, b) {
    if (!cryptoModule || typeof a !== 'string' || typeof b !== 'string') return false;
    if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b) || a.length !== b.length) return false;
    try {
        return cryptoModule.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
    } catch (_) {
        return false;
    }
}

function normalizeRestoreAuditRoomId(roomId) {
    return typeof roomId === 'string' ? roomId.trim().toUpperCase() : '';
}

function isShortString(value, maxLength = RESTORE_AUDIT_MAX_STRING_LENGTH) {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function validateRestoreAuditRecord(record, context = {}) {
    if (record == null) return { ok: true, record: null };
    if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, reason: 'not-object' };
    if (record.schemaVersion !== RESTORE_AUDIT_SCHEMA_VERSION) return { ok: false, reason: 'schema-version' };

    const roomId = normalizeRestoreAuditRoomId(record.roomId);
    if (!roomId) return { ok: false, reason: 'room-id' };
    const expectedRoomId = normalizeRestoreAuditRoomId(context.roomId);
    if (expectedRoomId && roomId !== expectedRoomId) return { ok: false, reason: 'room-mismatch' };

    const algorithm = record.algorithm || RESTORE_AUDIT_SIGNATURE_ALGORITHMS.UNSIGNED;
    if (!Object.values(RESTORE_AUDIT_SIGNATURE_ALGORITHMS).includes(algorithm)) return { ok: false, reason: 'algorithm' };
    const signed = record.signed === true;
    if (signed && algorithm === RESTORE_AUDIT_SIGNATURE_ALGORITHMS.UNSIGNED) return { ok: false, reason: 'signed-unsigned' };
    if (!signed && algorithm !== RESTORE_AUDIT_SIGNATURE_ALGORITHMS.UNSIGNED) return { ok: false, reason: 'unsigned-algorithm' };
    if (signed && !isShortString(record.signature)) return { ok: false, reason: 'signature' };
    if (record.signature != null && !isShortString(record.signature)) return { ok: false, reason: 'signature' };
    if (record.keyId != null && !isShortString(record.keyId, 96)) return { ok: false, reason: 'key-id' };
    if (record.canonicalHash != null && !RESTORE_AUDIT_HASH_PATTERN.test(record.canonicalHash)) return { ok: false, reason: 'canonical-hash' };
    if (record.payloadHash != null && !RESTORE_AUDIT_HASH_PATTERN.test(record.payloadHash)) return { ok: false, reason: 'payload-hash' };
    if (record.createdAt != null && (!Number.isInteger(record.createdAt) || record.createdAt < 0)) return { ok: false, reason: 'created-at' };
    if (record.source != null && !isShortString(record.source, 64)) return { ok: false, reason: 'source' };

    return {
        ok: true,
        record: {
            schemaVersion: RESTORE_AUDIT_SCHEMA_VERSION,
            roomId,
            signed,
            algorithm,
            keyId: typeof record.keyId === 'string' ? record.keyId : '',
            signature: typeof record.signature === 'string' ? record.signature : '',
            canonicalHash: typeof record.canonicalHash === 'string' ? record.canonicalHash.toLowerCase() : '',
            payloadHash: typeof record.payloadHash === 'string' ? record.payloadHash.toLowerCase() : '',
            createdAt: Number.isInteger(record.createdAt) ? record.createdAt : 0,
            source: typeof record.source === 'string' ? record.source : '',
        },
    };
}

function buildUnsignedRestoreAuditRecord(roomId, options = {}) {
    const normalizedRoomId = normalizeRestoreAuditRoomId(roomId);
    if (!normalizedRoomId) return null;
    return {
        schemaVersion: RESTORE_AUDIT_SCHEMA_VERSION,
        roomId: normalizedRoomId,
        signed: false,
        algorithm: RESTORE_AUDIT_SIGNATURE_ALGORITHMS.UNSIGNED,
        createdAt: Number.isInteger(options.now) ? options.now : Date.now(),
        source: typeof options.source === 'string' ? options.source.slice(0, 64) : 'client-restore-bundle',
    };
}


function buildSignedRestoreAuditRecord(roomId, payload, options = {}) {
    const cryptoModule = options.crypto;
    const secret = typeof options.secret === 'string' ? options.secret : '';
    const normalizedRoomId = normalizeRestoreAuditRoomId(roomId);
    if (!normalizedRoomId || !cryptoModule || !secret || !payload) return null;
    const canonicalHash = restoreAuditPayloadHash(cryptoModule, payload);
    const signature = restoreAuditSignature(cryptoModule, secret, normalizedRoomId, canonicalHash);
    if (!canonicalHash || !signature) return null;
    return {
        schemaVersion: RESTORE_AUDIT_SCHEMA_VERSION,
        roomId: normalizedRoomId,
        signed: true,
        algorithm: RESTORE_AUDIT_SIGNATURE_ALGORITHMS.HMAC_SHA256,
        keyId: typeof options.keyId === 'string' ? options.keyId.slice(0, 96) : 'restore-audit-v1',
        canonicalHash,
        payloadHash: canonicalHash,
        signature,
        createdAt: Number.isInteger(options.now) ? options.now : Date.now(),
        source: typeof options.source === 'string' ? options.source.slice(0, 64) : 'server-canonical-snapshot',
    };
}

function verifySignedRestoreAuditRecord(record, payload, options = {}) {
    const validation = validateRestoreAuditRecord(record, { roomId: options.roomId });
    if (!validation.ok) return validation;
    const audit = validation.record;
    if (!audit || !audit.signed || audit.algorithm !== RESTORE_AUDIT_SIGNATURE_ALGORITHMS.HMAC_SHA256) {
        return { ok: false, reason: 'not-signed' };
    }
    const cryptoModule = options.crypto;
    const secret = typeof options.secret === 'string' ? options.secret : '';
    if (!cryptoModule || !secret) return { ok: false, reason: 'missing-secret' };
    const canonicalHash = restoreAuditPayloadHash(cryptoModule, payload);
    if (!canonicalHash || audit.canonicalHash !== canonicalHash) return { ok: false, reason: 'canonical-mismatch' };
    const expectedSignature = restoreAuditSignature(cryptoModule, secret, audit.roomId, canonicalHash);
    if (!timingSafeEqualHex(cryptoModule, audit.signature, expectedSignature)) {
        return { ok: false, reason: 'signature-mismatch' };
    }
    return { ok: true, record: audit };
}

module.exports = {
    RESTORE_AUDIT_SCHEMA_VERSION,
    RESTORE_AUDIT_SIGNATURE_ALGORITHMS,
    validateRestoreAuditRecord,
    buildUnsignedRestoreAuditRecord,
    buildSignedRestoreAuditRecord,
    verifySignedRestoreAuditRecord,
};
