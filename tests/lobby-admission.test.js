'use strict';

const assert = require('assert');
const {
    LOBBY_ADMISSION_ERRORS,
    planCreateRoomAdmission,
    planJoinRoomAdmission,
} = require('../server/lobbyAdmission');
const { runTest } = require('./helpers/test-utils');

runTest('create admissionは有効landmarkと最初のhuman席を入力非変更で選ぶ', () => {
    const input = {
        enabledLandmarks: ['未知', '港', '駅', '港'],
        allLandmarks: ['駅', '港'],
        playerSettings: [{ type: 'cpu' }, { type: 'human' }, { type: 'human' }],
    };
    const before = JSON.stringify(input);
    assert.deepStrictEqual(planCreateRoomAdmission(input), {
        ok: true,
        selectedLandmarks: ['港', '駅', '港'],
        hostIndex: 1,
    });
    assert.strictEqual(JSON.stringify(input), before);
});

runTest('create admissionはlandmark不足をhuman不足より先に拒否する', () => {
    assert.deepStrictEqual(planCreateRoomAdmission({
        enabledLandmarks: ['未知'],
        allLandmarks: ['駅'],
        playerSettings: [{ type: 'cpu' }],
    }), { ok: false, message: LOBBY_ADMISSION_ERRORS.LANDMARK_REQUIRED });
    assert.deepStrictEqual(planCreateRoomAdmission({
        enabledLandmarks: ['駅'],
        allLandmarks: ['駅'],
        playerSettings: [{ type: 'cpu' }],
    }), { ok: false, message: LOBBY_ADMISSION_ERRORS.HUMAN_REQUIRED });
});

runTest('create admissionはsettingなしで従来host index 0と全landmarkを返す', () => {
    assert.deepStrictEqual(planCreateRoomAdmission({ allLandmarks: ['駅', '港'] }), {
        ok: true,
        selectedLandmarks: ['駅', '港'],
        hostIndex: 0,
    });
});

runTest('join admissionはstarted・same socket・duplicate nameの優先順を保つ', () => {
    const base = {
        players: [{ id: 'same', name: 'Alice', index: 0 }],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        maxPlayers: 2,
    };
    assert.strictEqual(planJoinRoomAdmission({ room: { ...base, started: true }, socketId: 'same', playerName: 'Alice' }).message, LOBBY_ADMISSION_ERRORS.STARTED);
    assert.strictEqual(planJoinRoomAdmission({ room: { ...base, started: false }, socketId: 'same', playerName: 'Alice' }).message, LOBBY_ADMISSION_ERRORS.SAME_SOCKET);
    assert.strictEqual(planJoinRoomAdmission({ room: { ...base, started: false }, socketId: 'guest', playerName: 'Alice' }).message, LOBBY_ADMISSION_ERRORS.DUPLICATE_NAME);
});

runTest('join admissionは最初の未使用human席だけを選ぶ', () => {
    const room = {
        started: false,
        players: [{ id: 'host', name: 'Alice', index: 1 }],
        playerSettings: [{ type: 'cpu' }, { type: 'human' }, { type: 'human' }, { type: 'cpu' }, { type: 'human' }],
        maxPlayers: 5,
    };
    const before = JSON.stringify(room);
    assert.deepStrictEqual(planJoinRoomAdmission({ room, socketId: 'guest', playerName: 'Bob' }), { ok: true, playerIndex: 2 });
    assert.strictEqual(JSON.stringify(room), before);
});

runTest('join admissionはlegacy room容量と満席を従来どおり判定する', () => {
    const room = { started: false, players: [{ id: 'host', name: 'Alice', index: 0 }], playerSettings: [], maxPlayers: 2 };
    assert.deepStrictEqual(planJoinRoomAdmission({ room, socketId: 'guest', playerName: 'Bob' }), { ok: true, playerIndex: 1 });
    room.players.push({ id: 'guest', name: 'Bob', index: 1 });
    assert.deepStrictEqual(planJoinRoomAdmission({ room, socketId: 'third', playerName: 'Carol' }), { ok: false, message: LOBBY_ADMISSION_ERRORS.NO_SLOT });
});

runTest('join admissionはlegacy roomの途中で空いた最小indexを再利用する', () => {
    const room = {
        started: false,
        players: [
            { id: 'host', name: 'Alice', index: 0 },
            { id: 'third', name: 'Carol', index: 2 },
        ],
        playerSettings: [],
        maxPlayers: 3,
    };
    assert.deepStrictEqual(
        planJoinRoomAdmission({ room, socketId: 'guest', playerName: 'Bob' }),
        { ok: true, playerIndex: 1 }
    );
});
