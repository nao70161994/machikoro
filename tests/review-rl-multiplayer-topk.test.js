const assert = require('assert');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    playerCountOfSummary,
    minGamesAcrossSummaries,
    strategyDiversityKey,
    buildEntry,
    buildDiversifiedPicks,
    buildNearTiePairs,
    buildReview,
    renderText,
    renderMarkdown,
} = require('../scripts/review-rl-multiplayer-topk.js');

runTest('review-rl-multiplayer-topk parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs(['--input', 'eval.json', '--format', 'markdown', '--output', 'out.md', '--diversified-limit', '3', '--min-games-per-lineup', '80']);
    assert.strictEqual(args.input, 'eval.json');
    assert.strictEqual(args.format, 'markdown');
    assert.strictEqual(args.output, 'out.md');
    assert.strictEqual(args.diversifiedLimit, 3);
    assert.strictEqual(args.minGamesPerLineup, 80);
});

runTest('review-rl-multiplayer-topk は 0 指定の gate/多様化件数を fallback しない', () => {
    const args = parseArgs(['--diversified-limit', '0', '--min-games-per-lineup', '0']);
    assert.strictEqual(args.diversifiedLimit, 0);
    assert.strictEqual(args.minGamesPerLineup, 0);

    const review = buildReview([
        {
            id: 'short',
            buildSignature: { cardKey: 'パン屋', landmarkKey: '駅' },
            summaries: [
                { lineup: ['rl', 'weak', 'normal', 'strong'], rlWinRate: 0.5, games: 1 },
            ],
        },
    ], args);
    assert.strictEqual(review.minGamesPerLineup, 0);
    assert.strictEqual(review.entries[0].smokeOnly, false);
    assert.deepStrictEqual(review.diversifiedPicks, []);
});

runTest('review-rl-multiplayer-topk playerCountOfSummary は lineup 長から人数を判定する', () => {
    assert.strictEqual(playerCountOfSummary({ lineup: ['rl', 'normal', 'strong'] }), 3);
    assert.strictEqual(playerCountOfSummary({ opponent: 'rl+normal+normal+strong' }), 4);
    assert.strictEqual(playerCountOfSummary({ opponent: 'strong' }), 2);
});

runTest('review-rl-multiplayer-topk strategyDiversityKey は3軸を0.1刻みで固定する', () => {
    assert.strictEqual(strategyDiversityKey({
        primary: '資産エンジン型',
        axes: { interaction: 0.14, engine: 0.76, landmarkTempo: 0.25 },
    }), '資産エンジン型|interaction=0.1|engine=0.8|landmark=0.3');
    assert.strictEqual(strategyDiversityKey(null), '');
});

runTest('review-rl-multiplayer-topk buildEntry は3p/4p平均と総合点を作る', () => {
    const entry = buildEntry({
        id: 'top2',
        buildSignature: { cardKey: 'パン屋/寿司屋', landmarkKey: '港/駅' },
        strategyProfile: { primary: '対人干渉型', axes: { interaction: 0.4, engine: 0.6, landmarkTempo: 0.2 } },
        summaries: [
            { lineup: ['rl', 'weak', 'normal'], rlWinRate: 0.7, games: 50 },
            { lineup: ['rl', 'normal', 'strong'], rlWinRate: 0.5, games: 50 },
            { lineup: ['rl', 'weak', 'normal', 'strong'], rlWinRate: 0.6, games: 50 },
            { lineup: ['rl', 'normal', 'normal', 'strong'], rlWinRate: 0.4, games: 50 },
        ],
    });
    assert.strictEqual(entry.avg3p, 0.6);
    assert.strictEqual(entry.avg4p, 0.5);
    assert.strictEqual(entry.combinedScore, 0.55);
    assert.strictEqual(entry.cardStyle, 'パン屋/寿司屋');
    assert.ok(entry.diversityKey.startsWith('対人干渉型|'));
    assert.strictEqual(entry.minGames, 50);
    assert.strictEqual(entry.smokeOnly, false);
    assert.strictEqual(entry.mainAdoptionReady, false);
    assert.strictEqual(entry.highConfidence, false);
    assert.ok(renderText({ totalModels: 1, minGamesPerLineup: 50, entries: [entry], diversifiedPicks: [], nearTiePairs: [] }).includes('gate=candidateGate'));
});

