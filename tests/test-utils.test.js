const assert = require('assert');
const { spawnSync } = require('child_process');
const { runTest } = require('./helpers/test-utils');

runTest('runTest は async test の完了を待てる Promise を返す', () => {
    const result = runTest('inner async success', async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
    });
    assert.ok(result && typeof result.then === 'function');
    return result;
});

runTest('runTest は await された async failure を exitCode に反映する', () => {
    const script = [
        "const { runTest } = require('./tests/helpers/test-utils');",
        "(async () => {",
        "  await runTest('delayed failure', async () => {",
        "    await new Promise(resolve => setTimeout(resolve, 10));",
        "    throw new Error('async boom');",
        "  });",
        "  process.exit(process.exitCode || 0);",
        "})();",
    ].join('\n');
    const result = spawnSync(process.execPath, ['-e', script], { cwd: process.cwd(), encoding: 'utf8' });
    assert.strictEqual(result.status, 1);
    assert.ok((result.stderr || '').includes('async boom'));
});

runTest('runTest は fire-and-forget 呼出しも登録順に逐次実行する', () => {
    const script = [
        "const { runTest, waitForTests } = require('./tests/helpers/test-utils');",
        "const order = [];",
        "runTest('first', async () => {",
        "  order.push('first:start');",
        "  await new Promise(resolve => setTimeout(resolve, 20));",
        "  order.push('first:end');",
        "});",
        "runTest('second', () => order.push('second'));",
        "waitForTests().then(() => {",
        "  if (order.join(',') !== 'first:start,first:end,second') process.exit(2);",
        "});",
    ].join('\n');
    const result = spawnSync(process.execPath, ['-e', script], { cwd: process.cwd(), encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});
