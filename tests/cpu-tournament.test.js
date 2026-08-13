'use strict';

const assert = require('assert');
const CpuTournament = require('../js/cpuTournament');
const { loadRuntime } = require('../scripts/selfplay');
const { runTest } = require('./helpers/test-utils');

runTest('CPU大会は設定値を許可リストへ正規化し席順を公平に回す', () => {
    assert.deepStrictEqual(CpuTournament.normalizeOptions({ games: '50', playerCount: '3', seed: 7 }), {
        games: 50, playerCount: 3, seed: 7, maxSteps: 5000,
    });
    assert.deepStrictEqual(CpuTournament.normalizeOptions({ games: 999, playerCount: 10, seed: -1 }), {
        games: 20, playerCount: 4, seed: 1, maxSteps: 5000,
    });
    assert.deepStrictEqual(CpuTournament.lineupForGame(3, 0), ['weak', 'normal', 'strong']);
    assert.deepStrictEqual(CpuTournament.lineupForGame(3, 1), ['normal', 'strong', 'expert']);
    assert.deepStrictEqual(CpuTournament.lineupForGame(3, 3), ['expert', 'weak', 'normal']);
});

runTest('CPU大会集計は勝率・平均ターン・初期分を除いた最多所持カードを計算する', () => {
    const summary = CpuTournament.createSummary({ games: 10, playerCount: 2 });
    CpuTournament.recordResult(summary, {
        difficulties: ['weak', 'normal'], winner: 1, turns: 8, exhausted: false,
        finalState: [
            { cards: ['麦畑', 'パン屋', '麦畑', 'カフェ'] },
            { cards: ['麦畑', 'パン屋', '森林', '森林'] },
        ],
    });
    CpuTournament.recordResult(summary, {
        difficulties: ['normal', 'strong'], winner: 0, turns: 12, exhausted: false,
        finalState: [
            { cards: ['麦畑', 'パン屋', '森林'] },
            { cards: ['麦畑', 'パン屋', '牧場'] },
        ],
    });
    const view = CpuTournament.projectSummary(summary);
    const normal = view.rankings.find(entry => entry.difficulty === 'normal');
    assert.strictEqual(view.completedGames, 2);
    assert.strictEqual(view.averageTurns, 10);
    assert.strictEqual(normal.appearances, 2);
    assert.strictEqual(normal.wins, 2);
    assert.strictEqual(normal.winRate, 100);
    assert.strictEqual(normal.averageTurns, 10);
    assert.deepStrictEqual(normal.favoriteCard, { name: '森林', count: 3 });
});

runTest('CPU大会controllerは1試合ずつscheduleし完了と取消を通知する', () => {
    const scheduled = [];
    const updates = [];
    const controller = CpuTournament.createController({
        schedule(callback) { scheduled.push(callback); return scheduled.length; },
        cancelSchedule() {},
        runGame(options) {
            return {
                difficulties: options.difficulties,
                winner: 0,
                turns: 9,
                exhausted: false,
                finalState: options.difficulties.map(() => ({ cards: ['麦畑', 'パン屋', 'カフェ'] })),
            };
        },
        onUpdate(update) { updates.push(update); },
    });
    assert.strictEqual(controller.start({ games: 10, playerCount: 2 }), true);
    assert.strictEqual(controller.start({ games: 10, playerCount: 2 }), false);
    assert.strictEqual(updates[0].status, 'running');
    scheduled.shift()();
    assert.strictEqual(updates.at(-1).summary.completedGames, 1);
    assert.strictEqual(controller.cancel(), true);
    assert.strictEqual(updates.at(-1).status, 'cancelled');
    assert.strictEqual(updates.at(-1).summary.completedGames, 1);
});

runTest('CPU大会は既存GameManagerとCPUで決着まで実走する', () => {
    const runtime = loadRuntime();
    const names = [
        'GameManager', 'Player', 'CARDS', 'CPUSimulation', 'getInitialCardStock',
        'CPU', 'GAME_PHASES', 'CPUPendingResolution',
    ];
    const previous = Object.fromEntries(names.map(name => [name, global[name]]));
    try {
        for (const name of names) global[name] = runtime[name];
        const result = CpuTournament.runGame({
            difficulties: ['weak', 'normal'], seed: 42, maxSteps: 5000,
        });
        assert.strictEqual(result.exhausted, false);
        assert.ok(result.winner === 0 || result.winner === 1);
        assert.ok(result.turns > 0);
        assert.strictEqual(result.finalState.length, 2);
    } finally {
        for (const name of names) {
            if (previous[name] === undefined) delete global[name];
            else global[name] = previous[name];
        }
    }
});
