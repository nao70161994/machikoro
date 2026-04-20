const assert = require('assert');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    buildRegistryReport,
    renderText,
} = require('../scripts/report-rl-registry.js');

runTest('report-rl-registry parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs(['--registry', 'r.json', '--format', 'json']);
    assert.strictEqual(args.registryPath, 'r.json');
    assert.strictEqual(args.format, 'json');
});

runTest('report-rl-registry は status と評価状況を集計する', () => {
    const report = buildRegistryReport({
        updatedAt: '2026-04-20',
        models: [
            {
                id: 'a',
                status: 'candidate',
                path: 'a.json',
                style: { label: 'style-a' },
                evals: [{ date: '2026-04-20', gamesPerOpponent: 50 }],
            },
            {
                id: 'b',
                status: 'archive',
                path: 'b.json',
                style: { label: 'style-b' },
                evals: [],
            },
        ],
        portfolioPolicy: { recommendedActiveModels: [] },
    });
    assert.strictEqual(report.statusCounts.candidate, 1);
    assert.strictEqual(report.statusCounts.archive, 1);
    assert.strictEqual(report.models[0].bestEvalGames, 50);
    assert.strictEqual(report.models[0].latestEval, '50 games/opponent');
});

runTest('report-rl-registry renderText は警告とモデル一覧を出力する', () => {
    const text = renderText({
        updatedAt: '2026-04-20',
        statusCounts: { candidate: 1 },
        warnings: ['warn-a'],
        errors: [],
        models: [{ id: 'a', status: 'candidate', latestEval: '50 games/opponent', style: 'style-a' }],
    });
    assert.ok(text.includes('warnings:'));
    assert.ok(text.includes('warn-a'));
    assert.ok(text.includes('a [candidate]'));
});
