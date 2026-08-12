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
            playerIndex: 2,
            nextPreviousPlayerIndex: 2,
            nextPreviousTurnCount: 7,
            nextPreviousPhase: 'roll',
        },
        rollButton: { disabled: false },
        skipButton: { disabled: true, textContent: 'skip' },
        diceValues: [2, 5],
        coinChanges: [
            { playerIndex: 0, diff: 3 },
            { playerIndex: 2, diff: -1 },
        ],
        coinChangeAnnouncement: 'Alice +3コイン',
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
        ['announceTurn', 'Alice', true, 2],
        ['setPreviousPlayerIndex', 2, 7, 'roll'],
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
        ['announceCoinChanges', 'Alice +3コイン'],
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

runTest('active game effect境界は空のcoin通知をlive regionへ送らない', () => {
    const calls = [];
    const view = makeView();
    view.coinChangeAnnouncement = '';
    UiGameStatusEffects.execute(view, makeEffects(calls));
    assert.strictEqual(calls.some(call => call[0] === 'announceCoinChanges'), false);
});

runTest('active game effect境界はturn継続中にannouncerだけを省略する', () => {
    const calls = [];
    UiGameStatusEffects.execute(makeView(false), makeEffects(calls));
    assert.strictEqual(calls.some(call => call[0] === 'announceTurn'), false);
    assert.deepStrictEqual(calls.slice(0, 3), [
        ['setStatusText', 'status'],
        ['setPreviousPlayerIndex', 2, 7, 'roll'],
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

runTest('active game turn state controllerは前回のturn identityを一箇所で所有する', () => {
    const controller = UiGameStatusEffects.createTurnStateController();
    assert.deepStrictEqual(controller.snapshot(), {
        previousPlayerIndex: -1, previousTurnCount: -1, previousPhase: '',
    });
    assert.deepStrictEqual(controller.set(3), {
        previousPlayerIndex: 3, previousTurnCount: -1, previousPhase: '',
    });
    assert.deepStrictEqual(controller.set(3, 8, 'build'), {
        previousPlayerIndex: 3, previousTurnCount: 8, previousPhase: 'build',
    });
    assert.deepStrictEqual(controller.reset(), {
        previousPlayerIndex: -1, previousTurnCount: -1, previousPhase: '',
    });
    assert.ok(Object.isFrozen(controller));
    assert.ok(Object.isFrozen(controller.snapshot()));

    const restored = UiGameStatusEffects.createTurnStateController(2, 7, 'pending');
    assert.deepStrictEqual(restored.snapshot(), {
        previousPlayerIndex: 2, previousTurnCount: 7, previousPhase: 'pending',
    });
});

runTest('稼働状況effectは表示・種類・読み上げを同じviewから反映する', () => {
    const makeElement = () => ({
        style: {},
        textContent: '',
        classes: new Set(),
        classList: {
            toggle(name, enabled) {
                if (enabled) this.owner.classes.add(name);
                else this.owner.classes.delete(name);
            },
            owner: null,
        },
    });
    const container = makeElement();
    container.classList.owner = container;
    const label = makeElement();
    const elapsed = makeElement();
    const detail = makeElement();
    assert.strictEqual(UiGameStatusEffects.applyActivityStatus({
        visible: true,
        kind: 'recovered',
        announceLabel: '自動復旧しました',
        elapsedText: '',
        detail: '操作を続けられます',
    }, { container, label, elapsed, detail }), true);
    assert.strictEqual(container.style.display, 'flex');
    assert.deepStrictEqual([...container.classes], ['is-recovered']);
    assert.strictEqual(label.textContent, '自動復旧しました');
    assert.strictEqual(detail.textContent, '操作を続けられます');

    UiGameStatusEffects.applyActivityStatus({
        visible: true,
        kind: 'waiting',
        announceLabel: '',
        elapsedText: '・3秒',
        detail: '待機中',
    }, { container, label, elapsed, detail });
    assert.deepStrictEqual([...container.classes], ['is-waiting']);
    assert.strictEqual(label.textContent, '自動復旧しました');
    assert.strictEqual(elapsed.textContent, '・3秒');
    assert.strictEqual(UiGameStatusEffects.applyActivityStatus({}, {}), false);
});
