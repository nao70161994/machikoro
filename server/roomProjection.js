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
        return {
            hostPlayerIndex: room.hostPlayerIndex,
            participants: room.players.map(player => ({
                index: player.index,
                name: player.name,
                connected: !!player.id,
                ready: player.ready !== false,
            })),
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
        countRoomHumanSlots,
        buildGameStartPlayerNames,
        shuffledPlayerOrder,
        roomClientVersions,
        roomReconnectTokenHashes,
        roomHostlessRestoreCapabilities,
    };
}

module.exports = makeRoomProjection;
