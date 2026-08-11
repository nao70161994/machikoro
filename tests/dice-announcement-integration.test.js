'use strict';

const assert = require('assert');
const { loadIntegrationRuntime } = require('./helpers/integration-runtime');
const { runTest } = require('./helpers/test-utils');

runTest('遊園地の保持出目は再通知せず同じ新規rollとrerollは通知する', () => {
    const rt = loadIntegrationRuntime();
    rt.enabledCards = new Set(rt.CARDS.map(card => card.name));
    rt.enabledLandmarks = new Set(rt.Player.landmarkNames());
    rt.__test.setPlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);

    const announcements = [];
    let announcementText = '';
    Object.defineProperty(rt.__test.elements.diceResultAnnouncer, 'textContent', {
        configurable: true,
        get() { return announcementText; },
        set(value) {
            announcementText = value;
            if (value) announcements.push(value);
        },
    });

    rt.startGame();
    const game = rt.__test.getGame();
    const current = game.currentPlayer();
    current.landmarks['駅'] = true;
    current.landmarks['遊園地'] = true;
    current.landmarks['電波塔'] = true;

    game.rollDice();
    game.selectDiceCount(true, 4, 4);
    assert.strictEqual(game.diceResolutionSequence, 1);
    game.rerollDice();
    game.selectDiceCount(true, 4, 4);
    assert.strictEqual(game.diceResolutionSequence, 2);
    rt.render();
    assert.deepStrictEqual(announcements, [
        '振り直し後、サイコロの出目は4と4、合計8です',
    ]);

    assert.strictEqual(game.nextTurn(), true);
    assert.strictEqual(game.diceResolutionSequence, 2);
    assert.strictEqual(game.lastDice1, 4);
    assert.strictEqual(game.lastDice2, 4);
    assert.strictEqual(game.usedReroll, false);
    rt.render();
    assert.strictEqual(announcements.length, 1);

    game.rollDice();
    game.selectDiceCount(true, 4, 4);
    assert.strictEqual(game.diceResolutionSequence, 3);
    rt.render();
    assert.strictEqual(announcements.length, 2);
    assert.strictEqual(announcements[1], 'サイコロの出目は4と4、合計8です');

    game.rerollDice();
    game.selectDiceCount(true, 4, 4);
    assert.strictEqual(game.diceResolutionSequence, 4);
    rt.render();
    assert.strictEqual(announcements.length, 3);
    assert.strictEqual(
        announcements[2],
        '振り直し後、サイコロの出目は4と4、合計8です'
    );
});

if (process.exitCode) {
    throw new Error('dice announcement integrationテストで失敗が発生しました');
}
