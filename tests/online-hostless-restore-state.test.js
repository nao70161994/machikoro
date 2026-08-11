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
