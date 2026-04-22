const assert = require('assert');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    playerCountOfSummary,
    buildEntry,
    buildDiversifiedPicks,
    buildNearTiePairs,
    buildReview,
    renderText,
    renderMarkdown,
} = require('../scripts/review-rl-multiplayer-topk.js');

runTest('review-rl-multiplayer-topk parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs(['--input', 'eval.json', '--format', 'markdown', '--output', 'out.md', '--diversified-limit', '3']);
    assert.strictEqual(args.input, 'eval.json');
    assert.strictEqual(args.format, 'markdown');
    assert.strictEqual(args.output, 'out.md');
    assert.strictEqual(args.diversifiedLimit, 3);
});

runTest('review-rl-multiplayer-topk playerCountOfSummary は lineup 長から人数を判定する', () => {
    assert.strictEqual(playerCountOfSummary({ lineup: ['rl', 'normal', 'strong'] }), 3);
    assert.strictEqual(playerCountOfSummary({ opponent: 'rl+normal+normal+strong' }), 4);
    assert.strictEqual(playerCountOfSummary({ opponent: 'strong' }), 2);
});

runTest('review-rl-multiplayer-topk buildEntry は3p/4p平均と総合点を作る', () => {
    const entry = buildEntry({
        id: 'top2',
        buildSignature: { cardKey: 'パン屋/寿司屋', landmarkKey: '港/駅' },
        summaries: [
            { lineup: ['rl', 'weak', 'normal'], rlWinRate: 0.7 },
            { lineup: ['rl', 'normal', 'strong'], rlWinRate: 0.5 },
            { lineup: ['rl', 'weak', 'normal', 'strong'], rlWinRate: 0.6 },
            { lineup: ['rl', 'normal', 'normal', 'strong'], rlWinRate: 0.4 },
        ],
    });
    assert.strictEqual(entry.avg3p, 0.6);
    assert.strictEqual(entry.avg4p, 0.5);
    assert.strictEqual(entry.combinedScore, 0.55);
    assert.strictEqual(entry.cardStyle, 'パン屋/寿司屋');
});

runTest('review-rl-multiplayer-topk buildDiversifiedPicks は style 重複を避けて拾う', () => {
    const picks = buildDiversifiedPicks([
        { id: 'a', diversityKey: 'x || y', combinedScore: 0.7 },
        { id: 'b', diversityKey: 'x || y', combinedScore: 0.69 },
        { id: 'c', diversityKey: 'm || n', combinedScore: 0.68 },
    ], 2);
    assert.deepStrictEqual(picks.map(entry => entry.id), ['a', 'c']);
});

runTest('review-rl-multiplayer-topk buildNearTiePairs は近い総合点で style が違う組を出す', () => {
    const pairs = buildNearTiePairs([
        { id: 'a', combinedScore: 0.70, diversityKey: 'x || y' },
        { id: 'b', combinedScore: 0.67, diversityKey: 'm || n' },
        { id: 'c', combinedScore: 0.50, diversityKey: 'm || n' },
    ]);
    assert.strictEqual(pairs.length, 1);
    assert.strictEqual(pairs[0].left, 'a');
    assert.strictEqual(pairs[0].right, 'b');
});

runTest('review-rl-multiplayer-topk buildReview/render は順位表と diversified picks を出す', () => {
    const review = buildReview([
        {
            id: 'top1',
            buildSignature: { cardKey: 'パン屋/寿司屋', landmarkKey: '港/駅' },
            summaries: [
                { lineup: ['rl', 'weak', 'normal'], rlWinRate: 0.8 },
                { lineup: ['rl', 'normal', 'strong'], rlWinRate: 0.7 },
                { lineup: ['rl', 'weak', 'normal', 'strong'], rlWinRate: 0.6 },
                { lineup: ['rl', 'normal', 'normal', 'strong'], rlWinRate: 0.5 },
            ],
        },
        {
            id: 'top2',
            buildSignature: { cardKey: '麦畑/ブドウ園', landmarkKey: '駅/港' },
            summaries: [
                { lineup: ['rl', 'weak', 'normal'], rlWinRate: 0.75 },
                { lineup: ['rl', 'normal', 'strong'], rlWinRate: 0.65 },
                { lineup: ['rl', 'weak', 'normal', 'strong'], rlWinRate: 0.55 },
                { lineup: ['rl', 'normal', 'normal', 'strong'], rlWinRate: 0.45 },
            ],
        },
    ], { diversifiedLimit: 2 });
    const text = renderText(review);
    const markdown = renderMarkdown(review);
    assert.strictEqual(review.entries[0].id, 'top1');
    assert.ok(text.includes('diversifiedPicks'));
    assert.ok(markdown.includes('# RL Multiplayer Top-k Review'));
    assert.ok(markdown.includes('## Diversified Picks'));
});
