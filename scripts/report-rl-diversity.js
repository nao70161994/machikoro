const path = require('path');
const fs = require('fs');

const {
    loadRegistry,
    modelStyleKey,
    modelTopCards,
    topCardOverlap,
    bestEvalGames,
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

function weightedScore(model) {
    const evals = Array.isArray(model.evals) ? model.evals : [];
    const js2p = evals
        .filter(entry => entry && entry.type === 'js' && entry.gamesPerOpponent && entry.opponents)
        .sort((a, b) => (b.gamesPerOpponent || 0) - (a.gamesPerOpponent || 0))[0];
    if (!js2p) return null;
    const weak = js2p.opponents.weak && js2p.opponents.weak.winRate;
    const normal = js2p.opponents.normal && js2p.opponents.normal.winRate;
    const strong = js2p.opponents.strong && js2p.opponents.strong.winRate;
    if (![weak, normal, strong].every(Number.isFinite)) return null;
    return Math.round(((weak + normal * 2 + strong * 3) / 6) * 1000000) / 1000000;
}

function buildDiversityReport(registry) {
    const models = (registry.models || []).filter(model => model.status === 'adopted' || model.status === 'candidate');
    const styleGroups = new Map();
    for (const model of models) {
        const key = modelStyleKey(model) || 'unknown';
        if (!styleGroups.has(key)) styleGroups.set(key, []);
        styleGroups.get(key).push({
            id: model.id,
            status: model.status || '',
            score: weightedScore(model),
            games: bestEvalGames(model),
            topCards: modelTopCards(model).slice(0, 5),
        });
    }

    const overlapPairs = [];
    for (let i = 0; i < models.length; i++) {
        for (let j = i + 1; j < models.length; j++) {
            const overlap = topCardOverlap(models[i], models[j]);
            if (overlap <= 0) continue;
            overlapPairs.push({
                left: models[i].id,
                right: models[j].id,
                overlap,
                sameStyle: modelStyleKey(models[i]) === modelStyleKey(models[j]),
                compareCommand: `npm run eval-rl-models -- --models ${models[i].id},${models[j].id} --games 100 --markdown models/rl_model/${models[i].id}-${models[j].id}.md`,
            });
        }
    }
    overlapPairs.sort((a, b) => b.overlap - a.overlap || a.left.localeCompare(b.left) || a.right.localeCompare(b.right));

    return {
        updatedAt: registry.updatedAt || '',
        styleGroups: [...styleGroups.entries()].map(([style, entries]) => ({
            style,
            entries: entries.sort((a, b) => (b.score || -1) - (a.score || -1) || b.games - a.games || a.id.localeCompare(b.id)),
        })).sort((a, b) => b.entries.length - a.entries.length || a.style.localeCompare(b.style)),
        overlapPairs,
    };
}

function renderText(report) {
    const lines = [`RL diversity report updatedAt=${report.updatedAt || 'n/a'}`];
    lines.push('styleGroups:');
    for (const group of report.styleGroups) {
        lines.push(`- ${group.style} (${group.entries.length})`);
        for (const entry of group.entries) {
            lines.push(`  - ${entry.id} score=${entry.score == null ? 'n/a' : entry.score} games=${entry.games} status=${entry.status}`);
        }
    }
    if (report.overlapPairs.length > 0) {
        lines.push('overlapPairs:');
        for (const pair of report.overlapPairs.slice(0, 20)) {
            lines.push(`- ${pair.left} / ${pair.right}: overlap=${pair.overlap} sameStyle=${pair.sameStyle ? 'yes' : 'no'}`);
            lines.push(`  cmd: ${pair.compareCommand}`);
        }
    }
    return lines.join('\n') + '\n';
}

function renderMarkdown(report) {
    const lines = ['# RL Diversity Report', '', `- updatedAt: ${report.updatedAt || 'n/a'}`, '', '## Style Groups', ''];
    for (const group of report.styleGroups) {
        lines.push(`### ${group.style}`);
        lines.push('');
        lines.push('| id | status | score | games |');
        lines.push('|---|---|---:|---:|');
        for (const entry of group.entries) {
            lines.push(`| \`${entry.id}\` | ${entry.status} | ${entry.score == null ? 'n/a' : entry.score} | ${entry.games} |`);
        }
        lines.push('');
    }
    if (report.overlapPairs.length > 0) {
        lines.push('## Overlap Pairs', '', '| left | right | overlap | sameStyle | compare |', '|---|---|---:|---|---|');
        for (const pair of report.overlapPairs) {
            lines.push(`| \`${pair.left}\` | \`${pair.right}\` | ${pair.overlap} | ${pair.sameStyle ? 'yes' : 'no'} | \`${pair.compareCommand}\` |`);
        }
    }
    return lines.join('\n') + '\n';
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const report = buildDiversityReport(loadRegistry(args.registryPath));
    let output;
    if (args.format === 'json') output = JSON.stringify(report, null, 2) + '\n';
    else if (args.format === 'markdown' || args.format === 'md') output = renderMarkdown(report);
    else output = renderText(report);
    if (args.output) fs.writeFileSync(args.output, output, 'utf8');
    else process.stdout.write(output);
}

module.exports = {
    parseArgs,
    weightedScore,
    buildDiversityReport,
    renderText,
    renderMarkdown,
};
