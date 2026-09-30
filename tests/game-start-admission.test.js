'use strict';

const assert = require('assert');
const {
    GAME_START_DECISIONS,
    GAME_START_SKIP_REASONS,
    planGameStart,
} = require('../server/gameStartAdmission');
const { executeGameStartEffects } = require('../server/gameStartRuntime');
const { runTest } = require('./helpers/test-utils');

runTest('game start admissionは開始条件を理由付きplanへ正規化する', () => {
    assert.deepStrictEqual(planGameStart(null, 0), {
        decision: GAME_START_DECISIONS.SKIP,
        reason: GAME_START_SKIP_REASONS.MISSING_ROOM,
    });
    assert.deepStrictEqual(planGameStart({ started: true, players: [{}, {}] }, 2), {
        decision: GAME_START_DECISIONS.SKIP,
        reason: GAME_START_SKIP_REASONS.ALREADY_STARTED,
    });
    assert.deepStrictEqual(planGameStart({ started: false, players: [{}] }, 2), {
        decision: GAME_START_DECISIONS.SKIP,
        reason: GAME_START_SKIP_REASONS.WAITING_HUMAN_SLOTS,
    });
    const room = { started: false, players: [{ id: 'a' }, { id: 'b' }] };
    assert.deepStrictEqual(planGameStart(room, 2), {
        decision: GAME_START_DECISIONS.START,
        room,
    });
    assert.deepStrictEqual(planGameStart({
        started: false,
        players: [{ id: 'a' }, { id: null, reservedUntil: 9999 }],
    }, 2), {
        decision: GAME_START_DECISIONS.SKIP,
        reason: GAME_START_SKIP_REASONS.WAITING_HUMAN_SLOTS,
    });
    assert.deepStrictEqual(planGameStart({
        started: false,
        players: [{ id: 'a', ready: true }, { id: 'b', ready: false }],
    }, 2), {
        decision: GAME_START_DECISIONS.SKIP,
        reason: GAME_START_SKIP_REASONS.WAITING_READY_PLAYERS,
    });
    assert.strictEqual(planGameStart({
        started: false,
        players: [{ id: 'a' }, { id: 'b' }],
    }, 2).decision, GAME_START_DECISIONS.START);
});

runTest('game start runtimeはmark、emit、logを契約順に一度だけ実行する', () => {
    const calls = [];
    const room = {};
    const payload = { playerNames: ['Alice', 'Bob'] };
    executeGameStartEffects({ roomId: 'ROOM01', room, payload }, {
        markRoomGameStarted: (candidate, value) => calls.push(['mark', candidate, value]),
        emitGameStart: (roomId, value) => calls.push(['emit', roomId, value]),
        logGameStarted: (roomId, value) => calls.push(['log', roomId, value]),
    });

    assert.deepStrictEqual(calls, [
        ['mark', room, payload],
        ['emit', 'ROOM01', payload],
        ['log', 'ROOM01', payload],
    ]);
});

runTest('game start runtimeは依存不足を最初のeffectより前に拒否する', () => {
    const calls = [];
    assert.throws(() => executeGameStartEffects({ roomId: 'ROOM01', room: {}, payload: {} }, {
        markRoomGameStarted: () => calls.push('mark'),
        logGameStarted: () => calls.push('log'),
    }), /emitGameStart must be a function/);
    assert.deepStrictEqual(calls, []);
});

runTest('game start runtimeはauthoritative保存失敗時に開始通知とlogを止める', () => {
    const calls = [];
    const result = executeGameStartEffects({ roomId: 'ROOM01', room: {}, payload: {} }, {
        markRoomGameStarted: () => false,
        emitGameStart: () => calls.push('emit'),
        logGameStarted: () => calls.push('log'),
    });
    assert.strictEqual(result, false);
    assert.deepStrictEqual(calls, []);
});
