const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    evaluateMultiSeed,
    parseArgs,
    parseSeedList,
    summarizeReports,
    summarizeValues,
    toText,
} = require(path.join(__dirname, '..', 'scripts', 'eval-expert-v2-multiseed.js'));

function fakeReport(seed, normalCrowd, strongWeighted, strongMin) {
    return {
        cpuFamily: 'v2simple-rule-based',
        options: { seed },
        normal: {
            entries: [{ profile: 'crowd', winRate: normalCrowd }],
        },
        strong: {
            summary: { weightedWinRate: strongWeighted, minWinRate: strongMin },
            entries: [
                { profile: 'crowd', winRate: strongWeighted },
                { profile: 'allStrong4', winRate: strongMin },
            ],
        },
    };
}

runTest('eval-expert-v2-multiseed parseSeedList は整数seedだけを返す', () => {
    assert.deepStrictEqual(parseSeedList('1, 2,x,4'), [1, 2, 4]);
});

runTest('eval-expert-v2-multiseed parseArgs は seed list と benchmark option を分ける', () => {
    const args = parseArgs(['--games', '5', '--seeds', '2,3', '--suite', 'strong', '--profiles', 'crowd']);
    assert.strictEqual(args.games, 5);
    assert.deepStrictEqual(args.seeds, [2, 3]);
    assert.strictEqual(args.suite, 'strong');
    assert.deepStrictEqual(args.profiles, ['crowd']);
});

runTest('eval-expert-v2-multiseed parseArgs は seed-start/count を展開する', () => {
    const args = parseArgs(['--seed-start', '4', '--seed-count', '3']);
    assert.deepStrictEqual(args.seeds, [4, 5, 6]);
});

runTest('eval-expert-v2-multiseed summarizeValues は平均と範囲を返す', () => {
    assert.deepStrictEqual(summarizeValues([0.4, 0.6]), { mean: 0.5, min: 0.4, max: 0.6 });
    assert.deepStrictEqual(summarizeValues([]), { mean: null, min: null, max: null });
});

runTest('eval-expert-v2-multiseed summarizeReports は seed ごとの主要指標を集約する', () => {
    const summary = summarizeReports([
        fakeReport(1, 0.5, 0.6, 0.4),
        fakeReport(2, 0.7, 0.5, 0.3),
    ]);
    assert.deepStrictEqual(summary.seeds, [1, 2]);
    assert.strictEqual(summary.normalCrowd.mean, 0.6);
    assert.strictEqual(summary.strongWeighted.min, 0.5);
    assert.strictEqual(summary.strongMin.max, 0.4);
    assert.ok(summary.profiles.some(entry => entry.suite === 'strong' && entry.profile === 'allStrong4' && entry.mean === 0.35));
});

runTest('eval-expert-v2-multiseed evaluateMultiSeed は evaluateFn を seed ごとに呼ぶ', () => {
    const report = evaluateMultiSeed({ games: 1, seeds: [7, 8], suite: 'all', profiles: [], lite: true }, options =>
        fakeReport(options.seed, options.seed === 7 ? 0.5 : 0.6, 0.4, 0.3)
    );
    assert.strictEqual(report.comparisonScope, 'expert-v2-multiseed-benchmark');
    assert.deepStrictEqual(report.summary.seeds, [7, 8]);
    assert.strictEqual(report.summary.normalCrowd.mean, 0.55);
    assert.ok(toText(report).includes('seeds=7,8'));
    assert.ok(toText(report).includes('normalCrowdMean=55.0%'));
});
