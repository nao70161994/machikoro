'use strict';

const assert = require('assert');
const OnlineSocketRegistry = require('../js/onlineSocketRegistry');
const { runTest } = require('./helpers/test-utils');

const dynamicEvents = Object.freeze({
    hostlessCollect: 'hostlessCollectWire',
    hostlessConfirmation: 'hostlessConfirmationWire',
    hostlessStatus: 'hostlessStatusWire',
    hostlessApproved: 'hostlessApprovedWire',
    appError: 'appError',
});

runTest('online socket registryは欠落診断を一度だけclaimする', () => {
    const controller = OnlineSocketRegistry.createUnavailableReportController();
    assert.deepStrictEqual(controller.snapshot(), { reported: false });
    assert.strictEqual(controller.claim(), true);
    assert.strictEqual(controller.claim(), false);
    assert.deepStrictEqual(controller.snapshot(), { reported: true });
    assert.ok(Object.isFrozen(controller));
    assert.ok(Object.isFrozen(controller.snapshot()));
});

runTest('online socket registryは全eventを既存順で一度ずつ登録する', () => {
    const calls = [];
    const binder = OnlineSocketRegistry.createBinder({
        on(event, handler) {
            calls.push([event, handler]);
        },
    }, dynamicEvents);
    for (const key of OnlineSocketRegistry.order) {
        const handler = () => key;
        assert.strictEqual(binder.on(key, handler), handler);
    }
    assert.strictEqual(binder.assertComplete(), true);
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'roomCreated', 'roomJoined', 'playerList', 'gameStart', 'gameAction',
        'actionAccepted', 'rejoinData', 'hostlessCollectWire',
        'hostlessConfirmationWire', 'hostlessStatusWire', 'hostlessApprovedWire',
        'playerRejoined', 'playerDisconnected', 'hostChanged', 'connect',
        'disconnect', 'connect_error', 'appError',
    ]);
    assert.strictEqual(new Set(calls.map(call => call[0])).size, calls.length);
});

runTest('online socket registryは順序違反とhandler欠落を登録前に拒否する', () => {
    const calls = [];
    const binder = OnlineSocketRegistry.createBinder({
        on(...args) { calls.push(args); },
    }, dynamicEvents);
    assert.throws(
        () => binder.on(OnlineSocketRegistry.keys.ROOM_JOINED, () => {}),
        /registration order mismatch/,
    );
    assert.throws(
        () => binder.on(OnlineSocketRegistry.keys.ROOM_CREATED, null),
        /handler is required/,
    );
    assert.deepStrictEqual(calls, []);
    assert.throws(() => binder.assertComplete(), /registration incomplete/);
});

runTest('online socket registryはdynamic event欠落と重複をfail closedにする', () => {
    assert.throws(
        () => OnlineSocketRegistry.createBinder({ on() {} }, { ...dynamicEvents, appError: '' }),
        /appError event name is required/,
    );
    assert.throws(
        () => OnlineSocketRegistry.createBinder({ on() {} }, { ...dynamicEvents, appError: 'connect' }),
        /event names must be unique/,
    );
    assert.throws(() => OnlineSocketRegistry.createBinder(null, dynamicEvents), /socket.on is required/);
    assert.ok(Object.isFrozen(OnlineSocketRegistry));
    assert.ok(Object.isFrozen(OnlineSocketRegistry.keys));
    assert.ok(Object.isFrozen(OnlineSocketRegistry.order));
});
