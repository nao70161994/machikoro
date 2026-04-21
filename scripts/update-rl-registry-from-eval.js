const fs = require('fs');
const path = require('path');

const { renderRegistryEvals, mergeRegistryEvals } = require('./render-rl-registry-evals.js');
const { buildArtifacts, writeArtifacts } = require('./refresh-rl-ops-reports.js');

function parseArgs(argv) {
    const args = {
        input: '',
        registryPath: path.join(__dirname, '..', 'models', 'rl_model', 'registry.json'),
        outputDir: path.join(__dirname, '..', 'models', 'rl_model', 'reports'),
        date: new Date().toISOString().slice(0, 10),
        output: '',
        skipRefresh: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--input') args.input = argv[++i] || '';
        else if (arg === '--registry') args.registryPath = argv[++i] || args.registryPath;
        else if (arg === '--output-dir') args.outputDir = argv[++i] || args.outputDir;
        else if (arg === '--date') args.date = argv[++i] || args.date;
        else if (arg === '--output') args.output = argv[++i] || '';
        else if (arg === '--skip-refresh') args.skipRefresh = true;
    }
    if (!args.input) throw new Error('--input is required');
    return args;
}

function updateRegistryFromEval(args) {
    const results = JSON.parse(fs.readFileSync(args.input, 'utf8'));
    const rendered = renderRegistryEvals(results, args.date);
    const registry = JSON.parse(fs.readFileSync(args.registryPath, 'utf8'));
    const merged = mergeRegistryEvals(registry, rendered);
    fs.writeFileSync(args.registryPath, JSON.stringify(merged.registry, null, 2) + '\n', 'utf8');

    let reportFiles = [];
    if (!args.skipRefresh) {
        const artifacts = buildArtifacts(merged.registry);
        reportFiles = writeArtifacts(artifacts, args.outputDir);
    }

    const summary = {
        registryPath: args.registryPath,
        appended: merged.stats.appended,
        skippedDuplicates: merged.stats.skippedDuplicates,
        updatedScores: merged.stats.updatedScores,
        entries: rendered.map(entry => ({ id: entry.id, score: entry.score })),
        refreshedReports: reportFiles.map(filePath => path.basename(filePath)),
    };
    if (args.output) {
        fs.writeFileSync(args.output, JSON.stringify(summary, null, 2) + '\n', 'utf8');
    }
    return summary;
}

function renderSummary(summary) {
    const lines = [
        `registry updated: ${summary.registryPath}`,
        `appended=${summary.appended} skipped=${summary.skippedDuplicates} updatedScores=${summary.updatedScores}`,
    ];
    if (summary.entries.length > 0) {
        lines.push('entries:');
        for (const entry of summary.entries) {
            lines.push(`- ${entry.id} score=${entry.score == null ? 'n/a' : entry.score}`);
        }
    }
    if (summary.refreshedReports.length > 0) {
        lines.push('refreshedReports:');
        for (const name of summary.refreshedReports) lines.push(`- ${name}`);
    }
    return lines.join('\n') + '\n';
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const summary = updateRegistryFromEval(args);
    process.stdout.write(renderSummary(summary));
}

module.exports = {
    parseArgs,
    updateRegistryFromEval,
    renderSummary,
};
