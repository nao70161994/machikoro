'use strict';

const assert = require('assert');
const GameSelectionState = require('../js/gameSelectionState');
const { runTest } = require('./helpers/test-utils');

runTest('game selection controllerは重複を除いた順序付きsnapshotを返す', () => {
    const controller = GameSelectionState.createController({
        enabledCards: ['麦畑', 'パン屋', '麦畑'],
        enabledLandmarks: new Set(['駅', '港']),
    });

    assert.deepStrictEqual(controller.snapshot(), {
        enabledCards: ['麦畑', 'パン屋'],
        enabledLandmarks: ['駅', '港'],
    });
    assert.ok(Object.isFrozen(controller.snapshot()));
    assert.ok(Object.isFrozen(controller.snapshot().enabledCards));
});

runTest('game selection controllerは外部Set変更から内部状態を分離する', () => {
    const cards = new Set(['麦畑']);
    const controller = GameSelectionState.createController({ enabledCards: cards });
    cards.add('牧場');
    const detached = controller.cards();
    detached.add('カフェ');

    assert.deepStrictEqual(controller.snapshot().enabledCards, ['麦畑']);
    controller.replaceCards(['パン屋', 'パン屋', '森林']);
    controller.replaceLandmarks(['駅', '空港']);
    assert.deepStrictEqual(controller.snapshot(), {
        enabledCards: ['パン屋', '森林'],
        enabledLandmarks: ['駅', '空港'],
    });
});

runTest('game selection controllerはnullを空選択として正規化する', () => {
    const controller = GameSelectionState.createController({ enabledCards: null });
    controller.replaceLandmarks(null);
    assert.deepStrictEqual(controller.snapshot(), {
        enabledCards: [],
        enabledLandmarks: [],
    });
});
