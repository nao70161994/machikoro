const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    loadRuntime,
    simulateGame,
    runSeries,
    runDifficultyLadder,
    comparePresets,
    createBusinessStatsBucket,
    resolveBusinessMoveCards,
    recordBusinessStat,
    parseArgs,
    printSeries,
    printPresetComparison,
    printDifficultyLadder,
} = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));

runTest('simulateGame は CPU 同士の試合を最後まで進められる', () => {
    const result = simulateGame({
        difficulties: ['expert', 'strong', 'normal'],
        seed: 42,
        maxSteps: 3000,
        expertPreset: 'rush',
        lite: true,
    });

    assert.strictEqual(result.exhausted, false);
    assert.ok(result.winner >= 0);
    assert.ok(result.turns > 0);
    assert.strictEqual(result.expertPreset, 'rush');
    assert.strictEqual(result.finalState.length, 3);
    assert.ok(typeof result.finalState[0].coins === 'number');
    assert.ok(Array.isArray(result.finalState[0].builtLandmarks));
});

runTest('runSeries は難易度ごとの勝利数を集計する', () => {
    const result = runSeries({
        games: 3,
        seed: 10,
        maxSteps: 3000,
        players: ['expert', 'strong'],
        expertPreset: 'economy',
        lite: true,
    });

    assert.strictEqual(result.games, 3);
    assert.strictEqual(result.wins.expert + result.wins.strong, 3);
    assert.strictEqual(result.seatWins.length, 2);
    assert.strictEqual(result.matchLog.length, 3);
    assert.ok(typeof result.matchLog[0].seed === 'number');
    assert.strictEqual(result.matchLog[0].expertPreset, 'economy');
    assert.strictEqual(result.matchLog[0].finalState.length, 2);
    assert.ok(Array.isArray(result.matchLog[0].finalState[0].topCards));
    assert.strictEqual(result.buildStats.length, 2);
    assert.ok(typeof result.buildStats[0].total === 'number');
    assert.ok(result.businessStats);
});

runTest('runSeries は軽量収集モードで重いログを省略できる', () => {
    const result = runSeries({
        games: 2,
        seed: 4,
        maxSteps: 2000,
        players: ['expert', 'weak'],
        lite: true,
        collectMatchLog: false,
        collectBuildStats: false,
        collectBusinessStats: false,
        includeFinalState: false,
    });

    assert.strictEqual(result.games, 2);
    assert.strictEqual(result.wins.expert + result.wins.weak, 2);
    assert.strictEqual(result.seatWins.length, 2);
    assert.deepStrictEqual(result.matchLog, []);
    assert.deepStrictEqual(result.buildStats, []);
    assert.deepStrictEqual(result.businessStats, {});
    assert.ok(result.averageTurns > 0);
});

runTest('recordBusinessStat はdifficulty別に交換内容を集計する', () => {
    const options = {
        businessStats: {},
        cpuPlayers: [{ difficulty: 'rl' }, { difficulty: 'normal' }],
    };
    const game = { currentPlayerIndex: 0 };
    recordBusinessStat(
        game,
        { difficulty: 'rl' },
        options,
        { targetIndex: 1 },
        { name: '麦畑' },
        { name: 'パン屋' }
    );
    assert.strictEqual(options.businessStats.rl.total, 1);
    assert.strictEqual(options.businessStats.rl.targets.normal, 1);
    assert.strictEqual(options.businessStats.rl.giveCards['麦畑'], 1);
    assert.strictEqual(options.businessStats.rl.takeCards['パン屋'], 1);
    assert.strictEqual(options.businessStats.rl.exchanges['麦畑->パン屋'], 1);

    const empty = createBusinessStatsBucket();
    assert.strictEqual(empty.total, 0);
    assert.deepStrictEqual(empty.exchanges, {});
});

runTest('resolveBusinessMoveCards はRLのカード名参照を解決する', () => {
    const game = {
        currentPlayerIndex: 0,
        players: [
            { cards: [{ name: '麦畑' }, { name: 'パン屋' }] },
            { cards: [{ name: '牧場' }, { name: '森林' }] },
        ],
        currentPlayer() {
            return this.players[this.currentPlayerIndex];
        },
    };
    const result = resolveBusinessMoveCards(game, {
        myCard: 'パン屋',
        targetIndex: 1,
        theirCard: '森林',
    });
    assert.strictEqual(result.giveCard.name, 'パン屋');
    assert.strictEqual(result.takeCard.name, '森林');
});

