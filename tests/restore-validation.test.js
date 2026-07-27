const assert = require('assert');
const makeRestoreValidation = require('../server/restoreValidation');
const { isValidGameSchemaMetadata } = require('../server/gameSchemaRuntime');
const { runTest } = require('./helpers/test-utils');

const validUndoState = { kind: 'valid-undo' };
const validation = makeRestoreValidation({
    isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    },
    isValidUndoState(value, playerCount, createCardByName) {
        return value === validUndoState && playerCount === 2 && createCardByName('Card A').name === 'Card A';
    },
    createCardByName(name) {
        return { name };
    },
    cards: [{ name: 'Card A' }, { name: 'Card B' }],
    landmarkNames() {
        return ['Station', 'Mall'];
    },
    sanitizeName(name) {
        return typeof name === 'string' ? name.trim() : '';
    },
    isValidGameSchemaMetadata,
});

function validPayload(overrides = {}) {
    return Object.assign({
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
        enabledCards: ['Card A'],
        enabledLandmarks: ['Station'],
        cpuSpeed: 1500,
        gameSchema: { actionVersion: 1, snapshotVersion: 1 },
    }, overrides);
}

runTest('restore validation preserves valid game-start payloads and legacy optional fields', () => {
    assert.strictEqual(validation.isValidGameStartPayload(validPayload(), 2), true);
    assert.strictEqual(validation.isValidGameStartPayload(validPayload({
        playerSettings: [],
        playerOrder: undefined,
        enabledCards: undefined,
        enabledLandmarks: undefined,
        cpuSpeed: undefined,
        gameSchema: undefined,
    }), 2), true);
});

runTest('restore validation rejects malformed game-start fields by contract boundary', () => {
    const invalidCases = [
        [validPayload(), 1],
        [validPayload({ playerNames: ['Alice'] }), 2],
        [validPayload({ playerNames: [' Alice', 'Bob'] }), 2],
        [validPayload({ playerSettings: [{ type: 'human' }] }), 2],
        [validPayload({ playerOrder: [0, 0] }), 2],
        [validPayload({ hostPlayerIndex: 2 }), 2],
        [validPayload({ enabledCards: ['Unknown'] }), 2],
        [validPayload({ enabledLandmarks: [] }), 2],
        [validPayload({ enabledLandmarks: ['Unknown'] }), 2],
        [validPayload({ cpuSpeed: -1 }), 2],
        [validPayload({ cpuSpeed: Infinity }), 2],
        [validPayload({ gameSchema: {} }), 2],
        [validPayload({ gameSchema: { actionVersion: 2, snapshotVersion: 1 } }), 2],
    ];
    for (const [payload, playerCount] of invalidCases) {
        assert.strictEqual(validation.isValidGameStartPayload(payload, playerCount), false);
    }
});

runTest('restore validation sanitizes invalid undo state without mutating snapshots', () => {
    const validSnapshot = { actionSeq: 4, undoState: validUndoState };
    const validResult = validation.sanitizeClientStateSnapshot(validSnapshot, 2);
    assert.notStrictEqual(validResult, validSnapshot);
    assert.strictEqual(validResult.undoState, validUndoState);

    const invalidSnapshot = { actionSeq: 5, undoState: { broken: true } };
    const invalidResult = validation.sanitizeClientStateSnapshot(invalidSnapshot, 2);
    assert.strictEqual(invalidResult.undoState, null);
    assert.deepStrictEqual(invalidSnapshot.undoState, { broken: true });
    assert.strictEqual(validation.sanitizeClientStateSnapshot([], 2), null);
});

runTest('restore validation rebuilds only token-backed human player slots', () => {
    const players = validation.buildRestoredHumanPlayers({
        playerNames: ['Host', 'CPU', 'Guest'],
        playerSettings: [{ type: 'human' }, { type: 'cpu' }, { type: 'human' }],
        reconnectTokenHashes: ['host-hash', '', 'guest-hash'],
    }, 2, 'guest-socket');

    assert.deepStrictEqual(players, [
        {
            id: null,
            index: 0,
            name: 'Host',
            reconnectToken: '',
            reconnectTokenHash: 'host-hash',
        },
        {
            id: 'guest-socket',
            index: 2,
            name: 'Guest',
            reconnectToken: '',
            reconnectTokenHash: 'guest-hash',
        },
    ]);
});
