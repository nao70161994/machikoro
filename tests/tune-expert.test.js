const assert = require('assert');
const path = require('path');

const { parseArgs, buildCandidateTunings, formatPresetObject, profilePlayers, tuneExpert, tuneExpertProfiles } = require(path.join(__dirname, '..', 'scripts', 'tune-expert.js'));
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
    const args = parseArgs(['--games', '6', '--seed', '9', '--max-steps', '7000', '--base-preset', 'rush', '--top', '3', '--format', 'json', '--emit-preset', '--profiles', 'duel,crowd', 'expert', 'strong']);
    assert.strictEqual(args.games, 6);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.maxSteps, 7000);
    assert.strictEqual(args.basePreset, 'rush');
    assert.strictEqual(args.top, 3);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.emitPreset, true);
    assert.deepStrictEqual(args.profiles, ['duel', 'crowd']);
    assert.deepStrictEqual(args.players, ['expert', 'strong']);
});

runTest('parseArgs は basePreset 未指定時に default を使う', () => {
    const args = parseArgs([]);
    assert.strictEqual(args.basePreset, 'default');
});

runTest('buildCandidateTunings は基準プリセットを含む複数候補を生成する', () => {
    const runtime = loadRuntime();
    const candidates = buildCandidateTunings(runtime, 'default');
    assert.ok(candidates.length > 5);
    assert.strictEqual(candidates[0].name, 'default:base');
    assert.ok(candidates.some(candidate => candidate.name.includes('landmarkRush')));
});

runTest('profilePlayers は既知プロファイルの並びを返す', () => {
    assert.deepStrictEqual(profilePlayers('duel'), ['expert', 'strong']);
    assert.deepStrictEqual(profilePlayers('trio'), ['expert', 'strong', 'strong']);
    assert.deepStrictEqual(profilePlayers('crowd'), ['expert', 'strong', 'strong', 'normal']);
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

runTest('tuneExpertProfiles は複数プロファイルの結果を返す', () => {
    const results = tuneExpertProfiles({
        games: 2,
        seed: 1,
        maxSteps: 4000,
        basePreset: 'default',
        top: 1,
        profiles: ['duel', 'crowd'],
    });
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].profile, 'duel');
    assert.strictEqual(results[1].profile, 'crowd');
    assert.strictEqual(results[0].result.players.length, 2);
    assert.strictEqual(results[1].result.players.length, 4);
});

runTest('formatPresetObject は CPU プリセット形式の文字列を返す', () => {
    const output = formatPresetObject('testPreset', {
        coinWeight: 1.2,
        lookaheadWeight: 0.8,
    });
    assert.ok(output.includes('testPreset: {'));
    assert.ok(output.includes('coinWeight: 1.2'));
    assert.ok(output.includes('lookaheadWeight: 0.8'));
});

if (process.exitCode) {
    throw new Error('tune-expertテストで失敗が発生しました');
}
