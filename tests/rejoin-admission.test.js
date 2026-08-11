'use strict';

const assert = require('assert');
const {
    REJOIN_ADMISSION_ERRORS,
    makeRejoinAdmission,
} = require('../server/rejoinAdmission');
const { runTest } = require('./helpers/test-utils');

function makeAdmission() {
    return makeRejoinAdmission({
        limits: {
            socketCooldownMs: 1000,
            identityRateLimitWindowMs: 10_000,
            identityRateLimitMax: 3,
            identityRateLimitMaxBuckets: 10,
        },
    });
}

runTest('rejoin admissionは同一socketの短時間連投だけをcooldown拒否する', () => {
    const admission = makeAdmission();
    const socket = {};
    assert.deepStrictEqual(admission.admit(socket, 'ROOM01', 1, 1000), { ok: true, message: '' });
    assert.deepStrictEqual(admission.admit(socket, 'ROOM01', 1, 1999), {
        ok: false,
        message: REJOIN_ADMISSION_ERRORS.SOCKET_COOLDOWN,
    });
    assert.deepStrictEqual(admission.admit(socket, 'ROOM01', 1, 2000), { ok: true, message: '' });
});

runTest('rejoin admissionはfresh socketでもroom/player identityの上限を共有する', () => {
    const admission = makeAdmission();
    for (let attempt = 0; attempt < 3; attempt++) {
        assert.strictEqual(admission.admit({}, 'ROOM01', 1, 1000 + attempt).ok, true);
    }
    assert.deepStrictEqual(admission.admit({}, 'ROOM01', 1, 1004), {
        ok: false,
        message: REJOIN_ADMISSION_ERRORS.IDENTITY_RATE_LIMIT,
    });
    assert.strictEqual(admission.admit({}, 'ROOM01', 2, 1005).ok, true);
    assert.strictEqual(admission.admit({}, 'ROOM02', 1, 1006).ok, true);
});

runTest('rejoin admissionはwindow経過後に同じidentityを再許可する', () => {
    const admission = makeAdmission();
    for (let attempt = 0; attempt < 3; attempt++) {
        assert.strictEqual(admission.admit({}, 'ROOM01', 1, 1000 + attempt).ok, true);
    }
    assert.strictEqual(admission.admit({}, 'ROOM01', 1, 9999).ok, false);
    assert.strictEqual(admission.admit({}, 'ROOM01', 1, 11000).ok, true);
});

runTest('rejoin admissionの既定値は3秒8回retryを阻害しない', () => {
    const admission = makeRejoinAdmission();
    const socket = {};
    for (let attempt = 0; attempt < 8; attempt++) {
        assert.strictEqual(
            admission.admit(socket, 'ROOM01', 1, 1000 + attempt * 3000).ok,
            true
        );
    }
    assert.deepStrictEqual(admission.limits, {
        socketCooldownMs: 1000,
        identityRateLimitWindowMs: 60_000,
        identityRateLimitMax: 12,
        identityRateLimitMaxBuckets: 2000,
    });
});
