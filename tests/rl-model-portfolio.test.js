const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { loadScript, runTest } = require('./helpers/test-utils');

function loadPortfolio(overrides = {}) {
    const context = Object.assign({ console, Math: Object.create(Math) }, overrides);
    if (!context.RLCPU) {
        context.RLCPU = class FakeRLCPU {
            constructor(modelData) { this.modelData = modelData; }
            static validateModelData(modelData) { return modelData; }
        };
    }
    vm.createContext(context);
    loadScript(context, 'js/rlModelCatalog.js');
    loadScript(context, 'js/RLModelPortfolio.js');
    vm.runInContext(
        'this.RLModelCatalog = RLModelCatalog; this.RLModelPortfolio = RLModelPortfolio; this.RL_MODEL_PORTFOLIO = RL_MODEL_PORTFOLIO;',
        context
    );
    return context;
}

function repoPath(relativePath) {
    return path.join(__dirname, '..', relativePath);
}

runTest('RL model portfolio: client runtimeは共有frozen catalogを正本にする', () => {
    const { RLModelCatalog, RLModelPortfolio, RL_MODEL_PORTFOLIO } = loadPortfolio();
    assert.strictEqual(RL_MODEL_PORTFOLIO, RLModelCatalog.models);
    assert.strictEqual(RLModelPortfolio.models, RLModelCatalog.models);
    assert.ok(Object.isFrozen(RLModelCatalog));
    assert.ok(Object.isFrozen(RLModelCatalog.models));
    assert.ok(Object.isFrozen(RLModelCatalog.modelIds));
    assert.ok(Object.isFrozen(RLModelCatalog.modelDigests));
    assert.ok(RLModelCatalog.models.every(Object.isFrozen));
    assert.deepStrictEqual(
        Array.from(RLModelCatalog.modelIds),
        Array.from(RLModelCatalog.models, model => model.id)
    );
});

runTest('RL model portfolio: 配布モデルの参照先ファイルが存在する', () => {
    const { RL_MODEL_PORTFOLIO } = loadPortfolio();
    assert.ok(RL_MODEL_PORTFOLIO.length > 0);
    for (const model of RL_MODEL_PORTFOLIO) {
        assert.ok(fs.existsSync(repoPath(model.path)), `${model.id} path missing: ${model.path}`);
        const body = fs.readFileSync(repoPath(model.path));
        assert.strictEqual(model.bytes, body.byteLength, `${model.id} byte size drift`);
        assert.strictEqual(
            model.sha256,
            require('crypto').createHash('sha256').update(body).digest('hex'),
            `${model.id} SHA-256 drift`
        );
    }
});

runTest('RL model portfolio: browser preloadは配布artifactのSHA-256を検証する', async () => {
    const modelBody = fs.readFileSync(repoPath('models/rl_model/portfolio/seed71-top3.browser.json'), 'utf8');
    const { RLModelPortfolio } = loadPortfolio({
        window: {},
        crypto: webcrypto,
        TextEncoder,
        fetch() {
            return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(modelBody) });
        },
    });
    const model = RLModelPortfolio.modelById('self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3', 2);
    await RLModelPortfolio.preloadModelData(model, { attempts: 1 });
    const diagnostics = RLModelPortfolio.modelDiagnostics(model);
    assert.strictEqual(diagnostics.verified, true);
    assert.strictEqual(diagnostics.loadedBytes, model.bytes);
    assert.strictEqual(diagnostics.actualSha256, model.sha256);
});

runTest('RL model portfolio: browser preloadは改変artifactをcacheへ入れない', async () => {
    const { RLModelPortfolio } = loadPortfolio({
        window: {},
        crypto: webcrypto,
        TextEncoder,
        fetch() {
            return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') });
        },
    });
    const model = RLModelPortfolio.modelById('self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3', 2);
    await assert.rejects(RLModelPortfolio.preloadModelData(model, { attempts: 1 }), /byte size mismatch/);
    assert.strictEqual(RLModelPortfolio.modelLoadState(model).status, 'failed');
});

