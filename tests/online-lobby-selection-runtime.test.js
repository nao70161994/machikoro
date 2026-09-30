'use strict';

const assert = require('assert');
const OnlineLobbySelectionRuntime = require('../js/onlineLobbySelectionRuntime');
const { runTest } = require('./helpers/test-utils');

function fixture(overrides = {}) {
    const state = {
        session: {
            isOnlineGame: false,
            isRoomHost: true,
            myRoomId: 'ROOM1',
            socket: { connected: true },
        },
        selection: { enabledCards: ['麦畑'], enabledLandmarks: ['駅'], marketRule: 'standard' },
        trace: [],
        sent: [],
        restoredCards: null,
        restoredLandmarks: null,
        status: '',
        notices: [],
    };
    const runtime = OnlineLobbySelectionRuntime.createRuntime(Object.assign({
        getSession: () => state.session,
        getSelection: () => ({
            enabledCards: [...state.selection.enabledCards],
            enabledLandmarks: [...state.selection.enabledLandmarks],
            marketRule: state.selection.marketRule,
        }),
        setReady: ready => { state.trace.push(['ready', ready]); return true; },
        showNotice: message => state.notices.push(message),
        replaceCards: cards => { state.restoredCards = [...cards]; },
        replaceLandmarks: landmarks => { state.restoredLandmarks = [...landmarks]; },
        replaceMarketRule: rule => { state.marketRule = rule; },
        updateSummary: () => state.trace.push(['summary']),
        manageWaitingRoom: (payload, socket) => { state.sent.push({ payload, socket }); return true; },
        setStatus: message => { state.status = message; },
    }, overrides));
    return { state, runtime };
}

runTest('online lobby selection runtimeは開始時snapshotを保持し成功時に現行選択を一度送る', () => {
    const { state, runtime } = fixture();
    assert.strictEqual(runtime.begin(), true);
    assert.deepStrictEqual(state.trace, [['ready', false]]);
    state.selection = { enabledCards: ['パン屋'], enabledLandmarks: ['駅', '港'], marketRule: 'standard' };
    assert.strictEqual(runtime.sync({ setupSummary: { enabledCards: ['server'] } }), undefined);
    assert.strictEqual(runtime.save(), true);
    assert.deepStrictEqual(state.sent, [{
        payload: {
            roomId: 'ROOM1', action: 'selection',
            enabledCards: ['パン屋'], enabledLandmarks: ['駅', '港'],
        },
        socket: state.session.socket,
    }]);
    assert.ok(state.status.includes('全員がもう一度'));
});

runTest('online lobby selection runtimeは送信前切断時にcard/landmarkだけ元へ戻す', () => {
    const { state, runtime } = fixture();
    assert.strictEqual(runtime.begin(), true);
    state.selection = { enabledCards: ['コンビニ'], enabledLandmarks: [], marketRule: 'custom' };
    state.session.socket.connected = false;
    assert.strictEqual(runtime.save(), true);
    assert.deepStrictEqual(state.restoredCards, ['麦畑']);
    assert.deepStrictEqual(state.restoredLandmarks, ['駅']);
    assert.strictEqual(state.marketRule, undefined);
    assert.strictEqual(state.sent.length, 0);
    assert.strictEqual(state.notices.length, 1);
});

runTest('online lobby selection runtimeはauthoritative lobby setupを編集中でなければ同期する', () => {
    const { state, runtime } = fixture();
    runtime.sync({ setupSummary: {
        enabledCards: ['server-card'], enabledLandmarks: ['港'], marketRule: 'official',
    } });
    assert.deepStrictEqual(state.restoredCards, ['server-card']);
    assert.deepStrictEqual(state.restoredLandmarks, ['港']);
    assert.strictEqual(state.marketRule, 'official');
    assert.deepStrictEqual(state.trace, [['summary']]);
    state.session.isOnlineGame = true;
    state.restoredCards = null;
    runtime.sync({ setupSummary: { enabledCards: ['ignore'] } });
    assert.strictEqual(state.restoredCards, null);
});

runTest('online lobby selection runtimeは非host編集を拒否し必須依存を検証する', () => {
    const { state, runtime } = fixture();
    state.session.isRoomHost = false;
    assert.strictEqual(runtime.begin(), false);
    assert.strictEqual(state.notices.length, 1);
    assert.throws(() => OnlineLobbySelectionRuntime.createRuntime({}), TypeError);
});

runTest('online lobby selection runtimeのresetは保留編集だけを破棄する', () => {
    const { state, runtime } = fixture();
    runtime.begin();
    runtime.reset();
    state.selection = { enabledCards: ['local'], enabledLandmarks: [], marketRule: 'standard' };
    runtime.sync({ setupSummary: { enabledCards: ['server'] } });
    assert.deepStrictEqual(state.restoredCards, ['server']);
});
