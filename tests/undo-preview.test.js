'use strict';

const assert = require('assert');
const UndoPreview = require('../js/undoPreview');
const { runTest } = require('./helpers/test-utils');

runTest('undo previewは建設で増えた施設・ランドマーク・コイン差を要約する', () => {
    const preview = UndoPreview.build({
        game: {
            currentPlayerIndex: 0,
            players: [{
                name: 'Alice', coins: 2,
                cards: [{ name: '麦畑' }, { name: 'カフェ' }],
                landmarks: { 駅: true, 港: false },
            }],
        },
        state: {
            playerCoins: [5],
            playerCardNames: [['麦畑']],
            playerLandmarks: [{ 駅: false, 港: false }],
        },
    });
    assert.deepStrictEqual(preview.removed, ['カフェ', '駅']);
    assert.ok(preview.message.includes('2 → 5コイン'));
    assert.ok(preview.message.includes('カフェ、駅'));
});

runTest('undo previewは不正snapshotを拒否する', () => {
    assert.strictEqual(UndoPreview.build({}), null);
});
