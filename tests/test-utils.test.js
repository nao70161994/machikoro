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
