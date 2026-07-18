const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TEST_GROUPS = {
    unit: [
        'gamemanager.test.js',
        'card-contract.test.js',
        'server.test.js',
        'server-dice.test.js',
        'canonical-mirror-metadata.test.js',
        'action-acceptance.test.js',
        'action-payload.test.js',
        'game-lifecycle-reporting.test.js',
        'game-settings.test.js',
        'room-validation.test.js',
        'room-lifecycle.test.js',
        'reconnect-identity.test.js',
        'restore-sanitization.test.js',
        'hostless-restore-candidate.test.js',
        'static-assets.test.js',
        'socket-payload.test.js',
        'snapshot-contract.test.js',
        'client-error-reporting.test.js',
        'cpu.test.js',
        'cpu-profile.test.js',
        'cpu-evaluation.test.js',
        'cpu-legal-moves.test.js',
        'cpu-simulation.test.js',
        'cpu-decision-snapshot.test.js',
        'cpu-decision-baseline.test.js',
        'online.test.js',
        'online-payload.test.js',
        'online-restore-rank.test.js',
        'online-reconnect-state.test.js',
        'online-integration.test.js',
        'online-delivery-smoke.test.js',
        'online-delivery-handshake.test.js',
        'storage.test.js',
        'main.test.js',
        'client-reporting.test.js',
        'sw.test.js',
        'confetti.test.js',
        'stats.test.js',
        'ui-log-display.test.js',
        'ui-card-order.test.js',
        'ui-player-display.test.js',
        'ui-card-select.test.js',
        'ui-pending-menu.test.js',
        'ui-watchdog.test.js',
        'lifecycle-notify.test.js',
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
        'eval-expert-v2-benchmark-pack.test.js',
        'eval-expert-v2-multiseed.test.js',
        'eval-expert-vs-strong.test.js',
        'eval-expert-vs-normal.test.js',
        'eval-expert-vs-weak.test.js',
        'diagnose-expert-losses.test.js',
        'summarize-expert-losses-json.test.js',
        'diagnose-expert-v2-branches.test.js',
        'search-expert-top-tier.test.js',
        'eval-rl-vs-js.test.js',
        'eval-rl-models.test.js',
        'diagnose-rl-build-pass.test.js',
        'diagnose-rl-landmark-race.test.js',
        'render-rl-registry-evals.test.js',
        'update-rl-registry-from-eval.test.js',
        'eval-rl-business-scenario.test.js',
        'eval-rl-special-scenarios.test.js',
        'summarize-rl-metrics.test.js',
        'cli-args.test.js',
        'test-utils.test.js',
        'runtime-dependencies.test.js',
    ],
    sim: [
        'selfplay.test.js',
        'tune-expert.test.js',
        'train-expert-crowd.test.js',
    ],
    core: [
        'gamemanager.test.js',
        'card-contract.test.js',
        'integration.test.js',
        'main.test.js',
        'client-reporting.test.js',
        'confetti.test.js',
        'stats.test.js',
        'ui-log-display.test.js',
        'ui-card-order.test.js',
        'ui-player-display.test.js',
        'ui-card-select.test.js',
        'ui-pending-menu.test.js',
        'ui-watchdog.test.js',
        'lifecycle-notify.test.js',
        'runtime-dependencies.test.js',
        'ui.test.js',
    ],
    online: [
        'gamemanager.test.js',
        'server.test.js',
        'server-dice.test.js',
        'canonical-mirror-metadata.test.js',
        'action-acceptance.test.js',
        'action-payload.test.js',
        'game-lifecycle-reporting.test.js',
        'game-settings.test.js',
        'room-validation.test.js',
        'room-lifecycle.test.js',
        'reconnect-identity.test.js',
        'restore-sanitization.test.js',
        'hostless-restore-candidate.test.js',
        'socket-payload.test.js',
        'snapshot-contract.test.js',
        'client-error-reporting.test.js',
        'online.test.js',
        'online-payload.test.js',
        'online-restore-rank.test.js',
        'online-reconnect-state.test.js',
        'online-integration.test.js',
        'online-delivery-smoke.test.js',
        'online-delivery-handshake.test.js',
        'online-action-reconnect-e2e.test.js',
        'online-completion-e2e.test.js',
        'storage.test.js',
    ],
    pwa: [
        'storage.test.js',
        'main.test.js',
        'static-assets.test.js',
        'sw.test.js',
    ],
    release: [
        'release-e2e.test.js',
    ],
    'cpu-smoke': [
        'cpu.test.js',
    ],
    cpu: [
        'cpu.test.js',
        'cpu-profile.test.js',
        'cpu-evaluation.test.js',
        'cpu-legal-moves.test.js',
        'cpu-simulation.test.js',
        'cpu-decision-snapshot.test.js',
        'cpu-decision-baseline.test.js',
        'cpu-selfplay-regression.test.js',
        'selfplay.test.js',
        'tune-expert.test.js',
        'train-expert-crowd.test.js',
        'eval-expert-v2-benchmark-pack.test.js',
        'eval-expert-v2-multiseed.test.js',
        'eval-expert-vs-strong.test.js',
        'eval-expert-vs-normal.test.js',
        'eval-expert-vs-weak.test.js',
        'diagnose-expert-losses.test.js',
        'summarize-expert-losses-json.test.js',
        'diagnose-expert-v2-branches.test.js',
        'search-expert-top-tier.test.js',
    ],
    rl: [
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
        'eval-rl-vs-js.test.js',
        'eval-rl-models.test.js',
        'diagnose-rl-build-pass.test.js',
        'diagnose-rl-landmark-race.test.js',
        'render-rl-registry-evals.test.js',
        'update-rl-registry-from-eval.test.js',
        'eval-rl-business-scenario.test.js',
        'eval-rl-special-scenarios.test.js',
        'summarize-rl-metrics.test.js',
        'cli-args.test.js',
    ],
    soak: [
        'online-soak.test.js',
    ],
};

