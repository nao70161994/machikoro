'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { loadCPURuntime } = require('../tests/helpers/runtime-loaders');
const { makeCpuDecisionFixtures } = require('../tests/helpers/cpu-decision-fixtures');
const { captureCpuDecisionSnapshot } = require('../tests/helpers/cpu-decision-snapshot');

const CPU_BASELINE_DIFFICULTIES = Object.freeze(['weak', 'normal', 'strong', 'expert']);
const CPU_BASELINE_OPTIONS = Object.freeze({
    expertPreset: 'v2simple',
    expertPurpose: 'training',
    simulationMode: 'lite',
});

function currentCommit() {
    return childProcess.execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
    }).trim();
}

function assertSourceCommit(sourceCommit) {
    if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
        throw new Error('CPU baseline source commit must be a full 40-character hash');
    }
    try {
        childProcess.execFileSync('git', ['cat-file', '-e', `${sourceCommit}^{commit}`], {
            cwd: path.join(__dirname, '..'),
            stdio: 'ignore',
        });
    } catch (_error) {
        throw new Error(`CPU baseline source commit does not exist: ${sourceCommit}`);
    }
    return sourceCommit;
}

function generateCpuDecisionBaseline(sourceCommit = currentCommit()) {
    sourceCommit = assertSourceCommit(sourceCommit);
    const runtime = loadCPURuntime();
    const snapshots = [];
    CPU_BASELINE_DIFFICULTIES.forEach(difficulty => {
        const fixtures = makeCpuDecisionFixtures(runtime);
        fixtures.forEach(fixture => {
            snapshots.push(captureCpuDecisionSnapshot(
                runtime,
                fixture,
                difficulty,
                CPU_BASELINE_OPTIONS
            ));
        });
    });
    return {
        schemaVersion: 1,
        sourceCommit,
        difficulties: Array.from(CPU_BASELINE_DIFFICULTIES),
        options: Object.assign({}, CPU_BASELINE_OPTIONS),
        snapshots,
    };
}

function parseArgs(argv) {
    const options = {
        output: path.join(__dirname, '..', 'tests', 'fixtures', 'cpu-decision-baseline.json'),
        sourceCommit: null,
    };
    for (let index = 0; index < argv.length; index++) {
        if (argv[index] === '--output' && argv[index + 1]) options.output = path.resolve(argv[++index]);
        else if (argv[index] === '--source-commit' && argv[index + 1]) options.sourceCommit = argv[++index];
    }
    return options;
}

function writeCpuDecisionBaseline(options = {}) {
    const output = options.output || path.join(
        __dirname,
        '..',
        'tests',
        'fixtures',
        'cpu-decision-baseline.json'
    );
    const baseline = generateCpuDecisionBaseline(options.sourceCommit || currentCommit());
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(baseline, null, 2)}\n`);
    return { output, baseline };
}

if (require.main === module) {
    const result = writeCpuDecisionBaseline(parseArgs(process.argv.slice(2)));
    console.log(`CPU decision baseline: ${result.output}`);
    console.log(`source commit: ${result.baseline.sourceCommit}`);
    console.log(`snapshots: ${result.baseline.snapshots.length}`);
}

module.exports = {
    CPU_BASELINE_DIFFICULTIES,
    CPU_BASELINE_OPTIONS,
    assertSourceCommit,
    currentCommit,
    generateCpuDecisionBaseline,
    parseArgs,
    writeCpuDecisionBaseline,
};
