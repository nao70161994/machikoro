const assert = require('assert');
const path = require('path');
const GameSnapshot = require('../js/gameSnapshot');
const { makeGameRuntimeLoader } = require('../server/gameRuntimeLoader');
const { makeSocketPayloadValidation, makeSocketPayloadGateway } = require('../server/socketPayload');
const { RESTORE_PAYLOAD_LIMITS } = require('../server/runtimeLimits');
const { runTest } = require('./helpers/test-utils');

const socketLimits = Object.freeze({
    maxJsonBytes: 256,
    maxStringLength: 20,
    maxTotalStringChars: 30,
    maxDepth: 3,
});
const restoreLimits = Object.freeze({
    maxJsonBytes: 1024,
    maxActionLogEntries: 2,
    maxStringLength: 40,
    maxTotalStringChars: 100,
    maxPlayerCardRefs: 3,
    maxTotalNodes: 12,
});
const validation = makeSocketPayloadValidation({
    isPlainObject(value) {
        if (!value || typeof value !== 'object') return false;
        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
    },
    byteLength: value => Buffer.byteLength(value, 'utf8'),
    socketLimits,
    restoreLimits,
});

runTest('socket payload gateway はappError eventと既存拒否messageを固定する', () => {
    const emitted = [];
    const validated = [];
    const gateway = makeSocketPayloadGateway({
        validateSocketPayloadLimits(payload) {
            validated.push(payload);
            return { ok: payload && payload.valid === true };
        },
        appErrorEvent: 'appError',
        invalidMessage: '無効なリクエストです',
    });
    const socket = {
        emit(name, payload) {
            emitted.push([name, payload]);
        },
    };

    gateway.emitAppError(socket, '個別エラー');
    assert.strictEqual(gateway.requirePlainSocketPayload(socket, { valid: true }), true);
    assert.strictEqual(gateway.requirePlainSocketPayload(socket, { valid: false }), false);
    assert.deepStrictEqual(validated, [{ valid: true }, { valid: false }]);
    assert.deepStrictEqual(emitted, [
        ['appError', '個別エラー'],
        ['appError', '無効なリクエストです'],
    ]);
    assert.ok(Object.isFrozen(gateway));
});

runTest('socket payload gateway はvalidator注入を必須にする', () => {
    assert.throws(
        () => makeSocketPayloadGateway(),
        /validateSocketPayloadLimits must be a function/
    );
});

runTest('socket payload helper はobject・JSON・byte上限を既存reasonで判定する', () => {
    assert.deepStrictEqual(validation.validateSocketPayloadLimits(null), {
        ok: false,
        reason: 'not-object',
    });

    const circular = {};
    circular.self = circular;
    assert.deepStrictEqual(validation.validateSocketPayloadLimits(circular), {
        ok: false,
        reason: 'json',
    });

    const oversized = validation.validateSocketPayloadLimits({ text: 'x'.repeat(250) });
    assert.strictEqual(oversized.ok, false);
    assert.strictEqual(oversized.reason, 'json-size');
    assert.ok(oversized.jsonBytes > socketLimits.maxJsonBytes);
});

runTest('socket payload helper は通常payloadの文字列長・合計・深さを分離して制限する', () => {
    const valid = validation.validateSocketPayloadLimits({
        roomId: 'ROOM',
        nested: { values: ['one', 'two'] },
    });
    assert.strictEqual(valid.ok, true);
    assert.strictEqual(valid.stringChars, 10);

    assert.strictEqual(validation.validateSocketPayloadLimits({
        value: 'x'.repeat(socketLimits.maxStringLength + 1),
    }).reason, 'content-size');
    assert.strictEqual(validation.validateSocketPayloadLimits({
        first: 'x'.repeat(16),
        second: 'y'.repeat(16),
    }).reason, 'content-size');
    assert.strictEqual(validation.validateSocketPayloadLimits({
        one: { two: { three: { four: true } } },
    }).reason, 'content-size');
});

runTest('socket payload helper はrestore action件数とcard参照数を別契約で制限する', () => {
    assert.strictEqual(validation.validateRestorePayloadLimits({
        roomId: 'ROOM',
        actionLog: [{}, {}, {}],
    }).reason, 'action-log-length');

    const valid = validation.validateRestorePayloadLimits({
        roomId: 'ROOM',
        actionLog: [],
        stateSnapshot: { cards: ['a', 'b', 'c'] },
    });
    assert.strictEqual(valid.ok, true);
    assert.strictEqual(valid.actionLogEntries, 0);
    assert.strictEqual(valid.playerCardRefs, 3);
    assert.strictEqual(valid.totalNodes, 8);

    const tooManyCards = validation.validateRestorePayloadLimits({
        stateSnapshot: { playerCardNames: [['a', 'b'], ['c', 'd']] },
    });
    assert.strictEqual(tooManyCards.ok, false);
    assert.strictEqual(tooManyCards.reason, 'content-size');
    assert.strictEqual(tooManyCards.playerCardRefs, 4);
});

