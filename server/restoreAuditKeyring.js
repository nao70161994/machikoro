const RESTORE_AUDIT_DEFAULT_KEY_ID = 'restore-audit-v1';
const RESTORE_AUDIT_MAX_KEY_COUNT = 8;
const RESTORE_AUDIT_MAX_KEY_ID_LENGTH = 96;
const RESTORE_AUDIT_MAX_SECRET_LENGTH = 1024;

function positiveSafeInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function validKeyId(value) {
    return typeof value === 'string' &&
        value.length > 0 &&
        value.length <= RESTORE_AUDIT_MAX_KEY_ID_LENGTH &&
        /^[A-Za-z0-9._:-]+$/.test(value);
}

function validSecret(value) {
    return typeof value === 'string' &&
        value.length > 0 &&
        value.length <= RESTORE_AUDIT_MAX_SECRET_LENGTH;
}

function parseRestoreAuditKeyring(value) {
    if (typeof value !== 'string' || !value.trim()) return Object.freeze({});
    let parsed;
    try {
        parsed = JSON.parse(value);
    } catch (_) {
        return Object.freeze({});
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return Object.freeze({});
    const entries = Object.entries(parsed)
        .filter(([keyId, secret]) => validKeyId(keyId) && validSecret(secret))
        .slice(0, RESTORE_AUDIT_MAX_KEY_COUNT);
    return Object.freeze(Object.fromEntries(entries));
}

function restoreAuditKeyringConfig(env = process.env) {
    const configuredKeys = parseRestoreAuditKeyring(
        env.RESTORE_AUDIT_KEYRING_JSON || env.MACHIKORO_RESTORE_AUDIT_KEYRING_JSON || ''
    );
    const keys = Object.assign({}, configuredKeys);
    const legacySecret = String(env.RESTORE_AUDIT_SECRET || env.MACHIKORO_RESTORE_AUDIT_SECRET || '');
    if (validSecret(legacySecret) && !keys[RESTORE_AUDIT_DEFAULT_KEY_ID]) {
        keys[RESTORE_AUDIT_DEFAULT_KEY_ID] = legacySecret;
    }
    const requestedActiveKeyId = String(
        env.RESTORE_AUDIT_ACTIVE_KEY_ID || env.MACHIKORO_RESTORE_AUDIT_ACTIVE_KEY_ID || ''
    );
    const activeKeyId = requestedActiveKeyId
        ? (validKeyId(requestedActiveKeyId) && keys[requestedActiveKeyId] ? requestedActiveKeyId : '')
        : (keys[RESTORE_AUDIT_DEFAULT_KEY_ID] ? RESTORE_AUDIT_DEFAULT_KEY_ID : '');
    return Object.freeze({
        keys: Object.freeze(keys),
        activeKeyId,
        activeSecret: activeKeyId ? keys[activeKeyId] : '',
        maxAgeMs: positiveSafeInteger(
            env.RESTORE_AUDIT_MAX_AGE_MS || env.MACHIKORO_RESTORE_AUDIT_MAX_AGE_MS
        ),
        clockSkewMs: positiveSafeInteger(
            env.RESTORE_AUDIT_CLOCK_SKEW_MS || env.MACHIKORO_RESTORE_AUDIT_CLOCK_SKEW_MS
        ) || 60_000,
    });
}

module.exports = {
    RESTORE_AUDIT_DEFAULT_KEY_ID,
    RESTORE_AUDIT_MAX_KEY_COUNT,
    parseRestoreAuditKeyring,
    restoreAuditKeyringConfig,
};
