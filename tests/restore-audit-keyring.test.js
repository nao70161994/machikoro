const assert = require('assert');
const crypto = require('crypto');
const {
    RESTORE_AUDIT_DEFAULT_KEY_ID,
    RESTORE_AUDIT_MAX_KEY_COUNT,
    parseRestoreAuditKeyring,
    restoreAuditKeyringConfig,
} = require('../server/restoreAuditKeyring');
const {
    buildSignedRestoreAuditRecord,
    verifySignedRestoreAuditRecord,
} = require('../server/restoreAudit');
const { runTest } = require('./helpers/test-utils');

const payload = { gameStartPayload: { playerNames: ['A', 'B'] }, stateSnapshot: { actionSeq: 4 } };

runTest('restore audit keyring はlegacy secretを既存key idへ割り当てる', () => {
    const config = restoreAuditKeyringConfig({ RESTORE_AUDIT_SECRET: 'legacy-secret' });
    assert.deepStrictEqual(config.keys, { [RESTORE_AUDIT_DEFAULT_KEY_ID]: 'legacy-secret' });
    assert.strictEqual(config.activeKeyId, RESTORE_AUDIT_DEFAULT_KEY_ID);
    assert.strictEqual(config.activeSecret, 'legacy-secret');
    assert.strictEqual(config.maxAgeMs, null);
    assert.strictEqual(config.clockSkewMs, 60_000);
});

runTest('restore audit keyring はactive keyと旧keyを同時に保持する', () => {
    const config = restoreAuditKeyringConfig({
        RESTORE_AUDIT_SECRET: 'legacy-secret',
        RESTORE_AUDIT_KEYRING_JSON: JSON.stringify({ 'restore-audit-v2': 'new-secret' }),
        RESTORE_AUDIT_ACTIVE_KEY_ID: 'restore-audit-v2',
        RESTORE_AUDIT_MAX_AGE_MS: '3600000',
        RESTORE_AUDIT_CLOCK_SKEW_MS: '5000',
    });
    assert.deepStrictEqual(config.keys, {
        'restore-audit-v2': 'new-secret',
        [RESTORE_AUDIT_DEFAULT_KEY_ID]: 'legacy-secret',
    });
    assert.strictEqual(config.activeSecret, 'new-secret');
    assert.strictEqual(config.maxAgeMs, 3_600_000);
    assert.strictEqual(config.clockSkewMs, 5_000);
});

runTest('restore audit keyring parser は不正JSON・危険key・過大件数をfail closedにする', () => {
    assert.deepStrictEqual(parseRestoreAuditKeyring('{broken'), {});
    assert.deepStrictEqual(parseRestoreAuditKeyring(JSON.stringify({ 'bad key': 'secret', ok: '' })), {});
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, index) => ['key-' + index, 'secret-' + index]));
    assert.strictEqual(Object.keys(parseRestoreAuditKeyring(JSON.stringify(many))).length, RESTORE_AUDIT_MAX_KEY_COUNT);
    const config = restoreAuditKeyringConfig({
        RESTORE_AUDIT_KEYRING_JSON: JSON.stringify({ known: 'secret' }),
        RESTORE_AUDIT_ACTIVE_KEY_ID: 'missing',
    });
    assert.strictEqual(config.activeKeyId, '');
    assert.strictEqual(config.activeSecret, '');
    assert.deepStrictEqual(config.keys, { known: 'secret' });
});

runTest('restore audit verification はactive key署名とrotation前署名をkey idで検証する', () => {
    const keys = { old: 'old-secret', current: 'current-secret' };
    const oldAudit = buildSignedRestoreAuditRecord('ROOM01', payload, {
        crypto,
        secret: keys.old,
        keyId: 'old',
        now: 10_000,
    });
    const currentAudit = buildSignedRestoreAuditRecord('ROOM01', payload, {
        crypto,
        secret: keys.current,
        keyId: 'current',
        now: 11_000,
    });
    assert.strictEqual(verifySignedRestoreAuditRecord(oldAudit, payload, {
        roomId: 'ROOM01', crypto, keyring: keys,
    }).ok, true);
    assert.strictEqual(verifySignedRestoreAuditRecord(currentAudit, payload, {
        roomId: 'ROOM01', crypto, keyring: keys,
    }).ok, true);
    assert.deepStrictEqual(verifySignedRestoreAuditRecord(currentAudit, payload, {
        roomId: 'ROOM01', crypto, keyring: { old: keys.old },
    }), { ok: false, reason: 'unknown-key-id' });
});

runTest('restore audit freshness は期限切れ・未来・createdAt欠落を区別する', () => {
    const audit = buildSignedRestoreAuditRecord('ROOM01', payload, {
        crypto,
        secret: 'secret',
        keyId: 'current',
        now: 100_000,
    });
    const options = {
        roomId: 'ROOM01',
        crypto,
        keyring: { current: 'secret' },
        maxAgeMs: 10_000,
        clockSkewMs: 1_000,
    };
    assert.strictEqual(verifySignedRestoreAuditRecord(audit, payload, {
        ...options, now: 109_999,
    }).ok, true);
    assert.deepStrictEqual(verifySignedRestoreAuditRecord(audit, payload, {
        ...options, now: 110_001,
    }), { ok: false, reason: 'expired' });
    assert.deepStrictEqual(verifySignedRestoreAuditRecord(audit, payload, {
        ...options, now: 98_999,
    }), { ok: false, reason: 'created-in-future' });
    const withoutCreatedAt = { ...audit, createdAt: 0 };
    assert.deepStrictEqual(verifySignedRestoreAuditRecord(withoutCreatedAt, payload, {
        ...options, now: 100_000,
    }), { ok: false, reason: 'missing-created-at' });
});

runTest('restore audit freshness未設定は既存の単一secret検証契約を維持する', () => {
    const audit = buildSignedRestoreAuditRecord('ROOM01', payload, {
        crypto,
        secret: 'legacy-secret',
        now: 1,
    });
    assert.strictEqual(verifySignedRestoreAuditRecord(audit, payload, {
        roomId: 'ROOM01', crypto, secret: 'legacy-secret', now: 999_999_999,
    }).ok, true);
});
