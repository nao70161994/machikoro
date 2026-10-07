'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const CardBoardFeedback = require('../js/cardBoardFeedback');
const { loadGameRuntime } = require('./helpers/runtime-loaders');
const vm = require('vm');
function realRuntime() {
    const runtime = loadGameRuntime();
    runtime.LANDMARK_NAMES = vm.runInContext('LANDMARK_NAMES', runtime);
    return runtime;
}
function fixture() {
    const game = { players: [{}, {}], turnCount: 1, currentPlayerIndex: 0,
        usedReroll: false, lastDice1: 3, lastDice2: 0, lastDiceResult: 3, log: [] };
    const session = [];
    return { game, session, replaying: false };
}
const roll = () => ({ type: 'dice', message: '🎲 3 が出ました' });
runTest('初回を除外し同出目の新規appendだけを一度強調する', () => {
    const helper = CardBoardFeedback.create(), facts = fixture();
    facts.game.log.push(roll());
    assert.strictEqual(helper.refresh(facts), false);
    facts.game.log.push(roll());
    const before = JSON.stringify(facts.game);
    assert.strictEqual(helper.refresh(facts), true);
    assert.strictEqual(helper.refresh(facts), false);
    assert.strictEqual(JSON.stringify(facts.game), before);
    facts.game.log.push({ type: 'gain', message: '🐟 マグロ発動 → 🎲3+3=6コイン' });
    assert.strictEqual(helper.refresh(facts), false);
});
runTest('session・replay復帰・reset・Undo・圧縮/不整合をbaselineにする', () => {
    const helper = CardBoardFeedback.create(), facts = fixture();
    helper.refresh(facts);
    facts.game.log.push(roll());
    facts.session = [];
    assert.strictEqual(helper.refresh(facts), false);
    facts.replaying = true; facts.game.log.push(roll());
    assert.strictEqual(helper.refresh(facts), false);
    facts.replaying = false; facts.game.log.push(roll());
    assert.strictEqual(helper.refresh(facts), false);
    facts.game.log.shift();
    assert.strictEqual(helper.refresh(facts), false);
    facts.game.log[0] = { type: 'other', message: '置換' };
    assert.strictEqual(helper.refresh(facts), false);
    facts.game.turnCount--; facts.game.log.push(roll());
    assert.strictEqual(helper.refresh(facts), false);
    helper.reset(); facts.game.log.push(roll());
    assert.strictEqual(helper.refresh(facts), false);
});
runTest('100件を超えた過去の書換も新規roll扱いしない', () => {
    const helper = CardBoardFeedback.create(), facts = fixture();
    facts.game.log = Array.from({ length: 150 }, (_, i) => ({ type: 'other', message: String(i) }));
    helper.refresh(facts);
    facts.game.log[0].message = 'changed'; facts.game.log.push(roll());
    assert.strictEqual(helper.refresh(facts), false);
    facts.game.log.push(roll());
    assert.strictEqual(helper.refresh(facts), true);
});
runTest('実GameManagerの非駅reroll置換を一度認識する', () => {
    const { GameManager, LANDMARK_NAMES } = realRuntime();
    const game = new GameManager(2), helper = CardBoardFeedback.create();
    game.players[0].landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    const facts = { game, session: [], replaying: false };
    helper.refresh(facts);
    game.rollDice(3);
    assert.strictEqual(helper.refresh(facts), true);
    game.rerollDice(3);
    assert.strictEqual(helper.refresh(facts), true);
    assert.strictEqual(helper.refresh(facts), false);
});
runTest('駅rerollの途中SELECT_DICEは強調せず実際の選択後だけ強調する', () => {
    const { GameManager, LANDMARK_NAMES } = realRuntime();
    const game = new GameManager(2), helper = CardBoardFeedback.create();
    game.players[0].landmarks[LANDMARK_NAMES.STATION] = true;
    game.players[0].landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    const facts = { game, session: [] };
    helper.refresh(facts);
    game.rollDice();
    assert.strictEqual(helper.refresh(facts), false);
    game.selectDiceCount(true, 2, 3);
    assert.strictEqual(helper.refresh(facts), true);
    game.rerollDice();
    assert.strictEqual(helper.refresh(facts), false);
    game.selectDiceCount(true, 2, 3);
    assert.strictEqual(helper.refresh(facts), true);
});
runTest('復元・次手番は進行中演出も無効化し通常更新は維持する', () => {
    const helper = CardBoardFeedback.create(), facts = fixture();
    helper.refresh(facts);
    assert.strictEqual(helper.wasInvalidated(), true);
    facts.game.log.push(roll());
    assert.strictEqual(helper.refresh(facts), true);
    assert.strictEqual(helper.wasInvalidated(), false);
    helper.refresh(facts);
    assert.strictEqual(helper.wasInvalidated(), false);
    facts.game.log = [];
    assert.strictEqual(helper.refresh(facts), false);
    assert.strictEqual(helper.wasInvalidated(), true);
    facts.game.turnCount++;
    facts.game.log.push({ type: 'system', message: '次の手番' });
    helper.refresh(facts);
    assert.strictEqual(helper.wasInvalidated(), true);
    facts.game.log.push(roll());
    assert.strictEqual(helper.refresh(facts), true);
    assert.strictEqual(helper.wasInvalidated(), false);
    helper.reset();
    assert.strictEqual(helper.wasInvalidated(), true);
});
