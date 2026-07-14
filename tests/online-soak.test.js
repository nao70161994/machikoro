const assert = require('assert');
const { spawnSync } = require('child_process');
const { runTest } = require('./helpers/test-utils');

runTest('online 4人戦soakは複数の完走・圧縮・再接続を連続実行する', () => {
    const runs = Math.max(1, Number(process.env.MACHIKORO_SOAK_RUNS) || 3);
    for (let run = 1; run <= runs; run++) {
        console.log('[online soak] run ' + run + '/' + runs);
        const result = spawnSync(process.execPath, ['tests/online-completion-e2e.test.js'], {
            cwd: process.cwd(),
            stdio: 'inherit',
            env: Object.assign({}, process.env, { CANONICAL_STATE_STORE: 'noop' }),
            timeout: 120000,
        });
        assert.strictEqual(result.status, 0, 'online completion run ' + run + ' failed');
    }
});
