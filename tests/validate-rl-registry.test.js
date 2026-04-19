const assert = require('assert');
const { runTest } = require('./helpers/test-utils');

const {
    validateRegistry,
} = require('../scripts/validate-rl-registry.js');

runTest('validateRegistry は推奨モデルが台帳に存在することを検証する', () => {
    const result = validateRegistry({
        models: [
            { id: 'a', status: 'candidate', path: 'a.json', evals: [{}] },
        ],
        portfolioPolicy: {
            recommendedActiveModels: [
                { id: 'missing' },
            ],
        },
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(error => error.includes('missing')));
});

runTest('validateRegistry は重複idをエラーにする', () => {
    const result = validateRegistry({
        models: [
            { id: 'a', status: 'candidate', path: 'a.json', evals: [{}] },
            { id: 'a', status: 'archive', path: 'b.json', evals: [{}] },
        ],
        portfolioPolicy: { recommendedActiveModels: [{ id: 'a' }] },
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(error => error.includes('重複')));
});

runTest('validateRegistry は現行registryを通せる', () => {
    const registry = require('../models/rl_model/registry.json');
    const result = validateRegistry(registry);
    assert.strictEqual(result.ok, true);
});
