const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RLModelCatalog = require('../js/rlModelCatalog.js');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
    const args = {
        repoRoot: ROOT,
        format: 'markdown',
        productionOnly: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--repo-root') args.repoRoot = argv[++i] || args.repoRoot;
        else if (arg === '--format') args.format = argv[++i] || args.format;
        else if (arg === '--production-only') args.productionOnly = true;
    }
    return args;
}

function ratio(compressedBytes, rawBytes) {
    return rawBytes > 0 ? compressedBytes / rawBytes : 0;
}

function analyzeBuffer(buffer) {
    const rawBytes = buffer.length;
    const gzipBytes = zlib.gzipSync(buffer, { level: 9 }).length;
    const brotliBytes = zlib.brotliCompressSync(buffer, {
        params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
            [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
        },
    }).length;
    return {
        rawBytes,
        gzipBytes,
        brotliBytes,
        gzipRatio: ratio(gzipBytes, rawBytes),
        brotliRatio: ratio(brotliBytes, rawBytes),
    };
}

function resolveArtifact(repoRoot, relativePath) {
    const root = path.resolve(repoRoot);
    const absolutePath = path.resolve(root, String(relativePath || ''));
    if (!relativePath || !absolutePath.startsWith(root + path.sep)) {
        throw new Error('artifact path is outside repository: ' + relativePath);
    }
    return absolutePath;
}

function sumRows(rows) {
    const totals = rows.reduce((acc, row) => {
        acc.rawBytes += row.rawBytes;
        acc.gzipBytes += row.gzipBytes;
        acc.brotliBytes += row.brotliBytes;
        return acc;
    }, { rawBytes: 0, gzipBytes: 0, brotliBytes: 0 });
    return {
        ...totals,
        gzipRatio: ratio(totals.gzipBytes, totals.rawBytes),
        brotliRatio: ratio(totals.brotliBytes, totals.rawBytes),
    };
}

function buildCompressionReport(options = {}) {
    const repoRoot = options.repoRoot || ROOT;
    const productionOnly = options.productionOnly === true;
    const catalog = options.catalog || RLModelCatalog.models;
    const selected = catalog.filter(entry => !productionOnly || entry.productionActive === true);
    const models = selected.map(entry => {
        const buffer = fs.readFileSync(resolveArtifact(repoRoot, entry.path));
        return {
            id: entry.id,
            label: entry.label || entry.id,
            path: entry.path,
            productionActive: entry.productionActive === true,
            ...analyzeBuffer(buffer),
        };
    });
    const productionModels = models.filter(model => model.productionActive);
    return {
        schemaVersion: 1,
        generatedAt: options.generatedAt || '',
        method: {
            gzipLevel: 9,
            brotliQuality: 9,
            brotliMode: 'text',
        },
        models,
        totals: sumRows(models),
        productionTotals: sumRows(productionModels),
        recommendation: 'JSON schema and runtime remain unchanged. Prefer HTTP Brotli with gzip fallback; keep raw artifact SHA-256 verification after decompression.',
    };
}

function formatBytes(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MiB';
}

function formatPercent(value) {
    return (value * 100).toFixed(1) + '%';
}

function renderMarkdown(report) {
    const lines = [
        '# RL Model Compression Report',
        '',
        '- generatedAt: ' + (report.generatedAt || 'n/a'),
        '- method: gzip level ' + report.method.gzipLevel + ', Brotli quality ' + report.method.brotliQuality + ' (' + report.method.brotliMode + ')',
        '- recommendation: ' + report.recommendation,
        '',
        '| Model | Active | Raw | gzip | Brotli | gzip/raw | Brotli/raw |',
        '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ];
    for (const model of report.models) {
        lines.push('| ' + model.label + ' | ' + (model.productionActive ? 'yes' : 'no') +
            ' | ' + formatBytes(model.rawBytes) +
            ' | ' + formatBytes(model.gzipBytes) +
            ' | ' + formatBytes(model.brotliBytes) +
            ' | ' + formatPercent(model.gzipRatio) +
            ' | ' + formatPercent(model.brotliRatio) + ' |');
    }
    lines.push(
        '',
        '## Production total',
        '',
        '- raw: ' + formatBytes(report.productionTotals.rawBytes),
        '- gzip: ' + formatBytes(report.productionTotals.gzipBytes) + ' (' + formatPercent(report.productionTotals.gzipRatio) + ')',
        '- Brotli: ' + formatBytes(report.productionTotals.brotliBytes) + ' (' + formatPercent(report.productionTotals.brotliRatio) + ')',
        '',
        'This report evaluates transport/precompression only. It does not quantize weights or change model/runtime semantics.',
        ''
    );
    return lines.join('\n');
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const report = buildCompressionReport(args);
    process.stdout.write(args.format === 'json'
        ? JSON.stringify(report, null, 2) + '\n'
        : renderMarkdown(report));
}

module.exports = {
    parseArgs,
    ratio,
    analyzeBuffer,
    resolveArtifact,
    sumRows,
    buildCompressionReport,
    renderMarkdown,
};
