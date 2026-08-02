'use strict';

const assert = require('assert');
const makeActionValidation = require('../server/actionValidation');
const { runTest } = require('./helpers/test-utils');

const {
    originalPlayerIndexForGamePosition,
    canSocketSubmitCurrentAction,
} = makeActionValidation({
    gameRuntime: {
        GameManager: {
            pendingActionsFor() {
                return [];
            },
            allowedActionsFor() {
                return new Set();
            },
        },
    },
});

runTest('action actor mapping はシャッフル後のgame位置を元player indexへ戻す', () => {
    const room = {
        gameStartPayload: {
            playerOrder: [2, 0, 1],
        },
    };

    assert.strictEqual(originalPlayerIndexForGamePosition(room, 0), 2);
    assert.strictEqual(originalPlayerIndexForGamePosition(room, 1), 0);
    assert.strictEqual(originalPlayerIndexForGamePosition({}, 2), 2);
    assert.strictEqual(originalPlayerIndexForGamePosition(null, 1), 1);
});

runTest('action actor authority はhuman手番を元player indexだけに許可する', () => {
    const room = {
        hostPlayerIndex: 0,
        gameStartPayload: {
            playerOrder: [2, 0, 1],
        },
    };
    const game = { currentPlayerIndex: 1 };

    assert.strictEqual(
        canSocketSubmitCurrentAction(room, { playerIndex: 0 }, game, []),
        true
    );
    assert.strictEqual(
        canSocketSubmitCurrentAction(room, { playerIndex: 1 }, game, []),
        false
    );
});

runTest('action actor authority はCPU手番をhostだけに許可する', () => {
    const room = {
        hostPlayerIndex: 2,
        gameStartPayload: {
            playerOrder: [1, 2, 0],
        },
    };
    const game = { currentPlayerIndex: 0 };
    const cpuPlayers = [{ type: 'cpu' }];

    assert.strictEqual(
        canSocketSubmitCurrentAction(room, { playerIndex: 2 }, game, cpuPlayers),
        true
    );
    assert.strictEqual(
        canSocketSubmitCurrentAction(room, { playerIndex: 1 }, game, cpuPlayers),
        false
    );
});

runTest('action actor authority は必須context欠落をfail closedにする', () => {
    const room = { hostPlayerIndex: 0 };
    const socket = { playerIndex: 0 };
    const game = { currentPlayerIndex: 0 };

    assert.strictEqual(canSocketSubmitCurrentAction(null, socket, game, []), false);
    assert.strictEqual(canSocketSubmitCurrentAction(room, null, game, []), false);
    assert.strictEqual(canSocketSubmitCurrentAction(room, socket, null, []), false);
});
