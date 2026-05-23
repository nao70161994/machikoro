const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    validateRegistry,
    bestEvalGames,
    modelTopCards,
    modelStyleKey,
    topCardOverlap,
    summarizeEvalCoverage,
    summarizeTargetDiagnostics,
} = require('../scripts/validate-rl-registry.js');

runTest('validate-rl-registry parseArgs は npm script の --check-paths を registry path と誤認しない', () => {
    assert.deepStrictEqual(parseArgs(['--check-paths']), {
        registryPath: path.join(__dirname, '..', 'models', 'rl_model', 'registry.json'),
        checkPaths: true,
    });
    assert.deepStrictEqual(parseArgs(['models/custom.json', '--check-paths']), {
        registryPath: 'models/custom.json',
        checkPaths: true,
    });
});

runTest('validateRegistry は推奨モデルが台帳に存在することを検証する', () => {
    const result = validateRegistry({
        models: [
            { id: 'a', status: 'candidate', path: 'a.json', evals: [{}] },
        ],
        portfolioPolicy: {
            recommendedActiveModels: [
                { id: 'missing' },
            ],
        },
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(error => error.includes('missing')));
});

runTest('validateRegistry は重複idをエラーにする', () => {
    const result = validateRegistry({
        models: [
            { id: 'a', status: 'candidate', path: 'a.json', evals: [{}] },
            { id: 'a', status: 'archive', path: 'b.json', evals: [{}] },
        ],
        portfolioPolicy: { recommendedActiveModels: [{ id: 'a' }] },
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(error => error.includes('重複')));
});

runTest('validateRegistry は active model の評価ゲーム数不足を警告する', () => {
    const result = validateRegistry({
        evaluationPolicy: {
            minimumAdoptionGamesPerOpponent: 50,
            primaryAdoptionGamesPerOpponent: 100,
        },
        models: [
            { id: 'a', status: 'candidate', path: 'a.json', style: { label: 'style-a' }, evals: [{ gamesPerOpponent: 20 }] },
        ],
        portfolioPolicy: { recommendedActiveModels: [{ id: 'a', role: 'adopted-2p-main' }] },
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.warnings.some(warning => warning.includes('評価ゲーム数が少なすぎます')));
    assert.ok(result.warnings.some(warning => warning.includes('main 採用')));
});

runTest('validateRegistry は recommended model の style 重複を警告する', () => {
    const result = validateRegistry({
        models: [
            { id: 'a', status: 'candidate', path: 'a.json', style: { label: 'same' }, evals: [{ gamesPerOpponent: 100 }] },
            { id: 'b', status: 'candidate', path: 'b.json', style: { label: 'same' }, evals: [{ gamesPerOpponent: 100 }] },
        ],
        portfolioPolicy: { recommendedActiveModels: [{ id: 'a' }, { id: 'b' }] },
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.warnings.some(warning => warning.includes('style が a と重複')));
});

runTest('validateRegistry は active model の topCards 類似を警告する', () => {
    const result = validateRegistry({
        diversityPolicy: { topCardOverlapWarning: 4 },
        models: [
            {
                id: 'a',
                status: 'candidate',
                path: 'a.json',
                style: { label: 'a', topCardsVsStrong: ['a', 'b', 'c', 'd', 'e'] },
                evals: [{ gamesPerOpponent: 100 }],
            },
            {
                id: 'b',
                status: 'candidate',
                path: 'b.json',
                style: { label: 'b', topCardsVsStrong: ['a', 'b', 'c', 'd', 'x'] },
                evals: [{ gamesPerOpponent: 100 }],
            },
        ],
        portfolioPolicy: { recommendedActiveModels: [] },
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.warnings.some(warning => warning.includes('topCards が 4/5 重複')));
});

runTest('validateRegistry helper は評価数と style key を返す', () => {
    const model = {
        style: { label: 'label-a', topCardsVsStrong: ['a', 'b'] },
        evals: [{ gamesPerOpponent: 20 }, { gamesPerLineup: 100 }],
    };
    assert.strictEqual(bestEvalGames(model), 100);
    assert.deepStrictEqual(modelTopCards(model), ['a', 'b']);
    assert.strictEqual(modelStyleKey(model), 'label-a');
    assert.strictEqual(topCardOverlap(
        { style: { topCardsVsStrong: ['a', 'b', 'c'] } },
        { style: { topCardsVsStrong: ['b', 'c', 'd'] } }
    ), 2);
});

runTest('validateRegistry helper は 2p/3p/4p/5p/10p の評価カバレッジを要約する', () => {
    const coverage = summarizeEvalCoverage({
        path: 'models/rl_model/portfolio/m1.browser.json',
        evals: [
            { type: 'js', gamesPerOpponent: 100, opponents: { weak: {}, normal: {}, strong: {} } },
            { type: 'js-lineup-stability', gamesPerLineup: 80, lineups: { 'rl+weak+normal+strong': {} } },
            { type: 'js-lineup-3p-stability', gamesPerLineup: 60, lineups: { 'rl+normal+strong': {} } },
            { type: 'js-lineup-5p-stability', gamesPerLineup: 50, lineups: { 'rl+weak+normal+strong+expert': {} } },
            { type: 'js-lineup-10p-stability', gamesPerLineup: 40, lineups: { 'rl+weak+weak+normal+normal+strong+strong+expert+expert+expert': {} } },
        ],
    });
    assert.strictEqual(coverage.portfolioPath, true);
    assert.strictEqual(coverage.best2pGames, 100);
    assert.strictEqual(coverage.has2pOpponents, true);
    assert.strictEqual(coverage.best4pGames, 80);
    assert.strictEqual(coverage.has4pLineups, true);
    assert.strictEqual(coverage.best3pGames, 60);
    assert.strictEqual(coverage.has3pLineups, true);
    assert.strictEqual(coverage.best5pGames, 50);
    assert.strictEqual(coverage.has5pLineups, true);
    assert.strictEqual(coverage.best10pGames, 40);
    assert.strictEqual(coverage.has10pLineups, true);
});

runTest('validateRegistry helper は lineup type だけでなく人数も見る', () => {
    const coverage = summarizeEvalCoverage({
        path: 'models/rl_model/portfolio/m1.browser.json',
        evals: [
            { type: 'js-lineup-5p-stability', gamesPerLineup: 50, lineups: { 'rl+weak+normal+strong': {} } },
            { type: 'js-lineup-10p-stability', gamesPerLineup: 40, lineups: { 'rl+weak+normal+strong+expert': {} } },
        ],
    });
    assert.strictEqual(coverage.best5pGames, 50);
    assert.strictEqual(coverage.has5pLineups, false);
    assert.strictEqual(coverage.best10pGames, 40);
    assert.strictEqual(coverage.has10pLineups, false);
});

runTest('validateRegistry helper は run summary から target 診断を要約する', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'machikoro-registry-'));
    try {
        const runDir = path.join(repoRoot, 'models', 'rl_model', 'runs', 'sample-run');
        fs.mkdirSync(runDir, { recursive: true });
        fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify({
            bestRuns: [{
                runLabel: 'sample-run',
                targetPendingRate: 0.12,
                targetUpdateRate: 0.1,
                tvTargetRate: 0.04,
                bcTargetRate: 0.03,
                moverTargetRate: 0.02,
            }],
        }), 'utf8');
        const diagnostics = summarizeTargetDiagnostics({
            id: 'sample',
            sourceRun: 'models/rl_model/runs/sample-run',
        }, { repoRoot });
        assert.strictEqual(diagnostics.pendingRate, 0.12);
        assert.strictEqual(diagnostics.updateRate, 0.1);
        assert.strictEqual(diagnostics.bcRate, 0.03);
        assert.ok(diagnostics.summaryPath.endsWith(path.join('models', 'rl_model', 'runs', 'sample-run', 'summary.json')));
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});

runTest('validateRegistry は recommended role に必要な評価カバレッジ不足を警告する', () => {
    const result = validateRegistry({
        models: [
            { id: 'm2p', status: 'adopted', path: 'a.json', style: { label: 'style-a' }, evals: [] },
            { id: 'm4p', status: 'adopted', path: 'models/rl_model/portfolio/m4p.browser.json', style: { label: 'style-b' }, evals: [] },
        ],
        portfolioPolicy: {
            recommendedActiveModels: [
                { id: 'm2p', role: 'adopted-2p-main' },
                { id: 'm4p', role: 'adopted-3p-10p' },
            ],
        },
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.warnings.some(warning => warning.includes('2人用採用候補')));
    assert.ok(result.warnings.some(warning => warning.includes('3人 lineup 評価が不足')));
    assert.ok(result.warnings.some(warning => warning.includes('4人 lineup 評価が不足')));
    assert.ok(result.warnings.some(warning => warning.includes('5人 lineup 評価が不足')));
    assert.ok(result.warnings.some(warning => warning.includes('10人 lineup 評価が不足')));
    assert.ok(result.warnings.some(warning => warning.includes('portfolio 配下')));
});

runTest('validateRegistry は多人数採用モデルの3p/4p/5p/10p評価を認識する', () => {
    const result = validateRegistry({
        models: [
            {
                id: 'm4p',
                status: 'adopted',
                path: 'models/rl_model/portfolio/m4p.browser.json',
                style: { label: 'style-b' },
                evals: [
                    { type: 'js-lineup-3p-stability', gamesPerLineup: 50, lineups: { 'rl+normal+strong': {} } },
                    { type: 'js-lineup-stability', gamesPerLineup: 50, lineups: { 'rl+weak+normal+strong': {} } },
                    { type: 'js-lineup-5p-stability', gamesPerLineup: 50, lineups: { 'rl+weak+normal+strong+expert': {} } },
                    { type: 'js-lineup-10p-stability', gamesPerLineup: 50, lineups: { 'rl+weak+normal+strong+expert+weak+normal+strong+expert+normal': {} } },
                ],
            },
        ],
        portfolioPolicy: {
            recommendedActiveModels: [
                { id: 'm4p', role: 'adopted-3p-10p' },
            ],
        },
    });
    assert.ok(!result.warnings.some(warning => warning.includes('5人 lineup 評価が不足')));
    assert.ok(!result.warnings.some(warning => warning.includes('10人 lineup 評価が不足')));
});

runTest('validateRegistry は多人数採用モデルの5p/10p評価ゲーム数不足を警告する', () => {
    const result = validateRegistry({
        evaluationPolicy: { minimumAdoptionGamesPerOpponent: 50 },
        models: [
            {
                id: 'm4p',
                status: 'adopted',
                path: 'models/rl_model/portfolio/m4p.browser.json',
                style: { label: 'style-b' },
                evals: [
                    { type: 'js-lineup-3p-stability', gamesPerLineup: 50, lineups: { 'rl+normal+strong': {} } },
                    { type: 'js-lineup-stability', gamesPerLineup: 50, lineups: { 'rl+weak+normal+strong': {} } },
                    { type: 'js-lineup-5p-stability', gamesPerLineup: 20, lineups: { 'rl+weak+normal+strong+expert': {} } },
                    { type: 'js-lineup-10p-stability', gamesPerLineup: 20, lineups: { 'rl+weak+normal+normal+strong+strong+expert+expert+expert+weak': {} } },
                ],
            },
        ],
        portfolioPolicy: {
            recommendedActiveModels: [
                { id: 'm4p', role: 'adopted-3p-10p' },
            ],
        },
    });
    assert.ok(result.warnings.some(warning => warning.includes('5人 lineup 評価ゲーム数が少なすぎます')));
    assert.ok(result.warnings.some(warning => warning.includes('10人 lineup 評価ゲーム数が少なすぎます')));
});

runTest('validateRegistry は多人数採用モデルの5p/10p評価があれば追加警告しない', () => {
    const result = validateRegistry({
        models: [
            {
                id: 'm4p',
                status: 'adopted',
                path: 'models/rl_model/portfolio/m4p.browser.json',
                style: { label: 'style-b' },
                evals: [
                    { type: 'js-lineup-3p-stability', gamesPerLineup: 50, lineups: { 'rl+normal+strong': {} } },
                    { type: 'js-lineup-stability', gamesPerLineup: 50, lineups: { 'rl+weak+normal+strong': {} } },
                    { type: 'js-lineup-5p-stability', gamesPerLineup: 50, lineups: { 'rl+weak+normal+strong+expert': {} } },
                    { type: 'js-lineup-10p-stability', gamesPerLineup: 50, lineups: { 'rl+weak+weak+normal+normal+strong+strong+expert+expert+expert': {} } },
                ],
            },
        ],
        portfolioPolicy: {
            recommendedActiveModels: [
                { id: 'm4p', role: 'adopted-3p-10p' },
            ],
        },
    });
    assert.strictEqual(result.ok, true);
    assert.ok(!result.warnings.some(warning => warning.includes('5人 lineup 評価が不足')));
    assert.ok(!result.warnings.some(warning => warning.includes('10人 lineup 評価が不足')));
});

runTest('validateRegistry は現行registryを通せる', () => {
    const registry = require('../models/rl_model/registry.json');
    const result = validateRegistry(registry);
    assert.strictEqual(result.ok, true);
});
