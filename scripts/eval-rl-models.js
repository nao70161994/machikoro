const fs = require('fs');
const path = require('path');

const {
    evaluateRlVsJs,
    summarizeEvaluationEntry,
} = require('./eval-rl-vs-js.js');
const { loadRegistry } = require('./validate-rl-registry.js');

function parseList(value) {
    return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function parseLineups(value) {
    return String(value || '')
        .split(';')
        .map(part => part.split(',').map(item => item.trim()).filter(Boolean))
        .filter(lineup => lineup.includes('rl') && lineup.length >= 2);
}

function parseArgs(argv) {
    const args = {
        registryPath: path.join(__dirname, '..', 'models', 'rl_model', 'registry.json'),
        models: [],
        runLabels: [],
        games: 50,
        seed: 1,
        maxSteps: 5000,
        rank: 1,
        opponents: ['weak', 'normal', 'strong'],
        lineups: [],
        format: 'text',
        output: '',
        csv: '',
        markdown: '',
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--registry') args.registryPath = argv[++i] || args.registryPath;
        else if (arg === '--models') args.models = parseList(argv[++i]);
        else if (arg === '--run-labels') args.runLabels = parseList(argv[++i]);
        else if (arg === '--games') args.games = parseInt(argv[++i] || String(args.games), 10);
        else if (arg === '--seed') args.seed = parseInt(argv[++i] || String(args.seed), 10);
        else if (arg === '--max-steps') args.maxSteps = parseInt(argv[++i] || String(args.maxSteps), 10);
        else if (arg === '--rank') args.rank = parseInt(argv[++i] || String(args.rank), 10);
        else if (arg === '--opponents') args.opponents = parseList(argv[++i]);
        else if (arg === '--lineups') args.lineups = parseLineups(argv[++i]);
        else if (arg === '--format') args.format = argv[++i] || args.format;
        else if (arg === '--output') args.output = argv[++i] || '';
        else if (arg === '--csv') args.csv = argv[++i] || '';
        else if (arg === '--markdown') args.markdown = argv[++i] || '';
    }
    return args;
}

function defaultRegistryModelIds(registry) {
    const recommended = (((registry.portfolioPolicy || {}).recommendedActiveModels) || [])
        .map(entry => entry && entry.id)
        .filter(Boolean);
    if (recommended.length > 0) return recommended;
    return (registry.models || [])
        .filter(model => model.status === 'adopted' || model.status === 'candidate')
        .map(model => model.id);
}

function browserPathForRunLabel(runLabel, rank = 1) {
    const fileName = rank === 1 ? 'best_model.browser.json' : `best_model.top${rank}.browser.json`;
    return path.join('models', 'rl_model', 'runs', runLabel, fileName);
}

function resolveModelSpecs(args, registry) {
    const registryModels = new Map((registry.models || []).map(model => [model.id, model]));
    const ids = args.models.length > 0 ? args.models : defaultRegistryModelIds(registry);
    const specs = [];

    for (const id of ids) {
        const model = registryModels.get(id);
        if (!model) throw new Error(`registry に model id がありません: ${id}`);
        specs.push({
            id: model.id,
            label: model.style && model.style.label ? model.style.label : model.id,
            path: model.path,
            source: 'registry',
            status: model.status || '',
        });
    }

    for (const runLabel of args.runLabels) {
        specs.push({
            id: args.rank === 1 ? runLabel : `${runLabel}-top${args.rank}`,
            label: runLabel,
            path: browserPathForRunLabel(runLabel, args.rank),
            source: 'run',
            status: '',
        });
    }

    return specs;
}

function scoreSummaries(summaries) {
    const weights = { weak: 1, normal: 2, strong: 3, expert: 2 };
    let weightedTotal = 0;
    let weightSum = 0;
    for (const summary of summaries) {
        const weight = weights[summary.opponent] || 1;
        weightedTotal += summary.rlWinRate * weight;
        weightSum += weight;
    }
    return weightSum > 0 ? weightedTotal / weightSum : 0;
}

function summarizeModel(spec, entries) {
    const summaries = entries.map(summarizeEvaluationEntry);
    return {
        id: spec.id,
        label: spec.label,
        source: spec.source,
        status: spec.status,
        path: spec.path,
        score: scoreSummaries(summaries),
        summaries,
    };
}

function evaluateModelSpecs(specs, args, evaluator = evaluateRlVsJs) {
    return specs.map((spec, index) => summarizeModel(spec, evaluator({
        modelPath: spec.path,
        games: args.games,
        seed: args.seed + index * args.games * 10,
        maxSteps: args.maxSteps,
        opponents: args.opponents,
        lineups: args.lineups,
    }))).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function renderText(results) {
    const lines = [];
    for (const [index, result] of results.entries()) {
        lines.push(`${index + 1}. ${result.id} score=${(result.score * 100).toFixed(1)}%`);
        for (const summary of result.summaries) {
            lines.push(
                `   ${summary.opponent}: win=${(summary.rlWinRate * 100).toFixed(1)}% ` +
                `games=${summary.games} avgTurns=${summary.averageTurns.toFixed(1)} pass=` +
                `${summary.rlBuildStats ? (summary.rlBuildStats.passRate * 100).toFixed(1) : 'n/a'}%`
            );
            if (summary.rlBusinessStats && summary.rlBusinessStats.total > 0) {
                lines.push(
                    `      business=${summary.rlBusinessStats.total} skip=` +
                    `${(summary.rlBusinessStats.skipRate * 100).toFixed(1)}%`
                );
            }
        }
    }
    return lines.join('\n');
}

function renderCsv(results) {
    const rows = ['rank,id,score,opponent,games,winRate,avgTurns,passRate,businessTotal,businessSkipRate,businessGive,businessTake,businessExchanges,topCards,topLandmarks'];
    for (const [index, result] of results.entries()) {
        for (const summary of result.summaries) {
            const build = summary.rlBuildStats;
            const business = summary.rlBusinessStats;
            const businessGive = business ? business.topGiveCards.map(entry => `${entry.name}x${entry.count}`).join('|') : '';
            const businessTake = business ? business.topTakeCards.map(entry => `${entry.name}x${entry.count}`).join('|') : '';
            const businessExchanges = business ? business.topExchanges.map(entry => `${entry.name}x${entry.count}`).join('|') : '';
            const topCards = build ? build.topCards.map(entry => `${entry.name}x${entry.count}`).join('|') : '';
            const topLandmarks = build ? build.topLandmarks.map(entry => `${entry.name}x${entry.count}`).join('|') : '';
            rows.push([
                index + 1,
                result.id,
                result.score.toFixed(6),
                summary.opponent,
                summary.games,
                summary.rlWinRate.toFixed(6),
                summary.averageTurns.toFixed(3),
                build ? build.passRate.toFixed(6) : '',
                business ? business.total : '',
                business ? business.skipRate.toFixed(6) : '',
                `"${businessGive.replace(/"/g, '""')}"`,
                `"${businessTake.replace(/"/g, '""')}"`,
                `"${businessExchanges.replace(/"/g, '""')}"`,
                `"${topCards.replace(/"/g, '""')}"`,
                `"${topLandmarks.replace(/"/g, '""')}"`,
            ].join(','));
        }
    }
    return rows.join('\n') + '\n';
}

function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function renderMarkdown(results) {
    const lines = [
        '| rank | id | score | opponents | pass | avgTurns |',
        '|---:|---|---:|---|---|---|',
    ];
    for (const [index, result] of results.entries()) {
        const opponents = result.summaries.map(summary => (
            `${summary.opponent} ${formatPercent(summary.rlWinRate)}`
        )).join('<br>');
        const pass = result.summaries.map(summary => (
            `${summary.opponent} ` +
            `${summary.rlBuildStats ? formatPercent(summary.rlBuildStats.passRate) : 'n/a'}`
        )).join('<br>');
        const avgTurns = result.summaries.map(summary => (
            `${summary.opponent} ${summary.averageTurns.toFixed(1)}`
        )).join('<br>');
        lines.push([
            index + 1,
            `\`${result.id}\``,
            formatPercent(result.score),
            opponents,
            pass,
            avgTurns,
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
    return lines.join('\n') + '\n';
}

function writeOutputs(results, args) {
    if (args.output) fs.writeFileSync(args.output, JSON.stringify(results, null, 2), 'utf8');
    if (args.csv) fs.writeFileSync(args.csv, renderCsv(results), 'utf8');
    if (args.markdown) fs.writeFileSync(args.markdown, renderMarkdown(results), 'utf8');
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const registry = loadRegistry(args.registryPath);
    const results = evaluateModelSpecs(resolveModelSpecs(args, registry), args);
    writeOutputs(results, args);
    if (args.format === 'json') console.log(JSON.stringify(results, null, 2));
    else console.log(renderText(results));
}

module.exports = {
    parseArgs,
    parseLineups,
    defaultRegistryModelIds,
    browserPathForRunLabel,
    resolveModelSpecs,
    scoreSummaries,
    summarizeModel,
    evaluateModelSpecs,
    renderText,
    renderCsv,
    renderMarkdown,
    writeOutputs,
};
