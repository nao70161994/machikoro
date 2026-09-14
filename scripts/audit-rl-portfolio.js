const path = require('path');
const RLModelCatalog = require('../js/rlModelCatalog.js');

const {
    loadRegistry,
    validateRegistry,
    summarizeEvalCoverage,
    modelStyleKey,
    summarizeTargetDiagnostics,
    evalGameCount,
    latestEval,
} = require('./validate-rl-registry.js');

function latestProductionEval(model, minimumGames) {
    const qualifying = (Array.isArray(model && model.evals) ? model.evals : [])
        .filter(evaluation => evalGameCount(evaluation) >= minimumGames);
    return latestEval(Object.assign({}, model, { evals: qualifying }));
}

function validateRuntimeCatalog(registry, options = {}) {
    const errors = [];
    const warnings = [];
    const models = Array.isArray(registry.models) ? registry.models : [];
    const catalog = options.catalog || RLModelCatalog.models;
    const maxAgeDays = Number(registry.evaluationPolicy &&
        registry.evaluationPolicy.maxProductionEvaluationAgeDays) || 0;
    const minimumGames = Math.max(1, Number(registry.evaluationPolicy &&
        registry.evaluationPolicy.minimumAdoptionGamesPerOpponent) || 50);
    const now = options.now instanceof Date ? options.now : new Date();
    for (const entry of catalog) {
        if (typeof entry.productionActive !== 'boolean') {
            errors.push(`${entry.id}: productionActive が明示されていません`);
            continue;
        }
        if (!entry.productionActive) continue;
        const registered = models.find(model => model.id === entry.id);
        if (!registered) {
            errors.push(`${entry.id}: production catalog が未登録modelを参照しています`);
            continue;
        }
        if (entry.registryStatus !== registered.status) {
            errors.push(`${entry.id}: catalog registryStatus=${entry.registryStatus || 'missing'} と registry status=${registered.status || 'missing'} が不一致です`);
        }
        if (registered.status !== 'adopted') {
            errors.push(`${entry.id}: production model は300戦昇格済みの adopted status が必要です`);
        }
        if (entry.path !== registered.path) {
            errors.push(`${entry.id}: catalog path と registry path が不一致です`);
        }
        const evaluation = latestProductionEval(registered, minimumGames);
        const evaluatedAt = evaluation && new Date(`${evaluation.date}T00:00:00Z`);
        if (!evaluation || !Number.isFinite(evaluatedAt.getTime())) {
            errors.push(`${entry.id}: production model の${minimumGames}戦以上の評価日がありません`);
        } else if (maxAgeDays > 0) {
            const ageDays = Math.floor((now.getTime() - evaluatedAt.getTime()) / 86400000);
            if (ageDays > maxAgeDays) {
                errors.push(`${entry.id}: production評価が古すぎます (${ageDays}日 > ${maxAgeDays}日)`);
            }
        }
    }
    return { errors, warnings };
}

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
    const runtimeCatalog = validateRuntimeCatalog(registry, options);
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
            best5pGames: coverage ? coverage.best5pGames : 0,
            has5pLineups: coverage ? coverage.has5pLineups : false,
            best10pGames: coverage ? coverage.best10pGames : 0,
            has10pLineups: coverage ? coverage.has10pLineups : false,
            targetDiagnostics,
        };
    });
    return {
        updatedAt: registry.updatedAt || '',
        warnings: validation.warnings.concat(runtimeCatalog.warnings),
        errors: validation.errors.concat(runtimeCatalog.errors),
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
            `5p=${item.has5pLineups ? item.best5pGames : 'missing'} ` +
            `10p=${item.has10pLineups ? item.best10pGames : 'missing'} ` +
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
        '| id | role | status | style | portfolio | 2p | 3p | 4p | 5p | 10p | target |',
        '|---|---|---|---|---|---:|---:|---:|---:|---:|---|'
    );
    for (const item of audit.recommended) {
        lines.push(
            `| \`${item.id}\` | ${item.role} | ${item.status} | ${item.style || 'n/a'} | ` +
            `${item.portfolioPath ? 'yes' : 'no'} | ` +
            `${item.has2pOpponents ? item.best2pGames : 'missing'} | ` +
            `${item.has3pLineups ? item.best3pGames : 'missing'} | ` +
            `${item.has4pLineups ? item.best4pGames : 'missing'} | ` +
            `${item.has5pLineups ? item.best5pGames : 'missing'} | ` +
            `${item.has10pLineups ? item.best10pGames : 'missing'} | ` +
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
    validateRuntimeCatalog,
    latestProductionEval,
};
