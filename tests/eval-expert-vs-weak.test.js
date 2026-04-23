const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    DEFAULT_PROFILES,
    parseArgs,
    profilePlayers,
    profileWeight,
    summarize,
    toMarkdown,
    toText,
} = require(path.join(__dirname, '..', 'scripts', 'eval-expert-vs-weak.js'));

runTest('eval-expert-vs-weak parseArgs は既定値を返す', () => {
    const args = parseArgs([]);
    assert.strictEqual(args.games, 50);
    assert.strictEqual(args.seed, 1);
    assert.strictEqual(args.maxSteps, 5000);
    assert.strictEqual(args.format, 'text');
    assert.strictEqual(args.lite, true);
    assert.deepStrictEqual(args.profiles, DEFAULT_PROFILES);
});

runTest('eval-expert-vs-weak parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '30', '--seed', '9', '--max-steps', '7000', '--format', 'json', '--full', '--profiles', 'duel,crowd']);
    assert.strictEqual(args.games, 30);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.maxSteps, 7000);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.lite, false);
    assert.deepStrictEqual(args.profiles, ['duel', 'crowd']);
});

runTest('eval-expert-vs-weak profilePlayers は既知プロファイルを返す', () => {
    assert.deepStrictEqual(profilePlayers('duel'), ['expert', 'weak']);
    assert.deepStrictEqual(profilePlayers('trio'), ['expert', 'weak', 'weak']);
    assert.deepStrictEqual(profilePlayers('crowd'), ['expert', 'weak', 'weak', 'weak']);
});

runTest('eval-expert-vs-weak profileWeight は重みを返す', () => {
    assert.strictEqual(profileWeight('duel'), 1);
    assert.strictEqual(profileWeight('trio'), 2);
    assert.strictEqual(profileWeight('crowd'), 3);
});

runTest('eval-expert-vs-weak summarize は重み付き勝率と最低勝率を返す', () => {
    const summary = summarize([
        { profile: 'duel', weight: 1, winRate: 0.8 },
        { profile: 'crowd', weight: 3, winRate: 0.5 },
    ]);
    assert.strictEqual(summary.profiles, 2);
    assert.ok(Math.abs(summary.weightedWinRate - 0.575) < 1e-9);
    assert.strictEqual(summary.minWinRate, 0.5);
});

runTest('eval-expert-vs-weak formatter は主要値を含む', () => {
    const options = { games: 50, seed: 1, lite: true, fast: false };
    const entries = [
        {
            profile: 'crowd',
            players: ['expert', 'weak', 'weak', 'weak'],
            weight: 3,
            games: 50,
            expertWins: 35,
            winRate: 0.7,
            averageTurns: 42.3,
            exhausted: 1,
            seatWins: [20, 8, 4, 3],
        },
    ];
    const summary = summarize(entries);
    const text = toText(entries, summary, options);
    const md = toMarkdown(entries, summary, options);
    assert.ok(text.includes('weightedWinRate=70.0%'));
    assert.ok(text.includes('crowd: 35/50'));
    assert.ok(text.includes('players=expert,weak,weak,weak'));
    assert.ok(md.includes('| profile | players | weight | winRate | seatWins |'));
    assert.ok(md.includes('| crowd | expert,weak,weak,weak | 3 | 70.0% | 20,8,4,3 | 42.3 | 1 |'));
});
