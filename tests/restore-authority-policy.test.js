'use strict';

const assert = require('assert');
const {
    RESTORE_AUTHORITY_SOURCES,
    RESTORE_AUTHORITY_PRIORITY,
    selectRestoreAuthority,
} = require('../server/restoreAuthorityPolicy');
const { runTest } = require('./helpers/test-utils');

function validCandidate(overrides = {}) {
    return Object.assign({ present: true, valid: true, completed: false, conflict: false }, overrides);
}

runTest('restore authority priority is live, durable, signed, host, then quorum', () => {
    assert.deepStrictEqual(RESTORE_AUTHORITY_PRIORITY, [
        'live-room',
        'durable-canonical',
        'signed-server-state',
        'host-replay',
        'hostless-quorum',
    ]);
    assert.ok(Object.isFrozen(RESTORE_AUTHORITY_PRIORITY));

    const all = {
        durableCanonical: validCandidate({ authoritative: true }),
        signedServerState: validCandidate(),
        hostReplay: validCandidate(),
        hostlessQuorum: validCandidate({ confirmed: true }),
    };
    assert.deepStrictEqual(selectRestoreAuthority(all), {
        ok: true,
        source: RESTORE_AUTHORITY_SOURCES.DURABLE_CANONICAL,
    });
    assert.deepStrictEqual(selectRestoreAuthority({
        ...all,
        durableCanonical: { authoritative: true, present: false },
    }), {
        ok: true,
        source: RESTORE_AUTHORITY_SOURCES.SIGNED_SERVER_STATE,
    });
});

runTest('live room can never be replaced by a restore candidate', () => {
    assert.deepStrictEqual(selectRestoreAuthority({
        liveRoomPresent: true,
        durableCanonical: validCandidate({ authoritative: true }),
    }), {
        ok: false,
        reason: 'live-room-present',
        source: RESTORE_AUTHORITY_SOURCES.LIVE_ROOM,
    });
});

runTest('only an authoritative durable adapter can outrank signed state', () => {
    const signedServerState = validCandidate();
    assert.strictEqual(selectRestoreAuthority({
        durableCanonical: validCandidate({ authoritative: false }),
        signedServerState,
    }).source, RESTORE_AUTHORITY_SOURCES.SIGNED_SERVER_STATE);
    assert.strictEqual(selectRestoreAuthority({
        durableCanonical: validCandidate({ authoritative: true }),
        signedServerState,
    }).source, RESTORE_AUTHORITY_SOURCES.DURABLE_CANONICAL);
});

runTest('present invalid or conflicting higher authority fails closed', () => {
    assert.deepStrictEqual(selectRestoreAuthority({
        signedServerState: validCandidate({ valid: false }),
        hostReplay: validCandidate(),
    }), {
        ok: false,
        reason: 'invalid-authority',
        source: RESTORE_AUTHORITY_SOURCES.SIGNED_SERVER_STATE,
    });
    assert.deepStrictEqual(selectRestoreAuthority({
        hostReplay: validCandidate({ conflict: true }),
        hostlessQuorum: validCandidate({ confirmed: true }),
    }), {
        ok: false,
        reason: 'authority-conflict',
        source: RESTORE_AUTHORITY_SOURCES.HOST_REPLAY,
    });
});

runTest('completed state is terminal and cannot fall through to lower authority', () => {
    assert.deepStrictEqual(selectRestoreAuthority({
        durableCanonical: validCandidate({ authoritative: true, completed: true }),
        hostReplay: validCandidate(),
    }), {
        ok: false,
        reason: 'completed-state',
        source: RESTORE_AUTHORITY_SOURCES.DURABLE_CANONICAL,
    });
});

runTest('hostless quorum requires explicit confirmation and otherwise fails closed', () => {
    assert.deepStrictEqual(selectRestoreAuthority({
        hostlessQuorum: validCandidate(),
    }), {
        ok: false,
        reason: 'confirmation-required',
        source: RESTORE_AUTHORITY_SOURCES.HOSTLESS_QUORUM,
    });
    assert.deepStrictEqual(selectRestoreAuthority({
        hostlessQuorum: validCandidate({ confirmed: true }),
    }), {
        ok: true,
        source: RESTORE_AUTHORITY_SOURCES.HOSTLESS_QUORUM,
    });
    assert.deepStrictEqual(selectRestoreAuthority({}), {
        ok: false,
        reason: 'no-authority',
        source: '',
    });
});