const repoRoot = path.join(__dirname, '..');

const REQUIRED_TEST_GROUPS = Object.freeze({
    'online-action-reconnect-e2e.test.js': ['online'],
    'online-completion-e2e.test.js': ['online'],
    'online-soak.test.js': ['soak'],
});

function listActualTestFiles() {
    return fs.readdirSync(__dirname)
        .filter(file => file.endsWith('.test.js'))
        .sort();
}

function validateTestGroups() {
    const actualFiles = listActualTestFiles();
    const actualSet = new Set(actualFiles);
    const listedFiles = new Set();
    const errors = [];

    for (const [group, files] of Object.entries(TEST_GROUPS)) {
        const seenInGroup = new Set();
        for (const file of files) {
            if (seenInGroup.has(file)) {
                errors.push(`${group}: duplicate test entry ${file}`);
            }
            seenInGroup.add(file);
            listedFiles.add(file);
            if (!actualSet.has(file)) {
                errors.push(`${group}: listed test file does not exist: ${file}`);
            }
        }
    }

    for (const [file, requiredGroups] of Object.entries(REQUIRED_TEST_GROUPS)) {
        for (const group of requiredGroups) {
            if (!TEST_GROUPS[group] || !TEST_GROUPS[group].includes(file)) {
                errors.push(`${file}: must belong to ${group} test group`);
            }
        }
    }
    for (const file of actualFiles) {
        if (/^online(?:-|\.)/.test(file) && file !== 'online-soak.test.js' && !TEST_GROUPS.online.includes(file)) {
            errors.push(`${file}: online-prefixed tests must belong to online test group`);
        }
    }

    for (const file of actualFiles) {
        if (!listedFiles.has(file)) {
            errors.push(`unlisted test file: ${file}`);
        }
    }

    if (errors.length > 0) {
        console.error('[test runner] invalid test groups:');
        for (const error of errors) console.error(`- ${error}`);
        process.exit(1);
    }
}

const mode = process.argv[2] || 'unit';
validateTestGroups();

if (mode !== 'all' && !Object.prototype.hasOwnProperty.call(TEST_GROUPS, mode)) {
    console.error(`[test runner] unknown test group: ${mode}`);
    console.error(`[test runner] available groups: ${['all', ...Object.keys(TEST_GROUPS)].join(', ')}`);
    process.exit(1);
}

const testFiles = mode === 'all'
    ? [...TEST_GROUPS.unit, ...TEST_GROUPS.sim]
    : TEST_GROUPS[mode];

let failed = false;

for (const file of testFiles) {
    console.log(`\n[test] ${file}`);
    const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
        cwd: repoRoot,
        stdio: 'inherit',
        env: mode === 'cpu-smoke'
            ? Object.assign({}, process.env, { MACHIKORO_CPU_SMOKE: '1' })
            : process.env,
    });
    if (result.status !== 0) {
        failed = true;
    }
}

if (failed) {
    process.exit(1);
}
