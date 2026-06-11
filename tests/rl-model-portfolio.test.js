const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadScript, runTest } = require('./helpers/test-utils');

function loadPortfolio(overrides = {}) {
    const context = Object.assign({ console, Math: Object.create(Math) }, overrides);
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

runTest('RL model portfolio: runtime load はXHRを一度だけ使いRLCPUを返す', () => {
    const requests = [];
    class FakeXHR {
        open(method, url, async) { this.method = method; this.url = url; this.async = async; }
        send() {
            requests.push({ method: this.method, url: this.url, async: this.async });
            this.status = 200;
            this.responseText = JSON.stringify({ stateDim: 145, actionSchema: 'action-flat-v1', layers: [] });
        }
    }
    class FakeRLCPU {
        constructor(modelData) { this.modelData = modelData; }
    }
    const { RLModelPortfolio } = loadPortfolio({ XMLHttpRequest: FakeXHR, RLCPU: FakeRLCPU });

    const first = RLModelPortfolio.createRandomCpu({ playerCount: 2, rlModelId: 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3' });
    const second = RLModelPortfolio.createRandomCpu({ playerCount: 2, rlModelId: 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3' });

    assert.strictEqual(requests.length, 1);
    assert.deepStrictEqual(requests[0], {
        method: 'GET',
        url: 'models/rl_model/portfolio/seed71-top3.browser.json',
        async: false,
    });
    assert.strictEqual(first.difficulty, 'rl');
    assert.strictEqual(first.modelId, 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3');
    assert.strictEqual(first.modelLabel, 'RL（農業・ワイナリー）');
    assert.strictEqual(first.modelData.stateDim, 145);
    assert.strictEqual(second.modelId, first.modelId);
});


runTest('RL model portfolio: iPhone Safari は未preloadモデルで同期XHRを使わない', () => {
    const requests = [];
    class FakeXHR {
        open(method, url, async) { requests.push({ method, url, async }); }
        send() { throw new Error('sync XHR should not run'); }
    }
    class FakeRLCPU {
        constructor(modelData) { this.modelData = modelData; }
    }
    const { RLModelPortfolio } = loadPortfolio({
        XMLHttpRequest: FakeXHR,
        RLCPU: FakeRLCPU,
        navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1' },
    });

    assert.strictEqual(RLModelPortfolio.shouldAvoidSynchronousModelLoad(), true);
    assert.throws(
        () => RLModelPortfolio.createRandomCpu({ playerCount: 2, rlModelId: 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3' }),
        /not preloaded/
    );
    assert.deepStrictEqual(requests, []);
});

runTest('RL model portfolio: preload済みモデルはiPhone SafariでもRLCPUを返す', async () => {
    const requests = [];
    class FakeXHR {
        open(method, url, async) { requests.push({ method, url, async }); }
        send() { throw new Error('sync XHR should not run'); }
    }
    class FakeRLCPU {
        constructor(modelData) { this.modelData = modelData; }
    }
    const fetchCalls = [];
    const { RLModelPortfolio } = loadPortfolio({
        XMLHttpRequest: FakeXHR,
        RLCPU: FakeRLCPU,
        navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1' },
        fetch(url, options) {
            fetchCalls.push({ url, options });
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ stateDim: 145, actionSchema: 'action-flat-v1', layers: [] }),
            });
        },
    });

    await RLModelPortfolio.preloadModelData(RLModelPortfolio.modelById('self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3', 2));
    const cpu = RLModelPortfolio.createRandomCpu({ playerCount: 2, rlModelId: 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3' });

    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(fetchCalls[0].url, 'models/rl_model/portfolio/seed71-top3.browser.json');
    assert.deepStrictEqual(requests, []);
    assert.strictEqual(cpu.difficulty, 'rl');
    assert.strictEqual(cpu.modelData.stateDim, 145);
});


runTest('RL model portfolio: entries は外部から重みを書き換えられない', () => {
    const { RLModelPortfolio } = loadPortfolio();
    const multiplayerModel = RLModelPortfolio.models.find(model => model.id === 'self-only-4p-h256-lr1e5-5000-seed103');
    assert.strictEqual(Object.isFrozen(multiplayerModel), true);
    multiplayerModel.weight = 0;
    assert.strictEqual(multiplayerModel.weight, 3);
    assert.strictEqual(RLModelPortfolio.selectRandomModel(4).id, 'self-only-4p-h256-lr1e5-5000-seed103');
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
        const stateDim = data.stateDim || data.state_dim;
        assert.ok(stateDim, `${model.id} has no state dimension`);
        if (portfolioEntry.maxPlayers && portfolioEntry.maxPlayers <= 2) {
            assert.strictEqual(stateDim, 145, `${model.id} two-player model must use 145-dim state`);
        }
        if (portfolioEntry.minPlayers && portfolioEntry.minPlayers >= 3) {
            assert.strictEqual(stateDim, 353, `${model.id} multiplayer model must use 353-dim state`);
        }
        assert.ok(data.stateSchema, `${model.id} has no explicit state schema`);
        assert.ok(['state-2p-v1', 'state-mp-v1'].includes(data.stateSchema), `${model.id} has unknown state schema`);
        assert.strictEqual(data.actionSchema, 'action-flat-v1', `${model.id} has unsupported action schema`);
        assert.ok(data.layers, `${model.id} has no exported layers`);
    }
});
