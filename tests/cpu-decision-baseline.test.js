const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {
    assertSourceCommit,
    CPU_BASELINE_DIFFICULTIES,
    generateCpuDecisionBaseline,
    parseArgs,
} = require('../scripts/generate-cpu-decision-baseline');
const { runTest } = require('./helpers/test-utils');

const baselinePath = path.join(__dirname, 'fixtures', 'cpu-decision-baseline.json');

runTest('CPU decision baselineは基準commitと全difficultyを記録する', () => {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    assert.strictEqual(baseline.schemaVersion, 1);
    assert.match(baseline.sourceCommit, /^[0-9a-f]{40}$/);
    assert.deepStrictEqual(baseline.difficulties, Array.from(CPU_BASELINE_DIFFICULTIES));
    assert.strictEqual(
        baseline.snapshots.length,
        CPU_BASELINE_DIFFICULTIES.length * 9
    );
    CPU_BASELINE_DIFFICULTIES.forEach(difficulty => {
        assert.ok(baseline.snapshots.some(snapshot => snapshot.difficulty === difficulty));
    });
});

runTest('CPU decision baselineは存在しない基準commitを拒否する', () => {
    assert.throws(
        () => assertSourceCommit('0123456789012345678901234567890123456789'),
        /does not exist/
    );
});

runTest('CPU decision baselineは現在の合法手・評価・選択結果と完全一致する', () => {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const current = generateCpuDecisionBaseline(baseline.sourceCommit);
    assert.deepStrictEqual(current, baseline);
});

runTest('CPU decision baseline CLIはoutputとsource commitを解釈する', () => {
    const options = parseArgs([
        '--output',
        'tmp/cpu-baseline.json',
        '--source-commit',
        '0123456789012345678901234567890123456789',
    ]);
    assert.strictEqual(options.output, path.resolve('tmp/cpu-baseline.json'));
    assert.strictEqual(options.sourceCommit, '0123456789012345678901234567890123456789');
});
