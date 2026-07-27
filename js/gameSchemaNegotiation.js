'use strict';

const GAME_SCHEMA_LEGACY_VERSION = 0;
const GAME_SCHEMA_CURRENT_VERSION = 1;
const GAME_SCHEMA_CAPABILITIES = Object.freeze({
    actionVersions: Object.freeze([GAME_SCHEMA_LEGACY_VERSION, GAME_SCHEMA_CURRENT_VERSION]),
    snapshotVersions: Object.freeze([GAME_SCHEMA_LEGACY_VERSION, GAME_SCHEMA_CURRENT_VERSION]),
});
const GAME_SCHEMA_NEGOTIATION_FAILURES = Object.freeze({
    INVALID_LOCAL_CAPABILITIES: 'invalid-local-capabilities',
    INVALID_PEER_CAPABILITIES: 'invalid-peer-capabilities',
    NO_COMMON_ACTION_VERSION: 'no-common-action-version',
    NO_COMMON_SNAPSHOT_VERSION: 'no-common-snapshot-version',
});

function normalizeVersions(value) {
    if (!Array.isArray(value) || value.length === 0 ||
            value.some(version => !Number.isInteger(version) || version < 0)) return null;
    return Object.freeze(Array.from(new Set(value)).sort((left, right) => left - right));
}

function normalizeSchemaCapabilities(value, missingMeansLegacy = false) {
    if (value == null && missingMeansLegacy) {
        return Object.freeze({
            actionVersions: Object.freeze([GAME_SCHEMA_LEGACY_VERSION]),
            snapshotVersions: Object.freeze([GAME_SCHEMA_LEGACY_VERSION]),
            legacyPeer: true,
        });
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const actionVersions = normalizeVersions(value.actionVersions);
    const snapshotVersions = normalizeVersions(value.snapshotVersions);
    if (!actionVersions || !snapshotVersions) return null;
    return Object.freeze({ actionVersions, snapshotVersions, legacyPeer: false });
}

function highestCommonVersion(localVersions, peerCapabilities, key) {
    const common = localVersions.filter(version =>
        peerCapabilities.every(peer => peer[key].includes(version))
    );
    return common.length > 0 ? common[common.length - 1] : null;
}

function negotiationFailure(reason) {
    return Object.freeze({
        ok: false, reason, actionVersion: null, snapshotVersion: null, legacyOnly: false,
    });
}

function negotiateGameSchemaCapabilities(peerValues, localValue = GAME_SCHEMA_CAPABILITIES) {
    const local = normalizeSchemaCapabilities(localValue);
    if (!local) return negotiationFailure(GAME_SCHEMA_NEGOTIATION_FAILURES.INVALID_LOCAL_CAPABILITIES);
    if (!Array.isArray(peerValues)) {
        return negotiationFailure(GAME_SCHEMA_NEGOTIATION_FAILURES.INVALID_PEER_CAPABILITIES);
    }
    const peers = [];
    for (const value of peerValues) {
        const peer = normalizeSchemaCapabilities(value, true);
        if (!peer) return negotiationFailure(GAME_SCHEMA_NEGOTIATION_FAILURES.INVALID_PEER_CAPABILITIES);
        peers.push(peer);
    }
    const actionVersion = highestCommonVersion(local.actionVersions, peers, 'actionVersions');
    if (actionVersion === null) {
        return negotiationFailure(GAME_SCHEMA_NEGOTIATION_FAILURES.NO_COMMON_ACTION_VERSION);
    }
    const snapshotVersion = highestCommonVersion(local.snapshotVersions, peers, 'snapshotVersions');
    if (snapshotVersion === null) {
        return negotiationFailure(GAME_SCHEMA_NEGOTIATION_FAILURES.NO_COMMON_SNAPSHOT_VERSION);
    }
    return Object.freeze({
        ok: true,
        reason: '',
        actionVersion,
        snapshotVersion,
        legacyOnly: actionVersion === GAME_SCHEMA_LEGACY_VERSION &&
            snapshotVersion === GAME_SCHEMA_LEGACY_VERSION,
    });
}

const GameSchemaNegotiation = Object.freeze({
    legacyVersion: GAME_SCHEMA_LEGACY_VERSION,
    currentVersion: GAME_SCHEMA_CURRENT_VERSION,
    capabilities: GAME_SCHEMA_CAPABILITIES,
    failureReasons: GAME_SCHEMA_NEGOTIATION_FAILURES,
    normalizeSchemaCapabilities,
    negotiateGameSchemaCapabilities,
});

if (typeof module !== 'undefined' && module.exports) module.exports = GameSchemaNegotiation;
if (typeof window !== 'undefined') window.GameSchemaNegotiation = GameSchemaNegotiation;
if (typeof globalThis !== 'undefined') globalThis.GameSchemaNegotiation = GameSchemaNegotiation;
