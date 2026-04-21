const path = require('path');
const fs = require('fs');

const {
    loadRegistry,
    latestEval,
    modelStyleKey,
    summarizeEvalCoverage,
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

function round(value, digits = 4) {
    if (!Number.isFinite(value)) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}

function latest2pEval(model) {
    const evals = Array.isArray(model.evals) ? model.evals : [];
    const only2p = evals.filter(entry => entry && entry.type === 'js' && entry.gamesPerOpponent && entry.opponents);
    if (only2p.length === 0) return null;
    only2p.sort((left, right) => {
        const leftGames = left.gamesPerOpponent || 0;
        const rightGames = right.gamesPerOpponent || 0;
        if (rightGames !== leftGames) return rightGames - leftGames;
        return String(right.date || '').localeCompare(String(left.date || ''));
    });
    return only2p[0];
}

function opponentRate(evalEntry, opponent) {
    const entry = (((evalEntry || {}).opponents) || {})[opponent];
    return Number.isFinite(entry && entry.winRate) ? entry.winRate : null;
}

function weighted2pScore(evalEntry) {
    const weak = opponentRate(evalEntry, 'weak');
    const normal = opponentRate(evalEntry, 'normal');
    const strong = opponentRate(evalEntry, 'strong');
    if (![weak, normal, strong].every(Number.isFinite)) return null;
    return round((weak + normal * 2 + strong * 3) / 6, 6);
}

function passRate(evalEntry) {
    const strong = (((evalEntry || {}).opponents) || {}).strong;
    if (strong && Number.isFinite(strong.passRate)) return round(strong.passRate, 4);
    const normal = (((evalEntry || {}).opponents) || {}).normal;
    if (normal && Number.isFinite(normal.passRate)) return round(normal.passRate, 4);
    const weak = (((evalEntry || {}).opponents) || {}).weak;
    if (weak && Number.isFinite(weak.passRate)) return round(weak.passRate, 4);
    return null;
}

function buildCandidateEntry(model, recommendedIds) {
    const evalEntry = latest2pEval(model);
    const coverage = summarizeEvalCoverage(model);
    return {
        id: model.id,
        status: model.status || '',
        style: modelStyleKey(model),
        recommended: recommendedIds.has(model.id),
        coverage,
        evalGames: evalEntry ? (evalEntry.gamesPerOpponent || 0) : 0,
        weak: evalEntry ? opponentRate(evalEntry, 'weak') : null,
        normal: evalEntry ? opponentRate(evalEntry, 'normal') : null,
        strong: evalEntry ? opponentRate(evalEntry, 'strong') : null,
        score: evalEntry ? weighted2pScore(evalEntry) : null,
        passRate: evalEntry ? passRate(evalEntry) : null,
    };
}

function compareEntries(left, right) {
    const leftScore = Number.isFinite(left.score) ? left.score : -1;
    const rightScore = Number.isFinite(right.score) ? right.score : -1;
    if (rightScore !== leftScore) return rightScore - leftScore;
    if (right.evalGames !== left.evalGames) return right.evalGames - left.evalGames;
    return String(left.id).localeCompare(String(right.id));
}

function buildAdoptionReview(registry) {
    const models = Array.isArray(registry.models) ? registry.models : [];
    const recommended = ((((registry.portfolioPolicy || {}).recommendedActiveModels) || []));
    const recommendedIds = new Set(recommended.map(entry => entry.id));
    const mainRecommended = recommended.find(entry => entry.role === 'adopted-2p-main') || null;
    const minimumGames = (((registry.evaluationPolicy || {}).minimumAdoptionGamesPerOpponent) || 50);

    const candidates = models
        .filter(model => {
            const coverage = summarizeEvalCoverage(model);
            return coverage.has2pOpponents;
        })
        .map(model => buildCandidateEntry(model, recommendedIds))
        .sort(compareEntries);

    const eligible = candidates.filter(entry => entry.evalGames >= minimumGames);
    const currentMain = mainRecommended ? candidates.find(entry => entry.id === mainRecommended.id) || null : null;
    const challenger = eligible.find(entry => !currentMain || entry.id !== currentMain.id) || null;

    const actions = [];
    if (!currentMain) {
        actions.push({
            type: 'missing-main',
            message: 'adopted-2p-main が未設定です',
        });
    } else if (currentMain.evalGames < minimumGames) {
        actions.push({
            type: 'reevaluate-main',
            message: `${currentMain.id} は adopted-2p-main ですが 2人評価が不足しています (${currentMain.evalGames} < ${minimumGames})`,
            command: `sh scripts/rl/eval-run.sh ${currentMain.id} ${minimumGames} weak,normal,strong`,
        });
    }
    if (challenger && currentMain) {
        const delta = round((challenger.score || 0) - (currentMain.score || 0), 4);
        if (delta > 0) {
            actions.push({
                type: 'compare-main-vs-challenger',
                message: `${challenger.id} が current main ${currentMain.id} を weighted score で上回っています (+${delta})`,
                command: `npm run eval-rl-models -- --models ${currentMain.id},${challenger.id} --games 100 --markdown models/rl_model/${currentMain.id}-${challenger.id}.md`,
            });
        }
    }

    const styleBuckets = new Map();
    for (const entry of eligible) {
        const style = entry.style || 'unknown';
        if (!styleBuckets.has(style)) styleBuckets.set(style, []);
        styleBuckets.get(style).push(entry);
    }
    for (const [style, entries] of styleBuckets.entries()) {
        if (entries.length < 2) continue;
        const sorted = [...entries].sort(compareEntries);
        const left = sorted[0];
        const right = sorted[1];
        actions.push({
            type: 'same-style-review',
            message: `${style} 系で ${left.id} と ${right.id} が近い候補です。片方を archive 候補として比較してください`,
            command: `npm run eval-rl-models -- --models ${left.id},${right.id} --games 100 --markdown models/rl_model/${left.id}-${right.id}.md`,
        });
    }

    return {
        updatedAt: registry.updatedAt || '',
        minimumGames,
        currentMain: currentMain ? currentMain.id : '',
        candidates,
        actions,
    };
}

function renderText(review) {
    const lines = [
        `RL adoption review updatedAt=${review.updatedAt || 'n/a'}`,
        `minimumGames=${review.minimumGames}`,
        `currentMain=${review.currentMain || 'missing'}`,
        'candidates:',
    ];
    for (const entry of review.candidates) {
        lines.push(
            `- ${entry.id} score=${entry.score == null ? 'n/a' : entry.score} games=${entry.evalGames} ` +
            `weak=${entry.weak == null ? 'n/a' : entry.weak} normal=${entry.normal == null ? 'n/a' : entry.normal} ` +
            `strong=${entry.strong == null ? 'n/a' : entry.strong} pass=${entry.passRate == null ? 'n/a' : entry.passRate} ` +
            `style=${entry.style || 'n/a'}${entry.recommended ? ' [recommended]' : ''}`
        );
    }
    if (review.actions.length > 0) {
        lines.push('actions:');
        for (const action of review.actions) {
            lines.push(`- ${action.type}: ${action.message}`);
            if (action.command) lines.push(`  cmd: ${action.command}`);
        }
    }
    return lines.join('\n') + '\n';
}

function renderMarkdown(review) {
    const lines = [
        '# RL Adoption Review',
        '',
        `- updatedAt: ${review.updatedAt || 'n/a'}`,
        `- minimumGames: ${review.minimumGames}`,
        `- currentMain: ${review.currentMain || 'missing'}`,
        '',
        '## Candidates',
        '',
        '| id | score | games | weak | normal | strong | pass | style | recommended |',
        '|---|---:|---:|---:|---:|---:|---:|---|---|',
    ];
    for (const entry of review.candidates) {
        lines.push(
            `| \`${entry.id}\` | ${entry.score == null ? 'n/a' : entry.score} | ${entry.evalGames} | ` +
            `${entry.weak == null ? 'n/a' : entry.weak} | ${entry.normal == null ? 'n/a' : entry.normal} | ` +
            `${entry.strong == null ? 'n/a' : entry.strong} | ${entry.passRate == null ? 'n/a' : entry.passRate} | ` +
            `${entry.style || 'n/a'} | ${entry.recommended ? 'yes' : ''} |`
        );
    }
    if (review.actions.length > 0) {
        lines.push('', '## Actions');
        for (const action of review.actions) {
            lines.push(`- ${action.type}: ${action.message}`);
            if (action.command) lines.push(`  - cmd: \`${action.command}\``);
        }
    }
    return lines.join('\n') + '\n';
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const review = buildAdoptionReview(loadRegistry(args.registryPath));
    let output;
    if (args.format === 'json') output = JSON.stringify(review, null, 2) + '\n';
    else if (args.format === 'markdown' || args.format === 'md') output = renderMarkdown(review);
    else output = renderText(review);
    if (args.output) fs.writeFileSync(args.output, output, 'utf8');
    else process.stdout.write(output);
}

module.exports = {
    parseArgs,
    latest2pEval,
    weighted2pScore,
    buildCandidateEntry,
    buildAdoptionReview,
    renderText,
    renderMarkdown,
};
