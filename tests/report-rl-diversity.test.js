const assert = require('assert');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    weightedScore,
    buildDiversityReport,
    renderText,
    renderMarkdown,
} = require('../scripts/report-rl-diversity.js');

runTest('report-rl-diversity parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs(['--registry', 'registry.json', '--format', 'markdown', '--output', 'out.md']);
    assert.strictEqual(args.registryPath, 'registry.json');
    assert.strictEqual(args.format, 'markdown');
    assert.strictEqual(args.output, 'out.md');
});

runTest('report-rl-diversity weightedScore は weak/normal/strong から重み付き平均を返す', () => {
    const score = weightedScore({
        evals: [{
            type: 'js',
            gamesPerOpponent: 50,
            opponents: {
                weak: { winRate: 0.9 },
                normal: { winRate: 0.6 },
                strong: { winRate: 0.3 },
            },
        }],
    });
    assert.strictEqual(score, 0.5);
});

runTest('report-rl-diversity buildDiversityReport は style group と overlap を作る', () => {
    const report = buildDiversityReport({
        updatedAt: '2026-04-21',
        models: [
            {
                id: 'a',
                status: 'candidate',
                style: { label: 'style-1', topCardsVsStrong: ['x', 'y', 'z'] },
                evals: [{ type: 'js', gamesPerOpponent: 50, opponents: { weak: { winRate: 0.9 }, normal: { winRate: 0.6 }, strong: { winRate: 0.3 } } }],
            },
            {
                id: 'b',
                status: 'candidate',
                style: { label: 'style-1', topCardsVsStrong: ['x', 'y', 'q'] },
                evals: [{ type: 'js', gamesPerOpponent: 50, opponents: { weak: { winRate: 0.8 }, normal: { winRate: 0.5 }, strong: { winRate: 0.2 } } }],
            },
        ],
    });
    assert.strictEqual(report.styleGroups.length, 1);
    assert.strictEqual(report.styleGroups[0].entries.length, 2);
    assert.strictEqual(report.overlapPairs[0].overlap, 2);
});

runTest('report-rl-diversity renderText/renderMarkdown は一覧を出力する', () => {
    const report = {
        updatedAt: '2026-04-21',
        styleGroups: [{ style: 's', entries: [{ id: 'a', status: 'candidate', score: 0.5, games: 50 }] }],
        overlapPairs: [{ left: 'a', right: 'b', overlap: 4, sameStyle: true, compareCommand: 'npm run eval-rl-models -- --models a,b --games 100' }],
    };
    const text = renderText(report);
    const markdown = renderMarkdown(report);
    assert.ok(text.includes('styleGroups'));
    assert.ok(text.includes('overlapPairs'));
    assert.ok(markdown.includes('# RL Diversity Report'));
    assert.ok(markdown.includes('`a`'));
});
