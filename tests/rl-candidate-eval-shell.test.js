const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runTest } = require('./helpers/test-utils');

const repoRoot = path.join(__dirname, '..');
const backgroundScript = path.join(repoRoot, 'scripts', 'rl', 'run-candidate-screen-background.sh');

function runEvaluationScript(script, args, env = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-candidate-eval-shell-'));
    const binDir = path.join(dir, 'bin');
    const logPath = path.join(dir, 'node-args.log');
    const candidate = path.join(dir, 'candidate.browser.json');
    const baseline = path.join(dir, 'baseline.browser.json');
    const output = path.join(dir, 'output');
    fs.mkdirSync(binDir);
    fs.writeFileSync(candidate, '{}');
    fs.writeFileSync(baseline, '{}');
    fs.writeFileSync(path.join(binDir, 'node'), '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$RL_NODE_LOG"\n');
    fs.chmodSync(path.join(binDir, 'node'), 0o755);
    try {
        const result = spawnSync('sh', [script, ...args(candidate, baseline, output)], {
            cwd: repoRoot,
            encoding: 'utf8',
            env: {
                ...process.env,
                ...env,
                PATH: `${binDir}:${process.env.PATH}`,
                RL_NODE_LOG: logPath,
            },
        });
        assert.strictEqual(result.status, 0, result.stderr || result.stdout);
        return {
            output: result.stdout,
            calls: fs.readFileSync(logPath, 'utf8').trim().split('\n'),
        };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function assertedGames(calls) {
    return calls.flatMap(call => {
        const match = call.match(/(?:^| )--games ([0-9]+)(?: |$)/);
        return match ? [Number(match[1])] : [];
    });
}

function assertProgressEnabled(calls) {
    const evaluationCalls = calls.filter(call => /(?:^| )--games [0-9]+(?: |$)/.test(call));
    assert.ok(evaluationCalls.length > 0);
    assert.ok(evaluationCalls.every(call => call.includes('--progress-every 10')));
}

function assertModelParallelismEnabled(calls, expected = 1) {
    const modelCalls = calls.filter(call => call.startsWith('scripts/eval-rl-models.js '));
    assert.ok(modelCalls.length > 0);
    assert.ok(modelCalls.every(call => call.includes(`--parallel-models ${expected}`)));
}

function assertStandardStepLimit(calls) {
    const evaluationCalls = calls.filter(call => /(?:^| )--games [0-9]+(?: |$)/.test(call));
    assert.ok(evaluationCalls.length > 0);
    assert.ok(evaluationCalls.every(call => call.includes('--max-steps 1200')));
}

function assertExhaustionFailFast(calls) {
    const evaluationCalls = calls.filter(call => /(?:^| )--games [0-9]+(?: |$)/.test(call));
    assert.ok(evaluationCalls.length > 0);
    assert.ok(evaluationCalls.every(call => call.includes('--abort-on-exhaustion')));
}

runTest('candidate background: 独立sessionとPID・status・command証跡を保持する', () => {
    const source = fs.readFileSync(backgroundScript, 'utf8');
    assert.ok(source.includes('setsid -f sh -c'));
    assert.ok(source.includes('printf "%s\\n" "$$" > "$PID_PATH"'));
    assert.ok(source.includes('screen.status'));
    assert.ok(source.includes('screen.cmd'));
    assert.ok(source.includes('kill -0 "$PREVIOUS_PID"'));
});

runTest('candidate background: 存在しない再利用artifactをfail closedにする', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-candidate-background-'));
    const candidate = path.join(dir, 'candidate.browser.json');
    const baseline = path.join(dir, 'baseline.browser.json');
    fs.writeFileSync(candidate, '{}');
    fs.writeFileSync(baseline, '{}');
    try {
        const result = spawnSync('sh', [
            backgroundScript,
            '2p',
            candidate,
            baseline,
            path.join(dir, 'output'),
            path.join(dir, 'missing-results.json'),
        ], { cwd: repoRoot, encoding: 'utf8' });
        assert.strictEqual(result.status, 2);
        assert.ok(result.stderr.includes('reuse results not found'));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

runTest('candidate screen: paired-seat戦数をscopeの席cycleへ切り上げる', () => {
    const twoPlayer = runEvaluationScript(
        'scripts/rl/eval-candidate-screen.sh',
        (candidate, baseline, output) => ['2p', candidate, baseline, output]
    );
    const multiplayer = runEvaluationScript(
        'scripts/rl/eval-candidate-screen.sh',
        (candidate, baseline, output) => ['mp', candidate, baseline, output]
    );
    assert.deepStrictEqual(assertedGames(twoPlayer.calls), [50, 50]);
    assert.deepStrictEqual(assertedGames(multiplayer.calls), [52, 52]);
    assertProgressEnabled(twoPlayer.calls);
    assertProgressEnabled(multiplayer.calls);
    assertModelParallelismEnabled(twoPlayer.calls);
    assertModelParallelismEnabled(multiplayer.calls);
    assertStandardStepLimit(twoPlayer.calls);
    assertStandardStepLimit(multiplayer.calls);
    assertExhaustionFailFast(twoPlayer.calls);
    assertExhaustionFailFast(multiplayer.calls);
    assert.ok(multiplayer.output.includes('requestedGames=50 pairedGames=52'));
});

runTest('candidate promotion: 3/4/5/10人の100戦段階を共通cycle 120戦にする', () => {
    const promotion = runEvaluationScript(
        'scripts/rl/eval-candidate-promotion.sh',
        (candidate, baseline, output) => ['mp', '100', candidate, baseline, output]
    );
    assert.deepStrictEqual(assertedGames(promotion.calls), [120, 120]);
    assertProgressEnabled(promotion.calls);
    assertModelParallelismEnabled(promotion.calls);
    assertStandardStepLimit(promotion.calls);
    assertExhaustionFailFast(promotion.calls);
    assert.ok(promotion.output.includes('requestedGames=100 pairedGames=120'));
});

runTest('candidate screen: model並列数は端末既定1から明示的に上書きできる', () => {
    const evaluation = runEvaluationScript(
        'scripts/rl/eval-candidate-screen.sh',
        (candidate, baseline, output) => ['2p', candidate, baseline, output],
        { RL_EVAL_PARALLEL_MODELS: '3' }
    );
    assertModelParallelismEnabled(evaluation.calls, 3);
});

runTest('candidate screen: SHA検証付き再利用artifactをモデル評価へ渡す', () => {
    const reusePath = path.join(repoRoot, 'package.json');
    const evaluation = runEvaluationScript(
        'scripts/rl/eval-candidate-screen.sh',
        (candidate, baseline, output) => ['2p', candidate, baseline, output],
        { RL_EVAL_REUSE_RESULTS: reusePath }
    );
    const modelCall = evaluation.calls.find(call => call.startsWith('scripts/eval-rl-models.js '));
    assert.ok(modelCall.includes(`--reuse-results ${reusePath}`));
});

runTest('candidate promotion: 多人数評価でも再利用artifactをモデル評価へ渡す', () => {
    const reusePath = path.join(repoRoot, 'package.json');
    const evaluation = runEvaluationScript(
        'scripts/rl/eval-candidate-promotion.sh',
        (candidate, baseline, output) => ['mp', '100', candidate, baseline, output],
        { RL_EVAL_REUSE_RESULTS: reusePath }
    );
    const modelCall = evaluation.calls.find(call => call.startsWith('scripts/eval-rl-models.js '));
    assert.ok(modelCall.includes(`--reuse-results ${reusePath}`));
});

runTest('candidate watcher: 評価済みSHAと同じcheckpointを再評価しない', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-candidate-watcher-'));
    const candidate = path.join(dir, 'candidate.browser.json');
    const baseline = path.join(dir, 'baseline.browser.json');
    const output = path.join(dir, 'output');
    const candidateBody = '{"model":"candidate"}';
    fs.writeFileSync(candidate, candidateBody);
    fs.writeFileSync(baseline, '{}');
    const digest = crypto.createHash('sha256').update(candidateBody).digest('hex');
    try {
        const result = spawnSync('sh', [
            'scripts/rl/await-candidate-screen.sh',
            'mp', candidate, baseline, output, '999999', '5',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
            env: { ...process.env, RL_AWAIT_CANDIDATE_SHA256: digest },
        });
        assert.strictEqual(result.status, 1);
        assert.strictEqual(fs.readFileSync(path.join(output, 'await-screen.status'), 'utf8').trim(), 'producer-exited-before-checkpoint');
        assert.strictEqual(fs.existsSync(path.join(output, 'candidate.snapshot.browser.json')), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

runTest('candidate watcher: browser snapshotと対応metadataを同じ停止区間で固定する', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'rl', 'await-candidate-screen.sh'), 'utf8');
    assert.ok(source.includes('CANDIDATE_META="${CANDIDATE%.browser.json}.meta.json"'));
    assert.ok(source.includes('candidate.snapshot.meta.json'));
    assert.ok(source.includes('cp "$CANDIDATE_META" "$TEMP_META"'));
    assert.ok(source.includes('mv "$TEMP_META" "$LOGICAL_META"'));
});

runTest('candidate watcher: 不正なcheckpoint SHAをfail closedにする', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-candidate-watcher-sha-'));
    const baseline = path.join(dir, 'baseline.browser.json');
    fs.writeFileSync(baseline, '{}');
    try {
        const result = spawnSync('sh', [
            'scripts/rl/await-candidate-screen.sh',
            'mp', path.join(dir, 'candidate.browser.json'), baseline, path.join(dir, 'output'), '999999', '5',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
            env: { ...process.env, RL_AWAIT_CANDIDATE_SHA256: 'not-a-digest' },
        });
        assert.strictEqual(result.status, 2);
        assert.ok(result.stderr.includes('64-character hexadecimal digest'));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

runTest('candidate watcher: 危険なproducer PGIDをfail closedにする', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-candidate-watcher-pgid-'));
    const baseline = path.join(dir, 'baseline.browser.json');
    fs.writeFileSync(baseline, '{}');
    try {
        for (const pgid of ['0', '1', 'not-a-pgid']) {
            const result = spawnSync('sh', [
                'scripts/rl/await-candidate-screen.sh',
                'mp', path.join(dir, 'candidate.browser.json'), baseline, path.join(dir, 'output'), pgid, '5',
            ], { cwd: repoRoot, encoding: 'utf8' });
            assert.strictEqual(result.status, 2);
            assert.ok(result.stderr.includes('PGID'));
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
