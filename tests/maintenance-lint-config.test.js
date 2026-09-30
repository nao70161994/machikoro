'use strict';

const assert = require('assert');
const eslintConfig = require('../eslint.config');
const packageJson = require('../package.json');
const { runTest } = require('./helpers/test-utils');

runTest('maintenance lint script and scoped config contain the same file set', () => {
    const configuredFiles = eslintConfig
        .flatMap(entry => Array.isArray(entry.files) ? entry.files : [])
        .filter((file, index, files) => files.indexOf(file) === index)
        .slice()
        .sort();
    const command = packageJson.scripts['lint:maintenance'];
    assert.ok(command.startsWith('eslint '));
    const scriptedFiles = command.slice('eslint '.length).trim().split(/\s+/).sort();

    assert.deepStrictEqual(scriptedFiles, configuredFiles);
    assert.strictEqual(new Set(scriptedFiles).size, scriptedFiles.length);
    assert.ok(scriptedFiles.includes('js/snapshotInventoryValidation.js'));
    assert.ok(scriptedFiles.includes('js/marketSupply.js'));
    assert.ok(scriptedFiles.includes('js/onlineRestoreMetadata.js'));
    assert.ok(scriptedFiles.includes('server/socketOriginPolicy.js'));
    assert.ok(scriptedFiles.includes('server/rejoinAdmission.js'));
    assert.ok(scriptedFiles.includes('server/onlineRematchRuntime.js'));
});

runTest('maintenance lint keeps bug-detection rules enabled as errors', () => {
    const expectedRules = [
        'no-constant-binary-expression',
        'no-constant-condition',
        'no-dupe-keys',
        'no-duplicate-case',
        'no-duplicate-imports',
        'no-eval',
        'no-implied-eval',
        'no-new-func',
        'no-script-url',
        'no-sparse-arrays',
        'no-undef',
        'no-unreachable',
        'no-unsafe-optional-chaining',
        'valid-typeof',
    ];
    for (const entry of eslintConfig) {
        assert.deepStrictEqual(Object.keys(entry.rules).sort(), expectedRules);
        for (const rule of expectedRules) {
            const value = entry.rules[rule];
            assert.ok(value === 'error' || Array.isArray(value) && value[0] === 'error', rule);
        }
    }
});
