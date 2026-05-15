const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadScript, runTest } = require('./helpers/test-utils');

function loadPortfolio() {
    const context = { console, Math: Object.create(Math) };
    vm.createContext(context);
    loadScript(context, 'js/RLModelPortfolio.js');
    vm.runInContext(
        'this.RLModelPortfolio = RLModelPortfolio; this.RL_MODEL_PORTFOLIO = RL_MODEL_PORTFOLIO;',
        context
    );
    return context;
}

function repoPath(relativePath) {
    return path.join(__dirname, '..', relativePath);
}

runTest('RL model portfolio: 配布モデルの参照先ファイルが存在する', () => {
    const { RL_MODEL_PORTFOLIO } = loadPortfolio();
    assert.ok(RL_MODEL_PORTFOLIO.length > 0);
    for (const model of RL_MODEL_PORTFOLIO) {
        assert.ok(fs.existsSync(repoPath(model.path)), `${model.id} path missing: ${model.path}`);
    }
});

runTest('RL model portfolio: 2人戦では2人用候補だけを選ぶ', () => {
    const { RLModelPortfolio } = loadPortfolio();
    const models = RLModelPortfolio.eligibleModels(2);
    assert.ok(models.length > 0);
    assert.ok(models.every(model => !model.minPlayers || model.minPlayers <= 2));
    assert.ok(models.every(model => !model.maxPlayers || model.maxPlayers >= 2));
    assert.ok(models.every(model => model.id !== 'self-only-4p-h256-lr1e5-5000-seed103'));
});

runTest('RL model portfolio: modelById は人数に合う指定モデルを返す', () => {
    const { RLModelPortfolio } = loadPortfolio();
    const twoPlayerModel = RLModelPortfolio.modelById('self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3', 2);
    const wrongPlayerCount = RLModelPortfolio.modelById('self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3', 5);
    assert.ok(twoPlayerModel);
    assert.strictEqual(twoPlayerModel.id, 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3');
    assert.strictEqual(wrongPlayerCount, null);
});

runTest('RL model portfolio: 明示model idが不正ならランダムへfallbackしない', () => {
    const { RLModelPortfolio } = loadPortfolio();
    assert.throws(() => RLModelPortfolio.createRandomCpu({ playerCount: 2, rlModelId: 'unknown-model' }), /not available/);
});

runTest('RL model portfolio: weight 0 はランダム選択候補に戻さない', () => {
    const { RLModelPortfolio } = loadPortfolio();
    const multiplayerModel = RLModelPortfolio.models.find(model => model.id === 'self-only-4p-h256-lr1e5-5000-seed103');
    multiplayerModel.weight = 0;
    assert.strictEqual(RLModelPortfolio.selectRandomModel(4), null);
});

runTest('RL model portfolio: 3人以上では採用済み多人数モデルを選ぶ', () => {
    const { RLModelPortfolio } = loadPortfolio();
    for (const playerCount of [3, 4, 5, 10]) {
        const models = RLModelPortfolio.eligibleModels(playerCount);
        assert.strictEqual(models.length, 1);
        assert.strictEqual(models[0].id, 'self-only-4p-h256-lr1e5-5000-seed103');
        assert.strictEqual(models[0].label, 'RL（多人数・上位3）');
    }
});

runTest('RL model portfolio: adopted モデルは portfolio に存在し配布JSONも読める', () => {
    const { RL_MODEL_PORTFOLIO } = loadPortfolio();
    const registry = JSON.parse(fs.readFileSync(repoPath('models/rl_model/registry.json'), 'utf8'));
    const portfolioById = new Map(RL_MODEL_PORTFOLIO.map(model => [model.id, model]));
    const adopted = registry.models.filter(model => model.status === 'adopted');
    assert.ok(adopted.length > 0);
    for (const model of adopted) {
        const portfolioEntry = portfolioById.get(model.id);
        assert.ok(portfolioEntry, `${model.id} is adopted but missing from RL_MODEL_PORTFOLIO`);
        assert.strictEqual(portfolioEntry.path, model.path);
        const data = JSON.parse(fs.readFileSync(repoPath(portfolioEntry.path), 'utf8'));
        assert.ok(data.stateDim || data.state_dim, `${model.id} has no state dimension`);
        assert.ok(data.layers, `${model.id} has no exported layers`);
    }
});
