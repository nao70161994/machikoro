const assert = require('assert');
const makeRestoreAuditRuntime = require('../server/restoreAuditRuntime');
const { runTest } = require('./helpers/test-utils');

runTest('restore audit runtimeはactive secretとbuild optionを動的configから作る', () => {
    const crypto = { marker: 'crypto' };
    let version = 1;
    const runtime = makeRestoreAuditRuntime({
        crypto,
        getConfig: () => ({
            activeSecret: 'secret-' + version,
            activeKeyId: 'key-' + version,
            keys: { ['key-' + version]: 'secret-' + version },
            maxAgeMs: version * 1000,
            clockSkewMs: version * 100,
        }),
    });

    assert.strictEqual(runtime.restoreAuditSecret(), 'secret-1');
    assert.deepStrictEqual(runtime.restoreAuditBuildOptions(123), {
        crypto, secret: 'secret-1', keyId: 'key-1', now: 123,
    });
    version = 2;
    assert.deepStrictEqual(runtime.restoreAuditBuildOptions(456, 'server-action-log'), {
        crypto, secret: 'secret-2', keyId: 'key-2', now: 456, source: 'server-action-log',
    });
});

runTest('restore audit runtimeはverification optionへroomとkeyring policyをそのまま渡す', () => {
    const crypto = { marker: 'crypto' };
    const keys = { old: 'old-secret', current: 'new-secret' };
    const runtime = makeRestoreAuditRuntime({
        crypto,
        getConfig: () => ({ activeSecret: 'new-secret', activeKeyId: 'current', keys, maxAgeMs: 5000, clockSkewMs: 250 }),
    });

    assert.deepStrictEqual(runtime.restoreAuditVerificationOptions('ROOM01'), {
        roomId: 'ROOM01', crypto, keyring: keys, maxAgeMs: 5000, clockSkewMs: 250,
    });
});

runTest('restore audit runtimeは不正依存をconfig取得前に拒否する', () => {
    let configReads = 0;
    assert.throws(() => makeRestoreAuditRuntime({ getConfig: null, crypto: {} }), /getConfig must be a function/);
    assert.throws(() => makeRestoreAuditRuntime({ getConfig: () => { configReads++; }, crypto: null }), /crypto must be an object/);
    assert.strictEqual(configReads, 0);
});
