const assert = require('assert');
const { registerActionSocketHandler } = require('../server/actionSocketHandler');
const { runTest } = require('./helpers/test-utils');

function createSubject(overrides = {}) {
    const handlers = {};
    const emitted = [];
    const broadcast = [];
    const calls = [];
    const room = {
        started: true,
        actionLog: [],
        canonicalMirror: { lastUndoState: null },
        lastUndoState: { stale: true },
    };
    const mirror = { game: {}, shopStock: {}, lastUndoState: null };
    const socket = {
        roomId: 'ROOM1',
        playerIndex: 0,
        on(event, handler) { handlers[event] = handler; },
        emit(event, payload) { emitted.push({ event, payload }); },
        to(roomId) {
            return { emit(event, payload) { broadcast.push({ roomId, event, payload }); } };
        },
    };
    const dependencies = Object.assign({
        requirePlainSocketPayload() { calls.push('plain'); return true; },
        rooms: { ROOM1: room },
        isActiveRoomSocket() { calls.push('active'); return true; },
        emitAppError(_socket, message) { emitted.push({ event: 'appError', payload: message }); },
        normalizeClientActionId(value) { calls.push('normalize-id'); return value; },
        findAcceptedClientAction() { calls.push('dedupe'); return null; },
        validateGameAction() { calls.push('validate'); return { ok: true, mirror, data: { raw: true } }; },
        canonicalizeActionData() { calls.push('canonicalize'); return { canonical: true }; },
        makeUndoStateFromMirror() { calls.push('undo'); return { undo: true }; },
        nextRoomActionSeq() { calls.push('seq'); return 4; },
        gameSchemaShadow: {
            prepare() { calls.push('shadow-prepare'); return { before: true }; },
            compare() { calls.push('shadow-compare'); return { status: 'matched' }; },
        },
        buildRestoreActionAudit() { calls.push('audit'); return null; },
        applyAcceptedActionToRoomCanonicalMirror() { calls.push('apply'); return true; },
        rememberAcceptedClientAction() { calls.push('remember'); },
        compactRoomActionLog() { calls.push('compact'); },
        attachCompactedRestoreSnapshotToAction() { calls.push('snapshot'); },
        markRoomCanonicalMirrorCurrent() { calls.push('mark'); },
        persistRoomCanonicalState() { calls.push('persist'); },
        now() { return 1234; },
    }, overrides);
    registerActionSocketHandler(socket, dependencies);
    return { handlers, emitted, broadcast, calls, room, mirror, socket };
}

runTest('action socket handlerは受理処理とACK/broadcast順を維持する', () => {
    const subject = createSubject();
    subject.handlers.gameAction({ action: 'nextTurn', data: { raw: true }, clientActionId: 'client-1' });

    const entry = {
        action: 'nextTurn',
        data: { canonical: true },
        playerIndex: 0,
        seq: 4,
        clientActionId: 'client-1',
    };
    assert.deepStrictEqual(subject.room.actionLog, [entry]);
    assert.strictEqual(subject.room.lastTouchedAt, 1234);
    assert.deepStrictEqual(subject.broadcast, [{ roomId: 'ROOM1', event: 'gameAction', payload: entry }]);
    assert.deepStrictEqual(subject.emitted, [{ event: 'actionAccepted', payload: entry }]);
    assert.deepStrictEqual(subject.calls, [
        'plain', 'active', 'normalize-id', 'dedupe', 'validate', 'canonicalize', 'seq',
        'shadow-prepare', 'audit', 'apply', 'shadow-compare', 'remember', 'compact',
        'snapshot', 'mark', 'persist',
    ]);
});

runTest('action socket handlerは既受理client actionを再実行せずACKする', () => {
    const accepted = { action: 'nextTurn', seq: 3 };
    const subject = createSubject({
        findAcceptedClientAction() { subject.calls.push('dedupe'); return accepted; },
    });
    subject.handlers.gameAction({ action: 'nextTurn', data: {}, clientActionId: 'client-1' });

    assert.deepStrictEqual(subject.emitted, [{ event: 'actionAccepted', payload: accepted }]);
    assert.deepStrictEqual(subject.broadcast, []);
    assert.deepStrictEqual(subject.calls, ['plain', 'active', 'normalize-id', 'dedupe']);
});

runTest('action socket handlerはvalidation例外を既存appErrorへ変換する', () => {
    const logged = [];
    const subject = createSubject({
        validateGameAction() { throw new Error('broken'); },
        logError(...args) { logged.push(args); },
    });
    subject.handlers.gameAction({ action: 'nextTurn', data: {} });

    assert.strictEqual(logged.length, 1);
    assert.deepStrictEqual(subject.emitted, [{ event: 'appError', payload: '無効な操作です' }]);
    assert.deepStrictEqual(subject.broadcast, []);
});
