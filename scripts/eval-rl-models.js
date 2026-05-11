const fs = require('fs');
const path = require('path');

const {
    evaluateRlVsJs,
    assertRlModelLineupCompatible,
    summarizeEvaluationEntry,
} = require('./eval-rl-vs-js.js');
const { loadRegistry } = require('./validate-rl-registry.js');

function parseList(value) {
    return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function parseNumberList(value) {
    return parseList(value)
        .map(item => parseInt(item, 10))
        .filter(value => Number.isInteger(value) && value >= 1);
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
        modelPaths: [],
        games: 50,
        seed: 1,
        maxSteps: 5000,
        rank: 1,
        runRanks: [],
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
        else if (arg === '--model-paths') args.modelPaths = parseList(argv[++i]);
        else if (arg === '--games') args.games = parseInt(argv[++i] || String(args.games), 10);
        else if (arg === '--seed') args.seed = parseInt(argv[++i] || String(args.seed), 10);
        else if (arg === '--max-steps') args.maxSteps = parseInt(argv[++i] || String(args.maxSteps), 10);
        else if (arg === '--rank') args.rank = parseInt(argv[++i] || String(args.rank), 10);
        else if (arg === '--run-ranks') args.runRanks = parseNumberList(argv[++i]);
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
    const hasExplicitTargets = args.models.length > 0 || args.runLabels.length > 0 || (args.modelPaths || []).length > 0;
    const ids = args.models.length > 0
        ? args.models
        : (hasExplicitTargets ? [] : defaultRegistryModelIds(registry));
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

    const runRanks = args.runRanks && args.runRanks.length > 0 ? args.runRanks : [args.rank];
    for (const runLabel of args.runLabels) {
        for (const rank of runRanks) {
            specs.push({
                id: rank === 1 ? runLabel : `${runLabel}-top${rank}`,
                label: rank === 1 ? runLabel : `${runLabel} top${rank}`,
                path: browserPathForRunLabel(runLabel, rank),
                source: 'run',
                status: '',
            });
        }
    }

    for (const modelPath of args.modelPaths || []) {
        const parsed = path.parse(modelPath);
        const id = parsed.name || modelPath;
        specs.push({
            id,
            label: id,
            path: modelPath,
            source: 'path',
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

function collectBuildCounts(summaries, key) {
    const counts = new Map();
    for (const summary of summaries) {
        const entries = summary.rlBuildStats && Array.isArray(summary.rlBuildStats[key])
            ? summary.rlBuildStats[key]
            : [];
        for (const entry of entries) {
            if (!entry || !entry.name) continue;
            counts.set(entry.name, (counts.get(entry.name) || 0) + (entry.count || 0));
        }
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count }));
}

function buildSignature(summaries) {
    const cards = collectBuildCounts(summaries, 'topCards').slice(0, 5);
    const landmarks = collectBuildCounts(summaries, 'topLandmarks').slice(0, 5);
    return {
        cards,
        landmarks,
        cardKey: cards.map(entry => entry.name).join('/'),
        landmarkKey: landmarks.map(entry => entry.name).join('/'),
    };
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
        buildSignature: buildSignature(summaries),
        summaries,
    };
}

function evaluateModelSpecs(specs, args, evaluator = evaluateRlVsJs) {
    assertRlModelLineupCompatible(null, args.lineups, 'eval-rl-models');
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
    const gate = evaluationGate(results);
    lines.push(`gate=${gate.name} minGames=${gate.minGames === null ? 'n/a' : gate.minGames}` +
        (gate.smokeOnly ? ' note=smokeOnly; not for adoption' : ''));
    for (const [index, result] of results.entries()) {
        lines.push(`${index + 1}. ${result.id} score=${(result.score * 100).toFixed(1)}%`);
        if (result.buildSignature && result.buildSignature.cardKey) {
            lines.push(`   style=${result.buildSignature.cardKey}`);
        }
        for (const summary of result.summaries) {
            const lineup = Array.isArray(summary.lineup) ? summary.lineup : [];
            const seat = lineup.length > 2 && Array.isArray(summary.rlSeatWinRatesByIndex)
                ? ` seat(${summary.rlSeatWinRatesByIndex.map((rate, index) => `${index}=${(rate * 100).toFixed(1)}%`).join(',')})`
                : '';
            const players = lineup.length > 0 ? ` players=${lineup.length}` : '';
            lines.push(
                `   ${summary.opponent}: win=${(summary.rlWinRate * 100).toFixed(1)}% ` +
                `games=${summary.games}${players}${seat} avgTurns=${summary.averageTurns.toFixed(1)} pass=` +
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
    const rows = ['rank,id,score,buildSignatureCards,buildSignatureLandmarks,opponent,games,winRate,avgTurns,passRate,businessTotal,businessSkipRate,businessGive,businessTake,businessExchanges,topCards,topLandmarks'];
    for (const [index, result] of results.entries()) {
        const signatureCards = result.buildSignature
            ? result.buildSignature.cards.map(entry => `${entry.name}x${entry.count}`).join('|')
            : '';
        const signatureLandmarks = result.buildSignature
            ? result.buildSignature.landmarks.map(entry => `${entry.name}x${entry.count}`).join('|')
            : '';
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
                `"${signatureCards.replace(/"/g, '""')}"`,
                `"${signatureLandmarks.replace(/"/g, '""')}"`,
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

function evaluationGate(results, minGamesPerLineup = 50) {
    const games = [];
    for (const result of results || []) {
        for (const summary of result.summaries || []) {
            if (Number.isFinite(summary.games)) games.push(summary.games);
        }
    }
    const minGames = games.length > 0 ? Math.min(...games) : null;
    const smokeOnly = minGames === null || minGames < minGamesPerLineup;
    return {
        minGames,
        smokeOnly,
        name: smokeOnly ? 'smokeOnly' : 'adoptionCandidate',
    };
}

function renderMarkdown(results) {
    const gate = evaluationGate(results);
    const lines = [
        `- gate: ${gate.name}`,
        `- minGames: ${gate.minGames === null ? 'n/a' : gate.minGames}`,
        gate.smokeOnly ? '- note: smokeOnly results are not adoption candidates.' : '- note: meets minimum game count for adoption review.',
        '',
        '| rank | id | score | style | opponents | pass | avgTurns |',
        '|---:|---|---:|---|---|---|---|',
    ];
    for (const [index, result] of results.entries()) {
        const style = result.buildSignature && result.buildSignature.cardKey
            ? result.buildSignature.cardKey
            : '';
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
            style,
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
    parseNumberList,
    assertRlModelLineupCompatible,
    defaultRegistryModelIds,
    browserPathForRunLabel,
    resolveModelSpecs,
    scoreSummaries,
    buildSignature,
    summarizeModel,
    evaluateModelSpecs,
    evaluationGate,
    renderText,
    renderCsv,
    renderMarkdown,
    writeOutputs,
};
