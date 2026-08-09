'use strict';

const assert = require('assert');
const {
    parseConcurrency,
    resolveTestConcurrency,
    runTestFiles,
    scheduleTests,
} = require('./helpers/test-process-runner');
const { runTest } = require('./helpers/test-utils');

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

runTest('test process runnerはallだけ既定2並列で明示値を検証する', () => {
    assert.strictEqual(resolveTestConcurrency('all', {}), 2);
    assert.strictEqual(resolveTestConcurrency('unit', {}), 1);
    assert.strictEqual(resolveTestConcurrency('all', { MACHIKORO_TEST_CONCURRENCY: '1' }), 1);
    assert.strictEqual(parseConcurrency('8', 1), 8);
    for (const value of ['0', '9', '1.5', 'invalid']) {
        assert.throws(() => parseConcurrency(value, 1), /test concurrency/);
    }
});

runTest('test schedulerは上限内で並列実行し結果を宣言順に返す', async () => {
    let active = 0;
    let maxActive = 0;
    let releaseSlow;
    const slowGate = new Promise(resolve => { releaseSlow = resolve; });
    const completionOrder = [];
    const results = await scheduleTests(['slow', 'fast', 'last'], async file => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (file === 'slow') await slowGate;
        else await Promise.resolve();
        completionOrder.push(file);
        if (file === 'last') releaseSlow();
        active -= 1;
        return `${file}-result`;
    }, 2);

    assert.strictEqual(maxActive, 2);
    assert.deepStrictEqual(completionOrder, ['fast', 'last', 'slow']);
    assert.deepStrictEqual(results, ['slow-result', 'fast-result', 'last-result']);
});

runTest('test process runnerは並列完了しても出力を宣言順にし全失敗を集約する', async () => {
    const stdout = [];
    const stderr = [];
    const result = await runTestFiles(['slow.test.js', 'fast.test.js', 'fail.test.js'], {
        concurrency: 2,
        output: { write(value) { stdout.push(String(value)); } },
        errorOutput: { write(value) { stderr.push(String(value)); } },
        runProcess: async file => {
            await delay(file.startsWith('slow') ? 20 : 1);
            return {
                file,
                status: file.startsWith('fail') ? 1 : 0,
                signal: null,
                stdout: `${file}:stdout\n`,
                stderr: file.startsWith('fail') ? `${file}:stderr\n` : '',
                spawnError: null,
            };
        },
    });

    const text = stdout.join('');
    assert.ok(text.indexOf('[test] slow.test.js') < text.indexOf('[test] fast.test.js'));
    assert.ok(text.indexOf('[test] fast.test.js') < text.indexOf('[test] fail.test.js'));
    assert.strictEqual(stderr.join(''), 'fail.test.js:stderr\n');
    assert.strictEqual(result.failed, true);
    assert.strictEqual(result.results.length, 3);
});
