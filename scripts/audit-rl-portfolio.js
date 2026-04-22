const path = require('path');

const {
    loadRegistry,
    validateRegistry,
    summarizeEvalCoverage,
    modelStyleKey,
    summarizeTargetDiagnostics,
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

function formatTargetDiagnostics(diagnostics) {
    if (!diagnostics) return 'n/a';
    const formatRate = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '-';
    return `p=${formatRate(diagnostics.pendingRate)} u=${formatRate(diagnostics.updateRate)} `
        + `(tv=${formatRate(diagnostics.tvRate)} bc=${formatRate(diagnostics.bcRate)} mv=${formatRate(diagnostics.moverRate)})`;
}

function buildAudit(registry, options = {}) {
    const validation = validateRegistry(registry);
    const models = Array.isArray(registry.models) ? registry.models : [];
    const recommended = (((registry.portfolioPolicy || {}).recommendedActiveModels) || []).map(entry => {
        const model = models.find(item => item.id === entry.id);
        const coverage = model ? summarizeEvalCoverage(model) : null;
        const targetDiagnostics = model ? summarizeTargetDiagnostics(model, options) : null;
        return {
            id: entry.id,
            role: entry.role || '',
            reason: entry.reason || '',
            status: model ? (model.status || '') : 'missing',
            style: model ? modelStyleKey(model) : '',
            portfolioPath: coverage ? coverage.portfolioPath : false,
            best2pGames: coverage ? coverage.best2pGames : 0,
            has2pOpponents: coverage ? coverage.has2pOpponents : false,
            best3pGames: coverage ? coverage.best3pGames : 0,
            has3pLineups: coverage ? coverage.has3pLineups : false,
            best4pGames: coverage ? coverage.best4pGames : 0,
            has4pLineups: coverage ? coverage.has4pLineups : false,
            targetDiagnostics,
        };
    });
    return {
        updatedAt: registry.updatedAt || '',
        warnings: validation.warnings,
        errors: validation.errors,
        recommended,
    };
}

function renderText(audit) {
    const lines = [
        `RL portfolio audit updatedAt=${audit.updatedAt || 'n/a'}`,
    ];
    if (audit.errors.length > 0) {
        lines.push('errors:');
        for (const error of audit.errors) lines.push(`- ${error}`);
    }
    if (audit.warnings.length > 0) {
        lines.push('warnings:');
        for (const warning of audit.warnings) lines.push(`- ${warning}`);
    }
    lines.push('recommended:');
    for (const item of audit.recommended) {
        lines.push(
            `- ${item.id} [${item.role}] status=${item.status} style=${item.style || 'n/a'} ` +
            `portfolio=${item.portfolioPath ? 'yes' : 'no'} ` +
            `2p=${item.has2pOpponents ? item.best2pGames : 'missing'} ` +
            `3p=${item.has3pLineups ? item.best3pGames : 'missing'} ` +
            `4p=${item.has4pLineups ? item.best4pGames : 'missing'} ` +
            `target=${formatTargetDiagnostics(item.targetDiagnostics)}`
        );
    }
    return lines.join('\n') + '\n';
}

function renderMarkdown(audit) {
    const lines = [
        '# RL Portfolio Audit',
        '',
        `- updatedAt: ${audit.updatedAt || 'n/a'}`,
    ];
    if (audit.errors.length > 0) {
        lines.push('', '## Errors');
        for (const error of audit.errors) lines.push(`- ${error}`);
    }
    if (audit.warnings.length > 0) {
        lines.push('', '## Warnings');
        for (const warning of audit.warnings) lines.push(`- ${warning}`);
    }
    lines.push(
        '',
        '## Recommended Models',
        '',
        '| id | role | status | style | portfolio | 2p | 3p | 4p | target |',
        '|---|---|---|---|---|---:|---:|---:|---|'
    );
    for (const item of audit.recommended) {
        lines.push(
            `| \`${item.id}\` | ${item.role} | ${item.status} | ${item.style || 'n/a'} | ` +
            `${item.portfolioPath ? 'yes' : 'no'} | ` +
            `${item.has2pOpponents ? item.best2pGames : 'missing'} | ` +
            `${item.has3pLineups ? item.best3pGames : 'missing'} | ` +
            `${item.has4pLineups ? item.best4pGames : 'missing'} | ` +
            `${formatTargetDiagnostics(item.targetDiagnostics)} |`
        );
    }
    return lines.join('\n') + '\n';
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const audit = buildAudit(loadRegistry(args.registryPath));
    if (args.format === 'json') console.log(JSON.stringify(audit, null, 2));
    else if (args.format === 'markdown' || args.format === 'md') process.stdout.write(renderMarkdown(audit));
    else process.stdout.write(renderText(audit));
    if (audit.errors.length > 0) process.exit(1);
}

module.exports = {
    parseArgs,
    buildAudit,
    formatTargetDiagnostics,
    renderText,
    renderMarkdown,
};
