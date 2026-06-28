const assert = require('assert');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    browserPathForRunLabel,
    resolveModelPath,
} = require('../scripts/resolve-rl-model-path.js');

runTest('resolve-rl-model-path parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs(['--registry', 'r.json', '--rank', '3', 'run1']);
    assert.strictEqual(args.registryPath, 'r.json');
    assert.strictEqual(args.rank, 3);
    assert.strictEqual(args.target, 'run1');
});

runTest('resolve-rl-model-path parseArgs は rank 0 指定を保持する', () => {
    const args = parseArgs(['--rank', '0', 'run1']);
    assert.strictEqual(args.rank, 0);
});

runTest('resolve-rl-model-path browserPathForRunLabel は rank 別 path を返す', () => {
    assert.strictEqual(browserPathForRunLabel('abc', 1), 'models/rl_model/runs/abc/best_model.browser.json');
    assert.strictEqual(browserPathForRunLabel('abc', 2), 'models/rl_model/runs/abc/best_model.top2.browser.json');
});

runTest('resolve-rl-model-path browserPathForRunLabel は危険な run-label を拒否する', () => {
    assert.throws(() => browserPathForRunLabel('../abc', 1), /unsafe run-label/);
    assert.throws(() => browserPathForRunLabel('abc/def', 1), /unsafe run-label/);
});

runTest('resolve-rl-model-path resolveModelPath は model id / run-label / path を解決する', () => {
    const registry = {
        models: [
            { id: 'model-a', path: 'models/rl_model/portfolio/model-a.browser.json' },
        ],
    };
    assert.strictEqual(
        resolveModelPath('model-a', 1, registry),
        'models/rl_model/portfolio/model-a.browser.json'
    );
    assert.strictEqual(
        resolveModelPath('run-1', 3, registry),
        'models/rl_model/runs/run-1/best_model.top3.browser.json'
    );
    assert.strictEqual(
        resolveModelPath('models/rl_model/custom.json', 1, registry),
        'models/rl_model/custom.json'
    );
    assert.strictEqual(
        resolveModelPath('./models/rl_model/custom.json', 1, registry),
        './models/rl_model/custom.json'
    );
    assert.strictEqual(
        resolveModelPath('/home/machikoro/models/rl_model/custom.json', 1, registry),
        '/home/machikoro/models/rl_model/custom.json'
    );
});
