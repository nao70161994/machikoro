'use strict';

const GameSchemaNegotiation = require('../js/gameSchemaNegotiation');

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function gameSchemaNegotiationEnabled(env = {}) {
    return ENABLED_VALUES.has(String(env.GAME_SCHEMA_NEGOTIATION_ENABLED || '').trim().toLowerCase());
}

function gameSchemaWireEnabled(env = {}) {
    return ENABLED_VALUES.has(String(env.GAME_SCHEMA_WIRE_ENABLED || '').trim().toLowerCase());
}

function gameSchemaSnapshotWireEnabled(env = {}) {
    return ENABLED_VALUES.has(String(env.GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED || '').trim().toLowerCase());
}

function gameSchemaRecreateWireEnabled(env = {}) {
    return ENABLED_VALUES.has(String(env.GAME_SCHEMA_RECREATE_WIRE_ENABLED || '').trim().toLowerCase());
}

function localSaveSchemaWriteEnabled(env = {}) {
    return ENABLED_VALUES.has(String(env.LOCAL_SAVE_SCHEMA_WRITE_ENABLED || '').trim().toLowerCase());
}

function resolution(ok, capabilities, reason = '') {
    return Object.freeze({ ok, capabilities, reason });
}

function resolveClientGameSchemaCapabilities(value, enabled) {
    if (enabled !== true) return resolution(true, null);
    if (value == null) return resolution(true, null);
    const capabilities = GameSchemaNegotiation.normalizeSchemaCapabilities(value);
    if (!capabilities) {
        return resolution(false, null, GameSchemaNegotiation.failureReasons.INVALID_PEER_CAPABILITIES);
    }
    const compatibility = GameSchemaNegotiation.negotiateGameSchemaCapabilities([capabilities]);
    if (!compatibility.ok) return resolution(false, null, compatibility.reason);
    return resolution(true, capabilities);
}

function supportsSelectedGameSchemaForRuntime(capabilities, selected, enabled) {
    return enabled !== true || supportsSelectedGameSchema(capabilities, selected);
}

function negotiateRoomGameSchemaCandidate(room, playerIndex, capabilities, enabled) {
    if (enabled !== true) return Object.freeze({ ok: true, reason: '' });
    const players = Array.isArray(room && room.players) ? room.players : [];
    const peerValues = players
        .filter(player => player.index !== playerIndex)
        .map(player => player.gameSchemaCapabilities || null);
    peerValues.push(capabilities || null);
    return GameSchemaNegotiation.negotiateGameSchemaCapabilities(peerValues);
}

function roomHumanCapabilityValues(room) {
    const players = Array.isArray(room && room.players) ? room.players : [];
    const settings = Array.isArray(room && room.playerSettings) ? room.playerSettings : [];
    if (settings.length === 0) return players.map(player => player.gameSchemaCapabilities || null);
    return settings.map((setting, index) => {
        if (setting && setting.type === 'cpu') return undefined;
        const player = players.find(candidate => candidate.index === index);
        return player ? (player.gameSchemaCapabilities || null) : null;
    }).filter(value => value !== undefined);
}

function isValidGameSchemaMetadata(value) {
    return GameSchemaNegotiation.supportsSelection(GameSchemaNegotiation.capabilities, value);
}

function supportsSelectedGameSchema(capabilities, selected) {
    return GameSchemaNegotiation.supportsSelection(capabilities, selected);
}

function negotiateRoomGameSchema(room, enabled) {
    if (enabled !== true) return null;
    return GameSchemaNegotiation.negotiateGameSchemaCapabilities(roomHumanCapabilityValues(room));
}

function gameSchemaStartMetadata(room, enabled) {
    const result = negotiateRoomGameSchema(room, enabled);
    if (!result || !result.ok) return null;
    return Object.freeze({
        actionVersion: result.actionVersion,
        snapshotVersion: result.snapshotVersion,
    });
}

module.exports = Object.freeze({
    gameSchemaNegotiationEnabled,
    gameSchemaWireEnabled,
    gameSchemaSnapshotWireEnabled,
    gameSchemaRecreateWireEnabled,
    localSaveSchemaWriteEnabled,
    resolveClientGameSchemaCapabilities,
    negotiateRoomGameSchemaCandidate,
    roomHumanCapabilityValues,
    isValidGameSchemaMetadata,
    supportsSelectedGameSchema,
    supportsSelectedGameSchemaForRuntime,
    negotiateRoomGameSchema,
    gameSchemaStartMetadata,
});
