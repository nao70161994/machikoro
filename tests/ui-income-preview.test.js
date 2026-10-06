'use strict';
const assert = require('assert');
const vm = require('vm');
const { runTest } = require('./helpers/test-utils');
const { loadGameRuntime } = require('./helpers/runtime-loaders');
const { CPUSimulation } = require('../js/cpuSimulation');
const UiIncomePreview = require('../js/uiIncomePreview');

function fixture(count = 4) {
    const runtime = loadGameRuntime();
    runtime.LANDMARK_NAMES = vm.runInContext('LANDMARK_NAMES', runtime);
    const game = new runtime.GameManager(count);
    game.players.forEach(player => { player.cards = []; player.coins = 3; player.hasYakusho = false; });
    const helper = UiIncomePreview.create({
        simulation: CPUSimulation, createGame: count => new runtime.GameManager(count),
        cloneCard: card => runtime.createCardByName(card.name),
        defaultLandmarks: () => runtime.Player.landmarkNames(), cards: runtime.CARDS,
        tunaEffect: runtime.CARD_EFFECTS.TUNA, harborName: runtime.LANDMARK_NAMES.HARBOR,
    });
    return { runtime, game, helper, card: name => runtime.createCardByName(name) };
}
const row = (result, dice) => result.rows.find(row => row.dice === dice);
const approximately = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

runTest('出目別予測は3/4/10人と対象/振る人を分離し確率で期待値を集計する', () => {
    for (const count of [3, 4, 10]) {
        const { game, helper, card } = fixture(count);
        game.players[1].cards = [card('麦畑'), card('パン屋')];
        const other = helper.evaluate(game, { playerIndex: 1, rollerIndex: 0 });
        assert.strictEqual(other.available, true);
        assert.strictEqual(other.rows.length, 6);
        assert.strictEqual(row(other, 1).target.mean, 1);
        assert.strictEqual(row(other, 2).target.mean, 0);
        approximately(other.target.mean, 1 / 6);
        const own = helper.evaluate(game, { playerIndex: 1, rollerIndex: 1, diceCount: 2 });
        assert.strictEqual(own.rows.length, 11);
        assert.strictEqual(row(own, 2).target.mean, 1);
        assert.strictEqual(row(own, 3).target.mean, 1);
        approximately(own.target.mean, 3 / 36);
        approximately(own.rows.reduce((sum, row) => sum + row.probability, 0), 1);
    }
});

runTest('赤施設の逆席順と残高上限を正本に委譲し他人の収支も返す', () => {
    const { game, helper, card } = fixture();
    game.players[0].coins = 1;
    game.players[2].cards = [card('カフェ')];
    game.players[3].cards = [card('カフェ')];
    const result = row(helper.evaluate(game, { playerIndex: 0, rollerIndex: 0 }), 3);
    assert.strictEqual(result.players[0].mean, -1);
    assert.strictEqual(result.players[3].mean, 1);
    assert.strictEqual(result.players[2].mean, 0);
    assert.strictEqual(game.players[0].coins, 1);
});

runTest('休業解除はその出目で発動せず元のcard参照と休業配列を変更しない', () => {
    const { game, helper, card } = fixture(3);
    const forest = card('森林');
    game.players[1].cards = [forest];
    game.players[1].dormantCards = [forest];
    const result = row(helper.evaluate(game, { playerIndex: 1, rollerIndex: 0 }), 5);
    assert.strictEqual(result.target.mean, 0);
    assert.strictEqual(game.players[1].cards[0], forest);
    assert.strictEqual(game.players[1].dormantCards[0], forest);
});

