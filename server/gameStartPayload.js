'use strict';

function makeGameStartPayload({
    defaultSchemaNegotiationEnabled = false,
    gameSchemaStartMetadata,
    buildGameStartPlayerNames,
    shuffledPlayerOrder,
    roomClientVersions,
    roomReconnectTokenHashes,
    roomHostlessRestoreCapabilities,
}) {
    function buildGameStartPayload(io, room, randomFn = Math.random, options = {}) {
        const schemaEnabled = options.gameSchemaNegotiationEnabled !== undefined
            ? options.gameSchemaNegotiationEnabled === true
            : defaultSchemaNegotiationEnabled;
        const gameSchema = gameSchemaStartMetadata(room, schemaEnabled);
        if (schemaEnabled && !gameSchema) return null;
        const playerNames = buildGameStartPlayerNames(room);
        const payload = {
            enabledCards: room.enabledCards,
            enabledLandmarks: room.enabledLandmarks,
            playerNames,
            playerSettings: room.playerSettings,
            cpuSpeed: room.cpuSpeed,
            playerOrder: shuffledPlayerOrder(playerNames, randomFn),
            hostPlayerIndex: room.hostPlayerIndex,
            hostEpoch: room.hostEpoch || 0,
            actionSeq: room.actionSeq || 0,
            versions: roomClientVersions(io, room),
            reconnectTokenHashes: roomReconnectTokenHashes(room, playerNames),
            hostlessRestoreCapabilities: roomHostlessRestoreCapabilities(io, room, playerNames),
            hostlessRestoreGeneration: 0,
            hostlessRestoreCount: 0,
        };
        if (room.marketRule === 'ten-type') {
            payload.marketRule = 'ten-type';
            payload.marketSeed = Math.floor(randomFn() * 0x100000000) >>> 0;
        }
        if (Number.isSafeInteger(room.gameGeneration) && room.gameGeneration > 0) {
            payload.gameGeneration = room.gameGeneration;
        }
        if (gameSchema) payload.gameSchema = gameSchema;
        return payload;
    }

    return { buildGameStartPayload };
}

module.exports = makeGameStartPayload;
