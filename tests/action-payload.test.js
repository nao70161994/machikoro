const assert = require('assert');
const makeActionPayload = require('../server/actionPayload');
const { runTest } = require('./helpers/test-utils');

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const {
    CANONICAL_ACTION_PAYLOAD_KEYS,
    canonicalizeActionData,
    normalizeClientActionId,
} = makeActionPayload({ isPlainObject });

runTest('action payloadは余分なkeyを除き既存canonical shapeを維持する', () => {
    assert.deepStrictEqual(canonicalizeActionData('nextTurn', { extra: true }), {});
    assert.deepStrictEqual(
        canonicalizeActionData('buildCard', { cardName: '麦畑', extra: true }),
        { cardName: '麦畑' }
    );
    assert.deepStrictEqual(
        canonicalizeActionData('resolveMover', {
            cardIndex: 2,
            cardName: '麦畑',
            targetIndex: 1,
            extra: true,
        }),
        { cardIndex: 2, targetIndex: 1 }
    );
    assert.deepStrictEqual(
        canonicalizeActionData('resolveMover', {
            cardName: '麦畑',
            targetIndex: 1,
            extra: true,
        }),
        { cardName: '麦畑', targetIndex: 1 }
    );
    assert.deepStrictEqual(canonicalizeActionData('unknown', { value: 1 }), {});
    assert.deepStrictEqual(canonicalizeActionData('buildCard', []), {});
});

runTest('action payload metadataは全canonical actionをfrozen key配列で定義する', () => {
    assert.ok(Object.isFrozen(CANONICAL_ACTION_PAYLOAD_KEYS));
    for (const keys of Object.values(CANONICAL_ACTION_PAYLOAD_KEYS)) {
        assert.ok(Object.isFrozen(keys));
        assert.ok(keys.every(key => typeof key === 'string' && key.length > 0));
    }
});

runTest('client action idは現行文字集合と120文字上限を維持する', () => {
    const valid = 'Action_1:room-test';
    assert.strictEqual(normalizeClientActionId(valid), valid);
    assert.strictEqual(normalizeClientActionId('a'.repeat(120)), 'a'.repeat(120));
    assert.strictEqual(normalizeClientActionId('a'.repeat(121)), '');
    assert.strictEqual(normalizeClientActionId('with space'), '');
    assert.strictEqual(normalizeClientActionId(null), '');
});