runTest('港は別候補として10以上のみ+2し13/14とマグロ別ダイスを列挙する', () => {
    const { game, helper, runtime, card } = fixture(4);
    game.players[0].landmarks[runtime.LANDMARK_NAMES.HARBOR] = true;
    game.players[0].cards = [card('マグロ漁船')];
    const ordinary = helper.evaluate(game, { playerIndex: 0, rollerIndex: 0, diceCount: 2 });
    const tuna = row(ordinary, 12).target;
    approximately(tuna.mean, 7);
    assert.strictEqual(tuna.min, 2);
    assert.strictEqual(tuna.max, 12);
    assert.strictEqual(ordinary.simulationCount, 121);
    approximately(ordinary.target.mean, 7 / 36);
    const harbor = helper.evaluate(game, { playerIndex: 0, rollerIndex: 0, diceCount: 2, harborBonus: true });
    for (const dice of [10, 11, 12]) {
        assert.strictEqual(row(harbor, dice).effectiveDice, dice + 2);
        approximately(row(harbor, dice).target.mean, 7);
    }
    assert.strictEqual(row(harbor, 9).effectiveDice, 9);
    approximately(harbor.target.mean, 7 / 6);
    assert.strictEqual(helper.evaluate(game, { playerIndex: 0, rollerIndex: 0, harborBonus: true }).reason, 'harbor-unavailable');
});

runTest('選択効果は未解決と注記し旧pendingを混ぜず即時収支だけを返す', () => {
    const { game, helper, card } = fixture();
    game.players[0].cards = [card('テレビ局')];
    game.pendingBusiness = 1;
    const result = row(helper.evaluate(game, { playerIndex: 0, rollerIndex: 0 }), 6);
    assert.deepStrictEqual(result.pending.map(note => note.field), ['pendingTV']);
    assert.strictEqual(result.target.mean, 0);
    assert.strictEqual(game.pendingBusiness, 1);
    assert.strictEqual(game.pendingTV, 0);
});

runTest('描画用評価は状態/ログ/保存用値/CPUcache/乱数を変更しない', () => {
    const { game, helper, runtime, card } = fixture(10);
    game.players[0].cards = [card('マグロ漁船'), card('テレビ局')];
    game.players[0].landmarks[runtime.LANDMARK_NAMES.HARBOR] = true;
    game.log.push({ type: 'system', message: '保存対象ログ' });
    game.pendingTunaDice = [3, 4];
    const before = JSON.stringify(game);
    const log = game.log;
    const tuna = game.pendingTunaDice;
    runtime.Math.random = () => { throw new Error('preview consumed random'); };
    const first = helper.evaluate(game, { playerIndex: 3, rollerIndex: 0, diceCount: 2 });
    assert.strictEqual(JSON.stringify(game), before);
    assert.strictEqual(game.log, log);
    assert.strictEqual(game.pendingTunaDice, tuna);
    assert.deepStrictEqual(helper.evaluate(game, { playerIndex: 3, rollerIndex: 0, diceCount: 2 }), first);
    const restored = CPUSimulation.cloneGame(game, {
        createGame: n => new runtime.GameManager(n), cloneCard: c => runtime.createCardByName(c.name),
        defaultLandmarks: () => runtime.Player.landmarkNames(),
    });
    assert.deepStrictEqual(helper.evaluate(restored, { playerIndex: 3, rollerIndex: 0, diceCount: 2 }), first);
    game.players[0].cards.push({ name: '未知の施設' });
    assert.strictEqual(helper.evaluate(game, { playerIndex: 0, rollerIndex: 0 }).reason, 'unknown-card');
});

runTest('マグロ平均は公園の丸め後に集計し平均ダイスの代入で近似しない', () => {
    const { game, helper, runtime, card } = fixture(3);
    game.players[0].landmarks[runtime.LANDMARK_NAMES.HARBOR] = true;
    game.players[0].cards = [card('マグロ漁船'), card('公園')];
    const outcome = row(helper.evaluate(game, { playerIndex: 0, rollerIndex: 0, diceCount: 2 }), 12);
    approximately(outcome.target.mean, 8 / 3);
    assert.strictEqual(outcome.target.min, 1);
    assert.strictEqual(outcome.target.max, 4);
    assert.notStrictEqual(outcome.target.mean, Math.ceil(7 / 3));
});
