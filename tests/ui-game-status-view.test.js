'use strict';

const assert = require('assert');
const UiGameStatusView = require('../js/uiGameStatusView');
const { runTest } = require('./helpers/test-utils');

runTest('UI game status viewは手番表示とroll/skip状態を純粋計算する', () => {
    assert.strictEqual(
        UiGameStatusView.buildTurnStatusText({ name: 'Alice', coins: 7 }),
        '👤 Aliceのターン　🪙 7コイン'
    );
    assert.deepStrictEqual(UiGameStatusView.buildRollButtonView(true), { disabled: false });
    assert.deepStrictEqual(UiGameStatusView.buildRollButtonView(false), { disabled: true });
    const built = UiGameStatusView.buildSkipButtonView({
        canNextTurn: true,
        pendingRenovation: 0,
        builtThisTurn: true,
    });
    assert.deepStrictEqual(built, { disabled: false, textContent: '建設完了・ターン終了' });
    assert.ok(Object.isFrozen(built));
    assert.deepStrictEqual(UiGameStatusView.buildSkipButtonView({
        canNextTurn: true,
        pendingRenovation: 1,
        builtThisTurn: false,
    }), { disabled: true, textContent: '建設しないでターン終了' });
});

runTest('UI game status viewは既存の二個・一個・未出目表示を選択する', () => {
    const pair = UiGameStatusView.selectDiceValues({ lastDice1: 2, lastDice2: 5, lastDiceResult: 7 });
    assert.deepStrictEqual(pair, [2, 5]);
    assert.ok(Object.isFrozen(pair));
    assert.deepStrictEqual(UiGameStatusView.selectDiceValues({ lastDice1: 0, lastDice2: 0, lastDiceResult: 4 }), [4]);
    assert.strictEqual(UiGameStatusView.selectDiceValues({ lastDice1: 0, lastDice2: 0, lastDiceResult: 0 }), null);
});
