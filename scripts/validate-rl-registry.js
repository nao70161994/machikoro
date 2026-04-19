const fs = require('fs');
const path = require('path');

function loadRegistry(registryPath) {
    return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

function validateRegistry(registry, options = {}) {
    const errors = [];
    const warnings = [];
    const models = Array.isArray(registry.models) ? registry.models : [];
    const ids = new Set();
    const repoRoot = options.repoRoot || path.join(__dirname, '..');

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
            warnings.push(`${model.id}: evals が未記録です`);
        }
    }

    const recommended = (((registry.portfolioPolicy || {}).recommendedActiveModels) || []);
    for (const entry of recommended) {
        if (!entry || !entry.id) {
            errors.push('recommendedActiveModels に id のない項目があります');
        } else if (!ids.has(entry.id)) {
            errors.push(`recommendedActiveModels が未登録 model id を参照しています: ${entry.id}`);
        }
    }

    const activeStatuses = new Set(['adopted', 'candidate']);
    const activeCount = models.filter(model => activeStatuses.has(model.status)).length;
    if (activeCount === 0) warnings.push('adopted/candidate モデルがありません');

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
    validateRegistry,
    printValidation,
};
