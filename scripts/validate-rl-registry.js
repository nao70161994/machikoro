const fs = require('fs');
const path = require('path');

function loadRegistry(registryPath) {
    return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

function latestEval(model) {
    const evals = Array.isArray(model.evals) ? model.evals : [];
    if (evals.length === 0) return null;
    return evals
        .slice()
        .sort((a, b) => (
            String(b.date || '').localeCompare(String(a.date || '')) ||
            ((b.gamesPerOpponent || 0) - (a.gamesPerOpponent || 0))
        ))[0];
}

function bestEvalGames(model) {
    const evals = Array.isArray(model.evals) ? model.evals : [];
    return evals.reduce((best, entry) => Math.max(best, entry.gamesPerOpponent || entry.gamesPerLineup || 0), 0);
}

function modelTopCards(model) {
    const style = model.style || {};
    const cards = style.topCardsVsStrong || style.topCards || [];
    return Array.isArray(cards) ? cards.filter(Boolean).map(String) : [];
}

function modelStyleKey(model) {
    const style = model.style || {};
    if (style.diversityKey) return String(style.diversityKey);
    if (style.label) return String(style.label);
    return modelTopCards(model).slice(0, 3).join('/');
}

function topCardOverlap(a, b, limit = 5) {
    const aCards = new Set(modelTopCards(a).slice(0, limit));
    const bCards = modelTopCards(b).slice(0, limit);
    return bCards.filter(card => aCards.has(card)).length;
}

function validateRegistry(registry, options = {}) {
    const errors = [];
    const warnings = [];
    const models = Array.isArray(registry.models) ? registry.models : [];
    const ids = new Set();
    const repoRoot = options.repoRoot || path.join(__dirname, '..');
    const evaluationPolicy = registry.evaluationPolicy || {};
    const minimumGames = evaluationPolicy.minimumAdoptionGamesPerOpponent || 0;
    const primaryMinimumGames = evaluationPolicy.primaryAdoptionGamesPerOpponent || 0;
    const diversityPolicy = registry.diversityPolicy || {};
    const topCardOverlapWarning = diversityPolicy.topCardOverlapWarning || 0;

    for (const model of models) {
        if (!model || !model.id) {
            errors.push('models に id のない項目があります');
            continue;
        }
        if (ids.has(model.id)) errors.push(`model id が重複しています: ${model.id}`);
        ids.add(model.id);
        if (!model.path) warnings.push(`${model.id}: path がありません`);
        else if (options.checkPaths && !fs.existsSync(path.join(repoRoot, model.path))) {
            warnings.push(`${model.id}: path が存在しません: ${model.path}`);
        }
        if (!Array.isArray(model.evals) || model.evals.length === 0) {
            if (model.status !== 'rejected' || !(model.style && model.style.summary)) {
                warnings.push(`${model.id}: evals が未記録です`);
            }
        } else if ((model.status === 'adopted' || model.status === 'candidate') && minimumGames > 0 && bestEvalGames(model) < minimumGames) {
            warnings.push(`${model.id}: adopted/candidate の評価ゲーム数が少なすぎます (${bestEvalGames(model)} < ${minimumGames})`);
        }
        if ((model.status === 'adopted' || model.status === 'candidate') && (!model.style || !model.style.label)) {
            warnings.push(`${model.id}: active model に style.label がありません`);
        }
    }

    const recommended = (((registry.portfolioPolicy || {}).recommendedActiveModels) || []);
    const recommendedStyleKeys = new Map();
    for (const entry of recommended) {
        if (!entry || !entry.id) {
            errors.push('recommendedActiveModels に id のない項目があります');
        } else if (!ids.has(entry.id)) {
            errors.push(`recommendedActiveModels が未登録 model id を参照しています: ${entry.id}`);
        } else {
            const model = models.find(model => model.id === entry.id);
            const games = model ? bestEvalGames(model) : 0;
            if (entry.role && String(entry.role).includes('main') && primaryMinimumGames > 0 && games < primaryMinimumGames) {
                warnings.push(`${entry.id}: main 採用には評価ゲーム数が少なすぎます (${games} < ${primaryMinimumGames})`);
            }
            const key = model ? modelStyleKey(model) : '';
            if (key) {
                if (recommendedStyleKeys.has(key)) {
                    warnings.push(`${entry.id}: recommendedActiveModels の style が ${recommendedStyleKeys.get(key)} と重複しています (${key})`);
                } else {
                    recommendedStyleKeys.set(key, entry.id);
                }
            }
        }
    }

    const activeStatuses = new Set(['adopted', 'candidate']);
    const activeCount = models.filter(model => activeStatuses.has(model.status)).length;
    if (activeCount === 0) warnings.push('adopted/candidate モデルがありません');
    if (topCardOverlapWarning > 0) {
        const activeModels = models.filter(model => activeStatuses.has(model.status));
        for (let i = 0; i < activeModels.length; i++) {
            for (let j = i + 1; j < activeModels.length; j++) {
                const overlap = topCardOverlap(activeModels[i], activeModels[j]);
                if (overlap >= topCardOverlapWarning) {
                    warnings.push(`${activeModels[i].id} と ${activeModels[j].id}: topCards が ${overlap}/5 重複しています`);
                }
            }
        }
    }

    return { ok: errors.length === 0, errors, warnings };
}

function printValidation(result) {
    if (result.ok) console.log('RL registry validation: ok');
    for (const warning of result.warnings) console.log(`warning: ${warning}`);
    for (const error of result.errors) console.error(`error: ${error}`);
}

if (require.main === module) {
    const registryPath = process.argv[2] || path.join(__dirname, '..', 'models', 'rl_model', 'registry.json');
    const result = validateRegistry(loadRegistry(registryPath), {
        repoRoot: path.join(__dirname, '..'),
        checkPaths: process.argv.includes('--check-paths'),
    });
    printValidation(result);
    if (!result.ok) process.exit(1);
}

module.exports = {
    loadRegistry,
    latestEval,
    bestEvalGames,
    modelTopCards,
    modelStyleKey,
    topCardOverlap,
    validateRegistry,
    printValidation,
};
