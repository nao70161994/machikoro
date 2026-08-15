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

runTest('CPU build proposal はcanonical actionだけを副作用なく返す', () => {
    const card = { name: '麦畑' };
    const cardAction = CPUBuildExecution.createCardBuildAction(card);
    const landmarkAction = CPUBuildExecution.createLandmarkBuildAction('駅');

    assert.deepStrictEqual(cardAction, {
        action: 'buildCard',
        data: { cardName: '麦畑' },
    });
    assert.deepStrictEqual(landmarkAction, {
        action: 'buildLandmark',
        data: { name: '駅' },
    });
    assert.ok(Object.isFrozen(cardAction));
    assert.ok(Object.isFrozen(cardAction.data));
    assert.ok(Object.isFrozen(landmarkAction));
    assert.ok(Object.isFrozen(landmarkAction.data));
    assert.deepStrictEqual(card, { name: '麦畑' });
    assert.strictEqual(CPUBuildExecution.createCardBuildAction(null), null);
    assert.strictEqual(CPUBuildExecution.createCardBuildAction({ name: '' }), null);
    assert.strictEqual(CPUBuildExecution.createLandmarkBuildAction(''), null);
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

runTest('CPU build execution は市場補充adapterへstock・card・game順で委譲する', () => {
    const actor = cpu();
    const card = { name: '麦畑' };
    const stock = { 麦畑: 1 };
    const game = {
        builtThisTurn: false,
        buildCard() { return true; },
    };
    const calls = [];
    assert.strictEqual(CPUBuildExecution.buyCard(actor, card, game, stock, {
        decrementShopStock(...args) {
            calls.push(args);
            stock.麦畑 = 0;
        },
    }), true);
    assert.deepStrictEqual(calls, [[stock, card, game]]);
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

runTest('CPU build execution はproposalをcard resolver経由で一度だけ適用する', () => {
    const actor = cpu();
    const card = { name: '麦畑' };
    const stock = { 麦畑: 2 };
    let resolves = 0;
    let builds = 0;
    const result = CPUBuildExecution.executeAction(actor, {
        action: 'buildCard',
        data: { cardName: '麦畑' },
    }, {
        builtThisTurn: false,
        buildCard(value) {
            builds++;
            assert.strictEqual(value, card);
            return true;
        },
    }, stock, {
        resolveCard(name) {
            resolves++;
            assert.strictEqual(name, '麦畑');
            return card;
        },
    });

    assert.strictEqual(result, true);
    assert.strictEqual(resolves, 1);
    assert.strictEqual(builds, 1);
    assert.strictEqual(stock.麦畑, 1);
    assert.strictEqual(CPUBuildExecution.executeAction(actor, {
        action: 'unknown',
        data: {},
    }, {}, stock), false);
});

runTest('CPU local build proposal は共有Game Engine adapterへcanonical actionを渡す', () => {
    const actor = cpu();
    const proposal = CPUBuildExecution.createLandmarkBuildAction('駅');
    const game = { builtThisTurn: false };
    const calls = [];

    const result = CPUBuildExecution.executeAction(actor, proposal, game, {}, {
        applyMutableAction(context) {
            calls.push(context);
            return true;
        },
    });

    assert.strictEqual(result, true);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].game, game);
    assert.strictEqual(calls[0].action, 'buildLandmark');
    assert.deepStrictEqual(calls[0].data, { name: '駅' });
});

runTest('CPU online build proposal は共有Game Engineを使わず既存sendActionへ渡す', () => {
    const actor = cpu();
    const proposal = CPUBuildExecution.createLandmarkBuildAction('港');
    let engineCalls = 0;
    const sent = [];

    const result = CPUBuildExecution.executeAction(actor, proposal, {
        builtThisTurn: false,
    }, {}, {
        isOnlineGame: true,
        isRoomHost: true,
        socketConnected: true,
        applyMutableAction() {
            engineCalls++;
            return true;
        },
        sendAction(action, data) {
            sent.push({ action, data });
            return true;
        },
    });

    assert.strictEqual(result, true);
    assert.strictEqual(engineCalls, 0);
    assert.deepStrictEqual(sent, [{ action: 'buildLandmark', data: { name: '港' } }]);
});


runTest('CPU local build proposalはUI authority hookを持たずmutable adapterを一度だけ呼ぶ', () => {
    const actor = cpu();
    const proposal = CPUBuildExecution.createCardBuildAction({ name: '\u9ea6\u7551' });
    const game = { builtThisTurn: false };
    const stock = { '\u9ea6\u7551': 1 };
    const calls = [];
    const marker = { action: 'buildCard' };

    const result = CPUBuildExecution.executeAction(actor, proposal, game, stock, {
        resolveCard: name => ({ name }),
        prepareLocalAction(action, data) {
            calls.push(['prepare', action, data]);
            return marker;
        },
        applyMutableAction(context) {
            calls.push(['apply', context.action, context.data]);
            return true;
        },
        finishLocalAction(value) {
            calls.push(['finish', value]);
        },
    });

    assert.strictEqual(result, true);
    assert.deepStrictEqual(calls, [
        ['apply', 'buildCard', { cardName: '\u9ea6\u7551' }],
    ]);
});

runTest('CPU local build proposal does not start shadow hooks after precheck failure', () => {
    let hooks = 0;
    const result = CPUBuildExecution.executeAction(cpu(), {
        action: 'buildCard',
        data: { cardName: '\u9ea6\u7551' },
    }, { builtThisTurn: false }, { '\u9ea6\u7551': 0 }, {
        resolveCard: name => ({ name }),
        prepareLocalAction() { hooks++; },
        finishLocalAction() { hooks++; },
    });

    assert.strictEqual(result, false);
    assert.strictEqual(hooks, 0);
});