runTest('RL model portfolio: 選択artifactの容量予算を診断する', () => {
    const { RLModelPortfolio } = loadPortfolio();
    const settings = [
        { type: 'cpu', difficulty: 'rl', rlModelId: 'self-only-4p-h256-lr1e5-5000-seed103' },
        { type: 'cpu', difficulty: 'rl', rlModelId: 'mp-mixed-34510-target-only-seed145-4p' },
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ];
    const budget = RLModelPortfolio.selectedMemoryBudget(4, settings);
    assert.deepStrictEqual(Array.from(budget.modelIds), [
        'self-only-4p-h256-lr1e5-5000-seed103',
        'mp-mixed-34510-target-only-seed145-4p',
    ]);
    assert.strictEqual(budget.artifactBytes, 24698429);
    assert.strictEqual(budget.withinBudget, true);
    assert.strictEqual(RLModelPortfolio.selectedMemoryBudget(4, settings, { limitBytes: 20000000 }).withinBudget, false);
});

runTest('RL model portfolio: 2人戦では2人用候補だけを選ぶ', () => {
    const { RLModelPortfolio } = loadPortfolio();
    const models = RLModelPortfolio.eligibleModels(2);
    assert.ok(models.length > 0);
    assert.ok(models.every(model => !model.minPlayers || model.minPlayers <= 2));
    assert.ok(models.every(model => !model.maxPlayers || model.maxPlayers >= 2));
    assert.ok(models.every(model => model.id !== 'self-only-4p-h256-lr1e5-5000-seed103'));
    assert.deepStrictEqual(
        Array.from(models, model => model.id),
        ['self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3']
    );
});

runTest('RL model portfolio: modelById は人数に合う指定モデルを返す', () => {
    const { RLModelPortfolio } = loadPortfolio();
    const twoPlayerModel = RLModelPortfolio.modelById('self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3', 2);
    const wrongPlayerCount = RLModelPortfolio.modelById('self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3', 5);
    assert.ok(twoPlayerModel);
    assert.strictEqual(twoPlayerModel.id, 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3');
    assert.strictEqual(wrongPlayerCount, null);
    assert.strictEqual(RLModelPortfolio.modelById('seed71', 2).id, twoPlayerModel.id);
    assert.strictEqual(RLModelPortfolio.assignModelIds([
        { type: 'cpu', difficulty: 'rl', rlModelId: 'seed71', rlModelSelection: 'manual' },
        { type: 'human', difficulty: 'normal' },
    ], 2)[0].rlModelId, twoPlayerModel.id);
    assert.strictEqual(RLModelPortfolio.assignModelIds([
        { type: 'cpu', difficulty: 'rl', rlModelId: 'seed71', rlModelSelection: 'manual' },
        { type: 'human', difficulty: 'normal' },
    ], 2)[0].rlModelSha256, twoPlayerModel.sha256);
});

runTest('RL model portfolio: 明示model idが不正ならランダムへfallbackしない', () => {
    const { RLModelPortfolio } = loadPortfolio();
    assert.throws(() => RLModelPortfolio.createRandomCpu({ playerCount: 2, rlModelId: 'unknown-model' }), /not available/);
});

runTest('RL model portfolio: model digest不一致をpreloadとCPU生成の前に拒否する', () => {
    const { RLModelPortfolio } = loadPortfolio();
    const model = RLModelPortfolio.eligibleModels(2)[0];
    const settings = [{
        type: 'cpu',
        difficulty: 'rl',
        rlModelId: model.id,
        rlModelSha256: '0'.repeat(64),
    }];
    assert.throws(() => RLModelPortfolio.selectedModels(2, settings), /digest mismatch/);
    assert.throws(() => RLModelPortfolio.createRandomCpu({
        playerCount: 2,
        rlModelId: model.id,
        rlModelSha256: '0'.repeat(64),
    }), /digest mismatch/);
});

runTest('RL model portfolio: 読込失敗時のfallbackはRL席だけをCPU（強）へ固定する', () => {
    const { RLModelPortfolio } = loadPortfolio();
    const result = RLModelPortfolio.safeFallbackSettings([
        { type: 'human', difficulty: 'normal', name: 'A' },
        {
            type: 'cpu', difficulty: 'rl', name: 'B',
            rlModelId: 'model-a', rlModelSha256: 'digest-a', rlModelSelection: 'manual',
        },
        { type: 'cpu', difficulty: 'expert', name: 'C' },
    ], 3);
    assert.deepStrictEqual(Array.from(result.settings, value => ({ ...value })), [
        { type: 'human', difficulty: 'normal', name: 'A' },
        { type: 'cpu', difficulty: 'strong', name: 'B' },
        { type: 'cpu', difficulty: 'expert', name: 'C' },
    ]);
    assert.deepStrictEqual(Array.from(result.replaced, value => ({ ...value })), [{
        playerIndex: 1,
        modelId: 'model-a',
        expectedSha256: 'digest-a',
    }]);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.settings));
});

