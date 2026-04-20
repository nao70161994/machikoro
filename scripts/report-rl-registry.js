const path = require('path');

const {
    loadRegistry,
    validateRegistry,
    bestEvalGames,
    latestEval,
    modelStyleKey,
} = require('./validate-rl-registry.js');

function parseArgs(argv) {
    const args = {
        registryPath: path.join(__dirname, '..', 'models', 'rl_model', 'registry.json'),
        format: 'text',
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--registry') args.registryPath = argv[++i] || args.registryPath;
        else if (arg === '--format') args.format = argv[++i] || args.format;
    }
    return args;
}

function modelEvalLabel(model) {
    const entry = latestEval(model);
    if (!entry) return 'no-eval';
    if (entry.gamesPerOpponent) return `${entry.gamesPerOpponent} games/opponent`;
    if (entry.gamesPerLineup) return `${entry.gamesPerLineup} games/lineup`;
    return 'eval-recorded';
}

function buildRegistryReport(registry) {
    const models = Array.isArray(registry.models) ? registry.models : [];
    const validation = validateRegistry(registry);
    const statusCounts = {};
    for (const model of models) {
        const status = model.status || 'unknown';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
    return {
        updatedAt: registry.updatedAt || '',
        statusCounts,
        warnings: validation.warnings,
        errors: validation.errors,
        models: models.map(model => ({
            id: model.id,
            status: model.status || '',
            style: modelStyleKey(model),
            bestEvalGames: bestEvalGames(model),
            latestEval: modelEvalLabel(model),
        })),
    };
}

function renderText(report) {
    const lines = [
        `RL registry report updatedAt=${report.updatedAt || 'n/a'}`,
        `statuses=${Object.entries(report.statusCounts).map(([key, value]) => `${key}:${value}`).join(', ')}`,
    ];
    if (report.warnings.length > 0) {
        lines.push('warnings:');
        for (const warning of report.warnings) lines.push(`- ${warning}`);
    }
    if (report.errors.length > 0) {
        lines.push('errors:');
        for (const error of report.errors) lines.push(`- ${error}`);
    }
    lines.push('models:');
    for (const model of report.models) {
        lines.push(`- ${model.id} [${model.status}] eval=${model.latestEval} style=${model.style || 'n/a'}`);
    }
    return lines.join('\n') + '\n';
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const report = buildRegistryReport(loadRegistry(args.registryPath));
    if (args.format === 'json') console.log(JSON.stringify(report, null, 2));
    else process.stdout.write(renderText(report));
    if (report.errors.length > 0) process.exit(1);
}

module.exports = {
    parseArgs,
    modelEvalLabel,
    buildRegistryReport,
    renderText,
};
