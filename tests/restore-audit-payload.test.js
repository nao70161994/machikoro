'use strict';

const assert = require('assert');
const makeRestoreAuditPayload = require('../server/restoreAuditPayload');
const { runTest } = require('./helpers/test-utils');

function makePayloadBuilders(overrides = {}) {
    const calls = [];
    const dependencies = {
        normalizePlayerSettings(settings, playerCount) {
            calls.push(['settings', settings, playerCount]);
            return [{ type: 'human' }, { type: 'cpu', difficulty: 'normal' }];
        },
        canonicalizeActionData(action, data) {
            calls.push(['canonicalize', action, data]);
            return { cardName: data.cardName };
        },
        normalizeClientActionId(clientActionId) {
            calls.push(['clientActionId', clientActionId]);
            return typeof clientActionId === 'string' ? clientActionId.trim() : '';
        },
    };
    Object.assign(dependencies, overrides);
    return {
        calls,
        builders: makeRestoreAuditPayload(dependencies),
    };
}

runTest('restore snapshot audit payload normalizes a detached game-start object', () => {
    const { calls, builders } = makePayloadBuilders();
    const playerSettings = [{ type: 'human' }];
    const gameStartPayload = {
        playerNames: ['A', 'B'],
        playerSettings,
        cpuSpeed: 500,
    };
    const stateSnapshot = { phase: 'build' };

    const result = builders.buildRestoreSnapshotAuditPayload(
        gameStartPayload,
        stateSnapshot
    );

    assert.deepStrictEqual(result, {
        gameStartPayload: {
            playerNames: ['A', 'B'],
            playerSettings: [
                { type: 'human' },
                { type: 'cpu', difficulty: 'normal' },
            ],
            cpuSpeed: 500,
        },
        stateSnapshot,
    });
    assert.notStrictEqual(result.gameStartPayload, gameStartPayload);
    assert.strictEqual(gameStartPayload.playerSettings, playerSettings);
    assert.deepStrictEqual(calls, [['settings', playerSettings, 2]]);
});

runTest('restore snapshot audit payload preserves null gates and missing names count', () => {
    const { calls, builders } = makePayloadBuilders();

    assert.strictEqual(builders.buildRestoreSnapshotAuditPayload(null, {}), null);
    assert.strictEqual(builders.buildRestoreSnapshotAuditPayload({}, null), null);
    assert.deepStrictEqual(
        builders.buildRestoreSnapshotAuditPayload({ playerSettings: [] }, {}),
        {
            gameStartPayload: {
                playerSettings: [
                    { type: 'human' },
                    { type: 'cpu', difficulty: 'normal' },
                ],
            },
            stateSnapshot: {},
        }
    );
    assert.deepStrictEqual(calls, [['settings', [], 0]]);
});

runTest('restore action audit payload preserves canonical field shape and client id', () => {
    const { calls, builders } = makePayloadBuilders();
    const data = { cardName: 'パン屋', ignored: true };
    const actionEntry = {
        action: 'buildCard',
        data,
        playerIndex: 1,
        seq: 8,
        clientActionId: ' action-1 ',
        restoreActionAudit: { ignored: true },
    };

    assert.deepStrictEqual(builders.buildRestoreActionAuditPayload(actionEntry), {
        action: 'buildCard',
        data: { cardName: 'パン屋' },
        playerIndex: 1,
        seq: 8,
        clientActionId: 'action-1',
    });
    assert.strictEqual(actionEntry.data, data);
    assert.deepStrictEqual(calls, [
        ['canonicalize', 'buildCard', data],
        ['clientActionId', ' action-1 '],
    ]);
});

runTest('restore action audit payload defaults data and omits invalid client id', () => {
    const { calls, builders } = makePayloadBuilders({
        canonicalizeActionData(action, data) {
            calls.push(['canonicalize', action, data]);
            return {};
        },
        normalizeClientActionId(clientActionId) {
            calls.push(['clientActionId', clientActionId]);
            return '';
        },
    });

    assert.deepStrictEqual(builders.buildRestoreActionAuditPayload({
        action: 'nextTurn',
        playerIndex: 0,
        seq: 1,
    }), {
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        seq: 1,
    });
    assert.deepStrictEqual(calls, [
        ['canonicalize', 'nextTurn', {}],
        ['clientActionId', undefined],
    ]);
});

runTest('restore action audit payload rejects malformed identity before dependencies', () => {
    const { calls, builders } = makePayloadBuilders();
    const malformedEntries = [
        null,
        {},
        { action: 1, playerIndex: 0, seq: 1 },
        { action: 'nextTurn', playerIndex: 0.5, seq: 1 },
        { action: 'nextTurn', playerIndex: 0, seq: '1' },
    ];

    malformedEntries.forEach(entry => {
        assert.strictEqual(builders.buildRestoreActionAuditPayload(entry), null);
    });
    assert.deepStrictEqual(calls, []);
});

runTest('restore audit payload requires all normalization dependencies', () => {
    assert.throws(() => makeRestoreAuditPayload(), /normalizePlayerSettings must be a function/);
    assert.throws(
        () => makeRestoreAuditPayload({ normalizePlayerSettings() {} }),
        /canonicalizeActionData must be a function/
    );
    assert.throws(
        () => makeRestoreAuditPayload({
            normalizePlayerSettings() {},
            canonicalizeActionData() {},
        }),
        /normalizeClientActionId must be a function/
    );
});