runTest('RL model portfolio: 未preloadモデルでは同期XHRせずCPU生成を拒否する', () => {
    const requests = [];
    class FakeXHR {
        open(method, url, async) { requests.push({ method, url, async }); }
        send() { throw new Error('sync XHR should not run'); }
    }
    class FakeRLCPU {
        constructor(modelData) { this.modelData = modelData; }
    }
    const { RLModelPortfolio } = loadPortfolio({ XMLHttpRequest: FakeXHR, RLCPU: FakeRLCPU });

    assert.throws(
        () => RLModelPortfolio.createRandomCpu({ playerCount: 2, rlModelId: 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3' }),
        /not preloaded/
    );
    assert.deepStrictEqual(requests, []);
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

runTest('RL model portfolio: iPadOS desktop UA でも同期XHRを避ける', () => {
    const { RLModelPortfolio } = loadPortfolio({
        navigator: {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
            maxTouchPoints: 5,
        },
    });

    assert.strictEqual(RLModelPortfolio.shouldAvoidSynchronousModelLoad(), true);
});

runTest('RL model portfolio: preload は一時失敗をretryする', async () => {
    const fetchCalls = [];
    const { RLModelPortfolio } = loadPortfolio({
        fetch(url, options) {
            fetchCalls.push({ url, options });
            if (fetchCalls.length < 3) {
                return Promise.reject(new Error('temporary network failure'));
            }
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ stateDim: 145, actionSchema: 'action-flat-v1', layers: [] }),
            });
        },
    });

    await RLModelPortfolio.preloadModelData(
        RLModelPortfolio.modelById('self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3', 2),
        { attempts: 3, retryDelayMs: 0 }
    );

    assert.strictEqual(fetchCalls.length, 3);
});

runTest('RL model portfolio: 選択済みの一意モデルだけをpreloadする', async () => {
    const fetchCalls = [];
    const { RLModelPortfolio } = loadPortfolio({
        fetch(url) {
            fetchCalls.push(url);
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ stateDim: 145, layers: {} }),
            });
        },
    });
    const settings = RLModelPortfolio.assignModelIds([
        null,
        { type: 'cpu', difficulty: 'rl', rlModelId: 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3' },
        { type: 'cpu', difficulty: 'rl', rlModelId: 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3' },
    ], 2);

    const loaded = await RLModelPortfolio.preloadSelectedModels(2, settings, { attempts: 1 });
    assert.strictEqual(loaded.length, 1);
    assert.deepStrictEqual(fetchCalls, ['models/rl_model/portfolio/seed71-top3.browser.json']);
    assert.deepStrictEqual(
        Array.from(RLModelPortfolio.selectedModels(2, settings), model => model.id),
        ['self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3']
    );
    assert.strictEqual(RLModelPortfolio.selectedLoadState(2, settings).status, 'ready');
});

