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
runTest('旧保存の振り直し確認から新規rerollを行うと一度だけ強調する', () => {
    const { GameManager, LANDMARK_NAMES } = realRuntime();
    const game = new GameManager(2), helper = CardBoardFeedback.create();
    game.players[0].landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    game.rollDice(3);
    game.log = game.log.map(({ type, message }) => ({ type, message }));
    const facts = { game, session: [] };
    assert.strictEqual(helper.refresh(facts), false);
    game.rerollDice(3);
    assert.strictEqual(helper.refresh(facts), true);
    assert.strictEqual(helper.refresh(facts), false);
});
function fixture() {
    const game = { players: [{}, {}], turnCount: 1, currentPlayerIndex: 0,
        usedReroll: false, lastDice1: 3, lastDice2: 0, lastDiceResult: 3, log: [] };
    const session = [];
    return { game, session, replaying: false };
}
const roll = (game, message = '🎲 3 が出ました') => ({ type: 'dice', message,
    diceResolution: { dice1: 3, dice2: 0, result: 3, rerolled: game.usedReroll,
        turn: game.turnCount, actor: game.currentPlayerIndex } });
runTest('出目確定identityは日本語ログ文言に依存せず古い状態は安全にbaselineへ戻す', () => {
    const helper = CardBoardFeedback.create(), facts = fixture();
    helper.refresh(facts);
    facts.game.log.push(roll(facts.game, 'Dice landed: THREE'));
    assert.strictEqual(helper.refresh(facts), true);
    facts.game.log.push({ type: 'dice', message: '🎲 3 が出ました' });
    assert.strictEqual(helper.refresh(facts), false, '文言だけでは実際のrollと判定しない');
    facts.game.log = facts.game.log.map(({ type, message }) => ({ type, message }));
    assert.strictEqual(helper.refresh(facts), false);
    facts.game.log.push({ type: 'dice', message: '🎲 3 が出ました' });
    assert.strictEqual(helper.refresh(facts), false, '旧保存にidentityがなくても過去演出を再生しない');
    assert.strictEqual(helper.refresh(facts), false);
    facts.game.turnCount++;
    facts.game.log.push(roll(facts.game, '新しい文言'));
    assert.strictEqual(helper.refresh(facts), true);
});
runTest('初回を除外し同出目の新規appendだけを一度強調する', () => {
    const helper = CardBoardFeedback.create(), facts = fixture();
    facts.game.log.push(roll(facts.game));
    assert.strictEqual(helper.refresh(facts), false);
    facts.game.turnCount++;
    facts.game.log.push(roll(facts.game));
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
    facts.game.log.push(roll(facts.game));
    facts.session = [];
    assert.strictEqual(helper.refresh(facts), false);
    facts.replaying = true; facts.game.turnCount++; facts.game.log.push(roll(facts.game));
    assert.strictEqual(helper.refresh(facts), false);
    facts.replaying = false; facts.game.turnCount++; facts.game.log.push(roll(facts.game));
    assert.strictEqual(helper.refresh(facts), false);
    facts.game.log.shift();
    assert.strictEqual(helper.refresh(facts), false);
    facts.game.log[0] = { type: 'other', message: '置換' };
    assert.strictEqual(helper.refresh(facts), false);
    facts.game.turnCount--; facts.game.log.push(roll(facts.game));
    assert.strictEqual(helper.refresh(facts), false);
    helper.reset(); facts.game.log.push(roll(facts.game));
    assert.strictEqual(helper.refresh(facts), false);
});
runTest('100件を超えた過去の書換も新規roll扱いしない', () => {
    const helper = CardBoardFeedback.create(), facts = fixture();
    facts.game.log = Array.from({ length: 150 }, (_, i) => ({ type: 'other', message: String(i) }));
    helper.refresh(facts);
    facts.game.log[0].message = 'changed'; facts.game.log.push(roll(facts.game));
    assert.strictEqual(helper.refresh(facts), false);
    facts.game.turnCount++; facts.game.log.push(roll(facts.game));
    assert.strictEqual(helper.refresh(facts), true);
});
runTest('実GameManagerの非駅reroll置換を一度認識する', () => {
    const { GameManager, LANDMARK_NAMES } = realRuntime();
    const game = new GameManager(2), helper = CardBoardFeedback.create();
    game.players[0].landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    const addLog = game.addLog.bind(game);
    game.addLog = (type, message, options) => addLog(type, `別の表示文: ${message.length}`, options);
    const facts = { game, session: [], replaying: false };
    helper.refresh(facts);
    game.rollDice(3);
    assert.strictEqual(helper.refresh(facts), true);
    game.rerollDice(3);
    assert.strictEqual(helper.refresh(facts), true);
    assert.strictEqual(helper.refresh(facts), false);
});
runTest('保存snapshotの復元は過去演出を再生せず新規rollだけを強調する', () => {
    const { GameManager } = realRuntime();
    const GameSnapshot = require('../js/gameSnapshot');
    const game = new GameManager(2);
    game.rollDice(3);
    const snapshot = GameSnapshot.serializeGameState(game, {});
    assert.strictEqual(Object.hasOwn(snapshot, 'diceResolutionSequence'), false);
    const restored = new GameManager(2);
    assert.strictEqual(GameSnapshot.hydrateMutableGameState({
        game: restored, state: snapshot, shopStock: {},
        createCardByName: () => null,
        assignShopStockSnapshot: () => {},
        normalizePlayerCoins: value => value,
        readDormantIndices: value => value || [],
        readLandmarks: value => value || {},
        readLog: value => value || [],
        normalizeCurrentPlayerIndex: value => value,
    }), true);
    const helper = CardBoardFeedback.create(), facts = { game: restored, session: [] };
    assert.strictEqual(helper.refresh(facts), false);
    restored.turnCount++;
    restored.phase = 'roll';
    restored.rollDice(3);
    assert.strictEqual(helper.refresh(facts), true);
    restored.turnCount++;
    restored.log.push(roll(restored));
    restored.log.push(roll(restored));
    assert.strictEqual(helper.refresh(facts), false, '複数イベント再生は新しい1回のroll扱いしない');
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
    facts.game.log.push(roll(facts.game));
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
    facts.game.log.push(roll(facts.game));
    assert.strictEqual(helper.refresh(facts), true);
    assert.strictEqual(helper.wasInvalidated(), false);
    helper.reset();
    assert.strictEqual(helper.wasInvalidated(), true);
});

runTest('同一identityの重複や壊れたmetadataを新規出目扱いせず過去metadataの変更も検出する', () => {
    const helper = CardBoardFeedback.create(), facts = fixture();
    helper.refresh(facts);
    facts.game.log.push(roll(facts.game));
    assert.strictEqual(helper.refresh(facts), true);
    facts.game.log.push(roll(facts.game, '同じ確定結果の複製'));
    assert.strictEqual(helper.refresh(facts), false);
    facts.game.turnCount++;
    const malformed = roll(facts.game);
    malformed.diceResolution.result = 99;
    facts.game.log.push(malformed);
    assert.strictEqual(helper.refresh(facts), false);
    facts.game.log[0].diceResolution.dice1 = 4;
    facts.game.log[0].diceResolution.result = 4;
    facts.game.log.push(roll(facts.game));
    assert.strictEqual(helper.refresh(facts), false, '既存metadataの書き換えはprefix不整合');
});
