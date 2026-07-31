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

runTest('action socket handlerはwire decode拒否をvalidation前にfail closedにする', () => {
    const subject = createSubject({
        decodeGameSchemaAction() { return { ok: false, reason: 'codec-rejected' }; },
    });
    subject.handlers.gameAction({ schemaVersion: 1, action: 'nextTurn', data: {} });

    assert.deepStrictEqual(subject.emitted, [{ event: 'appError', payload: '無効な操作です' }]);
    assert.deepStrictEqual(subject.broadcast, []);
    assert.deepStrictEqual(subject.calls, ['plain', 'active']);
});

runTest('action socket handlerはparity一致時だけpure transition snapshotを採用する', () => {
    const adopted = [];
    const subject = createSubject({
        gameEngineAuthority: {
            enabled: true,
            select(transition, report) {
                subject.calls.push('authority-select');
                assert.deepStrictEqual(transition, { before: true });
                assert.deepStrictEqual(report, { status: 'matched' });
                return { authority: 'pure-transition', reason: '' };
            },
        },
        adoptTransitionSnapshotToRoomMirror(room, transition) {
            subject.calls.push('authority-adopt');
            adopted.push({ room, transition });
            room.canonicalMirror = { lastUndoState: { pure: true } };
            return true;
        },
    });
    subject.handlers.gameAction({ action: 'nextTurn', data: {}, clientActionId: 'pure-1' });

    assert.strictEqual(adopted.length, 1);
    assert.deepStrictEqual(subject.room.lastGameEngineAuthority, {
        authority: 'pure-transition',
        reason: '',
    });
    assert.deepStrictEqual(subject.room.lastUndoState, { pure: true });
    assert.ok(subject.calls.indexOf('shadow-compare') < subject.calls.indexOf('authority-select'));
    assert.ok(subject.calls.indexOf('authority-select') < subject.calls.indexOf('authority-adopt'));
    assert.ok(subject.calls.indexOf('authority-adopt') < subject.calls.indexOf('remember'));
});

runTest('action socket handlerはpure snapshot採用失敗時にmutable結果で継続する', () => {
    const warnings = [];
    const subject = createSubject({
        gameEngineAuthority: {
            enabled: true,
            select() { return { authority: 'pure-transition', reason: '' }; },
        },
        adoptTransitionSnapshotToRoomMirror() { return false; },
        logWarn(...args) { warnings.push(args); },
    });
    subject.handlers.gameAction({ action: 'nextTurn', data: {}, clientActionId: 'pure-fallback-1' });

    assert.deepStrictEqual(subject.room.lastGameEngineAuthority, {
        authority: 'mutable',
        reason: 'adoption-failed',
    });
    assert.strictEqual(warnings.some(args => args[0] === 'pure game engine authority fallback'), true);
    assert.strictEqual(subject.emitted.some(item => item.event === 'actionAccepted'), true);
    assert.strictEqual(subject.broadcast.some(item => item.event === 'gameAction'), true);
});
