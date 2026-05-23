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

runTest('test files は async runTest を fire-and-forget にしない', () => {
    const fs = require('fs');
    const path = require('path');
    const files = ['tests/release-e2e.test.js', 'tests/cpu.test.js'];
    for (const file of files) {
        const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
        assert.ok(!/[^A-Za-z0-9_]runTest\([^\n]+async\s*\(/.test(source), file + ' has fire-and-forget async runTest');
    }
});
