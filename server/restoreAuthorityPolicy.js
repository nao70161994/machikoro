'use strict';

const RESTORE_AUTHORITY_SOURCES = Object.freeze({
    LIVE_ROOM: 'live-room',
    DURABLE_CANONICAL: 'durable-canonical',
    SIGNED_SERVER_STATE: 'signed-server-state',
    HOST_REPLAY: 'host-replay',
    HOSTLESS_QUORUM: 'hostless-quorum',
});

const RESTORE_AUTHORITY_PRIORITY = Object.freeze([
    RESTORE_AUTHORITY_SOURCES.LIVE_ROOM,
    RESTORE_AUTHORITY_SOURCES.DURABLE_CANONICAL,
    RESTORE_AUTHORITY_SOURCES.SIGNED_SERVER_STATE,
    RESTORE_AUTHORITY_SOURCES.HOST_REPLAY,
    RESTORE_AUTHORITY_SOURCES.HOSTLESS_QUORUM,
]);

function reject(reason, source = '') {
    return Object.freeze({ ok: false, reason, source });
}

function accept(source) {
    return Object.freeze({ ok: true, source });
}

function candidateDecision(source, candidate, options = {}) {
    if (!candidate || candidate.present !== true) return null;
    if (candidate.conflict === true) return reject('authority-conflict', source);
    if (candidate.valid !== true) return reject('invalid-authority', source);
    if (options.requiresConfirmation === true && candidate.confirmed !== true) {
        return reject('confirmation-required', source);
    }
    if (candidate.completed === true) return reject('completed-state', source);
    return accept(source);
}

function selectRestoreAuthority(input = {}) {
    if (input.liveRoomPresent === true) {
        return reject('live-room-present', RESTORE_AUTHORITY_SOURCES.LIVE_ROOM);
    }

    const durable = input.durableCanonical || null;
    if (durable && durable.authoritative === true) {
        const decision = candidateDecision(RESTORE_AUTHORITY_SOURCES.DURABLE_CANONICAL, durable);
        if (decision) return decision;
    }

    const signedDecision = candidateDecision(
        RESTORE_AUTHORITY_SOURCES.SIGNED_SERVER_STATE,
        input.signedServerState
    );
    if (signedDecision) return signedDecision;

    const hostDecision = candidateDecision(
        RESTORE_AUTHORITY_SOURCES.HOST_REPLAY,
        input.hostReplay
    );
    if (hostDecision) return hostDecision;

    const quorumDecision = candidateDecision(
        RESTORE_AUTHORITY_SOURCES.HOSTLESS_QUORUM,
        input.hostlessQuorum,
        { requiresConfirmation: true }
    );
    if (quorumDecision) return quorumDecision;

    return reject('no-authority');
}

module.exports = Object.freeze({
    RESTORE_AUTHORITY_SOURCES,
    RESTORE_AUTHORITY_PRIORITY,
    selectRestoreAuthority,
});
