const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    evaluatePack,
    parseArgs,
    toMarkdown,
    toText,
} = require(path.join(__dirname, '..', 'scripts', 'eval-expert-v2-benchmark-pack.js'));

runTest('eval-expert-v2-benchmark-pack parseArgs は既定値を返す', () => {
    const args = parseArgs([]);
    assert.strictEqual(args.games, 50);
    assert.strictEqual(args.seed, 1);
    assert.strictEqual(args.maxSteps, 5000);
    assert.strictEqual(args.format, 'text');
    assert.strictEqual(args.lite, true);
    assert.strictEqual(args.expertPreset, 'v2simple');
    assert.strictEqual(args.businessMode, 'simple');
});

runTest('eval-expert-v2-benchmark-pack parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '3', '--seed', '7', '--max-steps', '900', '--format', 'markdown', '--full', '--expert-preset', 'default', '--business-mode', 'harmfulGift']);
    assert.strictEqual(args.games, 3);
    assert.strictEqual(args.seed, 7);
    assert.strictEqual(args.maxSteps, 900);
    assert.strictEqual(args.format, 'markdown');
    assert.strictEqual(args.lite, false);
    assert.strictEqual(args.expertPreset, 'default');
    assert.strictEqual(args.businessMode, 'harmfulGift');
});

runTest('eval-expert-v2-benchmark-pack evaluatePack は normal/strong の基準を返す', () => {
    const report = evaluatePack({ games: 1, seed: 1, maxSteps: 5000, lite: true, fast: false, expertPreset: 'v2simple', businessMode: 'harmfulGift' });
    assert.strictEqual(report.cpuFamily, 'v2simple-rule-based');
    assert.strictEqual(report.comparisonScope, 'expert-v2-benchmark-pack');
    assert.strictEqual(report.normal.options.businessMode, 'harmfulGift');
    assert.strictEqual(report.strong.options.businessMode, 'harmfulGift');
    assert.strictEqual(report.normal.entries.length, 1);
    assert.strictEqual(report.normal.entries[0].profile, 'crowd');
    assert.strictEqual(report.strong.entries.length, 4);
    assert.strictEqual(report.strong.entries[3].profile, 'allStrong4');
    assert.ok(typeof report.strong.summary.weightedWinRate === 'number');
});

runTest('eval-expert-v2-benchmark-pack toText/toMarkdown は概要を出力する', () => {
    const report = {
        options: { games: 2, seed: 1, lite: true, fast: false, expertPreset: 'v2simple', businessMode: 'harmfulGift' },
        normal: {
            summary: { weightedWinRate: 0.5, minWinRate: 0.5 },
            entries: [{ profile: 'crowd', players: ['expert', 'normal', 'normal', 'normal'], expertWins: 1, games: 2, winRate: 0.5, averageTurns: 40, exhausted: 0 }],
        },
        strong: {
            summary: { weightedWinRate: 0.4, minWinRate: 0.25 },
            entries: [{ profile: 'allStrong4', players: ['expert', 'strong', 'strong', 'strong'], expertWins: 1, games: 2, winRate: 0.5, averageTurns: 50, exhausted: 0 }],
        },
    };
    assert.ok(toText(report).includes('normalCrowd=50.0% strongWeighted=40.0% strongMin=25.0%'));
    assert.ok(toText(report).includes('businessMode=harmfulGift'));
    assert.ok(toText(report).includes('cpuFamily=v2simple-rule-based comparisonScope=expert-v2-benchmark-pack'));
    assert.ok(toMarkdown(report).includes('- cpuFamily: v2simple-rule-based'));
    assert.ok(toMarkdown(report).includes('- businessMode: harmfulGift'));
    assert.ok(toMarkdown(report).includes('| strong | allStrong4 | expert,strong,strong,strong | 50.0% | 50.0 | 0 |'));
});
