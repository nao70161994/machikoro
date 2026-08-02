'use strict';

const assert = require('assert');
const makeGameStartCoordinator = require('../server/gameStartCoordinator');
const { runTest } = require('./helpers/test-utils');

runTest('game start coordinatorはready roomを初期化してemit後にlogする', () => {
    const calls = [];
    const room = { started: false, players: [{}, {}] };
    const payload = { playerNames: ['Alice', 'Bob'] };
    const { checkGameStart } = makeGameStartCoordinator({
        rooms: { ROOM01: room },
        countRoomHumanSlots(candidate) { calls.push(['count', candidate]); return 2; },
        buildGameStartPayload(io, candidate) { calls.push(['build', io, candidate]); return payload; },
        markRoomGameStarted(candidate, value) { calls.push(['mark', candidate, value]); candidate.started = true; },
        logGameStarted(roomId, value) { calls.push(['log', roomId, value]); },
    });
    const io = {
        to(roomId) {
            calls.push(['to', roomId]);
            return { emit(event, value) { calls.push(['emit', event, value]); } };
        },
    };

    assert.strictEqual(checkGameStart(io, 'ROOM01'), undefined);
    assert.deepStrictEqual(calls.map(call => call[0]), ['count', 'build', 'mark', 'to', 'emit', 'log']);
    assert.deepStrictEqual(calls[4], ['emit', 'gameStart', payload]);
    assert.deepStrictEqual(calls[5], ['log', 'ROOM01', payload]);
});

runTest('game start coordinatorはmissing、started、not-ready、payload拒否でeffectsを止める', () => {
    const calls = [];
    const rooms = {
        STARTED: { started: true, players: [{}, {}] },
        WAITING: { started: false, players: [{}] },
        REJECTED: { started: false, players: [{}, {}] },
    };
    const { checkGameStart } = makeGameStartCoordinator({
        rooms,
        countRoomHumanSlots() { calls.push('count'); return 2; },
        buildGameStartPayload() { calls.push('build'); return null; },
        markRoomGameStarted() { calls.push('mark'); },
        logGameStarted() { calls.push('log'); },
    });
    const io = { to() { calls.push('to'); return { emit() { calls.push('emit'); } }; } };

    checkGameStart(io, 'MISSING');
    checkGameStart(io, 'STARTED');
    checkGameStart(io, 'WAITING');
    checkGameStart(io, 'REJECTED');
    assert.deepStrictEqual(calls, ['count', 'count', 'build']);
});

runTest('game start coordinatorは不正な依存をeffects前に拒否する', () => {
    assert.throws(() => makeGameStartCoordinator({}), /rooms must be an object/);
    assert.throws(() => makeGameStartCoordinator({ rooms: {} }), /countRoomHumanSlots must be a function/);
});
