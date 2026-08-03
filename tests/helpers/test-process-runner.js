'use strict';

const { spawn } = require('child_process');
const path = require('path');

const DEFAULT_ALL_CONCURRENCY = 2;
const MAX_TEST_CONCURRENCY = 8;

function parseConcurrency(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TEST_CONCURRENCY) {
        throw new RangeError(`test concurrency must be an integer from 1 to ${MAX_TEST_CONCURRENCY}`);
    }
    return parsed;
}

function resolveTestConcurrency(mode, env = process.env) {
    const fallback = mode === 'all' ? DEFAULT_ALL_CONCURRENCY : 1;
    return parseConcurrency(env.MACHIKORO_TEST_CONCURRENCY, fallback);
}

function spawnTestProcess(file, options) {
    return new Promise(resolve => {
        const child = spawn(process.execPath, [path.join(options.testDir, file)], {
            cwd: options.repoRoot,
            env: options.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let spawnError = null;
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.once('error', error => { spawnError = error; });
        child.once('close', (status, signal) => resolve({
            file,
            status,
            signal,
            stdout,
            stderr,
            spawnError,
        }));
    });
}

async function scheduleTests(files, worker, concurrency, onResult = () => {}) {
    const results = new Array(files.length);
    let nextIndex = 0;

    async function runWorker() {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= files.length) return;
            const result = await worker(files[index], index);
            results[index] = result;
            onResult(index, result);
        }
    }

    const workerCount = Math.min(concurrency, files.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    return results;
}

async function runTestFiles(files, options) {
    const output = options.output || process.stdout;
    const errorOutput = options.errorOutput || process.stderr;
    const concurrency = parseConcurrency(options.concurrency, 1);
    const runProcess = options.runProcess || spawnTestProcess;
    const completed = new Array(files.length).fill(false);
    const pendingResults = new Array(files.length);
    let nextOutputIndex = 0;

    function flushReadyResults() {
        while (nextOutputIndex < files.length && completed[nextOutputIndex]) {
            const result = pendingResults[nextOutputIndex];
            output.write(`\n[test] ${result.file}\n`);
            if (result.stdout) output.write(result.stdout);
            if (result.stderr) errorOutput.write(result.stderr);
            if (result.spawnError) errorOutput.write(`${result.spawnError.stack || result.spawnError}\n`);
            nextOutputIndex += 1;
        }
    }

    const results = await scheduleTests(
        files,
        file => runProcess(file, options),
        concurrency,
        (index, result) => {
            pendingResults[index] = result;
            completed[index] = true;
            flushReadyResults();
        }
    );
    return {
        failed: results.some(result => result.spawnError || result.status !== 0),
        results,
    };
}

module.exports = {
    DEFAULT_ALL_CONCURRENCY,
    MAX_TEST_CONCURRENCY,
    parseConcurrency,
    resolveTestConcurrency,
    runTestFiles,
    scheduleTests,
    spawnTestProcess,
};
