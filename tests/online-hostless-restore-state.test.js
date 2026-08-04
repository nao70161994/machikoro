'use strict';

const assert = require('assert');
const OnlineHostlessRestoreState = require('../js/onlineHostlessRestoreState');
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
