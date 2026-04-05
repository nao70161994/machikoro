const assert = require('assert');
const path = require('path');

const { simulateGame, runSeries, comparePresets, parseArgs } = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));

function runTest(name, fn) {
    try {
        fn();
        console.log(`テスト成功: ${name}`);
    } catch (error) {
        console.error(`テスト失敗: ${name}`);
        console.error(error.stack);
        process.exitCode = 1;
    }
}

runTest('simulateGame は CPU 同士の試合を最後まで進められる', () => {
    const result = simulateGame({
        difficulties: ['expert', 'strong', 'normal'],
        seed: 42,
        maxSteps: 8000,
        expertPreset: 'rush',
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
        games: 6,
        seed: 10,
        maxSteps: 8000,
        players: ['expert', 'strong'],
        expertPreset: 'economy',
    });

    assert.strictEqual(result.games, 6);
    assert.strictEqual(result.wins.expert + result.wins.strong, 6);
    assert.strictEqual(result.seatWins.length, 2);
    assert.strictEqual(result.matchLog.length, 6);
    assert.ok(typeof result.matchLog[0].seed === 'number');
    assert.strictEqual(result.matchLog[0].expertPreset, 'economy');
    assert.strictEqual(result.matchLog[0].finalState.length, 2);
    assert.ok(Array.isArray(result.matchLog[0].finalState[0].topCards));
});

runTest('parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '12', '--seed', '5', '--max-steps', '9000', '--format', 'json', '--details', '--expert-preset', 'rush', '--compare-presets', 'default,rush', 'expert', 'strong']);

    assert.strictEqual(args.games, 12);
    assert.strictEqual(args.seed, 5);
    assert.strictEqual(args.maxSteps, 9000);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.details, true);
    assert.strictEqual(args.expertPreset, 'rush');
    assert.deepStrictEqual(args.comparePresets, ['default', 'rush']);
    assert.deepStrictEqual(args.players, ['expert', 'strong']);
});

runTest('comparePresets は複数プリセットの集計を返す', () => {
    const comparisons = comparePresets({
        games: 2,
        seed: 1,
        maxSteps: 4000,
        players: ['expert', 'strong'],
        comparePresets: ['default', 'rush'],
        format: 'text',
        details: false,
    });

    assert.strictEqual(comparisons.length, 2);
    assert.strictEqual(comparisons[0].preset, 'default');
    assert.strictEqual(comparisons[1].preset, 'rush');
    assert.strictEqual(comparisons[0].result.games, 2);
});

if (process.exitCode) {
    throw new Error('selfplayテストで失敗が発生しました');
}