runTest('RL model portfolio: 複数artifactは検証bufferのピークを重ねず順番にpreloadする', async () => {
    const fetchCalls = [];
    const resolvers = [];
    const { RLModelPortfolio } = loadPortfolio({
        fetch(url) {
            fetchCalls.push(url);
            return new Promise(resolve => resolvers.push(() => resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ stateDim: 353, layers: {} }),
            })));
        },
    });
    const settings = [
        {
            type: 'cpu', difficulty: 'rl',
            rlModelId: 'self-only-4p-h256-lr1e5-5000-seed103',
        },
        {
            type: 'cpu', difficulty: 'rl',
            rlModelId: 'mp-mixed-34510-target-only-seed145-4p',
        },
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ];
    const pending = RLModelPortfolio.preloadSelectedModels(4, settings, { attempts: 1 });
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(fetchCalls.length, 1);
    resolvers.shift()();
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(fetchCalls.length, 2);
    resolvers.shift()();
    const loaded = await pending;
    assert.strictEqual(loaded.length, 2);
});

runTest('RL model portfolio: 人間に残った古いRL難易度は選択対象にしない', () => {
    const { RLModelPortfolio } = loadPortfolio();
    const assigned = RLModelPortfolio.assignModelIds([
        { type: 'human', difficulty: 'rl' },
        { type: 'cpu', difficulty: 'rl', rlModelId: 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3' },
    ], 2);
    assert.strictEqual(assigned[0].rlModelId, undefined);
    assert.deepStrictEqual(
        Array.from(RLModelPortfolio.selectedModels(2, assigned), model => model.id),
        ['self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3']
    );
});

runTest('RL model portfolio: 未割当RL CPUは採用済み候補だけを配る', () => {
    const deterministicMath = Object.create(Math);
    deterministicMath.random = () => 0;
    const { RLModelPortfolio } = loadPortfolio({ Math: deterministicMath });
    const assigned = RLModelPortfolio.assignModelIds([
        { type: 'cpu', difficulty: 'rl' },
        { type: 'cpu', difficulty: 'rl' },
    ], 2);
    assert.strictEqual(new Set(Array.from(assigned, setting => setting.rlModelId)).size, 1);
    assert.ok(assigned.every(setting => (
        setting.rlModelId === 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3'
    )));

    const withReserved = RLModelPortfolio.assignModelIds([
        { type: 'cpu', difficulty: 'rl' },
        { type: 'cpu', difficulty: 'rl', rlModelId: 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3' },
    ], 2);
    assert.strictEqual(withReserved[0].rlModelId, withReserved[1].rlModelId);
});

runTest('RL model portfolio: 非採用候補は自動選択せず古い保存の明示参照だけ維持する', () => {
    const { RLModelPortfolio } = loadPortfolio();
    const candidateId = 'self-only-both-h256-lr2e5-5000-seed69-rewardcap';
    assert.ok(RLModelPortfolio.modelById(candidateId, 2));
    assert.ok(!RLModelPortfolio.eligibleModels(2).some(model => model.id === candidateId));
    const assigned = RLModelPortfolio.assignModelIds([
        { type: 'cpu', difficulty: 'rl', rlModelId: candidateId },
        { type: 'human', difficulty: 'normal' },
    ], 2);
    assert.strictEqual(assigned[0].rlModelId, candidateId);
});

runTest('RL model portfolio: playerCount外の古い設定は割当・preload対象にしない', () => {
    const { RLModelPortfolio } = loadPortfolio();
    const assigned = RLModelPortfolio.assignModelIds([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl', rlModelId: 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3' },
        { type: 'cpu', difficulty: 'rl', rlModelId: 'self-only-4p-h256-lr1e5-5000-seed103' },
    ], 2);
    assert.strictEqual(assigned.length, 2);
    assert.deepStrictEqual(
        Array.from(RLModelPortfolio.selectedModels(2, assigned), model => model.id),
        ['self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3']
    );
});

runTest('RL model portfolio: preload検証失敗をready cacheへ入れない', async () => {
    class RejectingRLCPU {
        static validateModelData() { throw new Error('invalid finite values'); }
    }
    const { RLModelPortfolio } = loadPortfolio({
        RLCPU: RejectingRLCPU,
        fetch() {
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
        },
    });
    const model = RLModelPortfolio.modelById(
        'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3',
        2
    );
    await assert.rejects(
        RLModelPortfolio.preloadModelData(model, { attempts: 1 }),
        /invalid finite values/
    );
    assert.strictEqual(RLModelPortfolio.modelLoadState(model).status, 'failed');
    assert.throws(
        () => RLModelPortfolio.createRandomCpu({ playerCount: 2, rlModelId: model.id }),
        /not preloaded/
    );
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
    const testMath = Object.create(Math);
    testMath.random = () => 0;
    const { RLModelPortfolio } = loadPortfolio({ Math: testMath });
    const multiplayerModel = RLModelPortfolio.models.find(model => model.id === 'self-only-4p-h256-lr1e5-5000-seed103');
    assert.strictEqual(Object.isFrozen(multiplayerModel), true);
    multiplayerModel.weight = 0;
    assert.strictEqual(multiplayerModel.weight, 3);
    assert.strictEqual(RLModelPortfolio.selectRandomModel(4).id, 'self-only-4p-h256-lr1e5-5000-seed103');
});

runTest('RL model portfolio: 4人だけ専用強化候補を加え、他人数は汎用モデルだけを選ぶ', () => {
    const { RLModelPortfolio } = loadPortfolio();
    for (const playerCount of [3, 5, 10]) {
        const models = RLModelPortfolio.eligibleModels(playerCount);
        assert.strictEqual(models.length, 1);
        assert.strictEqual(models[0].id, 'self-only-4p-h256-lr1e5-5000-seed103');
        assert.strictEqual(models[0].label, 'RL（多人数・上位3）');
    }
    const fourPlayerModels = RLModelPortfolio.eligibleModels(4);
    assert.deepStrictEqual(
        Array.from(fourPlayerModels, model => model.id),
        [
            'self-only-4p-h256-lr1e5-5000-seed103',
            'mp-mixed-34510-target-only-seed145-4p',
        ]
    );
    assert.strictEqual(fourPlayerModels[1].label, 'RL（4人・目標判断強化）');
    assert.strictEqual(fourPlayerModels[1].weight, 1);
});

runTest('RL model portfolio: 4人の複数RL CPUには汎用・専用モデルを重複なく割り当てる', () => {
    const deterministicMath = Object.create(Math);
    deterministicMath.random = () => 0;
    const { RLModelPortfolio } = loadPortfolio({ Math: deterministicMath });
    const assigned = RLModelPortfolio.assignModelIds([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl' },
        { type: 'cpu', difficulty: 'rl' },
        { type: 'cpu', difficulty: 'strong' },
    ], 4);
    assert.deepStrictEqual(
        Array.from(assigned.slice(1, 3), setting => setting.rlModelId),
        [
            'self-only-4p-h256-lr1e5-5000-seed103',
            'mp-mixed-34510-target-only-seed145-4p',
        ]
    );
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

runTest('RL model portfolio: fetch不在ならfailed stateを返す', async () => {
    const { RLModelPortfolio } = loadPortfolio({ fetch: undefined });
    const model = RLModelPortfolio.modelById('self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3', 2);

    await assert.rejects(() => RLModelPortfolio.preloadModelData(model), /fetch is not available/);

    const state = RLModelPortfolio.modelLoadState(model);
    assert.strictEqual(state.status, 'failed');
    assert.ok(state.error.includes('fetch is not available'));
});

runTest('RL model portfolio: preload最終失敗はeligible stateをfailedにする', async () => {
    const { RLModelPortfolio } = loadPortfolio({
        fetch() { return Promise.reject(new Error('network down')); },
    });

    await assert.rejects(
        () => RLModelPortfolio.preloadEligibleModels(2, { attempts: 1, retryDelayMs: 0 }),
        /network down/
    );

    const state = RLModelPortfolio.eligibleLoadState(2);
    assert.strictEqual(state.status, 'failed');
    assert.ok(state.errors.some(error => error.includes('network down')));
});

runTest('RL model portfolio: page activation expires a Safari-suspended preload timer', async () => {
    let now = 1000;
    let abortCalls = 0;
    const timers = [];
    class FakeDate extends Date { static now() { return now; } }
    class FakeAbortController {
        constructor() { this.signal = {}; }
        abort() { abortCalls += 1; }
    }
    const { RLModelPortfolio } = loadPortfolio({
        Date: FakeDate,
        AbortController: FakeAbortController,
        setTimeout(handler) { timers.push(handler); return timers.length; },
        clearTimeout() {},
        fetch() { return new Promise(() => {}); },
    });
    const model = RLModelPortfolio.modelById('self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3', 2);
    const request = RLModelPortfolio.preloadModelData(model, { attempts: 1, timeoutMs: 15 });
    now += 20;

    RLModelPortfolio.resumePendingLoadsAfterPageActivation();

    await assert.rejects(() => request, /preload timed out/);
    assert.strictEqual(abortCalls, 1);
    assert.strictEqual(RLModelPortfolio.modelLoadState(model).status, 'failed');
});

runTest('RL model portfolio: page activation completes an expired Safari-suspended retry delay', async () => {
    let now = 1000;
    let fetchCalls = 0;
    const timers = [];
    class FakeDate extends Date { static now() { return now; } }
    const { RLModelPortfolio } = loadPortfolio({
        Date: FakeDate,
        setTimeout(handler) { timers.push(handler); return timers.length; },
        clearTimeout() {},
        fetch() {
            fetchCalls += 1;
            if (fetchCalls === 1) return Promise.reject(new Error('temporary'));
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ stateDim: 145 }) });
        },
    });
    const model = RLModelPortfolio.modelById('self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3', 2);
    const request = RLModelPortfolio.preloadModelData(model, { attempts: 2, retryDelayMs: 15, timeoutMs: 100 });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    now += 20;

    const pendingAfterActivation = RLModelPortfolio.resumePendingLoadsAfterPageActivation();
    assert.ok(pendingAfterActivation >= 0);
    const data = await request;

    assert.strictEqual(data.stateDim, 145);
    assert.strictEqual(fetchCalls, 2);
});