runTest('socket payload helper はrestore文字列・深さ・循環入力を安全に拒否する', () => {
    assert.strictEqual(validation.validateRestorePayloadLimits({
        memo: 'x'.repeat(restoreLimits.maxStringLength + 1),
    }).reason, 'content-size');

    let nested = {};
    for (let index = 0; index < 22; index++) nested = { nested };
    assert.strictEqual(validation.validateRestorePayloadLimits(nested).reason, 'content-size');

    let nestedCards = 'card';
    for (let index = 0; index < 4000; index++) nestedCards = [nestedCards];
    const deepValidation = makeSocketPayloadValidation({
        isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
        byteLength: value => Buffer.byteLength(value, 'utf8'),
        socketLimits,
        restoreLimits: { ...restoreLimits, maxJsonBytes: 1024 * 1024, maxTotalNodes: 20000 },
    });
    assert.doesNotThrow(() => deepValidation.validateRestorePayloadLimits({ cards: nestedCards }));
    assert.strictEqual(
        deepValidation.validateRestorePayloadLimits({ cards: nestedCards }).reason,
        'content-size'
    );

    const nodeBoundary = validation.validateRestorePayloadLimits({
        padding: Array.from({ length: restoreLimits.maxTotalNodes - 2 }, () => 0),
    });
    assert.strictEqual(nodeBoundary.ok, true);
    assert.strictEqual(nodeBoundary.totalNodes, restoreLimits.maxTotalNodes);
    assert.strictEqual(validation.validateRestorePayloadLimits({
        padding: Array.from({ length: restoreLimits.maxTotalNodes }, () => 0),
    }).reason, 'content-size');

    const circular = {};
    circular.self = circular;
    assert.strictEqual(validation.validateRestorePayloadLimits(circular).reason, 'json');
});

function makeProductionUndoLimitFixture({ signed }) {
    const runtime = makeGameRuntimeLoader({ baseDir: path.join(__dirname, '..') })();
    const game = new runtime.GameManager(10);
    const shopStock = {};
    let playerIndex = 0;

    for (const card of runtime.CARDS) {
        runtime.setShopStockCount(
            shopStock,
            card,
            runtime.getInitialCardStock(card, game.players.length)
        );
        while (runtime.getShopStockCount(shopStock, card) > 0) {
            game.players[playerIndex % game.players.length].cards.push(
                runtime.createCardByName(card.name)
            );
            runtime.decrementShopStock(shopStock, card);
            playerIndex++;
        }
    }
    game.log = Array.from({ length: 30 }, (_, index) => ({
        type: 'system',
        message: `合法なゲームログ${index + 1}`,
    }));

    const undoState = GameSnapshot.serializeUndoState(game, shopStock, 30);
    const actionLog = [];
    for (let index = 0; index < 100; index++) {
        const buildEntry = {
            action: 'buildLandmark',
            data: { landmarkName: '駅' },
            playerIndex: 0,
            seq: (index * 2) + 1,
        };
        const undoEntry = {
            action: 'undoBuild',
            data: { state: undoState },
            playerIndex: 0,
            seq: (index * 2) + 2,
        };
        if (signed) {
            for (const entry of [buildEntry, undoEntry]) {
                entry.restoreActionAudit = {
                    schemaVersion: 1,
                    roomId: 'ROOM01',
                    signed: true,
                    algorithm: 'hmac-sha256',
                    keyId: 'restore-audit-v1',
                    canonicalHash: 'a'.repeat(64),
                    payloadHash: 'a'.repeat(64),
                    signature: 'b'.repeat(64),
                    createdAt: 1,
                    source: 'server-action-log',
                };
            }
        }
        actionLog.push(buildEntry, undoEntry);
    }
    return {
        roomId: 'ROOM01',
        gameStartPayload: {
            playerNames: Array.from({ length: 10 }, (_, index) => `P${index + 1}`),
        },
        actionLog,
    };
}

runTest('socket payload helper はproduction形状の10人戦build・Undo履歴をnode上限内で許可する', () => {
    const productionValidation = makeSocketPayloadValidation({
        isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
        byteLength: value => Buffer.byteLength(value, 'utf8'),
        socketLimits,
        restoreLimits: RESTORE_PAYLOAD_LIMITS,
    });
    const unsigned = productionValidation.validateRestorePayloadLimits(
        makeProductionUndoLimitFixture({ signed: false })
    );
    const signed = productionValidation.validateRestorePayloadLimits(
        makeProductionUndoLimitFixture({ signed: true })
    );

    for (const result of [unsigned, signed]) {
        assert.strictEqual(result.ok, true);
        assert.ok(result.jsonBytes < RESTORE_PAYLOAD_LIMITS.maxJsonBytes);
        assert.strictEqual(result.actionLogEntries, 200);
        assert.strictEqual(result.playerCardRefs, 28000);
        assert.ok(result.totalNodes < RESTORE_PAYLOAD_LIMITS.maxTotalNodes);
    }
    assert.ok(unsigned.totalNodes > 50000);
    assert.ok(signed.totalNodes > unsigned.totalNodes);
    assert.ok(signed.jsonBytes > unsigned.jsonBytes);
});
