const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    mergeBreakdowns,
    parseArgs,
    renderText,
    summarizeTraceBuildPass,
} = require(path.join(__dirname, '..', 'scripts', 'diagnose-rl-build-pass.js'));

runTest('diagnose-rl-build-pass parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs([
        '--models', 'm1,m2',
        '--run-labels', 'r1',
        '--run-ranks', '1,2',
        '--games', '7',
        '--seed', '11',
        '--lineups', 'rl,weak,normal,strong;rl,normal,normal,strong',
        '--format', 'json',
        '--output', 'out.json',
    ]);
    assert.deepStrictEqual(args.models, ['m1', 'm2']);
    assert.deepStrictEqual(args.runLabels, ['r1']);
    assert.deepStrictEqual(args.runRanks, [1, 2]);
    assert.strictEqual(args.games, 7);
    assert.strictEqual(args.seed, 11);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.output, 'out.json');
    assert.deepStrictEqual(args.lineups, [
        ['rl', 'weak', 'normal', 'strong'],
        ['rl', 'normal', 'normal', 'strong'],
    ]);
});

runTest('diagnose-rl-build-pass summarizeTraceBuildPass はpass理由を分解する', () => {
    const summary = summarizeTraceBuildPass([
        {
            actorDifficulty: 'rl',
            before: { phase: 'build' },
            legalActions: [
                { label: 'PASS' },
                { label: 'BUY_CARD:麦畑' },
                { label: 'BUY_LM:駅' },
            ],
            chosenAction: { label: 'PASS' },
        },
        {
            actorDifficulty: 'rl',
            before: { phase: 'build' },
            legalActions: [{ label: 'PASS' }],
            chosenAction: { label: 'PASS' },
        },
        {
            actorDifficulty: 'rl',
            before: { phase: 'build' },
            legalActions: [{ label: 'PASS' }, { label: 'BUY_CARD:パン屋' }],
            chosenAction: { label: 'BUY_CARD:パン屋' },
        },
        {
            actorDifficulty: 'normal',
            before: { phase: 'build' },
            legalActions: [{ label: 'PASS' }, { label: 'BUY_CARD:麦畑' }],
            chosenAction: { label: 'PASS' },
        },
    ]);
    assert.strictEqual(summary.buildTotal, 3);
    assert.strictEqual(summary.buildPass, 2);
    assert.strictEqual(summary.buildPassOnlyAction, 1);
    assert.strictEqual(summary.buildPassWithAffordableCard, 1);
    assert.strictEqual(summary.buildPassWithAffordableLandmark, 1);
    assert.strictEqual(summary.buildPassWithAffordableAny, 1);
    assert.strictEqual(summary.topAffordableCardsOnPass[0].name, '麦畑');
    assert.strictEqual(summary.topAffordableLandmarksOnPass[0].name, '駅');
});

runTest('diagnose-rl-build-pass summarizeTraceBuildPass はbuild以外のpassを除外する', () => {
    const summary = summarizeTraceBuildPass([
        {
            actorDifficulty: 'rl',
            before: { phase: 'pending' },
            legalActions: [{ label: 'PASS' }, { label: 'BUSINESS:麦畑' }],
            chosenAction: { label: 'PASS' },
        },
        {
            actorDifficulty: 'rl',
            before: { phase: 'build' },
            legalActions: [{ label: 'PASS' }, { label: 'BUY_CARD:パン屋' }],
            chosenAction: { label: 'PASS' },
        },
    ]);
    assert.strictEqual(summary.buildTotal, 1);
    assert.strictEqual(summary.buildPass, 1);
    assert.strictEqual(summary.buildPassWithAffordableAny, 1);
    assert.strictEqual(summary.topAffordableCardsOnPass[0].name, 'パン屋');
});

runTest('diagnose-rl-build-pass mergeBreakdowns は複数summaryを合算する', () => {
    const merged = mergeBreakdowns([
        {
            buildTotal: 2,
            buildPass: 1,
            buildPassOnlyAction: 0,
            buildPassWithAffordableCard: 1,
            buildPassWithAffordableLandmark: 0,
            buildPassWithAffordableAny: 1,
            topAffordableCardsOnPass: [{ name: '麦畑', count: 1 }],
            topAffordableLandmarksOnPass: [],
        },
        {
            buildTotal: 2,
            buildPass: 2,
            buildPassOnlyAction: 1,
            buildPassWithAffordableCard: 1,
            buildPassWithAffordableLandmark: 1,
            buildPassWithAffordableAny: 1,
            topAffordableCardsOnPass: [{ name: '麦畑', count: 2 }],
            topAffordableLandmarksOnPass: [{ name: '駅', count: 1 }],
        },
    ]);
    assert.strictEqual(merged.buildTotal, 4);
    assert.strictEqual(merged.buildPass, 3);
    assert.strictEqual(merged.buildPassRate, 0.75);
    assert.strictEqual(merged.buildPassWithAffordableAny, 2);
    assert.deepStrictEqual(merged.topAffordableCardsOnPass, [{ name: '麦畑', count: 3 }]);
});

runTest('diagnose-rl-build-pass mergeBreakdowns は全件countを優先してtopを作る', () => {
    const merged = mergeBreakdowns([
        {
            buildTotal: 1,
            buildPass: 1,
            buildPassOnlyAction: 0,
            buildPassWithAffordableCard: 1,
            buildPassWithAffordableLandmark: 0,
            buildPassWithAffordableAny: 1,
            affordableCardCountsOnPass: {
                '麦畑': 1,
                'パン屋': 5,
            },
            topAffordableCardsOnPass: [{ name: '麦畑', count: 1 }],
            topAffordableLandmarksOnPass: [],
        },
        {
            buildTotal: 1,
            buildPass: 1,
            buildPassOnlyAction: 0,
            buildPassWithAffordableCard: 1,
            buildPassWithAffordableLandmark: 0,
            buildPassWithAffordableAny: 1,
            affordableCardCountsOnPass: {
                '麦畑': 1,
                'パン屋': 5,
            },
            topAffordableCardsOnPass: [{ name: '麦畑', count: 1 }],
            topAffordableLandmarksOnPass: [],
        },
    ]);
    assert.strictEqual(merged.affordableCardCountsOnPass['パン屋'], 10);
    assert.strictEqual(merged.topAffordableCardsOnPass[0].name, 'パン屋');
    assert.strictEqual(merged.topAffordableCardsOnPass[0].count, 10);
});

runTest('diagnose-rl-build-pass renderText は主要値を出力する', () => {
    const text = renderText([
        {
            id: 'model-a',
            aggregate: {
                buildPassRate: 0.5,
                buildPassWithAffordableAny: 2,
                buildPass: 4,
                buildPassOnlyAction: 1,
            },
            summaries: [
                {
                    opponent: 'rl+weak',
                    winRate: 0.25,
                    passBreakdown: {
                        buildPassRate: 0.5,
                        buildPassWithAffordableAny: 2,
                        buildPass: 4,
                        buildPassWithAffordableCard: 1,
                        buildPassWithAffordableLandmark: 1,
                        buildPassOnlyAction: 1,
                    },
                },
            ],
        },
    ]);
    assert.ok(text.includes('model-a: pass=50.0% affordable=2/4 only=1/4'));
    assert.ok(text.includes('rl+weak: win=25.0% pass=50.0%'));
});
