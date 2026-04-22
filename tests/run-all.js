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
        'rl-model-portfolio.test.js',
        'validate-rl-registry.test.js',
        'report-rl-registry.test.js',
        'audit-rl-portfolio.test.js',
        'plan-rl-next-actions.test.js',
        'review-rl-adoptions.test.js',
        'refresh-rl-ops-reports.test.js',
        'report-rl-diversity.test.js',
        'review-rl-multiplayer-topk.test.js',
        'review-rl-multiplayer-experiment-set.test.js',
        'rl-train.test.js',
        'rl-match-trace.test.js',
        'compare-rl-match-trace.test.js',
        'js-cpu-oracle.test.js',
        'resolve-rl-model-path.test.js',
        'eval-expert-vs-strong.test.js',
        'search-expert-top-tier.test.js',
        'eval-rl-vs-js.test.js',
        'eval-rl-models.test.js',
        'render-rl-registry-evals.test.js',
        'update-rl-registry-from-eval.test.js',
        'eval-rl-business-scenario.test.js',
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
