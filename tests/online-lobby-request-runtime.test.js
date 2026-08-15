'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const OnlineLobbyRequestRuntime = require('../js/onlineLobbyRequestRuntime');
const OnlineLobbyRequestState = require('../js/onlineLobbyRequestState');
const OnlinePlayerSettings = require('../js/onlinePlayerSettings');
const { runTest } = require('./helpers/test-utils');

function createHarness(options = {}) {
    const calls = [];
    const timers = [];
    let setup = {
        selectedCount: options.playerCount || 2,
        cpuSpeed: 1500,
        playerSettings: options.playerSettings || [
            { type: 'human' },
            { type: 'human' },
        ],
    };
    const values = {
        createButton: '',
        cpuSpeed: '1200',
        joinButton: '',
        playerName: options.playerName === undefined ? ' Alice ' : options.playerName,
        rlStatus: '',
        roomId: options.roomId === undefined ? ' ab12cd ' : options.roomId,
    };
    const portfolio = options.portfolio || null;
    const runtime = OnlineLobbyRequestRuntime.createRuntime({
        applyButtonView: (id, view) => calls.push(['button', id, view]),
        clearTimer: timer => calls.push(['clearTimer', timer]),
        controller: OnlineLobbyRequestState.createController(),
        createRoom: payload => calls.push(['createRoom', payload]),
        freezeSettings: (settings, count) => settings.slice(0, count).map(value => ({ ...value })),
        getCapabilities: () => ({ actionVersions: [0, 1] }),
        getClientVersion: () => 'v-test',
        getModelPortfolio: () => portfolio,
        getSelection: () => ({
            enabledCards: new Set(['麦畑']),
            enabledLandmarks: new Set(['駅']),
            marketRule: options.marketRule || 'standard',
        }),
        hostlessRestoreVersion: 1,
        ids: {
            createButton: 'createButton', cpuSpeed: 'cpuSpeed', joinButton: 'joinButton',
            playerName: 'playerName', rlStatus: 'rlStatus', roomId: 'roomId',
        },
        initSocket: () => options.socketReady !== false,
        inputValue: id => values[id],
        joinRoom: payload => calls.push(['joinRoom', payload]),
        playerSettings: OnlinePlayerSettings,
        requestTimeoutMs: 15000,
        schedulePwaRefresh: () => calls.push(['schedulePwaRefresh']),
        setHost: value => calls.push(['setHost', value]),
        setPlayerName: value => calls.push(['setPlayerName', value]),
        setStatusText: value => calls.push(['status', value]),
        setText: (id, value) => calls.push(['text', id, value]),
        setTimer: (callback, delay) => {
            const timer = { callback, delay, id: timers.length + 1 };
            timers.push(timer);
            calls.push(['setTimer', delay]);
            return timer;
        },
        setupRuntime: {
            snapshot: () => ({
                ...setup,
                playerSettings: setup.playerSettings.map(value => ({ ...value })),
            }),
            setCpuSpeed: value => {
                setup = { ...setup, cpuSpeed: value };
                calls.push(['cpuSpeed', value]);
                return setup;
            },
        },
        showNotice: (...args) => calls.push(['notice', ...args]),
        warn: (...args) => calls.push(['warn', ...args]),
        withCapabilities: (payload, capabilities) => ({ ...payload, capabilities }),
    });
    return { calls, runtime, timers };
}

runTest('online lobby request runtimeは部屋作成payloadとeffect順を固定する', () => {
    const { calls, runtime } = createHarness();
    assert.strictEqual(runtime.showCreate(), true);
    const payload = calls.find(call => call[0] === 'createRoom')[1];
    assert.deepStrictEqual(payload, {
        playerName: 'Alice',
        playerCount: 2,
        playerSettings: [
            { type: 'human', difficulty: 'normal' },
            { type: 'human', difficulty: 'normal' },
        ],
        cpuSpeed: 1200,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        marketRule: 'standard',
        marketRuleVersion: 1,
        clientVersion: 'v-test',
        hostlessRestoreVersion: 1,
        capabilities: { actionVersions: [0, 1] },
    });
    const names = calls.map(call => call[0]);
    assert.ok(names.indexOf('setPlayerName') < names.indexOf('cpuSpeed'));
    assert.ok(names.indexOf('cpuSpeed') < names.indexOf('setHost'));
    assert.ok(names.indexOf('setHost') < names.indexOf('createRoom'));
    assert.strictEqual(runtime.showCreate(), false);
    assert.strictEqual(calls.filter(call => call[0] === 'createRoom').length, 1);
});

runTest('online lobby request runtimeは参加入力を正規化してhost解除後に送信する', () => {
    const { calls, runtime } = createHarness();
    assert.strictEqual(runtime.join(), true);
    assert.deepStrictEqual(calls.find(call => call[0] === 'joinRoom')[1], {
        roomId: 'AB12CD',
        playerName: 'Alice',
        clientVersion: 'v-test',
        hostlessRestoreVersion: 1,
        marketRuleVersion: 1,
        capabilities: { actionVersions: [0, 1] },
    });
    const names = calls.map(call => call[0]);
    assert.ok(names.indexOf('setPlayerName') < names.indexOf('setHost'));
    assert.ok(names.indexOf('setHost') < names.indexOf('joinRoom'));
});

