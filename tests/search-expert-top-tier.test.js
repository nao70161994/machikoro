const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    rankCandidates,
    renderMarkdown,
    renderText,
    summarizeProfileResults,
} = require(path.join(__dirname, '..', 'scripts', 'search-expert-top-tier.js'));

runTest('search-expert-top-tier parseArgs は既定値を返す', () => {
    const args = parseArgs([]);
    assert.strictEqual(args.games, 8);
    assert.strictEqual(args.seed, 1);
    assert.strictEqual(args.basePreset, 'default');
    assert.strictEqual(args.top, 5);
    assert.strictEqual(args.format, 'text');
    assert.strictEqual(args.lite, true);
});

runTest('search-expert-top-tier parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '12', '--seed', '9', '--base-preset', 'rush', '--top', '3', '--format', 'json', '--full', '--profiles', 'duel,crowd']);
    assert.strictEqual(args.games, 12);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.basePreset, 'rush');
    assert.strictEqual(args.top, 3);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.lite, false);
    assert.deepStrictEqual(args.profiles, ['duel', 'crowd']);
});

runTest('search-expert-top-tier summarizeProfileResults は重み付き勝率を返す', () => {
    const summary = summarizeProfileResults([
        { weight: 1, winRate: 0.8, averageTurns: 40, exhausted: 0 },
        { weight: 3, winRate: 0.5, averageTurns: 60, exhausted: 2 },
    ]);
    assert.ok(Math.abs(summary.weightedWinRate - 0.575) < 1e-9);
    assert.strictEqual(summary.minWinRate, 0.5);
    assert.strictEqual(summary.exhausted, 2);
    assert.ok(Math.abs(summary.averageTurns - 55) < 1e-9);
});

runTest('search-expert-top-tier rankCandidates は weighted/min/turns で並べる', () => {
    const ranked = rankCandidates([
        { name: 'b', weightedWinRate: 0.6, minWinRate: 0.4, exhausted: 0, averageTurns: 50 },
        { name: 'a', weightedWinRate: 0.6, minWinRate: 0.5, exhausted: 0, averageTurns: 55 },
        { name: 'c', weightedWinRate: 0.7, minWinRate: 0.3, exhausted: 1, averageTurns: 45 },
    ]);
    assert.deepStrictEqual(ranked.map(v => v.name), ['c', 'a', 'b']);
});

runTest('search-expert-top-tier formatter は主要値を含む', () => {
    const result = {
        options: { basePreset: 'default', games: 8, top: 2, lite: true, fast: false, profiles: ['duel', 'crowd'] },
        totalCandidates: 10,
        top: [
            {
                name: 'default:base',
                weightedWinRate: 0.65,
                minWinRate: 0.5,
                averageTurns: 52.4,
                exhausted: 1,
                profiles: [
                    { profile: 'duel', winRate: 0.75, expertWins: 6, games: 8 },
                    { profile: 'crowd', winRate: 0.6, expertWins: 5, games: 8 },
                ],
            },
        ],
    };
    const text = renderText(result);
    const md = renderMarkdown(result);
    assert.ok(text.includes('default:base: weighted=65.0% min=50.0%'));
    assert.ok(text.includes('duel: 75.0% (6/8)'));
    assert.ok(md.includes('| candidate | weighted | min | avgTurns | exhausted |'));
    assert.ok(md.includes('| default:base | 65.0% | 50.0% | 52.4 | 1 |'));
});
