const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    inferRunLabel,
    buildRunEntry,
    buildReview,
    renderText,
    renderMarkdown,
} = require('../scripts/review-rl-multiplayer-experiment-set.js');

runTest('review-rl-multiplayer-experiment-set parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs(['--inputs', 'a.json,b.json', '--format', 'markdown', '--output', 'out.md', '--top-run-limit', '3']);
    assert.deepStrictEqual(args.inputs, ['a.json', 'b.json']);
    assert.strictEqual(args.format, 'markdown');
    assert.strictEqual(args.output, 'out.md');
    assert.strictEqual(args.topRunLimit, 3);
});

runTest('review-rl-multiplayer-experiment-set inferRunLabel は review json 名から run-label を復元する', () => {
    const label = inferRunLabel('/tmp/eval-self-only-4p-h256-lr1e4-5000-seed105-targethead-top10-multiplayer.review.json');
    assert.strictEqual(label, 'self-only-4p-h256-lr1e4-5000-seed105-targethead');
});

runTest('review-rl-multiplayer-experiment-set buildRunEntry は run 単位の要約を作る', () => {
    const entry = buildRunEntry('/tmp/eval-run-a-top10-multiplayer.review.json', {
        totalModels: 10,
        entries: [
            { id: 'top4', combinedScore: 0.72, avg3p: 0.7, avg4p: 0.74, cardStyle: 'パン屋/寿司屋', landmarkStyle: '港/駅' },
            { id: 'top1', combinedScore: 0.68, avg3p: 0.66, avg4p: 0.7, cardStyle: '麦畑/ブドウ園', landmarkStyle: '駅/港' },
            { id: 'top3', combinedScore: 0.65, avg3p: 0.64, avg4p: 0.66, cardStyle: 'ピザ屋/食品倉庫', landmarkStyle: 'ショッピングモール/駅' },
        ],
        diversifiedPicks: [
            { id: 'top4', combinedScore: 0.72 },
            { id: 'top3', combinedScore: 0.65 },
        ],
    });
    assert.strictEqual(entry.runLabel, 'run-a');
    assert.strictEqual(entry.bestModelId, 'top4');
    assert.strictEqual(entry.bestCombined, 0.72);
    assert.strictEqual(entry.diversifiedCount, 2);
    assert.strictEqual(entry.distinctStyleCount, 3);
});

runTest('review-rl-multiplayer-experiment-set buildReview/render は run 間順位表を出す', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-exp-set-'));
    const inputA = path.join(tempDir, 'eval-run-a-top10-multiplayer.review.json');
    const inputB = path.join(tempDir, 'eval-run-b-top10-multiplayer.review.json');
    fs.writeFileSync(inputA, JSON.stringify({
        totalModels: 10,
        entries: [
            { id: 'top2', combinedScore: 0.75, avg3p: 0.8, avg4p: 0.7, cardStyle: 'パン屋/寿司屋', landmarkStyle: '港/駅' },
            { id: 'top5', combinedScore: 0.70, avg3p: 0.72, avg4p: 0.68, cardStyle: '麦畑/ブドウ園', landmarkStyle: '駅/港' },
        ],
        diversifiedPicks: [
            { id: 'top2', combinedScore: 0.75 },
            { id: 'top5', combinedScore: 0.70 },
        ],
    }), 'utf8');
    fs.writeFileSync(inputB, JSON.stringify({
        totalModels: 10,
        entries: [
            { id: 'top1', combinedScore: 0.74, avg3p: 0.76, avg4p: 0.72, cardStyle: 'ピザ屋/食品倉庫', landmarkStyle: 'ショッピングモール/駅' },
            { id: 'top4', combinedScore: 0.73, avg3p: 0.74, avg4p: 0.72, cardStyle: 'パン屋/麦畑', landmarkStyle: '港/電波塔' },
        ],
        diversifiedPicks: [
            { id: 'top1', combinedScore: 0.74 },
            { id: 'top4', combinedScore: 0.73 },
        ],
    }), 'utf8');
    const review = buildReview([inputA, inputB]);
    const text = renderText(review);
    const markdown = renderMarkdown(review);
    assert.strictEqual(review.runs[0].runLabel, 'run-a');
    assert.ok(text.includes('diversifiedRuns'));
    assert.ok(markdown.includes('# RL Multiplayer Experiment Set Review'));
    assert.ok(markdown.includes('## Ranking'));
});
