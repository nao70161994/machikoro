'use strict';

const assert = require('assert');
const UiGameStatusEffects = require('../js/uiGameStatusEffects');
const { runTest } = require('./helpers/test-utils');

function makeView(announce = true) {
    return {
        statusText: 'status',
        turnTransition: {
            announce,
            name: 'Alice',
            isCpuTurn: true,
            nextPreviousPlayerIndex: 2,
        },
        rollButton: { disabled: false },
        skipButton: { disabled: true, textContent: 'skip' },
        diceValues: [2, 5],
        coinChanges: [
            { playerIndex: 0, diff: 3 },
            { playerIndex: 2, diff: -1 },
        ],
        nextCoins: [6, 4, 2],
    };
}

function makeEffects(calls) {
    const effects = Object.fromEntries(UiGameStatusEffects.REQUIRED_EFFECTS.map(name => [name, (...args) => {
        calls.push([name, ...args]);
    }]));
    effects.runRenderStep = (name, callback) => {
        calls.push(['runRenderStep', name]);
        callback();
    };
    return effects;
}

runTest('active game effect境界は既存描画順と値を維持する', () => {
    const calls = [];
    const view = makeView();
    UiGameStatusEffects.execute(view, makeEffects(calls));
    assert.deepStrictEqual(calls, [
        ['setStatusText', 'status'],
        ['announceTurn', 'Alice', true],
        ['setPreviousPlayerIndex', 2],
        ['setRollDisabled', false],
        ['setSkipButton', view.skipButton],
        ['hideReroll'],
        ['updateDiceDisplay', view.diceValues],
        ['runRenderStep', 'renderDiceChoose'],
        ['renderDiceChoose'],
        ['runRenderStep', 'renderPending'],
        ['renderPending'],
        ['runRenderStep', 'renderTutorial'],
        ['renderTutorial'],
        ['runRenderStep', 'renderLog'],
        ['renderLog'],
        ['runRenderStep', 'renderPlayers'],
        ['renderPlayers'],
        ['runRenderStep', 'coinAnimation'],
        ['showCoinAnimation', 0, 3],
        ['showCoinAnimation', 2, -1],
        ['setPreviousCoins', [6, 4, 2]],
        ['runRenderStep', 'renderBuildMenu'],
        ['renderBuildMenu'],
        ['runRenderStep', 'syncUiInteractabilityAfterRender'],
        ['syncUiInteractabilityAfterRender'],
        ['schedulePostBuildUiStabilizer'],
        ['runRenderStep', 'checkAutoSkip'],
        ['checkAutoSkip'],
    ]);
    const previousCoinsCall = calls.find(call => call[0] === 'setPreviousCoins');
    assert.notStrictEqual(previousCoinsCall[1], view.nextCoins);
});

runTest('active game effect境界はturn継続中にannouncerだけを省略する', () => {
    const calls = [];
    UiGameStatusEffects.execute(makeView(false), makeEffects(calls));
    assert.strictEqual(calls.some(call => call[0] === 'announceTurn'), false);
    assert.deepStrictEqual(calls.slice(0, 3), [
        ['setStatusText', 'status'],
        ['setPreviousPlayerIndex', 2],
        ['setRollDisabled', false],
    ]);
});

runTest('active game effect境界は不完全な配線を副作用前に拒否する', () => {
    const calls = [];
    const effects = makeEffects(calls);
    delete effects.schedulePostBuildUiStabilizer;
    assert.throws(
        () => UiGameStatusEffects.execute(makeView(), effects),
        /schedulePostBuildUiStabilizer effect is required/,
    );
    assert.deepStrictEqual(calls, []);
    assert.ok(Object.isFrozen(UiGameStatusEffects));
    assert.ok(Object.isFrozen(UiGameStatusEffects.REQUIRED_EFFECTS));
});
