'use strict';

module.exports = function makeReconnectIdentity(options = {}) {
    const { crypto } = options;

    function generateReconnectToken() {
        if (typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return crypto.randomBytes(16).toString('hex');
    }

    function hashReconnectToken(token) {
        return token ? crypto.createHash('sha256').update(String(token)).digest('hex') : '';
    }

    function getExpectedReconnectTokenHash(room, playerIndex, playerName) {
        const player = room.players.find(p => p.index === playerIndex && p.name === playerName);
        if (player?.reconnectTokenHash) return player.reconnectTokenHash;
        if (player?.reconnectToken) return hashReconnectToken(player.reconnectToken);

        const names = room.gameStartPayload?.playerNames || [];
        const reconnectTokenHashes = room.gameStartPayload?.reconnectTokenHashes;
        if (!Number.isInteger(playerIndex) || names[playerIndex] !== playerName || !Array.isArray(reconnectTokenHashes)) {
            return '';
        }
        return reconnectTokenHashes[playerIndex] || '';
    }

    function resolveRejoinPlayer(room, playerIndex, playerName, reconnectToken, socketId) {
        const expectedReconnectTokenHash = getExpectedReconnectTokenHash(room, playerIndex, playerName);
        if (!expectedReconnectTokenHash || hashReconnectToken(reconnectToken) !== expectedReconnectTokenHash) return null;

        let player = room.players.find(candidate => candidate.index === playerIndex && candidate.name === playerName);
        if (!player) {
            player = {
                id: socketId,
                index: playerIndex,
                name: playerName,
                reconnectToken: '',
                reconnectTokenHash: expectedReconnectTokenHash,
            };
            room.players.push(player);
        } else if (!player.reconnectTokenHash) {
            player.reconnectTokenHash = expectedReconnectTokenHash;
        }
        player.id = socketId;
        return player;
    }

    function isReconnectTokenHashString(value) {
        return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
    }

    function isCpuPlayerSetting(setting) {
        return setting && typeof setting === 'object' && setting.type === 'cpu';
    }

    function isValidRestoreReconnectTokenHashes(gameStartPayload) {
        if (!gameStartPayload || !Array.isArray(gameStartPayload.playerNames)) return false;
        const playerCount = gameStartPayload.playerNames.length;
        const hashes = gameStartPayload.reconnectTokenHashes;
        if (!Array.isArray(hashes) || hashes.length !== playerCount) return false;
        const settings = Array.isArray(gameStartPayload.playerSettings) ? gameStartPayload.playerSettings : [];
        for (let index = 0; index < playerCount; index++) {
            const hash = hashes[index];
            if (isCpuPlayerSetting(settings[index])) {
                if (hash !== '' && !isReconnectTokenHashString(hash)) return false;
            } else if (!isReconnectTokenHashString(hash)) {
                return false;
            }
        }
        return true;
    }

    return Object.freeze({
        generateReconnectToken,
        hashReconnectToken,
        getExpectedReconnectTokenHash,
        resolveRejoinPlayer,
        isReconnectTokenHashString,
        isValidRestoreReconnectTokenHashes,
    });
};