runTest('online lobby request runtimeは公式オプション市場を能力情報つきで送る', () => {
    const { calls, runtime } = createHarness({ marketRule: 'ten-type' });
    assert.strictEqual(runtime.showCreate(), true);
    const payload = calls.find(call => call[0] === 'createRoom')[1];
    assert.strictEqual(payload.marketRule, 'ten-type');
    assert.strictEqual(payload.marketRuleVersion, 1);
});

runTest('online lobby request runtimeは入力不正とSocket未準備で送信しない', () => {
    const missingName = createHarness({ playerName: '  ' });
    assert.strictEqual(missingName.runtime.showCreate(), false);
    assert.deepStrictEqual(missingName.calls.at(-1), ['notice', OnlineLobbyRequestRuntime.TEXT.NAME_REQUIRED]);
    const badRoom = createHarness({ roomId: 'abc' });
    assert.strictEqual(badRoom.runtime.join(), false);
    assert.deepStrictEqual(badRoom.calls.at(-1), ['notice', OnlineLobbyRequestRuntime.TEXT.ROOM_ID_INVALID]);
    const noSocket = createHarness({ socketReady: false });
    assert.strictEqual(noSocket.runtime.join(), false);
    assert.strictEqual(noSocket.calls.some(call => call[0] === 'joinRoom'), false);
    assert.deepStrictEqual(noSocket.calls.filter(call => call[0] === 'setHost').at(-1), ['setHost', false]);
});

runTest('online lobby request runtimeはRL preload完了後に取得時settingsで一度だけ作成する', async () => {
    let resolvePreload;
    const preload = new Promise(resolve => { resolvePreload = resolve; });
    const portfolio = {
        eligibleLoadState: () => ({ status: 'idle', ready: 0, total: 1, errors: [] }),
        preloadEligibleModels: () => preload,
    };
    const { calls, runtime } = createHarness({
        playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'rl' }],
        portfolio,
    });
    assert.strictEqual(runtime.showCreate(), true);
    assert.strictEqual(calls.some(call => call[0] === 'createRoom'), false);
    assert.strictEqual(runtime.showCreate(), false);
    resolvePreload();
    await preload;
    await Promise.resolve();
    assert.strictEqual(calls.filter(call => call[0] === 'createRoom').length, 1);
    assert.deepStrictEqual(calls.find(call => call[0] === 'createRoom')[1].playerSettings, [
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl' },
    ]);
});

runTest('online lobby request runtimeは現世代timeoutだけを終了・通知する', () => {
    const { calls, runtime, timers } = createHarness();
    runtime.begin('join');
    assert.strictEqual(timers[0].delay, 15000);
    timers[0].callback();
    assert.ok(calls.some(call => call[0] === 'status' &&
        call[1] === OnlineLobbyRequestRuntime.TEXT.REQUEST_TIMEOUT_STATUS));
    assert.ok(calls.some(call => call[0] === 'notice' &&
        call[1] === OnlineLobbyRequestRuntime.TEXT.REQUEST_TIMEOUT_NOTICE &&
        call[2] && call[2].announce === false));
    assert.strictEqual(calls.filter(call => call[0] === 'schedulePwaRefresh').length, 1);
    assert.strictEqual(runtime.finish('join'), true);
});

runTest('online lobby request runtimeはRL preload失敗でPWA状態の再評価を予約する', async () => {
    let rejectPreload;
    const preload = new Promise((_, reject) => { rejectPreload = reject; });
    const portfolio = {
        eligibleLoadState: () => ({ status: 'idle', ready: 0, total: 1, errors: [] }),
        preloadEligibleModels: () => preload,
    };
    const { calls, runtime } = createHarness({
        playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'rl' }],
        portfolio,
    });

    assert.strictEqual(runtime.showCreate(), true);
    rejectPreload(new Error('model unavailable'));
    await preload.catch(() => {});
    await Promise.resolve();

    assert.strictEqual(calls.filter(call => call[0] === 'schedulePwaRefresh').length, 1);
    assert.ok(calls.some(call => call[0] === 'notice' &&
        call[1] === OnlineLobbyRequestRuntime.TEXT.MODEL_FAILED));
});

runTest('online.jsはロビー要求とRL preloadを専用runtimeへ委譲する', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/online.js'), 'utf8');
    assert.ok(source.includes('OnlineLobbyRequestRuntime.createRuntime'));
    assert.ok(source.includes('getOnlineLobbyRequestRuntime().showCreate'));
    assert.ok(source.includes('getOnlineLobbyRequestRuntime().join'));
    assert.strictEqual(source.includes('const createPayload = {'), false);
    assert.strictEqual(source.includes('const joinPayload = {'), false);
});

runTest('online lobby request runtimeは必須adapter欠落を初期化前に拒否する', () => {
    assert.throws(() => OnlineLobbyRequestRuntime.createRuntime(), /dependency is required/);
    const { runtime } = createHarness();
    assert.ok(Object.isFrozen(runtime));
    assert.ok(Object.isFrozen(OnlineLobbyRequestRuntime.TEXT));
});
