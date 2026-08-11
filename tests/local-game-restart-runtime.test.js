'use strict';
const assert = require('assert');
const LocalGameRestartRuntime = require('../js/localGameRestartRuntime');
const UiPlayerCount = require('../js/uiPlayerCount');
const { makeElement, runTest } = require('./helpers/test-utils');

function createHarness(options = {}) {
    const calls = [];
    const elements = {
        gameScreen: makeElement(),
        titleScreen: makeElement(),
        playerCount: makeElement(),
    };
    let confirmCallback = null;
    const runtime = LocalGameRestartRuntime.createRuntime({
        cancelAutoSkip: () => calls.push(['cancelAutoSkip']),
        cancelCpuSchedule: reason => calls.push(['cancelCpu', reason]),
        cancelDelayedHumanAction: () => calls.push(['cancelDelayed']),
        checkpoint: event => calls.push(['checkpoint', event]),
        document: { getElementById: id => elements[id] },
        drawSkyline: () => calls.push(['drawSkyline']),
        focusTitle: () => calls.push(['focusTitle']),
        gameRuntime: {
            setGame: value => calls.push(['game', value]),
            setPreviousCoins: value => calls.push(['coins', value]),
            setUndoState: value => calls.push(['undo', value]),
            setCpuPlayers: value => calls.push(['cpuPlayers', value]),
        },
        getClearOnlineSessionStorage: () => options.clearOnline || null,
        playerCount: UiPlayerCount,
        refreshPwaUpdateState: () => calls.push(['refreshPwa']),
        removeStorage: key => calls.push(['remove', key]),
        renderPlayerSettings: () => calls.push(['renderSettings']),
        resetFullLog: () => calls.push(['resetLog']),
        resetLifecycle: reason => calls.push(['resetLifecycle', reason]),
        resetOnline: () => calls.push(['resetOnline']),
        resetUiLocks: reason => calls.push(['resetUi', reason]),
        setWinSoundPlayed: value => calls.push(['winSound', value]),
        setupRuntime: { replace: value => calls.push(['setup', value]) },
        showConfirm: (message, callback) => { calls.push(['confirm', message]); confirmCallback = callback; },
        stopConfetti: () => calls.push(['stopConfetti']),
        updateResumeButton: () => calls.push(['updateResume']),
    });
    return { calls, elements, runtime, confirm: () => confirmCallback() };
}

runTest('local game restart runtimeは確認後の全effect順と既存理由を維持する', () => {
    const { calls, elements, runtime, confirm } = createHarness();
    runtime.restart();
    assert.deepStrictEqual(calls, [['confirm', LocalGameRestartRuntime.CONFIRM_MESSAGE]]);
    confirm();
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'confirm', 'checkpoint', 'remove', 'remove', 'remove', 'remove', 'remove', 'remove',
        'cancelCpu', 'cancelDelayed', 'cancelAutoSkip', 'stopConfetti', 'resetOnline',
        'resetUi', 'resetLifecycle', 'game', 'coins', 'winSound', 'undo', 'resetLog',
        'setup', 'cpuPlayers', 'renderSettings', 'updateResume', 'drawSkyline',
        'refreshPwa', 'focusTitle', 'checkpoint',
    ]);
    assert.deepStrictEqual(calls.slice(2, 8).map(call => call[1]), [
        'savedGame', ...LocalGameRestartRuntime.ONLINE_STORAGE_KEYS,
    ]);
    assert.deepStrictEqual(calls[8], ['cancelCpu', 'restart-game-cancel-cpu']);
    assert.deepStrictEqual(calls[13], ['resetUi', 'restart-game-reset-ui-locks']);
    assert.deepStrictEqual(calls[14], ['resetLifecycle', 'restart-game-lifecycle-reset']);
    assert.strictEqual(elements.gameScreen.style.display, 'none');
    assert.strictEqual(elements.titleScreen.style.display, 'block');
    assert.strictEqual(elements.playerCount.textContent, '2人');
});

runTest('local game restart runtimeはonline storage facadeをfallbackより優先する', () => {
    const facadeCalls = [];
    const { calls, runtime } = createHarness({ clearOnline: () => facadeCalls.push('clear') });
    assert.strictEqual(runtime.clearOnlineStorage(), 'facade');
    assert.deepStrictEqual(facadeCalls, ['clear']);
    assert.strictEqual(calls.some(call => call[0] === 'remove'), false);
});

runTest('local game restart runtimeは必須依存欠落をeffect前に拒否する', () => {
    assert.throws(() => LocalGameRestartRuntime.createRuntime(), /dependency is required/);
});
