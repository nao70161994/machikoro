const { spawnSync } = require('child_process');
const path = require('path');

const TEST_GROUPS = {
    unit: [
        'gamemanager.test.js',
        'server.test.js',
        'cpu.test.js',
    'online.test.js',
    'online-integration.test.js',
    'storage.test.js',
        'main.test.js',
        'stats.test.js',
        'ui.test.js',
        'integration.test.js',
        'rlcpu.test.js',
        'rl-train.test.js',
        'rl-match-trace.test.js',
        'compare-rl-match-trace.test.js',
        'js-cpu-oracle.test.js',
        'eval-rl-vs-js.test.js',
        'summarize-rl-metrics.test.js',
    ],
    sim: [
        'selfplay.test.js',
        'tune-expert.test.js',
        'train-expert-crowd.test.js',
    ],
};

const mode = process.argv[2] || 'unit';
const testFiles = mode === 'all'
    ? [...TEST_GROUPS.unit, ...TEST_GROUPS.sim]
    : (TEST_GROUPS[mode] || TEST_GROUPS.unit);

let failed = false;

for (const file of testFiles) {
    console.log(`\n[test] ${file}`);
    const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        failed = true;
    }
}

if (failed) {
    process.exit(1);
}
