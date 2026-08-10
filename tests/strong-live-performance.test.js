'use strict';

const assert = require('assert');
const CpuSchedulerState = require('../js/cpuSchedulerState');
const { runTest } = require('./helpers/test-utils');
const { loadCPURuntime } = require('./helpers/runtime-loaders');

const runtime = loadCPURuntime();
const {
    CARDS,
    CPU,
    GameManager,
    LANDMARK_NAMES,
    createCardByName,
    getInitialCardStock,
    resolveLiveCpuOptions,
} = runtime;
const CARD_NAMES = Object.freeze([
    '麦畑', '牧場', '森林', '鉱山', 'リンゴ園',
    'パン屋', 'コンビニ', 'チーズ工場', '家具工場', '青果市場',
]);

function createLateGame(playerCount) {
    const game = new GameManager(playerCount);
    for (let playerIndex = 0; playerIndex < game.players.length; playerIndex++) {
        const player = game.players[playerIndex];
        const cardCount = playerCount === 2 ? 6 : playerCount === 4 ? 8 : 10;
        player.cards = CARD_NAMES.slice(0, cardCount).map(createCardByName);
        player.coins = 12 + playerIndex;
        player.landmarks[LANDMARK_NAMES.STATION] = true;
        player.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
        player.landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;
    }
    return game;
}

function cloneEvaluationCounts(playerCount) {
    const cpu = new CPU('strong', resolveLiveCpuOptions('strong'));
    const game = createLateGame(playerCount);
    cpu._strongCrowdDisruptionReady = () => true;
    let calls = 0;
    cpu._scoreStrongPendingChoice = () => {
        calls++;
        return 0;
    };
    const measure = choose => {
        calls = 0;
        const proposal = choose();
        assert.notStrictEqual(proposal, null);
        assert.notStrictEqual(proposal, undefined);
        return calls;
    };
    return Object.freeze({
        tv: measure(() => cpu.chooseTVTarget(game)),
        business: measure(() => cpu.chooseBusinessMove(game)),
        cleaning: measure(() => cpu.chooseCleaningTarget(game)),
        mover: measure(() => cpu.chooseMoverMove(game)),
    });
}

function strongDecisionTrace(playerCount) {
    const profileStats = {};
    const cpu = new CPU('strong', {
        ...resolveLiveCpuOptions('strong'),
        profileStats,
    });
    const game = createLateGame(playerCount);
    const shopStock = Object.fromEntries(CARDS.map(card => [
        card.name,
        getInitialCardStock(card, playerCount),
    ]));
    game.lastDiceResult = 7;
    const decisions = {};
    const timings = {};
    const measure = (step, decide) => {
        const startedAt = process.hrtime.bigint();
        decisions[step] = decide();
        timings[step] = Number(process.hrtime.bigint() - startedAt) / 1e6;
        assert.ok(
            timings[step] <= CpuSchedulerState.stepBudget(step).hardMs,
            `${playerCount}人 ${step}: ${timings[step].toFixed(1)}ms`
        );
    };
    measure('selectDice', () => cpu.chooseDiceCount(game));
    measure('rerollConfirm', () => cpu.chooseReroll(game));
    measure('harborChoice', () => cpu.chooseHarbor(game));
    measure('pending', () => ({
        tv: cpu.chooseTVTarget(game),
        business: cpu.chooseBusinessMove(game),
        cleaning: cpu.chooseCleaningTarget(game),
        mover: cpu.chooseMoverMove(game),
        renovation: cpu.chooseRenovationTarget(game),
        it: cpu.chooseITInvest(game),
    }));
    measure('build', () => cpu.chooseBuildAction(game, shopStock));
    return Object.freeze({ decisions, timings, profileStats });
}

runTest('強CPUの2/4/10人終盤fixtureは複製評価数を決定的な予算内に保つ', () => {
    assert.deepStrictEqual(cloneEvaluationCounts(2), {
        tv: 0, business: 0, cleaning: 0, mover: 0,
    });
    assert.deepStrictEqual(cloneEvaluationCounts(4), {
        tv: 3, business: 18, cleaning: 8, mover: 24,
    });
    assert.deepStrictEqual(cloneEvaluationCounts(10), {
        tv: 0, business: 0, cleaning: 0, mover: 0,
    });
});

runTest('強CPUのダイス判断は2/4/10人終盤fixtureで盤面cacheを再利用する', () => {
    for (const playerCount of [2, 4, 10]) {
        const cpu = new CPU('strong', resolveLiveCpuOptions('strong'));
        const game = createLateGame(playerCount);
        let rollScoreCalls = 0;
        const original = cpu._estimateRollScore.bind(cpu);
        cpu._estimateRollScore = (runtimeGame, dice) => {
            rollScoreCalls++;
            return original(runtimeGame, dice);
        };
        const first = cpu.chooseDiceCount(game);
        const firstCalls = rollScoreCalls;
        const second = cpu.chooseDiceCount(game);
        assert.strictEqual(second, first, `${playerCount}人の再評価結果`);
        assert.strictEqual(rollScoreCalls, firstCalls, `${playerCount}人のcache再利用`);
        assert.ok(firstCalls <= 12, `${playerCount}人の出目評価数: ${firstCalls}`);
    }
});

runTest('強CPUの全判断経路は2/4/10人終盤fixtureで固定traceとstep予算を維持する', () => {
    for (const playerCount of [2, 4, 10]) {
        const first = strongDecisionTrace(playerCount);
        const second = strongDecisionTrace(playerCount);
        assert.deepStrictEqual(second.decisions, first.decisions, `${playerCount}人 decision trace`);
        assert.deepStrictEqual(
            Object.fromEntries(Object.entries(second.profileStats).map(([key, value]) => [
                key,
                { calls: value.calls || 0, count: value.count || 0 },
            ])),
            Object.fromEntries(Object.entries(first.profileStats).map(([key, value]) => [
                key,
                { calls: value.calls || 0, count: value.count || 0 },
            ])),
            `${playerCount}人 operation trace`
        );
    }
});
