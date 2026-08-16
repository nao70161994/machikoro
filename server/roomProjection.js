'use strict';

function makeRoomProjection({
    cpuDifficultyLabel = difficulty => difficulty || '普',
    hashReconnectToken = token => token || '',
} = {}) {
    function buildPlayerList(room) {
        if (room.playerSettings.length === 0) {
            return room.players.map(player => player.name);
        }
        return room.playerSettings.map((setting, index) => {
            if (setting.type === 'cpu') {
                const difficultyLabel = cpuDifficultyLabel(setting.difficulty);
                return `CPU（${difficultyLabel}）`;
            }
            const player = room.players.find(candidate => candidate.index === index);
            if (!player) return '待機中...';
            return player.id === null
                ? `${player.name}（再接続待ち）`
                : player.name;
        });
    }

    function buildLobbyState(room) {
        return Object.assign({
            hostPlayerIndex: room.hostPlayerIndex,
            participants: room.players.map(player => Object.assign({
                index: player.index,
                name: player.name,
                connected: !!player.id,
                ready: player.ready !== false,
            }, !player.id && Number.isFinite(player.reservedUntil)
                ? { reservedUntil: player.reservedUntil }
                : {})),
            setupSummary: buildLobbySetupSummary(room),
        }, room.marketRule === 'ten-type'
            ? { marketRule: 'ten-type' }
            : {});
    }

    function buildLobbySetupSummary(room) {
        const configuredSettings = Array.isArray(room.playerSettings) && room.playerSettings.length > 0
            ? room.playerSettings
            : Array.from({ length: Number.isInteger(room.maxPlayers) ? room.maxPlayers : 0 }, () => ({
                type: 'human',
            }));
        const playerSlots = configuredSettings.slice(0, 10).map(setting => setting && setting.type === 'cpu'
            ? `CPU（${cpuDifficultyLabel(setting.difficulty)}）`
            : '人間');
        const enabledCards = Array.isArray(room.enabledCards)
            ? room.enabledCards.filter(name => typeof name === 'string').slice(0, 100)
            : [];
        const enabledLandmarks = Array.isArray(room.enabledLandmarks)
            ? room.enabledLandmarks.filter(name => typeof name === 'string').slice(0, 20)
            : [];
        return {
            playerSlots,
            cpuSpeed: Number.isInteger(room.cpuSpeed) && room.cpuSpeed >= 0
                ? room.cpuSpeed : 1500,
            enabledCards,
            enabledLandmarks,
            marketRule: room.marketRule === 'ten-type' ? 'ten-type' : 'standard',
        };
    }

    function countRoomHumanSlots(room) {
        return room.playerSettings.length > 0
            ? room.playerSettings.filter(setting => setting.type === 'human').length
            : room.maxPlayers;
    }

    function buildGameStartPlayerNames(room) {
        if (room.playerSettings.length === 0) {
            return room.players.map(player => player.name);
        }
        let cpuCount = 0;
        return room.playerSettings.map((setting, index) => {
            if (setting.type === 'cpu') {
                cpuCount++;
                const difficultyLabel = cpuDifficultyLabel(setting.difficulty);
                return `CPU${cpuCount}（${difficultyLabel}）`;
            }
            const player = room.players.find(candidate => candidate.index === index);
            return player ? player.name : '不明';
        });
    }

    function shuffledPlayerOrder(playerNames, randomFn = Math.random) {
        const playerOrder = playerNames.map((_, index) => index);
        for (let index = playerOrder.length - 1; index > 0; index--) {
            const shuffledIndex = Math.floor(randomFn() * (index + 1));
            [playerOrder[index], playerOrder[shuffledIndex]] =
                [playerOrder[shuffledIndex], playerOrder[index]];
        }
        return playerOrder;
    }

    function roomClientVersions(sockets, room) {
        return room.players.map(player => {
            const socket = sockets.get(player.id);
            return socket ? (socket.clientVersion || 'unknown') : 'unknown';
        });
    }

    function roomReconnectTokenHashes(room, playerNames) {
        return playerNames.map((_, index) => {
            const player = room.players.find(candidate => candidate.index === index);
            return player?.reconnectToken ? hashReconnectToken(player.reconnectToken) : '';
        });
    }

    function roomHostlessRestoreCapabilities(sockets, room, playerNames) {
        return playerNames.map((_, index) => {
            const setting = Array.isArray(room.playerSettings) ? room.playerSettings[index] : null;
            if (setting?.type === 'cpu') return 0;
            const player = room.players.find(candidate => candidate.index === index);
            const playerSocket = player?.id ? sockets.get(player.id) : null;
            return playerSocket?.hostlessRestoreVersion === 1 ? 1 : 0;
        });
    }

    return {
        buildPlayerList,
        buildLobbyState,
        buildLobbySetupSummary,
        countRoomHumanSlots,
        buildGameStartPlayerNames,
        shuffledPlayerOrder,
        roomClientVersions,
        roomReconnectTokenHashes,
        roomHostlessRestoreCapabilities,
    };
}

module.exports = makeRoomProjection;
