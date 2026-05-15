const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    buildAudit,
    renderText,
    renderMarkdown,
} = require('../scripts/audit-rl-portfolio.js');

runTest('audit-rl-portfolio parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs(['--registry', 'r.json', '--format', 'markdown']);
    assert.strictEqual(args.registryPath, 'r.json');
    assert.strictEqual(args.format, 'markdown');
});

runTest('audit-rl-portfolio は recommended model の評価カバレッジを集計する', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'machikoro-audit-'));
    try {
        const runDir = path.join(repoRoot, 'models', 'rl_model', 'runs', 'm4p-run');
        fs.mkdirSync(runDir, { recursive: true });
        fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify({
            bestRuns: [{ targetPendingRate: 0.08, targetUpdateRate: 0.07, tvTargetRate: 0.03, bcTargetRate: 0.02, moverTargetRate: 0.01 }],
        }), 'utf8');
        const audit = buildAudit({
            updatedAt: '2026-04-21',
            models: [
                {
                    id: 'm2p',
                    status: 'adopted',
                    path: 'models/rl_model/portfolio/m2p.browser.json',
                    style: { label: 'style-2p' },
                    evals: [
                        {
                            type: 'js',
                            gamesPerOpponent: 100,
                            opponents: { weak: {}, normal: {}, strong: {} },
                        },
                    ],
                },
                {
                    id: 'm4p',
                    status: 'adopted',
                    path: 'models/rl_model/portfolio/m4p.browser.json',
                    sourceRun: 'models/rl_model/runs/m4p-run',
                    style: { label: 'style-4p' },
                    evals: [
                        {
                            type: 'js-lineup-stability',
                            gamesPerLineup: 100,
                            lineups: { 'rl+weak+normal+strong': {} },
                        },
                        {
                            type: 'js-lineup-3p-stability',
                            gamesPerLineup: 80,
                            lineups: { 'rl+normal+strong': {} },
                        },
                        {
                            type: 'js-lineup-5p-stability',
                            gamesPerLineup: 60,
                            lineups: { 'rl+weak+normal+strong+expert': {} },
                        },
                        {
                            type: 'js-lineup-10p-stability',
                            gamesPerLineup: 40,
                            lineups: { 'rl+weak+normal+strong+expert+weak+normal+strong+expert+normal': {} },
                        },
                    ],
                },
            ],
            portfolioPolicy: {
                recommendedActiveModels: [
                    { id: 'm2p', role: 'adopted-2p-main' },
                    { id: 'm4p', role: 'adopted-3p-10p' },
                ],
            },
        }, { repoRoot });
        assert.strictEqual(audit.recommended.length, 2);
        assert.strictEqual(audit.recommended[0].has2pOpponents, true);
        assert.strictEqual(audit.recommended[1].has3pLineups, true);
        assert.strictEqual(audit.recommended[1].has4pLineups, true);
        assert.strictEqual(audit.recommended[1].has5pLineups, true);
        assert.strictEqual(audit.recommended[1].best5pGames, 60);
        assert.strictEqual(audit.recommended[1].has10pLineups, true);
        assert.strictEqual(audit.recommended[1].best10pGames, 40);
        assert.strictEqual(audit.recommended[1].targetDiagnostics.pendingRate, 0.08);
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});

runTest('audit-rl-portfolio renderText/renderMarkdown は推奨モデル表を出力する', () => {
    const audit = {
        updatedAt: '2026-04-21',
        warnings: ['warn-a'],
        errors: [],
        recommended: [
            {
                id: 'm1',
                role: 'adopted-2p-main',
                status: 'adopted',
                style: 'style-a',
                portfolioPath: true,
                best2pGames: 100,
                has2pOpponents: true,
                best3pGames: 0,
                has3pLineups: false,
                best4pGames: 0,
                has4pLineups: false,
                best5pGames: 0,
                has5pLineups: false,
                best10pGames: 0,
                has10pLineups: false,
                targetDiagnostics: { pendingRate: 0.08, updateRate: 0.07, tvRate: 0.03, bcRate: 0.02, moverRate: 0.01 },
            },
        ],
    };
    const text = renderText(audit);
    const markdown = renderMarkdown(audit);
    assert.ok(text.includes('recommended:'));
    assert.ok(text.includes('m1 [adopted-2p-main]'));
    assert.ok(text.includes('target=p=8.0%'));
    assert.ok(markdown.includes('# RL Portfolio Audit'));
    assert.ok(markdown.includes('| id | role | status | style | portfolio | 2p | 3p | 4p | 5p | 10p | target |'));
    assert.ok(markdown.includes('p=8.0%'));
});