runTest('review-rl-multiplayer-topk は100/300戦の主採用段階を区別する', () => {
    const result = games => buildEntry({
        id: `games-${games}`,
        evaluationConfig: { pairedSeats: true },
        summaries: [{ lineup: ['rl', 'weak', 'normal', 'strong'], rlWinRate: 0.5, games }],
    });
    assert.strictEqual(result(100).mainAdoptionReady, true);
    assert.strictEqual(result(100).highConfidence, false);
    assert.strictEqual(result(300).highConfidence, true);
    const unpaired = buildEntry({
        id: 'unpaired',
        evaluationConfig: { pairedSeats: false },
        summaries: [{ lineup: ['rl', 'weak', 'normal', 'strong'], rlWinRate: 0.5, games: 300 }],
    });
    assert.strictEqual(unpaired.mainSampleReady, true);
    assert.strictEqual(unpaired.mainAdoptionReady, false);
    assert.strictEqual(unpaired.highConfidence, false);
    const unstable = buildEntry({
        id: 'unstable',
        evaluationConfig: { pairedSeats: true },
        summaries: [{ lineup: ['rl', 'weak', 'normal', 'strong'], rlWinRate: 0.5, games: 300, exhausted: 1 }],
    });
    assert.strictEqual(unstable.runtimeStable, false);
    assert.strictEqual(unstable.mainAdoptionReady, false);
    assert.ok(renderText({ totalModels: 1, minGamesPerLineup: 50, entries: [unstable], diversifiedPicks: [], nearTiePairs: [] }).includes('gate=runtimeUnstable'));
});

runTest('review-rl-multiplayer-topk は50戦未満を smokeOnly として扱う', () => {
    const entry = buildEntry({
        id: 'short',
        summaries: [
            { lineup: ['rl', 'weak', 'normal', 'strong'], rlWinRate: 0.8, games: 20 },
            { lineup: ['rl', 'normal', 'normal', 'strong'], rlWinRate: 0.7, games: 20 },
        ],
    });
    assert.strictEqual(minGamesAcrossSummaries(entry.summaries4p), 20);
    assert.strictEqual(entry.minGames, 20);
    assert.strictEqual(entry.smokeOnly, true);
    assert.strictEqual(entry.promotionBlocked, true);
    assert.ok(entry.promotionWarning.includes('do not use for adoption'));
});

runTest('review-rl-multiplayer-topk はgames不明を smokeOnly として扱う', () => {
    const entry = buildEntry({
        id: 'missing-games',
        summaries: [
            { lineup: ['rl', 'weak', 'normal', 'strong'], rlWinRate: 0.8 },
        ],
    });
    assert.strictEqual(entry.minGames, null);
    assert.strictEqual(entry.smokeOnly, true);
    assert.strictEqual(entry.promotionBlocked, true);
    assert.ok(entry.promotionWarning.includes('n/a < 50'));
});

runTest('review-rl-multiplayer-topk は2人評価だけの入力を採用候補にしない', () => {
    const entry = buildEntry({
        id: 'two-player-only',
        summaries: [
            { opponent: 'weak', rlWinRate: 0.9, games: 100 },
            { opponent: 'normal', rlWinRate: 0.7, games: 100 },
        ],
    });
    assert.strictEqual(entry.minGames, 100);
    assert.strictEqual(entry.smokeOnly, false);
    assert.strictEqual(entry.promotionBlocked, true);
    assert.ok(entry.promotionWarning.includes('no 3p/4p lineup'));
    assert.strictEqual(entry.avg3p, null);
    assert.strictEqual(entry.avg4p, null);
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
                { lineup: ['rl', 'weak', 'normal'], rlWinRate: 0.8, games: 20 },
                { lineup: ['rl', 'normal', 'strong'], rlWinRate: 0.7, games: 20 },
                { lineup: ['rl', 'weak', 'normal', 'strong'], rlWinRate: 0.6, games: 20 },
                { lineup: ['rl', 'normal', 'normal', 'strong'], rlWinRate: 0.5, games: 20 },
            ],
        },
        {
            id: 'top2',
            buildSignature: { cardKey: '麦畑/ブドウ園', landmarkKey: '駅/港' },
            summaries: [
                { lineup: ['rl', 'weak', 'normal'], rlWinRate: 0.75, games: 20 },
                { lineup: ['rl', 'normal', 'strong'], rlWinRate: 0.65, games: 20 },
                { lineup: ['rl', 'weak', 'normal', 'strong'], rlWinRate: 0.55, games: 20 },
                { lineup: ['rl', 'normal', 'normal', 'strong'], rlWinRate: 0.45, games: 20 },
            ],
        },
    ], { diversifiedLimit: 2 });
    const text = renderText(review);
    const markdown = renderMarkdown(review);
    assert.strictEqual(review.entries[0].id, 'top1');
    assert.ok(text.includes('diversifiedPicks'));
    assert.ok(text.includes('promotionBlocked=true'));
    assert.ok(markdown.includes('# RL Multiplayer Top-k Review'));
    assert.ok(markdown.includes('smokeOnly'));
    assert.ok(markdown.includes('## Diversified Picks'));
});
