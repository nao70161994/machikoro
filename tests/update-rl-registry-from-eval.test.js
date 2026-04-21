const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    updateRegistryFromEval,
    renderSummary,
} = require('../scripts/update-rl-registry-from-eval.js');

runTest('update-rl-registry-from-eval parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs([
        '--input', 'eval.json',
        '--registry', 'registry.json',
        '--output-dir', 'reports',
        '--date', '2026-04-21',
        '--output', 'summary.json',
        '--skip-refresh',
    ]);
    assert.strictEqual(args.input, 'eval.json');
    assert.strictEqual(args.registryPath, 'registry.json');
    assert.strictEqual(args.outputDir, 'reports');
    assert.strictEqual(args.date, '2026-04-21');
    assert.strictEqual(args.output, 'summary.json');
    assert.strictEqual(args.skipRefresh, true);
});

runTest('update-rl-registry-from-eval は registry 更新と summary 出力を行う', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-update-'));
    const registryPath = path.join(tmpDir, 'registry.json');
    const inputPath = path.join(tmpDir, 'eval.json');
    const outputPath = path.join(tmpDir, 'summary.json');
    fs.writeFileSync(registryPath, JSON.stringify({
        updatedAt: '2026-04-21',
        models: [{ id: 'model-top2', evals: [] }],
        portfolioPolicy: { recommendedActiveModels: [] },
    }, null, 2));
    fs.writeFileSync(inputPath, JSON.stringify([{
        id: 'model-top2',
        path: 'models/rl_model/runs/model/best_model.top2.browser.json',
        score: 0.5,
        summaries: [{
            opponent: 'weak',
            games: 20,
            rlWins: 15,
            opponentWins: 5,
            draws: 0,
            rlWinRate: 0.75,
            averageTurns: 51.2,
            rlBuildStats: { passRate: 0.01 },
        }],
    }], null, 2));
    const summary = updateRegistryFromEval({
        input: inputPath,
        registryPath,
        outputDir: path.join(tmpDir, 'reports'),
        date: '2026-04-21',
        output: outputPath,
        skipRefresh: true,
    });
    const updated = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    assert.strictEqual(summary.appended, 1);
    assert.strictEqual(updated.models[0].evals.length, 1);
    assert.ok(fs.existsSync(outputPath));
});

runTest('update-rl-registry-from-eval renderSummary は更新内容を返す', () => {
    const text = renderSummary({
        registryPath: 'registry.json',
        appended: 1,
        skippedDuplicates: 0,
        updatedScores: 1,
        entries: [{ id: 'm1', score: 0.5 }],
        refreshedReports: ['registry-report.txt'],
    });
    assert.ok(text.includes('registry updated'));
    assert.ok(text.includes('m1'));
    assert.ok(text.includes('registry-report.txt'));
});
