const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    buildArtifacts,
    writeArtifacts,
    renderSummary,
} = require('../scripts/refresh-rl-ops-reports.js');

runTest('refresh-rl-ops-reports parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs(['--registry', 'registry.json', '--output-dir', 'reports']);
    assert.strictEqual(args.registryPath, 'registry.json');
    assert.strictEqual(args.outputDir, 'reports');
});

runTest('refresh-rl-ops-reports buildArtifacts はモデル再現・圧縮情報を含む8種類の成果物を作る', () => {
    const registry = {
        updatedAt: '2026-04-21',
        portfolioPolicy: {
            recommendedActiveModels: [
                { id: 'main', role: 'adopted-2p-main' },
            ],
        },
        evaluationPolicy: {
            minimumAdoptionGamesPerOpponent: 50,
        },
        models: [
            {
                id: 'main',
                status: 'adopted',
                path: 'models/rl_model/portfolio/main.browser.json',
                style: { label: 'alpha' },
                evals: [
                    {
                        type: 'js',
                        date: '2026-04-21',
                        gamesPerOpponent: 100,
                        opponents: {
                            weak: { winRate: 0.9, passRate: 0.01 },
                            normal: { winRate: 0.7, passRate: 0.02 },
                            strong: { winRate: 0.4, passRate: 0.03 },
                        },
                    },
                ],
            },
        ],
    };
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-ops-build-'));
    const artifactPath = path.join(tmpDir, 'models', 'rl_model', 'portfolio', 'main.browser.json');
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, JSON.stringify({ weights: Array(100).fill(0.1) }));
    const artifacts = buildArtifacts(registry, {
        repoRoot: tmpDir,
        catalog: [{
            id: 'main',
            path: 'models/rl_model/portfolio/main.browser.json',
            productionActive: true,
        }],
    });
    assert.ok(artifacts.report);
    assert.ok(artifacts.audit);
    assert.ok(artifacts.plan);
    assert.ok(artifacts.review);
    assert.ok(artifacts.diversity);
    assert.ok(artifacts.modelCards);
    assert.ok(artifacts.reproducibilityManifest);
    assert.ok(artifacts.compression);
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

runTest('refresh-rl-ops-reports writeArtifacts は report 群を書き出す', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-ops-'));
    try {
        const artifacts = {
            report: { updatedAt: '2026-04-21', statusCounts: {}, warnings: [], errors: [], models: [], recommended: [], actions: [] },
            audit: { updatedAt: '2026-04-21', warnings: [], errors: [], recommended: [] },
            plan: { updatedAt: '2026-04-21', counts: {}, actions: [] },
            review: { updatedAt: '2026-04-21', minimumGames: 50, currentMain: '', candidates: [], actions: [] },
            diversity: { updatedAt: '2026-04-21', styleGroups: [], overlapPairs: [] },
            modelCards: [],
            reproducibilityManifest: {
                schemaVersion: 1,
                registryUpdatedAt: '2026-04-21',
                catalogModelCount: 0,
                productionModelIds: [],
                artifacts: [],
            },
            compression: {
                generatedAt: '2026-08-25T00:00:00.000Z',
                method: { gzipLevel: 9, brotliQuality: 9, brotliMode: 'text' },
                models: [],
                totals: { rawBytes: 0, gzipBytes: 0, brotliBytes: 0, gzipRatio: 0, brotliRatio: 0 },
                productionTotals: { rawBytes: 0, gzipBytes: 0, brotliBytes: 0, gzipRatio: 0, brotliRatio: 0 },
                recommendation: 'transport only',
            },
        };
        const files = writeArtifacts(artifacts, tmpDir);
        assert.strictEqual(files.length, 21);
        assert.ok(fs.existsSync(path.join(tmpDir, 'registry-report.txt')));
        assert.ok(fs.existsSync(path.join(tmpDir, 'adoption-review.json')));
        assert.ok(fs.existsSync(path.join(tmpDir, 'diversity-report.md')));
        assert.ok(fs.existsSync(path.join(tmpDir, 'model-cards.json')));
        assert.ok(fs.existsSync(path.join(tmpDir, 'reproducibility-manifest.md')));
        assert.ok(fs.existsSync(path.join(tmpDir, 'compression-report.json')));
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

runTest('refresh-rl-ops-reports renderSummary は出力ファイル一覧を返す', () => {
    const summary = renderSummary('/tmp/reports', ['/tmp/reports/a.txt', '/tmp/reports/b.md']);
    assert.ok(summary.includes('RL ops reports refreshed'));
    assert.ok(summary.includes('a.txt'));
    assert.ok(summary.includes('b.md'));
});
