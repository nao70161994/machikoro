const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    buildRegistryReport,
    recommendedActions,
    renderText,
    renderMarkdown,
} = require('../scripts/report-rl-registry.js');

runTest('report-rl-registry parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs(['--registry', 'r.json', '--format', 'json', '--output', 'out.json']);
    assert.strictEqual(args.registryPath, 'r.json');
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.output, 'out.json');
});

runTest('report-rl-registry は status と評価状況を集計する', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'machikoro-report-'));
    try {
        const runDir = path.join(repoRoot, 'models', 'rl_model', 'runs', 'a-run');
        fs.mkdirSync(runDir, { recursive: true });
        fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify({
            bestRuns: [{ targetPendingRate: 0.12, targetUpdateRate: 0.1, tvTargetRate: 0.04, bcTargetRate: 0.03, moverTargetRate: 0.02 }],
        }), 'utf8');
        const report = buildRegistryReport({
            updatedAt: '2026-04-20',
            models: [
                {
                    id: 'a',
                    status: 'candidate',
                    path: 'a.json',
                    sourceRun: 'models/rl_model/runs/a-run',
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
        }, { repoRoot });
        assert.strictEqual(report.statusCounts.candidate, 1);
        assert.strictEqual(report.statusCounts.archive, 1);
        assert.strictEqual(report.models[0].bestEvalGames, 50);
        assert.strictEqual(report.models[0].latestEval, '50 games/opponent');
        assert.strictEqual(report.models[0].targetDiagnostics.pendingRate, 0.12);
        assert.ok(Array.isArray(report.actions));
        assert.ok(Array.isArray(report.recommended));
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});

runTest('report-rl-registry recommendedActions は警告を作業種別へ分類する', () => {
    const actions = recommendedActions({
        warnings: [
            'a: adopted/candidate の評価ゲーム数が少なすぎます (20 < 50)',
            'a と b: topCards が 4/5 重複しています',
            'c: evals が未記録です',
        ],
    });
    assert.deepStrictEqual(actions.map(action => action.type), [
        'reevaluate',
        'review-diversity',
        'record-eval-or-rejection',
    ]);
});

runTest('report-rl-registry renderText は警告とモデル一覧を出力する', () => {
    const text = renderText({
        updatedAt: '2026-04-20',
        statusCounts: { candidate: 1 },
        warnings: ['warn-a'],
        errors: [],
        actions: [{ type: 'reevaluate', warning: 'warn-a' }],
        recommended: [{
            id: 'a',
            role: 'adopted-2p-main',
            status: 'adopted',
            coverage: { has2pOpponents: true, best2pGames: 100, has3pLineups: false, best3pGames: 0, has4pLineups: false, best4pGames: 0 },
            targetDiagnostics: { pendingRate: 0.12, updateRate: 0.1, tvRate: 0.04, bcRate: 0.03, moverRate: 0.02 },
        }],
        models: [{ id: 'a', status: 'candidate', latestEval: '50 games/opponent', style: 'style-a', targetDiagnostics: { pendingRate: 0.12, updateRate: 0.1, tvRate: 0.04, bcRate: 0.03, moverRate: 0.02 } }],
    });
    assert.ok(text.includes('warnings:'));
    assert.ok(text.includes('actions:'));
    assert.ok(text.includes('recommended:'));
    assert.ok(text.includes('warn-a'));
    assert.ok(text.includes('a [candidate]'));
    assert.ok(text.includes('target=p=12.0%'));
});

runTest('report-rl-registry renderMarkdown は表形式で出力する', () => {
    const markdown = renderMarkdown({
        updatedAt: '2026-04-20',
        statusCounts: { candidate: 1 },
        warnings: ['warn-a'],
        errors: [],
        actions: [{ type: 'reevaluate', warning: 'warn-a' }],
        recommended: [{
            id: 'a',
            role: 'adopted-2p-main',
            status: 'adopted',
            coverage: { has2pOpponents: true, best2pGames: 100, has3pLineups: false, best3pGames: 0, has4pLineups: false, best4pGames: 0 },
            targetDiagnostics: { pendingRate: 0.12, updateRate: 0.1, tvRate: 0.04, bcRate: 0.03, moverRate: 0.02 },
        }],
        models: [{ id: 'a', status: 'candidate', latestEval: '50 games/opponent', style: 'style-a', targetDiagnostics: { pendingRate: 0.12, updateRate: 0.1, tvRate: 0.04, bcRate: 0.03, moverRate: 0.02 } }],
    });
    assert.ok(markdown.includes('# RL Registry Report'));
    assert.ok(markdown.includes('## Actions'));
    assert.ok(markdown.includes('## Recommended'));
    assert.ok(markdown.includes('| id | status | eval | style | target |'));
    assert.ok(markdown.includes('`a`'));
    assert.ok(markdown.includes('p=12.0%'));
});
