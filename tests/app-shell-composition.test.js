'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AppShellComposition = require('../js/appShellComposition');
const { runTest } = require('./helpers/test-utils');

runTest('app shell compositionはclassic-script依存を遅延解決する', () => {
    let current = null;
    const composition = AppShellComposition.create({
        lateDependency: () => current,
        falseValue: () => false,
    });

    assert.strictEqual(composition.resolve('lateDependency', 'fallback'), null);
    current = () => 'ready';
    assert.strictEqual(composition.resolveFunction('lateDependency'), current);
    assert.strictEqual(composition.resolve('falseValue', true), false);
    assert.strictEqual(composition.resolve('missing', 'fallback'), 'fallback');
});

runTest('app shell compositionは不正なaccessorをfail fastする', () => {
    assert.throws(() => AppShellComposition.create(null), /accessors are required/);
    assert.throws(() => AppShellComposition.create({ invalid: true }), /accessor must be a function/);
});

runTest('appShellは動的依存を単一composition mapから解決する', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/appShell.js'), 'utf8');
    assert.ok(source.includes('AppShellComposition.create({'));
    assert.ok(source.includes('appShellComposition.resolve(name)'));
    assert.strictEqual((source.match(/AppShellComposition\.create\(/g) || []).length, 1);
    assert.strictEqual(source.includes('const resolvers = {'), false);
});
