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

runTest('CPU大会履歴は最大10件を安全に保存しJSONとCSVへ出力する', () => {
    const values = new Map();
    const storage = {
        get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
        set(key, value) { values.set(key, value); return true; },
    };
    const repository = CpuTournament.createHistoryRepository({ storage });
    for (let index = 0; index < 12; index++) {
        const summary = CpuTournament.createSummary({ games: 10, playerCount: 2, seed: index + 1 });
        CpuTournament.recordResult(summary, {
            seed: index + 1, difficulties: ['weak', 'normal'], winner: 1, turns: 8,
            exhausted: false, finalState: [{ cards: [] }, { cards: ['森林'] }],
        });
        repository.add(CpuTournament.projectSummary(summary), 1000 + index);
    }
    const records = repository.load();
    assert.strictEqual(records.length, 10);
    assert.strictEqual(records[0].createdAt, 1011);
    assert.ok(CpuTournament.exportJson(records).includes('"schemaVersion": 1'));
    const csv = CpuTournament.exportCsv(records);
    assert.ok(csv.startsWith('大会日時,人数,試合数,CPU'));
    assert.ok(csv.includes('CPU（普通）'));
    repository.clear();
    assert.deepStrictEqual(repository.load(), []);
});

runTest('CPU大会分析は首位・決着幅・席順勝率を分離する', () => {
    const view = {
        playerCount: 2,
        rankings: [{ label: 'CPU（強）', winRate: 75 }],
        games: [
            { index: 0, turns: 8, winner: 1, exhausted: false, difficulties: ['weak', 'strong'] },
            { index: 1, turns: 14, winner: 0, exhausted: false, difficulties: ['strong', 'weak'] },
        ],
    };
    const analysis = CpuTournament.analyzeTournament(view);
    assert.deepStrictEqual(analysis.leader, { label: 'CPU（強）', winRate: 75 });
    assert.deepStrictEqual(analysis.fastest, { index: 0, turns: 8 });
    assert.deepStrictEqual(analysis.longest, { index: 1, turns: 14 });
    assert.deepStrictEqual(analysis.seats.map(entry => entry.winRate), [50, 50]);
});

runTest('CPU大会リプレイは同じseedから同じ決着とtraceを再生成する', () => {
    const runtime = loadRuntime();
    const names = [
        'GameManager', 'Player', 'CARDS', 'CPUSimulation', 'getInitialCardStock',
        'CPU', 'GAME_PHASES', 'CPUPendingResolution',
    ];
    const previous = Object.fromEntries(names.map(name => [name, global[name]]));
    try {
        for (const name of names) global[name] = runtime[name];
        const options = { difficulties: ['weak', 'normal'], seed: 73, maxSteps: 5000 };
        const first = CpuTournament.runGame(options);
        const replay = CpuTournament.runGame({ ...options, captureTrace: true });
        assert.strictEqual(replay.winner, first.winner);
        assert.strictEqual(replay.turns, first.turns);
        assert.ok(replay.trace.length > replay.turns);
        assert.deepStrictEqual(replay.finalState, first.finalState);
    } finally {
        for (const name of names) {
            if (previous[name] === undefined) delete global[name];
            else global[name] = previous[name];
        }
    }
});
