'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runTest } = require('./helpers/test-utils');

const SCRIPT = path.resolve(__dirname, '../scripts/prepare-bubblewrap-android-sdk.sh');

function temporaryDirectory() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'machikoro-bubblewrap-sdk-'));
}

function makeSdkManager(sdkPath, relativePath) {
    const executable = path.join(sdkPath, relativePath);
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(executable, 0o755);
    return executable;
}

runTest('Bubblewrap SDK compatibility adds the legacy tools link to command-line-tools/latest', () => {
    const root = temporaryDirectory();
    try {
        const sdkManager = makeSdkManager(root, 'cmdline-tools/latest/bin/sdkmanager');
        const result = spawnSync('sh', [SCRIPT, root], { encoding: 'utf8' });
        assert.strictEqual(result.status, 0, result.stderr);
        assert.ok(fs.lstatSync(path.join(root, 'tools')).isSymbolicLink());
        assert.strictEqual(fs.realpathSync(path.join(root, 'tools/bin/sdkmanager')), sdkManager);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

runTest('Bubblewrap SDK compatibility preserves an existing legacy tools directory', () => {
    const root = temporaryDirectory();
    try {
        const sdkManager = makeSdkManager(root, 'tools/bin/sdkmanager');
        const result = spawnSync('sh', [SCRIPT, root], { encoding: 'utf8' });
        assert.strictEqual(result.status, 0, result.stderr);
        assert.strictEqual(fs.realpathSync(path.join(root, 'tools/bin/sdkmanager')), sdkManager);
        assert.ok(!fs.lstatSync(path.join(root, 'tools')).isSymbolicLink());
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

runTest('Bubblewrap SDK compatibility rejects incomplete SDK layouts', () => {
    const root = temporaryDirectory();
    try {
        fs.mkdirSync(root, { recursive: true });
        const result = spawnSync('sh', [SCRIPT, root], { encoding: 'utf8' });
        assert.notStrictEqual(result.status, 0);
        assert.match(result.stderr, /cmdline-tools\/latest/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
