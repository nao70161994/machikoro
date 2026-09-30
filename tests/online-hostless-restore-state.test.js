'use strict';

const assert = require('assert');
const OnlineHostlessRestoreState = require('../js/onlineHostlessRestoreState');
const { HOSTLESS_RESTORE_STATUS_REASONS } = require('../server/hostlessRestoreCandidate');
const { runTest } = require('./helpers/test-utils');

runTest('hostless restore state controllerは接続中の最初のrequestだけを開始する', () => {
    const controller = OnlineHostlessRestoreState.createController();
    assert.deepStrictEqual(controller.snapshot(), { pending: false });
    assert.strictEqual(controller.tryBegin(false), false);
    assert.strictEqual(controller.tryBegin(true), true);
    assert.strictEqual(controller.tryBegin(true), false);
    assert.deepStrictEqual(controller.snapshot(), { pending: true });
});

runTest('hostless restore state controllerはterminal/reset時に再要求可能へ戻る', () => {
    const controller = OnlineHostlessRestoreState.createController(true);
    assert.strictEqual(controller.isPending(), true);
    controller.clear();
    assert.strictEqual(controller.isPending(), false);
    assert.strictEqual(controller.tryBegin(true), true);
    assert.strictEqual(controller.setPending(false), false);
    assert.strictEqual(controller.tryBegin(true), true);
    assert.strictEqual(Object.isFrozen(controller.snapshot()), true);
});

runTest('hostless status dispositionはserver reasonと同期し未知拒否をfailedへ倒す', () => {
    const state = OnlineHostlessRestoreState;
    assert.deepStrictEqual(state.statusReasons, HOSTLESS_RESTORE_STATUS_REASONS);
    assert.strictEqual(
        state.statusDisposition(state.statusReasons.WAITING_FOR_HOST),
        state.statusDispositions.PROGRESS
    );
    assert.strictEqual(
        state.statusDisposition(state.statusReasons.QUORUM_READY, 'confirming'),
        state.statusDispositions.PROGRESS
    );
    assert.strictEqual(
        state.statusDisposition(state.statusReasons.QUORUM_READY, 'collecting'),
        state.statusDispositions.FAILED
    );
    assert.strictEqual(
        state.statusDisposition(state.statusReasons.HOST_RESTORED),
        state.statusDispositions.RESTORED
    );
    for (const reason of [state.statusReasons.START_RATE_LIMIT, state.statusReasons.SESSION_LIMIT]) {
        assert.strictEqual(state.statusDisposition(reason), state.statusDispositions.RETRYABLE);
    }
    for (const reason of ['invalid-token', 'invalid-payload', 'future-server-rejection']) {
        assert.strictEqual(state.statusDisposition(reason), state.statusDispositions.FAILED);
    }
    assert.strictEqual(state.statusDisposition(''), state.statusDispositions.IGNORE);
    assert.strictEqual(state.statusDisposition(null), state.statusDispositions.IGNORE);
});

runTest('hostless restore socket adapterはroom gateと既存effect順を保つ', () => {
    const state = OnlineHostlessRestoreState;
    const handlers = new Map();
    const calls = [];
    let session = { myRoomId: 'ROOM01', myOriginalPlayerIndex: 1 };
    let socket = { connected: true };
    const socketEvents = {
        on(key, handler) {
            assert.ok(!handlers.has(key), `duplicate handler: ${key}`);
            handlers.set(key, handler);
        },
    };
    state.registerSocketEvents(socketEvents, {
        keys: { collect: 'collect', confirmation: 'confirmation', status: 'status', approved: 'approved' },
        getSession: () => session,
        setStatusText: value => calls.push(['status', value]),
        submitCandidate: generation => {
            calls.push(['candidate', generation]);
            return false;
        },
        getSocket: () => socket,
        confirmRestore: (payload, targetSocket) => calls.push(['confirm', payload, targetSocket]),
        showConfirmation: null,
        clearState: () => calls.push(['clear']),
        clearRetry: () => calls.push(['clear-retry']),
        setReconnectFlag: value => calls.push(['reconnect', value]),
        emitRejoinRequest: () => calls.push(['rejoin']),
        markAttemptExhausted: () => calls.push(['exhausted']),
        observeRetryExhausted: () => calls.push(['retry-exhausted']),
        statusMessage: reason => `reason:${reason}`,
    });

    assert.deepStrictEqual([...handlers.keys()], ['collect', 'confirmation', 'status', 'approved']);
    handlers.get('collect')({ roomId: 'OTHER', generation: 3 });
    assert.deepStrictEqual(calls, []);
    handlers.get('collect')({ roomId: 'ROOM01', generation: 4 });
    assert.deepStrictEqual(calls.splice(0), [
        ['status', '♻️ 参加者間の復元データ一致を確認しています...'],
        ['candidate', 4],
        ['status', '❌ 復元候補の世代が一致しません。保存データは削除されていません。'],
    ]);

    handlers.get('confirmation')({ roomId: 'ROOM01', candidateCount: 2 });
    assert.deepStrictEqual(calls.splice(0), [
        ['confirm', { roomId: 'ROOM01', approved: false }, socket],
    ]);
    socket = { connected: false };
    handlers.get('confirmation')({ roomId: 'ROOM01', candidateCount: 2 });
    assert.deepStrictEqual(calls, []);
    socket = { connected: true };

    handlers.get('status')({ roomId: 'OTHER', reason: state.statusReasons.HOST_RESTORED });
    handlers.get('status')({ roomId: 'ROOM01', reason: state.statusReasons.HOST_RESTORED });
    assert.deepStrictEqual(calls.splice(0), [
        ['clear'], ['clear-retry'], ['reconnect', true],
        ['status', '♻️ 元のホストが復元しました。再接続しています...'], ['rejoin'],
    ]);

    handlers.get('status')({ reason: state.statusReasons.START_RATE_LIMIT });
    assert.deepStrictEqual(calls.splice(0), [
        ['clear'], ['reconnect', true],
        ['status', '⚠️ 復元要求が一時的に混み合っています。保存データは保持されています。時間をおいて再接続をやり直してください。'],
    ]);
    handlers.get('status')({ reason: 'invalid-payload' });
    assert.deepStrictEqual(calls.splice(0), [
        ['clear'], ['exhausted'], ['reconnect', true], ['retry-exhausted'],
        ['status', '❌ reason:invalid-payload 再接続をやり直すか、タイトル画面から保存データを明示的に破棄できます。'],
    ]);

    handlers.get('approved')({ roomId: 'ROOM01', hostPlayerIndex: 1 });
    assert.deepStrictEqual(calls.splice(0), [['clear']]);
    session = { myRoomId: 'ROOM01', myOriginalPlayerIndex: 1 };
    handlers.get('approved')({ roomId: 'ROOM01', hostPlayerIndex: 0 });
    assert.deepStrictEqual(calls.splice(0), [
        ['clear'], ['clear-retry'], ['reconnect', true],
        ['status', '♻️ 暫定復元したルームへ再接続しています...'], ['rejoin'],
    ]);
});