runTest('RL model portfolio: 未解決fetchはtimeout後にfailedとなり再試行できる', async () => {
    let fetchCalls = 0;
    let abortCalls = 0;
    class FakeAbortController {
        constructor() { this.signal = {}; }
        abort() { abortCalls += 1; }
    }
    const { RLModelPortfolio } = loadPortfolio({
        AbortController: FakeAbortController,
        setTimeout,
        clearTimeout,
        fetch() {
            fetchCalls += 1;
            if (fetchCalls === 1) return new Promise(() => {});
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ stateDim: 145, actionSchema: 'action-flat-v1', layers: [] }),
            });
        },
    });
    const model = RLModelPortfolio.modelById('self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3', 2);

    await assert.rejects(
        () => RLModelPortfolio.preloadModelData(model, { attempts: 1, timeoutMs: 5 }),
        /preload timed out/
    );
    assert.strictEqual(RLModelPortfolio.modelLoadState(model).status, 'failed');
    assert.strictEqual(abortCalls, 1);

    const data = await RLModelPortfolio.preloadModelData(model, { attempts: 1, timeoutMs: 50 });
    assert.strictEqual(data.stateDim, 145);
    assert.strictEqual(fetchCalls, 2);
    assert.strictEqual(RLModelPortfolio.modelLoadState(model).status, 'ready');
});
