'use strict';
const assert = require('assert');
const LocalGameStart = require('../js/localGameStart');
const LocalGameStartRuntime = require('../js/localGameStartRuntime');
const LocalPlayerSettings = require('../js/localPlayerSettings');
const UiPlayerCount = require('../js/uiPlayerCount');
const { makeElement, runTest } = require('./helpers/test-utils');

function createHarness(options = {}) {
    const calls = [];
    const elements = {
        btnStart: makeElement(),
        cpuSpeed: makeElement({ value: '1500' }),
        gameScreen: makeElement(),
        localRlModelStatus: makeElement(),
        playerCount: makeElement(),
        playerSettings: makeElement(),
        titleScreen: makeElement(),
    };
    if (options.playerTypeSelect) {
        elements.playerSettings.querySelector = selector => {
            calls.push(['findPlayerTypeSelect', selector]);
            return options.playerTypeSelect;
        };
    }
    let state = {
        selectedCount: options.playerCount || 2,
        playerSettings: options.settings || [
            { type: 'human', difficulty: 'normal', name: 'A' },
            { type: 'cpu', difficulty: options.difficulty || 'normal', name: 'B' },
        ],
        cpuSpeed: 1500,
    };
    const setupRuntime = {
        snapshot: () => ({
            selectedCount: state.selectedCount,
            playerSettings: state.playerSettings.map(value => ({ ...value })),
            cpuSpeed: state.cpuSpeed,
        }),
        setSelectedCount(value) { state.selectedCount = value; return this.snapshot(); },
        setPlayerSettings(value) { state.playerSettings = value.map(item => ({ ...item })); return this.snapshot(); },
        setPlayerSetting(index, value) { state.playerSettings[index] = { ...value }; return this.snapshot(); },
        setPlayerName(index, value) { state.playerSettings[index].name = value; return this.snapshot(); },
        replace(value) { state = { ...value, playerSettings: value.playerSettings.map(item => ({ ...item })) }; return this.snapshot(); },
    };
    const portfolio = options.portfolio || {
        eligibleLoadState: () => options.loadState || ({ status: 'ready', ready: 1, total: 1, errors: [] }),
        preloadEligibleModels: (...args) => { calls.push(['preload', ...args]); return options.preload || null; },
    };
    const runtime = LocalGameStartRuntime.createRuntime({
        console: { warn: error => calls.push(['warn', error]), error: error => calls.push(['error', error]) },
        document: { getElementById: id => elements[id] || null },
        focusGame: () => calls.push(['focusGame']),
        getPortfolio: () => portfolio,
        initializeGame: count => calls.push(['initializeGame', count]),
        notifyLifecycleStart: () => calls.push(['notifyLifecycleStart']),
        playerCount: UiPlayerCount,
        playerSettings: LocalPlayerSettings,
        resetOnline: () => calls.push(['resetOnline']),
        resetStats: () => calls.push(['resetStats']),
        resetUiLocks: () => calls.push(['resetUiLocks']),
        saveSettings: () => calls.push(['saveSettings']),
        setupRuntime,
        showNotice: message => calls.push(['showNotice', message]),
        startPolicy: LocalGameStart,
    });
    return { calls, elements, getState: () => state, runtime };
}

runTest('local game start runtimeは人数・設定・RL表示のeffect境界を所有する', () => {
    const { calls, elements, getState, runtime } = createHarness();
    runtime.changeCount(20);
    assert.strictEqual(getState().selectedCount, 10);
    assert.strictEqual(elements.playerCount.textContent, '10人');
    assert.ok(elements.playerSettings.innerHTML.includes('プレイヤー10'));
    assert.strictEqual(calls.filter(call => call[0] === 'saveSettings').length, 1);

    runtime.changePlayerType(1, 'rl');
    assert.deepStrictEqual(getState().playerSettings[1], { type: 'cpu', difficulty: 'rl', name: 'B' });
    assert.ok(calls.some(call => call[0] === 'preload'));
    runtime.changePlayerName(0, 'Alice');
    assert.strictEqual(getState().playerSettings[0].name, 'Alice');
});

runTest('local game start runtimeは10人の中間playerをCPUへ変更後も同じselectへfocusを戻す', () => {
    let focusOptions = null;
    const select = makeElement({
        focus(options) { focusOptions = options; },
    });
    const settings = Array.from({ length: 10 }, (_, index) => ({
        type: 'human', difficulty: 'normal', name: `P${index + 1}`,
    }));
    const { calls, getState, runtime } = createHarness({
        playerCount: 10,
        settings,
        playerTypeSelect: select,
    });

    runtime.changePlayerType(5, 'strong');

    assert.deepStrictEqual(getState().playerSettings[5], {
        type: 'cpu', difficulty: 'strong', name: 'P6',
    });
    assert.deepStrictEqual(focusOptions, { preventScroll: true });
    assert.ok(calls.some(call => call[0] === 'findPlayerTypeSelect' &&
        call[1].includes('data-player-index="5"')));
    assert.strictEqual(calls.filter(call => call[0] === 'saveSettings').length, 1);
});

runTest('local game start runtimeは非RL開始の既存effect順と画面遷移を維持する', () => {
    const { calls, elements, getState, runtime } = createHarness();
    runtime.start();
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'saveSettings', 'resetStats', 'resetOnline', 'resetUiLocks',
        'initializeGame', 'focusGame', 'notifyLifecycleStart',
    ]);
    assert.strictEqual(calls[4][1], 2);
    assert.strictEqual(getState().cpuSpeed, 1500);
    assert.strictEqual(elements.titleScreen.style.display, 'none');
    assert.strictEqual(elements.gameScreen.style.display, 'block');
});

runTest('local game start runtimeはRL preload中の二重開始を防ぎ完了後に固定snapshotで開始する', async () => {
    let resolvePreload;
    const preload = new Promise(resolve => { resolvePreload = resolve; });
    const settings = [
        { type: 'human', difficulty: 'normal', name: 'A' },
        { type: 'cpu', difficulty: 'rl', name: 'B' },
    ];
    const { calls, elements, getState, runtime } = createHarness({ difficulty: 'rl', settings, preload });
    runtime.start();
    runtime.start();
    assert.strictEqual(calls.filter(call => call[0] === 'preload').length, 1);
    assert.strictEqual(elements.btnStart.disabled, true);
    getState().playerSettings[1].name = 'changed-after-request';
    resolvePreload();
    await preload;
    await Promise.resolve();
    assert.strictEqual(calls.filter(call => call[0] === 'initializeGame').length, 1);
    assert.strictEqual(getState().playerSettings[1].name, 'B');
    assert.strictEqual(elements.btnStart.disabled, false);
});

runTest('local game start runtimeは必須依存をeffect前に検証する', () => {
    assert.throws(() => LocalGameStartRuntime.createRuntime(), /dependencies are required/);
    const { runtime } = createHarness();
    assert.ok(Object.isFrozen(runtime));
});
