const path = require('path');
const fs = require('fs');

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
        output: '',
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--registry') args.registryPath = argv[++i] || args.registryPath;
        else if (arg === '--format') args.format = argv[++i] || args.format;
        else if (arg === '--output') args.output = argv[++i] || '';
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
    const report = {
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
    report.actions = recommendedActions(report);
    return report;
}

function recommendedActions(report) {
    const actions = [];
    for (const warning of report.warnings) {
        if (warning.includes('評価ゲーム数が少なすぎます')) {
            actions.push({ type: 'reevaluate', warning });
        } else if (warning.includes('topCards')) {
            actions.push({ type: 'review-diversity', warning });
        } else if (warning.includes('evals が未記録')) {
            actions.push({ type: 'record-eval-or-rejection', warning });
        }
    }
    return actions;
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
    if (report.actions && report.actions.length > 0) {
        lines.push('actions:');
        for (const action of report.actions) lines.push(`- ${action.type}: ${action.warning}`);
    }
    lines.push('models:');
    for (const model of report.models) {
        lines.push(`- ${model.id} [${model.status}] eval=${model.latestEval} style=${model.style || 'n/a'}`);
    }
    return lines.join('\n') + '\n';
}

function renderMarkdown(report) {
    const lines = [
        `# RL Registry Report`,
        '',
        `- updatedAt: ${report.updatedAt || 'n/a'}`,
        `- statuses: ${Object.entries(report.statusCounts).map(([key, value]) => `${key}:${value}`).join(', ')}`,
    ];
    if (report.warnings.length > 0) {
        lines.push('', '## Warnings');
        for (const warning of report.warnings) lines.push(`- ${warning}`);
    }
    if (report.actions && report.actions.length > 0) {
        lines.push('', '## Actions');
        for (const action of report.actions) lines.push(`- ${action.type}: ${action.warning}`);
    }
    if (report.errors.length > 0) {
        lines.push('', '## Errors');
        for (const error of report.errors) lines.push(`- ${error}`);
    }
    lines.push(
        '',
        '## Models',
        '',
        '| id | status | eval | style |',
        '|---|---|---|---|'
    );
    for (const model of report.models) {
        lines.push(`| \`${model.id}\` | ${model.status} | ${model.latestEval} | ${model.style || 'n/a'} |`);
    }
    return lines.join('\n') + '\n';
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const report = buildRegistryReport(loadRegistry(args.registryPath));
    let output;
    if (args.format === 'json') output = JSON.stringify(report, null, 2) + '\n';
    else if (args.format === 'markdown' || args.format === 'md') output = renderMarkdown(report);
    else output = renderText(report);
    if (args.output) fs.writeFileSync(args.output, output, 'utf8');
    else process.stdout.write(output);
    if (report.errors.length > 0) process.exit(1);
}

module.exports = {
    parseArgs,
    modelEvalLabel,
    buildRegistryReport,
    recommendedActions,
    renderText,
    renderMarkdown,
};
