'use strict';

const assert = require('assert');
const {
    checkStaticFiles,
    discoverStaticFiles,
    normalizeJavaScriptSource,
    validateJavaScript,
    validateJson,
} = require('../scripts/check-static-files');
const { runTest } = require('./helpers/test-utils');

runTest('static file checkerはJavaScriptとJSONを同一processで検査する', () => {
    const sources = new Map([
        ['valid.js', "'use strict';\nconst answer = 42;\n"],
        ['tool.js', '#!/usr/bin/env node\nconst enabled = true;\n'],
        ['valid.json', '{"enabled":true}\n'],
    ]);
    const result = checkStaticFiles([...sources.keys()], filename => sources.get(filename));

    assert.deepStrictEqual(result, {
        jsCount: 2,
        jsonCount: 1,
        errors: [],
    });
    assert.strictEqual(normalizeJavaScriptSource(sources.get('tool.js')).startsWith('//'), true);
});

runTest('static file checkerは壊れたJavaScriptとJSONをファイル別に報告する', () => {
    const sources = new Map([
        ['broken.js', 'const = ;'],
        ['broken.json', '{"enabled":}'],
    ]);
    const result = checkStaticFiles([...sources.keys()], filename => sources.get(filename));

    assert.strictEqual(result.errors.length, 2);
    assert.deepStrictEqual(result.errors.map(error => error.filename), ['broken.js', 'broken.json']);
    assert.ok(result.errors.every(error => error.message.length > 0));
});

runTest('static file checkerの個別validatorは不正入力を拒否する', () => {
    assert.doesNotThrow(() => validateJavaScript('valid.js', 'const value = 1;'));
    assert.throws(() => validateJavaScript('broken.js', 'const value = ;'), SyntaxError);
    assert.doesNotThrow(() => validateJson('valid.json', '{}'));
    assert.throws(() => validateJson('broken.json', '{]'), /broken\.json/);
});

runTest('static file discoveryは現在のtrackedとuntracked対象を一意に返す', () => {
    const files = discoverStaticFiles();
    assert.strictEqual(new Set(files).size, files.length);
    assert.ok(files.includes('server.js'));
    assert.ok(files.includes('package.json'));
    assert.ok(files.includes('scripts/check-static-files.js'));
    assert.ok(files.every(file => file.endsWith('.js') || file.endsWith('.json')));
    assert.ok(files.every(file => !file.startsWith('node_modules/')));
});
