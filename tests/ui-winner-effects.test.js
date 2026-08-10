'use strict';

const assert = require('assert');
const UiWinnerEffects = require('../js/uiWinnerEffects');
const { runTest } = require('./helpers/test-utils');

function makeEffects(calls) {
    return Object.fromEntries(UiWinnerEffects.REQUIRED_EFFECTS.map(name => [name, value => {
        calls.push([name, value]);
    }]));
}

runTest('winner effectsは初回のruntime/DOM副作用を既存順で一度実行する', () => {
    const calls = [];
    UiWinnerEffects.execute({
        statusHtml: '<winner>',
        winnerStatusText: 'ゲーム終了。Aliceの勝利。',
        firstPresentation: true,
    }, makeEffects(calls));
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'setStatusHtml',
        'markPresented',
        'announceWinner',
        'playWinSound',
        'recordStats',
        'notifyFinish',
        'clearSavedGame',
        'clearOnlineSession',
        'markOnlineFinished',
        'refreshPwaUpdateState',
        'updateResumeButton',
        'startConfetti',
        'applyTerminalControls',
        'renderTutorial',
        'renderLog',
        'renderPlayers',
    ]);
    assert.strictEqual(calls[0][1], '<winner>');
    assert.strictEqual(calls[2][1], 'ゲーム終了。Aliceの勝利。');
    assert.strictEqual(calls[12][1], UiWinnerEffects.TERMINAL_CONTROLS);
    assert.ok(Object.isFrozen(UiWinnerEffects.TERMINAL_CONTROLS));
});

runTest('winner effectsは再描画時に一度限りの通知と統計だけを省略する', () => {
    const calls = [];
    UiWinnerEffects.execute({ statusHtml: '<winner>', firstPresentation: false }, makeEffects(calls));
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'setStatusHtml',
        'clearSavedGame',
        'clearOnlineSession',
        'markOnlineFinished',
        'refreshPwaUpdateState',
        'updateResumeButton',
        'startConfetti',
        'applyTerminalControls',
        'renderTutorial',
        'renderLog',
        'renderPlayers',
    ]);
});

runTest('winner effectsは不完全なeffect配線をDOM変更前に拒否する', () => {
    const calls = [];
    const effects = makeEffects(calls);
    delete effects.renderPlayers;
    assert.throws(
        () => UiWinnerEffects.execute({ statusHtml: '<winner>' }, effects),
        /renderPlayers effect is required/
    );
    assert.deepStrictEqual(calls, []);
    assert.ok(Object.isFrozen(UiWinnerEffects));
    assert.ok(Object.isFrozen(UiWinnerEffects.REQUIRED_EFFECTS));
});
