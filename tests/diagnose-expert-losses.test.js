const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    DEFAULT_PROFILES,
    parseArgs,
    summarizeLosses,
    toText,
} = require(path.join(__dirname, '..', 'scripts', 'diagnose-expert-losses.js'));

runTest('diagnose-expert-losses parseArgs は既定値を返す', () => {
    const args = parseArgs([]);
    assert.strictEqual(args.games, 20);
    assert.strictEqual(args.seed, 1);
    assert.strictEqual(args.maxSteps, 5000);
    assert.strictEqual(args.format, 'text');
    assert.strictEqual(args.lite, true);
    assert.deepStrictEqual(args.profiles, DEFAULT_PROFILES);
});

runTest('diagnose-expert-losses parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '12', '--seed', '9', '--max-steps', '7000', '--format', 'json', '--full', '--expert-preset', 'rush', '--tuning-candidate', 'default:skipPenaltyx1.25', '--profiles', 'duel,crowd']);
    assert.strictEqual(args.games, 12);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.maxSteps, 7000);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.lite, false);
    assert.strictEqual(args.expertPreset, 'rush');
    assert.strictEqual(args.tuningCandidate, 'default:skipPenaltyx1.25');
    assert.deepStrictEqual(args.profiles, ['duel', 'crowd']);
});

runTest('diagnose-expert-losses summarizeLosses は負け筋を集計する', () => {
    const summary = summarizeLosses([
        {
            winnerDifficulty: 'strong',
            winnerSeat: 1,
            turns: 40,
            landmarkGap: 2,
            expertMissingLandmarks: ['駅', 'ショッピングモール'],
            winnerBuiltLandmarks: ['駅', 'ショッピングモール', '港'],
            expertTopCards: [{ name: 'パン屋', count: 2 }],
            winnerTopCards: [{ name: '寿司屋', count: 3 }],
            lastExpertAction: 'PASS',
        },
        {
            winnerDifficulty: 'normal',
            winnerSeat: 2,
            turns: 50,
            landmarkGap: 1,
            expertMissingLandmarks: ['駅'],
            winnerBuiltLandmarks: ['駅'],
            expertTopCards: [{ name: 'パン屋', count: 1 }],
            winnerTopCards: [{ name: '寿司屋', count: 1 }],
            lastExpertAction: 'BUY_CARD:パン屋',
        },
    ]);
    assert.strictEqual(summary.losses, 2);
    assert.strictEqual(summary.averageLandmarkGap, 1.5);
    assert.strictEqual(summary.averageTurns, 45);
    assert.strictEqual(summary.winnerDifficulties.strong, 1);
    assert.strictEqual(summary.winnerSeats.p2, 1);
    assert.strictEqual(summary.expertMissingLandmarks[0].name, '駅');
    assert.strictEqual(summary.winnerTopCards[0].name, '寿司屋');
    assert.strictEqual(summary.finalActions[0].name, 'BUY_CARD:パン屋');
});

runTest('diagnose-expert-losses toText は主要な差分を含む', () => {
    const text = toText([
        {
            profile: 'duel',
            expertWinRate: 0.25,
            summary: {
                losses: 3,
                averageLandmarkGap: 1.67,
                averageTurns: 48.3,
                winnerDifficulties: { strong: 3 },
                winnerSeats: { p2: 2, p1: 1 },
                expertMissingLandmarks: [{ name: '駅', count: 3 }],
                winnerBuiltLandmarks: [{ name: '駅', count: 3 }],
                expertTopCards: [{ name: 'パン屋', count: 5 }],
                winnerTopCards: [{ name: '寿司屋', count: 6 }],
                finalActions: [{ name: 'PASS', count: 2 }],
            },
        },
    ], { games: 4, seed: 1, lite: true, fast: false, expertPreset: 'default', tuningCandidate: '' });
    assert.ok(text.includes('duel: expertWinRate=25.0%'));
    assert.ok(text.includes('avgLandmarkGap=1.67'));
    assert.ok(text.includes('expertMissing=駅:3'));
    assert.ok(text.includes('winnerCards=寿司屋:6'));
    assert.ok(text.includes('finalActions=PASS:2'));
});
