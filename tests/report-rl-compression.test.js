const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    analyzeBuffer,
    resolveArtifact,
    buildCompressionReport,
    renderMarkdown,
} = require('../scripts/report-rl-compression.js');

runTest('report-rl-compression parseArgs は対象と形式を解釈する', () => {
    const args = parseArgs(['--repo-root', '/tmp/repo', '--format', 'json', '--production-only']);
    assert.strictEqual(args.repoRoot, '/tmp/repo');
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.productionOnly, true);
});

runTest('report-rl-compression は圧縮率を実byteから算出する', () => {
    const stats = analyzeBuffer(Buffer.from('weight,'.repeat(4096)));
    assert.ok(stats.rawBytes > 10000);
    assert.ok(stats.gzipBytes < stats.rawBytes);
    assert.ok(stats.brotliBytes < stats.rawBytes);
    assert.strictEqual(stats.gzipRatio, stats.gzipBytes / stats.rawBytes);
    assert.strictEqual(stats.brotliRatio, stats.brotliBytes / stats.rawBytes);
});

runTest('report-rl-compression はrepository外pathを拒否する', () => {
    assert.throws(() => resolveArtifact('/tmp/repo', '../secret.json'), /outside repository/);
});

runTest('report-rl-compression はproduction集計とMarkdownを生成する', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-compression-'));
    try {
        const modelDir = path.join(repoRoot, 'models');
        fs.mkdirSync(modelDir, { recursive: true });
        fs.writeFileSync(path.join(modelDir, 'active.json'), JSON.stringify({ weights: Array(1000).fill(0.125) }));
        fs.writeFileSync(path.join(modelDir, 'candidate.json'), JSON.stringify({ weights: Array(500).fill(-0.25) }));
        const report = buildCompressionReport({
            repoRoot,
            catalog: [
                { id: 'active', label: 'Active', path: 'models/active.json', productionActive: true },
                { id: 'candidate', label: 'Candidate', path: 'models/candidate.json', productionActive: false },
            ],
        });
        assert.strictEqual(report.models.length, 2);
        assert.strictEqual(report.productionTotals.rawBytes, report.models[0].rawBytes);
        assert.strictEqual(report.totals.rawBytes, report.models[0].rawBytes + report.models[1].rawBytes);
        assert.ok(report.productionTotals.brotliBytes < report.productionTotals.rawBytes);
        const markdown = renderMarkdown(report);
        assert.ok(markdown.includes('# RL Model Compression Report'));
        assert.ok(markdown.includes('Production total'));
        assert.ok(markdown.includes('does not quantize'));
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});
