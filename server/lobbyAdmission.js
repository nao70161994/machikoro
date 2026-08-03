'use strict';

const LOBBY_ADMISSION_ERRORS = Object.freeze({
    LANDMARK_REQUIRED: 'ランドマークは最低1つ必要です',
    HUMAN_REQUIRED: 'オンライン対戦は最低1人の人間プレイヤーが必要です',
    STARTED: 'ゲームはすでに開始されています',
    SAME_SOCKET: 'すでにこのルームに参加しています',
    DUPLICATE_NAME: 'その名前はすでに使われています',
    NO_SLOT: '参加できる枠がありません',
});

function planCreateRoomAdmission(input) {
    const allLandmarks = Array.isArray(input && input.allLandmarks) ? input.allLandmarks : [];
    const validLandmarks = new Set(allLandmarks);
    const selectedLandmarks = Array.isArray(input && input.enabledLandmarks)
        ? input.enabledLandmarks.filter(name => validLandmarks.has(name))
        : [...allLandmarks];
    if (selectedLandmarks.length === 0) {
        return { ok: false, message: LOBBY_ADMISSION_ERRORS.LANDMARK_REQUIRED };
    }
    const playerSettings = Array.isArray(input && input.playerSettings) ? input.playerSettings : [];
    let hostIndex = 0;
    if (playerSettings.length > 0) {
        hostIndex = playerSettings.findIndex(setting => setting.type === 'human');
        if (hostIndex === -1) {
            return { ok: false, message: LOBBY_ADMISSION_ERRORS.HUMAN_REQUIRED };
        }
    }
    return { ok: true, selectedLandmarks, hostIndex };
}

function planJoinRoomAdmission(input) {
    const room = input && input.room;
    const socketId = input && input.socketId;
    const playerName = input && input.playerName;
    if (room.started) return { ok: false, message: LOBBY_ADMISSION_ERRORS.STARTED };
    if (room.players.some(player => player.id === socketId)) {
        return { ok: false, message: LOBBY_ADMISSION_ERRORS.SAME_SOCKET };
    }
    if (room.players.some(player => player.name === playerName)) {
        return { ok: false, message: LOBBY_ADMISSION_ERRORS.DUPLICATE_NAME };
    }
    let playerIndex = -1;
    if (room.playerSettings.length > 0) {
        for (let index = 0; index < room.playerSettings.length; index++) {
            const taken = room.players.some(player => player.index === index);
            if (!taken && room.playerSettings[index].type === 'human') {
                playerIndex = index;
                break;
            }
        }
    } else if (room.players.length < room.maxPlayers) {
        playerIndex = room.players.length;
    }
    if (playerIndex === -1) return { ok: false, message: LOBBY_ADMISSION_ERRORS.NO_SLOT };
    return { ok: true, playerIndex };
}

module.exports = {
    LOBBY_ADMISSION_ERRORS,
    planCreateRoomAdmission,
    planJoinRoomAdmission,
};
