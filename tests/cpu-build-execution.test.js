const assert = require('assert');
const { CPUBuildExecution } = require('../js/cpuBuildExecution');
const { runTest } = require('./helpers/test-utils');

function cpu() {
    return { _lastBuildActionResult: null };
}

runTest('CPU build execution はonline block条件を既存順序で判定する', () => {
    assert.strictEqual(CPUBuildExecution.onlineBuildBlocked({}), false);
    assert.strictEqual(CPUBuildExecution.onlineBuildBlocked({ isOnlineGame: true, isRoomHost: false }), true);
    assert.strictEqual(CPUBuildExecution.onlineBuildBlocked({
        isOnlineGame: true, isRoomHost: true, isReconnectingOnline: true,
    }), true);
    assert.strictEqual(CPUBuildExecution.onlineBuildBlocked({
        isOnlineGame: true, isRoomHost: true, socketConnected: false,
    }), true);
    assert.strictEqual(CPUBuildExecution.onlineBuildBlocked({
        isOnlineGame: true, isRoomHost: true, socketConnected: true,
    }), false);
});

runTest('CPU build execution はlocal card成功時だけstockを減らす', () => {
    const actor = cpu();
    const card = { name: '麦畑' };
    const stock = { 麦畑: 2 };
    let buildCount = 0;
    const game = {
        builtThisTurn: false,
        buildCard(value) { buildCount++; assert.strictEqual(value, card); return true; },
    };
    assert.strictEqual(CPUBuildExecution.buyCard(actor, card, game, stock), true);
    assert.strictEqual(actor._lastBuildActionResult, true);
    assert.strictEqual(stock.麦畑, 1);
    assert.strictEqual(buildCount, 1);

    game.builtThisTurn = false;
    game.buildCard = () => false;
    assert.strictEqual(CPUBuildExecution.buyCard(actor, card, game, stock), false);
    assert.strictEqual(stock.麦畑, 1);
});

runTest('CPU build execution はonline cardを同じpayloadで一度だけ送信する', () => {
    const actor = cpu();
    const stock = { 麦畑: 2 };
    const calls = [];
    const game = { builtThisTurn: false, buildCard() { throw new Error('local build must not run'); } };
    const result = CPUBuildExecution.buyCard(actor, { name: '麦畑' }, game, stock, {
        isOnlineGame: true,
        isRoomHost: true,
        socketConnected: true,
        sendAction(action, payload) { calls.push({ action, payload }); return true; },
    });
    assert.strictEqual(result, true);
    assert.deepStrictEqual(calls, [{ action: 'buildCard', payload: { cardName: '麦畑' } }]);
    assert.strictEqual(stock.麦畑, 2);
});

runTest('CPU build execution はblocked・在庫切れ・built済みcardを送信しない', () => {
    const contexts = [
        { isOnlineGame: true, isRoomHost: false },
        { isOnlineGame: true, isRoomHost: true, isReconnectingOnline: true },
    ];
    for (const context of contexts) {
        let sends = 0;
        context.sendAction = () => { sends++; return true; };
        assert.strictEqual(CPUBuildExecution.buyCard(cpu(), { name: '麦畑' }, {
            builtThisTurn: false,
        }, { 麦畑: 1 }, context), false);
        assert.strictEqual(sends, 0);
    }
    assert.strictEqual(CPUBuildExecution.buyCard(cpu(), { name: '麦畑' }, {
        builtThisTurn: false,
    }, { 麦畑: 0 }), false);
    assert.strictEqual(CPUBuildExecution.buyCard(cpu(), { name: '麦畑' }, {
        builtThisTurn: true,
    }, { 麦畑: 1 }), false);
});

runTest('CPU build execution はlandmarkのlocal/online結果を同じresultへ集約する', () => {
    const localCpu = cpu();
    let localName = '';
    assert.strictEqual(CPUBuildExecution.buyLandmark(localCpu, '駅', {
        builtThisTurn: false,
        buildLandmark(name) { localName = name; return true; },
    }), true);
    assert.strictEqual(localName, '駅');
    assert.strictEqual(localCpu._lastBuildActionResult, true);

    const calls = [];
    assert.strictEqual(CPUBuildExecution.buyLandmark(cpu(), '港', {
        builtThisTurn: false,
    }, {
        isOnlineGame: true,
        isRoomHost: true,
        socketConnected: true,
        sendAction(action, payload) { calls.push({ action, payload }); return true; },
    }), true);
    assert.deepStrictEqual(calls, [{ action: 'buildLandmark', payload: { name: '港' } }]);
});
