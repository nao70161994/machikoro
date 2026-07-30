'use strict';

const assert = require('assert');
const AppShellStorage = require('../js/appShellStorage');
const { runTest } = require('./helpers/test-utils');

runTest('app shell storage facadeは既存のget/set/remove契約を維持する', () => {
    const values = new Map();
    const calls = [];
    const facade = AppShellStorage.createFacade({
        getStorage() {
            return {
                getItem(key) {
                    calls.push(['get', key]);
                    return values.has(key) ? values.get(key) : null;
                },
                setItem(key, value) {
                    calls.push(['set', key, value]);
                    values.set(key, value);
                },
                removeItem(key) {
                    calls.push(['remove', key]);
                    values.delete(key);
                },
            };
        },
    });

    assert.strictEqual(facade.get('missing', 'fallback'), null);
    assert.strictEqual(facade.set('key', 'value'), true);
    assert.strictEqual(facade.get('key'), 'value');
    facade.remove('key');
    assert.strictEqual(facade.get('key'), null);
    assert.deepStrictEqual(calls, [
        ['get', 'missing'],
        ['set', 'key', 'value'],
        ['get', 'key'],
        ['remove', 'key'],
        ['get', 'key'],
    ]);
});

runTest('app shell storage facadeはstorage不在と例外を既存どおり吸収する', () => {
    const missing = AppShellStorage.createFacade({ getStorage: () => null });
    assert.strictEqual(missing.get('key', 'fallback'), 'fallback');
    assert.strictEqual(missing.set('key', 'value'), true);
    assert.doesNotThrow(() => missing.remove('key'));
    assert.strictEqual(missing.access(() => 'unexpected', 'fallback'), 'fallback');

    const blocked = AppShellStorage.createFacade({
        getStorage() { throw new Error('blocked'); },
    });
    assert.strictEqual(blocked.get('key', 'fallback'), 'fallback');
    assert.strictEqual(blocked.set('key', 'value'), false);
    assert.doesNotThrow(() => blocked.remove('key'));
    assert.strictEqual(blocked.access(() => 'unexpected', 'fallback'), 'fallback');
});

runTest('app shell storage facadeは複数操作を同じ例外境界で実行しstorageを動的に解決する', () => {
    let active = { first: 'one', second: 'two' };
    const facade = AppShellStorage.createFacade({
        getStorage() {
            return {
                getItem(key) { return active[key] ?? null; },
                setItem(key, value) { active[key] = value; },
                removeItem(key) { delete active[key]; },
            };
        },
    });

    assert.strictEqual(facade.get('first'), 'one');
    active = { first: 'changed', second: 'kept' };
    assert.strictEqual(facade.get('first'), 'changed');
    const pair = facade.access(storage => [storage.getItem('first'), storage.getItem('second')], null);
    assert.deepStrictEqual(pair, ['changed', 'kept']);

    const operationError = AppShellStorage.createFacade({
        getStorage() {
            return { getItem() { throw new Error('read blocked'); } };
        },
    });
    assert.strictEqual(operationError.get('key', 'fallback'), 'fallback');
    assert.strictEqual(
        facade.access(() => { throw new Error('serialize blocked'); }, 'fallback'),
        'fallback'
    );
});
