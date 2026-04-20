const assert = require('assert');
const { runTest } = require('./helpers/test-utils');

const {
    validateRegistry,
    bestEvalGames,
    modelTopCards,
    modelStyleKey,
    topCardOverlap,
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

runTest('validateRegistry は active model の評価ゲーム数不足を警告する', () => {
    const result = validateRegistry({
        evaluationPolicy: {
            minimumAdoptionGamesPerOpponent: 50,
            primaryAdoptionGamesPerOpponent: 100,
        },
        models: [
            { id: 'a', status: 'candidate', path: 'a.json', style: { label: 'style-a' }, evals: [{ gamesPerOpponent: 20 }] },
        ],
        portfolioPolicy: { recommendedActiveModels: [{ id: 'a', role: 'adopted-2p-main' }] },
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.warnings.some(warning => warning.includes('評価ゲーム数が少なすぎます')));
    assert.ok(result.warnings.some(warning => warning.includes('main 採用')));
});

runTest('validateRegistry は recommended model の style 重複を警告する', () => {
    const result = validateRegistry({
        models: [
            { id: 'a', status: 'candidate', path: 'a.json', style: { label: 'same' }, evals: [{ gamesPerOpponent: 100 }] },
            { id: 'b', status: 'candidate', path: 'b.json', style: { label: 'same' }, evals: [{ gamesPerOpponent: 100 }] },
        ],
        portfolioPolicy: { recommendedActiveModels: [{ id: 'a' }, { id: 'b' }] },
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.warnings.some(warning => warning.includes('style が a と重複')));
});

runTest('validateRegistry は active model の topCards 類似を警告する', () => {
    const result = validateRegistry({
        diversityPolicy: { topCardOverlapWarning: 4 },
        models: [
            {
                id: 'a',
                status: 'candidate',
                path: 'a.json',
                style: { label: 'a', topCardsVsStrong: ['a', 'b', 'c', 'd', 'e'] },
                evals: [{ gamesPerOpponent: 100 }],
            },
            {
                id: 'b',
                status: 'candidate',
                path: 'b.json',
                style: { label: 'b', topCardsVsStrong: ['a', 'b', 'c', 'd', 'x'] },
                evals: [{ gamesPerOpponent: 100 }],
            },
        ],
        portfolioPolicy: { recommendedActiveModels: [] },
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.warnings.some(warning => warning.includes('topCards が 4/5 重複')));
});

runTest('validateRegistry helper は評価数と style key を返す', () => {
    const model = {
        style: { label: 'label-a', topCardsVsStrong: ['a', 'b'] },
        evals: [{ gamesPerOpponent: 20 }, { gamesPerLineup: 100 }],
    };
    assert.strictEqual(bestEvalGames(model), 100);
    assert.deepStrictEqual(modelTopCards(model), ['a', 'b']);
    assert.strictEqual(modelStyleKey(model), 'label-a');
    assert.strictEqual(topCardOverlap(
        { style: { topCardsVsStrong: ['a', 'b', 'c'] } },
        { style: { topCardsVsStrong: ['b', 'c', 'd'] } }
    ), 2);
});

runTest('validateRegistry は現行registryを通せる', () => {
    const registry = require('../models/rl_model/registry.json');
    const result = validateRegistry(registry);
    assert.strictEqual(result.ok, true);
});