runTest('runDifficultyLadder は難易度差確認向けの対戦セットを返す', () => {
    const result = runDifficultyLadder({
        games: 1,
        seed: 3,
        maxSteps: 3000,
        lite: true,
    });

    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result[0].players, ['normal', 'weak']);
    assert.deepStrictEqual(result[1].players, ['strong', 'normal']);
    assert.deepStrictEqual(result[2].players, ['expert', 'strong']);
    assert.strictEqual(result[0].result.games, 1);
});

runTest('parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '12', '--seed', '5', '--max-steps', '9000', '--format', 'json', '--details', '--ladder', '--fast', '--expert-preset', 'rush', '--compare-presets', 'default,rush', 'expert', 'strong']);

    assert.strictEqual(args.games, 12);
    assert.strictEqual(args.seed, 5);
    assert.strictEqual(args.maxSteps, 9000);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.details, true);
    assert.strictEqual(args.ladder, true);
    assert.strictEqual(args.fast, true);
    assert.strictEqual(args.expertPreset, 'rush');
    assert.deepStrictEqual(args.comparePresets, ['default', 'rush']);
    assert.deepStrictEqual(args.players, ['expert', 'strong']);
});

runTest('comparePresets は複数プリセットの集計を返す', () => {
    const comparisons = comparePresets({
        games: 1,
        seed: 1,
        maxSteps: 3000,
        players: ['expert', 'strong'],
        comparePresets: ['default', 'rush'],
        format: 'text',
        details: false,
        lite: true,
    });

    assert.strictEqual(comparisons.length, 2);
    assert.strictEqual(comparisons[0].preset, 'default');
    assert.strictEqual(comparisons[1].preset, 'rush');
    assert.strictEqual(comparisons[0].result.games, 1);
});

runTest('simulateGame は expert 指定なしでも default を既定プリセットとして使える', () => {
    const result = simulateGame({
        difficulties: ['expert', 'strong'],
        seed: 7,
        maxSteps: 3000,
        lite: true,
    });

    assert.strictEqual(result.expertPreset, 'default');
    assert.strictEqual(result.expertPurpose, 'training');
    const runtime = loadRuntime();
    const cpu = new runtime.CPU('expert');
    assert.strictEqual(cpu.expertPreset, 'default');
    assert.strictEqual(cpu.expertPurpose, 'training');
    assert.strictEqual(cpu.expertBehaviorFlags.crowdBuildLookahead, true);
    assert.strictEqual(cpu.expertBehaviorFlags.futureLandmarkHold, true);
    assert.strictEqual(cpu.expertBehaviorFlags.lookaheadLeaderStrongOnly, true);
});

runTest('simulateGame は人数別 expert tuning を受け渡せる', () => {
    const result = simulateGame({
        difficulties: ['expert', 'strong', 'strong', 'normal'],
        seed: 11,
        maxSteps: 3000,
        lite: true,
        expertProfileTunings: {
            crowd: { lookaheadWeight: 0.42 },
        },
    });

    assert.strictEqual(result.expertProfileTunings.crowd.lookaheadWeight, 0.42);
});

runTest('simulateGame は expert behavior flags を受け渡せる', () => {
    const result = simulateGame({
        difficulties: ['expert', 'normal', 'normal', 'normal'],
        seed: 12,
        maxSteps: 3000,
        lite: true,
        expertBehaviorFlags: {
            premiumPurpleGate: true,
            endgameBuildFocus: true,
            diceCloserDiscipline: true,
        },
    });

    assert.strictEqual(result.expertBehaviorFlags.premiumPurpleGate, true);
    assert.strictEqual(result.expertBehaviorFlags.endgameBuildFocus, true);
    assert.strictEqual(result.expertBehaviorFlags.diceCloserDiscipline, true);
});

runTest('simulateGame は fast モード指定を結果に保持する', () => {
    const result = simulateGame({
        difficulties: ['expert', 'strong', 'strong', 'normal'],
        seed: 11,
        maxSteps: 6000,
        fast: true,
    });

    assert.strictEqual(result.fast, true);
});

runTest('simulateGame は lite モード指定を結果に保持する', () => {
    const result = simulateGame({
        difficulties: ['expert', 'strong', 'strong', 'normal'],
        seed: 11,
        maxSteps: 6000,
        lite: true,
    });

    assert.strictEqual(result.lite, true);
});

runTest('simulateGame は maxSteps 到達時に exhausted を返す', () => {
    const result = simulateGame({
        difficulties: ['expert', 'strong'],
        seed: 3,
        maxSteps: 1,
    });

    assert.strictEqual(result.exhausted, true);
    assert.strictEqual(result.winner, -1);
});

