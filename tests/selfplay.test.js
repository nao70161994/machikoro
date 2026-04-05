const assert = require('assert');
const path = require('path');

const { simulateGame, runSeries, parseArgs } = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));

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
    });

    assert.strictEqual(result.exhausted, false);
    assert.ok(result.winner >= 0);
    assert.ok(result.turns > 0);
});

runTest('runSeries は難易度ごとの勝利数を集計する', () => {
    const result = runSeries({
        games: 6,
        seed: 10,
        maxSteps: 8000,
        players: ['expert', 'strong'],
    });

    assert.strictEqual(result.games, 6);
    assert.strictEqual(result.wins.expert + result.wins.strong, 6);
    assert.strictEqual(result.seatWins.length, 2);
});

runTest('parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '12', '--seed', '5', '--max-steps', '9000', 'expert', 'strong']);

    assert.strictEqual(args.games, 12);
    assert.strictEqual(args.seed, 5);
    assert.strictEqual(args.maxSteps, 9000);
    assert.deepStrictEqual(args.players, ['expert', 'strong']);
});

if (process.exitCode) {
    throw new Error('selfplayテストで失敗が発生しました');
}
