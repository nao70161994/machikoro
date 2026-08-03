const assert = require('assert');
const packageJson = require('../package.json');
const { runTest } = require('./helpers/test-utils');

runTest('batch test scriptは重複なしで全保守gateを一巡する', () => {
    const script = packageJson.scripts['test:batch'];
    assert.strictEqual(script, [
        'npm run test:static',
        'node tests/run-all.js all',
        'node tests/online-action-reconnect-e2e.test.js',
        'node tests/online-completion-e2e.test.js',
        'node tests/game-schema-online-e2e.test.js',
        'npm run test:release',
    ].join(' && '));
    assert.ok(!script.includes('test:smoke'));
    assert.ok(!script.includes('test:online'));
    assert.ok(!script.includes('test:cpu'));
    assert.ok(!script.includes('test:rl'));
    assert.ok(!script.includes('test:sim'));
});
