const assert = require('assert');
const path = require('path');

const { parseArgs, buildCandidateTunings, tuneExpert } = require(path.join(__dirname, '..', 'scripts', 'tune-expert.js'));
const { loadRuntime } = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));

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

runTest('parseArgs は tune-expert CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '6', '--seed', '9', '--max-steps', '7000', '--base-preset', 'rush', '--top', '3', '--format', 'json', 'expert', 'strong']);
    assert.strictEqual(args.games, 6);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.maxSteps, 7000);
    assert.strictEqual(args.basePreset, 'rush');
    assert.strictEqual(args.top, 3);
    assert.strictEqual(args.format, 'json');
    assert.deepStrictEqual(args.players, ['expert', 'strong']);
});

runTest('buildCandidateTunings は基準プリセットを含む複数候補を生成する', () => {
    const runtime = loadRuntime();
    const candidates = buildCandidateTunings(runtime, 'default');
    assert.ok(candidates.length > 5);
    assert.strictEqual(candidates[0].name, 'default:base');
    assert.ok(candidates.some(candidate => candidate.name.includes('landmarkRush')));
});

runTest('tuneExpert は候補を勝率順に返す', () => {
    const result = tuneExpert({
        games: 2,
        seed: 1,
        maxSteps: 4000,
        basePreset: 'default',
        top: 2,
        players: ['expert', 'strong'],
    });
    assert.strictEqual(result.basePreset, 'default');
    assert.ok(result.rankings.length >= result.top.length);
    assert.strictEqual(result.top.length, 2);
    assert.ok(result.top[0].winRate >= result.top[1].winRate);
    assert.ok(typeof result.top[0].tuning.coinWeight === 'number');
});

if (process.exitCode) {
    throw new Error('tune-expertテストで失敗が発生しました');
}