runTest('parseArgs はプレイヤー未指定時に既定 lineup を使う', () => {
    const args = parseArgs([]);
    assert.deepStrictEqual(args.players, ['expert', 'strong', 'strong', 'normal']);
    assert.strictEqual(args.comparePresets, null);
});

runTest('parseArgs は lite フラグを解釈する', () => {
    const args = parseArgs(['--lite']);
    assert.strictEqual(args.lite, true);
});

runTest('parseArgs は expert behavior flags を解釈する', () => {
    const args = parseArgs(['--expert-flags', '{"crowdBuildLookahead":true}']);
    assert.strictEqual(args.expertBehaviorFlags.crowdBuildLookahead, true);
});

runTest('printSeries は text/details 形式で明細を出力する', () => {
    const lines = [];
    const realLog = console.log;
    console.log = (line) => lines.push(line);
    try {
        printSeries({
            games: 1,
            players: ['expert', 'strong'],
            wins: { expert: 1, strong: 0 },
            seatWins: [1, 0],
            averageTurns: 12.5,
            exhausted: 0,
            matchLog: [{
                game: 1,
                seed: 7,
                lineup: ['expert', 'strong'],
                winnerDifficulty: 'expert',
                turns: 12,
                exhausted: false,
                expertPreset: 'default',
                finalState: [{
                    coins: 9,
                    builtLandmarkCount: 1,
                    builtLandmarks: ['駅'],
                    missingLandmarks: ['ショッピングモール'],
                    topCards: [{ name: '麦畑', count: 2 }],
                }, {
                    coins: 3,
                    builtLandmarkCount: 0,
                    builtLandmarks: [],
                    missingLandmarks: ['駅', 'ショッピングモール'],
                    topCards: [],
                }],
            }],
        }, { format: 'text', details: true, expertPreset: 'default' });
    } finally {
        console.log = realLog;
    }

    assert.ok(lines.some(line => String(line).includes('games=1 players=expert,strong expertPreset=default')));
    assert.ok(lines.some(line => String(line).includes('expert: 1 wins (100.0%)')));
    assert.ok(lines.some(line => String(line).includes('game=1 seed=7 lineup=expert,strong winner=expert')));
    assert.ok(lines.some(line => String(line).includes('p1=expert coins=9')));
});

runTest('printSeries は json 形式で結果をそのまま出力する', () => {
    const lines = [];
    const realLog = console.log;
    console.log = (line) => lines.push(line);
    try {
        printSeries({ games: 1, wins: { expert: 1 } }, { format: 'json' });
    } finally {
        console.log = realLog;
    }

    assert.strictEqual(JSON.parse(lines[0]).games, 1);
});

runTest('printPresetComparison は text 形式で各 preset を出力する', () => {
    const lines = [];
    const realLog = console.log;
    console.log = (line) => lines.push(line);
    try {
        printPresetComparison([
            {
                preset: 'default',
                result: {
                    games: 1,
                    players: ['expert', 'strong'],
                    wins: { expert: 1, strong: 0 },
                    seatWins: [1, 0],
                    averageTurns: 10,
                    exhausted: 0,
                    matchLog: [],
                },
            },
            {
                preset: 'rush',
                result: {
                    games: 1,
                    players: ['expert', 'strong'],
                    wins: { expert: 0, strong: 1 },
                    seatWins: [0, 1],
                    averageTurns: 9,
                    exhausted: 0,
                    matchLog: [],
                },
            },
        ], { format: 'text' });
    } finally {
        console.log = realLog;
    }

    assert.ok(lines.some(line => String(line).includes('expertPreset=default')));
    assert.ok(lines.some(line => String(line).includes('expertPreset=rush')));
});

runTest('printDifficultyLadder は各対戦セットを text で出力する', () => {
    const lines = [];
    const realLog = console.log;
    console.log = (line) => lines.push(line);
    try {
        printDifficultyLadder([
            {
                players: ['normal', 'weak'],
                result: {
                    games: 1,
                    players: ['normal', 'weak'],
                    wins: { normal: 1, weak: 0 },
                    seatWins: [1, 0],
                    averageTurns: 10,
                    exhausted: 0,
                    matchLog: [],
                },
            },
        ], { format: 'text' });
    } finally {
        console.log = realLog;
    }

    assert.ok(lines.some(line => String(line).includes('players=normal,weak')));
});

if (process.exitCode) {
    throw new Error('selfplayテストで失敗が発生しました');
}
