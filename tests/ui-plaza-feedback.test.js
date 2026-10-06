'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const UiPlazaFeedback = require('../js/uiPlazaFeedback');
function fixture() {
    const element = key => ({ dataset: { townBuilding: key }, classList: {
        values: new Set(), add(value) { this.values.add(value); }, remove(value) { this.values.delete(value); },
        contains(value) { return this.values.has(value); },
    } });
    const receipt = element(), wallet = element();
    const lots = [element('card:森林')];
    const panel = { querySelectorAll: () => lots };
    const doc = { getElementById: id => id === 'plazaPlayerHud' ? { querySelector: () => wallet } : panel };
    const game = { players: [{ name: '人', cards: [{ name: '森林' }], landmarks: {} }], log: [], turnCount: 1, currentPlayerIndex: 0 };
    let session = {}, replaying = false, sounds = 0, winner = false, milestones = [];
    let next = 0;
    const timers = new Map();
    const controller = UiPlazaFeedback.create({ document: doc, getGame: () => game,
        getSession: () => session, isReplaying: () => replaying, getReceipt: () => receipt,
        isWinner: () => winner, playLandmarkSound: () => sounds++, onMilestones: events => { milestones = events; },
        setTimeout: callback => { timers.set(++next, callback); return next; }, clearTimeout: id => timers.delete(id),
    });
    return { game, lots, receipt, wallet, controller, timers, element,
        session() { session = {}; }, replay(value) { replaying = value; }, win(value) { winner = value; }, sounds: () => sounds, milestones: () => milestones,
        finish() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } },
    };
}
runTest('初回と同じrenderはbaselineとし購入した最新lotだけ強調する', () => {
    const f = fixture();
    assert.deepStrictEqual(f.controller.refresh(), []);
    f.game.players[0].cards.push({ name: '森林' });
    const newLot = f.element('card:森林'); f.lots.push(newLot);
    assert.strictEqual(f.controller.refresh().length, 1);
    assert.ok(newLot.classList.contains('town-building-arrival'));
    assert.ok(!f.lots[0].classList.contains('town-building-arrival'));
    assert.ok(f.wallet.classList.contains('plaza-wallet-purchase'));
    const timerCount = f.timers.size;
    assert.deepStrictEqual(f.controller.refresh(), []);
    assert.strictEqual(f.timers.size, timerCount);
    f.finish();
    assert.ok(!newLot.classList.contains('town-building-arrival'));
});
runTest('session変更とreplayとUndoは演出を清掃してbaselineを確立する', () => {
    for (const reset of [f => f.session(), f => f.replay(true), f => f.game.players[0].cards.pop()]) {
        const f = fixture(); f.controller.refresh();
        f.game.players[0].cards.push({ name: '森林' }); f.lots.push(f.element('card:森林')); f.controller.refresh();
        reset(f);
        assert.deepStrictEqual(f.controller.refresh(), []);
        assert.strictEqual(f.timers.size, 0);
        assert.ok(!f.receipt.classList.contains('plaza-purchase-feedback'));
    }
});
runTest('非勝利ランドマークは短いSE一度とreceipt達成演出を出す', () => {
    const f = fixture(); f.controller.refresh();
    f.game.players[0].landmarks.駅 = true;
    f.lots.push(f.element('landmark:駅'));
    const event = f.controller.refresh()[0];
    assert.strictEqual(event.landmark, true);
    assert.strictEqual(f.sounds(), 1);
    assert.ok(f.receipt.classList.contains('plaza-landmark-feedback'));
    f.controller.refresh(); assert.strictEqual(f.sounds(), 1);
    f.game.players[0].landmarks.港 = true; f.win(true); f.lots.push(f.element('landmark:港'));
    assert.strictEqual(f.controller.refresh()[0].winner, true);
    assert.strictEqual(f.sounds(), 1);
    assert.ok(!f.lots[2].classList.contains('town-building-landmark-arrival'));
});
runTest('上限で新lotがない購入は古いlotを強調せずreceiptで知らせる', () => {
    const f = fixture(); f.game.players[0].cards = Array(6).fill({ name: '森林' });
    f.controller.refresh();
    f.game.players[0].cards.push({ name: '森林' });
    f.controller.refresh();
    assert.ok(!f.lots[0].classList.contains('town-building-arrival'));
    assert.ok(f.receipt.classList.contains('plaza-purchase-feedback'));
});
runTest('同じnewlogは繰り返さず新しい重要logのtimerは古いtimerに消されない', () => {
    const f = fixture(); f.controller.refresh();
    f.game.log.push({ type: 'gain', message: '+6コイン' }); f.controller.refresh();
    assert.strictEqual(f.timers.size, 1);
    const oldCallback = [...f.timers.values()][0];
    f.controller.refresh(); assert.strictEqual(f.timers.size, 1);
    f.game.log.push({ type: 'lose', message: '5コイン支払い' }); f.controller.refresh();
    assert.strictEqual(f.timers.size, 1);
    assert.notStrictEqual([...f.timers.values()][0], oldCallback);
    oldCallback(); // A stale queued callback must not erase a newer pulse.
    assert.ok(f.receipt.classList.contains('plaza-important-feedback'));
    f.finish(); assert.ok(!f.receipt.classList.contains('plaza-important-feedback'));
    f.controller.reset(); assert.strictEqual(f.timers.size, 0);
});

runTest('小さな複数収入のまとまったコンボもreceiptを強調し再renderで繰り返さない', () => {
    const f = fixture(); f.controller.refresh();
    f.game.log.push({ type: 'gain', message: '森林発動+3コイン' }, { type: 'gain', message: '森林発動+3コイン' });
    f.controller.refresh();
    assert.ok(f.receipt.classList.contains('plaza-important-feedback'));
    const timers = f.timers.size;
    f.controller.refresh(); assert.strictEqual(f.timers.size, timers);
});

runTest('明示resetは演出timerと建設receiptを消し再開をbaselineにする', () => {
    const f = fixture();
    f.controller.refresh();
    f.game.players[0].cards.push({ name: '森林' });
    f.lots.push(f.element('card:森林'));
    f.controller.refresh();
    assert.ok(f.receipt.classList.contains('plaza-purchase-feedback'));
    f.controller.reset();
    assert.strictEqual(f.timers.size, 0);
    assert.ok(!f.receipt.classList.contains('plaza-purchase-feedback'));
    assert.strictEqual(f.milestones().length, 0);
    assert.deepStrictEqual(f.controller.refresh(), []);
});
